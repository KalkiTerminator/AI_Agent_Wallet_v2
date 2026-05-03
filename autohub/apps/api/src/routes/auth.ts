import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userRoles, credits, passwordResetTokens, emailVerificationTokens } from "../db/schema.js";
import { RegisterSchema, LoginSchema } from "@autohub/shared";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { logAuditEvent } from "../services/audit.js";
import { sendVerificationEmail } from "../services/email.js";

const authRouter = new Hono();

authRouter.post("/register", zValidator("json", RegisterSchema), async (c) => {
  const { email, password, fullName } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, fullName }).returning();

  await db.insert(userRoles).values({ userId: user.id, role: "user" });
  await db.insert(credits).values({ userId: user.id, currentCredits: 10 }); // 10 free credits

  await logAuditEvent({ userId: user.id, action: "auth.signup", ip, requestId });

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: "user",
      jti: randomUUID(),
      emailVerified: false,
      mfaEnabled: false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  // Send email verification
  const rawVerifyToken = randomBytes(32).toString("hex");
  const verifyTokenHash = await bcrypt.hash(rawVerifyToken, 10);
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({
    tokenHash: verifyTokenHash,
    userId: user.id,
    expiresAt: verifyExpiresAt,
  });
  await sendVerificationEmail(user.email, rawVerifyToken).catch((err) =>
    console.error("[EMAIL] Failed to send verification:", err)
  );

  return c.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    requiresVerification: true,
  }, 201);
});

authRouter.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    await logAuditEvent({ action: "auth.login.failure", metadata: { reason: "user_not_found" }, ip, requestId });
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logAuditEvent({ userId: user.id, action: "auth.login.failure", metadata: { reason: "wrong_password" }, ip, requestId });
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const [roleRow] = await db.select().from(userRoles).where(eq(userRoles.userId, user.id)).limit(1);
  const role = roleRow?.role ?? "user";

  await logAuditEvent({ userId: user.id, action: "auth.login.success", ip, requestId });

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role,
      jti: randomUUID(),
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled ?? false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role } });
});

// PATCH /auth/profile — update fullName
authRouter.patch("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ fullName?: string }>();
  if (!body.fullName?.trim()) return c.json({ error: "fullName is required" }, 400);
  const [updated] = await db
    .update(users)
    .set({ fullName: body.fullName.trim() })
    .where(eq(users.id, user.userId))
    .returning();
  return c.json({ data: { id: updated.id, email: updated.email, fullName: updated.fullName } });
});

// PATCH /auth/password — change password
authRouter.patch("/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!body.currentPassword || !body.newPassword) return c.json({ error: "Both passwords are required" }, 400);
  if (body.newPassword.length < 12) return c.json({ error: "New password must be at least 12 characters" }, 400);
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  const valid = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
  if (!valid) return c.json({ error: "Current password is incorrect" }, 401);
  const newHash = await bcrypt.hash(body.newPassword, 12);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.userId));
  return c.json({ data: { success: true } });
});

// POST /auth/reset/request — request password reset email
authRouter.post("/reset/request", async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email?.trim()) return c.json({ error: "email is required" }, 400);

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()))
    .limit(1);

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  // Always return success to prevent email enumeration
  if (!user) return c.json({ data: { message: "If that email exists, a reset link has been sent." } });

  // Invalidate any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const token = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL

  await db.insert(passwordResetTokens).values({ tokenHash, userId: user.id, expiresAt });

  await logAuditEvent({ userId: user.id, action: "auth.password_reset.requested", ip, requestId });

  const resetUrl = `${process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000"}/auth/reset-password/${token}`;
  // Do NOT log the reset URL — it contains the raw token. Send via email only.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV PASSWORD RESET] ${resetUrl}`);
  }

  return c.json({ data: { message: "If that email exists, a reset link has been sent." } });
});

// POST /auth/reset/confirm — set new password using token
authRouter.post("/reset/confirm", async (c) => {
  const body = await c.req.json<{ token: string; newPassword: string }>();
  if (!body.token || !body.newPassword) return c.json({ error: "token and newPassword are required" }, 400);
  if (body.newPassword.length < 12) return c.json({ error: "Password must be at least 12 characters" }, 400);

  const now = new Date();

  // Load all unexpired, unused tokens and find the matching one
  const candidates = await db
    .select()
    .from(passwordResetTokens)
    .where(isNull(passwordResetTokens.usedAt));

  let matched: typeof candidates[0] | null = null;
  for (const row of candidates) {
    if (row.expiresAt < now) continue;
    const ok = await bcrypt.compare(body.token, row.tokenHash);
    if (ok) { matched = row; break; }
  }

  if (!matched) return c.json({ error: "Invalid or expired reset token" }, 400);

  const ip2 = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId2 = (c.get as any)("requestId");

  const newHash = await bcrypt.hash(body.newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, matched.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, matched.tokenHash));

  await logAuditEvent({ userId: matched.userId, action: "auth.password_reset.completed", ip: ip2, requestId: requestId2 });

  return c.json({ data: { message: "Password reset successfully." } });
});

// GET /auth/verify-email?token=<raw> — verify email address
authRouter.get("/verify-email", async (c) => {
  const raw = c.req.query("token");
  if (!raw) return c.json({ error: "Missing token" }, 400);

  const now = new Date();
  const candidates = await db
    .select()
    .from(emailVerificationTokens)
    .where(isNull(emailVerificationTokens.usedAt));

  let matched: typeof candidates[0] | null = null;
  for (const row of candidates) {
    if (row.expiresAt < now) continue;
    const ok = await bcrypt.compare(raw, row.tokenHash);
    if (ok) { matched = row; break; }
  }

  if (!matched) return c.json({ error: "Invalid or expired verification token" }, 400);

  await db
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, matched.userId));
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.tokenHash, matched.tokenHash));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: matched.userId, action: "auth.email_verified", ip, requestId });

  return c.redirect(`${process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000"}/dashboard?verified=true`);
});

// POST /auth/resend-verification — resend verification email (auth required)
authRouter.post("/resend-verification", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const [dbUser] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  if (!dbUser) return c.json({ error: "User not found" }, 404);
  if (dbUser.emailVerifiedAt) return c.json({ data: { message: "Email already verified" } });

  // Delete all existing tokens for this user before creating new one
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, dbUser.id));

  const raw = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(raw, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({ tokenHash, userId: dbUser.id, expiresAt });

  await sendVerificationEmail(dbUser.email, raw).catch((err) =>
    console.error("[EMAIL] Failed to send verification:", err)
  );
  await logAuditEvent({ userId: dbUser.id, action: "auth.verification_resent", ip, requestId });

  return c.json({ data: { message: "Verification email sent" } });
});

export { authRouter };
