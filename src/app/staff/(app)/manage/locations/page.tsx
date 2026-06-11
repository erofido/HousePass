"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRealtimeRefetch } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import type { Location } from "@/lib/types";
import { useStaff } from "../../StaffContext";

/**
 * Destinations. requires_permission is the rule the whole flow hangs on:
 * true = a teacher must approve before the kiosk lets the student out.
 */
export default function ManageLocationsPage() {
  const { staff, houses } = useStaff();
  const [rows, setRows] = useState<Location[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [scope, setScope] = useState<string>(staff.house_id ?? houses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("locations")
      .select("id, house_id, name, requires_permission, active")
      .order("name");
    if (error) {
      setError("Couldn't load destinations.");
      return;
    }
    setError(null);
    setRows((data as Location[]) ?? []);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtimeRefetch(["locations"], refetch);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("locations").insert({
      name,
      requires_permission: needsPermission,
      house_id: scope === "global" ? null : scope,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("locations_house_name")
          ? "A destination with that name already exists."
          : "Could not add the destination.",
      );
      return;
    }
    setName("");
    setNeedsPermission(false);
    refetch();
  }

  async function update(row: Location, patch: Partial<Location>) {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("locations").update(patch).eq("id", row.id);
    if (error) setError("Could not update — global destinations need leadership.");
    refetch();
  }

  const houseName = (id: string | null) =>
    id === null ? "All houses" : (houses.find((h) => h.id === id)?.name ?? "—");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Destinations</h1>

      <ErrorNotice>{error}</ErrorNotice>

      <form
        onSubmit={add}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-card"
      >
        <input
          required
          placeholder="e.g. Swimming Pool"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-ink/15 px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={needsPermission}
            onChange={(e) => setNeedsPermission(e.target.checked)}
            className="size-4 accent-teal"
          />
          needs teacher approval
        </label>
        {staff.role === "leadership" && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
            aria-label="Which house"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
            <option value="global">All houses (global)</option>
          </select>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal px-4 py-2 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Add"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-card">
        {rows === null ? (
          <p className="p-8 text-center text-ink/50">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn("border-b border-ink/5 last:border-0", !r.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{houseName(r.house_id)}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        update(r, { requires_permission: !r.requires_permission })
                      }
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        r.requires_permission
                          ? "bg-warn/25 text-ink hover:bg-warn/40"
                          : "bg-teal/15 text-teal-700 hover:bg-teal/25",
                      )}
                      title="Tap to toggle"
                    >
                      {r.requires_permission ? "needs approval" : "self-service"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => update(r, { active: !r.active })}
                      className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs hover:bg-ink/5"
                    >
                      {r.active ? "Retire" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-ink/40">
        “Self-service” destinations sign out instantly at the iPad. “Needs
        approval” destinations wait for a teacher on the Approvals queue.
        Retired destinations stay attached to old records but can't be picked.
      </p>
    </div>
  );
}
