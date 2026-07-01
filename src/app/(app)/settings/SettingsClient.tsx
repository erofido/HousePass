"use client";

import { useState } from "react";
import { useLoad } from "@/hooks/useLoad";
import { PushToggle } from "@/components/PushToggle";
import { cn } from "@/lib/cn";
import { fmtDuration, type VacationRange } from "@/lib/time";
import type { MePayload } from "@/lib/types";

const INTENSITIES = [
  { value: "mild", label: "Mild", desc: "Polite reminders" },
  { value: "firm", label: "Firm", desc: "No-nonsense" },
  { value: "brutal", label: "Brutal", desc: "As requested: pissed off until you study" },
] as const;

export function SettingsClient() {
  const { data: me, error, reload } = useLoad<MePayload>("/api/me");
  if (error) return <p className="text-sm text-danger">Couldn&apos;t load — refresh.</p>;
  if (!me) return <p className="animate-pulse text-sm text-mut">Loading…</p>;
  return <SettingsForm me={me} reload={reload} />;
}

function SettingsForm({ me, reload }: { me: MePayload; reload: () => Promise<void> }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [goal, setGoal] = useState(me.profile.daily_goal_minutes);
  const [intensity, setIntensity] = useState<string>(me.profile.nag_intensity);
  const [parentEmail, setParentEmail] = useState(me.profile.parent_email ?? "");
  const [vacations, setVacations] = useState<VacationRange[]>(me.profile.vacations ?? []);
  const [newVac, setNewVac] = useState({ start: "", end: "", label: "" });

  function show(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 5000);
  }

  async function save(patch: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    show(res.ok ? okMsg : "Save failed — check the values.");
    await reload();
    setBusy(false);
  }

  async function sendTestEmail() {
    setBusy(true);
    const res = await fetch("/api/summary/test", { method: "POST" });
    const r = await res.json().catch(() => null);
    show(
      r?.sent
        ? `Report sent to ${r.recipients.join(", ")} ✉️`
        : r?.reason === "not_configured"
          ? "Email isn't configured yet (RESEND_API_KEY missing)."
          : "Couldn't send — check the email settings.",
    );
    setBusy(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div className="animate-rise sticky top-2 z-10 rounded-xl2 border border-acc/40 bg-acc/10 px-4 py-3 text-sm font-semibold text-acc backdrop-blur">
          {flash}
        </div>
      )}

      {/* Daily goal */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">DAILY GOAL</h2>
        <p className="mt-2 text-2xl font-black tabular-nums">{fmtDuration(goal)}</p>
        <input
          type="range"
          min={60}
          max={360}
          step={15}
          value={goal}
          onChange={(e) => setGoal(Number(e.target.value))}
          className="mt-2 w-full accent-[#a3e635]"
        />
        <p className="text-xs text-mut">The brief said 3–4 hours. 210 min is the honest middle.</p>
        <button
          onClick={() => save({ daily_goal_minutes: goal }, "Goal updated.")}
          disabled={busy || goal === me.profile.daily_goal_minutes}
          className="mt-3 rounded-xl bg-acc px-4 py-2 text-sm font-bold text-bg disabled:opacity-40"
        >
          Save goal
        </button>
      </section>

      {/* Nag intensity */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">NAG INTENSITY</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {INTENSITIES.map((i) => (
            <button
              key={i.value}
              onClick={() => {
                setIntensity(i.value);
                save({ nag_intensity: i.value }, `Nags set to ${i.label.toLowerCase()}.`);
              }}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                intensity === i.value
                  ? "border-acc bg-acc/10"
                  : "border-line hover:border-mut",
              )}
            >
              <p className={cn("text-sm font-bold", intensity === i.value && "text-acc")}>
                {i.label}
              </p>
              <p className="text-[10px] leading-snug text-mut">{i.desc}</p>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <PushToggle />
        </div>
      </section>

      {/* Vacation mode */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">VACATION MODE</h2>
        <p className="mt-1 text-xs text-mut">
          Streak protected, nags silenced, grind-days counter adjusted. For the real
          holiday — not for &quot;I don&apos;t feel like it today&quot;.
        </p>
        <ul className="mt-3 space-y-2">
          {vacations.map((v, i) => (
            <li key={`${v.start}-${i}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
              <span>
                🏖️ {v.start} → {v.end}
                {v.label ? <span className="text-mut"> · {v.label}</span> : null}
              </span>
              <button
                onClick={() => {
                  const next = vacations.filter((_, j) => j !== i);
                  setVacations(next);
                  save({ vacations: next }, "Vacation removed.");
                }}
                className="text-xs text-danger"
              >
                remove
              </button>
            </li>
          ))}
          {vacations.length === 0 && (
            <li className="text-xs text-mut">No vacations planned yet.</li>
          )}
        </ul>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            type="date"
            value={newVac.start}
            onChange={(e) => setNewVac({ ...newVac, start: e.target.value })}
            className="rounded-xl border border-line bg-panel-2 px-2 py-2 text-sm"
          />
          <input
            type="date"
            value={newVac.end}
            onChange={(e) => setNewVac({ ...newVac, end: e.target.value })}
            className="rounded-xl border border-line bg-panel-2 px-2 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={newVac.label}
            onChange={(e) => setNewVac({ ...newVac, label: e.target.value })}
            className="rounded-xl border border-line bg-panel-2 px-2 py-2 text-sm placeholder:text-mut/50"
          />
          <button
            disabled={!newVac.start || !newVac.end || newVac.end < newVac.start || busy}
            onClick={() => {
              const next = [...vacations, { start: newVac.start, end: newVac.end, label: newVac.label || undefined }];
              setVacations(next);
              setNewVac({ start: "", end: "", label: "" });
              save({ vacations: next }, "Vacation added. Earn it first.");
            }}
            className="rounded-xl bg-acc px-3 py-2 text-sm font-bold text-bg disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </section>

      {/* Daily report */}
      <section className="rounded-xl2 border border-line bg-panel p-4">
        <h2 className="text-xs font-bold tracking-widest text-mut">DAILY REPORT TO DAD</h2>
        <p className="mt-1 text-xs text-mut">
          Every evening (~20:30 UK) the day&apos;s numbers go out automatically. No editing,
          no sugar-coating — that&apos;s the point.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            placeholder="dad@example.com"
            className="flex-1 rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm placeholder:text-mut/50"
          />
          <button
            onClick={() => save({ parent_email: parentEmail || null }, "Recipient saved.")}
            disabled={busy}
            className="rounded-xl bg-acc px-4 py-2 text-sm font-bold text-bg disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={sendTestEmail}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-mut hover:text-txt disabled:opacity-40"
          >
            Send today&apos;s report now
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={logout} className="text-xs text-mut underline hover:text-txt">
          Sign out on this device
        </button>
      </div>
    </div>
  );
}
