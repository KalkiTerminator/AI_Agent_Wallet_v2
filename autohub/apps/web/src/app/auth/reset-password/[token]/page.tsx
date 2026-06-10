"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetPasswordConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 12) { setError("Password must be at least 12 characters"); return; }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/api/auth/reset/confirm", { token, newPassword: password });
      router.push("/auth/login?reset=success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step="ACCESS / RECOVERY"
      title="Set new password"
      subtitle="Choose a password with at least 12 characters."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="text-xs text-destructive font-mono">⚠ {error}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="microlabel">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            className="h-11 rounded-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="microlabel">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
            className="h-11 rounded-sm"
          />
        </div>
        <Button type="submit" className="w-full h-11 rounded-sm font-mono text-[11px] uppercase tracking-[0.18em]" disabled={loading}>
          {loading ? "Saving…" : "Reset password"}
        </Button>
        <p className="text-center">
          <Link href="/auth/login" className="link-slide font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
