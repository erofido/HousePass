"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { BrandMark } from "@/components/Brand";
import { ErrorNotice } from "@/components/Notice";
import { useStaff } from "../../../StaffContext";
import { HouseFilter } from "../../../HouseFilter";

interface CardRow {
  id: string;
  house_id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  qr_token: string;
}

/**
 * Printable personal QR pass cards (e.g. for students without phones, or to
 * stick inside a planner). Payload matches what the kiosk scanner expects.
 */
export default function PrintQrCardsPage() {
  const { staff, houses } = useStaff();
  const [houseFilter, setHouseFilter] = useState<string | "all">(
    staff.role === "leadership" ? "all" : (staff.house_id ?? "all"),
  );
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("students")
        .select("id, house_id, full_name, room, year_group, qr_token")
        .eq("active", true)
        .order("full_name");
      if (error) {
        setError("Couldn't load students.");
        return;
      }
      setRows((data as CardRow[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!rows) return;
    (async () => {
      const out: Record<string, string> = {};
      for (const r of rows) {
        out[r.id] = await QRCode.toDataURL(`HP1:${r.qr_token}`, {
          width: 360,
          margin: 1,
          color: { dark: "#0c1422", light: "#ffffff" },
        });
      }
      setImages(out);
    })();
  }, [rows]);

  const houseName = (id: string) => houses.find((h) => h.id === id)?.name ?? "";
  const visible = (rows ?? []).filter(
    (r) => houseFilter === "all" || r.house_id === houseFilter,
  );

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">QR pass cards</h1>
        <div className="flex items-center gap-3">
          <HouseFilter houses={houses} value={houseFilter} onChange={setHouseFilter} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-ink px-5 py-2.5 font-medium text-paper transition-colors hover:bg-ink-700"
          >
            Print
          </button>
        </div>
      </div>

      <ErrorNotice className="no-print">{error}</ErrorNotice>

      <p className="no-print text-sm text-ink/60">
        Cut along the card edges. If a card is lost, use “New QR” on the
        student — the old card stops working immediately.
      </p>

      {rows === null ? (
        <p className="p-8 text-center text-ink/50">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {visible.map((r) => (
            <div
              key={r.id}
              className="break-inside-avoid rounded-2xl border-2 border-ink/20 bg-white p-4 text-center"
            >
              <div className="mb-2 flex items-center justify-center gap-2">
                <BrandMark className="size-5" />
                <span className="font-serif text-sm font-semibold">HousePass</span>
              </div>
              {images[r.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[r.id]}
                  alt={`QR pass for ${r.full_name}`}
                  className="mx-auto w-full max-w-44"
                />
              ) : (
                <div className="mx-auto aspect-square w-full max-w-44 animate-pulse rounded bg-ink/5" />
              )}
              <p className="mt-2 font-semibold">{r.full_name}</p>
              <p className="text-sm text-ink/60">
                {houseName(r.house_id)} · Rm {r.room ?? "—"} · {r.year_group ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
