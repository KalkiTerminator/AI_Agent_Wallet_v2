"use client";
import { useState, useMemo, useEffect, Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCredits } from "@/hooks/useCredits";
import { useTools } from "@/hooks/useTools";
import { useSubscription } from "@/hooks/useSubscription";
import { ToolCard } from "@/components/dashboard/ToolCard";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { LayoutToggle, type DashboardLayout } from "@/components/dashboard/LayoutToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Zap, PackageOpen, Wrench } from "lucide-react";
import type { AITool } from "@/types";
import { TOOL_CATEGORIES, SUBSCRIPTION_TIERS, CREDIT_TIERS } from "@autohub/shared";

// ── Payment banner handler ────────────────────────────────────────────────────
function PaymentBannerHandler({ onBanner }: { onBanner: (v: "success" | "cancelled" | null) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success" || payment === "cancelled") {
      onBanner(payment);
      router.replace("/dashboard");
      const timer = setTimeout(() => onBanner(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, onBanner]);
  return null;
}

// ── Account Panel ────────────────────────────────────────────────────────────
function AccountPanel({
  credits,
  deckCount,
  favoriteCount,
}: {
  credits: number | null;
  deckCount: number;
  favoriteCount: number;
}) {
  const { subscription, loading: subLoading } = useSubscription();
  const isPro = subscription?.subscribed ?? false;
  const planName = subLoading ? "…" : isPro ? SUBSCRIPTION_TIERS.PRO.name.toUpperCase() : "FREE";
  // Progress is measured against the plan's credit allowance — 500/mo on Pro,
  // the signup grant on Free — so the bar means "runway left on your plan".
  const allowance = isPro ? SUBSCRIPTION_TIERS.PRO.credits : CREDIT_TIERS.FREE.creditsOnSignup;
  const pct = Math.min(100, ((credits ?? 0) / allowance) * 100);

  return (
    <div className="tick-frame tick-signal border border-border p-4 space-y-4 h-fit bg-card">
      <div className="flex items-center justify-between">
        <p className="microlabel">Wallet</p>
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <p className="font-display text-3xl font-bold tabular-nums leading-none">{credits ?? "—"}</p>
        <p className="microlabel mt-1.5">Credits available</p>
        <Progress value={pct} className="h-1 mt-3 bg-muted [&>div]:bg-primary" aria-label={`${credits ?? 0} of ${allowance} plan credits`} />
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-2 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Plan</span>
          <span className={isPro ? "text-primary" : "text-foreground"}>{planName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Deck</span>
          <span className="text-foreground tabular-nums">{deckCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Faves</span>
          <span className="text-foreground tabular-nums">{favoriteCount}</span>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        className="w-full h-9 rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] shadow-glow"
      >
        <Link href="/billing">{isPro ? "Manage plan" : "+ Upgrade"}</Link>
      </Button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session } = useSession();
  const { credits } = useCredits();
  const { tools, loading: toolsLoading, favorites, toggleFavorite } = useTools();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [layout, setLayout] = useState<DashboardLayout>("grid");
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<"success" | "cancelled" | null>(null);

  const role = session?.user?.role ?? "user";
  const canCreateTools = role === "admin" || role === "moderator";
  // Prefer the human name; fall back to the email's local part, never the raw
  // address. After an MFA login NextAuth stores the email as `name` (the
  // step-up response carries no fullName), so an @ in the name means email.
  const rawName = session?.user?.name?.trim();
  const displayName =
    rawName && !rawName.includes("@")
      ? rawName
      : (session?.user?.email ?? rawName ?? "operator").split("@")[0];

  const filtered = useMemo(() => {
    let list = tools;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    if (category === "★ Favorites") {
      list = list.filter((t) => favorites.has(t.id));
    } else if (category !== "All") {
      list = list.filter((t) => t.category === category);
    }
    return list;
  }, [tools, search, category, favorites]);

  const openTool = (tool: AITool) => {
    setSelectedTool(tool);
    setDialogOpen(true);
  };

  const gridClass =
    layout === "list"
      ? "grid-cols-1"
      : layout === "comfortable"
      ? "grid-cols-2 md:grid-cols-3"
      : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="flex flex-1 min-h-0 h-full">
      <Suspense>
        <PaymentBannerHandler onBanner={setPaymentBanner} />
      </Suspense>

      {/* Main content */}
      <div className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-border shrink-0">
          <div className="flex-1 flex items-center gap-2">
            <span className="status-dot status-dot-active" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {toolsLoading ? "Scanning deck…" : `${filtered.length} of ${tools.length} tools armed`}
            </span>
          </div>
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>

        <div className="px-6 py-6 space-y-6 flex-1">
          {paymentBanner && (
            <div
              role="status"
              className={`tick-frame border px-4 py-3 font-mono text-xs ${
                paymentBanner === "success"
                  ? "border-success/50 bg-success/10 text-success"
                  : "border-warning/50 bg-warning/10 text-warning"
              }`}
            >
              {paymentBanner === "success"
                ? "✓ Payment received — credits are on their way to your wallet."
                : "Payment cancelled — no charge was made."}
            </div>
          )}

          {/* Welcome header */}
          <div className="rise" style={{ "--rise-delay": "0ms" } as CSSProperties}>
            <p className="microlabel microlabel-signal mb-2">Console / Tool deck</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Welcome back, <span className="text-gradient">{displayName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Choose an instrument. Every execution is signed, metered, and logged.
            </p>
          </div>

          {/* Search */}
          <div className="relative rise" style={{ "--rise-delay": "90ms" } as CSSProperties}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search the deck…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-sm bg-muted/40 border-border/60 font-mono text-sm focus-visible:ring-primary"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 border border-border px-1.5 py-0.5 hidden sm:block">
              ⌘K
            </kbd>
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1.5 flex-wrap rise" style={{ "--rise-delay": "180ms" } as CSSProperties}>
            {["All", "★ Favorites", ...TOOL_CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={`px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] border transition-all duration-300 ${
                  category === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tool deck */}
          <div className="rise" style={{ "--rise-delay": "270ms" } as CSSProperties}>
            <div className="flex items-center gap-2.5 mb-4">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <h2 className="microlabel !text-foreground">Tool deck</h2>
              <Badge className="font-mono text-[9px] uppercase tracking-[0.15em] bg-primary/10 text-primary border border-primary/30 rounded-none px-2 py-0">
                ● Live
              </Badge>
              <div className="flex-1 h-px bg-border" />
            </div>

            {toolsLoading ? (
              <div className={`grid gap-4 ${gridClass}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className={layout === "list" ? "h-12" : "h-[148px]"} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              search || category !== "All" ? (
                <EmptyState
                  icon={Search}
                  title="No tools match"
                  description={search ? `Nothing in the deck matches "${search}".` : "No tools in this category yet."}
                />
              ) : canCreateTools ? (
                <EmptyState
                  icon={Wrench}
                  title="The deck is empty"
                  description="Register your first webhook as a tool — paste an n8n/Zapier URL, set a credit cost, submit for approval."
                  action={
                    <Button asChild size="sm" className="rounded-sm font-mono text-[10px] uppercase tracking-[0.18em]">
                      <Link href="/tools/new">+ Register a tool</Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={PackageOpen}
                  title="No tools published yet"
                  description="The marketplace is being stocked. Check back soon — approved tools appear here automatically."
                />
              )
            ) : (
              <div className={`grid gap-4 ${gridClass}`}>
                {filtered.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    credits={credits ?? 0}
                    layout={layout}
                    onUse={() => openTool(tool)}
                    isFavorite={favorites.has(tool.id)}
                    onToggleFavorite={() => toggleFavorite(tool.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right account panel */}
      <div className="w-56 shrink-0 border-l border-border p-4 hidden lg:flex flex-col gap-4">
        <AccountPanel credits={credits} deckCount={tools.length} favoriteCount={favorites.size} />
        <LiveFeed />
      </div>

      <ToolExecuteDialog
        tool={selectedTool}
        credits={credits}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
