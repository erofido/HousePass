import { BrandLockup } from "@/components/Brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-ink px-6 text-center text-paper">
      <BrandLockup dark />
      <h1 className="text-3xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-paper/60">
        HousePass needs a connection to record sign-outs — nothing is saved
        silently in the background. Reconnect and try again; if the house
        Wi-Fi is down, the office falls back to the paper sheet.
      </p>
      <a
        href="/student"
        className="rounded-xl bg-teal px-5 py-2.5 font-medium text-ink transition-colors hover:bg-mint"
      >
        Try again
      </a>
    </div>
  );
}
