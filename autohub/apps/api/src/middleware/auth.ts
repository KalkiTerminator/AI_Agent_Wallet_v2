import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq, isNotNull } from "drizzle-orm";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  jti: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;

    // Check session revocation (jti revocation check)
    if (payload.jti) {
      const [session] = await db
        .select({ revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.tokenJti, payload.jti))
        .limit(1);
      if (session?.revokedAt != null) {
        return c.json({ error: "Session revoked" }, 401);
      }
    }

    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
