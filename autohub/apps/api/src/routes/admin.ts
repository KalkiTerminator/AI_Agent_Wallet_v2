import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, userRoles, toolUsages, aiTools, payments, appConfig } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import { eq, sql, desc, isNull } from "drizzle-orm";
import { logAuditEvent } from "../services/audit.js";

const DEFAULT_ROLES = ["admin", "moderator", "user"];
const ROLES_CONFIG_KEY = "custom_roles";

async function getRoles(): Promise<string[]> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, ROLES_CONFIG_KEY));
  if (!row) return DEFAULT_ROLES;
  return row.value as string[];
}

const adminRouter = new Hono();

adminRouter.use("*", requireAuth, requireAdmin);

adminRouter.get("/users", rateLimit(RATE_LIMITS.READS), async (c) => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      createdAt: users.createdAt,
      isActive: users.isActive,
      role: userRoles.role,
      isOwner: userRoles.isOwner,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(isNull(users.deletedAt));

  return c.json({ data: result });
});

adminRouter.get("/analytics", rateLimit(RATE_LIMITS.READS), async (c) => {
  const [usageCount] = await db.select({ count: sql<number>`count(*)` }).from(toolUsages);
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [revenue] = await db.select({ total: sql<number>`sum(amount)` }).from(payments).where(eq(payments.status, "completed"));

  return c.json({
    data: {
      totalUsages: usageCount.count,
      totalUsers: userCount.count,
      totalRevenueCents: revenue.total ?? 0,
    },
  });
});

adminRouter.get("/tools", rateLimit(RATE_LIMITS.READS), async (c) => {
  const result = await db
    .select({
      id: aiTools.id,
      name: aiTools.name,
      description: aiTools.description,
      category: aiTools.category,
      creditCost: aiTools.creditCost,
      approvalStatus: aiTools.approvalStatus,
      isActive: aiTools.isActive,
      createdByUserId: aiTools.createdByUserId,
      createdAt: aiTools.createdAt,
    })
    .from(aiTools)
    .where(isNull(aiTools.deletedAt))
    .orderBy(desc(aiTools.createdAt));

  return c.json({ data: result });
});

adminRouter.patch("/tools/:id", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
  const actor = c.get("user");
  const body = await c.req.json<{
    approvalStatus?: "pending" | "approved" | "rejected";
    isActive?: boolean;
  }>();

  const updates: Partial<typeof aiTools.$inferInsert> = {};
  if (body.approvalStatus !== undefined) updates.approvalStatus = body.approvalStatus;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const [updated] = await db
    .update(aiTools)
    .set(updates)
    .where(eq(aiTools.id, id))
    .returning();

  if (!updated) return c.json({ error: "Tool not found" }, 404);

  if (body.approvalStatus) {
    const action = body.approvalStatus === "approved" ? "admin.tool.approved" : "admin.tool.rejected";
    await logAuditEvent({
      userId: actor.userId,
      action,
      resourceType: "tool",
      resourceId: id,
      metadata: { approvalStatus: body.approvalStatus },
      ip: c.req.header("x-forwarded-for") ?? null,
      requestId: (c.get as any)("requestId"),
    });
  }

  return c.json({ data: updated });
});

// GET /api/admin/roles — list available roles
adminRouter.get("/roles", rateLimit(RATE_LIMITS.READS), async (c) => {
  const roles = await getRoles();
  return c.json({ data: roles });
});

// POST /api/admin/roles — add a new role
adminRouter.post("/roles", rateLimit(RATE_LIMITS.READS), async (c) => {
  const body = await c.req.json<{ role: string }>();
  const name = body.role?.trim().toLowerCase();
  if (!name || !/^[a-z0-9_-]+$/.test(name)) {
    return c.json({ error: "Role must be lowercase alphanumeric (underscores/hyphens allowed)" }, 400);
  }
  const roles = await getRoles();
  if (roles.includes(name)) return c.json({ error: "Role already exists" }, 409);
  const updated = [...roles, name];
  await db.insert(appConfig).values({ key: ROLES_CONFIG_KEY, value: updated })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: updated, updatedAt: new Date() } });
  return c.json({ data: updated });
});

// DELETE /api/admin/roles/:role — remove a custom role
adminRouter.delete("/roles/:role", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { role } = c.req.param();
  if (["admin", "moderator", "user"].includes(role)) {
    return c.json({ error: "Cannot remove built-in roles" }, 400);
  }
  const roles = await getRoles();
  if (!roles.includes(role)) return c.json({ error: "Role not found" }, 404);
  const updated = roles.filter((r) => r !== role);
  await db.insert(appConfig).values({ key: ROLES_CONFIG_KEY, value: updated })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: updated, updatedAt: new Date() } });
  return c.json({ data: updated });
});

// PATCH /api/admin/users/:id/role — change user role
adminRouter.patch("/users/:id/role", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
  const actor = c.get("user");
  const body = await c.req.json<{ role: string }>();
  const roles = await getRoles();
  if (!roles.includes(body.role)) {
    return c.json({ error: "Invalid role" }, 400);
  }
  const [updated] = await db
    .update(userRoles)
    .set({ role: body.role as "admin" | "moderator" | "user" })
    .where(eq(userRoles.userId, id))
    .returning();
  if (!updated) return c.json({ error: "User not found" }, 404);
  await logAuditEvent({
    userId: actor.userId,
    action: "admin.user.role_changed",
    resourceType: "user",
    resourceId: id,
    metadata: { newRole: body.role },
    ip: c.req.header("x-forwarded-for") ?? null,
    requestId: (c.get as any)("requestId"),
  });
  return c.json({ data: updated });
});

// DELETE /api/admin/users/:id — soft-deactivate user
adminRouter.delete("/users/:id", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
  const actor = c.get("user");
  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(eq(users.id, id))
    .returning({ id: users.id, isActive: users.isActive });
  if (!updated) return c.json({ error: "User not found" }, 404);
  await logAuditEvent({
    userId: actor.userId,
    action: "admin.user.deactivated",
    resourceType: "user",
    resourceId: id,
    ip: c.req.header("x-forwarded-for") ?? null,
    requestId: (c.get as any)("requestId"),
  });
  return c.json({ data: updated });
});

export { adminRouter };
