"use client";

import { useLoad } from "@/hooks/useLoad";
import { cn } from "@/lib/cn";
import { fmtDuration } from "@/lib/time";
import type { StatsPayload } from "@/lib/types";

export function StatsClient() {
  const { data, error } = useLoad<StatsPayload>("/api/stats");

  if (error) return <p className="text-sm text-danger">Couldn&apos;t load — refresh.</p>;
  if (!data) return <p className="animate-pulse text-sm text-mut">Crunching numbers…</p>;

  const maxDay = Math.max(60, ...data.days.map((d) => d.minutes));
  const unlockedCount = data.achievements.filter((a) => a.unlocked_at).length;

  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Big label="total studied" value={fmtDuration(data.totalMinutes)} />
        <Big label="sessions" value={String(data.totalSessions)} />
        <Big label="avg / day" value={fmtDuration(data.avgPerDay)} />
        <Big label="projected by Sept" value={fmtDuration(data.projectedTotal)} accent />
      </section>

      {/* Last 28 days */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">LAST 28 DAYS</h2>
        <div className="mt-3 flex h-32 items-end gap-[3px]">
          {data.days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${fmtDuration(d.minutes)}`}
              className={cn(
                "flex-1 rounded-t-sm",
                d.minutes === 0 ? "bg-line" : "bg-acc",
              )}
              style={{
                height: `${Math.max(3, Math.round((d.minutes / maxDay) * 100))}%`,
                opacity: d.minutes === 0 ? 0.6 : 0.4 + 0.6 * (d.minutes / maxDay),
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-mut">
          oldest ← → today · tallest bar {fmtDuration(maxDay)}
        </p>
      </section>

      {/* Per-subject time */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">TIME BY SUBJECT</h2>
        <div className="mt-3 space-y-2">
          {data.bySubject
            .filter((r) => r.minutes > 0 || r.subject.priority === 1)
            .sort((a, b) => b.minutes - a.minutes)
            .map(({ subject, minutes }) => {
              const max = Math.max(60, ...data.bySubject.map((r) => r.minutes));
              return (
                <div key={subject.id} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm font-semibold" style={{ color: subject.color }}>
                    {subject.short_name}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((minutes / max) * 100)}%`, background: subject.color }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-mut">
                    {fmtDuration(minutes)}
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      {/* Plan progress by group */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">PLAN PROGRESS</h2>
        <div className="mt-3 space-y-2.5">
          {data.taskGroups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold" style={g.color ? { color: g.color } : undefined}>
                  {g.label}
                </span>
                <span className="tabular-nums text-mut">
                  {g.done}/{g.total}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%`,
                    background: g.color ?? "var(--color-acc)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Achievements */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-widest text-mut">ACHIEVEMENTS</h2>
          <span className="text-xs tabular-nums text-mut">
            {unlockedCount}/{data.achievements.length}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.achievements.map((a) => (
            <div
              key={a.code}
              className={cn(
                "rounded-xl border px-3 py-2.5",
                a.unlocked_at
                  ? "border-acc/40 bg-acc/10"
                  : "border-line opacity-50 grayscale",
              )}
            >
              <p className="text-lg leading-none">{a.icon}</p>
              <p className="mt-1 text-xs font-bold">{a.name}</p>
              <p className="text-[10px] leading-snug text-mut">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl2 border border-line bg-panel px-3 py-3 text-center">
      <p className={cn("text-lg font-black tabular-nums", accent && "text-acc")}>{value}</p>
      <p className="text-[10px] text-mut">{label}</p>
    </div>
  );
}
