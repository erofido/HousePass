"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRealtimeRefetch } from "@/hooks/useRealtime";
import { friendlyDbMessage } from "@/lib/db-errors";
import { fmtDayTime, timeInputToIso } from "@/lib/time";
import { Spinner } from "@/components/Notice";
import { useStaff } from "../StaffContext";
import { HouseFilter } from "../HouseFilter";

interface RequestRow {
  id: string;
  house_id: string;
  requested_at: string;
  expected_back_at: string | null;
  note: string | null;
  location_text: string | null;
  students: { full_name: string; room: string | null; year_group: string | null } | null;
  locations: { name: string } | null;
  houses: { name: string } | null;
}

export default function ApprovalsPage() {
  const { staff, houses } = useStaff();
  const [houseFilter, setHouseFilter] = useState<string | "all">(
    staff.role === "leadership" ? "all" : (staff.house_id ?? "all"),
  );
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("outings")
      .select(
        "id, house_id, requested_at, expected_back_at, note, location_text, students(full_name, room, year_group), locations(name), houses(name)",
      )
      .eq("status", "requested")
      .order("requested_at", { ascending: true });
    if (error) {
      setError("Couldn't load requests — retrying automatically.");
      return;
    }
    setError(null);
    setRows((data as unknown as RequestRow[]) ?? []);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtimeRefetch(["outings"], refetch);

  async function act(row: RequestRow, action: "approve" | "deny") {
    setBusyId(row.id);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const adjustedIso = adjust[row.id] ? timeInputToIso(adjust[row.id]) : null;
    const { error } =
      action === "approve"
        ? await supabase.rpc("api_approve_outing", {
            p_outing_id: row.id,
            p_expected_back_at: adjustedIso,
          })
        : await supabase.rpc("api_deny_outing", { p_outing_id: row.id });
    setBusyId(null);
    if (error) setError(friendlyDbMessage(error));
    refetch();
  }

  const visible = (rows ?? []).filter(
    (r) => houseFilter === "all" || r.house_id === houseFilter,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Approvals</h1>
        <HouseFilter houses={houses} value={houseFilter} onChange={setHouseFilter} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-alert/40 bg-alert-100 px-4 py-3 text-alert-600">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink/50 shadow-card">
          Loading requests…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink/50 shadow-card">
          No outings waiting for approval. Requests from phones and the office
          iPad appear here instantly.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const destination = r.locations?.name ?? r.location_text ?? "—";
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-card"
              >
                <div className="min-w-48 flex-1">
                  <p className="text-lg font-medium">
                    {r.students?.full_name ?? "Unknown"}
                    <span className="ml-2 text-sm font-normal text-ink/50">
                      Rm {r.students?.room ?? "—"} · {r.students?.year_group ?? ""}
                      {houses.length > 1 && r.houses?.name ? ` · ${r.houses.name}` : ""}
                    </span>
                  </p>
                  <p className="text-ink/70">
                    → <strong>{destination}</strong>
                    {r.expected_back_at && <>, back by {fmtDayTime(r.expected_back_at)}</>}
                    <span className="ml-2 text-xs text-ink/40">
                      asked {fmtDayTime(r.requested_at)}
                    </span>
                  </p>
                  {r.note && <p className="mt-1 text-sm italic text-ink/60">“{r.note}”</p>}
                </div>

                <label className="flex items-center gap-2 text-xs text-ink/60">
                  Back by
                  <input
                    type="time"
                    value={adjust[r.id] ?? ""}
                    onChange={(e) => setAdjust((a) => ({ ...a, [r.id]: e.target.value }))}
                    className="rounded-lg border border-ink/20 px-2 py-1.5 text-sm"
                    aria-label={`Adjust due-back for ${r.students?.full_name}`}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => act(r, "approve")}
                    className="rounded-xl bg-teal px-5 py-2.5 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
                  >
                    {busyId === r.id ? <Spinner /> : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => act(r, "deny")}
                    className="rounded-xl border border-alert/50 px-5 py-2.5 font-medium text-alert-600 transition-colors hover:bg-alert-100 disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink/40">
        Approving sets you as the approver in the audit log. The student still
        confirms departure at the office iPad — that's when the clock starts.
      </p>
    </div>
  );
}
