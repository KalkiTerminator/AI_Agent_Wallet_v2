"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Loader2, Copy } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface Props {
  token: string;
  onVerified: () => void;
  onClose: () => void;
}

type Step = "url" | "dns" | "done";

export function DomainVerifyModal({ token, onVerified, onClose }: Props) {
  const [step, setStep] = useState<Step>("url");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [dnsRecord, setDnsRecord] = useState("");
  const [domainId, setDomainId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.post<{ data: { id: string; dnsRecord: string; alreadyVerified?: boolean } }>(
        "/api/tools/domains",
        { webhookUrl },
        token,
      );
      if (res.data.alreadyVerified) {
        onVerified();
        return;
      }
      setDomainId(res.data.id);
      setDnsRecord(res.data.dnsRecord);
      setStep("dns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register domain");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      await apiClient.post(`/api/tools/domains/${domainId}/verify`, {}, token);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed — check DNS propagation (may take up to 48h)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Verify Webhook Domain</DialogTitle>
        </DialogHeader>

        {step === "url" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Your webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="h-8 text-xs font-mono"
                placeholder="https://api.yourcompany.com/webhook"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button size="sm" className="h-8 text-xs w-full" onClick={handleRegister} disabled={loading || !webhookUrl.trim()}>
              {loading && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Continue
            </Button>
          </div>
        )}

        {step === "dns" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Add this TXT record to your DNS, then click Check:</p>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <code className="text-[10px] font-mono flex-1 break-all">{dnsRecord}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(dnsRecord)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">DNS changes can take up to 48 hours to propagate.</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button size="sm" className="h-8 text-xs w-full" onClick={handleVerify} disabled={loading}>
              {loading && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Check verification
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">Domain verified!</p>
            <Button size="sm" className="h-8 text-xs" onClick={onVerified}>Continue</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
