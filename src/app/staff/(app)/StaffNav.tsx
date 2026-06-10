"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "/staff", label: "Live board", exact: true },
  { href: "/staff/approvals", label: "Approvals", exact: false },
  { href: "/staff/headcount", label: "Headcount", exact: false },
  { href: "/staff/manage", label: "Manage", exact: false },
];

export function StaffNav({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex items-center gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-teal text-ink font-medium"
                : "text-paper/70 hover:bg-ink-700 hover:text-paper",
            )}
          >
            {t.label}
          </Link>
        );
      })}
      {role === "leadership" && (
        <span className="sr-only">Leadership: all houses visible</span>
      )}
    </nav>
  );
}
