import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/student-auth";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStudentSession();
  if (!session) redirect("/student/login");
  return <div className="flex min-h-screen flex-1 flex-col surface-ink">{children}</div>;
}
