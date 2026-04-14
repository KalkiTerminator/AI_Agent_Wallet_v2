"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCredits } from "@/hooks/useCredits";
import { apiClient } from "@/lib/api-client";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Play, Zap } from "lucide-react";
import Link from "next/link";
import type { AITool } from "@/types";

export default function ToolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { credits } = useCredits();
  const [tool, setTool] = useState<AITool | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!session?.apiToken) return;
    let cancelled = false;
    apiClient
      .get<{ data: AITool }>(`/api/tools/${id}`, session.apiToken)
      .then((res) => { if (!cancelled) setTool(res.data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, session?.apiToken]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Tool not found.{" "}
        <Link href="/dashboard" className="text-primary underline">Back to dashboard</Link>
      </div>
    );
  }

  const canAfford = credits !== null && credits >= tool.creditCost;

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard
      </Link>

      {/* Tool header */}
      <div className="glass rounded-xl p-5 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tool.iconUrl}</span>
            <div>
              <h1 className="font-display font-bold text-lg">{tool.name}</h1>
              <Badge variant="outline" className="text-[10px] mt-1">{tool.category}</Badge>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm font-mono">{tool.creditCost} credits</Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
      </div>

      {/* Execute CTA */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Run this tool</h2>
        {!canAfford && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <Zap className="h-3 w-3" />
            You need {tool.creditCost} credits ({credits ?? 0} available).
          </p>
        )}
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!canAfford}
          className="h-9 text-xs shadow-glow"
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Execute — {tool.creditCost} credits
        </Button>
      </div>

      <ToolExecuteDialog
        tool={tool}
        credits={credits}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
