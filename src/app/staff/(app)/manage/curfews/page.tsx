"use client";

import { useCallback, useState } from "react";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { useStaff } from "../../StaffContext";

interface Curfew {
  year_group: string;
  back_by: string; // HH:MM
}

/**
 * Per-year-group curfew times. These pre-fill (and softly cap) the "back by"
 * time a student picks when going out, so e.g. Y9 defaults to an earlier
 * return than Y13.
 */
export default function ManageCurfewsPage() {
  const { staff, houses } = useStaff();
  const [houseId, setHouseId] = useState(staff.house_id ?? houses[0]?.id ?? "");
  const [rows, setRows] = useState<Curfew[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/curfews");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't load curfews.");
        return;
      }
      setError(null);
      setRows(
        (data.curfews as { house_id: string; year_group: string; back_by: string }[])
          .filter((c) => c.house_id === houseId)
          .map((c) => ({ year_group: c.year_group, back_by: c.back_by })),
      );
      setLoaded(true);
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }, [houseId]);

  useInitialLoad(load);

  function setRow(i: number, patch: Partial<Curfew>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { year_group: "", back_by: "21:00" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const clean = rows
      .map((r) => ({ yearGroup: r.year_group.trim(), backBy: r.back_by }))
      .filter((r) => r.yearGroup && /^\d{2}:\d{2}$/.test(r.backBy));
    try {
      const res = await fetch("/api/staff/curfews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, curfews: clean }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error?.message ?? "Could not save.");
      else setSavedAt(Date.now());
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Curfews by year group</h1>
        {staff.role === "leadership" && houses.length > 1 && (
          <select
            value={houseId}
            onChange={(e) => {
              setHouseId(e.target.value);
              setLoaded(false);
              setSavedAt(null);
              // reload for the newly selected house
              setTimeout(load, 0);
            }}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
            aria-label="House"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ErrorNotice>{error}</ErrorNotice>

      <div className="space-y-3 rounded-2xl border border-ink/10 bg-white p-5 shadow-card">
        {!loaded ? (
          <p className="py-6 text-center text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-ink/60">
            No curfews set — students will just see the default time choices.
            Add a row per year group.
          </p>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                placeholder="Year group (e.g. Y10)"
                value={r.year_group}
                onChange={(e) => setRow(i, { year_group: e.target.value })}
                className="w-44 rounded-lg border border-ink/15 px-3 py-2"
              />
              <span className="text-ink/50">back by</span>
              <input
                type="time"
                value={r.back_by}
                onChange={(e) => setRow(i, { back_by: e.target.value })}
                className="rounded-lg border border-ink/15 px-3 py-2"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="ml-auto rounded-lg px-2 py-1.5 text-sm text-alert-600 hover:bg-alert-100"
              >
                Remove
              </button>
            </div>
          ))
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5"
          >
            + Add year group
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
          >
            {busy ? <Spinner /> : "Save curfews"}
          </button>
          {savedAt && <span className="text-sm text-teal-700">Saved ✓</span>}
        </div>
      </div>

      <p className="text-xs text-ink/40">
        When a student of a given year goes out, their curfew is pre-selected as
        the “back by” time and they can&apos;t pick a later one. Staff can still
        override at the office. Times are in the school&apos;s local timezone.
      </p>
    </div>
  );
}
