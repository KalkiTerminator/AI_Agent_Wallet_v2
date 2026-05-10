"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { useUserProfile } from "@/context/UserProfileContext";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, AlertCircle, Loader2, Copy, Check, ShieldCheck, ShieldOff } from "lucide-react";
import type { SubscriptionStatus } from "@/types";
import { env } from "@/lib/env";

const API_BASE = env.NEXT_PUBLIC_API_URL;

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { profile, refetch: refetchProfile } = useUserProfile();

  // Profile section
  const [fullName, setFullName] = useState("");
  const [profileState, setProfileState] = useState<SaveState>("idle");
  const [profileError, setProfileError] = useState("");

  // Password section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordState, setPasswordState] = useState<SaveState>("idle");
  const [passwordError, setPasswordError] = useState("");

  // Subscription section
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  // Sessions section
  const [activeSessions, setActiveSessions] = useState<Array<{id:string;createdAt:string;userAgent:string|null;ip:string|null;current:boolean}>>([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(true);

  // MFA section
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaState, setMfaState] = useState<"idle"|"enrolling"|"confirming"|"done"|"disabling">("idle");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaCopied, setMfaCopied] = useState(false);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setMfaCopied(true);
      setTimeout(() => setMfaCopied(false), 2000);
    });
  }

  // Seed name from session
  useEffect(() => {
    if (session?.user?.name) setFullName(session.user.name);
  }, [session?.user?.name]);

  // Sync mfaEnabled from live profile (not stale JWT claim)
  useEffect(() => {
    if (profile) {
      setMfaEnabled(profile.mfaEnabled);
    }
  }, [profile]);

  const fetchSubscription = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: SubscriptionStatus }>(
        "/api/subscriptions/status",
        session.apiToken
      );
      setSubscription(res.data);
    } finally {
      setSubLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const fetchSessions = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: typeof activeSessions }>(
        "/api/auth/sessions",
        session.apiToken
      );
      setActiveSessions(res.data);
    } finally {
      setActiveSessionsLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function handleRevokeSession(id: string) {
    if (!session?.apiToken) return;
    await apiClient.delete(`/api/auth/sessions/${id}`, session.apiToken);
    setActiveSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.apiToken) return;
    setProfileState("saving");
    setProfileError("");
    try {
      await apiClient.patch("/api/auth/profile", { fullName }, session.apiToken);
      setProfileState("saved");
      setTimeout(() => setProfileState("idle"), 2500);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile");
      setProfileState("error");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.apiToken) return;
    setPasswordState("saving");
    setPasswordError("");
    try {
      await apiClient.patch(
        "/api/auth/password",
        { currentPassword, newPassword },
        session.apiToken
      );
      setPasswordState("saved");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPasswordState("idle"), 2500);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
      setPasswordState("error");
    }
  }

  async function handleStartMfaEnroll() {
    if (!session?.apiToken) return;
    setMfaError("");
    setMfaLoading(true);
    setMfaState("enrolling");
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.apiToken}` },
      });
      const json = await res.json() as { data?: { otpauthUrl: string; secret: string }; error?: string };
      if (!res.ok || !json.data) {
        setMfaState("idle");
        setMfaError(json.error ?? "Failed to start MFA setup. Please try again.");
        return;
      }
      setMfaSetupData(json.data);
      setTimeout(async () => {
        const canvas = document.getElementById("mfa-qr") as HTMLCanvasElement | null;
        if (canvas) await QRCode.toCanvas(canvas, json.data!.otpauthUrl, { width: 180 });
      }, 50);
    } catch {
      setMfaState("idle");
      setMfaError("Network error. Please check your connection and try again.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleConfirmMfaEnroll() {
    if (!session?.apiToken || mfaCode.length < 6) return;
    setMfaError("");
    setMfaLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.apiToken}` },
        body: JSON.stringify({ code: mfaCode }),
      });
      const json = await res.json() as { data?: { backupCodes: string[] }; error?: string };
      if (!res.ok || !json.data) {
        setMfaError(json.error ?? "Invalid code — check your authenticator app and try again.");
        setMfaCode("");
        return;
      }
      setBackupCodes(json.data.backupCodes);
      setMfaCode("");
      setMfaState("done");
      await refetchProfile();
    } catch {
      setMfaError("Network error. Please try again.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleDisableMfa() {
    if (!session?.apiToken || !mfaCode) return;
    setMfaError("");
    setMfaLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.apiToken}` },
        body: JSON.stringify({ code: mfaCode }),
      });
      const json = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) {
        setMfaError(json.error ?? "Invalid code. Use your authenticator app or a backup code.");
        setMfaCode("");
        return;
      }
      setMfaState("idle");
      setMfaCode("");
      await refetchProfile();
    } catch {
      setMfaError("Network error. Please try again.");
    } finally {
      setMfaLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your account preferences</p>
      </div>

      {/* Profile */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Profile</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              value={session?.user?.email ?? ""}
              disabled
              className="h-8 text-xs bg-muted/40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-xs">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="h-8 text-xs"
            />
          </div>
          {profileState === "error" && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {profileError}
            </p>
          )}
          {profileState === "saved" && (
            <p className="text-xs text-success flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Profile saved
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={profileState === "saving"}
          >
            {profileState === "saving" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Save Profile
          </Button>
        </form>
      </div>

      {/* Password */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword" className="text-xs">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword" className="text-xs">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-8 text-xs"
            />
          </div>
          {passwordState === "error" && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {passwordError}
            </p>
          )}
          {passwordState === "saved" && (
            <p className="text-xs text-success flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Password changed
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={passwordState === "saving"}
          >
            {passwordState === "saving" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Change Password
          </Button>
        </form>
      </div>

      {/* Subscription */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Subscription</h2>
        {subLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : subscription ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Plan</span>
              {subscription.productId && (
                <Badge variant="secondary" className="text-[10px]">
                  {subscription.productId}
                </Badge>
              )}
              {subscription.status === "active" || subscription.subscribed ? (
                <Badge variant="outline" className="text-[10px] text-success border-success/30">
                  active
                </Badge>
              ) : null}
            </div>
            {subscription.subscriptionEnd && (
              <p className="text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"}{" "}
                {new Date(subscription.subscriptionEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No active subscription</p>
        )}
      </div>

      {/* Security — Active Sessions */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Active Sessions</h2>
        {activeSessionsLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : activeSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active sessions</p>
        ) : (
          <ul className="space-y-2">
            {activeSessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">{s.userAgent ?? "Unknown device"}</span>
                  {s.current && <span className="ml-2 text-success">(this session)</span>}
                  <div className="text-muted-foreground/60">{s.ip} · {new Date(s.createdAt).toLocaleDateString()}</div>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => handleRevokeSession(s.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* MFA */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          {mfaEnabled
            ? <ShieldCheck className="h-4 w-4 text-success" />
            : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
          <h2 className="text-sm font-semibold">Two-Factor Authentication</h2>
          {mfaEnabled && <Badge variant="outline" className="text-xs text-success border-success/40 ml-auto">Enabled</Badge>}
        </div>

        {mfaState === "idle" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {mfaEnabled
                ? "Your account is protected with an authenticator app. You'll be asked for a code each time you sign in."
                : "Protect your account with a time-based one-time password (TOTP) from apps like Google Authenticator, Authy, or 1Password."}
            </p>
            {mfaError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {mfaError}
              </div>
            )}
            {mfaEnabled ? (
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setMfaError(""); setMfaCode(""); setMfaState("disabling"); }}>
                <ShieldOff className="mr-1.5 h-3 w-3" />
                Disable MFA
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={handleStartMfaEnroll} disabled={mfaLoading}>
                {mfaLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3 w-3" />}
                Enable MFA
              </Button>
            )}
          </div>
        )}

        {mfaState === "enrolling" && (
          <div className="space-y-4">
            {!mfaSetupData ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating your secret key…
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Step 1 — Scan with your authenticator app</p>
                  <p className="text-xs text-muted-foreground">Use Google Authenticator, Authy, 1Password, or any TOTP app.</p>
                </div>
                <canvas id="mfa-qr" className="rounded-lg border border-border/40" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
                  <div className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2">
                    <code className="text-xs flex-1 break-all select-all">{mfaSetupData.secret}</code>
                    <button
                      onClick={() => copyToClipboard(mfaSetupData.secret)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy secret"
                    >
                      {mfaCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Step 2 — Enter the 6-digit code from your app</p>
                  <Input
                    value={mfaCode}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setMfaCode(v);
                      if (mfaError) setMfaError("");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && mfaCode.length === 6) handleConfirmMfaEnroll(); }}
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="h-9 text-sm font-mono tracking-widest w-36"
                  />
                  {mfaError && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {mfaError}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleConfirmMfaEnroll} disabled={mfaCode.length < 6 || mfaLoading}>
                    {mfaLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                    Verify &amp; Enable
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMfaState("idle"); setMfaError(""); setMfaCode(""); setMfaSetupData(null); }}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {mfaState === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-success font-medium">
              <CheckCircle className="h-3.5 w-3.5" />
              MFA is now active on your account.
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Save your backup codes</p>
              <p className="text-xs text-muted-foreground">If you lose your phone, use one of these codes to sign in. Each code works once. Store them somewhere safe.</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 relative">
              <pre className="text-xs font-mono leading-relaxed">{backupCodes.join("\n")}</pre>
              <button
                onClick={() => copyToClipboard(backupCodes.join("\n"))}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy all codes"
              >
                {mfaCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => setMfaState("idle")}>
              I&apos;ve saved my codes
            </Button>
          </div>
        )}

        {mfaState === "disabling" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Disable Two-Factor Authentication</p>
              <p>Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
            </div>
            <Input
              value={mfaCode}
              onChange={(e) => {
                setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                if (mfaError) setMfaError("");
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && mfaCode.length >= 6) handleDisableMfa(); }}
              placeholder="000000"
              maxLength={8}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-9 text-sm font-mono tracking-widest w-36"
            />
            {mfaError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {mfaError}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDisableMfa} disabled={mfaCode.length < 6 || mfaLoading}>
                {mfaLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                Disable MFA
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMfaState("idle"); setMfaError(""); setMfaCode(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
