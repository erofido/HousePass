import { cn } from "@/lib/cn";

export function ErrorNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-lg border border-alert/40 bg-alert-100 px-3 py-2 text-sm text-alert-600",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle",
        className,
      )}
    />
  );
}
