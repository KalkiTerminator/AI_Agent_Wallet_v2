import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/Reveal";

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-background overflow-hidden">
      {/* CTA band */}
      <div className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-blueprint opacity-60 pointer-events-none [mask-image:linear-gradient(90deg,transparent,black_30%,black_70%,transparent)]" />
        <Reveal className="relative max-w-6xl mx-auto px-5 py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="space-y-3">
            <p className="microlabel microlabel-signal">SYS.04 / Launch sequence</p>
            <h2 className="font-display font-bold tracking-tight leading-none text-[clamp(1.9rem,4vw,3rem)]">
              Ready to take command?
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Wire up your first webhook in under two minutes. Ten credits on the house.
            </p>
          </div>
          <Button asChild size="lg" className="h-12 px-8 rounded-sm font-mono text-xs uppercase tracking-[0.18em] shadow-glow hover:shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-300 ease-out-expo shrink-0">
            <Link href="/auth/signup">Initiate free →</Link>
          </Button>
        </Reveal>
      </div>

      {/* Link grid */}
      <div className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1 space-y-3">
          <span className="font-display font-bold text-lg tracking-tight">AutoHub</span>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
            Mission control for AI tools. Register, share, and run webhooks with credit-metered billing.
          </p>
        </div>
        {[
          {
            head: "PRODUCT",
            links: [
              { href: "/features", label: "Features" },
              { href: "/#systems", label: "Systems" },
              { href: "/#pricing", label: "Pricing" },
            ],
          },
          {
            head: "CONSOLE",
            links: [
              { href: "/auth/login", label: "Sign in" },
              { href: "/auth/signup", label: "Sign up" },
              { href: "/dashboard", label: "Dashboard" },
            ],
          },
          {
            head: "PROTOCOL",
            links: [
              { href: "/features", label: "HMAC Signing" },
              { href: "/features", label: "Async Callbacks" },
              { href: "/features", label: "Credit Wallet" },
            ],
          },
        ].map((col) => (
          <div key={col.head} className="space-y-3">
            <p className="microlabel">{col.head}</p>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="link-slide text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Status line */}
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            © 2026 AutoHub — All rights reserved
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
            <span className="status-dot status-dot-active" />
            All systems nominal
          </p>
        </div>
      </div>

      {/* Oversized wordmark */}
      <div aria-hidden className="relative select-none pointer-events-none overflow-hidden">
        <p className="font-display font-bold text-center leading-[0.78] tracking-tight text-[clamp(5rem,18vw,16rem)] text-stroke opacity-[0.55] translate-y-[18%]">
          AUTOHUB
        </p>
      </div>
    </footer>
  );
}
