"use client";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Zap, DollarSign, Plus } from "lucide-react";
import { UserRoleManager } from "@/components/admin/UserRoleManager";
import { ToolApprovalManager } from "@/components/admin/ToolApprovalManager";
import { ToolManagement } from "@/components/admin/ToolManagement";
import { ToolCreationForm } from "@/components/admin/ToolCreationForm";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { UserWithRole, AITool } from "@/types";

interface AdminAnalyticsSummary {
  totalUsages: number;
  totalUsers: number;
  totalRevenueCents: number;
}

interface ChartPoint {
  date: string;
  count?: number;
  amountCents?: number;
}

interface TopTool {
  toolId: string;
  name: string;
  count: number;
}

interface AdminAnalytics {
  summary: AdminAnalyticsSummary;
  charts: {
    dailyRevenue: ChartPoint[];
    dailySignups: ChartPoint[];
    dailyExecutions: ChartPoint[];
    activeSubscriptions: ChartPoint[];
    topTools: TopTool[];
  };
}

type AdminTab = "users" | "tools" | "approvals" | "compliance" | "analytics";
type Range = "7d" | "30d" | "90d";

function AdminPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab");
  const activeTab: AdminTab =
    rawTab === "users" ||
    rawTab === "tools" ||
    rawTab === "approvals" ||
    rawTab === "compliance" ||
    rawTab === "analytics"
      ? rawTab
      : "approvals";

  const [summaryAnalytics, setSummaryAnalytics] =
    useState<AdminAnalyticsSummary | null>(null);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Analytics tab state
  const [analyticsData, setAnalyticsData] = useState<AdminAnalytics | null>(
    null
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [range, setRange] = useState<Range>("30d");
  const analyticsFetched = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/dashboard");
    }
  }, [status, session]);

  const fetchAll = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    try {
      const [ar, ur, tr] = await Promise.all([
        apiClient.get<{ data: AdminAnalytics }>(
          `/api/admin/analytics?range=30d`,
          session.apiToken
        ),
        apiClient.get<{ data: UserWithRole[] }>(
          "/api/admin/users",
          session.apiToken
        ),
        apiClient.get<{ data: AITool[] }>("/api/admin/tools", session.apiToken),
      ]);
      setSummaryAnalytics(ar.data.summary);
      setUsers(ur.data);
      setTools(tr.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchAnalytics = useCallback(
    async (r: Range) => {
      if (!session?.apiToken) return;
      setAnalyticsLoading(true);
      try {
        const res = await apiClient.get<{ data: AdminAnalytics }>(
          `/api/admin/analytics?range=${r}`,
          session.apiToken
        );
        setAnalyticsData(res.data);
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [session?.apiToken]
  );

  // Lazy-load analytics on first tab activation
  useEffect(() => {
    if (
      activeTab === "analytics" &&
      !analyticsFetched.current &&
      session?.apiToken
    ) {
      analyticsFetched.current = true;
      fetchAnalytics(range);
    }
  }, [activeTab, session?.apiToken, fetchAnalytics, range]);

  function handleRangeChange(r: Range) {
    setRange(r);
    fetchAnalytics(r);
  }

  if (status === "loading" || loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const statCards = [
    { icon: Users, label: "Users", value: summaryAnalytics?.totalUsers ?? 0 },
    {
      icon: Zap,
      label: "Executions",
      value: summaryAnalytics?.totalUsages ?? 0,
    },
    {
      icon: DollarSign,
      label: "Revenue",
      value: `$${((summaryAnalytics?.totalRevenueCents ?? 0) / 100).toFixed(2)}`,
    },
  ];

  function handleTabChange(tab: string) {
    router.push(`/admin?tab=${tab}`);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Admin</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Platform overview and moderation
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="glass rounded-xl p-4 flex items-center gap-3"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
              </p>
              <p className="text-xl font-bold font-mono">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-8">
          <TabsTrigger value="approvals" className="text-xs">
            Tool Approvals
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">
            Manage Tools
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">
            Analytics
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs">
            User Management
          </TabsTrigger>
          <TabsTrigger
            value="compliance"
            className="text-xs"
            onClick={() => router.push("/admin/compliance")}
          >
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-4">
          <ToolApprovalManager tools={tools} onToolsChange={setTools} />
        </TabsContent>

        <TabsContent value="tools" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setShowCreate((v) => !v)}
            >
              <Plus className="h-3 w-3" />
              {showCreate ? "Cancel" : "New Tool"}
            </Button>
          </div>
          {showCreate && (
            <div className="glass rounded-xl p-4">
              <ToolCreationForm
                onCreated={(tool) => {
                  setTools((prev) => [tool, ...prev]);
                  setShowCreate(false);
                }}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          )}
          <ToolManagement tools={tools} onToolsChange={setTools} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 space-y-6">
          {/* Range selector */}
          <div className="flex items-center gap-2">
            {(["7d", "30d", "90d"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {analyticsLoading || !analyticsData ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Daily Revenue */}
              <div className="glass rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold">Daily Revenue</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.charts.dailyRevenue}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) =>
                        `$${(v / 100).toFixed(0)}`
                      }
                    />
                    <Tooltip
                      formatter={(v: number) => [
                        `$${(v / 100).toFixed(2)}`,
                        "Revenue",
                      ]}
                      labelStyle={{ fontSize: 10 }}
                      contentStyle={{ fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amountCents"
                      stroke="hsl(var(--primary))"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Signups */}
              <div className="glass rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold">Daily Signups</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.charts.dailySignups}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      labelStyle={{ fontSize: 10 }}
                      contentStyle={{ fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Executions */}
              <div className="glass rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold">Daily Executions</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.charts.dailyExecutions}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      labelStyle={{ fontSize: 10 }}
                      contentStyle={{ fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Active Subscriptions */}
              <div className="glass rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold">Active Subscriptions</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={analyticsData.charts.activeSubscriptions}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      labelStyle={{ fontSize: 10 }}
                      contentStyle={{ fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Top Tools */}
              <div className="glass rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold">
                  Top 5 Tools by Executions
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={analyticsData.charts.topTools}
                    layout="vertical"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      width={120}
                    />
                    <Tooltip
                      labelStyle={{ fontSize: 10 }}
                      contentStyle={{ fontSize: 10 }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UserRoleManager users={users} onUsersChange={setUsers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}
