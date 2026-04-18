"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleLeft, ToggleRight, Archive } from "lucide-react";
import type { AITool } from "@/types";

interface Props {
  tools: AITool[];
  onToolsChange: (tools: AITool[]) => void;
}

export function ToolManagement({ tools, onToolsChange }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleActive(tool: AITool) {
    if (!session?.apiToken) return;
    setBusy(tool.id);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/admin/tools/${tool.id}`,
        { isActive: !tool.isActive },
        session.apiToken
      );
      onToolsChange(tools.map((t) => t.id === tool.id ? { ...t, ...res.data } : t));
    } finally {
      setBusy(null);
    }
  }

  async function archiveTool(tool: AITool) {
    if (!session?.apiToken) return;
    setBusy(tool.id);
    try {
      await apiClient.patch(`/api/tools/${tool.id}/status`, { status: "archived" }, session.apiToken);
      onToolsChange(tools.filter((t) => t.id !== tool.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Category</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs text-right">Cost</TableHead>
            <TableHead className="text-xs text-right">Enabled</TableHead>
            <TableHead className="text-xs text-right">Archive</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool) => (
            <TableRow key={tool.id}>
              <TableCell className="text-xs font-medium">{tool.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{tool.category}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-[10px] ${
                  tool.approvalStatus === "approved" ? "text-success border-success/30"
                  : tool.approvalStatus === "rejected" ? "text-destructive border-destructive/30"
                  : "text-muted-foreground"
                }`}>
                  {tool.approvalStatus ?? "pending"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-right font-mono">{tool.creditCost}cr</TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => toggleActive(tool)}
                  disabled={busy === tool.id}
                  className="opacity-80 hover:opacity-100 transition-opacity"
                >
                  {tool.isActive ? (
                    <ToggleRight className="h-4 w-4 text-success" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => archiveTool(tool)}
                  disabled={busy === tool.id}
                  className="opacity-60 hover:opacity-100 transition-opacity hover:text-destructive"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
