"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice } from "@/components/Notice";
import { cn } from "@/lib/cn";
import { fmtDayTime, fmtDuration } from "@/lib/time";
import { useStaff } from "../StaffContext";
import { HouseFilter } from "../HouseFilter";

interface Row {
  id: string;
  house_id: string;
  status: string;
  requested_at: string;
  expected_back_at: string | null;
  signed_out_at: string | null;
  signed_in_at: string | null;
  signed_out_via: string | null;
  signed_in_via: string | null;
  location_text: string | null;
  students: { full_name: string; room: string | null; year_group: string | null } | null;
  locations: { name: string } | null;
  houses: { name: string } | null;
}

const RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

const SELECT =
  "id, house_id, status, requested_at, expected_back_at, signed_out_at, signed_in_at, signed_out_via, signed_in_via, location_text, students(full_name, room, year_group), locations(name), houses(name)";

function destOf(r: Row) {
  return r.locations?.name ?? r.location_text ?? "—";
}

/** Returned after the due-back time. */
function wasLate(r: Row): boolean {
  return Boolean(
    r.signed_in_at && r.expected_back_at && r.signed_in_at > r.expected_back_at,
  );
}

export default function HistoryPage() {
  const { staff, houses } = useStaff();
  const [houseFilter, setHouseFilter] = useState<string | "all">(
    staff.role === "leadership" ? "all" : (staff.house_id ?? "all"),
  );
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      const supabase = createSupabaseBrowserClient();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("outings")
        .select(SELECT)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) {
        setError("Couldn't load history.");
        return;
      }
      setError(null);
      setRows((data as unknown as Row[]) ?? []);
    },
    [days],
  );

  useInitialLoad(load);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (houseFilter !== "all" && r.house_id !== houseFilter) return false;
      if (q && !r.students?.full_name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, houseFilter, search]);

  const stats = useMemo(() => {
    const departed = visible.filter((r) => r.signed_out_at);
    return {
      total: departed.length,
      returned: departed.filter((r) => r.signed_in_at).length,
      late: departed.filter(wasLate).length,
      stillOut: departed.filter((r) => !r.signed_in_at).length,
    };
  }, [visible]);

  function exportCsv() {
    const head = [
      "Student", "Room", "Year", "House", "Destination",
      "Status", "Requested", "Signed out", "Due back", "Signed in",
      "Out via", "In via", "Late",
    ];
    const lines = visible.map((r) =>
      [
        r.students?.full_name ?? "",
        r.students?.room ?? "",
        r.students?.year_group ?? "",
        r.houses?.name ?? "",
        destOf(r),
        r.status,
        r.requested_at ?? "",
        r.signed_out_at ?? "",
        r.expected_back_at ?? "",
        r.signed_in_at ?? "",
        r.signed_out_via ?? "",
        r.signed_in_via ?? "",
        wasLate(r) ? "yes" : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `housepass-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">History</h1>
        <div className="flex flex-wrap items-center gap-3">
          <HouseFilter houses={houses} value={houseFilter} onChange={setHouseFilter} />
          <button
            type="button"
            onClick={exportCsv}
            disabled={!visible.length}
            className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-ink/5 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {RANGES.map((rg) => (
            <button
              key={rg.days}
              type="button"
              onClick={() => setDays(rg.days)}
              aria-pressed={days === rg.days}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                days === rg.days ? "bg-ink text-paper" : "bg-ink/5 text-ink/70 hover:bg-ink/10",
              )}
            >
              {rg.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm"
        />
      </div>

      <ErrorNotice>{error}</ErrorNotice>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Outings" value={stats.total} />
        <Stat label="Returned" value={stats.returned} />
        <Stat label="Returned late" value={stats.late} tone={stats.late ? "warn" : "calm"} />
        <Stat label="Still out" value={stats.stillOut} tone={stats.stillOut ? "info" : "calm"} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-ink/50">
            No outings in this period. (History older than the retention window —
            30 days by default — is automatically deleted.)
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Student</th>
                {houseFilter === "all" && houses.length > 1 && <th className="px-4 py-3">House</th>}
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Out</th>
                <th className="px-4 py-3">Back</th>
                <th className="px-4 py-3">For</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const late = wasLate(r);
                const duration =
                  r.signed_out_at && r.signed_in_at
                    ? fmtDuration(
                        Math.max(
                          0,
                          Math.floor(
                            (new Date(r.signed_in_at).getTime() -
                              new Date(r.signed_out_at).getTime()) /
                              60000,
                          ),
                        ),
                      )
                    : "—";
                return (
                  <tr key={r.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.students?.full_name ?? "—"}</span>
                      <span className="ml-2 text-ink/40">Rm {r.students?.room ?? "—"}</span>
                    </td>
                    {houseFilter === "all" && houses.length > 1 && (
                      <td className="px-4 py-2.5 text-ink/60">{r.houses?.name ?? "—"}</td>
                    )}
                    <td className="px-4 py-2.5">{destOf(r)}</td>
                    <td className="px-4 py-2.5 text-ink/70">
                      {r.signed_out_at ? fmtDayTime(r.signed_out_at) : "—"}
                    </td>
                    <td className={cn("px-4 py-2.5", late ? "font-medium text-alert-600" : "text-ink/70")}>
                      {r.signed_in_at ? fmtDayTime(r.signed_in_at) : "—"}
                      {late && <span className="ml-1 text-xs">late</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink/60">{duration}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.signed_out_at && !r.signed_in_at ? "out" : r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-ink/40">
        Showing requests created in the selected window, newest first. “Returned
        late” means signed in after the due-back time. Times are server-recorded.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "calm",
}: {
  label: string;
  value: number;
  tone?: "calm" | "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-card",
        tone === "warn" ? "border-warn bg-warn/10" : "border-ink/10 bg-white",
      )}
    >
      <span className="block text-3xl font-semibold">{value}</span>
      <span className="text-sm text-ink/60">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    out: "bg-warn/20 text-ink",
    returned: "bg-teal/15 text-teal-700",
    denied: "bg-alert-100 text-alert-600",
    cancelled: "bg-ink/10 text-ink/60",
    requested: "bg-ink/10 text-ink/60",
    approved: "bg-mint-100 text-teal-700",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs", map[status] ?? "bg-ink/10 text-ink/60")}>
      {status === "out" ? "out now" : status}
    </span>
  );
}
