import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";

/**
 * Data minimisation: delete finished outing history and audit entries older
 * than RETENTION_DAYS (default 30). Open business — anything requested,
 * approved or still out — is never touched. Run daily.
 */
export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const days = Math.max(1, Number(process.env.RETENTION_DAYS) || 30);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = createSupabaseAdminClient();

  const { data: deletedOutings, error: outingsError } = await db
    .from("outings")
    .delete()
    .in("status", ["returned", "denied", "cancelled"])
    .lt("created_at", cutoff)
    .select("id");
  if (outingsError) {
    return NextResponse.json({ error: outingsError.message }, { status: 500 });
  }

  const { data: deletedAudit, error: auditError } = await db
    .from("audit_log")
    .delete()
    .lt("at", cutoff)
    .select("id");
  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  // record the run itself (fresh entry, so it lives another RETENTION_DAYS)
  await db.from("audit_log").insert({
    actor_type: "system",
    actor_id: null,
    action: "system.retention_run",
    entity: "system",
    entity_id: null,
    meta: {
      retention_days: days,
      cutoff,
      outings_deleted: deletedOutings?.length ?? 0,
      audit_deleted: deletedAudit?.length ?? 0,
    },
  });

  return NextResponse.json({
    retentionDays: days,
    cutoff,
    outingsDeleted: deletedOutings?.length ?? 0,
    auditDeleted: deletedAudit?.length ?? 0,
  });
}

export const GET = POST;
