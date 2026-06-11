import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export const requireVerified = createMiddleware(async (c, next) => {
  const user = c.get("user");

  if (!user.emailVerified) {
    // The JWT claim is minted at login and goes stale: a user who verifies
    // mid-session would stay blocked until re-login. Fall back to the live
    // flag so clicking the verification link takes effect immediately.
    const [row] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);
    if (!row?.emailVerifiedAt) {
      return c.json({ error: "email_not_verified" }, 403);
    }
  }

  await next();
});
