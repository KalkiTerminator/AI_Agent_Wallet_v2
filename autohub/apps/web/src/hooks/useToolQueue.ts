"use client";
import { useSession } from "next-auth/react";
import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { ToolExecutionResult } from "@/types";

export interface QueueItem {
  id: string;
  toolId: string;
  toolName: string;
  inputs: Record<string, unknown>;
  status: "pending" | "processing" | "success" | "failed";
  creditsUsed?: number;
  output?: unknown;
  error?: string;
}

export function useToolQueue() {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  // Keep ref in sync with state so processQueue can read current queue without stale closure
  const setQueueSynced = useCallback((updater: (prev: QueueItem[]) => QueueItem[]) => {
    setQueue((prev) => {
      const next = updater(prev);
      queueRef.current = next;
      return next;
    });
  }, []);

  const addToQueue = useCallback((toolId: string, toolName: string, inputs: Record<string, unknown>) => {
    setQueueSynced((prev) => [
      ...prev,
      { id: crypto.randomUUID(), toolId, toolName, inputs, status: "pending" },
    ]);
  }, [setQueueSynced]);

  const removeFromQueue = useCallback((id: string) => {
    setQueueSynced((prev) => prev.filter((item) => item.id !== id || item.status !== "pending"));
  }, [setQueueSynced]);

  const clearCompleted = useCallback(() => {
    setQueueSynced((prev) => prev.filter((item) => item.status === "pending" || item.status === "processing"));
  }, [setQueueSynced]);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !session?.apiToken) return;
    processingRef.current = true;
    setIsProcessing(true);

    try {
      const pending = queueRef.current.filter((i) => i.status === "pending");
      for (const item of pending) {
        setQueueSynced((q) => q.map((i) => i.id === item.id ? { ...i, status: "processing" } : i));
        try {
          const res = await apiClient.post<{ data: ToolExecutionResult }>(
            `/api/tools/${item.toolId}/execute`,
            { inputs: item.inputs },
            session.apiToken
          );
          setQueueSynced((q) => q.map((i) =>
            i.id === item.id
              ? { ...i, status: "success", output: res.data.output, creditsUsed: res.data.creditsDeducted }
              : i
          ));
        } catch (e) {
          setQueueSynced((q) => q.map((i) =>
            i.id === item.id
              ? { ...i, status: "failed", error: e instanceof Error ? e.message : "Execution failed" }
              : i
          ));
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [session?.apiToken, setQueueSynced]);

  return { queue, isProcessing, addToQueue, processQueue, removeFromQueue, clearCompleted };
}
