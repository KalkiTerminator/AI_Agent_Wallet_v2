import { randomBytes, randomUUID } from "crypto";
import { eq, sql, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, executions, credits } from "../db/schema.js";
import { signPayload } from "./hmac.js";
import { validateOutboundUrl, SSRFError } from "./url-guard.js";
import { decrypt } from "./crypto.js";
import { logAuditEvent } from "./audit.js";
import { env } from "../env.js";

const API_BASE_URL = env.AUTOHUB_API_URL;

export function generateSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

// ── Circuit Breaker ───────────────────────────────────────────────────────────

interface CircuitState {
  failures: number;
  firstFailureAt: number;
  openedAt: number | null;
  status: "closed" | "open" | "half-open";
  cachedError: string | null;
  probeInFlight: boolean;
}

const circuits = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OPEN_DURATION_MS = 2 * 60 * 1000;   // 2 minutes before half-open

function getCircuit(toolId: string): CircuitState {
  if (!circuits.has(toolId)) {
    circuits.set(toolId, { failures: 0, firstFailureAt: 0, openedAt: null, status: "closed", cachedError: null, probeInFlight: false });
  }
  return circuits.get(toolId)!;
}

function recordSuccess(toolId: string): void {
  circuits.set(toolId, { failures: 0, firstFailureAt: 0, openedAt: null, status: "closed", cachedError: null, probeInFlight: false });
}

function recordFailure(toolId: string, error: string): "open" | "closed" {
  const c = getCircuit(toolId);
  const now = Date.now();

  // Reset failure window if first failure was too long ago
  if (c.firstFailureAt && now - c.firstFailureAt > FAILURE_WINDOW_MS) {
    c.failures = 0;
    c.firstFailureAt = 0;
  }

  if (!c.firstFailureAt) c.firstFailureAt = now;
  c.failures++;
  c.cachedError = error;

  if (c.failures >= FAILURE_THRESHOLD) {
    c.status = "open";
    c.openedAt = now;
    c.probeInFlight = false; // reset so next half-open window allows a probe
    return "open";
  }
  c.probeInFlight = false;
  return "closed";
}

function shouldAllow(toolId: string): "allow" | "reject" {
  const c = getCircuit(toolId);
  if (c.status === "closed") return "allow";
  if (c.status === "open") {
    const now = Date.now();
    if (c.openedAt && now - c.openedAt > OPEN_DURATION_MS) {
      c.status = "half-open";
      // fall through to half-open handling
    } else {
      return "reject";
    }
  }
  // half-open: allow exactly one probe at a time
  if (c.probeInFlight) return "reject";
  c.probeInFlight = true;
  return "allow";
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

    const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, toolId), isNull(aiTools.deletedAt))).limit(1);
    if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });
    if (!tool.isActive || tool.approvalStatus !== "approved") {
      throw Object.assign(new Error("Tool not available"), { status: 400 });
    }
    // Resolve webhook URL — prefer encrypted field, fall back to legacy plain field
    const rawWebhookUrl = tool.webhookUrlEncrypted
      ? await decrypt(tool.webhookUrlEncrypted)
      : tool.webhookUrl;
    if (!rawWebhookUrl) throw Object.assign(new Error("Tool has no webhook configured"), { status: 400 });

    // Resolve optional auth header
    const authHeader = tool.authHeaderEncrypted ? await decrypt(tool.authHeaderEncrypted) : null;

    // Attach resolved values so private methods can use them without re-decrypting
    const resolvedTool = { ...tool, _resolvedWebhookUrl: rawWebhookUrl, _resolvedAuthHeader: authHeader };

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
      return this.executeAsync({ tool: resolvedTool, execution, inputs, isAdmin });
    }
    return this.executeSync({ tool: resolvedTool, execution, inputs, isAdmin });
  }

  private static async executeSync({ tool, execution, inputs, isAdmin }: {
    tool: typeof aiTools.$inferSelect & { _resolvedWebhookUrl: string; _resolvedAuthHeader: string | null };
    execution: typeof executions.$inferSelect;
    inputs: Record<string, unknown>;
    isAdmin: boolean;
  }) {
    const webhookUrl = tool._resolvedWebhookUrl;

    // Circuit breaker check
    const circuitDecision = shouldAllow(tool.id);
    if (circuitDecision === "reject") {
      return {
        executionId: execution.id,
        status: "failed" as const,
        error: `Tool circuit breaker open: ${getCircuit(tool.id).cachedError ?? "repeated failures"}`,
      };
    }

    // SSRF guard: validate + pin resolved IP on every call to defeat DNS rebinding
    let resolvedIp: string;
    try {
      ({ resolvedIp } = await validateOutboundUrl(webhookUrl));
    } catch (err) {
      if (err instanceof SSRFError) {
        await db.update(executions)
          .set({ status: "failed", error: `SSRF blocked: ${err.message}`, completedAt: new Date() })
          .where(eq(executions.id, execution.id));
        return { executionId: execution.id, status: "failed" as const, error: err.message };
      }
      throw err;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ executionId: execution.id, inputs });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-AutoHub-Resolved-IP": resolvedIp,
    };

    // Attach creator-provided auth header (decrypted, never logged)
    if (tool._resolvedAuthHeader) {
      const [headerName, ...rest] = tool._resolvedAuthHeader.split(":");
      if (headerName && rest.length) {
        headers[headerName.trim()] = rest.join(":").trim();
      }
    }

    if (tool.signingSecretEncrypted) {
      const secret = await decrypt(tool.signingSecretEncrypted);
      const sig = signPayload(secret, timestamp, execution.id, body);
      headers["X-AutoHub-Timestamp"] = timestamp;
      headers["X-AutoHub-Signature"] = sig;
    } else if (tool.signingSecretHash) {
      // Legacy: old tool not yet backfilled — skip signing and alert
      const Sentry = await import("@sentry/node");
      Sentry.captureMessage(`Tool ${tool.id} has no signingSecretEncrypted; signing skipped`, "warning");
    }

    // Hard platform cap: 60s regardless of tool configuration
    const PLATFORM_TIMEOUT_MS = 60_000;
    const controller = new AbortController();
    const timeoutMs = Math.min((tool.webhookTimeout ?? 30) * 1000, PLATFORM_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const errMsg = `Webhook returned ${res.status}`;
        const circuitStatus = recordFailure(tool.id, errMsg);
        if (circuitStatus === "open") {
          await db.update(aiTools).set({ toolStatus: "degraded" }).where(eq(aiTools.id, tool.id));
          await logAuditEvent({
            userId: execution.userId,
            action: "tool.circuit_breaker.opened",
            resourceType: "tool",
            resourceId: tool.id,
            metadata: { reason: errMsg },
          });
        }
        // Mark tool broken on auth failures
        if (res.status === 401 || res.status === 403 || res.status === 407) {
          await db.update(aiTools).set({ toolStatus: "broken" }).where(eq(aiTools.id, tool.id));
          await logAuditEvent({
            userId: execution.userId,
            action: "tool.webhook.auth_failed",
            resourceType: "tool",
            resourceId: tool.id,
            metadata: { statusCode: res.status },
          });
        }
        await db.update(executions)
          .set({ status: "failed", error: errMsg, completedAt: new Date() })
          .where(eq(executions.id, execution.id));
        return { executionId: execution.id, status: "failed" as const, error: errMsg };
      }

      // Cap response body at 1MB to prevent memory exhaustion
      const MAX_RESPONSE_BYTES = 1_048_576;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        await db.update(executions)
          .set({ status: "failed", error: "Webhook response exceeded 1MB limit", completedAt: new Date() })
          .where(eq(executions.id, execution.id));
        return { executionId: execution.id, status: "failed" as const, error: "Response too large" };
      }
      const responsePayload = JSON.parse(new TextDecoder().decode(buffer));
      const creditsDebited = isAdmin ? 0 : tool.creditCost;

      if (!isAdmin) {
        await db.execute(
          sql`UPDATE credits SET current_credits = current_credits - ${tool.creditCost} WHERE user_id = ${execution.userId} AND current_credits >= ${tool.creditCost}`
        );
      }

      await db.update(executions)
        .set({ status: "success", responsePayload, creditsDebited, completedAt: new Date() })
        .where(eq(executions.id, execution.id));

      await logAuditEvent({
        userId: execution.userId,
        action: "tool.executed",
        resourceType: "tool",
        resourceId: execution.toolId,
        metadata: { executionId: execution.id, creditsDebited, status: "success" },
      });

      recordSuccess(tool.id);

      return { executionId: execution.id, status: "success" as const, output: responsePayload, creditsDebited };
    } catch (err) {
      const isTimeout = (err as Error).name === "AbortError";
      const errMsg = isTimeout ? "Webhook timed out" : (err as Error).message;
      const circuitStatus = recordFailure(tool.id, errMsg);
      if (circuitStatus === "open") {
        await db.update(aiTools).set({ toolStatus: "degraded" }).where(eq(aiTools.id, tool.id));
        await logAuditEvent({
          userId: execution.userId,
          action: "tool.circuit_breaker.opened",
          resourceType: "tool",
          resourceId: tool.id,
          metadata: { reason: errMsg },
        });
      }
      const status = isTimeout ? "timeout" as const : "failed" as const;
      await db.update(executions)
        .set({ status, error: errMsg, completedAt: new Date() })
        .where(eq(executions.id, execution.id));
      return { executionId: execution.id, status };
    }
  }

  private static async executeAsync({ tool, execution, inputs, isAdmin }: {
    tool: typeof aiTools.$inferSelect & { _resolvedWebhookUrl: string; _resolvedAuthHeader: string | null };
    execution: typeof executions.$inferSelect;
    inputs: Record<string, unknown>;
    isAdmin: boolean;
  }) {
    const webhookUrl = tool._resolvedWebhookUrl;

    // SSRF guard on every call to defeat DNS rebinding
    try {
      await validateOutboundUrl(webhookUrl);
    } catch (err) {
      if (err instanceof SSRFError) {
        await db.update(executions)
          .set({ status: "failed", error: `SSRF blocked: ${err.message}`, completedAt: new Date() })
          .where(eq(executions.id, execution.id));
        return { executionId: execution.id, status: "failed" as const, error: err.message };
      }
      throw err;
    }

    const callbackUrl = `${API_BASE_URL}/api/executions/${execution.id}/callback`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ executionId: execution.id, inputs, callbackUrl });
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (tool._resolvedAuthHeader) {
      const [headerName, ...rest] = tool._resolvedAuthHeader.split(":");
      if (headerName && rest.length) {
        headers[headerName.trim()] = rest.join(":").trim();
      }
    }

    if (tool.signingSecretEncrypted) {
      const secret = await decrypt(tool.signingSecretEncrypted);
      const sig = signPayload(secret, timestamp, execution.id, body);
      headers["X-AutoHub-Timestamp"] = timestamp;
      headers["X-AutoHub-Signature"] = sig;
    } else if (tool.signingSecretHash) {
      const Sentry = await import("@sentry/node");
      Sentry.captureMessage(`Tool ${tool.id} has no signingSecretEncrypted; signing skipped`, "warning");
    }

    // Fire and forget — credits deducted by callback handler on success
    const dispatchController = new AbortController();
    const dispatchTimer = setTimeout(() => dispatchController.abort(), 30_000);
    fetch(webhookUrl, { method: "POST", headers, body, signal: dispatchController.signal })
      .catch((err) => {
        db.update(executions)
          .set({
            status: "failed",
            error: err.name === "AbortError" ? "Webhook dispatch timeout" : "Failed to reach webhook",
            completedAt: new Date(),
          })
          .where(eq(executions.id, execution.id));
      })
      .finally(() => clearTimeout(dispatchTimer));

    return { executionId: execution.id, status: "pending" as const };
  }
}
