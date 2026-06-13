"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { AITool } from "@/types";

export function useTools() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchTools = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    setError(null);
    try {
      const [toolsRes, favRes] = await Promise.all([
        apiClient.get<{ data: AITool[] }>("/api/tools", session.apiToken),
        apiClient.get<{ data: string[] }>("/api/tools/favorites", session.apiToken).catch(() => ({ data: [] as string[] })),
      ]);
      setTools(toolsRes.data);
      setFavorites(new Set(favRes.data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // Server-persisted favorite toggle with optimistic update + rollback on failure.
  const toggleFavorite = useCallback(
    (toolId: string) => {
      if (!session?.apiToken) return;
      const wasFav = favorites.has(toolId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(toolId);
        else next.add(toolId);
        return next;
      });
      const call = wasFav
        ? apiClient.delete(`/api/tools/${toolId}/favorite`, session.apiToken)
        : apiClient.post(`/api/tools/${toolId}/favorite`, {}, session.apiToken);
      void call.catch(() => {
        // rollback
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(toolId);
          else next.delete(toolId);
          return next;
        });
      });
    },
    [session?.apiToken, favorites]
  );

  // Persist a 1–5 rating; updates the local aggregate optimistically.
  const rateTool = useCallback(
    async (toolId: string, rating: number) => {
      if (!session?.apiToken) return;
      await apiClient.patch(`/api/tools/${toolId}/rating`, { rating }, session.apiToken);
    },
    [session?.apiToken]
  );

  return { tools, loading, error, favorites, toggleFavorite, rateTool, refetch: fetchTools };
}
