"use client";
import { useState, useMemo, useEffect, Suspense, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCredits } from "@/hooks/useCredits";
import { useTools } from "@/hooks/useTools";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Play, Zap, Grid3X3, LayoutGrid, List } from "lucide-react";
import type { AITool } from "@/types";
import { TOOL_CATEGORIES } from "@autohub/shared";

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

type Layout = "grid" | "comfortable" | "list";

// ── Tool Card ────────────────────────────────────────────────────────────────
function ToolCard({ tool, credits, onUse }: { tool: AITool; credits: number; onUse: () => void }) {
  const canAfford = credits >= tool.creditCost;

  return (
    <div className="tick-frame group bg-card border border-border p-4 flex flex-col gap-3 hover:border-primary/50 hover:-translate-y-1 hover:shadow-glow transition-all duration-300 ease-out-expo">
      <div className="flex items-start justify-between">
        <span className="status-dot status-dot-active opacity-60 group-hover:opacity-100 transition-opacity mt-1" />
        <Badge
          variant="secondary"
          className="text-[10px] font-mono px-2 py-0.5 rounded-none bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary transition-colors"
        >
          {tool.creditCost} CR
        </Badge>
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-display text-sm font-semibold leading-tight tracking-tight">{tool.name}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{tool.description}</p>
      </div>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0 h-5 rounded-none">
          {tool.category}
        </Badge>
        <Button
          size="sm"
          onClick={onUse}
          disabled={!canAfford}
          className="h-7 text-[10px] font-mono uppercase tracking-[0.12em] px-3 gap-1 rounded-sm"
        >
          <Play className="h-2.5 w-2.5 fill-current" />
          Run
        </Button>
      </div>
    </div>
  );
}

// ── Account Panel ────────────────────────────────────────────────────────────
function AccountPanel({
  credits,
  liveCount,
  soonCount,
}: {
  credits: number | null;
  liveCount: number;
  soonCount: number;
}) {
  const MAX_FREE_CREDITS = 100;
  const pct = Math.min(100, ((credits ?? 0) / MAX_FREE_CREDITS) * 100);

  return (
    <div className="tick-frame tick-signal border border-border p-4 space-y-4 h-fit bg-card">
      <div className="flex items-center justify-between">
        <p className="microlabel">Wallet</p>
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <p className="font-display text-3xl font-bold tabular-nums leading-none">{credits ?? "—"}</p>
        <p className="microlabel mt-1.5">Credits available</p>
        <Progress value={pct} className="h-1 mt-3 bg-muted [&>div]:bg-primary" />
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-2 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Plan</span>
          <span className="text-foreground">FREE</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Live</span>
          <span className="text-primary">{liveCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground uppercase tracking-[0.12em]">Soon</span>
          <span className="text-foreground">{soonCount}</span>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full h-9 rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] shadow-glow"
      >
        + Upgrade
      </Button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session } = useSession();
  const { credits } = useCredits();
  const { tools, loading: toolsLoading } = useTools();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [layout, setLayout] = useState<Layout>("grid");
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, setPaymentBanner] = useState<"success" | "cancelled" | null>(null);

  const displayName = session?.user?.name || session?.user?.email || "there";

  const filtered = useMemo(() => {
    let list = tools;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    if (category !== "All") {
      list = list.filter((t) => t.category === category);
    }
    return list;
  }, [tools, search, category]);

  const liveCount = filtered.length;
  const soonCount = useMemo(() => Math.max(0, tools.length - filtered.length), [tools, filtered]);

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
              {toolsLoading ? "Scanning deck…" : `${filtered.length} tools armed`}
            </span>
          </div>
          <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
            <Button
              variant={layout === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0 rounded-md"
              onClick={() => setLayout("grid")}
            >
              <Grid3X3 className="h-3 w-3" />
            </Button>
            <Button
              variant={layout === "comfortable" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0 rounded-md"
              onClick={() => setLayout("comfortable")}
            >
              <LayoutGrid className="h-3 w-3" />
            </Button>
            <Button
              variant={layout === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0 rounded-md"
              onClick={() => setLayout("list")}
            >
              <List className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6 flex-1">
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
            {["All", ...TOOL_CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
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

          {/* Featured Tools */}
          <div className="rise" style={{ "--rise-delay": "270ms" } as CSSProperties}>
            <div className="flex items-center gap-2.5 mb-4">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <h2 className="microlabel !text-foreground">Featured tools</h2>
              <Badge className="font-mono text-[9px] uppercase tracking-[0.15em] bg-primary/10 text-primary border border-primary/30 rounded-none px-2 py-0">
                ● Live
              </Badge>
              <div className="flex-1 h-px bg-border" />
            </div>

            {toolsLoading ? (
              <div className={`grid gap-4 ${gridClass}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm">
                {search ? `No tools found for "${search}"` : "No tools available yet"}
              </div>
            ) : (
              <div className={`grid gap-4 ${gridClass}`}>
                {filtered.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    credits={credits ?? 0}
                    onUse={() => openTool(tool)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right account panel */}
      <div className="w-56 shrink-0 border-l border-border p-4 hidden lg:flex flex-col">
        <AccountPanel credits={credits} liveCount={liveCount} soonCount={soonCount} />
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
