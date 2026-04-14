"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { CreditBalance } from "@/types";

export function useCredits() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.apiToken) return;
    let cancelled = false;
    setLoading(true);
    setCredits(null);
    apiClient
      .get<{ data: CreditBalance }>("/api/credits", session.apiToken)
      .then((res) => { if (!cancelled) setCredits(res.data.currentCredits); })
      .catch(() => { if (!cancelled) setCredits(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.apiToken]);

  return { credits, loading };
}
