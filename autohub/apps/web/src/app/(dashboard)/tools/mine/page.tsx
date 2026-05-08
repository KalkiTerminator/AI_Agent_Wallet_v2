"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Loader2, FlaskConical, Pencil, Trash2 } from "lucide-react";
import type { AITool } from "@/types";

function ToolStatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "draft", className: "text-muted-foreground border-muted-foreground/30" },
    pending_approval: { label: "under review", className: "text-yellow-600 border-yellow-500/30" },
    approved: { label: "approved", className: "text-green-500 border-green-500/30" },
    rejected: { label: "rejected", className: "text-destructive border-destructive/30" },
    archived: { label: "archived", className: "text-muted-foreground border-muted-foreground/30" },
  };
  const s = map[status ?? "draft"] ?? map.draft;
  return <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>;
}

export default function MyToolsPage() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);

  const [sandboxTool, setSandboxTool] = useState<AITool | null>(null);
  const [sandboxResult, setSandboxResult] = useState<string | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const [deleteTool, setDeleteTool] = useState<AITool | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: AITool[] }>("/api/tools/mine", session.apiToken);
      setTools(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  async function handleSubmitForReview(tool: AITool) {
    if (!session?.apiToken) return;
    setSubmitting(tool.id);
    try {
      await apiClient.patch(`/api/tools/${tool.id}/submit`, {}, session.apiToken);
      setTools((prev) => prev.map((t) => t.id === tool.id ? { ...t, toolStatus: "pending_approval" } : t));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSandbox(tool: AITool) {
    if (!session?.apiToken) return;
    setSandboxTool(tool);
    setSandboxResult(null);
    setSandboxLoading(true);
    try {
      const res = await apiClient.post<{ data: unknown }>(`/api/tools/${tool.id}/sandbox`, { inputs: {} }, session.apiToken);
      setSandboxResult(JSON.stringify(res.data, null, 2));
    } catch (err) {
      setSandboxResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSandboxLoading(false);
    }
  }

  async function handleDelete() {
    if (!session?.apiToken || !deleteTool) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/tools/${deleteTool.id}`, session.apiToken);
      setTools((prev) => prev.filter((t) => t.id !== deleteTool.id));
      setDeleteTool(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl">My Tools</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Tools you have submitted</p>
        </div>
        <Button size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href="/tools/new"><Plus className="h-3.5 w-3.5" />Submit tool</Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : tools.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">You haven&apos;t submitted any tools yet.</p>
          <Button size="sm" className="h-7 text-xs gap-1.5" asChild>
            <Link href="/tools/new"><Plus className="h-3.5 w-3.5" />Submit your first tool</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="glass rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-base shrink-0">
                  {tool.iconUrl ?? "🔧"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tool.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">{tool.category}</Badge>
                  <ToolStatusBadge status={tool.toolStatus} />
                  <span className="text-[10px] font-mono text-muted-foreground">{tool.creditCost}cr</span>
                </div>
              </div>

              {tool.toolStatus === "rejected" && tool.rejectionReason && (
                <p className="text-[10px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  Rejection reason: {tool.rejectionReason}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                {tool.toolStatus === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    disabled={submitting === tool.id}
                    onClick={() => handleSubmitForReview(tool)}
                  >
                    {submitting === tool.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Submit for review
                  </Button>
                )}
                {tool.toolStatus === "approved" && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleSandbox(tool)}>
                    <FlaskConical className="h-3 w-3" />Sandbox
                  </Button>
                )}
                {tool.toolStatus !== "pending_approval" && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" asChild>
                    <Link href={`/tools/${tool.id}/edit`}><Pencil className="h-3 w-3" />Edit</Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTool(tool)}
                >
                  <Trash2 className="h-3 w-3" />Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!sandboxTool} onOpenChange={(o) => { if (!o) { setSandboxTool(null); setSandboxResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Sandbox — {sandboxTool?.name}</DialogTitle>
            <DialogDescription className="text-xs">Test your tool without spending credits.</DialogDescription>
          </DialogHeader>
          {sandboxLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sandboxResult ? (
            <pre className="text-[10px] font-mono bg-muted/50 rounded-lg p-3 overflow-auto max-h-64">{sandboxResult}</pre>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTool} onOpenChange={(o) => { if (!o) setDeleteTool(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete tool?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently remove &quot;{deleteTool?.name}&quot; from your account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
