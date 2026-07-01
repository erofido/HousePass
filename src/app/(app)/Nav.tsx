"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Today", icon: "⚡" },
  { href: "/plan", label: "Plan", icon: "🗺️" },
  { href: "/stats", label: "Stats", icon: "📈" },
  { href: "/arcade", label: "Arcade", icon: "🎮" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {/* Top brand row (desktop shows tabs inline). */}
      <header className="mb-5 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-black tracking-tight">LOCK&nbsp;IN</span>
          <span className="text-[10px] font-bold tracking-[0.3em] text-acc">
            31→42
          </span>
        </Link>
        <nav className="hidden gap-1 sm:flex">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === t.href
                  ? "bg-panel-2 text-acc"
                  : "text-mut hover:text-txt",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Bottom tab bar on phones. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-3xl">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                pathname === t.href ? "text-acc" : "text-mut",
              )}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
