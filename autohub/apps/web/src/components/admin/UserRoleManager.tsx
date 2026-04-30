"use client";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type { UserWithRole } from "@/types";

const BUILT_IN_ROLES = ["admin", "moderator", "user"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  moderator: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  user: "bg-muted text-muted-foreground border-border",
};

function roleBadgeClass(role: string) {
  return ROLE_COLORS[role] ?? "bg-purple-500/10 text-purple-500 border-purple-500/20";
}

interface Props {
  users: UserWithRole[];
  onUsersChange: (users: UserWithRole[]) => void;
}

export function UserRoleManager({ users, onUsersChange }: Props) {
  const { data: session } = useSession();
  const [roles, setRoles] = useState<string[]>(BUILT_IN_ROLES);
  const [busy, setBusy] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [addingRole, setAddingRole] = useState(false);

  useEffect(() => {
    if (!session?.apiToken) return;
    apiClient
      .get<{ data: string[] }>("/api/admin/roles", session.apiToken)
      .then((r) => setRoles(r.data))
      .catch(() => {});
  }, [session?.apiToken]);

  async function changeRole(userId: string, role: string) {
    if (!session?.apiToken) return;
    setBusy(userId);
    try {
      await apiClient.patch(`/api/admin/users/${userId}/role`, { role }, session.apiToken);
      onUsersChange(users.map((u) => (u.id === userId ? { ...u, role } : u)));
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

  async function addRole() {
    const name = newRole.trim().toLowerCase();
    if (!name) return;
    if (!/^[a-z0-9_-]+$/.test(name)) {
      setAddError("Lowercase letters, numbers, hyphens, underscores only");
      return;
    }
    if (!session?.apiToken) return;
    setAddingRole(true);
    setAddError("");
    try {
      const r = await apiClient.post<{ data: string[] }>("/api/admin/roles", { role: name }, session.apiToken);
      setRoles(r.data);
      setNewRole("");
    } catch (e: any) {
      setAddError(e?.message ?? "Failed to add role");
    } finally {
      setAddingRole(false);
    }
  }

  async function removeRole(role: string) {
    if (!session?.apiToken) return;
    try {
      const r = await apiClient.delete<{ data: string[] }>(`/api/admin/roles/${role}`, session.apiToken);
      setRoles(r.data);
    } catch (e: any) {
      setAddError(e?.message ?? "Failed to remove role");
    }
  }

  return (
    <div className="space-y-4">
      {/* Role configuration panel */}
      <div className="glass rounded-xl p-4 space-y-3">
        <p className="text-xs font-medium">Available Roles</p>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <div key={role} className="flex items-center gap-1">
              <Badge variant="outline" className={`text-[10px] capitalize ${roleBadgeClass(role)}`}>
                {role}
              </Badge>
              {!BUILT_IN_ROLES.includes(role) && (
                <button
                  onClick={() => removeRole(role)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title={`Remove ${role}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newRole}
            onChange={(e) => { setNewRole(e.target.value); setAddError(""); }}
            onKeyDown={(e) => e.key === "Enter" && addRole()}
            placeholder="new-role-name"
            className="h-7 text-xs w-44"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={addRole}
            disabled={addingRole || !newRole.trim()}
          >
            <Plus className="h-3 w-3" />
            Add Role
          </Button>
        </div>
        {addError && <p className="text-[10px] text-destructive">{addError}</p>}
      </div>

      {/* Users table */}
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
                    onValueChange={(r) => changeRole(user.id, r)}
                    disabled={busy === user.id || user.isOwner}
                  >
                    <SelectTrigger className="h-6 text-[10px] w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs capitalize">
                          {r}
                        </SelectItem>
                      ))}
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
    </div>
  );
}
