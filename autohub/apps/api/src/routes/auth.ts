import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userRoles, credits, passwordResetTokens } from "../db/schema.js";
import { RegisterSchema, LoginSchema } from "@autohub/shared";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";

const authRouter = new Hono();

authRouter.post("/register", zValidator("json", RegisterSchema), async (c) => {
  const { email, password, fullName } = c.req.valid("json");

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, fullName }).returning();

  await db.insert(userRoles).values({ userId: user.id, role: "user" });
  await db.insert(credits).values({ userId: user.id, currentCredits: 10 }); // 10 free credits

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: "user" },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "7d" }
  );

  return c.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } }, 201);
});

authRouter.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const [roleRow] = await db.select().from(userRoles).where(eq(userRoles.userId, user.id)).limit(1);
  const role = roleRow?.role ?? "user";

  const token = jwt.sign(
    { userId: user.id, email: user.email, role },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "7d" }
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
  if (body.newPassword.length < 8) return c.json({ error: "New password must be at least 8 characters" }, 400);
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

  // Always return success to prevent email enumeration
  if (!user) return c.json({ data: { message: "If that email exists, a reset link has been sent." } });

  // Invalidate any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const token = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL

  await db.insert(passwordResetTokens).values({ tokenHash, userId: user.id, expiresAt });

  const resetUrl = `${process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000"}/auth/reset-password/${token}`;
  console.log(`[PASSWORD RESET] ${user.email} → ${resetUrl}`);

  return c.json({ data: { message: "If that email exists, a reset link has been sent." } });
});

// POST /auth/reset/confirm — set new password using token
authRouter.post("/reset/confirm", async (c) => {
  const body = await c.req.json<{ token: string; newPassword: string }>();
  if (!body.token || !body.newPassword) return c.json({ error: "token and newPassword are required" }, 400);
  if (body.newPassword.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

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

  const newHash = await bcrypt.hash(body.newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, matched.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, matched.tokenHash));

  return c.json({ data: { message: "Password reset successfully." } });
});

export { authRouter };
