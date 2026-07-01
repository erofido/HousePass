"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLoad } from "@/hooks/useLoad";
import { GoalRing } from "@/components/GoalRing";
import { PushToggle } from "@/components/PushToggle";
import { cn } from "@/lib/cn";
import { fmtDuration } from "@/lib/time";
import type { MePayload, Subject } from "@/lib/types";

interface StopResult {
  minutes: number;
  xpGained: number;
  goalJustMet?: boolean;
  discarded?: boolean;
  newAchievements: { code: string; name: string; icon: string }[];
}

export function DashboardClient() {
  const { data: me, error, reload } = useLoad<MePayload>("/api/me");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedSubject, setPickedSubject] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick while a session runs so the elapsed time and ring move.
  useEffect(() => {
    if (!me?.activeSession) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [me?.activeSession]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 7000);
    return () => clearTimeout(t);
  }, [flash]);

  const elapsedMin = me?.activeSession
    ? Math.max(0, Math.floor((now - new Date(me.activeSession.started_at).getTime()) / 60_000))
    : 0;
  const elapsedSec = me?.activeSession
    ? Math.max(0, Math.floor((now - new Date(me.activeSession.started_at).getTime()) / 1000) % 60)
    : 0;

  const liveMinutes = (me?.todayMinutes ?? 0) + elapsedMin;

  const suggestions = useMemo(() => {
    if (!me) return [];
    return suggestSplit(me);
  }, [me]);

  async function start() {
    if (!me || busy) return;
    setBusy(true);
    await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: pickedSubject }),
    });
    await reload();
    setBusy(false);
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/session/stop", { method: "POST" });
    if (res.ok) {
      const r = (await res.json()) as StopResult;
      if (r.discarded) {
        setFlash("Too short to count — under a minute.");
      } else {
        const bits = [`+${r.xpGained} XP for ${fmtDuration(r.minutes)}`];
        if (r.goalJustMet) bits.push("QUOTA MET — arcade unlocked 🎮");
        for (const a of r.newAchievements) bits.push(`${a.icon} ${a.name} unlocked!`);
        setFlash(bits.join(" · "));
      }
    }
    await reload();
    setBusy(false);
  }

  async function cancel() {
    if (busy) return;
    if (!confirm("Bin this session? No time will be credited.")) return;
    setBusy(true);
    await fetch("/api/session/cancel", { method: "POST" });
    await reload();
    setBusy(false);
  }

  if (error) return <p className="text-sm text-danger">Couldn&apos;t load — refresh.</p>;
  if (!me) return <p className="animate-pulse text-sm text-mut">Loading the grind…</p>;

  const running = Boolean(me.activeSession);
  const runningSubject = me.activeSession
    ? me.subjects.find((s) => s.id === me.activeSession!.subject_id)
    : null;

  return (
    <div className="space-y-4">
      {flash && (
        <div className="animate-rise rounded-xl2 border border-acc/40 bg-acc/10 px-4 py-3 text-sm font-semibold text-acc">
          {flash}
        </div>
      )}

      {me.onVacation && (
        <div className="rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-mut">
          🏖️ Vacation day — streak protected, nags off. Enjoy it properly.
        </div>
      )}

      {/* Countdown strip */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="days to school" value={me.daysToSchool} />
        <Stat label="grind days left" value={me.grindDays} accent />
        <Stat label="days to birthday 🎂" value={me.daysToBirthday} />
      </div>

      {/* The ring + timer */}
      <section className={cn("animate-rise rounded-xl2 border border-line bg-panel p-5 shadow-card", running && "glow-acc")}>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
          <GoalRing minutes={liveMinutes} goal={me.profile.daily_goal_minutes} running={running} />

          <div className="w-full flex-1">
            {running ? (
              <div className="text-center sm:text-left">
                <p className="flex items-center justify-center gap-2 text-xs font-bold tracking-widest text-acc sm:justify-start">
                  <span className="inline-block h-2 w-2 rounded-full bg-acc animate-pulse-dot" />
                  SESSION RUNNING{runningSubject ? ` — ${runningSubject.name.toUpperCase()}` : ""}
                </p>
                <p className="mt-1 font-mono text-5xl font-black tabular-nums">
                  {String(Math.floor(elapsedMin / 60)).padStart(2, "0")}:
                  {String(elapsedMin % 60).padStart(2, "0")}:
                  {String(elapsedSec).padStart(2, "0")}
                </p>
                <div className="mt-4 flex justify-center gap-2 sm:justify-start">
                  <button
                    onClick={stop}
                    disabled={busy}
                    className="rounded-xl2 bg-acc px-6 py-3 text-base font-bold text-bg transition hover:brightness-110 disabled:opacity-40"
                  >
                    Stop &amp; bank it
                  </button>
                  <button
                    onClick={cancel}
                    disabled={busy}
                    className="rounded-xl2 border border-line px-4 py-3 text-sm text-mut hover:text-txt disabled:opacity-40"
                  >
                    Bin
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold tracking-widest text-mut">START A SESSION</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {me.subjects
                    .filter((s) => s.priority < 3)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setPickedSubject(pickedSubject === s.id ? null : s.id)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                          pickedSubject === s.id
                            ? "border-transparent text-bg"
                            : "border-line text-mut hover:text-txt",
                        )}
                        style={pickedSubject === s.id ? { background: s.color } : undefined}
                      >
                        {s.short_name}
                      </button>
                    ))}
                </div>
                <button
                  onClick={start}
                  disabled={busy}
                  className="mt-3 w-full rounded-xl2 bg-acc py-3 text-lg font-black text-bg transition hover:brightness-110 disabled:opacity-40 sm:w-auto sm:px-10"
                >
                  ▶ LOCK IN
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Streak + level */}
      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-xl2 border border-line bg-panel p-4">
          <p className="text-3xl font-black">🔥 {me.streak}</p>
          <p className="text-xs text-mut">day streak{me.streak >= 3 ? " — don't break it" : ""}</p>
        </div>
        <div className="rounded-xl2 border border-line bg-panel p-4">
          <p className="truncate text-sm font-bold">
            Lv {me.level.level} · {me.level.name}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-acc transition-all"
              style={{ width: `${Math.round(me.level.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-mut">
            {me.level.next
              ? `${me.level.next - me.level.xp} XP to next level`
              : "Max level. Touch grass."}
          </p>
        </div>
      </section>

      {/* Today's split */}
      {!me.onVacation && suggestions.length > 0 && (
        <section className="rounded-xl2 border border-line bg-panel p-4">
          <h2 className="text-xs font-bold tracking-widest text-mut">TODAY&apos;S SPLIT</h2>
          <div className="mt-3 space-y-2">
            {suggestions.map(({ subject, target, done }) => (
              <div key={subject.id} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm font-semibold" style={{ color: subject.color }}>
                  {subject.short_name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((done / target) * 100))}%`,
                      background: subject.color,
                    }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-mut">
                  {fmtDuration(done)} / {fmtDuration(target)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next tasks */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-widest text-mut">UP NEXT ON THE PLAN</h2>
          <Link href="/plan" className="text-xs font-semibold text-acc">
            all {me.tasksDone}/{me.tasksTotal} →
          </Link>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {me.nextTasks.map((t) => (
            <li key={t.id} className="py-2">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-mut">
                {t.subjectName ?? t.category} · +{t.xp} XP
                {t.week_hint ? ` · ${t.week_hint}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between">
        <PushToggle />
        <p className="text-xs text-mut">
          Mission: <span className="font-bold text-txt">31 → 42 points</span>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl2 border border-line bg-panel px-3 py-3 text-center">
      <p className={cn("text-2xl font-black tabular-nums", accent && "text-acc")}>{value}</p>
      <p className="text-[10px] text-mut">{label}</p>
    </div>
  );
}

/**
 * Split the daily goal across what actually needs the hours:
 * Chem 25%, Maths 25%, EE 20%, and Econ/GloPo alternating days 30%.
 * Languages sit this one out (per the brief).
 */
function suggestSplit(me: MePayload): { subject: Subject; target: number; done: number }[] {
  const goal = me.profile.daily_goal_minutes;
  const bySubject = me.todayBySubject;
  const find = (short: string) => me.subjects.find((s) => s.short_name === short);

  const dayIndex = Number(me.today.slice(-2));
  const rotating = dayIndex % 2 === 0 ? find("Econ") : find("GloPo");

  const parts: { subject: Subject | undefined; share: number }[] = [
    { subject: find("Chem"), share: 0.25 },
    { subject: find("Maths"), share: 0.25 },
    { subject: find("EE"), share: 0.2 },
    { subject: rotating, share: 0.3 },
  ];

  return parts
    .filter((p): p is { subject: Subject; share: number } => Boolean(p.subject))
    .map((p) => ({
      subject: p.subject,
      target: Math.round((goal * p.share) / 5) * 5,
      done: bySubject[p.subject.id] ?? 0,
    }));
}
