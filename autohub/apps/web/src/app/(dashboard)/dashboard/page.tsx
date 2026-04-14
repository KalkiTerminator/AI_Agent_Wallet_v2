"use client";
import { useState, useMemo } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useTools } from "@/hooks/useTools";
import { useToolQueue } from "@/hooks/useToolQueue";
import { ToolCard } from "@/components/dashboard/ToolCard";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { ToolQueue } from "@/components/dashboard/ToolQueue";
import { LayoutToggle } from "@/components/dashboard/LayoutToggle";
import type { DashboardLayout } from "@/components/dashboard/LayoutToggle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { AITool } from "@/types";
import { TOOL_CATEGORIES } from "@autohub/shared";

export default function DashboardPage() {
  const { credits } = useCredits();
  const { tools, loading: toolsLoading, favorites, toggleFavorite } = useTools();
  const { queue, isProcessing, addToQueue, processQueue, removeFromQueue, clearCompleted } = useToolQueue();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [layout, setLayout] = useState<DashboardLayout>("compact");
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = tools;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (category !== "all") {
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
      : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl">Tools</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {toolsLoading ? "Loading…" : `${filtered.length} tools available`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToolQueue
            queue={queue}
            isProcessing={isProcessing}
            onProcess={processQueue}
            onRemove={removeFromQueue}
            onClearCompleted={clearCompleted}
          />
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All categories</SelectItem>
            {TOOL_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tool Grid */}
      {toolsLoading ? (
        <div className={`grid gap-3 ${gridClass}`}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className={layout === "list" ? "h-12 rounded-lg" : "h-36 rounded-xl"} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No tools found {search ? `for "${search}"` : ""}
        </div>
      ) : (
        <div className={`grid gap-3 ${gridClass}`}>
          {filtered.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              credits={credits ?? 0}
              layout={layout}
              isFavorite={favorites.has(tool.id)}
              onToggleFavorite={() => toggleFavorite(tool.id)}
              onUse={() => openTool(tool)}
              onAddToQueue={(inputData) => addToQueue(tool.id, tool.name, inputData)}
            />
          ))}
        </div>
      )}

      <ToolExecuteDialog
        tool={selectedTool}
        credits={credits}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
