"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard, BarChart2, Settings, User, Wrench,
  LogOut, Shield, CheckSquare, Users, Package, Menu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  { href: "/tools/mine", label: "My Tools", icon: Package },
  { href: "/tools/new", label: "Tool Dev", icon: Wrench },
  { href: "/admin?tab=tools", label: "Manage Tools", icon: Settings },
  { href: "/admin?tab=approvals", label: "Tool Approvals", icon: CheckSquare },
];

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="25" height="25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 19.5 14 8.5l6 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      <path d="M10.6 15.4h6.8" stroke="currentColor" strokeWidth="1.8" />
      <rect x="19.5" y="19.5" width="7" height="7" fill="hsl(var(--signal-raw))" stroke="none" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  variant = "default",
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  variant?: "default" | "admin";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 text-xs font-medium transition-all duration-300",
        active
          ? "bg-primary/10 text-primary"
          : variant === "admin"
          ? "text-warning/80 hover:text-warning hover:bg-warning/10"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
    >
      {/* active signal bar */}
      <span
        className={cn(
          "absolute left-0 top-1 bottom-1 w-[2.5px] bg-primary transition-transform duration-300 ease-out-expo origin-center",
          active ? "scale-y-100" : "scale-y-0 group-hover:scale-y-50"
        )}
      />
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}

export function SidebarClient({ user }: SidebarClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user.role === "admin" || user.role === "moderator";

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split("?");
    if (href === "/dashboard") return pathname === href;
    if (!pathname.startsWith(hrefPath)) return false;
    if (!hrefQuery) return true;
    const params = new URLSearchParams(hrefQuery);
    const tab = params.get("tab");
    if (!tab) return true;
    return searchParams.get("tab") === tab;
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3.5 left-3.5 z-40 h-9 w-9 flex items-center justify-center border border-border bg-card/90 backdrop-blur rounded-sm"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "w-56 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-screen z-50",
          "lg:sticky lg:top-0 lg:translate-x-0",
          "fixed inset-y-0 left-0 transition-transform duration-300 ease-out-expo",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="px-4 h-16 flex items-center gap-2.5 border-b border-sidebar-border">
        <LogoMark className="h-6 w-6 text-foreground" />
        <span className="font-display font-bold text-sm tracking-tight">AutoHub</span>
        {isAdmin && (
          <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.2em] text-warning border border-warning/40 px-1.5 py-0.5">
            {user.role === "admin" ? "ADM" : "MOD"}
          </span>
        )}
        <button onClick={() => setMobileOpen(false)} className="lg:hidden ml-1 text-muted-foreground hover:text-foreground" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav (tap a link → close the mobile drawer) */}
      <nav className="flex-1 py-4 space-y-5 overflow-y-auto" onClick={() => setMobileOpen(false)}>
        <div>
          <p className="px-4 mb-1.5 microlabel">Console</p>
          <div>
            {mainLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
            ))}
          </div>
        </div>

        <div>
          <p className="px-4 mb-1.5 microlabel">Operator</p>
          <div>
            {settingsLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
            ))}
          </div>
        </div>

        {isAdmin && (
          <div>
            <p className="px-4 mb-1.5 microlabel flex items-center gap-1.5">
              <Shield className="h-2.5 w-2.5" /> Command
            </p>
            <div>
              {adminLinks.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} variant="admin" />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: status + sign out */}
      <div className="border-t border-sidebar-border px-4 py-2.5 flex items-center gap-2">
        <span className="status-dot status-dot-active" />
        <span className="microlabel">Online</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 w-7 p-0 rounded-sm text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
      </aside>
    </>
  );
}
