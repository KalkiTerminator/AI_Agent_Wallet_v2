import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/Reveal";
import { Webhook, Shield, Lock } from "lucide-react";

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main className="relative pt-32 pb-20 px-5 overflow-hidden bg-noise">
        <div className="absolute inset-0 bg-blueprint bg-blueprint-fade pointer-events-none" />

        <div className="relative max-w-4xl mx-auto space-y-24">
          {/* Page header */}
          <Reveal className="space-y-4">
            <p className="microlabel microlabel-signal">SYS.02 / Technical specification</p>
            <h1 className="font-display font-bold tracking-tight leading-[0.98] text-[clamp(2.4rem,6vw,4rem)]">
              How the <span className="text-gradient">machine</span> works.
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              Three subsystems — registration, signing, access control — explained
              at the protocol level.
            </p>
          </Reveal>

          {/* Webhook Registration */}
          <Reveal className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2.5">
                <span className="h-8 w-8 border border-border flex items-center justify-center">
                  <Webhook className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="microlabel microlabel-signal">01 / Registration</span>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Register any HTTP webhook as a tool</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Copy your n8n webhook URL, paste it into AutoHub, set a credit cost, and you have a tool.
                Supports POST with JSON body. Any automation platform that can receive HTTP POST works.
              </p>
            </div>
            <div className="tick-frame glass scanline p-5 font-mono text-xs space-y-1.5 text-muted-foreground">
              <p className="microlabel mb-3">REQUEST</p>
              <p><span className="text-primary">POST</span> /api/tools</p>
              <p className="pl-4">name: <span className="text-success">&quot;Send Slack Alert&quot;</span></p>
              <p className="pl-4">webhookUrl: <span className="text-success">&quot;https://n8n.example.com/webhook/…&quot;</span></p>
              <p className="pl-4">creditCost: <span className="text-warning">2</span></p>
              <p className="pl-4">executionMode: <span className="text-success">&quot;sync&quot;</span></p>
            </div>
          </Reveal>

          {/* HMAC Security */}
          <Reveal className="grid md:grid-cols-2 gap-10 items-center">
            <div className="tick-frame glass scanline p-5 font-mono text-xs space-y-1.5 text-muted-foreground order-2 md:order-1">
              <p className="microlabel mb-3">SIGNATURE</p>
              <p className="text-primary"># Headers on every callback</p>
              <p>X-AutoHub-Timestamp: <span className="text-warning">1714000000</span></p>
              <p>X-AutoHub-Signature: <span className="text-success">sha256=a3f…</span></p>
              <p className="pt-2 text-primary"># Verify in n8n</p>
              <p>HMAC-SHA256(secret,</p>
              <p className="pl-4"><span className="text-success">&quot;timestamp.executionId.body&quot;</span>)</p>
            </div>
            <div className="space-y-4 order-1 md:order-2">
              <div className="inline-flex items-center gap-2.5">
                <span className="h-8 w-8 border border-border flex items-center justify-center">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="microlabel microlabel-signal">02 / Signing</span>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Industry-standard HMAC signing</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each tool gets a unique signing secret. Executions and callbacks are verified with HMAC-SHA256 and a ±300s timestamp window —
                the same pattern used by Stripe, GitHub, and Shopify webhooks.
              </p>
            </div>
          </Reveal>

          {/* RBAC */}
          <Reveal className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2.5">
                <span className="h-8 w-8 border border-border flex items-center justify-center">
                  <Lock className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="microlabel microlabel-signal">03 / Access control</span>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Three-tier access model</h2>
              <div className="space-y-3 text-sm">
                {[
                  { role: "USER", desc: "Runs approved tools, manages credit wallet" },
                  { role: "MODERATOR", desc: "Creates tools, sets visibility, grants private access" },
                  { role: "ADMIN", desc: "Approves tools, governs users, infinite credits" },
                ].map(({ role, desc }) => (
                  <div key={role} className="flex gap-4 items-baseline">
                    <span className="font-mono text-[10px] tracking-[0.15em] text-primary w-24 shrink-0">{role}</span>
                    <span className="text-muted-foreground text-xs">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="tick-frame glass p-5 space-y-3">
              <p className="microlabel mb-1">VISIBILITY MATRIX</p>
              {[
                { label: "Public tools", cls: "bg-success" },
                { label: "Private (owner only)", cls: "bg-warning" },
                { label: "Private (granted users)", cls: "bg-primary" },
              ].map(({ label, cls }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`h-2 w-2 ${cls}`} />
                  <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* CTA */}
          <Reveal className="text-center space-y-5 py-8">
            <p className="microlabel microlabel-signal">Launch sequence ready</p>
            <h2 className="font-display text-3xl font-bold tracking-tight">Ready to automate?</h2>
            <p className="text-sm text-muted-foreground">Start free. 10 credits included. No credit card required.</p>
            <Button asChild size="lg" className="h-12 px-8 rounded-sm font-mono text-xs uppercase tracking-[0.18em] shadow-glow hover:shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-300 ease-out-expo">
              <Link href="/auth/signup">Initiate free →</Link>
            </Button>
          </Reveal>
        </div>
      </main>
      <Footer />
    </>
  );
}
