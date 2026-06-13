"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Panel } from "@/components/shared/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeysPanel() {
  const { data: session } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: ApiKey[] }>("/api/account/api-keys", session.apiToken);
      setKeys(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function create() {
    if (!session?.apiToken || !name.trim()) return;
    setCreating(true);
    try {
      const res = await apiClient.post<{ data: ApiKey & { key: string } }>(
        "/api/account/api-keys", { name: name.trim() }, session.apiToken
      );
      setNewKey(res.data.key);
      setName("");
      toast.success("API key created", "Copy it now — it won't be shown again.");
      await fetchKeys();
    } catch (err) {
      toast.error("Couldn't create key", err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!session?.apiToken) return;
    try {
      await apiClient.delete(`/api/account/api-keys/${id}`, session.apiToken);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
      toast.success("API key revoked");
    } catch (err) {
      toast.error("Couldn't revoke key", err instanceof Error ? err.message : undefined);
    }
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Panel className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <p className="microlabel !text-foreground">API keys</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Run tools programmatically with <code className="font-mono text-foreground">X-API-Key</code>.
        Keys carry your account&apos;s credits and verification — treat them like passwords.
      </p>

      {/* Freshly created key — shown once */}
      {newKey && (
        <div className="tick-frame tick-signal bg-muted/40 border border-primary/30 p-3 space-y-2">
          <p className="microlabel microlabel-signal">Copy now — shown once</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono flex-1 break-all select-all">{newKey}</code>
            <button onClick={copyKey} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground">
            Done
          </button>
        </div>
      )}

      {/* Create */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Key name (e.g. CI pipeline)"
          className="h-9 text-xs rounded-sm"
          maxLength={60}
        />
        <Button size="sm" className="h-9 text-xs rounded-sm font-mono uppercase tracking-[0.12em] gap-1.5 shrink-0" onClick={create} disabled={creating || !name.trim()}>
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
          Create
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">No API keys yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {k.name}
                  {k.revokedAt && <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.15em] text-destructive">revoked</span>}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {k.prefix}··· · {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                </p>
              </div>
              {!k.revokedAt && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => revoke(k.id)} title="Revoke">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
