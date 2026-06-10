import { cn } from "@/lib/cn";

/** HousePass mark: a doorway with the pass dot stepping out. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="HousePass logo"
      className={cn("size-9", className)}
    >
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#16b6a6" />
      <path
        d="M16 36V20a8 8 0 0 1 16 0v16"
        fill="none"
        stroke="#0c1422"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="30" r="3.5" fill="#fbfcfe" />
    </svg>
  );
}

export function BrandLockup({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className="size-8" />
      <span
        className={cn(
          "font-serif text-xl font-semibold tracking-tight",
          dark ? "text-paper" : "text-ink",
        )}
      >
        HousePass
      </span>
    </span>
  );
}
