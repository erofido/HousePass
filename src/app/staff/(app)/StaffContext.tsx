"use client";

import { createContext, useContext } from "react";
import type { House, Staff } from "@/lib/types";

export interface StaffContextValue {
  staff: Staff;
  /** The houses this user may see: one for house staff, all for leadership. */
  houses: House[];
}

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({
  value,
  children,
}: {
  value: StaffContextValue;
  children: React.ReactNode;
}) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff must be used inside the staff layout");
  return ctx;
}
