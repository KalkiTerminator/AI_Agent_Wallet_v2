import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarClient } from "@/components/dashboard/SidebarClient";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { OnboardingDialog } from "@/components/shared/OnboardingDialog";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background">
        <SidebarClient user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }} />
        <main className="flex-1 overflow-auto">{children}</main>
        <CommandPalette />
        <OnboardingDialog />
      </div>
    </TooltipProvider>
  );
}
