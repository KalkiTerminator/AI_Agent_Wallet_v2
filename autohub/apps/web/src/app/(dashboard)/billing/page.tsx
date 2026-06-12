"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { useSubscription } from "@/hooks/useSubscription";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/shared/PageHeader";
import { Panel } from "@/components/shared/Panel";
import { StatTile } from "@/components/shared/StatTile";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Loader2, Zap, CreditCard, ExternalLink } from "lucide-react";
import { CREDIT_PACKS, SUBSCRIPTION_TIERS } from "@autohub/shared";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

const SUBSCRIPTION_PRICE_IDS: Record<string, string> = {
  PRO: env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",
};

export default function BillingPage() {
  const { data: session } = useSession();
  const { credits, loading: creditsLoading } = useCredits();
  const { subscription, loading: subLoading } = useSubscription();

  const [packLoading, setPackLoading] = useState<string | null>(null);
  const [subPending, setSubPending] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const isSubscribed = subscription?.subscribed === true;

  async function handleBuyCreditPack(credits: number) {
    if (!session?.apiToken) return;
    const key = String(credits);
    setPackLoading(key);
    try {
      const res = await apiClient.post<{ url: string }>("/api/payments/checkout/credits", { pack: key }, session.apiToken);
      if (res.url) window.location.href = res.url;
    } catch (e) {
      toast.error("Couldn't start checkout", e instanceof Error ? e.message : undefined);
    } finally {
      setPackLoading(null);
    }
  }

  async function handleSubscribe(tier: string) {
    if (!session?.apiToken) return;
    const priceId = SUBSCRIPTION_PRICE_IDS[tier];
    if (!priceId) { toast.error("This plan isn't configured yet."); return; }
    setSubPending(tier);
    try {
      const res = await apiClient.post<{ url: string }>("/api/payments/checkout/subscription", { priceId }, session.apiToken);
      if (res.url) window.location.href = res.url;
    } catch (e) {
      toast.error("Couldn't start subscription", e instanceof Error ? e.message : undefined);
    } finally {
      setSubPending(null);
    }
  }

  async function handlePortal() {
    if (!session?.apiToken) return;
    setPortalLoading(true);
    try {
      const res = await apiClient.post<{ url: string }>("/api/payments/portal", { stripeCustomerId: "" }, session.apiToken);
      if (res.url) window.location.href = res.url;
    } catch (e) {
      toast.error("Couldn't open billing portal", e instanceof Error ? e.message : undefined);
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <PageHeader label="OPERATOR / Billing" title="Credits & billing" description="Buy credits, manage your subscription." />

      {/* Current balance */}
      {creditsLoading ? (
        <Panel className="p-4"><Skeleton className="h-8 w-24" /></Panel>
      ) : (
        <StatTile label="Credit balance" value={credits ?? 0} icon={Zap} className="sm:max-w-xs" />
      )}

      {/* Subscription status */}
      {!subLoading && isSubscribed && (
        <Panel signal className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="microlabel">Active subscription</p>
            <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] text-success border-success/30 gap-1 rounded-none">
              <CheckCircle className="h-2.5 w-2.5" />active
            </Badge>
          </div>
          {subscription?.subscriptionEnd && (
            <p className="text-xs text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}{" "}
              <span className="text-foreground font-medium">
                {new Date(subscription.subscriptionEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </p>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-sm" onClick={handlePortal} disabled={portalLoading}>
            {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
            Manage subscription
          </Button>
        </Panel>
      )}

      {/* Credit packs */}
      <div className="space-y-3">
        <p className="microlabel">Credit packs · one-time, never expire</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <Panel key={pack.credits} className="p-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:border-primary/40">
              <div>
                <p className="microlabel">{pack.label}</p>
                <p className="font-display text-2xl font-bold tabular-nums mt-1.5">{pack.credits}</p>
                <p className="font-mono text-[10px] text-muted-foreground">credits</p>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <p className="font-mono text-sm font-semibold">${pack.price.toFixed(2)}</p>
                <Button size="sm" className="h-7 text-[11px] rounded-sm" onClick={() => handleBuyCreditPack(pack.credits)} disabled={packLoading === String(pack.credits)}>
                  {packLoading === String(pack.credits) ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buy"}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* Subscription tiers */}
      {!isSubscribed && (
        <div className="space-y-3">
          <p className="microlabel">Subscription plans · monthly credits that refresh</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(SUBSCRIPTION_TIERS)
              .filter(([key]) => key !== "FREE")
              .map(([key, tier]) => {
                const isPro = key === "PRO";
                return (
                  <Panel key={key} signal={isPro} className="p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-display text-sm font-semibold">{tier.name}</p>
                          {isPro && <Badge className="font-mono text-[8px] uppercase tracking-[0.15em] px-1.5 py-0 h-4 rounded-none">Popular</Badge>}
                        </div>
                        <p className="font-display text-xl font-bold tabular-nums mt-1">
                          {tier.price === -1 ? "Custom" : `$${tier.price}`}
                          {tier.price !== -1 && <span className="font-mono text-[10px] font-normal text-muted-foreground">/mo</span>}
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground flex-1">
                      {(tier.credits > 0
                        ? [`${tier.credits} credits / month`, "Credits refresh monthly", "Priority support"]
                        : ["Custom credit volume", "Dedicated support", "SLA guarantee"]
                      ).map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <CheckCircle className="h-3 w-3 text-success shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    {tier.price === -1 ? (
                      <Button variant="outline" size="sm" className="h-8 text-xs w-full rounded-sm" asChild>
                        <a href="mailto:hello@autohub.dev">Contact sales</a>
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 text-xs w-full rounded-sm" variant={isPro ? "default" : "outline"} onClick={() => handleSubscribe(key)} disabled={subPending === key}>
                        {subPending === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CreditCard className="h-3 w-3 mr-1.5" />Subscribe</>}
                      </Button>
                    )}
                  </Panel>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
