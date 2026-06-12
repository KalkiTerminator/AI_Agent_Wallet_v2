"use client";
import { useState } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataPanel } from "@/components/shared/DataPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileViewer } from "@/components/shared/FileViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, History, Eye } from "lucide-react";
import type { ToolUsageRow } from "@/types";

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ToolUsageRow["status"] }) {
  if (status === "success")
    return <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] text-success border-success/30 gap-1 rounded-none"><CheckCircle className="h-2.5 w-2.5" />ok</Badge>;
  if (status === "failed" || status === "refunded")
    return <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-[0.12em] text-destructive border-destructive/30 gap-1 rounded-none"><XCircle className="h-2.5 w-2.5" />{status}</Badge>;
  return <Badge variant="secondary" className="font-mono text-[9px] uppercase tracking-[0.12em] gap-1 rounded-none"><Loader2 className="h-2.5 w-2.5 animate-spin" />{status}</Badge>;
}

export default function UsagePage() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApiQuery<{ data: ToolUsageRow[]; meta: { total: number } }>(
    `/api/tools/usage?page=${page}&limit=${PAGE_SIZE}`
  );
  const [selected, setSelected] = useState<ToolUsageRow | null>(null);

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        label="CONSOLE / Usage history"
        title="Execution log"
        description={`${total} total execution${total === 1 ? "" : "s"} across your tools`}
      />

      {loading ? (
        <DataPanel title="RECENT RUNS">
          <div className="divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </DataPanel>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No executions yet"
          description="Run a tool from the console and its history — inputs, status, and output — shows up here."
        />
      ) : (
        <DataPanel
          title="RECENT RUNS"
          actions={<span className="font-mono text-[10px] text-muted-foreground">PAGE {page}/{totalPages || 1}</span>}
        >
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-border/60 microlabel">
            <span>Tool</span><span>Status</span><span className="text-right">Credits</span><span>When</span><span className="text-right">Output</span>
          </div>
          <div className="divide-y divide-border/60">
            {rows.map((row) => {
              const hasOutput = row.status === "success" && row.outputData != null && row.outputData !== "";
              return (
                <div key={row.id} className="grid grid-cols-2 md:grid-cols-[1fr_auto_auto_auto_auto] gap-2 md:gap-4 items-center px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 col-span-2 md:col-span-1">
                    <span className="text-base shrink-0">{row.toolIcon ?? "🔧"}</span>
                    <span className="text-xs font-medium truncate">{row.toolName ?? "Unknown tool"}</span>
                  </div>
                  <StatusBadge status={row.status} />
                  <span className="font-mono text-xs text-right tabular-nums">{row.creditsUsed} cr</span>
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                    {new Date(row.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="text-right">
                    {hasOutput ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 rounded-sm" onClick={() => setSelected(row)}>
                        <Eye className="h-3 w-3" />View
                      </Button>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DataPanel>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Page {page} / {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Output history viewer */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-base flex items-center gap-2">
              <span>{selected?.toolIcon ?? "🔧"}</span>{selected?.toolName ?? "Output"}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.12em]">
              {selected && new Date(selected.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="max-h-[60vh] overflow-y-auto">
              <FileViewer data={selected.outputData} outputType={selected.outputType ?? "smart"} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
