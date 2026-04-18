"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Zap, DollarSign, Plus } from "lucide-react";
import { UserRoleManager } from "@/components/admin/UserRoleManager";
import { ToolApprovalManager } from "@/components/admin/ToolApprovalManager";
import { ToolManagement } from "@/components/admin/ToolManagement";
import { ToolCreationForm } from "@/components/admin/ToolCreationForm";
import type { UserWithRole, AITool } from "@/types";

interface AdminAnalytics {
  totalUsages: number;
  totalUsers: number;
  totalRevenueCents: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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
        apiClient.get<{ data: AdminAnalytics }>("/api/admin/analytics", session.apiToken),
        apiClient.get<{ data: UserWithRole[] }>("/api/admin/users", session.apiToken),
        apiClient.get<{ data: AITool[] }>("/api/admin/tools", session.apiToken),
      ]);
      setAnalytics(ar.data);
      setUsers(ur.data);
      setTools(tr.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
    { icon: Users, label: "Users", value: analytics?.totalUsers ?? 0 },
    { icon: Zap, label: "Executions", value: analytics?.totalUsages ?? 0 },
    { icon: DollarSign, label: "Revenue", value: `$${((analytics?.totalRevenueCents ?? 0) / 100).toFixed(2)}` },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Admin</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Platform overview and moderation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(({ icon: Icon, label, value }) => (
          <div key={label} className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-xl font-bold font-mono">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="approvals">
        <TabsList className="h-8">
          <TabsTrigger value="approvals" className="text-xs">Approvals</TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">All Tools</TabsTrigger>
          <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
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

        <TabsContent value="users" className="mt-4">
          <UserRoleManager users={users} onUsersChange={setUsers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
