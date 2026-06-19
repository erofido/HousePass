"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import { backByChoicesWithCurfew, fmtTime, timeInputToIso } from "@/lib/time";

interface Loc {
  id: string;
  name: string;
  requires_permission: boolean;
}

export default function RequestOutingPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Loc[] | null>(null);
  const [curfewTime, setCurfewTime] = useState<string | null>(null);
  const [picked, setPicked] = useState<Loc | null>(null);
  const [freeText, setFreeText] = useState("");
  const [useFreeText, setUseFreeText] = useState(false);
  const [selectedIso, setSelectedIso] = useState<string>("");
  const [customTime, setCustomTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useInitialLoad(async () => {
    try {
      const [locRes, meRes] = await Promise.all([
        fetch("/api/student/locations"),
        fetch("/api/student/me"),
      ]);
      const data = await locRes.json();
      if (locRes.ok) setLocations(data.locations);
      else setError(data.error?.message ?? "Couldn't load destinations.");
      if (meRes.ok) {
        const me = await meRes.json();
        setCurfewTime(me.student?.curfewTime ?? null);
      }
    } catch {
      setError("You're offline — try again when connected.");
    }
  });

  const { choices, curfewIso } = useMemo(
    () => backByChoicesWithCurfew(curfewTime),
    [curfewTime],
  );
  const defaultIso = curfewIso ?? choices[1]?.iso ?? choices[0]?.iso;
  const chosenIso = selectedIso && choices.some((c) => c.iso === selectedIso) ? selectedIso : defaultIso;
  const customIso = customTime ? timeInputToIso(customTime) : null;
  const customTooLate = Boolean(customIso && curfewIso && customIso > curfewIso);
  const effectiveIso = customTime ? (customTooLate ? null : customIso) : chosenIso;
  const needsPermission = useFreeText || picked?.requires_permission;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveIso) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: useFreeText ? undefined : picked?.id,
          locationText: useFreeText ? freeText : undefined,
          expectedBackAt: effectiveIso,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't send the request.");
        setBusy(false);
        return;
      }
      router.replace("/student");
    } catch {
      setError("You're offline — the request didn't send. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6 text-paper">
      <header className="flex items-center gap-3">
        <Link
          href="/student"
          aria-label="Back"
          className="rounded-xl bg-ink-800 px-4 py-2.5 text-xl text-paper/70 hover:bg-ink-700"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold">Request an outing</h1>
      </header>

      <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-paper/60">
            Where to?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {locations === null && (
              <p className="col-span-2 py-6 text-center text-paper/40">
                Loading destinations…
              </p>
            )}
            {(locations ?? []).map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setPicked(picked?.id === loc.id ? null : loc);
                  setUseFreeText(false);
                }}
                className={cn(
                  "rounded-2xl px-4 py-3.5 text-left transition-colors",
                  !useFreeText && picked?.id === loc.id
                    ? "bg-mint text-ink"
                    : "bg-ink-800 hover:bg-ink-700",
                )}
              >
                <span className="block font-medium">{loc.name}</span>
                <span
                  className={cn(
                    "text-xs",
                    !useFreeText && picked?.id === loc.id ? "text-ink/60" : "text-paper/40",
                  )}
                >
                  {loc.requires_permission ? "teacher approves" : "self-service"}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setUseFreeText(!useFreeText);
                setPicked(null);
              }}
              className={cn(
                "rounded-2xl px-4 py-3.5 text-left transition-colors",
                useFreeText ? "bg-mint text-ink" : "bg-ink-800 hover:bg-ink-700",
              )}
            >
              <span className="block font-medium">Somewhere else…</span>
              <span className={cn("text-xs", useFreeText ? "text-ink/60" : "text-paper/40")}>
                teacher approves
              </span>
            </button>
          </div>

          {useFreeText && (
            <input
              autoFocus
              required
              placeholder="Where? e.g. Dentist on Mill Lane"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-paper placeholder:text-paper/30"
            />
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-paper/60">Back by</legend>
          <div className="flex flex-wrap items-center gap-2">
            {choices.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => {
                  setSelectedIso(c.iso);
                  setCustomTime("");
                }}
                className={cn(
                  "rounded-xl px-4 py-2.5 transition-colors",
                  !customTime && chosenIso === c.iso
                    ? "bg-mint font-medium text-ink"
                    : "bg-ink-800 hover:bg-ink-700",
                )}
              >
                {c.label}
              </button>
            ))}
            <label className="inline-flex items-center gap-2 text-sm text-paper/50">
              or
              <input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className={cn(
                  "rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-paper",
                  customTime && (customTooLate ? "border-alert" : "border-mint"),
                )}
                aria-label="Custom back-by time"
              />
            </label>
          </div>
          {customTooLate && curfewIso && (
            <p className="mt-2 text-sm text-warn">
              Your year&apos;s curfew is {fmtTime(curfewIso)} — pick that time or earlier.
            </p>
          )}
        </fieldset>

        <label className="block text-sm font-medium text-paper/60">
          Note for staff (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. going with Maya, mum knows"
            className="mt-1.5 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-paper placeholder:text-paper/30"
          />
        </label>

        <ErrorNotice>{error}</ErrorNotice>

        <div className="mt-auto space-y-2 pb-2">
          <button
            type="submit"
            disabled={busy || !effectiveIso || (!picked && !(useFreeText && freeText.trim().length >= 2))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal py-4 text-lg font-semibold text-ink transition-colors hover:bg-mint disabled:opacity-40"
          >
            {busy && <Spinner />}
            {needsPermission ? "Send for approval" : "Save — ready at the office"}
          </button>
          <p className="text-center text-xs text-paper/40">
            {needsPermission
              ? "A teacher will see it on the dashboard straight away."
              : "Self-service — just scan at the office iPad when you leave."}
          </p>
        </div>
      </form>
    </div>
  );
}
