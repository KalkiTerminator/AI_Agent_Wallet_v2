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
      const res = await apiClient.get<{ data: AITool[] }>("/api/tools", session.apiToken);
      setTools(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const toggleFavorite = useCallback((toolId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  }, []);

  return { tools, loading, error, favorites, toggleFavorite, refetch: fetchTools };
}
