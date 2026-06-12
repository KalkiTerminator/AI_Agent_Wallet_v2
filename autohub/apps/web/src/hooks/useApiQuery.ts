"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";

interface ApiQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Replaces the ~6 hand-rolled `useEffect`+fetch loops scattered across pages.
 * Fetches `path` (with the session API token) and exposes data/loading/error/refetch.
 * Pass `null` as the path to skip (e.g. while a prerequisite isn't ready).
 */
export function useApiQuery<T>(path: string | null): ApiQueryState<T> {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!token || !path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiClient.get<T>(path, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [token, path]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
