import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";

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

// Paths a privileged user may reach BEFORE completing MFA enrollment.
// Without these exemptions the MFA requirement deadlocks: the setup
// endpoints themselves return 403 mfa_required_for_role, making it
// impossible to ever enable MFA. /account/me is read-only and required
// to render the settings page that hosts the enrollment UI.
const MFA_ENROLLMENT_PATHS = new Set([
  "/api/auth/mfa/setup",
  "/api/auth/mfa/verify-setup",
  "/api/account/me",
]);

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.NEXTAUTH_SECRET) as JwtPayload;

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

    // Force MFA enrollment for privileged roles — but always allow the
    // enrollment endpoints themselves, or enabling MFA is impossible
    if (
      (payload.role === "admin" || payload.role === "moderator") &&
      !payload.mfaEnabled &&
      !MFA_ENROLLMENT_PATHS.has(c.req.path)
    ) {
      return c.json({ error: "mfa_required_for_role" }, 403);
    }

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
