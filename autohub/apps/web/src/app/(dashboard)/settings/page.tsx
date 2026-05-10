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
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { SubscriptionStatus } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    setMfaLoading(true);
    setMfaState("enrolling");
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.apiToken}` },
      });
      const json = await res.json() as { data: { otpauthUrl: string; secret: string } };
      setMfaSetupData(json.data);
      setTimeout(async () => {
        const canvas = document.getElementById("mfa-qr") as HTMLCanvasElement | null;
        if (canvas) await QRCode.toCanvas(canvas, json.data.otpauthUrl, { width: 180 });
      }, 100);
    } catch {
      setMfaState("idle");
      setMfaError("Failed to start MFA setup. Please try again.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleConfirmMfaEnroll() {
    if (!session?.apiToken || !mfaCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.apiToken}` },
        body: JSON.stringify({ code: mfaCode }),
      });
      const json = await res.json() as { data?: { backupCodes: string[] }; error?: string };
      if (!res.ok) { setMfaError(json.error ?? "Invalid code"); return; }
      setBackupCodes(json.data!.backupCodes);
      setMfaState("done");
      await refetchProfile();
    } catch {
      setMfaError("Something went wrong");
    }
  }

  async function handleDisableMfa() {
    if (!session?.apiToken || !mfaCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.apiToken}` },
        body: JSON.stringify({ code: mfaCode }),
      });
      const json = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) { setMfaError(json.error ?? "Invalid code"); return; }
      setMfaState("idle");
      setMfaCode("");
      await refetchProfile();
    } catch {
      setMfaError("Something went wrong");
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
        <h2 className="text-sm font-semibold">Two-Factor Authentication</h2>
        {mfaState === "idle" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {mfaEnabled ? "MFA is enabled on your account." : "Add an extra layer of security to your account."}
            </p>
            {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
            {mfaEnabled ? (
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => { setMfaError(""); setMfaState("disabling"); }}>
                Disable MFA
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={handleStartMfaEnroll} disabled={mfaLoading}>
                {mfaLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Enable MFA
              </Button>
            )}
          </div>
        )}
        {mfaState === "enrolling" && (
          <div className="space-y-3">
            {mfaLoading || !mfaSetupData ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Setting up MFA…
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Scan this QR code with your authenticator app:</p>
                <canvas id="mfa-qr" className="rounded-lg" />
                <p className="text-xs text-muted-foreground">Or enter this secret manually: <code className="text-xs">{mfaSetupData.secret}</code></p>
                <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} className="h-8 text-xs" />
                {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
                <Button size="sm" className="h-7 text-xs" onClick={handleConfirmMfaEnroll} disabled={mfaCode.length < 6}>Verify & Enable</Button>
              </>
            )}
          </div>
        )}
        {mfaState === "done" && (
          <div className="space-y-3">
            <p className="text-xs text-success">MFA enabled! Save these backup codes — they won&apos;t be shown again:</p>
            <pre className="text-xs bg-muted/40 rounded p-3">{backupCodes.join("\n")}</pre>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMfaState("idle")}>Done</Button>
          </div>
        )}
        {mfaState === "disabling" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter your current TOTP code or a backup code to disable MFA:</p>
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Code" className="h-8 text-xs" />
            {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDisableMfa}>Disable</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMfaState("idle"); setMfaError(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
