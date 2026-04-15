"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import { TOOL_CATEGORIES, FIELD_TYPES, OUTPUT_TYPES } from "@autohub/shared";
import type { InputField } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function emptyField(): InputField {
  return {
    name: "",
    type: "text",
    label: "",
    placeholder: "",
    required: true,
  };
}

export default function NewToolPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // Basic info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [creditCost, setCreditCost] = useState(1);
  const [iconUrl, setIconUrl] = useState("");
  const [outputType, setOutputType] = useState("smart");

  // Webhook
  const [hasWebhook, setHasWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookTimeout, setWebhookTimeout] = useState(30);
  const [webhookRetries, setWebhookRetries] = useState(2);

  // Input fields
  const [inputFields, setInputFields] = useState<InputField[]>([emptyField()]);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function updateField(index: number, patch: Partial<InputField>) {
    setInputFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setInputFields((prev) => [...prev, emptyField()]);
  }

  function removeField(index: number) {
    setInputFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.apiToken) return;

    // Client-side validation
    if (!name.trim() || !description.trim() || !category) {
      setErrorMsg("Name, description, and category are required.");
      setSaveState("error");
      return;
    }
    if (hasWebhook && !webhookUrl.trim()) {
      setErrorMsg("Webhook URL is required when webhook is enabled.");
      setSaveState("error");
      return;
    }
    const invalidField = inputFields.find((f) => !f.name.trim() || !f.label.trim());
    if (invalidField) {
      setErrorMsg("All input fields must have a name and label.");
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    setErrorMsg("");
    try {
      await apiClient.post(
        "/api/tools",
        {
          name: name.trim(),
          description: description.trim(),
          category,
          creditCost,
          inputFields,
          iconUrl: iconUrl.trim() || undefined,
          webhookUrl: hasWebhook ? webhookUrl.trim() : undefined,
          outputType,
          webhookTimeout,
          webhookRetries,
        },
        session.apiToken
      );
      setSaveState("saved");
      setTimeout(() => router.push("/tools/mine"), 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit tool");
      setSaveState("error");
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Submit a Tool</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tools are reviewed before being made available to all users.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="glass rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Basic Info</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Tool name <span className="text-destructive">*</span></Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="e.g. Email Rewriter" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">Description <span className="text-destructive">*</span></Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs min-h-[72px]" placeholder="What does this tool do?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category <span className="text-destructive">*</span></Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {TOOL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="creditCost" className="text-xs">Credit cost</Label>
              <Input
                id="creditCost"
                type="number"
                min={1}
                max={100}
                value={creditCost}
                onChange={(e) => setCreditCost(Math.max(1, Number(e.target.value)))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Output type</Label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_TYPES.map((ot) => (
                    <SelectItem key={ot.value} value={ot.value} className="text-xs">{ot.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="iconUrl" className="text-xs">Icon URL (optional)</Label>
              <Input id="iconUrl" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} className="h-8 text-xs" placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Input fields */}
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Input Fields</h2>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addField}>
              <Plus className="h-3 w-3" /> Add field
            </Button>
          </div>

          {inputFields.map((field, index) => (
            <div key={index} className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px]">Field {index + 1}</Badge>
                {inputFields.length > 1 && (
                  <button type="button" onClick={() => removeField(index)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Name (key)</Label>
                  <Input
                    value={field.name}
                    onChange={(e) => updateField(index, { name: e.target.value.replace(/\s+/g, "_") })}
                    className="h-7 text-xs"
                    placeholder="input_name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Label</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Display label"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Type</Label>
                  <Select value={field.type} onValueChange={(v) => updateField(index, { type: v })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value} className="text-xs">{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Placeholder</Label>
                  <Input
                    value={field.placeholder}
                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                    className="h-7 text-xs"
                    placeholder="Hint text…"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id={`required-${index}`}
                  checked={field.required}
                  onCheckedChange={(v) => updateField(index, { required: v })}
                  className="h-4 w-7"
                />
                <Label htmlFor={`required-${index}`} className="text-[10px]">Required</Label>
              </div>
            </div>
          ))}
        </div>

        {/* Webhook */}
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Webhook</h2>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Enable webhook</Label>
              <Switch checked={hasWebhook} onCheckedChange={setHasWebhook} className="h-4 w-7" />
            </div>
          </div>

          {hasWebhook && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Webhook URL <span className="text-destructive">*</span></Label>
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="https://your-api.com/webhook"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Timeout (seconds)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    value={webhookTimeout}
                    onChange={(e) => setWebhookTimeout(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Retries</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={webhookRetries}
                    onChange={(e) => setWebhookRetries(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <Separator />

        {saveState === "error" && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errorMsg}
          </p>
        )}

        {saveState === "saved" && (
          <p className="text-xs text-success flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            Tool submitted! Redirecting…
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={saveState === "saving" || saveState === "saved"}>
            {saveState === "saving" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Submit for Review
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
