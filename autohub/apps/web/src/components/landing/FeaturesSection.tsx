import { Webhook, Shield, Zap, Lock, KeyRound, CircuitBoard } from "lucide-react";
import { Reveal } from "@/components/shared/Reveal";

// Six real subsystems — each maps to shipped capability, not aspiration.
const features = [
  {
    icon: Webhook,
    code: "WBH",
    title: "Webhook Aggregation",
    description: "Paste any n8n, Zapier or Make webhook URL to register it as a tool. URLs and auth headers are encrypted at rest; no code changes needed.",
  },
  {
    icon: Shield,
    code: "SIG",
    title: "HMAC-Signed Calls",
    description: "Every tool gets a unique signing secret. Calls and callbacks carry SHA-256 signatures with a replay window — the same standard as Stripe and GitHub.",
  },
  {
    icon: Zap,
    code: "EXE",
    title: "Sync & Async Execution",
    description: "Sync tools return results immediately. Async tools let your workflow call back when ready — perfect for long-running jobs.",
  },
  {
    icon: Lock,
    code: "RBC",
    title: "Role-Based Access Control",
    description: "Three-tier RBAC: users run tools, moderators create and share them, admins approve and govern. Private tools support per-user grants.",
  },
  {
    icon: CircuitBoard,
    code: "CBR",
    title: "Circuit Breaker & Refunds",
    description: "Failing endpoints trip a breaker: calls reject fast, credits refund automatically, and the tool is flagged degraded until it recovers.",
  },
  {
    icon: KeyRound,
    code: "API",
    title: "API Keys & Audit Trail",
    description: "Execute tools programmatically with scoped API keys. Every auth event and execution lands in an immutable audit log.",
  },
];

export function FeaturesSection() {
  return (
    <section id="systems" className="relative py-28 px-5 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-dots opacity-[0.35] pointer-events-none [mask-image:linear-gradient(180deg,transparent,black_20%,black_80%,transparent)]" />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header */}
        <Reveal className="mb-16 grid md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-7 space-y-4">
            <p className="microlabel microlabel-signal">SYS.03 / Capabilities</p>
            <h2 className="font-display font-bold tracking-tight leading-[1.02] text-[clamp(2rem,4.5vw,3.4rem)]">
              Every subsystem you need to{" "}
              <span className="text-gradient">automate at scale.</span>
            </h2>
          </div>
          <p className="md:col-span-5 text-sm text-muted-foreground leading-relaxed md:text-right">
            Built for teams running n8n, Zapier, or any HTTP webhook platform.
            Six subsystems, one console.
          </p>
        </Reveal>

        {/* Numbered system rows */}
        <div className="border-t border-border">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={i * 70}>
                <div className="group relative grid grid-cols-[auto_1fr] md:grid-cols-[120px_minmax(0,1.1fr)_minmax(0,1.6fr)_56px] items-center gap-x-6 gap-y-2 border-b border-border py-7 px-2 md:px-4 transition-colors duration-500 overflow-hidden">
                  {/* hover sweep */}
                  <div className="absolute inset-0 bg-primary/[0.045] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo pointer-events-none" />
                  {/* left signal bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out-expo" />

                  <div className="relative flex items-baseline gap-3">
                    <span className="font-display text-3xl md:text-4xl font-bold text-stroke transition-colors duration-500 group-hover:text-primary group-hover:[-webkit-text-stroke:0px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="microlabel hidden md:inline">{f.code}</span>
                  </div>

                  <h3 className="relative font-display font-semibold text-lg md:text-xl tracking-tight">
                    {f.title}
                  </h3>

                  <p className="relative col-span-2 md:col-span-1 text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>

                  <div className="relative hidden md:flex items-center justify-end">
                    <div className="h-10 w-10 border border-border flex items-center justify-center transition-all duration-500 ease-out-expo group-hover:bg-primary group-hover:border-primary group-hover:rotate-[-8deg]">
                      <Icon className="h-4 w-4 text-muted-foreground transition-colors duration-500 group-hover:text-primary-foreground" />
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={120} className="mt-6 flex justify-between items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">fig. 03 — subsystem index</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">06 / 06 nominal</span>
        </Reveal>
      </div>
    </section>
  );
}
