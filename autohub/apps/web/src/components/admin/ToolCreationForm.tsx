"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TOOL_CATEGORIES } from "@autohub/shared";
import type { AITool } from "@/types";

interface Props {
  onCreated: (tool: AITool) => void;
  onCancel: () => void;
}

export function ToolCreationForm({ onCreated, onCancel }: Props) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    creditCost: 1,
    webhookUrl: "",
    executionMode: "sync" as "sync" | "async",
  });

  function setField(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.apiToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ data: AITool }>("/api/tools", form, session.apiToken);
      onCreated(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input className="h-8 text-xs" value={form.name} onChange={setField("name")} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick…" /></SelectTrigger>
            <SelectContent>
              {TOOL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea className="text-xs min-h-16" value={form.description} onChange={setField("description")} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Webhook URL</Label>
          <Input className="h-8 text-xs" placeholder="https://…" value={form.webhookUrl} onChange={setField("webhookUrl")} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Execution Mode</Label>
          <Select
            value={form.executionMode}
            onValueChange={(v) => setForm((p) => ({ ...p, executionMode: v as "sync" | "async" }))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sync" className="text-xs">Sync (wait for response)</SelectItem>
              <SelectItem value="async" className="text-xs">Async (callback)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1 w-32">
        <Label className="text-xs">Credit Cost</Label>
        <Input
          type="number"
          min={1}
          className="h-8 text-xs"
          value={form.creditCost}
          onChange={(e) => setForm((p) => ({ ...p, creditCost: Number(e.target.value) }))}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Creating…" : "Create Tool"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
