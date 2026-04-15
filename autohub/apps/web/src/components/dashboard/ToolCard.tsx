import { useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Zap, Heart, ListPlus, Loader2, Send } from "lucide-react";
import type { AITool, InputField } from "@/types";
import type { DashboardLayout } from "@/components/dashboard/LayoutToggle";

interface ToolCardProps {
  tool: AITool;
  credits: number;
  onUse: () => void;
  layout?: DashboardLayout;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToQueue?: (inputData: Record<string, any>) => void;
}

export const ToolCard = ({ tool, credits, onUse, layout = "compact", isFavorite, onToggleFavorite, onAddToQueue }: ToolCardProps) => {
  const canAfford = credits >= tool.creditCost;
  const ref = useRef<HTMLDivElement>(null);
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [inlineValue, setInlineValue] = useState("");
  const [showInline, setShowInline] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setSpotlightPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Detect single-text-input tools for inline quick-use
  const fields = Array.isArray(tool.inputFields)
    ? tool.inputFields
    : Object.entries(tool.inputFields ?? {}).map(([name, config]) => ({ name, ...(config as any) }));
  const isSingleInput = fields.length === 1 && (fields[0].type === "text" || fields[0].type === "textarea");
  const singleField = isSingleInput ? fields[0] : null;

  const handleInlineRun = () => {
    if (!singleField || !inlineValue.trim()) return;
    // Trigger the full dialog flow with pre-filled data
    onUse();
  };

  if (layout === "list") {
    return (
      <div ref={ref} className="relative group">
        <Card className="glass-subtle hover:shadow-medium transition-all duration-300 overflow-hidden relative rounded-lg">
          <div className="flex items-center gap-3 p-2.5">
            <div className="text-lg shrink-0 transition-transform duration-300 group-hover:scale-110">{tool.iconUrl}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold truncate">{tool.name}</span>
                <Badge variant="outline" className="text-[9px] rounded-md px-1.5 py-0 h-4 shrink-0">{tool.category}</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="secondary" className="text-[10px] font-mono rounded-md px-1.5 py-0 h-5">{tool.creditCost} cr</Badge>
              {onToggleFavorite && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
                  <Heart className={`h-3 w-3 ${isFavorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </Button>
              )}
              <Button onClick={onUse} size="sm" variant={canAfford ? "default" : "secondary"} disabled={!canAfford} className="rounded-lg h-6 text-[11px] px-2.5">
                {canAfford ? <><Play className="mr-0.5 h-2.5 w-2.5" />Use</> : <><Zap className="mr-0.5 h-2.5 w-2.5" />Credits</>}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowInline(false); }}
      className="relative group"
    >
      <Card className="h-full glass-subtle hover:shadow-medium transition-all duration-300 hover:-translate-y-1 overflow-hidden relative rounded-xl">
        <div
          className="absolute inset-0 rounded-xl pointer-events-none z-10 transition-opacity duration-300"
          style={{
            background: isHovered
              ? `radial-gradient(250px circle at ${spotlightPos.x}px ${spotlightPos.y}px, hsl(var(--primary) / 0.08), transparent 60%)`
              : "none",
            opacity: isHovered ? 1 : 0,
          }}
        />

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-300" />

        <CardHeader className="pb-1.5 relative z-20 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xl transition-all duration-300 group-hover:scale-110">
              {tool.iconUrl}
            </div>
            <div className="flex items-center gap-1">
              {onToggleFavorite && (
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
                  <Heart className={`h-3 w-3 ${isFavorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </Button>
              )}
              <Badge variant="secondary" className="text-[10px] font-mono rounded-md px-1.5 py-0 h-5">
                {tool.creditCost} cr
              </Badge>
            </div>
          </div>
          <CardTitle className="text-xs mt-1 leading-tight">{tool.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 relative z-20 p-3 pt-0">
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {tool.description}
          </p>

          {/* Inline quick-use for single-input tools */}
          {isSingleInput && showInline && canAfford && (
            <div className="flex gap-1 animate-fade-in">
              <Input
                value={inlineValue}
                onChange={(e) => setInlineValue(e.target.value)}
                placeholder={singleField?.placeholder || singleField?.label || "Enter…"}
                className="h-6 text-[10px] rounded-md"
                onKeyDown={(e) => e.key === "Enter" && handleInlineRun()}
              />
              <Button size="sm" className="h-6 w-6 p-0 shrink-0 rounded-md" onClick={handleInlineRun}>
                <Send className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[9px] rounded-md px-1.5 py-0 h-4">
              {tool.category}
            </Badge>

            <div className="flex items-center gap-1">
              {onAddToQueue && canAfford && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
                  onClick={(e) => { e.stopPropagation(); onAddToQueue({}); }}
                  title="Add to Queue"
                >
                  <ListPlus className="h-3 w-3" />
                </Button>
              )}
              {isSingleInput && canAfford ? (
                <Button
                  onClick={() => setShowInline(!showInline)}
                  size="sm"
                  className="rounded-lg h-6 text-[11px] px-2.5 shadow-glow hover:shadow-[0_0_24px_hsl(var(--primary)/0.3)] transition-all duration-300"
                >
                  <Play className="mr-0.5 h-2.5 w-2.5" />Quick
                </Button>
              ) : (
                <Button
                  onClick={onUse}
                  size="sm"
                  variant={canAfford ? "default" : "secondary"}
                  disabled={!canAfford}
                  className={`rounded-lg h-6 text-[11px] px-2.5 ${canAfford ? "shadow-glow hover:shadow-[0_0_24px_hsl(var(--primary)/0.3)] transition-all duration-300" : "transition-all duration-200"}`}
                >
                  {canAfford ? <><Play className="mr-0.5 h-2.5 w-2.5" />Use</> : <><Zap className="mr-0.5 h-2.5 w-2.5" />Credits</>}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
