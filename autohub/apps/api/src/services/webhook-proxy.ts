import { randomBytes, randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, executions, credits } from "../db/schema.js";
import { signPayload } from "./hmac.js";

const API_BASE_URL = process.env.AUTOHUB_API_URL ?? "http://localhost:4000";

export function generateSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

interface ProxyParams {
  toolId: string;
  userId: string;
  userRole?: string;
  inputs: Record<string, unknown>;
  ip?: string;
}

export class WebhookProxyService {
  static async execute({ toolId, userId, userRole, inputs }: ProxyParams) {
    const isAdmin = userRole === "admin";

    const [tool] = await db.select().from(aiTools).where(eq(aiTools.id, toolId)).limit(1);
    if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });
    if (!tool.isActive || tool.approvalStatus !== "approved") {
      throw Object.assign(new Error("Tool not available"), { status: 400 });
    }
    if (!tool.webhookUrl) throw Object.assign(new Error("Tool has no webhook configured"), { status: 400 });

    if (!isAdmin) {
      const [creditRow] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
      if (!creditRow || creditRow.currentCredits < tool.creditCost) {
        throw Object.assign(new Error("Insufficient credits"), { status: 402 });
      }
    }

    const executionId = randomUUID();
    const [execution] = await db.insert(executions).values({
      id: executionId,
      toolId,
      userId,
      status: "pending",
      requestPayload: inputs,
      creditsDebited: 0,
    }).returning();

    if (tool.executionMode === "async") {
      return this.executeAsync({ tool, execution, inputs, isAdmin });
    }
    return this.executeSync({ tool, execution, inputs, isAdmin });
  }

  private static async executeSync({ tool, execution, inputs, isAdmin }: {
    tool: typeof aiTools.$inferSelect;
    execution: typeof executions.$inferSelect;
    inputs: Record<string, unknown>;
    isAdmin: boolean;
  }) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ executionId: execution.id, inputs });
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (tool.signingSecretHash) {
      const sig = signPayload(tool.signingSecretHash, timestamp, execution.id, body);
      headers["X-AutoHub-Timestamp"] = timestamp;
      headers["X-AutoHub-Signature"] = sig;
    }

    const controller = new AbortController();
    const timeoutMs = (tool.webhookTimeout ?? 30) * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(tool.webhookUrl!, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        await db.update(executions)
          .set({ status: "failed", error: `Webhook returned ${res.status}`, completedAt: new Date() })
          .where(eq(executions.id, execution.id));
        return { executionId: execution.id, status: "failed" as const, error: `Webhook returned ${res.status}` };
      }

      const responsePayload = await res.json().catch(() => null);
      const creditsDebited = isAdmin ? 0 : tool.creditCost;

      if (!isAdmin) {
        await db.execute(
          sql`UPDATE credits SET current_credits = current_credits - ${tool.creditCost} WHERE user_id = ${execution.userId} AND current_credits >= ${tool.creditCost}`
        );
      }

      await db.update(executions)
        .set({ status: "success", responsePayload, creditsDebited, completedAt: new Date() })
        .where(eq(executions.id, execution.id));

      return { executionId: execution.id, status: "success" as const, output: responsePayload, creditsDebited };
    } catch (err) {
      const isTimeout = (err as Error).name === "AbortError";
      const status = isTimeout ? "timeout" as const : "failed" as const;
      await db.update(executions)
        .set({ status, error: (err as Error).message, completedAt: new Date() })
        .where(eq(executions.id, execution.id));
      return { executionId: execution.id, status };
    }
  }

  private static async executeAsync({ tool, execution, inputs, isAdmin }: {
    tool: typeof aiTools.$inferSelect;
    execution: typeof executions.$inferSelect;
    inputs: Record<string, unknown>;
    isAdmin: boolean;
  }) {
    const callbackUrl = `${API_BASE_URL}/api/executions/${execution.id}/callback`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ executionId: execution.id, inputs, callbackUrl });
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (tool.signingSecretHash) {
      const sig = signPayload(tool.signingSecretHash, timestamp, execution.id, body);
      headers["X-AutoHub-Timestamp"] = timestamp;
      headers["X-AutoHub-Signature"] = sig;
    }

    // Fire and forget
    fetch(tool.webhookUrl!, { method: "POST", headers, body }).catch(() => {
      db.update(executions)
        .set({ status: "failed", error: "Failed to reach webhook", completedAt: new Date() })
        .where(eq(executions.id, execution.id));
    });

    return { executionId: execution.id, status: "pending" as const };
  }
}
