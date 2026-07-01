"use client";

import { fmtDuration } from "@/lib/time";

/** The daily quota ring. Fills lime as the day is earned. */
export function GoalRing({
  minutes,
  goal,
  running,
}: {
  minutes: number;
  goal: number;
  running: boolean;
}) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const ratio = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const met = minutes >= goal;

  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={met ? "var(--color-acc)" : running ? "var(--color-acc)" : "var(--color-amber)"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums">{fmtDuration(minutes)}</span>
        <span className="text-xs text-mut">of {fmtDuration(goal)}</span>
        {met && <span className="mt-1 text-xs font-bold text-acc">QUOTA MET ✅</span>}
      </div>
    </div>
  );
}
