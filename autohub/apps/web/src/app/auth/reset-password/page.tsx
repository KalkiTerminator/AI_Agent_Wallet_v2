"use client";
import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/api/auth/reset/request", { email });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step="ACCESS / RECOVERY"
      title="Reset password"
      subtitle="Enter your email to receive a reset link."
    >
      {sent ? (
        <div className="text-center space-y-4 py-4">
          <p className="font-mono text-xs text-primary">✓ TRANSMISSION SENT</p>
          <p className="text-sm text-muted-foreground">Check your email for a reset link.</p>
          <Link href="/auth/login" className="link-slide font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/80">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-xs text-destructive font-mono">⚠ {error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="microlabel">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-sm"
            />
          </div>
          <Button type="submit" className="w-full h-11 rounded-sm font-mono text-[11px] uppercase tracking-[0.18em]" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center">
            <Link href="/auth/login" className="link-slide font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">Back to login</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
