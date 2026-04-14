"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Zap, CheckCircle, XCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AITool, ToolExecutionResult, InputField } from "@/types";

interface ToolExecuteDialogProps {
  tool: AITool | null;
  credits: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (creditsRemaining: number) => void;
}

type ExecState = "idle" | "loading" | "success" | "error";

export function ToolExecuteDialog({ tool, credits, open, onOpenChange, onSuccess }: ToolExecuteDialogProps) {
  const { data: session } = useSession();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [state, setState] = useState<ExecState>("idle");
  const [result, setResult] = useState<ToolExecutionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (!tool) return null;

  const fields: InputField[] = Array.isArray(tool.inputFields)
    ? tool.inputFields
    : Object.entries(tool.inputFields ?? {}).map(([name, cfg]) => ({ name, ...(cfg as object) } as InputField));

  const canAfford = credits !== null && credits >= tool.creditCost;

  const handleExecute = async () => {
    if (!session?.apiToken || !canAfford) return;
    setState("loading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await apiClient.post<{ data: ToolExecutionResult }>(
        `/api/tools/${tool.id}/execute`,
        { inputs },
        session.apiToken
      );
      setResult(res.data);
      setState("success");
      onSuccess?.(credits! - tool.creditCost);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Execution failed");
      setState("error");
    }
  };

  const handleClose = () => {
    setState("idle");
    setInputs({});
    setResult(null);
    setErrorMsg("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg glass">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{tool.iconUrl}</span>
            <div>
              <DialogTitle className="font-display text-base">{tool.name}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">{tool.description}</DialogDescription>
            </div>
            <Badge variant="secondary" className="ml-auto text-[10px] font-mono shrink-0">
              {tool.creditCost} cr
            </Badge>
          </div>
        </DialogHeader>

        {state === "idle" || state === "loading" ? (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label className="text-xs">{field.label ?? field.name}</Label>
                {field.type === "textarea" ? (
                  <Textarea
                    placeholder={field.placeholder}
                    value={inputs[field.name] ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, [field.name]: e.target.value }))}
                    className="text-xs min-h-[80px]"
                    required={field.required}
                  />
                ) : field.type === "select" && field.options ? (
                  <Select
                    value={inputs[field.name] ?? ""}
                    onValueChange={(v) => setInputs((p) => ({ ...p, [field.name]: v }))}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder={field.placeholder ?? "Select…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder}
                    value={inputs[field.name] ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, [field.name]: e.target.value }))}
                    className="text-xs h-8"
                    required={field.required}
                  />
                )}
              </div>
            ))}

            {!canAfford && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Not enough credits ({credits ?? 0} / {tool.creditCost} required)
              </p>
            )}

            <Button
              onClick={handleExecute}
              disabled={!canAfford || state === "loading"}
              className="w-full h-8 text-xs shadow-glow"
            >
              {state === "loading" ? (
                <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Running…</>
              ) : (
                <><Play className="mr-1.5 h-3 w-3" />Execute — {tool.creditCost} credits</>
              )}
            </Button>
          </div>
        ) : state === "success" && result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success text-xs font-medium">
              <CheckCircle className="h-4 w-4" />
              Success — {result.creditsDeducted} credit{result.creditsDeducted !== 1 ? "s" : ""} used
            </div>
            <div className="rounded-lg glass-subtle p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
              {typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output, null, 2)}
            </div>
            <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setState("idle")}>
              Run Again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
              <XCircle className="h-4 w-4" />
              Execution failed
            </div>
            <p className="text-xs text-muted-foreground glass-subtle p-3 rounded-lg">{errorMsg}</p>
            <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setState("idle")}>
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
