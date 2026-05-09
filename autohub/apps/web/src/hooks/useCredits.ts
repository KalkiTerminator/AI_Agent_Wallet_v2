"use client";
import { useUserProfile } from "@/context/UserProfileContext";

// Reads credits from UserProfileContext (/api/account/me) instead of making
// a separate /api/credits call — eliminates one cross-region RTT per page load.
export function useCredits() {
  const { profile, loading } = useUserProfile();
  return {
    credits: profile?.currentCredits ?? null,
    loading,
  };
}
