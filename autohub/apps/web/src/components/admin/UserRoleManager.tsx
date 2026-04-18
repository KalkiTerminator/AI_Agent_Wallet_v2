"use client";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserWithRole, AppRole } from "@/types";

interface Props {
  users: UserWithRole[];
  onUsersChange: (users: UserWithRole[]) => void;
}

export function UserRoleManager({ users, onUsersChange }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);

  async function changeRole(userId: string, role: AppRole) {
    if (!session?.apiToken) return;
    setBusy(userId);
    try {
      await apiClient.patch(`/api/admin/users/${userId}/role`, { role }, session.apiToken);
      onUsersChange(users.map((u) => u.id === userId ? { ...u, role } : u));
    } finally {
      setBusy(null);
    }
  }

  async function deactivate(userId: string) {
    if (!session?.apiToken) return;
    setBusy(userId);
    try {
      await apiClient.delete(`/api/admin/users/${userId}`, session.apiToken);
      onUsersChange(users.filter((u) => u.id !== userId));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Email</TableHead>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Role</TableHead>
            <TableHead className="text-xs">Joined</TableHead>
            <TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="text-xs font-medium">{user.email}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{user.fullName ?? "—"}</TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  onValueChange={(r) => changeRole(user.id, r as AppRole)}
                  disabled={busy === user.id || user.isOwner}
                >
                  <SelectTrigger className="h-6 text-[10px] w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user" className="text-xs">User</SelectItem>
                    <SelectItem value="moderator" className="text-xs">Moderator</SelectItem>
                    <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </TableCell>
              <TableCell className="text-right">
                {!user.isOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={busy === user.id}
                    onClick={() => deactivate(user.id)}
                  >
                    Remove
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
