"use client";

import Link from "next/link";
import { useStaff } from "../StaffContext";

export default function ManagePage() {
  const { staff } = useStaff();
  const cards = [
    {
      href: "/staff/manage/students",
      title: "Students",
      desc: "Add students, reset PINs, print QR pass cards, deactivate leavers.",
    },
    {
      href: "/staff/manage/locations",
      title: "Destinations",
      desc: "Self-service places and the ones that need a teacher's approval.",
    },
    ...(staff.role === "leadership"
      ? [
          {
            href: "/staff/manage/staff",
            title: "Staff accounts",
            desc: "Create house staff and leadership logins, deactivate leavers.",
          },
        ]
      : []),
    {
      href: "/staff/manage/stations",
      title: "Office station",
      desc: "Pair the house iPad, rotate the token if a device is lost.",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Manage</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-ink/10 bg-white p-5 shadow-card transition-colors hover:border-teal"
          >
            <h2 className="text-xl font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-ink/60">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
