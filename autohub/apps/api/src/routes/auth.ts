import { Hono } from "hono";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userRoles, credits } from "../db/schema.js";
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

export { authRouter };
