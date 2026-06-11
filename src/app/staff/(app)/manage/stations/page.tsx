"use client";

import { useCallback, useState } from "react";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { fmtDayTime } from "@/lib/time";
import { useStaff } from "../../StaffContext";

interface StationRow {
  id: string;
  house_id: string;
  name: string;
  active: boolean;
  last_seen_at: string | null;
  houses: { name: string } | null;
}

export default function ManageStationsPage() {
  const { staff, houses } = useStaff();
  const [rows, setRows] = useState<StationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ name: string; token: string } | null>(null);
  const [name, setName] = useState("");
  const [houseId, setHouseId] = useState(staff.house_id ?? houses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/stations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't load stations.");
        return;
      }
      setError(null);
      setRows(data.stations);
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }, []);

  useInitialLoad(refetch);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, name }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error?.message ?? "Could not create the station.");
      else {
        setReveal({ name, token: data.token });
        setName("");
        refetch();
      }
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  async function rotate(row: StationRow) {
    if (
      !window.confirm(
        `Rotate the token for “${row.name}”? Anyone re-pairing the iPad will need the new token.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/staff/stations/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error?.message ?? "Could not rotate the token.");
      else setReveal({ name: row.name, token: data.token });
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Office stations</h1>

      <ErrorNotice>{error}</ErrorNotice>

      {reveal && (
        <div className="rounded-2xl border border-teal bg-mint-100 px-4 py-3">
          <p className="font-medium">Pairing token for “{reveal.name}”</p>
          <code className="mt-1 block break-all rounded bg-white px-3 py-2 text-sm">
            {reveal.token}
          </code>
          <p className="mt-2 text-sm text-ink/60">
            On the iPad open <strong>/station/setup</strong> and paste this
            token. It is not shown again — rotate to get a fresh one.
          </p>
          <button
            type="button"
            onClick={() => setReveal(null)}
            className="mt-2 text-sm text-ink/60 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={create}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card"
      >
        <input
          required
          placeholder="e.g. Heron office iPad"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-56 flex-1 rounded-lg border border-ink/15 px-3 py-2"
        />
        {staff.role === "leadership" && houses.length > 1 && (
          <select
            value={houseId}
            onChange={(e) => setHouseId(e.target.value)}
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal px-4 py-2 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Add station"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-ink/50">
            No stations yet — add one and pair the house iPad.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Station</th>
                <th className="px-4 py-3">House</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{r.houses?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink/60">
                    {r.last_seen_at ? fmtDayTime(r.last_seen_at) : "never"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => rotate(r)}
                      className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs hover:bg-ink/5"
                    >
                      Rotate token
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-ink/40">
        The station session lives on the device, not in a student account —
        that&apos;s what makes office timestamps trustworthy. Rotate the token if
        an iPad goes missing.
      </p>
    </div>
  );
}
