import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/Reveal";

const plans = [
  {
    tier: "TIER 0",
    name: "Starter",
    price: "$0",
    period: "forever",
    credits: "10 free credits",
    features: ["10 free credits on signup", "Access all public tools", "Sync & async execution", "Usage history & analytics"],
    cta: "Get Started Free",
    href: "/auth/signup",
    highlight: false,
  },
  {
    tier: "TIER 1",
    name: "Pro",
    price: "$12",
    period: "/ month",
    credits: "500 credits / month",
    features: ["500 credits per month", "Priority webhook execution", "Private tool creation", "API access", "Email support"],
    cta: "Start Pro",
    href: "/auth/signup",
    highlight: true,
  },
  {
    tier: "TIER 2",
    name: "Credit Pack",
    price: "$5",
    period: "one-time",
    credits: "200 credits",
    features: ["200 credits, no expiry", "Use at your own pace", "Same access as Starter", "Top up anytime"],
    cta: "Buy Credits",
    href: "/auth/signup",
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-28 px-5 overflow-hidden">
      <div className="absolute inset-0 gradient-mesh pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <Reveal className="mb-16 space-y-4 text-center">
          <p className="microlabel microlabel-signal">SYS.03 / Access tiers</p>
          <h2 className="font-display font-bold tracking-tight leading-[1.02] text-[clamp(2rem,4.5vw,3.4rem)]">
            Simple, <span className="text-gradient">metered pricing.</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            One credit ≈ one execution. No hidden fees, no lock-in.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 110} className="h-full">
              <div
                className={`tick-frame relative h-full flex flex-col bg-card border p-7 transition-all duration-500 ease-out-expo hover:-translate-y-2 ${
                  plan.highlight
                    ? "tick-signal border-primary/60 shadow-glow md:-translate-y-3 md:hover:-translate-y-5"
                    : "border-border hover:border-foreground/30 hover:shadow-large"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-mono text-[9px] uppercase tracking-[0.3em] px-3 py-1">
                    Recommended
                  </div>
                )}

                <div className="flex items-center justify-between mb-6">
                  <span className="microlabel">{plan.tier}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${plan.highlight ? "bg-primary animate-pulse-glow" : "bg-muted-foreground/50"}`} />
                </div>

                <p className="font-display font-semibold text-xl tracking-tight">{plan.name}</p>
                <div className="flex items-end gap-2 mt-3">
                  <span className="font-display font-bold text-5xl tracking-tight tabular-nums">{plan.price}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2">{plan.period}</span>
                </div>
                <p className="font-mono text-[11px] text-primary mt-1.5">{plan.credits}</p>

                <div className="h-px bg-border my-6" />

                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-[13px] text-foreground/85 leading-snug">
                      <span className="font-mono text-primary text-xs mt-px select-none">+</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className={`mt-8 w-full rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] h-11 ${
                    plan.highlight ? "shadow-glow" : ""
                  }`}
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={150} className="mt-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            fig. 03 — access matrix · all tiers include HMAC signing & SSRF guard
          </p>
        </Reveal>
      </div>
    </section>
  );
}
