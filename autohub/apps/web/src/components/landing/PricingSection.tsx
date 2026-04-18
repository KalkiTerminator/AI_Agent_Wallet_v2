import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

const plans = [
  {
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
    <section id="pricing" className="py-24 px-4 gradient-subtle">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-display font-bold">
            Simple, <span className="text-gradient">transparent pricing</span>
          </h2>
          <p className="text-muted-foreground">Pay only for what you use. No hidden fees.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`glass rounded-2xl p-6 space-y-5 flex flex-col ${
                plan.highlight ? "border-primary/50 shadow-glow ring-1 ring-primary/20" : ""
              }`}
            >
              {plan.highlight && (
                <div className="text-[10px] font-semibold text-primary uppercase tracking-wider">Most Popular</div>
              )}
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{plan.name}</p>
                <div className="flex items-end gap-1 mt-1">
                  <span className="text-3xl font-display font-bold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground pb-1">{plan.period}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{plan.credits}</p>
              </div>
              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <CheckCircle className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={plan.highlight ? "hero" : "outline"}
                className={plan.highlight ? "border-glow" : ""}
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
