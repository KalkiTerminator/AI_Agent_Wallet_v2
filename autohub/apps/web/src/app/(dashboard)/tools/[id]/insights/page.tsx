"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatTile } from "@/components/shared/StatTile";
import { Panel } from "@/components/shared/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Insights {
  name: string;
  totalExecutions: number;
  successCount: number;
  successRate: number | null;
  creditsEarned: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  dailyExecutions: { date: string; count: number }[];
}

const fmtMs = (ms: number | null) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

export default function ToolInsightsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApiQuery<{ data: Insights }>(`/api/tools/${id}/insights`);
  const ins = data?.data;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Link href="/tools/mine" className="link-slide flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to my tools
      </Link>

      <PageHeader label="SYS / Insights" title={ins?.name ?? "Tool insights"} description="Performance for the last 30 days" />

      {error ? (
        <Panel className="p-6 text-sm text-destructive">{error}</Panel>
      ) : loading || !ins ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile label="Executions" value={ins.totalExecutions} />
            <StatTile label="Success rate" value={ins.successRate == null ? "—" : `${Math.round(ins.successRate * 100)}%`} />
            <StatTile label="Credits earned" value={ins.creditsEarned} />
            <StatTile label="Latency p95" value={fmtMs(ins.latencyP95Ms)} />
          </div>

          <Panel className="p-4 space-y-3">
            <p className="microlabel">Daily executions</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ins.dailyExecutions}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelStyle={{ fontSize: 10 }}
                  contentStyle={{ fontSize: 10, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-[0.12em]">Latency p50</span>
              <span>{fmtMs(ins.latencyP50Ms)}</span>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
