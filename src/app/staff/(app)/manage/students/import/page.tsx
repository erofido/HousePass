"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { useStaff } from "../../../StaffContext";

interface ParsedRow {
  fullName: string;
  room?: string;
  yearGroup?: string;
}

interface CreatedRow {
  fullName: string;
  room: string | null;
  yearGroup: string | null;
  pin: string;
}

/**
 * Parse pasted rows. Accepts comma OR tab separated (paste straight from a
 * spreadsheet): "Full Name, Room, Year". Only the name is required.
 */
function parse(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // skip an obvious header row
    if (/^(full ?name|name)\b/i.test(line) && /room|year/i.test(line)) continue;
    const parts = line.split(/\t|,/).map((p) => p.trim());
    const fullName = parts[0];
    if (!fullName || fullName.length < 2) continue;
    rows.push({
      fullName,
      room: parts[1] || undefined,
      yearGroup: parts[2] || undefined,
    });
  }
  return rows;
}

export default function ImportStudentsPage() {
  const { staff, houses } = useStaff();
  const [text, setText] = useState("");
  const [houseId, setHouseId] = useState(staff.house_id ?? houses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRow[] | null>(null);
  const [failed, setFailed] = useState<{ fullName: string; reason: string }[]>([]);

  const parsed = useMemo(() => parse(text), [text]);

  async function importAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/students/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, students: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Import failed.");
      } else {
        setCreated(data.created);
        setFailed(data.failed ?? []);
      }
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  // ---- results view (printable PIN sheet) --------------------------------
  if (created) {
    const houseName = houses.find((h) => h.id === houseId)?.name ?? "";
    return (
      <div className="space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">Imported {created.length} students</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink-700"
            >
              Print PIN sheet
            </button>
            <Link
              href="/staff/manage/students"
              className="rounded-xl border border-ink/15 px-5 py-2.5 font-medium hover:bg-ink/5"
            >
              Done
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink no-print">
          These PINs are shown <strong>once</strong>. Print this sheet now, hand
          each student their PIN, then keep it secure or shred it.
        </div>

        {failed.length > 0 && (
          <ErrorNotice className="no-print">
            {failed.length} row(s) could not be created (likely duplicates):{" "}
            {failed.map((f) => f.fullName).join(", ")}
          </ErrorNotice>
        )}

        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-card">
          <h2 className="mb-3 font-semibold">{houseName} — student PINs</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Room</th>
                <th className="py-2">Year</th>
                <th className="py-2">PIN</th>
              </tr>
            </thead>
            <tbody>
              {created.map((c, i) => (
                <tr key={i} className="border-b border-ink/5 last:border-0">
                  <td className="py-1.5 font-medium">{c.fullName}</td>
                  <td className="py-1.5">{c.room ?? "—"}</td>
                  <td className="py-1.5">{c.yearGroup ?? "—"}</td>
                  <td className="py-1.5 font-mono text-base tracking-widest">{c.pin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink/40 no-print">
          Print QR pass cards for these students from Manage → Students → Print QR cards.
        </p>
      </div>
    );
  }

  // ---- input + preview ----------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Import students</h1>
        <Link
          href="/staff/manage/students"
          className="text-sm text-ink/60 hover:text-ink"
        >
          ← Back to students
        </Link>
      </div>

      <p className="text-sm text-ink/60">
        Paste one student per line as <code className="rounded bg-ink/5 px-1.5 py-0.5">Name, Room, Year</code>
        {" "}— or copy three columns straight from a spreadsheet. Only the name
        is required. A 4-digit PIN and QR pass are generated for each.
      </p>

      {staff.role === "leadership" && houses.length > 1 && (
        <label className="block text-sm font-medium">
          Add to house
          <select
            value={houseId}
            onChange={(e) => setHouseId(e.target.value)}
            className="mt-1 block rounded-lg border border-ink/15 bg-white px-3 py-2"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"Amelia Brook, 5, Y10\nNoah Patel, 8, Y11\nIsla Chen, 2, Y9"}
        className="w-full rounded-2xl border border-ink/15 bg-white p-4 font-mono text-sm shadow-card"
      />

      <ErrorNotice>{error}</ErrorNotice>

      {parsed.length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <span className="text-sm font-medium">Preview — {parsed.length} students</span>
            <button
              type="button"
              disabled={busy || !houseId}
              onClick={importAll}
              className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-ink hover:bg-mint disabled:opacity-50"
            >
              {busy && <Spinner />} Import {parsed.length}
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Year</th>
              </tr>
            </thead>
            <tbody>
              {parsed.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-t border-ink/5">
                  <td className="px-4 py-1.5 font-medium">{r.fullName}</td>
                  <td className="px-4 py-1.5">{r.room ?? "—"}</td>
                  <td className="px-4 py-1.5">{r.yearGroup ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.length > 50 && (
            <p className="px-4 py-2 text-xs text-ink/40">
              …and {parsed.length - 50} more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
