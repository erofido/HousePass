"use client";

import { useEffect } from "react";

/** Registers the service worker (production only). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* not fatal */
      });
    }
  }, []);
  return null;
}
