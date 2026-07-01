"use client";

import Link from "next/link";
import { useLoad } from "@/hooks/useLoad";
import { fmtDuration } from "@/lib/time";
import type { MePayload } from "@/lib/types";
import { Snake } from "./Snake";

/**
 * The reward. Locked until today's quota is banked — that's the whole deal:
 * study first, play after.
 */
export function ArcadeClient() {
  const { data: me, error, reload } = useLoad<MePayload>("/api/me");

  if (error) return <p className="text-sm text-danger">Couldn&apos;t load — refresh.</p>;
  if (!me) return <p className="animate-pulse text-sm text-mut">Loading…</p>;

  const left = Math.max(0, me.profile.daily_goal_minutes - me.todayMinutes);

  if (!me.goalMet) {
    return (
      <div className="animate-rise flex flex-col items-center rounded-xl2 border border-line bg-panel px-6 py-14 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 text-2xl font-black">Arcade&apos;s locked.</h1>
        <p className="mt-2 max-w-xs text-sm text-mut">
          {fmtDuration(left)} of studying between you and Snake. You know
          exactly what to do — and it isn&apos;t reading this sentence again.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-xl2 bg-acc px-8 py-3 text-base font-black text-bg transition hover:brightness-110"
        >
          ▶ Go earn it
        </Link>
        <p className="mt-4 text-[11px] text-mut/70">
          Unlocks the moment today hits {fmtDuration(me.profile.daily_goal_minutes)}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl2 border border-acc/40 bg-acc/10 px-4 py-3 text-sm font-semibold text-acc">
        ✅ Quota banked ({fmtDuration(me.todayMinutes)}). Guilt-free game time.
      </div>
      <Snake
        best={me.profile.best_snake}
        onGameOver={async (score) => {
          await fetch("/api/game/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score }),
          });
          reload();
        }}
      />
    </div>
  );
}
