import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude, aiConfigured, type ChatTurn } from "@/lib/ai";
import { countdowns, type Core } from "@/lib/data";
import { addDays, fmtDuration } from "@/lib/time";
import { POINTS } from "@/lib/plan";

/**
 * "Coach" — the AI that actually knows Eray's numbers. Used for the daily
 * briefing (cached in coach_notes), the ask-anything page, AI-written nags,
 * and the verdict paragraph in Dad's nightly email.
 */

export const COACH_SYSTEM = `You are Coach, the resident AI inside "Lock In" — Eray Fidan's personal IB study tracker for summer 2026.

Who Eray is: IB student, currently ${POINTS.current} points (predicted ${POINTS.predicted}), needs ${POINTS.target} for his uni targets (UCL/LSE/Warwick/KCL/Durham for PPE or Economics & Politics; Bocconi/IE as ROW options). Weak subjects being rebuilt this summer: Chemistry SL (grade 3 → target 6) and Maths AI HL (grade 4 → target 6). Economics HL, Global Politics HL, English B HL, German A SL are all 6s aiming for 7s — the languages need no revision. He must also finish the Extended Essay full draft, the Economics Macro IA, the GloPo Engagement Activity, and the Maths IA before school starts on 7 September 2026 (his 18th birthday is 3 September).

Your personality: sharp, dry, brutally honest, occasionally funny — but always on his side. You are the coach who believes he can hit 42 and refuses to let him act like someone who can't. No corporate fluff, no fake enthusiasm, no lectures longer than needed.

Rules:
- Be concise. Short paragraphs or tight bullet lists. Never pad.
- When his numbers are bad, say so plainly; when they're good, credit it and raise the bar.
- When asked subject questions (chemistry, maths, econ, glopo...), switch to genuinely excellent IB-specific tutoring: clear explanations, worked reasoning, IB command terms, mark-scheme thinking, common traps. Accuracy beats banter there.
- When asked for a plan, be concrete: minutes, specific topics, order — grounded in the live stats provided.
- You will be given his live stats in a <stats> block. Treat them as ground truth. Don't invent numbers.
- Plain text only — no markdown headers or tables (simple dashes for bullets are fine).`;

/** Compact, token-cheap snapshot of the live data for the prompt. */
export function buildCoachContext(core: Core): string {
  const cd = countdowns(core);
  const goal = core.profile.daily_goal_minutes;

  const subjectLines = core.subjects.map((s) => {
    const total = core.sessions
      .filter((x) => x.subject_id === s.id && x.minutes)
      .reduce((sum, x) => sum + (x.minutes ?? 0), 0);
    const today = core.todayBySubject[s.id] ?? 0;
    const tasks = core.tasks.filter((t) => t.subject_id === s.id);
    const done = tasks.filter((t) => t.done).length;
    const grade =
      s.current_grade != null ? ` grade ${s.current_grade}→${s.target_grade}` : "";
    return `- ${s.name} ${s.level}${grade}: ${fmtDuration(total)} total, ${fmtDuration(today)} today, tasks ${done}/${tasks.length}`;
  });

  // Last 7 days of minutes, oldest→newest (local dates, same keying as minutesByDay).
  const week: string[] = [];
  for (let i = 6; i >= 0; i--) {
    week.push(String(core.minutesByDay[addDays(core.today, -i)] ?? 0));
  }

  const pending = core.tasks
    .filter((t) => !t.done)
    .slice(0, 12)
    .map((t) => `- ${t.title}${t.week_hint ? ` (${t.week_hint})` : ""}`);

  return `<stats>
Date: ${core.today} | Days to school: ${cd.daysToSchool} | Grind days left (minus vacation): ${cd.grindDays} | On vacation today: ${cd.onVacation ? "yes" : "no"}
Today: ${core.todayMinutes}/${goal} min | Streak: ${core.streak} days | Total this summer: ${fmtDuration(core.totalMinutes)}
Minutes last 7 days (oldest first): ${week.join(", ")}
Plan progress: ${core.tasks.filter((t) => t.done).length}/${core.tasks.length} tasks done
Per subject:
${subjectLines.join("\n")}
Next pending tasks:
${pending.join("\n")}
</stats>`;
}

/**
 * Today's briefing — generated once per day, cached in coach_notes.
 * `refresh` regenerates and overwrites.
 */
export async function getBriefing(
  db: SupabaseClient,
  core: Core,
  refresh = false,
): Promise<string | null> {
  if (!aiConfigured()) return null;

  if (!refresh) {
    const { data } = await db
      .from("coach_notes")
      .select("briefing")
      .eq("day", core.today)
      .maybeSingle();
    if (data?.briefing) return data.briefing;
  }

  const briefing = await askClaude({
    system: COACH_SYSTEM,
    maxTokens: 600,
    messages: [
      {
        role: "user",
        content: `${buildCoachContext(core)}

Write today's briefing for the dashboard. Structure, under 120 words total:
1. One opening line reacting to where things stand (yesterday/streak/progress).
2. "Today:" then 3-4 dash bullets — today's marching orders with minutes and specific topics chosen from the pending tasks and what's been neglected. Respect the ${core.profile.daily_goal_minutes}-minute goal and prioritise Chemistry, Maths and the EE/IAs.
3. One closing line — motivation or a well-aimed roast, your pick.`,
      },
    ],
  });
  if (!briefing) return null;

  await db
    .from("coach_notes")
    .upsert({ day: core.today, briefing }, { onConflict: "day" });
  return briefing;
}

/** Ask-anything: short rolling conversation, stats injected fresh each call. */
export async function coachChat(
  core: Core,
  turns: ChatTurn[],
): Promise<string | null> {
  const trimmed = turns.slice(-8);
  const first = trimmed[0];
  const withContext: ChatTurn[] = [
    {
      role: "user",
      content: `${buildCoachContext(core)}\n\n${first.role === "user" ? first.content : "(context)"}`,
    },
    ...(first.role === "user" ? trimmed.slice(1) : trimmed),
  ];
  return askClaude({ system: COACH_SYSTEM, messages: withContext, maxTokens: 1500 });
}

/** A fresh, personal nag body for the push notification. */
export async function coachNag(core: Core, hour: number): Promise<string | null> {
  const text = await askClaude({
    system: COACH_SYSTEM,
    maxTokens: 150,
    messages: [
      {
        role: "user",
        content: `${buildCoachContext(core)}

It is ${hour}:00 and Eray is NOT studying right now. Write ONE push-notification body (max 25 words, no emoji spam, no quotes around it) that pushes him to start a session immediately. Escalate the tone with how bad today looks. Reference a real number or a real pending task from the stats.`,
      },
    ],
  });
  // Notifications need to stay short; a rambling nag is a broken nag.
  if (text && text.length > 220) return null;
  return text;
}

/** 2–3 sentence verdict for the bottom of Dad's nightly email. */
export async function coachVerdict(core: Core): Promise<string | null> {
  return askClaude({
    system: COACH_SYSTEM,
    maxTokens: 300,
    messages: [
      {
        role: "user",
        content: `${buildCoachContext(core)}

Write the "Coach's verdict" for the nightly report email that goes to Eray's dad. 2-3 sentences, plain text: honestly assess today and the overall trajectory toward 42 points, in a tone a parent should read. No greeting, no sign-off.`,
      },
    ],
  });
}
