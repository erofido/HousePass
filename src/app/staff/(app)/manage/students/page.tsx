"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useInitialLoad, useRealtimeRefetch } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import { useStaff } from "../../StaffContext";
import { HouseFilter } from "../../HouseFilter";

interface Row {
  id: string;
  house_id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  status: "in" | "out";
  active: boolean;
}

export default function ManageStudentsPage() {
  const { staff, houses } = useStaff();
  const defaultHouse = staff.house_id ?? houses[0]?.id ?? "";
  const [houseFilter, setHouseFilter] = useState<string | "all">(
    staff.role === "leadership" ? "all" : defaultHouse,
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ name: string; pin: string } | null>(null);

  // add form
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [room, setRoom] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [addHouse, setAddHouse] = useState(defaultHouse);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("students")
      .select("id, house_id, full_name, room, year_group, status, active")
      .order("full_name");
    if (error) {
      setError("Couldn't load students.");
      return;
    }
    setError(null);
    setRows((data as Row[]) ?? []);
  }, []);

  useInitialLoad(refetch);
  useRealtimeRefetch(["students"], refetch);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId: addHouse,
          fullName,
          room: room || undefined,
          yearGroup: yearGroup || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create the student.");
      } else {
        setReveal({ name: fullName, pin: data.pin });
        setFullName("");
        setRoom("");
        setYearGroup("");
        setAdding(false);
        refetch();
      }
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  async function action(row: Row, body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    try {
      const res = await fetch(`/api/staff/students/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Action failed.");
        return;
      }
      if (data.pin) setReveal({ name: row.full_name, pin: data.pin });
      refetch();
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }

  const visible = (rows ?? []).filter(
    (r) => houseFilter === "all" || r.house_id === houseFilter,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Students</h1>
        <div className="flex items-center gap-3">
          <HouseFilter houses={houses} value={houseFilter} onChange={setHouseFilter} />
          <Link
            href="/staff/manage/students/import"
            className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-ink/5"
          >
            Import
          </Link>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-xl bg-teal px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mint"
          >
            {adding ? "Close" : "Add student"}
          </button>
        </div>
      </div>

      <ErrorNotice>{error}</ErrorNotice>

      {reveal && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal bg-mint-100 px-4 py-3">
          <p>
            PIN for <strong>{reveal.name}</strong>:{" "}
            <code className="rounded bg-white px-2 py-0.5 text-lg font-semibold tracking-widest">
              {reveal.pin}
            </code>{" "}
            <span className="text-sm text-ink/60">
              — note it down now, it is not shown again.
            </span>
          </p>
          <button type="button" onClick={() => setReveal(null)} className="text-sm text-ink/60">
            Dismiss
          </button>
        </div>
      )}

      {adding && (
        <form
          onSubmit={addStudent}
          className="grid gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card sm:grid-cols-5"
        >
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
          />
          <input
            placeholder="Room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="rounded-lg border border-ink/15 px-3 py-2"
          />
          <input
            placeholder="Year (e.g. Y10)"
            value={yearGroup}
            onChange={(e) => setYearGroup(e.target.value)}
            className="rounded-lg border border-ink/15 px-3 py-2"
          />
          {staff.role === "leadership" && houses.length > 1 ? (
            <select
              value={addHouse}
              onChange={(e) => setAddHouse(e.target.value)}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2"
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-ink px-4 py-2 font-medium text-paper disabled:opacity-50 sm:col-span-5 sm:justify-self-start"
          >
            {busy ? <Spinner /> : "Create (PIN is generated)"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className={cn("border-b border-ink/5 last:border-0", !r.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-medium">{r.full_name}</td>
                  <td className="px-4 py-2.5">{r.room ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.year_group ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {!r.active ? (
                      <span className="text-ink/50">inactive</span>
                    ) : r.status === "out" ? (
                      <span className="rounded-full bg-warn/20 px-2 py-0.5 text-xs">out</span>
                    ) : (
                      <span className="rounded-full bg-teal/15 px-2 py-0.5 text-xs text-teal-700">in</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          action(
                            r,
                            { action: "reset_pin" },
                            `Reset ${r.full_name}'s PIN? The old one stops working immediately.`,
                          )
                        }
                        className="rounded-lg border border-ink/15 px-2.5 py-1.5 hover:bg-ink/5"
                      >
                        Reset PIN
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          action(
                            r,
                            { action: "regenerate_qr" },
                            `Give ${r.full_name} a new QR pass? The old printed card stops working.`,
                          )
                        }
                        className="rounded-lg border border-ink/15 px-2.5 py-1.5 hover:bg-ink/5"
                      >
                        New QR
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          action(
                            r,
                            { action: "set_active", active: !r.active },
                            r.active
                              ? `Deactivate ${r.full_name}? They will disappear from the kiosk and headcount.`
                              : undefined,
                          )
                        }
                        className={cn(
                          "rounded-lg px-2.5 py-1.5",
                          r.active
                            ? "border border-alert/40 text-alert-600 hover:bg-alert-100"
                            : "border border-teal text-teal-700 hover:bg-mint-100",
                        )}
                      >
                        {r.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
