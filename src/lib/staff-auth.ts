import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import type { Staff } from "@/lib/types";

/**
 * Guard for staff-only API routes (the ones that need the service role for
 * things RLS rightly forbids, like setting PIN hashes). The caller's
 * identity comes from their Supabase session; their staff row is read
 * under their own RLS.
 */
export async function requireStaff(opts?: { leadership?: boolean }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      staff: null,
      response: jsonError(401, "unauthenticated", "Sign in first"),
    } as const;
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, email, role, house_id, active")
    .eq("id", user.id)
    .maybeSingle<Staff>();

  if (!staff || !staff.active) {
    return {
      staff: null,
      response: jsonError(403, "not_staff", "Not registered as staff"),
    } as const;
  }
  if (opts?.leadership && staff.role !== "leadership") {
    return {
      staff: null,
      response: jsonError(403, "leadership_only", "Leadership access required"),
    } as const;
  }
  return { staff, response: null } as const;
}

export function staffCanAccessHouse(staff: Staff, houseId: string): boolean {
  return staff.role === "leadership" || staff.house_id === houseId;
}
