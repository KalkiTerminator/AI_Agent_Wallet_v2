import { createMiddleware } from "hono/factory";
import { createHmac } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys, users, userRoles } from "../db/schema.js";
import { env } from "../env.js";
import { requireAuth } from "./auth.js";

export const API_KEY_PREFIX = "ah_";

/** Hash an API key for storage/lookup. HMAC-SHA256 with the app secret as pepper. */
export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET).update(rawKey).digest("hex");
}

/**
 * Accepts EITHER an X-API-Key header (programmatic) OR a Bearer JWT (interactive).
 * When an API key is present it is validated and the user context is populated
 * just like requireAuth, so downstream middleware (requireVerified, rate limits)
 * and handlers work unchanged. Otherwise it delegates to requireAuth.
 *
 * API keys are scoped to execution endpoints only; they are never accepted by
 * admin/account routes (those keep plain requireAuth).
 */
export const requireAuthOrApiKey = createMiddleware(async (c, next) => {
  const rawKey = c.req.header("X-API-Key");
  if (!rawKey) {
    return requireAuth(c, next);
  }

  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(rawKey)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return c.json({ error: "Invalid or revoked API key" }, 401);

  const [u] = await db
    .select({
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      mfaEnabled: users.mfaEnabled,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!u || !u.isActive || u.deletedAt) {
    return c.json({ error: "Account unavailable" }, 403);
  }

  const [roleRow] = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.userId)).limit(1);

  c.set("user", {
    userId: row.userId,
    email: u.email,
    role: roleRow?.role ?? "user",
    jti: `apikey:${row.id}`,
    emailVerified: !!u.emailVerifiedAt,
    mfaEnabled: u.mfaEnabled,
  });

  // Best-effort last-used stamp (non-blocking).
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});

  await next();
});
