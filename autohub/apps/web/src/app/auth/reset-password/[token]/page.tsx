"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <main className="min-h-screen aurora-bg gradient-mesh flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass rounded-2xl p-8 shadow-large">
        <h1 className="font-display font-bold text-xl mb-1">Set New Password</h1>
        <p className="text-xs text-muted-foreground mb-6">Choose a password with at least 8 characters.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-xs">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="h-9 text-sm"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Reset Password"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/auth/login" className="text-primary hover:underline">Back to login</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
