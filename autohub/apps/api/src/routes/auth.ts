import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID, createHmac } from "crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userRoles, credits, passwordResetTokens, emailVerificationTokens, sessions, mfaBackupCodes } from "../db/schema.js";
import { RegisterSchema, LoginSchema } from "@autohub/shared";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { logAuditEvent } from "../services/audit.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.js";
import { generateSecret as totpGenerateSecret, verifySync as totpVerifySync, generateURI as totpGenerateURI } from "otplib";
import { encrypt, decrypt } from "../services/crypto.js";
import { rateLimitIp } from "../middleware/rate-limit.js";

function hashVerifyToken(raw: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET!).update(raw).digest("hex");
}

const authRouter = new Hono();

authRouter.use("/login", rateLimitIp(10, 60_000));
authRouter.use("/register", rateLimitIp(10, 60_000));
authRouter.use("/reset/request", rateLimitIp(5, 60_000));
authRouter.use("/reset/confirm", rateLimitIp(10, 60_000));

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

  const jti = randomUUID();
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: "user",
      jti,
      emailVerified: false,
      mfaEnabled: false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  await db.insert(sessions).values({
    userId: user.id,
    tokenJti: jti,
    userAgent: c.req.header("user-agent") ?? null,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  }).catch(() => {}); // non-fatal

  // Send email verification
  const rawVerifyToken = randomBytes(32).toString("hex");
  const verifyTokenHash = hashVerifyToken(rawVerifyToken);
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

  if (user.mfaEnabled) {
    const mfaToken = jwt.sign(
      { userId: user.id, type: "mfa_pending" },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: "5m" }
    );
    return c.json({ mfaRequired: true, mfaToken, user: { id: user.id, email: user.email, role } });
  }

  const jti = randomUUID();
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role,
      jti,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled ?? false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  await db.insert(sessions).values({
    userId: user.id,
    tokenJti: jti,
    userAgent: c.req.header("user-agent") ?? null,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  }).catch(() => {}); // non-fatal

  return c.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName, role },
    emailVerifiedAt: user.emailVerifiedAt,
  });
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
  await revokeAllSessions(user.userId);
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

  await sendPasswordResetEmail(user.email, token);

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
  await revokeAllSessions(matched.userId);
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
  const tokenHash = hashVerifyToken(raw);
  const [matched] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt)
      )
    )
    .limit(1);

  if (matched && matched.expiresAt < now) {
    return c.json({ error: "Invalid or expired verification token" }, 400);
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
  const tokenHash = hashVerifyToken(raw);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({ tokenHash, userId: dbUser.id, expiresAt });

  await sendVerificationEmail(dbUser.email, raw).catch((err) =>
    console.error("[EMAIL] Failed to send verification:", err)
  );
  await logAuditEvent({ userId: dbUser.id, action: "auth.verification_resent", ip, requestId });

  return c.json({ data: { message: "Verification email sent" } });
});

export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

// GET /auth/sessions — list active sessions for current user
authRouter.get("/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, user.userId), isNull(sessions.revokedAt)));
  return c.json({ data: rows.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    userAgent: s.userAgent,
    ip: s.ip,
    current: s.tokenJti === user.jti,
  })) });
});

// DELETE /auth/sessions — revoke ALL sessions for current user (must be before /:id)
authRouter.delete("/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  await revokeAllSessions(user.userId);
  return c.json({ data: { revoked: true } });
});

// DELETE /auth/sessions/:id — revoke a specific session
authRouter.delete("/sessions/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.userId)))
    .limit(1);
  if (!session) return c.json({ error: "Session not found" }, 404);
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  return c.json({ data: { revoked: true } });
});

// POST /auth/mfa/setup — generate TOTP secret, store encrypted, return otpauthUrl
authRouter.post("/mfa/setup", requireAuth, async (c) => {
  const user = c.get("user");
  const [dbUser] = await db.select({ email: users.email, mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);
  if (dbUser.mfaEnabled) return c.json({ error: "MFA already enabled — disable first to re-enroll" }, 409);

  const secret = totpGenerateSecret();
  const otpauthUrl = totpGenerateURI({ issuer: "AutoHub", label: dbUser.email, secret });
  const encryptedSecret = encrypt(secret);

  await db.update(users)
    .set({ mfaSecretEncrypted: encryptedSecret, mfaEnabled: false })
    .where(eq(users.id, user.userId));

  return c.json({ data: { otpauthUrl, secret } });
});

// POST /auth/mfa/verify-setup — confirm TOTP code, enable MFA, return backup codes
authRouter.post("/mfa/verify-setup", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ code: string }>();
  if (!body.code) return c.json({ error: "code is required" }, 400);

  const [dbUser] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted })
    .from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser?.mfaSecretEncrypted) return c.json({ error: "MFA setup not started" }, 400);

  const secret = decrypt(dbUser.mfaSecretEncrypted);
  const result = totpVerifySync({ token: body.code, secret, epochTolerance: 1 });
  if (!result.valid) return c.json({ error: "Invalid TOTP code" }, 400);

  const plainCodes: string[] = [];
  const hashedCodes: Array<{ userId: string; codeHash: string }> = [];
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    plainCodes.push(code);
    hashedCodes.push({ userId: user.userId, codeHash: await bcrypt.hash(code, 10) });
  }

  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.userId));
  await db.insert(mfaBackupCodes).values(hashedCodes);
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.userId));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: user.userId, action: "auth.mfa_enabled", ip, requestId });

  return c.json({ data: { backupCodes: plainCodes } });
});

// POST /auth/mfa/disable — disable MFA (requires current TOTP or backup code)
authRouter.post("/mfa/disable", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ code: string }>();
  if (!body.code) return c.json({ error: "code is required" }, 400);

  const [dbUser] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted, mfaEnabled: users.mfaEnabled })
    .from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser?.mfaEnabled) return c.json({ error: "MFA is not enabled" }, 400);

  let verified = false;
  if (dbUser.mfaSecretEncrypted) {
    const secret = decrypt(dbUser.mfaSecretEncrypted);
    verified = totpVerifySync({ token: body.code, secret, epochTolerance: 1 }).valid;
  }

  if (!verified) {
    const backups = await db
      .select()
      .from(mfaBackupCodes)
      .where(and(eq(mfaBackupCodes.userId, user.userId), isNull(mfaBackupCodes.usedAt)));
    for (const b of backups) {
      if (await bcrypt.compare(body.code, b.codeHash)) {
        await db.update(mfaBackupCodes).set({ usedAt: new Date() }).where(eq(mfaBackupCodes.id, b.id));
        verified = true;
        break;
      }
    }
  }

  if (!verified) return c.json({ error: "Invalid code" }, 400);

  await db.update(users)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null })
    .where(eq(users.id, user.userId));
  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.userId));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: user.userId, action: "auth.mfa_disabled", ip, requestId });

  return c.json({ data: { disabled: true } });
});

// POST /auth/mfa/challenge — complete MFA step-up, receive full JWT
authRouter.post("/mfa/challenge", async (c) => {
  const body = await c.req.json<{ mfaToken: string; code: string }>();
  if (!body.mfaToken || !body.code) return c.json({ error: "mfaToken and code are required" }, 400);

  let payload: { userId: string; type: string } & Record<string, unknown>;
  try {
    payload = jwt.verify(body.mfaToken, process.env.NEXTAUTH_SECRET!) as typeof payload;
  } catch {
    return c.json({ error: "Invalid or expired MFA token" }, 400);
  }
  if (payload.type !== "mfa_pending") return c.json({ error: "Invalid token type" }, 400);

  const [dbUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.userId as string), isNull(users.deletedAt)))
    .limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  let verified = false;
  if (dbUser.mfaSecretEncrypted) {
    const secret = decrypt(dbUser.mfaSecretEncrypted);
    verified = totpVerifySync({ token: body.code, secret, epochTolerance: 1 }).valid;
  }
  if (!verified) {
    const backups = await db
      .select()
      .from(mfaBackupCodes)
      .where(and(eq(mfaBackupCodes.userId, dbUser.id), isNull(mfaBackupCodes.usedAt)));
    for (const b of backups) {
      if (await bcrypt.compare(body.code, b.codeHash)) {
        await db.update(mfaBackupCodes).set({ usedAt: new Date() }).where(eq(mfaBackupCodes.id, b.id));
        verified = true;
        break;
      }
    }
  }
  if (!verified) return c.json({ error: "Invalid MFA code" }, 400);

  const [roleRow] = await db.select().from(userRoles).where(eq(userRoles.userId, dbUser.id)).limit(1);
  const role = roleRow?.role ?? "user";
  const jti = randomUUID();

  const token = jwt.sign(
    { userId: dbUser.id, email: dbUser.email, role, jti, emailVerified: !!dbUser.emailVerifiedAt, mfaEnabled: true },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  await db.insert(sessions).values({
    userId: dbUser.id, tokenJti: jti,
    userAgent: c.req.header("user-agent") ?? null, ip,
  }).catch(() => {});

  await logAuditEvent({ userId: dbUser.id, action: "auth.mfa_challenge_success", ip });

  return c.json({ token, user: { id: dbUser.id, email: dbUser.email, fullName: dbUser.fullName, role } });
});

export { authRouter };
