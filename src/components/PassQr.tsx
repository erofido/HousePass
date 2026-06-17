"use client";

import { RotatingQr } from "@/components/RotatingQr";

/** The student's rotating pass (prefix HP2:<qr_token>:<code>). */
export function PassQr({
  token,
  secret,
  period,
  serverOffsetMs,
}: {
  token: string;
  secret: string;
  period: number;
  serverOffsetMs: number;
}) {
  return (
    <RotatingQr
      prefix="HP2:"
      id={token}
      secret={secret}
      period={period}
      serverOffsetMs={serverOffsetMs}
      size={480}
      className="mx-auto mt-3 w-56 max-w-full"
    />
  );
}
