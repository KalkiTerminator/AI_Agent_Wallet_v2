"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { env } from "@/lib/env";
import { AuthShell } from "@/components/auth/AuthShell";

const API_BASE = env.NEXT_PUBLIC_API_URL;

export default function MfaChallengePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.mfaToken) { setError("Session expired. Please log in again."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken: session.mfaToken, code }),
      });
      const data = await res.json() as { token?: string; user?: { id: string; email: string; fullName: string | null; role: string }; error?: string };
      if (!res.ok || !data.token) { setError(data.error ?? "Invalid code"); return; }

      // Update the NextAuth session with the full API token
      await update({ apiToken: data.token, mfaPending: false, mfaToken: null });

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step="ACCESS / STEP-UP"
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="code" className="microlabel">Authentication code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            maxLength={8}
            autoComplete="one-time-code"
            className="h-12 font-mono text-lg tracking-[0.5em] text-center rounded-sm"
          />
        </div>
        {error && <p className="text-xs text-destructive font-mono">⚠ {error}</p>}
        <Button type="submit" className="w-full h-11 rounded-sm font-mono text-[11px] uppercase tracking-[0.18em]" disabled={loading || code.length < 6}>
          {loading && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          Verify identity
        </Button>
      </form>
    </AuthShell>
  );
}
