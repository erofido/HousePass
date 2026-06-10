"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/Brand";
import { Spinner } from "@/components/Notice";
import { cn } from "@/lib/cn";
import { backByChoices, fmtTime, timeInputToIso } from "@/lib/time";
import { QrScanner } from "./QrScanner";

/* ----------------------------- data shapes ------------------------------ */

interface KStudent {
  id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  status: "in" | "out";
}

interface KOuting {
  id: string;
  status: string;
  destination: string;
  expectedBackAt: string | null;
  signedOutAt: string | null;
  note: string | null;
}

interface KLocation {
  id: string;
  name: string;
  requires_permission: boolean;
}

interface IdentifyResult {
  student: KStudent;
  openOuting: KOuting | null;
  approvedOutings: KOuting[];
  requestedOutings: KOuting[];
}

type Via = "kiosk_qr" | "kiosk_tap";

type Phase =
  | { name: "idle" }
  | { name: "names" }
  | { name: "student"; r: IdentifyResult; via: Via }
  | { name: "success"; title: string; detail: string; tone: "out" | "in" | "wait" };

const QR_PREFIX = "HP1:";
const IDLE_RESET_MS = 60_000;
const SUCCESS_RESET_MS = 5_000;

async function api<T>(
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        code: data?.error?.code ?? "server_error",
        message: data?.error?.message ?? "Something went wrong — try again.",
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return {
      ok: false,
      code: "offline",
      message: "Can't reach HousePass — check the iPad's connection and try again.",
    };
  }
}

/* ------------------------------- the kiosk ------------------------------- */

export default function StationKiosk() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [houseName, setHouseName] = useState("");
  const [students, setStudents] = useState<KStudent[]>([]);
  const [locations, setLocations] = useState<KLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  /* header clock */
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  /* station identity + reference data */
  const loadReference = useCallback(async () => {
    const me = await api<{ station: { houseName: string } }>("/api/station/me");
    if (me.ok) setHouseName(me.data.station.houseName);
    else if (me.code === "station_unpaired") router.replace("/station/setup");

    const locs = await api<{ locations: KLocation[] }>("/api/station/locations");
    if (locs.ok) setLocations(locs.data.locations);

    const studs = await api<{ students: KStudent[] }>("/api/station/students");
    if (studs.ok) setStudents(studs.data.students);
  }, [router]);

  useEffect(() => {
    loadReference();
    const t = setInterval(loadReference, 5 * 60_000);
    return () => clearInterval(t);
  }, [loadReference]);

  /* inactivity: any non-idle screen falls back to idle */
  const lastTouch = useRef(Date.now());
  const bump = () => (lastTouch.current = Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      if (phase.name === "idle") return;
      const limit = phase.name === "success" ? SUCCESS_RESET_MS : IDLE_RESET_MS;
      if (Date.now() - lastTouch.current > limit) reset();
    }, 1_000);
    return () => clearInterval(t);
  }, [phase.name]);

  function reset() {
    setPhase({ name: "idle" });
    setError(null);
    setBusy(false);
    lastTouch.current = Date.now();
  }

  /* identify by scan or tap */
  async function identify(input: { qrToken?: string; studentId?: string }, via: Via) {
    bump();
    setBusy(true);
    setError(null);
    const res = await api<IdentifyResult>("/api/station/identify", input);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPhase({ name: "student", r: res.data, via });
  }

  const onScan = useCallback(
    (payload: string) => {
      if (!payload.startsWith(QR_PREFIX)) return;
      if (phase.name !== "idle" && phase.name !== "names") return;
      identify({ qrToken: payload.slice(QR_PREFIX.length) }, "kiosk_qr");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase.name],
  );

  /* actions */
  async function doSignIn(student: KStudent, via: Via) {
    bump();
    setBusy(true);
    setError(null);
    const res = await api<{ outing: { signed_in_at: string } }>("/api/station/sign-in", {
      studentId: student.id,
      via,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.code === "no_open_outing") {
        setPhase({
          name: "success",
          tone: "in",
          title: `You're already in, ${firstName(student.full_name)}`,
          detail: "Nothing to do — the door list already shows you here.",
        });
        return;
      }
      setError(res.message);
      return;
    }
    setPhase({
      name: "success",
      tone: "in",
      title: `Welcome back, ${firstName(student.full_name)}`,
      detail: `Signed in at ${fmtTime(res.data.outing.signed_in_at)}`,
    });
  }

  async function doSignOut(student: KStudent, outing: KOuting, via: Via) {
    bump();
    setBusy(true);
    setError(null);
    const res = await api<{ outing: { signed_out_at: string } }>("/api/station/sign-out", {
      outingId: outing.id,
      via,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPhase({
      name: "success",
      tone: "out",
      title: `Off you go, ${firstName(student.full_name)}`,
      detail: `${outing.destination}${outing.expectedBackAt ? ` — back by ${fmtTime(outing.expectedBackAt)}` : ""}`,
    });
  }

  async function doStart(student: KStudent, loc: KLocation, backAtIso: string, via: Via) {
    bump();
    setBusy(true);
    setError(null);
    const res = await api<{ outing: { status: string; signed_out_at: string | null } }>(
      "/api/station/start",
      {
        studentId: student.id,
        locationId: loc.id,
        expectedBackAt: backAtIso,
        via,
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (res.data.outing.status === "out") {
      setPhase({
        name: "success",
        tone: "out",
        title: `Off you go, ${firstName(student.full_name)}`,
        detail: `${loc.name} — back by ${fmtTime(backAtIso)}`,
      });
    } else {
      setPhase({
        name: "success",
        tone: "wait",
        title: "Waiting for a teacher",
        detail: `${loc.name} needs approval — it's now on the staff dashboard. Scan again once it's approved.`,
      });
    }
  }

  /* ------------------------------ rendering ------------------------------ */

  return (
    <div
      className="flex min-h-screen flex-col bg-ink text-paper"
      onPointerDown={bump}
    >
      <header className="flex items-center justify-between px-6 py-4">
        <BrandLockup dark />
        <div className="text-right">
          <div className="font-serif text-lg">{houseName || "Office station"}</div>
          <div className="text-sm text-paper/50" suppressHydrationWarning>
            {clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            {fmtTime(clock)}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-8">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-alert/50 bg-alert/15 px-4 py-3 text-alert"
          >
            {error}
          </div>
        )}

        {phase.name === "idle" && (
          <IdleScreen onScan={onScan} busy={busy} onNames={() => { bump(); setPhase({ name: "names" }); }} />
        )}

        {phase.name === "names" && (
          <NamePicker
            students={students}
            onPick={(s) => identify({ studentId: s.id }, "kiosk_tap")}
            onBack={reset}
            busy={busy}
          />
        )}

        {phase.name === "student" && (
          <StudentScreen
            r={phase.r}
            via={phase.via}
            locations={locations}
            busy={busy}
            onSignIn={() => doSignIn(phase.r.student, phase.via)}
            onSignOut={(o) => doSignOut(phase.r.student, o, phase.via)}
            onStart={(loc, iso) => doStart(phase.r.student, loc, iso, phase.via)}
            onCancel={reset}
            bump={bump}
          />
        )}

        {phase.name === "success" && <SuccessScreen phase={phase} onDone={reset} />}
      </main>
    </div>
  );
}

function firstName(full: string) {
  return full.split(" ")[0] ?? full;
}

/* ------------------------------ idle screen ----------------------------- */

function IdleScreen({
  onScan,
  onNames,
  busy,
}: {
  onScan: (payload: string) => void;
  onNames: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div>
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Going out, or coming back?
        </h1>
        <p className="mt-3 text-lg text-paper/60">
          Hold your pass up to the camera{busy && <Spinner className="ml-2" />}
        </p>
      </div>

      <QrScanner onScan={onScan} paused={busy} className="aspect-[4/3] w-full max-w-md" />

      <button
        type="button"
        onClick={onNames}
        className="rounded-2xl border-2 border-teal px-8 py-4 text-2xl font-medium text-mint transition-colors hover:bg-teal hover:text-ink"
      >
        No phone? Tap your name
      </button>
    </div>
  );
}

/* ------------------------------ name picker ----------------------------- */

function NamePicker({
  students,
  onPick,
  onBack,
  busy,
}: {
  students: KStudent[];
  onPick: (s: KStudent) => void;
  onBack: () => void;
  busy: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <input
          autoFocus
          type="text"
          placeholder="Start typing your name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-2xl border-2 border-ink-600 bg-ink-800 px-5 py-4 text-2xl text-paper placeholder:text-paper/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="rounded-2xl bg-ink-800 px-4 py-5 text-left transition-colors hover:bg-ink-700 disabled:opacity-50"
          >
            <span className="block text-xl font-medium">{s.full_name}</span>
            <span className="mt-1 block text-sm text-paper/50">
              Room {s.room ?? "—"} · {s.year_group ?? ""}
              <span
                className={cn(
                  "ml-2 rounded-full px-2 py-0.5 text-xs",
                  s.status === "out" ? "bg-warn/20 text-warn" : "bg-teal/20 text-mint",
                )}
              >
                {s.status === "out" ? "out" : "in"}
              </span>
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-paper/50">
            Nobody matches “{q}”.
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------- student branching --------------------------- */

function StudentScreen({
  r,
  via,
  locations,
  busy,
  onSignIn,
  onSignOut,
  onStart,
  onCancel,
  bump,
}: {
  r: IdentifyResult;
  via: Via;
  locations: KLocation[];
  busy: boolean;
  onSignIn: () => void;
  onSignOut: (o: KOuting) => void;
  onStart: (loc: KLocation, backAtIso: string) => void;
  onCancel: () => void;
  bump: () => void;
}) {
  const { student } = r;
  const [pickedLoc, setPickedLoc] = useState<KLocation | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton onClick={onCancel} />
        <div>
          <h1 className="text-3xl font-semibold">{student.full_name}</h1>
          <p className="text-paper/50">
            Room {student.room ?? "—"} · {student.year_group ?? ""}
          </p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-4 py-1.5 text-lg",
            student.status === "out" ? "bg-warn/20 text-warn" : "bg-teal/20 text-mint",
          )}
        >
          {student.status === "out" ? "Currently OUT" : "Currently IN"}
        </span>
      </div>

      {/* coming back */}
      {r.openOuting && (
        <div className="rounded-3xl bg-ink-800 p-6">
          <p className="text-lg text-paper/70">
            Out to <strong className="text-paper">{r.openOuting.destination}</strong>
            {r.openOuting.signedOutAt && <> since {fmtTime(r.openOuting.signedOutAt)}</>}
            {r.openOuting.expectedBackAt && <>, due back {fmtTime(r.openOuting.expectedBackAt)}</>}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onSignIn}
            className="mt-4 w-full rounded-2xl bg-teal py-6 text-3xl font-semibold text-ink transition-colors hover:bg-mint disabled:opacity-50"
          >
            {busy ? <Spinner className="size-6" /> : "Sign me back IN"}
          </button>
        </div>
      )}

      {/* ready-to-go approved outings */}
      {!r.openOuting && r.approvedOutings.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl text-paper/70">Ready to go</h2>
          {r.approvedOutings.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              onClick={() => onSignOut(o)}
              className="w-full rounded-2xl bg-teal p-6 text-left text-ink transition-colors hover:bg-mint disabled:opacity-50"
            >
              <span className="block text-2xl font-semibold">
                Sign OUT → {o.destination}
              </span>
              {o.expectedBackAt && (
                <span className="mt-1 block text-lg text-ink/70">
                  back by {fmtTime(o.expectedBackAt)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* pending approval */}
      {!r.openOuting && r.requestedOutings.length > 0 && (
        <div className="space-y-2">
          {r.requestedOutings.map((o) => (
            <div
              key={o.id}
              className="rounded-2xl border border-warn/40 bg-warn/10 px-5 py-4 text-warn"
            >
              <span className="font-medium">{o.destination}</span> — waiting for a
              teacher to approve. A staff member can do this on the dashboard now.
            </div>
          ))}
        </div>
      )}

      {/* pick a destination */}
      {!r.openOuting && (
        <div className="space-y-3">
          <h2 className="text-xl text-paper/70">
            {r.approvedOutings.length || r.requestedOutings.length
              ? "Or somewhere else"
              : "Where are you going?"}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  bump();
                  setPickedLoc(pickedLoc?.id === loc.id ? null : loc);
                }}
                className={cn(
                  "rounded-2xl px-4 py-5 text-left transition-colors disabled:opacity-50",
                  pickedLoc?.id === loc.id
                    ? "bg-mint text-ink"
                    : "bg-ink-800 hover:bg-ink-700",
                )}
              >
                <span className="block text-lg font-medium">{loc.name}</span>
                {loc.requires_permission && (
                  <span
                    className={cn(
                      "mt-1 block text-xs",
                      pickedLoc?.id === loc.id ? "text-ink/60" : "text-warn",
                    )}
                  >
                    needs teacher approval
                  </span>
                )}
              </button>
            ))}
          </div>

          {pickedLoc && (
            <BackByPicker
              key={pickedLoc.id}
              location={pickedLoc}
              busy={busy}
              onConfirm={(iso) => onStart(pickedLoc, iso)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ time picker ------------------------------ */

function BackByPicker({
  location,
  busy,
  onConfirm,
}: {
  location: KLocation;
  busy: boolean;
  onConfirm: (iso: string) => void;
}) {
  const [choices] = useState(() => backByChoices());
  const [selected, setSelected] = useState<string>(choices[1]?.iso ?? choices[0]?.iso);
  const [custom, setCustom] = useState("");

  const effective = custom ? timeInputToIso(custom) : selected;

  return (
    <div className="rounded-3xl bg-ink-800 p-5">
      <p className="mb-3 text-lg text-paper/70">Back by…</p>
      <div className="flex flex-wrap items-center gap-2">
        {choices.map((c) => (
          <button
            key={c.iso}
            type="button"
            onClick={() => {
              setSelected(c.iso);
              setCustom("");
            }}
            className={cn(
              "rounded-xl px-5 py-3 text-lg transition-colors",
              !custom && selected === c.iso
                ? "bg-mint text-ink font-medium"
                : "bg-ink-700 hover:bg-ink-600",
            )}
          >
            {c.label}
          </button>
        ))}
        <label className="ml-1 inline-flex items-center gap-2 text-paper/60">
          or at
          <input
            type="time"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={cn(
              "rounded-xl border border-ink-600 bg-ink-700 px-3 py-2.5 text-lg text-paper",
              custom && "border-mint",
            )}
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy || !effective}
        onClick={() => effective && onConfirm(effective)}
        className="mt-4 w-full rounded-2xl bg-teal py-5 text-2xl font-semibold text-ink transition-colors hover:bg-mint disabled:opacity-50"
      >
        {busy ? (
          <Spinner className="size-6" />
        ) : location.requires_permission ? (
          `Request ${location.name}`
        ) : (
          `Sign OUT to ${location.name}`
        )}
      </button>
      {location.requires_permission && (
        <p className="mt-2 text-center text-sm text-paper/50">
          A teacher needs to approve this one — it goes to the dashboard.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- success screen ---------------------------- */

function SuccessScreen({
  phase,
  onDone,
}: {
  phase: Extract<Phase, { name: "success" }>;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, SUCCESS_RESET_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      <div
        className={cn(
          "flex size-28 items-center justify-center rounded-full text-6xl",
          phase.tone === "wait" ? "bg-warn/20" : "bg-teal/20",
        )}
      >
        {phase.tone === "in" && "👋"}
        {phase.tone === "out" && "✅"}
        {phase.tone === "wait" && "⏳"}
      </div>
      <h1 className="text-5xl font-semibold">{phase.title}</h1>
      <p className="max-w-md text-2xl text-paper/60">{phase.detail}</p>
      <button
        type="button"
        onClick={onDone}
        className="mt-4 rounded-xl px-6 py-3 text-paper/40 hover:text-paper"
      >
        Done
      </button>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to start"
      className="rounded-2xl bg-ink-800 px-5 py-4 text-2xl text-paper/70 transition-colors hover:bg-ink-700"
    >
      ←
    </button>
  );
}
