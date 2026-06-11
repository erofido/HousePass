"use client";

import { cn } from "@/lib/cn";
import type { House } from "@/lib/types";

/** Leadership sees a house switcher; house staff just see their house name. */
export function HouseFilter({
  houses,
  value,
  onChange,
}: {
  houses: House[];
  value: string | "all";
  onChange: (v: string | "all") => void;
}) {
  if (houses.length <= 1) {
    return houses[0] ? (
      <span className="font-serif text-lg text-ink/70">{houses[0].name}</span>
    ) : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="House filter">
      <FilterChip active={value === "all"} onClick={() => onChange("all")}>
        All houses
      </FilterChip>
      {houses.map((h) => (
        <FilterChip key={h.id} active={value === h.id} onClick={() => onChange(h.id)}>
          {h.name}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-ink text-paper"
          : "bg-ink/5 text-ink/70 hover:bg-ink/10",
      )}
    >
      {children}
    </button>
  );
}
