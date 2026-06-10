import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

function rise(ms: number): CSSProperties {
  return { "--rise-delay": `${ms}ms` } as CSSProperties;
}

interface AuthShellProps {
  /** Mono step label, e.g. "ACCESS / SIGN IN" */
  step: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Split-screen auth chrome: brand instrument panel on the left,
 * tick-framed form console on the right.
 */
export function AuthShell({ step, title, subtitle, children }: AuthShellProps) {
  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* ── Brand panel ── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border bg-noise">
        <div className="absolute inset-0 bg-blueprint pointer-events-none [mask-image:linear-gradient(135deg,black,transparent_85%)]" />
        <div className="orb orb-primary w-[420px] h-[420px] -bottom-32 -left-32" />

        <Link href="/" className="relative flex items-center gap-2.5 p-8 group w-fit">
          <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7 text-foreground transition-transform duration-500 ease-out-expo group-hover:rotate-90" aria-hidden>
            <rect x="1.5" y="1.5" width="25" height="25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 19.5 14 8.5l6 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
            <path d="M10.6 15.4h6.8" stroke="currentColor" strokeWidth="1.8" />
            <rect x="19.5" y="19.5" width="7" height="7" fill="hsl(var(--signal-raw))" stroke="none" />
          </svg>
          <span className="font-display font-bold text-lg tracking-tight">AutoHub</span>
        </Link>

        <div className="relative p-8 space-y-6 max-w-md">
          <p className="rise microlabel microlabel-signal" style={rise(100)}>
            ● Secure channel established
          </p>
          <h2 className="rise font-display font-bold tracking-tight leading-[0.95] text-5xl" style={rise(200)}>
            Take the <span className="text-gradient">controls.</span>
          </h2>
          <p className="rise text-sm text-muted-foreground leading-relaxed" style={rise(320)}>
            One console for every AI tool your team runs — HMAC-signed executions,
            credit-metered billing, full telemetry.
          </p>
        </div>

        <div className="relative p-8 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            fig. 00 — access gateway
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 flex items-center gap-2">
            <span className="status-dot status-dot-active" />
            TLS 1.3
          </span>
        </div>
      </div>

      {/* ── Form console ── */}
      <div className="relative flex items-center justify-center p-6 sm:p-10 bg-noise">
        <div className="absolute inset-0 gradient-mesh pointer-events-none" />
        <div className="relative w-full max-w-md">
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-8 w-fit">
            <svg viewBox="0 0 28 28" fill="none" className="h-6 w-6 text-foreground" aria-hidden>
              <rect x="1.5" y="1.5" width="25" height="25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 19.5 14 8.5l6 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              <path d="M10.6 15.4h6.8" stroke="currentColor" strokeWidth="1.8" />
              <rect x="19.5" y="19.5" width="7" height="7" fill="hsl(var(--signal-raw))" stroke="none" />
            </svg>
            <span className="font-display font-bold tracking-tight">AutoHub</span>
          </Link>

          <div className="rise tick-frame tick-signal bg-card border border-border" style={rise(80)}>
            <div className="flex items-center justify-between px-7 pt-6">
              <p className="microlabel">{step}</p>
              <span className="font-mono text-[10px] text-muted-foreground/60">[ ENTER ]</span>
            </div>
            <div className="px-7 pb-8 pt-5">
              <h1 className="font-display font-bold text-2xl tracking-tight mb-1">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mb-6">{subtitle}</p>}
              {!subtitle && <div className="mb-6" />}
              {children}
            </div>
          </div>

          <p className="rise font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50 text-center mt-6" style={rise(260)}>
            Protected by HMAC-SHA256 · rate-limited · audited
          </p>
        </div>
      </div>
    </main>
  );
}
