"use client";

import { useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import type { Staff } from "@/lib/types";
import { useStaff } from "../../StaffContext";

/** Leadership only: staff logins. */
export default function ManageStaffPage() {
  const { staff: me, houses } = useStaff();
  const [rows, setRows] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"staff" | "leadership">("staff");
  const [houseId, setHouseId] = useState(houses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("staff")
      .select("id, full_name, email, role, house_id, active")
      .order("full_name");
    if (error) {
      setError("Couldn't load staff.");
      return;
    }
    setRows((data as Staff[]) ?? []);
  }, []);

  useInitialLoad(refetch);

  if (me.role !== "leadership") {
    return (
      <p className="rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink/60 shadow-card">
        Staff accounts are managed by leadership.
      </p>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          role,
          houseId: role === "staff" ? houseId : houseId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create the account.");
      } else {
        setReveal({ email, password: data.tempPassword });
        setEmail("");
        setFullName("");
        refetch();
      }
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
    setBusy(false);
  }

  async function setActive(row: Staff, active: boolean) {
    if (
      !active &&
      !window.confirm(`Deactivate ${row.full_name}? They lose dashboard access immediately.`)
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/staff/staff/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Could not update.");
      }
      refetch();
    } catch {
      setError("Can't reach HousePass — check your connection.");
    }
  }

  const houseName = (id: string | null) =>
    id === null ? "All houses" : (houses.find((h) => h.id === id)?.name ?? "—");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Staff accounts</h1>

      <ErrorNotice>{error}</ErrorNotice>

      {reveal && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal bg-mint-100 px-4 py-3">
          <p>
            Temporary password for <strong>{reveal.email}</strong>:{" "}
            <code className="rounded bg-white px-2 py-0.5 font-semibold">{reveal.password}</code>{" "}
            <span className="text-sm text-ink/60">
              — share it securely; it is not shown again.
            </span>
          </p>
          <button type="button" onClick={() => setReveal(null)} className="text-sm text-ink/60">
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={add}
        className="grid gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-ink/15 px-3 py-2"
        />
        <input
          required
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-lg border border-ink/15 px-3 py-2"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "staff" | "leadership")}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2"
          aria-label="Role"
        >
          <option value="staff">House staff</option>
          <option value="leadership">Leadership</option>
        </select>
        <select
          value={houseId}
          onChange={(e) => setHouseId(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2"
          aria-label="House"
        >
          {role === "leadership" && <option value="">No home house</option>}
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal px-4 py-2 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Create account"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">House</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn("border-b border-ink/5 last:border-0", !r.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-medium">
                    {r.full_name}
                    {r.id === me.id && <span className="ml-2 text-xs text-ink/40">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink/70">{r.email}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        r.role === "leadership"
                          ? "bg-ink text-paper"
                          : "bg-ink/10 text-ink/70",
                      )}
                    >
                      {r.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink/60">{houseName(r.house_id)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.id !== me.id && (
                      <button
                        type="button"
                        onClick={() => setActive(r, !r.active)}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-xs",
                          r.active
                            ? "border border-alert/40 text-alert-600 hover:bg-alert-100"
                            : "border border-teal text-teal-700 hover:bg-mint-100",
                        )}
                      >
                        {r.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
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
