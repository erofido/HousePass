"use client";

import { useCallback, useState } from "react";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { useStaff } from "../../StaffContext";

interface HouseRow {
  id: string;
  name: string;
  created_at: string;
  studentCount: number;
}

/** Leadership only: add and rename boarding houses. */
export default function ManageHousesPage() {
  const { staff } = useStaff();
  const [rows, setRows] = useState<HouseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/houses");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't load houses.");
        return;
      }
      setError(null);
      setRows(data.houses);
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }, []);

  useInitialLoad(refetch);

  if (staff.role !== "leadership") {
    return (
      <p className="rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink/60 shadow-card">
        Boarding houses are managed by leadership.
      </p>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/houses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error?.message ?? "Could not create the house.");
      else {
        setName("");
        refetch();
      }
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  async function rename(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/staff/houses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not rename.");
        return;
      }
      setEditing(null);
      refetch();
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Boarding houses</h1>

      <ErrorNotice>{error}</ErrorNotice>

      <form
        onSubmit={add}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card"
      >
        <input
          required
          placeholder="New house name, e.g. Kestrel House"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-56 flex-1 rounded-lg border border-ink/15 px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal px-4 py-2 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Add house"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-ink/50">No houses yet — add your first above.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">House</th>
                <th className="px-4 py-3">Active students</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {editing === r.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded-lg border border-ink/20 px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => rename(r.id)}
                          className="rounded-lg bg-ink px-2.5 py-1.5 text-xs text-paper"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg px-2 py-1.5 text-xs text-ink/50"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink/60">{r.studentCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    {editing !== r.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(r.id);
                          setEditName(r.name);
                        }}
                        className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs hover:bg-ink/5"
                      >
                        Rename
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-ink/40">
        After adding a house, set it up under Students, Destinations, Staff and
        Office station — each has a house selector for leadership. Houses
        aren&apos;t deleted (old records reference them); rename instead if a
        house closes.
      </p>
    </div>
  );
}
