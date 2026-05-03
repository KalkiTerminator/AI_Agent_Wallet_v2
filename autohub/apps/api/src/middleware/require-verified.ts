import { createMiddleware } from "hono/factory";

export const requireVerified = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user.emailVerified) {
    return c.json({ error: "email_not_verified" }, 403);
  }
  await next();
});
