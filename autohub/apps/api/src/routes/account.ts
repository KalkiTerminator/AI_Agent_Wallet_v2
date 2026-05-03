import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users, aiTools, executions, toolUsages, payments, sessions,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { logAuditEvent } from "../services/audit.js";
import { revokeAllSessions } from "./auth.js";

const accountRouter = new Hono();

// GET /api/account/export — GDPR data export (Art. 20)
accountRouter.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const [dbUser] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.id, user.userId), isNull(users.deletedAt)))
    .limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const usages = await db
    .select({ id: toolUsages.id, toolId: toolUsages.toolId, creditsUsed: toolUsages.creditsUsed, status: toolUsages.status, createdAt: toolUsages.createdAt })
    .from(toolUsages)
    .where(and(eq(toolUsages.userId, user.userId), isNull(toolUsages.deletedAt)));

  const userPayments = await db
    .select({ id: payments.id, amount: payments.amount, status: payments.status, creditsGranted: payments.creditsGranted, createdAt: payments.createdAt })
    .from(payments)
    .where(eq(payments.userId, user.userId));

  const userExecutions = await db
    .select({ id: executions.id, toolId: executions.toolId, status: executions.status, creditsDebited: executions.creditsDebited, startedAt: executions.startedAt })
    .from(executions)
    .where(and(eq(executions.userId, user.userId), isNull(executions.deletedAt)));

  await logAuditEvent({ userId: user.userId, action: "gdpr.data_exported", ip, requestId });

  return c.json({
    exportedAt: new Date().toISOString(),
    user: dbUser,
    toolUsages: usages,
    payments: userPayments,
    executions: userExecutions,
  });
});

// DELETE /api/account — soft-delete account (GDPR Art. 17)
accountRouter.delete("/", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const now = new Date();

  await db.update(users).set({
    deletedAt: now,
    email: `deleted_${user.userId}@deleted`,
    fullName: null,
    passwordHash: "",
    updatedAt: now,
  }).where(eq(users.id, user.userId));

  await db.update(aiTools).set({ deletedAt: now }).where(eq(aiTools.createdByUserId, user.userId));
  await db.update(executions).set({ deletedAt: now }).where(eq(executions.userId, user.userId));
  await db.update(toolUsages).set({ deletedAt: now }).where(eq(toolUsages.userId, user.userId));

  await revokeAllSessions(user.userId);

  await logAuditEvent({ userId: user.userId, action: "account.deleted", ip, requestId });

  return c.json({ data: { deleted: true } });
});

// POST /api/account/erasure-request — formal GDPR Art. 17 request
accountRouter.post("/erasure-request", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({
    userId: user.userId,
    action: "gdpr.erasure_requested",
    ip,
    requestId,
    metadata: { note: "Formal Art. 17 request — requires manual admin review within 30 days" },
  });
  return c.json({ data: { message: "Erasure request received. We will process it within 30 days." } });
});

export { accountRouter };
