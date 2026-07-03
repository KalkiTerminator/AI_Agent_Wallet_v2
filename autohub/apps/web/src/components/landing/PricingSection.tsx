import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { FigCaption } from "@/components/shared/FigCaption";
import { SUBSCRIPTION_TIERS, CREDIT_PACKS, CREDIT_TIERS } from "@autohub/shared";

// Pricing renders from @autohub/shared so the landing page can never
// contradict the billing page — one source of truth for every number.
const FREE_CREDITS = CREDIT_TIERS.FREE.creditsOnSignup;
const PRO = SUBSCRIPTION_TIERS.PRO;

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-28 px-5 overflow-hidden">
      <div className="absolute inset-0 gradient-mesh pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <Reveal className="mb-16">
          <SectionHeader
            align="center"
            code="SYS.04 / Access tiers"
            title={<>Simple, <span className="text-gradient">metered pricing.</span></>}
            lede="One credit ≈ one execution. Failed runs are refunded automatically. No hidden fees, no lock-in."
          />
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {/* ── Tier 0: Free ── */}
          <Reveal className="h-full">
            <article className="tick-frame relative h-full flex flex-col bg-card border border-border p-7 transition-all duration-500 ease-out-expo hover:-translate-y-2 hover:border-foreground/30 hover:shadow-large">
              <div className="flex items-center justify-between mb-6">
                <span className="microlabel">Tier 0</span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              </div>
              <p className="font-display font-semibold text-xl tracking-tight">{SUBSCRIPTION_TIERS.FREE.name}</p>
              <div className="flex items-end gap-2 mt-3">
                <span className="font-display font-bold text-5xl tracking-tight tabular-nums">$0</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2">forever</span>
              </div>
              <p className="font-mono text-[11px] text-primary mt-1.5">{FREE_CREDITS} credits on signup</p>

              <div className="h-px bg-border my-6" />

              <ul className="space-y-3 flex-1">
                {[
                  `${FREE_CREDITS} free credits on signup`,
                  "Access all public tools",
                  "Sync & async execution",
                  "Usage history & analytics",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[13px] text-foreground/85 leading-snug">
                    <span className="font-mono text-primary text-xs mt-px select-none" aria-hidden>+</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Button asChild variant="outline" className="mt-8 w-full rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] h-11">
                <Link href="/auth/signup">Get started free</Link>
              </Button>
            </article>
          </Reveal>

          {/* ── Tier 1: Pro ── */}
          <Reveal delay={110} className="h-full">
            <article className="tick-frame tick-signal relative h-full flex flex-col bg-card border border-primary/60 shadow-glow p-7 transition-all duration-500 ease-out-expo md:-translate-y-3 hover:-translate-y-2 md:hover:-translate-y-5">
              <div className="absolute -top-px left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-mono text-[9px] uppercase tracking-[0.3em] px-3 py-1">
                Recommended
              </div>
              <div className="flex items-center justify-between mb-6">
                <span className="microlabel">Tier 1</span>
                <span className="status-dot status-dot-active !w-1.5 !h-1.5" />
              </div>
              <p className="font-display font-semibold text-xl tracking-tight">{PRO.name}</p>
              <div className="flex items-end gap-2 mt-3">
                <span className="font-display font-bold text-5xl tracking-tight tabular-nums">${PRO.price}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2">/ month</span>
              </div>
              <p className="font-mono text-[11px] text-primary mt-1.5">{PRO.credits} credits / month</p>

              <div className="h-px bg-border my-6" />

              <ul className="space-y-3 flex-1">
                {[
                  `${PRO.credits} credits every month`,
                  "Priority webhook execution",
                  "Private tool creation & sharing",
                  "Programmatic API keys",
                  "Email support",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[13px] text-foreground/85 leading-snug">
                    <span className="font-mono text-primary text-xs mt-px select-none" aria-hidden>+</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Button asChild className="mt-8 w-full rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] h-11 shadow-glow">
                <Link href="/auth/signup?intent=pro">Start Pro</Link>
              </Button>
            </article>
          </Reveal>

          {/* ── Credit packs ── */}
          <Reveal delay={220} className="h-full">
            <article className="tick-frame relative h-full flex flex-col bg-card border border-border p-7 transition-all duration-500 ease-out-expo hover:-translate-y-2 hover:border-foreground/30 hover:shadow-large">
              <div className="flex items-center justify-between mb-6">
                <span className="microlabel">Top-up</span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              </div>
              <p className="font-display font-semibold text-xl tracking-tight">Credit Packs</p>
              <div className="flex items-end gap-2 mt-3">
                <span className="font-display font-bold text-5xl tracking-tight tabular-nums">${CREDIT_PACKS[0].price}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2">one-time, from</span>
              </div>
              <p className="font-mono text-[11px] text-primary mt-1.5">no expiry · stackable</p>

              <div className="h-px bg-border my-6" />

              <ul className="space-y-3 flex-1 font-mono text-[12px]">
                {CREDIT_PACKS.map((p) => (
                  <li key={p.label} className="flex items-center justify-between gap-3 text-foreground/85">
                    <span className="uppercase tracking-[0.1em] text-muted-foreground">{p.label}</span>
                    <span className="tabular-nums">{p.credits} cr — ${p.price}</span>
                  </li>
                ))}
                <li className="flex items-start gap-3 text-[13px] font-sans text-foreground/85 leading-snug pt-2">
                  <span className="font-mono text-primary text-xs mt-px select-none" aria-hidden>+</span>
                  Use at your own pace, on any plan
                </li>
              </ul>

              <Button asChild variant="outline" className="mt-8 w-full rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] h-11">
                <Link href="/auth/signup?intent=credits">Buy credits</Link>
              </Button>
            </article>
          </Reveal>
        </div>

        <Reveal delay={150} className="mt-10 flex justify-center">
          <FigCaption n="04">access matrix · all tiers include HMAC signing &amp; SSRF guard</FigCaption>
        </Reveal>
      </div>
    </section>
  );
}
