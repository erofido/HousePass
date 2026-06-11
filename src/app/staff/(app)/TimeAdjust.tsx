"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { friendlyDbMessage } from "@/lib/db-errors";
import { fmtTime, timeInputToIso } from "@/lib/time";

/** Inline due-back adjuster used on the live board and approvals queue. */
export function TimeAdjustButton({
  outingId,
  current,
  onDone,
  onError,
}: {
  outingId: string;
  current: string | null;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const iso = timeInputToIso(value);
    if (!iso) return;
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("api_update_expected_back", {
      p_outing_id: outingId,
      p_expected_back_at: iso,
    });
    setBusy(false);
    if (error) {
      onError(friendlyDbMessage(error));
      return;
    }
    setOpen(false);
    setValue("");
    onDone();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-ink/70 transition-colors hover:bg-ink/5"
        title={current ? `Due back ${fmtTime(current)} — change` : "Set due-back time"}
      >
        Adjust time
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="time"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-ink/20 px-2 py-1 text-xs"
        aria-label="New due-back time"
      />
      <button
        type="button"
        disabled={busy || !timeInputToIso(value)}
        onClick={save}
        className="rounded-lg bg-ink px-2.5 py-1.5 text-xs text-paper disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-2 py-1.5 text-xs text-ink/50"
      >
        ✕
      </button>
    </span>
  );
}
