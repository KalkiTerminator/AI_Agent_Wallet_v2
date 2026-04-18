import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-screen aurora-bg gradient-mesh flex items-center justify-center overflow-hidden">
      {/* Floating orbs */}
      <div className="orb orb-primary w-[500px] h-[500px] -top-32 -left-32" style={{ animationDelay: "0s" }} />
      <div className="orb orb-pink w-[450px] h-[450px] -top-16 -right-24" style={{ animationDelay: "2s" }} />
      <div className="orb orb-teal w-[350px] h-[350px] bottom-16 left-1/4" style={{ animationDelay: "4s" }} />

      {/* Mesh grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center space-y-6 pt-20">
        {/* Animated badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border-glow text-xs font-medium">
          <span className="status-dot status-dot-active" />
          Webhook automation marketplace — now live
          <ArrowRight className="h-3 w-3 text-primary" />
        </div>

        {/* Gradient headline */}
        <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight">
          Supercharge your<br />
          <span className="text-gradient">workflows</span>
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Register your n8n webhooks as tools. Share them with your team.
          Run automations from a unified dashboard with credit-based billing.
        </p>

        {/* CTA pair */}
        <div className="flex items-center justify-center gap-4">
          <Button asChild variant="hero" size="lg" className="border-glow shadow-glow">
            <Link href="/auth/signup">
              <Zap className="h-4 w-4 mr-2" />
              Start for Free
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/features">See How It Works</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          No credit card required &nbsp;·&nbsp; 10 free credits on signup
        </p>
      </div>
    </section>
  );
}
