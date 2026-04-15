"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { SubscriptionStatus } from "@/types";

export function useSubscription() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: SubscriptionStatus }>(
        "/api/subscriptions/status",
        session.apiToken
      );
      setSubscription(res.data);
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return { subscription, loading, refetch: fetchSubscription };
}
