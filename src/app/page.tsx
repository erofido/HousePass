import Link from "next/link";

const surfaces = [
  {
    href: "/student",
    title: "Student app",
    description: "Check your status, show your pass and request an outing.",
    cta: "Open student app",
  },
  {
    href: "/staff",
    title: "Staff dashboard",
    description: "Live board, approvals, emergency headcount and admin.",
    cta: "Open dashboard",
  },
  {
    href: "/station",
    title: "Office station",
    description: "The house iPad where signing out and back in happens.",
    cta: "Open station",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-ink text-paper">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-12 px-6 py-16">
        <header className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-mint/30 px-3 py-1 text-sm text-mint">
            <span className="size-2 rounded-full bg-teal" aria-hidden />
            Boarding house sign-out, made live
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            HousePass
          </h1>
          <p className="max-w-xl text-lg leading-8 text-paper/70">
            One scan at the office instead of a queue at the paper sheet. Staff
            see who is out, where, and who is due back — the moment it happens.
          </p>
        </header>

        <section
          aria-label="Choose a surface"
          className="grid gap-4 sm:grid-cols-3"
        >
          {surfaces.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-2 rounded-2xl border border-ink-600 bg-ink-800 p-5 transition-colors hover:border-teal"
            >
              <h2 className="text-xl font-semibold text-paper">{s.title}</h2>
              <p className="flex-1 text-sm leading-6 text-paper/60">
                {s.description}
              </p>
              <span className="text-sm font-medium text-teal group-hover:text-mint">
                {s.cta} →
              </span>
            </Link>
          ))}
        </section>

        <footer className="text-sm text-paper/40">
          Pilot build — one house, architected for many.
        </footer>
      </main>
    </div>
  );
}
