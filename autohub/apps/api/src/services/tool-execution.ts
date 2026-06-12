import { eq, sql, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, toolUsages, credits, webhookExecutionLog } from "../db/schema.js";
import type { ToolUsageStatus } from "@autohub/shared";
import { decrypt } from "./crypto.js";
import { signPayload } from "./hmac.js";
import { safeFetch, SSRFError } from "./url-guard.js";
import { canAttempt, recordSuccess, recordFailure } from "./circuit-breaker.js";
import { logAuditEvent } from "./audit.js";

// Read a webhook response body without silently discarding non-JSON output.
// Prefers parsed JSON, falls back to the raw string, null only when empty.
async function readResponseBody(res: Response): Promise<unknown> {
  const raw = await res.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Builds outbound webhook headers: creator-supplied auth header + HMAC signature
async function buildWebhookHeaders(
  tool: { signingSecretEncrypted: string | null; authHeaderEncrypted: string | null },
  usageId: string,
  body: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (tool.authHeaderEncrypted) {
    const authHeader = await decrypt(tool.authHeaderEncrypted);
    const [headerName, ...rest] = authHeader.split(":");
    if (headerName && rest.length) {
      headers[headerName.trim()] = rest.join(":").trim();
    }
  }

  if (tool.signingSecretEncrypted) {
    const secret = await decrypt(tool.signingSecretEncrypted);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-AutoHub-Timestamp"] = timestamp;
    headers["X-AutoHub-Signature"] = signPayload(secret, timestamp, usageId, body);
  }

  return headers;
}

interface ExecuteParams {
  toolId: string;
  userId: string;
  userRole?: string;
  inputs: Record<string, unknown>;
  ip?: string;
}

export function redactPhiFields(
  inputs: Record<string, unknown>,
  inputFields: Array<{ name: string; isPhi?: boolean }>,
): Record<string, unknown> {
  if (!inputFields.length) return inputs;
  const phiFieldNames = new Set(
    inputFields.filter((f) => f.isPhi).map((f) => f.name)
  );
  if (!phiFieldNames.size) return inputs;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    result[key] = phiFieldNames.has(key) ? "[PHI REDACTED]" : value;
  }
  return result;
}

export class ToolExecutionService {
  static async execute({ toolId, userId, userRole, inputs, ip }: ExecuteParams) {
    // Load tool
    const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, toolId), isNull(aiTools.deletedAt))).limit(1);
    if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });
    if (!tool.isActive || tool.approvalStatus !== "approved") {
      throw Object.assign(new Error("Tool not available"), { status: 400 });
    }

    const isAdmin = userRole === "admin";

    const safeInputs = redactPhiFields(
      inputs,
      (tool.inputFields as Array<{ name: string; isPhi?: boolean }>) ?? [],
    );

    if (!isAdmin) {
      // Check credits (atomic check)
      const [creditRow] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
      if (!creditRow || creditRow.currentCredits < tool.creditCost) {
        throw Object.assign(new Error("Insufficient credits"), { status: 402 });
      }
    }

    // Phase 1: Deduct credits + insert usage record
    let usage: typeof toolUsages.$inferSelect;
    if (isAdmin) {
      [usage] = await db.insert(toolUsages).values({
        userId,
        toolId,
        inputData: safeInputs,
        creditsUsed: 0,
        status: "pending",
        ipAddress: ip,
      }).returning();
    } else {
      // Deduct credits + insert usage record (in transaction)
      [usage] = await db.transaction(async (tx) => {
        // Atomic compare-and-deduct. The WHERE guard means the balance can
        // never go negative, so the deduction's success must be read from the
        // affected row count — NOT from a post-update "< 0" check (which can
        // never be true and let concurrent boundary requests run for free).
        const deduction = await tx.execute(
          sql`UPDATE credits SET current_credits = current_credits - ${tool.creditCost} WHERE user_id = ${userId} AND current_credits >= ${tool.creditCost}`
        );
        if (((deduction as { rowCount?: number }).rowCount ?? 0) === 0) {
          throw Object.assign(new Error("Insufficient credits"), { status: 402 });
        }

        return tx.insert(toolUsages).values({
          userId,
          toolId,
          inputData: safeInputs,
          creditsUsed: tool.creditCost,
          status: "pending",
          ipAddress: ip,
        }).returning();
      });
    }

    // Resolve webhook URL — new tools store it encrypted; legacy rows may have plaintext
    const webhookUrl = tool.webhookUrlEncrypted
      ? await decrypt(tool.webhookUrlEncrypted)
      : tool.webhookUrl;

    if (!webhookUrl) {
      await db.update(toolUsages).set({ status: "success", completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "success" as ToolUsageStatus, creditsDeducted: isAdmin ? 0 : tool.creditCost };
    }

    // Phase 2: Call webhook (outside transaction, with retry)
    const result = await this.callWebhookWithRetry({ tool, usage, inputs, webhookUrl, isAdmin });
    return result;
  }

  static async executeSandbox({
    toolId,
    userId,
    userRole,
    inputs,
    ip,
  }: {
    toolId: string;
    userId: string;
    userRole: string;
    inputs: Record<string, unknown>;
    ip?: string;
  }) {
    const [tool] = await db
      .select()
      .from(aiTools)
      .where(and(eq(aiTools.id, toolId), isNull(aiTools.deletedAt)))
      .limit(1);
    if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });

    const isAdmin = userRole === "admin";
    const isOwner = tool.createdByUserId === userId;
    if (!isAdmin && !isOwner) throw Object.assign(new Error("Forbidden"), { status: 403 });

    const safeInputs = redactPhiFields(
      inputs,
      (tool.inputFields as Array<{ name: string; isPhi?: boolean }>) ?? [],
    );

    const [usage] = await db.insert(toolUsages).values({
      userId,
      toolId,
      inputData: safeInputs,
      creditsUsed: 0,
      status: "sandbox" as any,
      ipAddress: ip,
    }).returning();

    if (!tool.webhookUrlEncrypted && !tool.webhookUrl) {
      await db.update(toolUsages).set({ completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "sandbox", creditsDeducted: 0 };
    }

    const webhookUrl = tool.webhookUrlEncrypted
      ? await decrypt(tool.webhookUrlEncrypted)
      : tool.webhookUrl!;

    try {
      // safeFetch validates + re-validates every redirect hop (DNS-rebinding +
      // redirect-to-metadata SSRF defense)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(tool.webhookTimeout ?? 30, 300) * 1000);
      const res = await safeFetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Autohub-Sandbox": "true" },
        body: JSON.stringify({ usageId: usage.id, inputs }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const outputData = res.ok ? await readResponseBody(res) : null;
      await db.update(toolUsages).set({ outputData, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "sandbox", output: outputData, creditsDeducted: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(toolUsages).set({ errorMessage: msg, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "sandbox", error: msg, creditsDeducted: 0 };
    }
  }

  private static async callWebhookWithRetry({
    tool,
    usage,
    inputs,
    webhookUrl,
    isAdmin,
  }: {
    tool: { id: string; webhookTimeout: number; webhookRetries: number; creditCost: number; signingSecretEncrypted: string | null; authHeaderEncrypted: string | null };
    usage: { id: string; userId: string };
    inputs: Record<string, unknown>;
    webhookUrl: string;
    isAdmin: boolean;
  }) {
    const maxAttempts = tool.webhookRetries + 1;
    const delays = [0, 2000, 8000]; // 0s, 2s, 8s
    const creditsDeducted = isAdmin ? 0 : tool.creditCost;

    const refund = async () => {
      if (!isAdmin) {
        await db.execute(
          sql`UPDATE credits SET current_credits = current_credits + ${tool.creditCost} WHERE user_id = ${usage.userId}`
        );
      }
    };

    // Circuit breaker: if this tool has been failing, reject fast and refund
    // instead of hammering a dead endpoint (works across replicas via Redis).
    if ((await canAttempt(tool.id)) === "reject") {
      await refund();
      await db.update(toolUsages)
        .set({ status: "refunded", errorMessage: "Tool temporarily unavailable (circuit breaker open)", completedAt: new Date() })
        .where(eq(toolUsages.id, usage.id));
      return { usageId: usage.id, status: "refunded" as ToolUsageStatus, creditsDeducted: 0 };
    }

    const body = JSON.stringify({ usageId: usage.id, inputs });
    const headers = await buildWebhookHeaders(tool, usage.id, body);

    let lastError: Error | null = null;
    let outputData: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, delays[attempt - 1] ?? 8000));

      const start = Date.now();
      try {
        // safeFetch validates + re-validates every redirect hop on each attempt
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(tool.webhookTimeout ?? 30, 300) * 1000);

        const res = await safeFetch(webhookUrl, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const durationMs = Date.now() - start;

        if (res.ok) {
          outputData = await readResponseBody(res);
          await db.insert(webhookExecutionLog).values({
            usageId: usage.id,
            toolId: tool.id,
            attempt,
            status: "success",
            durationMs,
          });

          await db.update(toolUsages).set({ status: "success", outputData, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
          await recordSuccess(tool.id);
          return { usageId: usage.id, status: "success" as ToolUsageStatus, output: outputData, creditsDeducted };
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

        // SSRF rejection is deterministic — retrying won't help
        if (err instanceof SSRFError) break;
      }
    }

    // All attempts failed — refund credits (admins were never charged) and
    // record one breaker failure for the tool (not one per retry attempt).
    await refund();
    const tripped = await recordFailure(tool.id);
    if (tripped) {
      await logAuditEvent({
        userId: usage.userId,
        action: "tool.circuit_breaker.opened",
        resourceType: "tool",
        resourceId: tool.id,
        metadata: { reason: lastError?.message },
      });
    }
    await db.update(toolUsages).set({ status: "refunded", errorMessage: lastError?.message, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));

    return { usageId: usage.id, status: "refunded" as ToolUsageStatus, creditsDeducted: 0 };
  }
}
