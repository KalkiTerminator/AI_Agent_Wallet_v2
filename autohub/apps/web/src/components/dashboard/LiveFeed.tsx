"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Panel } from "@/components/shared/Panel";

interface UsageRow {
  id: string;
  toolName: string | null;
  status: string;
  creditsUsed: number;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const STATUS_DOT: Record<string, string> = {
  success: "status-dot-active",
  pending: "status-dot-pending",
  failed: "bg-destructive",
  refunded: "bg-destructive",
  sandbox: "bg-muted-foreground",
};

/** Auto-refreshing recent-executions panel — makes the landing page's "live feed" real. */
export function LiveFeed() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: UsageRow[] }>("/api/tools/usage?limit=6", session.apiToken);
      setRows(res.data);
    } catch {
      /* transient — keep showing the last good data */
    } finally {
      setLoaded(true);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchFeed();
    timer.current = setInterval(fetchFeed, 10_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchFeed]);

  if (loaded && rows.length === 0) return null; // nothing to show yet

  return (
    <Panel className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="microlabel">Live feed</p>
        <span className="status-dot status-dot-active" />
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[11px]">
            <span className={`status-dot ${STATUS_DOT[r.status] ?? "bg-muted-foreground"} shrink-0`} />
            <span className="flex-1 truncate font-medium">{r.toolName ?? "Unknown tool"}</span>
            <span className="font-mono text-muted-foreground/70 shrink-0">{relativeTime(r.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
