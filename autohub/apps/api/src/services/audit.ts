import * as Sentry from "@sentry/node";
import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";
import { logger } from "../lib/logger.js";

// PII and secret keys that must never appear in audit log metadata
const REDACTED_KEYS = new Set([
  "email", "password", "passwordHash", "token", "secret",
  "webhookUrl", "webhookUrlEncrypted", "authHeader", "authHeaderEncrypted",
  "signingSecret", "stripeKey", "apiKey", "resetToken",
]);

type MetadataValue = string | number | boolean | null | undefined | Record<string, unknown>;

function redactPII(obj: Record<string, MetadataValue>): Record<string, MetadataValue> {
  const result: Record<string, MetadataValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = REDACTED_KEYS.has(key) ||
      REDACTED_KEYS.has(lowerKey) ||
      [...REDACTED_KEYS].some((k) => lowerKey.includes(k.toLowerCase()));
    result[key] = isSensitive ? "[REDACTED]" : value;
  }
  return result;
}

export interface AuditEventParams {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, MetadataValue>;
  ip?: string | null;
  requestId?: string;
}

/**
 * Writes an immutable audit event to the audit_logs table.
 * Never throws — audit failure must not break the main request.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const safeMetadata = params.metadata ? redactPII(params.metadata) : null;
    const metadataWithRequestId = params.requestId
      ? { ...safeMetadata, requestId: params.requestId }
      : safeMetadata;

    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      action: params.action,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      metadata: metadataWithRequestId,
      ipAddress: params.ip ?? null,
    });
  } catch (err) {
    // Never propagate — audit failure must not break requests, but MUST page
    logger.error({ err }, "audit-write-failed");
    Sentry.captureException(err, { tags: { area: "audit" }, level: "error" });
  }
}
