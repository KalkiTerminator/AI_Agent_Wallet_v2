import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, toolUsages, credits, webhookExecutionLog } from "../db/schema.js";
import type { ToolUsageStatus } from "@autohub/shared";

interface ExecuteParams {
  toolId: string;
  userId: string;
  inputs: Record<string, unknown>;
  ip?: string;
}

export class ToolExecutionService {
  static async execute({ toolId, userId, inputs, ip }: ExecuteParams) {
    // Load tool
    const [tool] = await db.select().from(aiTools).where(eq(aiTools.id, toolId)).limit(1);
    if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });
    if (!tool.isActive || tool.approvalStatus !== "approved") {
      throw Object.assign(new Error("Tool not available"), { status: 400 });
    }

    // Check credits (atomic check)
    const [creditRow] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
    if (!creditRow || creditRow.currentCredits < tool.creditCost) {
      throw Object.assign(new Error("Insufficient credits"), { status: 402 });
    }

    // Phase 1: Deduct credits + insert usage record (in transaction)
    const [usage] = await db.transaction(async (tx) => {
      // Atomic deduction
      await tx.execute(
        sql`UPDATE credits SET current_credits = current_credits - ${tool.creditCost} WHERE user_id = ${userId} AND current_credits >= ${tool.creditCost}`
      );

      // Re-check (race condition guard)
      const [updated] = await tx.select().from(credits).where(eq(credits.userId, userId)).limit(1);
      if (!updated || updated.currentCredits < 0) {
        throw Object.assign(new Error("Insufficient credits"), { status: 402 });
      }

      return tx.insert(toolUsages).values({
        userId,
        toolId,
        inputData: inputs,
        creditsUsed: tool.creditCost,
        status: "pending",
        ipAddress: ip,
      }).returning();
    });

    if (!tool.webhookUrl) {
      await db.update(toolUsages).set({ status: "success", completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "success" as ToolUsageStatus, creditsDeducted: tool.creditCost };
    }

    // Phase 2: Call webhook (outside transaction, with retry)
    const result = await this.callWebhookWithRetry({ tool, usage, inputs });
    return result;
  }

  private static async callWebhookWithRetry({
    tool,
    usage,
    inputs,
  }: {
    tool: { id: string; webhookUrl: string | null; webhookTimeout: number; webhookRetries: number; creditCost: number };
    usage: { id: string; userId: string };
    inputs: Record<string, unknown>;
  }) {
    const maxAttempts = tool.webhookRetries + 1;
    const delays = [0, 2000, 8000]; // 0s, 2s, 8s

    let lastError: Error | null = null;
    let outputData: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, delays[attempt - 1] ?? 8000));

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), tool.webhookTimeout * 1000);

        const res = await fetch(tool.webhookUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usageId: usage.id, inputs }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const durationMs = Date.now() - start;

        if (res.ok) {
          outputData = await res.json().catch(() => null);
          await db.insert(webhookExecutionLog).values({
            usageId: usage.id,
            toolId: tool.id,
            attempt,
            status: "success",
            durationMs,
          });

          await db.update(toolUsages).set({ status: "success", outputData, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
          return { usageId: usage.id, status: "success" as ToolUsageStatus, output: outputData, creditsDeducted: tool.creditCost };
        }

        lastError = new Error(`Webhook returned ${res.status}`);
        await db.insert(webhookExecutionLog).values({
          usageId: usage.id,
          toolId: tool.id,
          attempt,
          status: "failed",
          durationMs,
          errorMessage: lastError.message,
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        lastError = err instanceof Error ? err : new Error(String(err));
        const status = lastError.name === "AbortError" ? "timeout" : "failed";

        await db.insert(webhookExecutionLog).values({
          usageId: usage.id,
          toolId: tool.id,
          attempt,
          status,
          durationMs,
          errorMessage: lastError.message,
        });
      }
    }

    // All attempts failed — refund credits
    await db.execute(
      sql`UPDATE credits SET current_credits = current_credits + ${tool.creditCost} WHERE user_id = ${usage.userId}`
    );
    await db.update(toolUsages).set({ status: "refunded", errorMessage: lastError?.message, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));

    return { usageId: usage.id, status: "refunded" as ToolUsageStatus, creditsDeducted: 0 };
  }
}
