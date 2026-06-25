"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/Brand";
import { ErrorNotice, Spinner } from "@/components/Notice";
import type { House } from "@/lib/types";

export default function StudentLoginPage() {
  const router = useRouter();
  const [houses, setHouses] = useState<House[] | null>(null);
  const [houseId, setHouseId] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [room, setRoom] = useState("");
  const [needRoom, setNeedRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/student/houses")
      .then((r) => r.json())
      .then((d) => {
        const list: House[] = d.houses ?? [];
        setHouses(list);
        if (list.length === 1) setHouseId(list[0].id);
      })
      .catch(() => setError("Can't reach HousePass — check your connection."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseId,
          name,
          pin,
          room: needRoom && room ? room : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "ambiguous") setNeedRoom(true);
        setError(data.error?.message ?? "Sign in failed — try again.");
        setBusy(false);
        return;
      }
      router.replace("/student");
      router.refresh();
    } catch {
      setError("Can't reach HousePass — check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center surface-ink px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <BrandLockup dark className="justify-center" />
          <h1 className="text-2xl font-semibold text-paper">Welcome</h1>
          <p className="text-sm text-paper/60">
            Sign in once — your pass stays on this phone.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl bg-paper p-6 shadow-lift animate-rise"
        >
          {houses && houses.length > 1 && (
            <label className="block text-sm font-medium">
              House
              <select
                required
                value={houseId}
                onChange={(e) => setHouseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-base"
              >
                <option value="" disabled>
                  Choose your house
                </option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm font-medium">
            Full name
            <input
              type="text"
              required
              autoComplete="name"
              placeholder="e.g. Amelia Brook"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-base"
            />
          </label>

          <label className="block text-sm font-medium">
            4-digit PIN
            <input
              type="password"
              required
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-center text-2xl tracking-[0.5em]"
            />
          </label>

          {needRoom && (
            <label className="block text-sm font-medium">
              Room number
              <input
                type="text"
                required
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-base"
              />
              <span className="mt-1 block text-xs font-normal text-ink/50">
                Two students share that name — your room tells them apart.
              </span>
            </label>
          )}

          <ErrorNotice>{error}</ErrorNotice>

          <button
            type="submit"
            disabled={busy || !houseId}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-3 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-60"
          >
            {busy && <Spinner />} Sign in
          </button>

          <p className="text-center text-xs text-ink/50">
            Forgotten your PIN? Ask at the house office.
          </p>
        </form>
      </div>
    </div>
  );
}
