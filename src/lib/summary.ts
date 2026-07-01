import type { SupabaseClient } from "@supabase/supabase-js";
import type { Core } from "@/lib/data";
import { countdowns } from "@/lib/data";
import { sendEmail } from "@/lib/mailer";
import { fmtDuration, localDateISO } from "@/lib/time";
import { POINTS } from "@/lib/plan";

/** The nightly report — same content whether it goes to Dad or to a test send. */
export function buildDailySummary(core: Core): { subject: string; html: string } {
  const { profile, todayMinutes, todayBySubject, streak, tasks } = core;
  const goal = profile.daily_goal_minutes;
  const ratio = goal > 0 ? todayMinutes / goal : 0;
  const cd = countdowns(core);

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: profile.timezone,
  });

  const verdict = cd.onVacation
    ? "🏖️ Vacation day — no study expected."
    : ratio >= 1.25
      ? "🔥 Crushed it. Way past the goal."
      : ratio >= 1
        ? "✅ Goal hit. Exactly what the plan needs."
        : ratio >= 0.5
          ? "🟡 Half-done day. Progress, but under target."
          : todayMinutes > 0
            ? "🔴 Well under target today."
            : "❌ Zero minutes studied today.";

  const subjectRows = core.subjects
    .map((s) => ({ s, mins: todayBySubject[s.id] ?? 0 }))
    .filter((r) => r.mins > 0)
    .sort((a, b) => b.mins - a.mins)
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${r.s.name} ${r.s.level}</td>
         <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;"><strong>${fmtDuration(r.mins)}</strong></td></tr>`,
    )
    .join("");

  const today = localDateISO(profile.timezone);
  const doneToday = tasks.filter(
    (t) => t.done && t.done_at && localDateISO(profile.timezone, new Date(t.done_at)) === today,
  );
  const tasksDone = tasks.filter((t) => t.done).length;
  const planPct = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;

  const doneList = doneToday.length
    ? `<ul style="margin:8px 0;padding-left:20px;">${doneToday
        .map((t) => `<li style="margin:4px 0;">✅ ${t.title}</li>`)
        .join("")}</ul>`
    : `<p style="color:#888;margin:8px 0;">No action-plan tasks ticked off today.</p>`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <div style="background:#0a0d12;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <p style="margin:0;font-size:12px;letter-spacing:2px;color:#a3e635;">LOCK IN — DAILY REPORT</p>
      <h1 style="margin:6px 0 0;font-size:20px;">${profile.name} — ${dateLabel}</h1>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px;">
      <p style="font-size:16px;margin:0 0 16px;"><strong>${verdict}</strong></p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:10px;background:#f7f7f7;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;">${fmtDuration(todayMinutes)}</div>
            <div style="font-size:12px;color:#666;">today (goal ${fmtDuration(goal)})</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:10px;background:#f7f7f7;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;">🔥 ${streak}</div>
            <div style="font-size:12px;color:#666;">day streak</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:10px;background:#f7f7f7;border-radius:8px;text-align:center;">
            <div style="font-size:22px;font-weight:700;">${cd.daysToSchool}</div>
            <div style="font-size:12px;color:#666;">days to school</div>
          </td>
        </tr>
      </table>

      ${
        subjectRows
          ? `<h3 style="font-size:14px;margin:16px 0 4px;">Time by subject</h3>
             <table style="width:100%;border-collapse:collapse;">${subjectRows}</table>`
          : ""
      }

      <h3 style="font-size:14px;margin:16px 0 4px;">Tasks completed today</h3>
      ${doneList}

      <h3 style="font-size:14px;margin:16px 0 4px;">Summer so far</h3>
      <p style="margin:4px 0;font-size:14px;">
        Total study time: <strong>${fmtDuration(core.totalMinutes)}</strong><br/>
        Action plan: <strong>${tasksDone}/${tasks.length} tasks (${planPct}%)</strong><br/>
        Mission: <strong>${POINTS.current} → ${POINTS.target} IB points</strong>
      </p>

      <p style="font-size:11px;color:#999;margin-top:20px;">
        Sent automatically by Lock In, ${profile.name}'s study tracker.
      </p>
    </div>
  </div>`;

  const subject = cd.onVacation
    ? `Lock In — ${dateLabel}: vacation day 🏖️`
    : `Lock In — ${dateLabel}: ${fmtDuration(todayMinutes)} studied ${ratio >= 1 ? "✅" : todayMinutes === 0 ? "❌" : "🟡"}`;

  return { subject, html };
}

export async function sendDailySummary(
  db: SupabaseClient,
  core: Core,
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  const recipients = [core.profile.parent_email, core.profile.user_email].filter(
    (e): e is string => Boolean(e),
  );
  if (recipients.length === 0) return { sent: false, recipients, reason: "no_recipients" };

  const { subject, html } = buildDailySummary(core);
  const result = await sendEmail(recipients, subject, html);
  return { ...result, recipients };
}
