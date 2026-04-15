"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Zap, DollarSign, CheckCircle, XCircle, Clock, ToggleLeft, ToggleRight } from "lucide-react";
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
  const [togglingTool, setTogglingTool] = useState<string | null>(null);

  // Redirect non-admins once session is loaded
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/dashboard");
    }
  }, [status, session]);

  const fetchAll = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    try {
      const [analyticsRes, usersRes, toolsRes] = await Promise.all([
        apiClient.get<{ data: AdminAnalytics }>("/api/admin/analytics", session.apiToken),
        apiClient.get<{ data: UserWithRole[] }>("/api/admin/users", session.apiToken),
        apiClient.get<{ data: AITool[] }>("/api/admin/tools", session.apiToken),
      ]);
      setAnalytics(analyticsRes.data);
      setUsers(usersRes.data);
      setTools(toolsRes.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleApproval(toolId: string, approvalStatus: "approved" | "rejected") {
    if (!session?.apiToken) return;
    setTogglingTool(toolId);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/admin/tools/${toolId}`,
        { approvalStatus },
        session.apiToken
      );
      setTools((prev) => prev.map((t) => (t.id === toolId ? { ...t, ...res.data } : t)));
    } finally {
      setTogglingTool(null);
    }
  }

  async function handleToggleActive(tool: AITool) {
    if (!session?.apiToken) return;
    setTogglingTool(tool.id);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/admin/tools/${tool.id}`,
        { isActive: !tool.isActive },
        session.apiToken
      );
      setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, ...res.data } : t)));
    } finally {
      setTogglingTool(null);
    }
  }

  const pendingTools = tools.filter((t) => t.approvalStatus === "pending");

  if (status === "loading" || loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Admin</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Platform overview and moderation</p>
      </div>

      {/* Stats cards */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Users</p>
              <p className="text-xl font-bold font-mono">{analytics.totalUsers}</p>
            </div>
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Executions</p>
              <p className="text-xl font-bold font-mono">{analytics.totalUsages}</p>
            </div>
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue</p>
              <p className="text-xl font-bold font-mono">
                ${(analytics.totalRevenueCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {pendingTools.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-warning" />
            Pending Approvals
            <Badge variant="secondary" className="text-[10px] ml-1">{pendingTools.length}</Badge>
          </h2>
          <div className="glass rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tool</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Cost</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTools.map((tool) => (
                  <TableRow key={tool.id}>
                    <TableCell className="text-xs font-medium">{tool.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{tool.category}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{tool.creditCost}cr</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-success border-success/30 hover:bg-success/10"
                          disabled={togglingTool === tool.id}
                          onClick={() => handleApproval(tool.id, "approved")}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={togglingTool === tool.id}
                          onClick={() => handleApproval(tool.id, "rejected")}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* All tools */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">All Tools</h2>
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Cost</TableHead>
                <TableHead className="text-xs text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell className="text-xs font-medium">{tool.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tool.category}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        tool.approvalStatus === "approved"
                          ? "text-success border-success/30"
                          : tool.approvalStatus === "rejected"
                          ? "text-destructive border-destructive/30"
                          : "text-muted-foreground"
                      }`}
                    >
                      {tool.approvalStatus ?? "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{tool.creditCost}cr</TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handleToggleActive(tool)}
                      disabled={togglingTool === tool.id}
                      className="opacity-80 hover:opacity-100 transition-opacity"
                    >
                      {tool.isActive ? (
                        <ToggleRight className="h-4 w-4 text-success" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Users */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Users</h2>
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-xs font-medium">{user.email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.fullName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{user.role}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
