"use client";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCredits } from "@/hooks/useCredits";
import { useTools } from "@/hooks/useTools";
import { useSubscription } from "@/hooks/useSubscription";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Play, Zap, Grid3X3, LayoutGrid, List } from "lucide-react";
import type { AITool } from "@/types";
import { TOOL_CATEGORIES } from "@autohub/shared";

// ── Payment banner handler (needs Suspense for useSearchParams) ──────────────
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

// ── Layout toggle ────────────────────────────────────────────────────────────
type Layout = "grid" | "comfortable" | "list";

// ── Tool Card ────────────────────────────────────────────────────────────────
function ToolCard({ tool, credits, onUse }: { tool: AITool; credits: number; onUse: () => void }) {
  const canAfford = credits >= tool.creditCost;

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between">
        <span className="text-2xl">{tool.iconUrl || "🤖"}</span>
        <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-full">
          {tool.creditCost} cr
        </Badge>
      </div>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold leading-tight">{tool.name}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{tool.description}</p>
      </div>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 rounded-full">
          {tool.category}
        </Badge>
        <Button
          size="sm"
          onClick={onUse}
          disabled={!canAfford}
          className="h-7 text-[11px] px-3 gap-1 rounded-full bg-primary hover:bg-primary/90"
        >
          <Play className="h-2.5 w-2.5" />
          Quick
        </Button>
      </div>
    </div>
  );
}

// ── Account Panel ────────────────────────────────────────────────────────────
function AccountPanel({ credits, toolCount }: { credits: number | null; toolCount: number }) {
  const MAX_FREE_CREDITS = 100;
  const pct = Math.min(100, ((credits ?? 0) / MAX_FREE_CREDITS) * 100);

  return (
    <div className="w-56 shrink-0 border border-border rounded-xl p-4 space-y-3 h-fit">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Account</p>
        <Zap className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Credits</span>
          <span className="font-mono font-semibold">{credits ?? "—"}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Plan</span>
        <span className="font-medium">Free</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Live</span>
        <span className="font-medium">{toolCount}</span>
      </div>
      <Button size="sm" className="w-full h-8 text-xs rounded-full bg-primary hover:bg-primary/90 gap-1.5">
        <span>+</span> Upgrade
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
    <div className="flex flex-1 min-h-0">
      <Suspense>
        <PaymentBannerHandler onBanner={setPaymentBanner} />
      </Suspense>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
          <div className="flex-1 text-xs text-muted-foreground">
            <Zap className="inline h-3.5 w-3.5 mr-1 text-primary" />
            {toolsLoading ? "Loading…" : `${filtered.length} tools`}
          </div>
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
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

        <div className="px-6 py-6 space-y-6">
          {/* Welcome header */}
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose from powerful AI tools to supercharge your workflow
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search AI tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-muted/50 border-border/50"
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {["All", ...TOOL_CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Featured Tools section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Featured Tools</h2>
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 rounded-full px-2 py-0">
                Live
              </Badge>
            </div>

            {toolsLoading ? (
              <div className={`grid gap-4 ${gridClass}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
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
      <div className="w-64 shrink-0 border-l border-border p-4 hidden lg:block">
        <AccountPanel credits={credits} toolCount={filtered.length} />
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
