"use client";

import { useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useInitialLoad, useRealtimeRefetch } from "@/hooks/useRealtime";
import { fmtDayTime, fmtTime, isOverdue } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { LiveBoardRow } from "@/lib/types";
import { useStaff } from "../StaffContext";

interface StudentRow {
  id: string;
  house_id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  status: "in" | "out";
}

/**
 * Emergency headcount: one tap from the live board, printable, grouped by
 * house — who should be standing in front of you, who is signed out where.
 */
export default function HeadcountPage() {
  const { houses } = useStaff();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [board, setBoard] = useState<LiveBoardRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [studs, lb] = await Promise.all([
      supabase
        .from("students")
        .select("id, house_id, full_name, room, year_group, status")
        .eq("active", true)
        .order("full_name"),
      supabase.from("live_board").select("*"),
    ]);
    if (studs.error || lb.error) {
      setError("Couldn't load the headcount — retrying automatically.");
      return;
    }
    setError(null);
    setStudents((studs.data as StudentRow[]) ?? []);
    setBoard((lb.data as LiveBoardRow[]) ?? []);
    setGeneratedAt(new Date());
  }, []);

  useInitialLoad(refetch);
  useRealtimeRefetch(["outings", "students"], refetch);

  const byOuting = new Map(board.map((b) => [b.student_id, b]));

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Emergency headcount</h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-ink px-5 py-2.5 font-medium text-paper transition-colors hover:bg-ink-700"
        >
          Print
        </button>
      </div>

      {error && (
        <p role="alert" className="no-print rounded-xl border border-alert/40 bg-alert-100 px-4 py-3 text-alert-600">
          {error}
        </p>
      )}

      {generatedAt && (
        <p className="text-sm text-ink/60">
          Generated {fmtDayTime(generatedAt)} — live, regenerates as students move.
        </p>
      )}

      {students === null ? (
        <p className="rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink/50 shadow-card">
          Loading…
        </p>
      ) : (
        houses.map((house) => {
          const hs = students.filter((s) => s.house_id === house.id);
          const out = hs.filter((s) => s.status === "out");
          const inside = hs.filter((s) => s.status === "in");
          return (
            <section key={house.id} className="break-inside-avoid space-y-4">
              <h2 className="border-b-2 border-ink pb-1 text-2xl font-semibold">
                {house.name}
                <span className="ml-3 text-base font-normal text-ink/60">
                  {inside.length} in · {out.length} out · {hs.length} total
                </span>
              </h2>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-semibold text-alert-600">
                    OUT ({out.length}) — account for these first
                  </h3>
                  {out.length === 0 ? (
                    <p className="text-ink/50">Nobody out.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {out.map((s) => {
                        const o = byOuting.get(s.id);
                        const late = o ? isOverdue(o.expected_back_at) : false;
                        return (
                          <li
                            key={s.id}
                            className={cn(
                              "rounded-lg border px-3 py-2",
                              late ? "border-alert bg-alert-100" : "border-ink/15",
                            )}
                          >
                            <span className="font-medium">{s.full_name}</span>
                            <span className="ml-2 text-sm text-ink/60">
                              Rm {s.room ?? "—"}
                            </span>
                            {o && (
                              <span className="block text-sm text-ink/70">
                                → {o.destination}, out {fmtTime(o.signed_out_at)}
                                {o.expected_back_at && <>, due {fmtTime(o.expected_back_at)}</>}
                                {late && (
                                  <strong className="ml-1 text-alert-600">OVERDUE</strong>
                                )}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-teal-700">
                    IN ({inside.length}) — expected on site
                  </h3>
                  <ul className="columns-2 gap-4 text-sm">
                    {inside.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 py-0.5">
                        <span>{s.full_name}</span>
                        <span className="text-ink/50">Rm {s.room ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
