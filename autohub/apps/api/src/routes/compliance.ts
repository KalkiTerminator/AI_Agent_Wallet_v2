import { Hono } from "hono";
import { eq, and, gte, lte, desc, isNull, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/index.js";
import {
  auditLogs, users, userRoles, sessions, dataSubjectRequests,
} from "../db/schema.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { rateLimitIp } from "../middleware/rate-limit.js";
import { logAuditEvent } from "../services/audit.js";
import { RATE_LIMITS } from "@autohub/shared";

const complianceRouter = new Hono();

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? c.req.header("x-real-ip") ?? null;
}

// Constant-time comparison that tolerates length mismatch without leaking it.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Vanta read-only scanner key OR admin JWT.
// The static-token path is hardened: the key must be long/random, compared in
// constant time, optionally IP-allowlisted, restricted to GET (no mutations via
// a shared secret), and every access is audit-logged.
complianceRouter.use("*", async (c, next) => {
  const vantaKey = process.env.VANTA_API_KEY;
  const presented = c.req.header("Authorization");

  // Only treat the request as a Vanta attempt if a key is configured AND a
  // bearer token was presented — otherwise fall through to real admin auth.
  if (vantaKey && vantaKey.length >= 32 && presented?.startsWith("Bearer ")) {
    const token = presented.slice(7);
    if (safeEqual(token, vantaKey)) {
      const ip = clientIp(c);
      const allow = (process.env.VANTA_ALLOWED_IPS ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      if (allow.length > 0 && (!ip || !allow.includes(ip))) {
        return c.json({ error: "Forbidden" }, 403);
      }
      // Shared secret is read-only; mutations require an authenticated admin.
      if (c.req.method !== "GET") {
        return c.json({ error: "Vanta token is read-only" }, 403);
      }
      await logAuditEvent({ action: "compliance.vanta_access", metadata: { path: c.req.path }, ip });
      await next();
      return;
    }
  }

  // Standard admin auth (MFA-gated via requireAuth).
  await requireAuth(c, async () => {
    await requireAdmin(c, next);
  });
});

// GET /api/admin/compliance/audit-log?from=ISO&to=ISO&page=1&limit=50
complianceRouter.get("/audit-log", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (from && isNaN(new Date(from).getTime())) {
    return c.json({ error: "Invalid 'from' date format. Use ISO 8601." }, 400);
  }
  if (to && isNaN(new Date(to).getTime())) {
    return c.json({ error: "Invalid 'to' date format. Use ISO 8601." }, 400);
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows, meta: { page, limit } });
});

// GET /api/admin/compliance/users — user list with MFA status for Vanta CC6.2
complianceRouter.get("/users", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: userRoles.role,
      mfaEnabled: users.mfaEnabled,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastActiveAt: sql<string>`(
        SELECT MAX(created_at) FROM sessions WHERE user_id = ${users.id}
      )`.as("last_active_at"),
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(isNull(users.deletedAt));

  return c.json({ data: result });
});

// GET /api/admin/compliance/retention-runs — last N purge run audit events
complianceRouter.get("/retention-runs", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 30)));
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "system.retention_purge"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return c.json({ data: rows });
});

// GET /api/admin/compliance/active-sessions
complianceRouter.get("/active-sessions", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const rows = await db
    .select({
      userId: sessions.userId,
      activeCount: sql<number>`COUNT(*)`.as("active_count"),
    })
    .from(sessions)
    .where(isNull(sessions.revokedAt))
    .groupBy(sessions.userId);

  const total = rows.reduce((sum, r) => sum + Number(r.activeCount), 0);
  return c.json({ data: { perUser: rows, total } });
});

// GET /api/admin/compliance/dsar — paginated DSAR queue
complianceRouter.get("/dsar", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const status = c.req.query("status");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(dataSubjectRequests.status, status as any));

  const rows = await db
    .select({
      id: dataSubjectRequests.id,
      userId: dataSubjectRequests.userId,
      requestType: dataSubjectRequests.requestType,
      status: dataSubjectRequests.status,
      requestNotes: dataSubjectRequests.requestNotes,
      resolutionNotes: dataSubjectRequests.resolutionNotes,
      dueDate: dataSubjectRequests.dueDate,
      resolvedBy: dataSubjectRequests.resolvedBy,
      resolvedAt: dataSubjectRequests.resolvedAt,
      createdAt: dataSubjectRequests.createdAt,
      userEmail: users.email,
    })
    .from(dataSubjectRequests)
    .leftJoin(users, eq(users.id, dataSubjectRequests.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(dataSubjectRequests.dueDate)
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows, meta: { page, limit } });
});

// PATCH /api/admin/compliance/dsar/:id — resolve a DSAR
const DsarResolveSchema = z.object({
  status: z.enum(["in_progress", "completed", "rejected"]),
  resolutionNotes: z.string().max(2000).optional(),
}).strict();

complianceRouter.patch("/dsar/:id", rateLimitIp(RATE_LIMITS.COMPLIANCE), zValidator("json", DsarResolveSchema), async (c) => {
  const actor = c.get("user");
  const { id } = c.req.param();
  const body = c.req.valid("json");

  const [updated] = await db
    .update(dataSubjectRequests)
    .set({
      status: body.status,
      resolutionNotes: body.resolutionNotes ?? null,
      resolvedBy: actor.userId,
      resolvedAt: body.status === "completed" || body.status === "rejected" ? new Date() : null,
    })
    .where(eq(dataSubjectRequests.id, id))
    .returning();

  if (!updated) return c.json({ error: "DSAR not found" }, 404);

  await logAuditEvent({
    userId: actor.userId,
    action: "gdpr.dsar_resolved",
    resourceType: "dsar",
    resourceId: id,
    metadata: { newStatus: body.status },
    ip: c.req.header("x-forwarded-for") ?? null,
  });

  return c.json({ data: updated });
});

export { complianceRouter };
