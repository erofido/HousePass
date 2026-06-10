import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/Brand";
import type { House, Staff } from "@/lib/types";
import { StaffProvider } from "./StaffContext";
import { SignOutButton } from "./SignOutButton";
import { StaffNav } from "./StaffNav";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login");

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, email, role, house_id, active")
    .eq("id", user.id)
    .maybeSingle<Staff>();

  if (!staff || !staff.active) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-ink px-6 text-center text-paper">
        <BrandLockup dark />
        <h1 className="text-2xl font-semibold">No staff access</h1>
        <p className="max-w-sm text-paper/60">
          This account is signed in but isn&apos;t registered as HousePass
          staff. Ask leadership to add you, then sign in again.
        </p>
        <SignOutButton />
      </div>
    );
  }

  // RLS scopes this automatically: one house for staff, all for leadership.
  const { data: houses } = await supabase
    .from("houses")
    .select("id, name")
    .order("name")
    .returns<House[]>();

  return (
    <StaffProvider value={{ staff, houses: houses ?? [] }}>
      <div className="flex min-h-screen flex-1 flex-col bg-paper">
        <header className="no-print sticky top-0 z-20 border-b border-ink/30 bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/staff" className="shrink-0">
              <BrandLockup dark />
            </Link>
            <StaffNav role={staff.role} />
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm text-paper/70 sm:block">
                {staff.full_name}
                {staff.role === "leadership" && (
                  <span className="ml-2 rounded-full bg-teal/20 px-2 py-0.5 text-xs text-mint">
                    Leadership
                  </span>
                )}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </StaffProvider>
  );
}
