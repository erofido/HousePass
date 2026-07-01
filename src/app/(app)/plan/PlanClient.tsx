"use client";

import { useMemo, useState } from "react";
import { useLoad } from "@/hooks/useLoad";
import { cn } from "@/lib/cn";
import type { Subject, Task } from "@/lib/types";

interface TasksPayload {
  tasks: Task[];
  subjects: Subject[];
}

interface Group {
  key: string;
  label: string;
  sub: string | null;
  color: string | null;
  tasks: Task[];
}

export function PlanClient() {
  const { data, error, reload } = useLoad<TasksPayload>("/api/tasks");
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => (data ? groupTasks(data) : []), [data]);

  async function toggle(task: Task) {
    if (busyId) return;
    setBusyId(task.id);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    if (res.ok) {
      const r = (await res.json()) as {
        xpDelta: number;
        newAchievements: { icon: string; name: string }[];
      };
      if (r.xpDelta > 0) {
        const bits = [`+${r.xpDelta} XP`];
        for (const a of r.newAchievements ?? []) bits.push(`${a.icon} ${a.name} unlocked!`);
        setFlash(bits.join(" · "));
        setTimeout(() => setFlash(null), 6000);
      }
    }
    await reload();
    setBusyId(null);
  }

  if (error) return <p className="text-sm text-danger">Couldn&apos;t load — refresh.</p>;
  if (!data) return <p className="animate-pulse text-sm text-mut">Loading the plan…</p>;

  const done = data.tasks.filter((t) => t.done).length;
  const pct = data.tasks.length ? Math.round((done / data.tasks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {flash && (
        <div className="animate-rise sticky top-2 z-10 rounded-xl2 border border-acc/40 bg-acc/10 px-4 py-3 text-sm font-semibold text-acc backdrop-blur">
          {flash}
        </div>
      )}

      <section className="rounded-xl2 border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-black">Summer Action Plan</h1>
          <span className="text-sm font-bold text-acc">{pct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-acc transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-mut">
          {done} of {data.tasks.length} tasks. Every tick is XP. Every section done is a September you don&apos;t dread.
        </p>
      </section>

      {groups.map((g) => {
        const gDone = g.tasks.filter((t) => t.done).length;
        return (
          <section key={g.key} className="rounded-xl2 border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold" style={g.color ? { color: g.color } : undefined}>
                {g.label}
                {g.sub && <span className="ml-2 text-xs font-medium text-mut">{g.sub}</span>}
              </h2>
              <span className="shrink-0 text-xs tabular-nums text-mut">
                {gDone}/{g.tasks.length}
              </span>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {g.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2.5">
                  <button
                    onClick={() => toggle(t)}
                    disabled={busyId === t.id}
                    aria-label={t.done ? "Mark not done" : "Mark done"}
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold transition",
                      t.done
                        ? "border-acc bg-acc text-bg"
                        : "border-line text-transparent hover:border-mut",
                      busyId === t.id && "opacity-50",
                    )}
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", t.done && "text-mut line-through")}>
                      {t.title}
                    </p>
                    {t.details && !t.done && (
                      <p className="mt-0.5 text-xs leading-relaxed text-mut">{t.details}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-mut/70">
                      +{t.xp} XP{t.week_hint ? ` · ${t.week_hint}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function groupTasks(data: TasksPayload): Group[] {
  const groups: Group[] = [];

  for (const s of data.subjects) {
    const tasks = data.tasks.filter((t) => t.subject_id === s.id);
    if (tasks.length === 0) continue;
    const grade =
      s.current_grade !== null && s.target_grade !== null
        ? `${s.current_grade} → ${s.target_grade}`
        : null;
    groups.push({
      key: s.id,
      label: s.level === "Core" ? s.name : `${s.name} ${s.level}`,
      sub: grade,
      color: s.color,
      tasks,
    });
  }

  const uni = data.tasks.filter((t) => t.category === "university");
  if (uni.length) groups.push({ key: "uni", label: "University applications", sub: "UCL · LSE · Warwick · KCL · Durham · Bocconi · IE", color: null, tasks: uni });

  const supo = data.tasks.filter((t) => t.category === "supercurricular");
  if (supo.length) groups.push({ key: "supo", label: "Supercurriculars", sub: "the personal-statement fuel", color: null, tasks: supo });

  return groups;
}
