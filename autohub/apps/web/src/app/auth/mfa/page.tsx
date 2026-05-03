"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-sm w-full space-y-6">
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl">Two-factor authentication</h1>
          <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-xs">Authentication code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={8}
              autoComplete="one-time-code"
              className="h-8 text-xs tracking-widest"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
            {loading && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Verify
          </Button>
        </form>
      </div>
    </div>
  );
}
