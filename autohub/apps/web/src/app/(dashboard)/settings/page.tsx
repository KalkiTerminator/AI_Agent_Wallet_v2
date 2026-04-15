"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { SubscriptionStatus } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { data: session } = useSession();

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

  // Seed name from session
  useEffect(() => {
    if (session?.user?.name) setFullName(session.user.name);
  }, [session?.user?.name]);

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
    </div>
  );
}
