"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useInitialLoad, useRealtimeRefetch } from "@/hooks/useRealtime";
import { friendlyDbMessage } from "@/lib/db-errors";
import { cn } from "@/lib/cn";
import { fmtDayTime, fmtDuration, isOverdue, minutesLate, minutesOut } from "@/lib/time";
import type { LiveBoardRow } from "@/lib/types";
import { useStaff } from "./StaffContext";
import { HouseFilter } from "./HouseFilter";
import { TimeAdjustButton } from "./TimeAdjust";

interface StudentLite {
  id: string;
  house_id: string;
  status: "in" | "out";
}

export default function LiveBoardPage() {
  const { staff, houses } = useStaff();
  const [houseFilter, setHouseFilter] = useState<string | "all">(
    staff.role === "leadership" ? "all" : (staff.house_id ?? "all"),
  );
  const [rows, setRows] = useState<LiveBoardRow[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [board, studs, pending] = await Promise.all([
      supabase.from("live_board").select("*").order("expected_back_at", { ascending: true }),
      supabase.from("students").select("id, house_id, status").eq("active", true),
      supabase
        .from("outings")
        .select("id", { count: "exact", head: true })
        .eq("status", "requested"),
    ]);
    if (board.error || studs.error) {
      setError("Couldn't load the board — retrying automatically.");
      return;
    }
    setError(null);
    setRows((board.data as LiveBoardRow[]) ?? []);
    setStudents((studs.data as StudentLite[]) ?? []);
    setPendingCount(pending.count ?? 0);
  }, []);

  useInitialLoad(refetch);
  useRealtimeRefetch(["outings", "students"], refetch);

  const visibleRows = useMemo(
    () => (rows ?? []).filter((r) => houseFilter === "all" || r.house_id === houseFilter),
    [rows, houseFilter],
  );
  const visibleStudents = useMemo(
    () => students.filter((s) => houseFilter === "all" || s.house_id === houseFilter),
    [students, houseFilter],
  );

  const outCount = visibleRows.length;
  const inCount = visibleStudents.length - visibleStudents.filter((s) => s.status === "out").length;
  const overdueCount = visibleRows.filter((r) => isOverdue(r.expected_back_at, now)).length;

  async function markBackIn(row: LiveBoardRow) {
    if (
      !window.confirm(
        `Mark ${row.full_name} as back in? Use this when someone forgot to sign in at the office — it is written to the audit log.`,
      )
    ) {
      return;
    }
    setActionError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("api_mark_back_in", {
      p_student_id: row.student_id,
    });
    if (error) setActionError(friendlyDbMessage(error));
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Live board</h1>
        <HouseFilter houses={houses} value={houseFilter} onChange={setHouseFilter} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In" value={inCount} tone="calm" />
        <StatCard label="Out" value={outCount} tone="info" />
        <StatCard label="Overdue" value={overdueCount} tone={overdueCount ? "alert" : "calm"} />
        <Link
          href="/staff/approvals"
          className={cn(
            "flex flex-col justify-center rounded-2xl border p-4 shadow-card transition-colors",
            pendingCount
              ? "border-warn bg-warn/15 hover:bg-warn/25"
              : "border-ink/10 bg-white hover:bg-mint-100",
          )}
        >
          <span className="text-3xl font-semibold">{pendingCount}</span>
          <span className="text-sm text-ink/60">Awaiting approval →</span>
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-alert/40 bg-alert-100 px-4 py-3 text-alert-600">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-xl border border-alert/40 bg-alert-100 px-4 py-3 text-alert-600">
          {actionError}
        </p>
      )}

      <section aria-label="Students currently out" className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading the board…</p>
        ) : visibleRows.length === 0 ? (
          <p className="p-8 text-center text-ink/50">
            Nobody is out right now. The board updates live as students sign out.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Student</th>
                {houseFilter === "all" && houses.length > 1 && <th className="px-4 py-3">House</th>}
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Out since</th>
                <th className="px-4 py-3">Due back</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const late = isOverdue(r.expected_back_at, now);
                return (
                  <tr
                    key={r.outing_id}
                    className={cn(
                      "border-b border-ink/5 last:border-0",
                      late && "bg-alert-100",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.full_name}</span>
                      <span className="ml-2 text-ink/50">
                        Rm {r.room ?? "—"} · {r.year_group ?? ""}
                      </span>
                    </td>
                    {houseFilter === "all" && houses.length > 1 && (
                      <td className="px-4 py-3 text-ink/70">{r.house_name}</td>
                    )}
                    <td className="px-4 py-3">{r.destination}</td>
                    <td className="px-4 py-3 text-ink/70">
                      {fmtDayTime(r.signed_out_at)}
                      <span className="ml-1 text-ink/40">
                        ({fmtDuration(minutesOut(r.signed_out_at, now))})
                      </span>
                    </td>
                    <td className={cn("px-4 py-3", late ? "font-semibold text-alert-600" : "text-ink/70")}>
                      {r.expected_back_at ? fmtDayTime(r.expected_back_at) : "—"}
                      {late && (
                        <span className="ml-2 rounded-full bg-alert px-2 py-0.5 text-xs text-white">
                          {fmtDuration(minutesLate(r.expected_back_at, now))} late
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <TimeAdjustButton
                          outingId={r.outing_id}
                          current={r.expected_back_at}
                          onDone={refetch}
                          onError={setActionError}
                        />
                        <button
                          type="button"
                          onClick={() => markBackIn(r)}
                          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mint"
                        >
                          Mark back in
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-ink/40">
        Times are recorded by the server at the office station. “Mark back in”
        is for corrections and is audit-logged under your name.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "calm" | "info" | "alert";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-card",
        tone === "alert" ? "border-alert bg-alert-100" : "border-ink/10 bg-white",
      )}
    >
      <span className={cn("block text-3xl font-semibold", tone === "alert" && "text-alert-600")}>
        {value}
      </span>
      <span className="text-sm text-ink/60">{label}</span>
    </div>
  );
}
