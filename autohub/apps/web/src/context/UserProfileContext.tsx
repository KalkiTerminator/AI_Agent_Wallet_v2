"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  currentCredits: number;
  onboardedAt: string | null;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
}

interface UserProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refetch: () => Promise<void>;
  markOnboarded: () => void;
  revertOnboarded: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue>({
  profile: null,
  loading: true,
  refetch: async () => {},
  markOnboarded: () => {},
  revertOnboarded: () => {},
});

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: UserProfile }>("/api/account/me", session.apiToken);
      setProfile(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status, fetchProfile]);

  const markOnboarded = useCallback(() => {
    setProfile((prev) => (prev ? { ...prev, onboardedAt: new Date().toISOString() } : prev));
  }, []);

  const revertOnboarded = useCallback(() => {
    setProfile((prev) => (prev ? { ...prev, onboardedAt: null } : prev));
  }, []);

  return (
    <UserProfileContext.Provider value={{ profile, loading, refetch: fetchProfile, markOnboarded, revertOnboarded }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserProfileContext);
}
