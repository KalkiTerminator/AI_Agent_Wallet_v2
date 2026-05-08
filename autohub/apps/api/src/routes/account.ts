import { Hono } from "hono";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users, aiTools, executions, toolUsages, payments, consentLogs, dataSubjectRequests, userRoles, credits,
} from "../db/schema.js";
import { ConsentSchema, DsarSchema, CURRENT_POLICY_VERSION, RATE_LIMITS } from "@autohub/shared";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitIp } from "../middleware/rate-limit.js";
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

  const [existing] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);
  if (!existing || existing.deletedAt !== null) {
    return c.json({ error: "Account not found or already deleted" }, 404);
  }

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

// POST /api/account/consent — log a consent event (GDPR Art. 7)
accountRouter.post("/consent", requireAuth, rateLimitIp(RATE_LIMITS.COMPLIANCE), zValidator("json", ConsentSchema), async (c) => {
  const user = c.get("user");
  const { consentType, granted } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const ua = c.req.header("user-agent") ?? null;

  await db.insert(consentLogs).values({
    userId: user.userId,
    consentType,
    consentVersion: CURRENT_POLICY_VERSION,
    granted,
    ipAddress: ip,
    userAgent: ua,
  });

  await logAuditEvent({ userId: user.userId, action: `gdpr.consent.${consentType}.${granted ? "granted" : "withdrawn"}`, ip });

  return c.json({ data: { recorded: true } });
});

// GET /api/account/consent — return user's consent history
accountRouter.get("/consent", requireAuth, rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const rows = await db
    .select()
    .from(consentLogs)
    .where(eq(consentLogs.userId, user.userId))
    .orderBy(desc(consentLogs.createdAt));

  await logAuditEvent({ userId: user.userId, action: "gdpr.consent_viewed", ip });

  return c.json({ data: rows });
});

// POST /api/account/dsar — submit a Data Subject Access Request (GDPR Art. 15/17/20/16)
accountRouter.post("/dsar", requireAuth, rateLimitIp(RATE_LIMITS.COMPLIANCE), zValidator("json", DsarSchema), async (c) => {
  const user = c.get("user");
  const { requestType, requestNotes } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;

  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const [dsar] = await db.insert(dataSubjectRequests).values({
    userId: user.userId,
    requestType,
    requestNotes: requestNotes ?? null,
    dueDate,
  }).returning();

  await logAuditEvent({
    userId: user.userId,
    action: "gdpr.dsar_submitted",
    resourceType: "dsar",
    resourceId: dsar.id,
    metadata: { requestType },
    ip,
  });

  return c.json({ data: { id: dsar.id, dueDate: dueDate.toISOString(), message: "Request received. We will respond within 30 days." } }, 201);
});

// 308 redirect: old erasure-request route → new dsar route (preserves POST method)
accountRouter.post("/erasure-request", async (c) => {
  c.header("Location", "/api/account/dsar");
  return c.body(null, 308);
});

// GET /api/account/me — full user profile
accountRouter.get("/me", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");

  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: userRoles.role,
      currentCredits: credits.currentCredits,
      onboardedAt: users.onboardedAt,
      emailVerifiedAt: users.emailVerifiedAt,
      mfaEnabled: users.mfaEnabled,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(credits, eq(credits.userId, users.id))
    .where(and(eq(users.id, user.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!profile) return c.json({ error: "User not found" }, 404);

  return c.json({
    data: {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName ?? null,
      role: profile.role ?? "user",
      currentCredits: profile.currentCredits ?? 0,
      onboardedAt: profile.onboardedAt?.toISOString() ?? null,
      emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
      mfaEnabled: profile.mfaEnabled,
    },
  });
});

// POST /api/account/onboarding/complete — mark user as onboarded (idempotent)
accountRouter.post("/onboarding/complete", requireAuth, rateLimitIp(5), async (c) => {
  const user = c.get("user");

  const [updated] = await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(and(eq(users.id, user.userId), isNull(users.onboardedAt)))
    .returning({ onboardedAt: users.onboardedAt });

  // If already set, fetch existing value
  if (!updated) {
    const [existing] = await db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);
    return c.json({ data: { onboardedAt: existing?.onboardedAt?.toISOString() ?? null } });
  }

  return c.json({ data: { onboardedAt: updated.onboardedAt?.toISOString() ?? null } });
});

export { accountRouter };
