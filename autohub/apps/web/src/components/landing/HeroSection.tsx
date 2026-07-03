import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { FigCaption } from "@/components/shared/FigCaption";
import { CREDIT_TIERS, TOOL_CATEGORIES } from "@autohub/shared";

function rise(ms: number): CSSProperties {
  return { "--rise-delay": `${ms}ms` } as CSSProperties;
}

const FREE_CREDITS = CREDIT_TIERS.FREE.creditsOnSignup;

// Product-true execution trace: register → signed call → debit; async → callback armed.
const TERMINAL_LINES = [
  { delay: 900, text: "$ autohub run summarize-q3 --input report.pdf", tone: "cmd" },
  { delay: 1150, text: "→ POST hooks.n8n.cloud/webhook/summarize", tone: "dim" },
  { delay: 1400, text: "→ X-AutoHub-Signature: sha256 ✓ · ssrf-guard pass", tone: "dim" },
  { delay: 1700, text: "✓ executed in 1.24s — 1 credit debited", tone: "ok" },
  { delay: 2000, text: "$ autohub run brand-kit --prompt \"launch teaser\"", tone: "cmd" },
  { delay: 2250, text: "⠿ dispatching async · signed callback armed", tone: "warn" },
] as const;

// Category list comes from shared constants so it can't drift from the console.
const MARQUEE_ITEMS = [...TOOL_CATEGORIES, "Webhook Automation", "n8n", "Zapier", "Make"];

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-noise">
      {/* Blueprint grid backdrop */}
      <div className="absolute inset-0 bg-blueprint bg-blueprint-fade pointer-events-none" />
      {/* Signal glows */}
      <div className="orb orb-primary w-[560px] h-[560px] -top-40 -right-40" />
      <div className="orb orb-pink w-[420px] h-[420px] bottom-0 -left-32" style={{ animationDelay: "3s" }} />

      {/* Decorative crosshairs */}
      <span aria-hidden className="absolute top-28 left-[8%] font-mono text-muted-foreground/40 select-none">+</span>
      <span aria-hidden className="absolute top-[55%] right-[6%] font-mono text-muted-foreground/40 select-none">+</span>
      <span aria-hidden className="absolute bottom-36 left-[42%] font-mono text-muted-foreground/40 select-none">+</span>

      <div className="relative z-10 max-w-6xl mx-auto px-5 w-full pt-32 pb-10 grid lg:grid-cols-12 gap-12 items-center">
        {/* ── Left: headline block ── */}
        <div className="lg:col-span-7 space-y-7">
          <div className="rise inline-flex items-center gap-3" style={rise(0)}>
            <span className="status-dot status-dot-active" />
            <span className="microlabel microlabel-signal">SYS.01 / Webhook console — online</span>
          </div>

          <h1 className="font-display font-bold leading-[0.95] text-[clamp(2.9rem,7.5vw,5.6rem)] tracking-tight">
            <span className="rise block" style={rise(100)}>Mission control</span>
            <span className="rise block" style={rise(220)}>for your <span className="text-gradient">AI&nbsp;tools.</span></span>
          </h1>

          <p className="rise text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed" style={rise(360)}>
            Register any n8n or Zapier webhook as a tool. Share it with your team,
            run it from one console, and pay per execution — every call HMAC-signed
            and SSRF-guarded.
          </p>

          <div className="rise flex flex-wrap items-center gap-4" style={rise(480)}>
            <Button asChild size="lg" className="h-12 px-7 rounded-sm font-mono text-xs uppercase tracking-[0.18em] shadow-glow hover:shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-300 ease-out-expo">
              <Link href="/auth/signup">Start free — {FREE_CREDITS} credits</Link>
            </Button>
            <Link
              href="/#how"
              className="link-slide font-mono text-xs uppercase tracking-[0.18em] text-foreground/80 hover:text-foreground transition-colors"
            >
              See how it works ↗
            </Link>
          </div>

          {/* Telemetry strip — product facts, not marketing numbers */}
          <div className="rise grid grid-cols-3 max-w-lg gap-px bg-border/60 border border-border/60 mt-2" style={rise(600)}>
            {[
              { k: "SIGNING", v: "HMAC-SHA256" },
              { k: "EXECUTION", v: "SYNC + ASYNC" },
              { k: "CREDIT COMMIT", v: "TWO-PHASE" },
            ].map((s) => (
              <div key={s.k} className="bg-background/80 backdrop-blur px-4 py-3">
                <p className="font-mono text-[13px] font-semibold text-foreground whitespace-nowrap">{s.v}</p>
                <p className="microlabel mt-1">{s.k}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: terminal panel ── */}
        <div className="lg:col-span-5 rise" style={rise(420)}>
          <div className="tick-frame tick-signal glass scanline rounded-none border border-border bg-card/80">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70">
              <span className="microlabel">AUTOHUB.TERMINAL</span>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-warning/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-success/70" />
              </div>
            </div>
            {/* Log body */}
            <div className="px-4 py-4 font-mono text-[11.5px] leading-[1.9] min-h-[210px]">
              {TERMINAL_LINES.map((l) => (
                <p
                  key={l.text}
                  className={`rise ${
                    l.tone === "ok"
                      ? "text-primary"
                      : l.tone === "warn"
                      ? "text-warning"
                      : l.tone === "dim"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                  style={rise(l.delay)}
                >
                  {l.text}
                </p>
              ))}
              <p className="rise caret-blink text-muted-foreground" style={rise(2400)}>$</p>
            </div>
            {/* Status footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/70">
              <span className="microlabel">SIG ✓ VERIFIED</span>
              <span className="microlabel microlabel-signal">● LINK SECURE</span>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <FigCaption n="01">signed execution trace, illustrative</FigCaption>
          </div>
        </div>
      </div>

      {/* ── Category marquee ── */}
      <div className="relative z-10 border-y border-border/60 py-3 mt-6 rise" style={rise(700)}>
        <div className="marquee">
          <div className="marquee-track gap-0">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                {MARQUEE_ITEMS.map((item) => (
                  <span key={`${copy}-${item}`} className="flex items-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
                    <span className="px-6">{item}</span>
                    <span className="text-primary">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70 py-5 rise" style={rise(800)}>
        No credit card required · {FREE_CREDITS} free credits on signup
      </p>
    </section>
  );
}
