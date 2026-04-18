import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, userRoles, toolUsages, aiTools, payments } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import { eq, sql, desc } from "drizzle-orm";

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
    .leftJoin(userRoles, eq(userRoles.userId, users.id));

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
    .orderBy(desc(aiTools.createdAt));

  return c.json({ data: result });
});

adminRouter.patch("/tools/:id", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
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
  return c.json({ data: updated });
});

// PATCH /api/admin/users/:id/role — change user role
adminRouter.patch("/users/:id/role", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ role: "user" | "moderator" | "admin" }>();
  if (!["user", "moderator", "admin"].includes(body.role)) {
    return c.json({ error: "Invalid role" }, 400);
  }
  const [updated] = await db
    .update(userRoles)
    .set({ role: body.role })
    .where(eq(userRoles.userId, id))
    .returning();
  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ data: updated });
});

// DELETE /api/admin/users/:id — soft-deactivate user
adminRouter.delete("/users/:id", rateLimit(RATE_LIMITS.READS), async (c) => {
  const { id } = c.req.param();
  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(eq(users.id, id))
    .returning({ id: users.id, isActive: users.isActive });
  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ data: updated });
});

export { adminRouter };
