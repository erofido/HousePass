"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { cn } from "@/lib/cn";

/**
 * Continuous camera QR scanner (jsQR over a canvas loop — works in mobile
 * Safari/Chrome, no native BarcodeDetector needed). Repeats of the same
 * payload within a few seconds are suppressed. Defaults to the rear camera
 * (a phone scanning the office screen); flip button switches.
 */
export function QrScanner({
  onScan,
  paused,
  className,
  defaultFacing = "environment",
}: {
  onScan: (payload: string) => void;
  paused: boolean;
  className?: string;
  defaultFacing?: "user" | "environment";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onScanRef.current = onScan;
    pausedRef.current = paused;
  });

  const [facing, setFacing] = useState<"user" | "environment">(defaultFacing);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let lastPayload = "";
    let lastAt = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setError(null);

        timer = setInterval(() => {
          if (pausedRef.current || !ctx || video.readyState < 2) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if (!canvas.width) return;
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data) {
            const now = Date.now();
            if (code.data === lastPayload && now - lastAt < 4000) return;
            lastPayload = code.data;
            lastAt = now;
            onScanRef.current(code.data);
          }
        }, 250);
      } catch {
        if (!cancelled) {
          setError("Camera unavailable — allow camera access, or ask staff to tap your name.");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-ink-800", className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn(
          "h-full w-full object-cover",
          facing === "user" && "-scale-x-100",
          paused && "opacity-30",
        )}
      />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-paper/70">
          {error}
        </div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-48 rounded-2xl border-4 border-mint/70" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
        className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-3 py-1.5 text-xs text-paper/80"
      >
        Flip camera
      </button>
    </div>
  );
}
