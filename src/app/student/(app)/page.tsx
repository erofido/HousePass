"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/Brand";
import { PassQr } from "@/components/PassQr";
import { PushToggle } from "@/components/PushToggle";
import { useInitialLoad } from "@/hooks/useRealtime";
import { cn } from "@/lib/cn";
import { fmtDayTime, fmtTime, isOverdue } from "@/lib/time";

interface MeOuting {
  id: string;
  status: string;
  destination: string;
  expectedBackAt: string | null;
  signedOutAt: string | null;
  requestedAt: string;
  note: string | null;
}

interface Me {
  student: {
    id: string;
    fullName: string;
    room: string | null;
    yearGroup: string | null;
    status: "in" | "out";
    houseName: string;
  };
  qr: { token: string; secret: string; period: number };
  serverTime: number;
  openOuting: MeOuting | null;
  requests: MeOuting[];
}

export default function StudentHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  // device→server clock offset, fixed on first load so a wrong device clock
  // never desyncs the rotating pass
  const [offset, setOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/student/me");
      if (res.status === 401) {
        router.replace("/student/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Couldn't refresh — pull to retry.");
        return;
      }
      setError(null);
      setMe(data as Me);
      setOffset((prev) => (prev === null ? data.serverTime - Date.now() : prev));
    } catch {
      setError("You're offline — showing the last known status.");
    }
  }, [router]);

  useInitialLoad(refetch);

  // keep status fresh: poll + refetch when the app comes back to foreground
  useEffect(() => {
    const t = setInterval(refetch, 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  async function cancel(outingId: string) {
    setCancelBusy(outingId);
    try {
      await fetch("/api/student/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outingId }),
      });
    } catch {
      /* refetch shows the truth either way */
    }
    setCancelBusy(null);
    refetch();
  }

  async function signOutApp() {
    await fetch("/api/student/logout", { method: "POST" }).catch(() => {});
    router.replace("/student/login");
  }

  const out = me?.student.status === "out" && me.openOuting;
  const late = out && me.openOuting ? isOverdue(me.openOuting.expectedBackAt) : false;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6 text-paper">
      <header className="flex items-center justify-between">
        <BrandLockup dark />
        <button
          type="button"
          onClick={signOutApp}
          className="text-sm text-paper/50 hover:text-paper"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {error}
        </p>
      )}

      {!me ? (
        <div className="flex flex-1 items-center justify-center text-paper/50">
          Loading your pass…
        </div>
      ) : (
        <>
          {/* status card */}
          <section
            aria-live="polite"
            className={cn(
              "rounded-3xl p-6",
              out ? (late ? "bg-alert text-white" : "bg-warn text-ink") : "bg-teal text-ink",
            )}
          >
            <p className="text-sm font-medium uppercase tracking-wider opacity-70">
              {me.student.houseName} · Room {me.student.room ?? "—"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              {out ? "You're OUT" : "You're IN"}
            </h1>
            {out && me.openOuting ? (
              <p className="mt-2 text-lg leading-7">
                {me.openOuting.destination}
                {me.openOuting.signedOutAt && <> since {fmtTime(me.openOuting.signedOutAt)}</>}
                {me.openOuting.expectedBackAt && (
                  <>
                    , back by <strong>{fmtTime(me.openOuting.expectedBackAt)}</strong>
                  </>
                )}
                {late && (
                  <span className="mt-1 block font-semibold">
                    You&apos;re late — head back and sign in at the office.
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-2 opacity-80">
                Hi {me.student.fullName.split(" ")[0]} — scan at the office iPad
                when you head out.
              </p>
            )}
          </section>

          {/* personal QR */}
          <section className="rounded-3xl bg-paper p-6 text-center text-ink">
            <h2 className="text-lg font-semibold">Your pass</h2>
            <p className="text-sm text-ink/60">
              Show this to the office iPad to sign {out ? "back in" : "out"}.
            </p>
            {offset !== null ? (
              <PassQr
                token={me.qr.token}
                secret={me.qr.secret}
                period={me.qr.period}
                serverOffsetMs={offset}
              />
            ) : (
              <div className="mx-auto mt-3 aspect-square w-56 animate-pulse rounded-xl bg-ink/5" />
            )}
            <p className="mt-2 text-xs text-ink/40">{me.student.fullName}</p>
          </section>

          {/* notifications */}
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink-800 px-4 py-3">
            <div>
              <p className="font-medium">Reminders</p>
              <p className="text-sm text-paper/50">
                Get a nudge before you&apos;re due back, and if you run late.
              </p>
            </div>
            <PushToggle tone="dark" />
          </section>

          {/* requests */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Planned outings</h2>
              <Link
                href="/student/request"
                className="rounded-xl bg-teal px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mint"
              >
                + Request an outing
              </Link>
            </div>

            {me.requests.length === 0 ? (
              <p className="rounded-2xl bg-ink-800 px-4 py-5 text-sm text-paper/50">
                Nothing planned. Request ahead for places like Town so a
                teacher can approve before you&apos;re at the office.
              </p>
            ) : (
              <ul className="space-y-2">
                {me.requests.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-ink-800 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{r.destination}</p>
                        <p className="text-sm text-paper/50">
                          {r.expectedBackAt && <>back by {fmtDayTime(r.expectedBackAt)} · </>}
                          {r.status === "approved" ? (
                            <span className="text-mint">
                              approved — scan at the office to go
                            </span>
                          ) : (
                            <span className="text-warn">waiting for a teacher</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={cancelBusy === r.id}
                        onClick={() => cancel(r.id)}
                        className="rounded-lg border border-paper/15 px-3 py-1.5 text-xs text-paper/60 hover:bg-ink-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-auto pt-4 text-center text-xs text-paper/30">
            Times are recorded at the office — signing out happens there, not
            in the app.
          </p>
        </>
      )}
    </div>
  );
}
