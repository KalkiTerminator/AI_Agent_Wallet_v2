"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { useSubscription } from "@/hooks/useSubscription";
import { useCredits } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
      const res = await apiClient.post<{ url: string }>(
        "/api/payments/checkout/credits",
        { pack: key },
        session.apiToken
      );
      if (res.url) window.location.href = res.url;
    } finally {
      setPackLoading(null);
    }
  }

  async function handleSubscribe(tier: string) {
    if (!session?.apiToken) return;
    const priceId = SUBSCRIPTION_PRICE_IDS[tier];
    if (!priceId) return;
    setSubPending(tier);
    try {
      const res = await apiClient.post<{ url: string }>(
        "/api/payments/checkout/subscription",
        { priceId },
        session.apiToken
      );
      if (res.url) window.location.href = res.url;
    } finally {
      setSubPending(null);
    }
  }

  async function handlePortal() {
    if (!session?.apiToken) return;
    setPortalLoading(true);
    try {
      // stripeCustomerId is returned by the subscriptions status endpoint
      // for now we send an empty string and let the server look it up
      const res = await apiClient.post<{ url: string }>(
        "/api/payments/portal",
        { stripeCustomerId: "" },
        session.apiToken
      );
      if (res.url) window.location.href = res.url;
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h1 className="font-display font-bold text-xl">Billing</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage credits and subscriptions</p>
      </div>

      {/* Current balance */}
      <div className="glass rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Credit balance</p>
          {creditsLoading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <p className="text-2xl font-bold font-mono">{credits ?? 0}</p>
          )}
        </div>
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
          <Zap className="h-5 w-5 text-white" />
        </div>
      </div>

      {/* Subscription status */}
      {!subLoading && isSubscribed && (
        <div className="glass rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Active Subscription</h2>
            <Badge variant="outline" className="text-[10px] text-success border-success/30 gap-1">
              <CheckCircle className="h-2.5 w-2.5" />
              active
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {subscription?.subscriptionEnd && (
              <p>
                {subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}{" "}
                <span className="text-foreground font-medium">
                  {new Date(subscription.subscriptionEnd).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handlePortal}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            Manage subscription
          </Button>
        </div>
      )}

      {/* Credit packs */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Buy Credits</h2>
          <p className="text-xs text-muted-foreground mt-0.5">One-time purchase, never expires</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.credits}
              className="glass rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors"
            >
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {pack.label}
                </p>
                <p className="text-2xl font-bold font-mono mt-0.5">{pack.credits}</p>
                <p className="text-[10px] text-muted-foreground">credits</p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">${pack.price.toFixed(2)}</p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleBuyCreditPack(pack.credits)}
                  disabled={packLoading === String(pack.credits)}
                >
                  {packLoading === String(pack.credits) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Buy"
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription tiers */}
      {!isSubscribed && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Subscription Plans</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monthly credits that refresh automatically
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(SUBSCRIPTION_TIERS)
              .filter(([key]) => key !== "FREE")
              .map(([key, tier]) => {
                const isPro = key === "PRO";
                return (
                  <div
                    key={key}
                    className={cn(
                      "glass rounded-xl p-5 flex flex-col gap-4",
                      isPro && "border-primary/40"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{tier.name}</p>
                          {isPro && (
                            <Badge className="text-[9px] px-1.5 py-0 h-4">Popular</Badge>
                          )}
                        </div>
                        <p className="text-xl font-bold font-mono mt-1">
                          {tier.price === -1 ? "Custom" : `$${tier.price}`}
                          {tier.price !== -1 && (
                            <span className="text-xs font-normal text-muted-foreground">/mo</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground flex-1">
                      {tier.credits > 0 ? (
                        <>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            {tier.credits} credits / month
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            Credits refresh monthly
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            Priority support
                          </li>
                        </>
                      ) : (
                        <>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            Custom credit volume
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            Dedicated support
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3 text-success shrink-0" />
                            SLA guarantee
                          </li>
                        </>
                      )}
                    </ul>
                    {tier.price === -1 ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs w-full" asChild>
                        <a href="mailto:hello@autohub.dev">Contact sales</a>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs w-full"
                        variant={isPro ? "default" : "outline"}
                        onClick={() => handleSubscribe(key)}
                        disabled={subPending === key}
                      >
                        {subPending === key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <CreditCard className="h-3 w-3 mr-1.5" />
                            Subscribe
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
