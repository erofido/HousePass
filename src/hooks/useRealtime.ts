"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Re-run `onChange` whenever rows in the given tables change (RLS decides
 * which changes this user gets). Falls back gracefully: a 20s poll keeps the
 * board honest even if the websocket drops.
 */
export function useRealtimeRefetch(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => cb.current(), 250);
    };

    let channel = supabase.channel(`refetch-${tables.join("-")}`);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        fire,
      );
    }
    channel.subscribe();

    const poll = setInterval(() => cb.current(), 20_000);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
}
