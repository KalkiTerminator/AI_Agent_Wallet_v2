"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import type { AITool } from "@/types";

interface Props {
  tools: AITool[];
  onToolsChange: (tools: AITool[]) => void;
}

export function ToolApprovalManager({ tools, onToolsChange }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const pending = tools.filter((t) => t.approvalStatus === "pending");

  async function handleStatus(toolId: string, status: "approved" | "rejected") {
    if (!session?.apiToken) return;
    setBusy(toolId);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/tools/${toolId}/status`,
        { status, reason: rejectReason[toolId] },
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
      <div className="glass rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Tool</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Cost</TableHead>
              <TableHead className="text-xs">Rejection Reason</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((tool) => (
              <TableRow key={tool.id}>
                <TableCell className="text-xs font-medium">{tool.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{tool.category}</TableCell>
                <TableCell className="text-xs font-mono">{tool.creditCost}cr</TableCell>
                <TableCell>
                  <Input
                    placeholder="Optional reason…"
                    className="h-6 text-[10px]"
                    value={rejectReason[tool.id] ?? ""}
                    onChange={(e) => setRejectReason((prev) => ({ ...prev, [tool.id]: e.target.value }))}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm" variant="outline"
                      className="h-6 px-2 text-[10px] text-success border-success/30 hover:bg-success/10"
                      disabled={busy === tool.id}
                      onClick={() => handleStatus(tool.id, "approved")}
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
