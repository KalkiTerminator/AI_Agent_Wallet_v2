import { Webhook, Shield, Zap, BarChart3, Lock, Globe } from "lucide-react";

const features = [
  {
    icon: Webhook,
    title: "Webhook Aggregation",
    description: "Paste any n8n webhook URL to register it as a tool. No code changes needed.",
  },
  {
    icon: Shield,
    title: "HMAC-Secured Callbacks",
    description: "Every async tool gets a unique signing secret. Callbacks are verified with SHA-256 — same standard as Stripe and GitHub.",
  },
  {
    icon: Zap,
    title: "Sync & Async Execution",
    description: "Sync tools return results immediately. Async tools let n8n call back when ready — perfect for long-running workflows.",
  },
  {
    icon: Lock,
    title: "Role-Based Access Control",
    description: "Three-tier RBAC: users run tools, moderators create and share tools, admins approve and govern the platform.",
  },
  {
    icon: Globe,
    title: "Public & Private Tools",
    description: "Keep tools private to a team or publish to the marketplace after admin approval.",
  },
  {
    icon: BarChart3,
    title: "Credit Wallet & Analytics",
    description: "Credit-based billing with full execution history. Buy credits in packs or subscribe for monthly allowance.",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-24 px-4 bg-background">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-display font-bold">
            Everything you need to{" "}
            <span className="text-gradient">automate at scale</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Built for teams using n8n, Zapier, or any HTTP webhook automation platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="glass rounded-xl p-5 space-y-3 spotlight-card group">
                <div className="spotlight-overlay gradient-aurora rounded-xl" />
                <div className="relative z-10">
                  <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center mb-3 shadow-glow group-hover:scale-105 transition-transform duration-300">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-display font-semibold text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
