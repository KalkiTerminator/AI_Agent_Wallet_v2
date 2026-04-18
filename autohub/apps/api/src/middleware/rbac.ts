import { createMiddleware } from "hono/factory";

const ROLE_HIERARCHY: Record<string, number> = { user: 0, moderator: 1, admin: 2 };

export function requireRole(minRole: "moderator" | "admin") {
  return createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const required = ROLE_HIERARCHY[minRole];
    if (userLevel < required) return c.json({ error: "Forbidden" }, 403);
    await next();
  });
}
