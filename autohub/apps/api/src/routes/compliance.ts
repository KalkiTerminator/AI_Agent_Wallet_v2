import { Hono } from "hono";
import { eq, and, gte, lte, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs, users, userRoles, sessions, dataSubjectRequests,
} from "../db/schema.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { rateLimitIp } from "../middleware/rate-limit.js";
import { logAuditEvent } from "../services/audit.js";
import { RATE_LIMITS } from "@autohub/shared";

const complianceRouter = new Hono();

// Vanta alternative auth OR admin JWT
complianceRouter.use("*", async (c, next) => {
  const vantaKey = process.env.VANTA_API_KEY;
  if (vantaKey) {
    const auth = c.req.header("Authorization");
    if (auth === `Bearer ${vantaKey}`) {
      await next();
      return;
    }
  }
  // Fall through to standard admin auth
  await requireAuth(c, async () => {
    await requireAdmin(c, next);
  });
});

// GET /api/admin/compliance/audit-log?from=ISO&to=ISO&page=1&limit=50
complianceRouter.get("/audit-log", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
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
complianceRouter.patch("/dsar/:id", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const actor = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ status: string; resolutionNotes?: string }>();

  const validStatuses = ["in_progress", "completed", "rejected"];
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const [updated] = await db
    .update(dataSubjectRequests)
    .set({
      status: body.status as any,
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
