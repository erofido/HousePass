import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STUDENT_COOKIE } from "@/lib/session";

export async function POST() {
  const store = await cookies();
  store.delete(STUDENT_COOKIE);
  return NextResponse.json({ ok: true });
}
