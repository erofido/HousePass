import { redirect } from "next/navigation";
import { hasSession } from "@/lib/session";
import { Nav } from "./Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasSession())) redirect("/login");
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-24 pt-5 sm:pb-8 sm:pt-8">
      <Nav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
