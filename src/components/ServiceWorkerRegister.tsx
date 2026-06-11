"use client";

import { useEffect } from "react";

/** Registers the offline-shell service worker (production only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* not fatal: the app just won't have the offline shell */
      });
    }
  }, []);
  return null;
}
