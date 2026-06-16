import Link from "next/link";

/**
 * Printed QR cards are intentionally retired: passes now rotate every few
 * seconds on the phone, so a printed (static) code can't be scanned — that's
 * the whole point of the anti-screenshot change. Students without a phone use
 * "tap your name" at the office instead.
 */
export default function RetiredPrintPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-ink/10 bg-white p-8 shadow-card">
      <h1 className="text-2xl font-semibold">Printed QR cards are off</h1>
      <p className="text-ink/70">
        Passes now <strong>rotate every few seconds</strong> on each
        student&apos;s phone, which is what stops a screenshot or photocopy from
        being reused. A printed card is static, so it can no longer be scanned.
      </p>
      <p className="text-ink/70">
        Students <strong>without a phone</strong> sign out and in by tapping
        their name on the office iPad — it&apos;s on the main station screen
        under “No phone? Tap your name”, with room and year shown to tell
        anyone with the same name apart.
      </p>
      <Link
        href="/staff/manage/students"
        className="inline-block rounded-xl bg-teal px-5 py-2.5 font-medium text-ink transition-colors hover:bg-mint"
      >
        ← Back to students
      </Link>
    </div>
  );
}
