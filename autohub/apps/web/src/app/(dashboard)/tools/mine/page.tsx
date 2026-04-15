"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import type { AITool } from "@/types";

function ApprovalBadge({ status }: { status?: string }) {
  if (status === "approved")
    return <Badge variant="outline" className="text-[10px] text-success border-success/30">approved</Badge>;
  if (status === "rejected")
    return <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">rejected</Badge>;
  return <Badge variant="secondary" className="text-[10px]">pending review</Badge>;
}

export default function MyToolsPage() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTools = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: AITool[] }>("/api/tools/mine", session.apiToken);
      setTools(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl">My Tools</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Tools you have submitted</p>
        </div>
        <Button size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href="/tools/new">
            <Plus className="h-3.5 w-3.5" />
            Submit tool
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">You haven&apos;t submitted any tools yet.</p>
          <Button size="sm" className="h-7 text-xs gap-1.5" asChild>
            <Link href="/tools/new">
              <Plus className="h-3.5 w-3.5" />
              Submit your first tool
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-base shrink-0">
                {tool.iconUrl ?? "🔧"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tool.name}</p>
                <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-[10px]">{tool.category}</Badge>
                <ApprovalBadge status={tool.approvalStatus} />
                <span className="text-[10px] font-mono text-muted-foreground">{tool.creditCost}cr</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
