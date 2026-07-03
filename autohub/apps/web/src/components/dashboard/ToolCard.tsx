"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Heart, Star } from "lucide-react";
import type { AITool } from "@/types";
import type { DashboardLayout } from "@/components/dashboard/LayoutToggle";

interface ToolCardProps {
  tool: AITool;
  credits: number;
  onUse: () => void;
  layout?: DashboardLayout;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

/**
 * The one tool card — instrument-panel style, grid and list variants.
 */
export function ToolCard({ tool, credits, onUse, layout = "grid", isFavorite, onToggleFavorite }: ToolCardProps) {
  const canAfford = credits >= tool.creditCost;

  const favoriteButton = (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      className="shrink-0 -m-1 p-1 transition-colors"
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart className={`h-3.5 w-3.5 transition-all ${isFavorite ? "fill-primary text-primary" : "text-muted-foreground/50 hover:text-foreground"}`} />
    </button>
  );

  const rating = tool.ratingCount ? (
    <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground" title={`${tool.ratingCount} rating${tool.ratingCount === 1 ? "" : "s"}`}>
      <Star className="h-2.5 w-2.5 fill-warning text-warning" />
      {tool.avgRating?.toFixed(1)}
    </span>
  ) : null;

  const runButton = (
    <Button
      size="sm"
      onClick={onUse}
      disabled={!canAfford}
      title={canAfford ? undefined : "Not enough credits"}
      className="h-7 text-[10px] font-mono uppercase tracking-[0.12em] px-3 gap-1 rounded-sm"
    >
      <Play className="h-2.5 w-2.5 fill-current" />
      Run
    </Button>
  );

  if (layout === "list") {
    return (
      <div className="tick-frame group bg-card border border-border px-4 py-2.5 flex items-center gap-4 hover:border-primary/50 transition-all duration-300 ease-out-expo">
        {favoriteButton}
        <div className="flex-1 min-w-0 flex items-baseline gap-3">
          <p className="font-display text-sm font-semibold leading-tight tracking-tight truncate">{tool.name}</p>
          <p className="text-[11px] text-muted-foreground truncate hidden sm:block">{tool.description}</p>
        </div>
        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0 h-5 rounded-none shrink-0 hidden md:inline-flex">
          {tool.category}
        </Badge>
        {rating}
        <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 rounded-none bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary transition-colors shrink-0">
          {tool.creditCost} CR
        </Badge>
        {runButton}
      </div>
    );
  }

  return (
    <div className="tick-frame group bg-card border border-border p-4 flex flex-col gap-3 hover:border-primary/50 hover:-translate-y-1 hover:shadow-glow transition-all duration-300 ease-out-expo">
      <div className="flex items-start justify-between">
        {favoriteButton}
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
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0 h-5 rounded-none shrink-0">
          {tool.category}
        </Badge>
        {rating}
        <span className="ml-auto">{runButton}</span>
      </div>
    </div>
  );
}
