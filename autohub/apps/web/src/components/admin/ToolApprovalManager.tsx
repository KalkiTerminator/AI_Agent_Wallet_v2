"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, Clock, ChevronDown } from "lucide-react";
import { ToolReviewChecklist, isChecklistComplete, type ReviewChecklist } from "./ToolReviewChecklist";
import type { AITool } from "@/types";

interface Props {
  tools: AITool[];
  onToolsChange: (tools: AITool[]) => void;
}

export function ToolApprovalManager({ tools, onToolsChange }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [checklists, setChecklists] = useState<Record<string, Partial<ReviewChecklist>>>({});
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);

  const pending = tools.filter((t) => t.approvalStatus === "pending");

  async function handleStatus(toolId: string, status: "approved" | "rejected") {
    if (!session?.apiToken) return;
    setBusy(toolId);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/tools/${toolId}/status`,
        {
          status,
          reason: rejectReason[toolId],
          ...(status === "approved" && { reviewChecklist: checklists[toolId] }),
        },
        session.apiToken
      );
      onToolsChange(tools.map((t) => t.id === toolId ? { ...t, ...res.data } : t));
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No tools pending approval.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-warning" />
        <span className="text-sm font-semibold">Pending Approvals</span>
        <Badge variant="secondary" className="text-[10px] ml-1">{pending.length}</Badge>
      </div>
      <div className="space-y-2">
        {pending.map((tool) => {
          const checklist = checklists[tool.id] ?? {};
          const canApprove = isChecklistComplete(checklist);
          const isOpen = openChecklist === tool.id;

          return (
            <div key={tool.id} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.category} · {tool.creditCost}cr</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] text-success border-success/30 hover:bg-success/10"
                    disabled={busy === tool.id || !canApprove}
                    onClick={() => handleStatus(tool.id, "approved")}
                    title={!canApprove ? "Complete the checklist to approve" : undefined}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={busy === tool.id}
                    onClick={() => handleStatus(tool.id, "rejected")}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Rejection reason (optional)…"
                className="h-6 text-[10px]"
                value={rejectReason[tool.id] ?? ""}
                onChange={(e) => setRejectReason((prev) => ({ ...prev, [tool.id]: e.target.value }))}
              />
              <Collapsible open={isOpen} onOpenChange={(o) => setOpenChecklist(o ? tool.id : null)}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    Review checklist {canApprove ? "✓" : `(${Object.values(checklist).filter(Boolean).length}/6)`}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ToolReviewChecklist
                    value={checklist}
                    onChange={(updated) => setChecklists((prev) => ({ ...prev, [tool.id]: updated }))}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>
    </div>
  );
}
