"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Classic Snake on a canvas. Keyboard arrows / WASD on desktop, swipe on
 * phone. Speeds up as you eat. High score is saved server-side.
 */

const GRID = 17;
const START_SPEED_MS = 160;
const MIN_SPEED_MS = 70;

type Point = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function Snake({
  best,
  onGameOver,
}: {
  best: number;
  onGameOver: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"idle" | "playing" | "dead">("idle");
  const [score, setScore] = useState(0);
  const [localBest, setLocalBest] = useState(best);

  // Mutable game state lives in refs; React state only mirrors score/phase.
  const snakeRef = useRef<Point[]>([]);
  const dirRef = useRef<Dir>("right");
  const nextDirRef = useRef<Dir>("right");
  const foodRef = useRef<Point>({ x: 10, y: 10 });
  const scoreRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<Point | null>(null);
  // The loop schedules itself through this ref (no self-reference in the callback).
  const tickRef = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = canvas.width / GRID;

    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // faint grid
    ctx.strokeStyle = "rgba(139,152,169,0.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, canvas.height);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(canvas.width, i * cell);
      ctx.stroke();
    }

    // food
    const f = foodRef.current;
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.arc((f.x + 0.5) * cell, (f.y + 0.5) * cell, cell * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // snake
    const snake = snakeRef.current;
    snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#d9f99d" : "#a3e635";
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2, 4);
      ctx.fill();
    });
  }, []);

  const placeFood = useCallback(() => {
    const snake = snakeRef.current;
    let p: Point;
    do {
      p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === p.x && s.y === p.y));
    foodRef.current = p;
  }, []);

  const stopLoop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const snake = snakeRef.current;
    dirRef.current = nextDirRef.current;
    const head = snake[0];
    const d = dirRef.current;
    const next: Point = {
      x: head.x + (d === "right" ? 1 : d === "left" ? -1 : 0),
      y: head.y + (d === "down" ? 1 : d === "up" ? -1 : 0),
    };

    const hitWall = next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID;
    const hitSelf = snake.some((p) => p.x === next.x && p.y === next.y);
    if (hitWall || hitSelf) {
      stopLoop();
      setPhase("dead");
      setLocalBest((b) => Math.max(b, scoreRef.current));
      onGameOver(scoreRef.current);
      return;
    }

    snake.unshift(next);
    if (next.x === foodRef.current.x && next.y === foodRef.current.y) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      placeFood();
    } else {
      snake.pop();
    }

    draw();
    const speed = Math.max(MIN_SPEED_MS, START_SPEED_MS - scoreRef.current * 5);
    timerRef.current = setTimeout(() => tickRef.current(), speed);
  }, [draw, onGameOver, placeFood, stopLoop]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(() => {
    snakeRef.current = [
      { x: 5, y: 8 },
      { x: 4, y: 8 },
      { x: 3, y: 8 },
    ];
    dirRef.current = "right";
    nextDirRef.current = "right";
    scoreRef.current = 0;
    setScore(0);
    placeFood();
    setPhase("playing");
    draw();
    stopLoop();
    timerRef.current = setTimeout(() => tickRef.current(), START_SPEED_MS);
  }, [draw, placeFood, stopLoop]);

  const steer = useCallback((d: Dir) => {
    if (OPPOSITE[d] !== dirRef.current) nextDirRef.current = d;
  }, []);

  // Keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Dir> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        steer(dir);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steer]);

  // Cleanup on unmount.
  useEffect(() => stopLoop, [stopLoop]);

  // Initial paint.
  useEffect(() => {
    snakeRef.current = [
      { x: 5, y: 8 },
      { x: 4, y: 8 },
      { x: 3, y: 8 },
    ];
    draw();
  }, [draw]);

  return (
    <div className="rounded-xl2 border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-black tracking-widest">🐍 SNAKE</h1>
        <p className="text-xs tabular-nums text-mut">
          score <span className="font-bold text-txt">{score}</span> · best{" "}
          <span className="font-bold text-acc">{localBest}</span>
        </p>
      </div>

      <div className="relative mt-3">
        <canvas
          ref={canvasRef}
          width={340}
          height={340}
          className="w-full touch-none rounded-xl border border-line"
          onTouchStart={(e) => {
            const t = e.touches[0];
            touchStart.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchMove={(e) => {
            const s = touchStart.current;
            if (!s) return;
            const t = e.touches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
            steer(
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? "right"
                  : "left"
                : dy > 0
                  ? "down"
                  : "up",
            );
            touchStart.current = { x: t.clientX, y: t.clientY };
          }}
        />
        {phase !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-bg/80 backdrop-blur-sm">
            {phase === "dead" && (
              <p className="text-lg font-black">
                {score > best ? `NEW BEST: ${score} 🏆` : `Score: ${score}`}
              </p>
            )}
            <button
              onClick={start}
              className="rounded-xl2 bg-acc px-8 py-3 text-base font-black text-bg transition hover:brightness-110"
            >
              {phase === "dead" ? "Run it back" : "▶ Play"}
            </button>
            <p className="text-[11px] text-mut">arrows / WASD · swipe on phone</p>
          </div>
        )}
      </div>
    </div>
  );
}
