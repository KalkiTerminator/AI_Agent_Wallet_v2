"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, BarChart2, Settings, User, Wrench,
  LogOut, Zap, Shield, CheckSquare, Users, Sun, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface SidebarClientProps {
  user: { name: string; email: string; role: string };
}

const mainLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/usage", label: "Usage", icon: BarChart2 },
];

const settingsLinks = [
  { href: "/settings", label: "Profile", icon: User },
];

const adminLinks = [
  { href: "/admin?tab=users", label: "User Management", icon: Users },
  { href: "/tools/new", label: "Tool Dev", icon: Wrench },
  { href: "/admin?tab=tools", label: "Manage Tools", icon: Settings },
  { href: "/admin?tab=approvals", label: "Tool Approvals", icon: CheckSquare },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
        active
          ? "text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}

export function SidebarClient({ user }: SidebarClientProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const isAdmin = user.role === "admin" || user.role === "moderator";

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href.split("?")[0]);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-background flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="font-display font-bold text-sm">AutoHub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        {/* MAIN */}
        <div>
          <p className="px-2.5 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Main</p>
          <div className="space-y-0.5">
            {mainLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
            ))}
          </div>
        </div>

        {/* SETTINGS */}
        <div>
          <p className="px-2.5 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Settings</p>
          <div className="space-y-0.5">
            {settingsLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
            ))}
          </div>
        </div>

        {/* ADMIN */}
        {isAdmin && (
          <div>
            <p className="px-2.5 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Admin</p>
            <div className="space-y-0.5">
              {adminLinks.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: theme toggle + sign out */}
      <div className="px-3 py-3 border-t border-border flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
