import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarClient } from "@/components/dashboard/SidebarClient";
import { CommandPalette } from "@/components/shared/CommandPalette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarClient user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }} />
      <main className="flex-1 overflow-auto">{children}</main>
      <CommandPalette />
    </div>
  );
}
