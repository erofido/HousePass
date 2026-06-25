import Link from "next/link";
import { BrandMark } from "@/components/Brand";

const surfaces = [
  {
    href: "/student",
    title: "Student app",
    description: "Check your status, show your live pass and request an outing.",
    cta: "Open student app",
    glyph: "📱",
  },
  {
    href: "/staff",
    title: "Staff dashboard",
    description: "Live board, approvals, emergency headcount and admin.",
    cta: "Open dashboard",
    glyph: "📋",
  },
  {
    href: "/station",
    title: "Office station",
    description: "The house iPad where signing out and back in happens.",
    cta: "Open station",
    glyph: "🛂",
  },
];

const points = [
  "Server-set timestamps — trustworthy, never editable",
  "Live whereabouts with automatic late alerts",
  "House-scoped data, secured end to end",
];

export default function Home() {
  return (
    <div className="surface-ink flex flex-1 flex-col text-paper">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="inline-flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="font-serif text-xl font-semibold tracking-tight">HousePass</span>
        </span>
        <Link
          href="/staff"
          className="rounded-full border border-paper/15 px-4 py-1.5 text-sm text-paper/80 transition-colors hover:border-mint/40 hover:text-paper"
        >
          Staff sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-14 px-6 py-12">
        <section className="max-w-2xl animate-rise space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/5 px-3 py-1 text-sm text-mint">
            <span className="size-2 rounded-full bg-teal" aria-hidden />
            Boarding-house sign-out, made live
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            One scan at the office,
            <br />
            <span className="text-mint">not a queue at the paper sheet.</span>
          </h1>
          <p className="max-w-xl text-lg leading-8 text-paper/65">
            HousePass replaces the boarding-house sign-out sheet. Staff see who
            is out, where, and who is due back — the moment it happens.
          </p>
          <ul className="grid gap-2 pt-2 text-sm text-paper/70 sm:grid-cols-1">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-teal" fill="currentColor" aria-hidden>
                  <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Choose a surface" className="grid gap-4 sm:grid-cols-3">
          {surfaces.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-3 rounded-2xl border border-ink-600/70 bg-ink-800/70 p-5 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-teal hover:bg-ink-700/70"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-ink-700 text-xl transition-colors group-hover:bg-teal/15">
                {s.glyph}
              </span>
              <h2 className="text-lg font-semibold text-paper">{s.title}</h2>
              <p className="flex-1 text-sm leading-6 text-paper/55">{s.description}</p>
              <span className="text-sm font-medium text-teal transition-colors group-hover:text-mint">
                {s.cta} →
              </span>
            </Link>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-paper/35">
        HousePass — pilot for one house, architected for many.
      </footer>
    </div>
  );
}
