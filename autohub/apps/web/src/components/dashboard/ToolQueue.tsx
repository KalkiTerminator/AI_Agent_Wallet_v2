import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Trash2, CheckCircle, XCircle, Loader2, ListOrdered } from "lucide-react";
import type { QueueItem } from "@/hooks/useToolQueue";

interface ToolQueueProps {
  queue: QueueItem[];
  isProcessing: boolean;
  onProcess: () => void;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string }> = {
  pending: { icon: ListOrdered, color: "text-muted-foreground" },
  processing: { icon: Loader2, color: "text-primary" },
  success: { icon: CheckCircle, color: "text-success" },
  failed: { icon: XCircle, color: "text-destructive" },
};

export function ToolQueue({ queue, isProcessing, onProcess, onRemove, onClearCompleted }: ToolQueueProps) {
  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const doneCount = queue.filter((i) => i.status === "success" || i.status === "failed").length;

  if (queue.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 rounded-lg">
          <ListOrdered className="h-3 w-3" />
          Queue
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 rounded">{queue.length}</Badge>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 p-3">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-sm">Tool Queue</SheetTitle>
        </SheetHeader>
        <div className="flex gap-1.5 mb-3">
          <Button size="sm" className="h-6 text-[11px] flex-1" onClick={onProcess} disabled={isProcessing || pendingCount === 0}>
            {isProcessing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running…</> : <><Play className="h-3 w-3 mr-1" />Run All ({pendingCount})</>}
          </Button>
          {doneCount > 0 && (
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onClearCompleted}>
              Clear
            </Button>
          )}
        </div>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="space-y-1.5">
            {queue.map((item) => {
              const cfg = statusConfig[item.status];
              const Icon = cfg.icon;
              return (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg glass-subtle">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color} ${item.status === "processing" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{item.toolName}</p>
                    {item.error && <p className="text-[10px] text-destructive truncate">{item.error}</p>}
                  </div>
                  {item.status === "pending" && (
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onRemove(item.id)}>
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
