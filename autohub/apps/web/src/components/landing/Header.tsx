"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled ? "glass-strong border-b border-border/70" : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoMark className="h-7 w-7 text-foreground transition-transform duration-500 ease-out-expo group-hover:rotate-90" />
          <span className="font-display font-bold text-lg tracking-tight">
            AutoHub
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: "/#how", label: "How it works" },
            { href: "/#systems", label: "Systems" },
            { href: "/#pricing", label: "Pricing" },
            { href: "/features", label: "Specs" },
            { href: "/auth/login", label: "Sign in" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="link-slide font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <Button asChild size="sm" className="font-mono text-[11px] uppercase tracking-[0.18em] h-9 px-4 rounded-sm shadow-glow">
          <Link href="/auth/signup">
            Initiate
            <span aria-hidden className="ml-1">→</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
