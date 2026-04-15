"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, BarChart2, Settings, CreditCard, LogOut, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";

interface SidebarClientProps {
  user: { name: string; email: string; role: string };
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/usage", label: "Usage", icon: BarChart2 },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarClient({ user }: SidebarClientProps) {
  const pathname = usePathname();
  const { credits, loading } = useCredits();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 pb-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-display font-bold text-sm">AutoHub</span>
        </Link>
      </div>

      {/* Credit balance */}
      <div className="mx-3 mb-3 px-3 py-2 rounded-lg glass-subtle">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Credits</p>
        {loading ? (
          <div className="h-5 w-16 rounded bg-muted animate-pulse" />
        ) : (
          <p className="text-sm font-semibold font-mono">
            {credits ?? "—"} <span className="text-[10px] text-muted-foreground font-normal">available</span>
          </p>
        )}
      </div>

      <Separator className="mx-3 mb-2" />

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors",
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        ))}

        {user.role === "admin" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Admin
          </Link>
        )}
      </nav>

      {/* User + sign out */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium truncate">{user.name || user.email}</p>
            {user.role === "admin" && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 rounded">{user.role}</Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-7 text-[11px] text-muted-foreground hover:text-destructive gap-2"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
