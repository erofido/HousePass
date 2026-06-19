"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QrScanner } from "@/components/QrScanner";
import { useInitialLoad } from "@/hooks/useRealtime";
import { ErrorNotice, Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import { backByChoicesWithCurfew, fmtTime, timeInputToIso } from "@/lib/time";

/* Sign out / in by scanning the office iPad's rotating code. */

interface Outing {
  id: string;
  status: string;
  destination: string;
  expectedBackAt: string | null;
}
interface Me {
  student: { fullName: string; status: "in" | "out"; curfewTime?: string | null };
  openOuting: Outing | null;
  requests: Outing[];
}
interface Loc {
  id: string;
  name: string;
  requires_permission: boolean;
}

// what the next successful scan should do
type Intent =
  | { kind: "in"; label: string }
  | { kind: "out_approved"; outingId: string; label: string }
  | { kind: "out_location"; locationId: string; expectedBackAt: string; label: string };

export default function GoPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [done, setDone] = useState<{ title: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // destination picker state (going out, no approved outing)
  const [pickedLoc, setPickedLoc] = useState<Loc | null>(null);
  const [selectedIso, setSelectedIso] = useState<string>("");
  const [customTime, setCustomTime] = useState("");

  // back-by choices, capped by the student's year-group curfew
  const { choices, curfewIso } = useMemo(
    () => backByChoicesWithCurfew(me?.student.curfewTime ?? null),
    [me?.student.curfewTime],
  );
  const defaultIso = curfewIso ?? choices[1]?.iso ?? choices[0]?.iso;
  const chosenIso = selectedIso && choices.some((c) => c.iso === selectedIso) ? selectedIso : defaultIso;
  const customIso = customTime ? timeInputToIso(customTime) : null;
  const customTooLate = Boolean(customIso && curfewIso && customIso > curfewIso);

  useInitialLoad(async () => {
    try {
      const [meRes, locRes] = await Promise.all([
        fetch("/api/student/me"),
        fetch("/api/student/locations"),
      ]);
      if (meRes.status === 401) {
        router.replace("/student/login");
        return;
      }
      const meData = await meRes.json();
      if (meRes.ok) setMe(meData as Me);
      const locData = await locRes.json();
      if (locRes.ok) setLocations(locData.locations ?? []);
    } catch {
      setError("You're offline — try again when connected.");
    }
  });

  async function onScan(payload: string) {
    if (!payload.startsWith("HPK:") || !intent || busy) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { station: payload };
    if (intent.kind === "out_approved") body.outingId = intent.outingId;
    if (intent.kind === "out_location") {
      body.locationId = intent.locationId;
      body.expectedBackAt = intent.expectedBackAt;
    }
    try {
      const res = await fetch("/api/student/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        // code_expired just means "try again" — keep the scanner open
        setError(data.error?.message ?? "That didn't work — try again.");
        setBusy(false);
        if (data.error?.code !== "code_expired") setIntent(null);
        return;
      }
      setDone(
        data.action === "signed_in"
          ? { title: "Signed in ✅", detail: "Welcome back — you're marked in." }
          : { title: "Signed out ✅", detail: `${intent.label} — have a good time.` },
      );
    } catch {
      setError("You're offline — the office didn't record that. Try again.");
      setBusy(false);
    }
  }

  const effectiveIso = customTime ? (customTooLate ? null : customIso) : chosenIso;

  /* ---- success ---- */
  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-10 text-center text-paper">
        <div className="flex size-24 items-center justify-center rounded-full bg-teal/20 text-5xl">
          {done.title.startsWith("Signed in") ? "👋" : "✅"}
        </div>
        <h1 className="text-3xl font-semibold">{done.title}</h1>
        <p className="text-paper/60">{done.detail}</p>
        <Link
          href="/student"
          className="mt-2 rounded-xl bg-teal px-6 py-3 font-medium text-ink hover:bg-mint"
        >
          Done
        </Link>
      </div>
    );
  }

  /* ---- scanner (an intent is chosen) ---- */
  if (intent) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-6 text-paper">
        <button
          type="button"
          onClick={() => {
            setIntent(null);
            setError(null);
          }}
          className="self-start text-sm text-paper/60"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold">{intent.label}</h1>
        <p className="text-paper/60">
          Point your camera at the rotating code on the office iPad.
          {busy && <Spinner className="ml-2" />}
        </p>
        <QrScanner onScan={onScan} paused={busy} className="aspect-square w-full" />
        <ErrorNotice>{error}</ErrorNotice>
      </div>
    );
  }

  /* ---- choose what to do ---- */
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6 text-paper">
      <header className="flex items-center gap-3">
        <Link href="/student" aria-label="Back" className="rounded-xl bg-ink-800 px-4 py-2.5 text-xl text-paper/70 hover:bg-ink-700">
          ←
        </Link>
        <h1 className="text-2xl font-semibold">Sign out or in</h1>
      </header>

      <ErrorNotice>{error}</ErrorNotice>

      {!me ? (
        <p className="py-10 text-center text-paper/50">Loading…</p>
      ) : me.student.status === "out" ? (
        <button
          type="button"
          onClick={() => setIntent({ kind: "in", label: "Signing back in" })}
          className="rounded-3xl bg-teal p-8 text-center text-2xl font-semibold text-ink transition-colors hover:bg-mint"
        >
          Scan to sign back IN
        </button>
      ) : (
        <>
          {me.requests.filter((r) => r.status === "approved").length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg text-paper/70">Approved — ready to go</h2>
              {me.requests
                .filter((r) => r.status === "approved")
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() =>
                      setIntent({ kind: "out_approved", outingId: o.id, label: `Leaving for ${o.destination}` })
                    }
                    className="w-full rounded-2xl bg-teal p-5 text-left text-ink transition-colors hover:bg-mint"
                  >
                    <span className="block text-xl font-semibold">Scan to leave → {o.destination}</span>
                    {o.expectedBackAt && (
                      <span className="text-ink/70">back by {fmtTime(o.expectedBackAt)}</span>
                    )}
                  </button>
                ))}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg text-paper/70">Where are you going?</h2>
            <div className="grid grid-cols-2 gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setPickedLoc(pickedLoc?.id === loc.id ? null : loc)}
                  disabled={loc.requires_permission}
                  className={cn(
                    "rounded-2xl px-4 py-3.5 text-left transition-colors",
                    loc.requires_permission
                      ? "cursor-not-allowed bg-ink-800 opacity-50"
                      : pickedLoc?.id === loc.id
                        ? "bg-mint text-ink"
                        : "bg-ink-800 hover:bg-ink-700",
                  )}
                >
                  <span className="block font-medium">{loc.name}</span>
                  <span className={cn("text-xs", pickedLoc?.id === loc.id ? "text-ink/60" : "text-paper/40")}>
                    {loc.requires_permission ? "needs approval — request first" : "self-service"}
                  </span>
                </button>
              ))}
            </div>

            {pickedLoc && (
              <div className="rounded-2xl bg-ink-800 p-4">
                <p className="mb-2 text-paper/70">Back by…</p>
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
                          : "bg-ink-700 hover:bg-ink-600",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    aria-label="Custom back-by time"
                    className={cn(
                      "rounded-xl border border-ink-600 bg-ink-700 px-3 py-2 text-paper",
                      customTime && (customTooLate ? "border-alert" : "border-mint"),
                    )}
                  />
                </div>
                {customTooLate && curfewIso && (
                  <p className="mt-2 text-sm text-warn">
                    Your year&apos;s curfew is {fmtTime(curfewIso)} — pick that time or earlier.
                  </p>
                )}
                <button
                  type="button"
                  disabled={!effectiveIso}
                  onClick={() =>
                    effectiveIso &&
                    setIntent({
                      kind: "out_location",
                      locationId: pickedLoc.id,
                      expectedBackAt: effectiveIso,
                      label: `Leaving for ${pickedLoc.name}`,
                    })
                  }
                  className="mt-3 w-full rounded-2xl bg-teal py-4 text-xl font-semibold text-ink transition-colors hover:bg-mint disabled:opacity-50"
                >
                  Continue to scan
                </button>
              </div>
            )}

            <Link
              href="/student/request"
              className="block rounded-2xl border border-paper/15 px-4 py-3 text-center text-sm text-paper/70 hover:bg-ink-800"
            >
              Going somewhere that needs approval? Request it first →
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
