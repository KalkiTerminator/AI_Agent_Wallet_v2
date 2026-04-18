import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Webhook, Shield, Zap, Lock } from "lucide-react";

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-16 px-4 max-w-4xl mx-auto space-y-20">

        {/* Webhook Registration */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs text-primary font-medium">
              <Webhook className="h-4 w-4" /> Webhook Registration
            </div>
            <h2 className="text-2xl font-display font-bold">Register any HTTP webhook as a tool</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Copy your n8n webhook URL, paste it into AutoHub, set a credit cost, and you have a tool.
              Supports POST with JSON body. Any automation platform that can receive HTTP POST works.
            </p>
          </div>
          <div className="glass rounded-xl p-4 font-mono text-xs space-y-1 text-muted-foreground">
            <p><span className="text-primary">POST</span> /api/tools</p>
            <p className="pl-4">name: <span className="text-success">&quot;Send Slack Alert&quot;</span></p>
            <p className="pl-4">webhookUrl: <span className="text-success">&quot;https://n8n.example.com/webhook/…&quot;</span></p>
            <p className="pl-4">creditCost: <span className="text-warning">2</span></p>
            <p className="pl-4">executionMode: <span className="text-success">&quot;sync&quot;</span></p>
          </div>
        </section>

        {/* HMAC Security */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div className="glass rounded-xl p-4 font-mono text-xs space-y-1 text-muted-foreground order-2 md:order-1">
            <p className="text-primary"># Headers on every callback</p>
            <p>X-AutoHub-Timestamp: <span className="text-warning">1714000000</span></p>
            <p>X-AutoHub-Signature: <span className="text-success">sha256=a3f…</span></p>
            <p className="pt-2 text-primary"># Verify in n8n</p>
            <p>HMAC-SHA256(secret,</p>
            <p className="pl-4"><span className="text-success">&quot;timestamp.executionId.body&quot;</span>)</p>
          </div>
          <div className="space-y-3 order-1 md:order-2">
            <div className="inline-flex items-center gap-2 text-xs text-primary font-medium">
              <Shield className="h-4 w-4" /> Callback Security
            </div>
            <h2 className="text-2xl font-display font-bold">Industry-standard HMAC signing</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Each tool gets a unique signing secret. Async callbacks are verified with HMAC-SHA256 and a ±300s timestamp window —
              the same pattern used by Stripe, GitHub, and Shopify webhooks.
            </p>
          </div>
        </section>

        {/* RBAC */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs text-primary font-medium">
              <Lock className="h-4 w-4" /> Role-Based Access Control
            </div>
            <h2 className="text-2xl font-display font-bold">Three-tier access model</h2>
            <div className="space-y-2 text-sm">
              {[
                { role: "User", desc: "Runs approved tools, manages credit wallet" },
                { role: "Moderator", desc: "Creates tools, sets visibility, grants private access" },
                { role: "Admin", desc: "Approves tools, governs users, infinite credits" },
              ].map(({ role, desc }) => (
                <div key={role} className="flex gap-3">
                  <span className="text-primary font-semibold w-24 shrink-0">{role}</span>
                  <span className="text-muted-foreground text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass rounded-xl p-4 space-y-2">
            {[
              { label: "Public tools", color: "bg-success" },
              { label: "Private (owner only)", color: "bg-warning" },
              { label: "Private (granted users)", color: "bg-primary" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${color}`} />
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center space-y-4 py-8">
          <h2 className="text-2xl font-display font-bold">Ready to automate?</h2>
          <p className="text-sm text-muted-foreground">Start free. 10 credits included. No credit card required.</p>
          <Button asChild variant="hero" size="lg" className="border-glow shadow-glow">
            <Link href="/auth/signup">Get Started Free</Link>
          </Button>
        </section>

      </main>
      <Footer />
    </>
  );
}
