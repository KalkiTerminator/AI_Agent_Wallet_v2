import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { subscriptions } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";

const subscriptionsRouter = new Hono();

subscriptionsRouter.get("/status", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);

  if (!sub || sub.status !== "active") {
    return c.json({ data: { subscribed: false } });
  }

  return c.json({
    data: {
      subscribed: true,
      status: sub.status,
      subscriptionEnd: sub.currentPeriodEnd?.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    },
  });
});

export { subscriptionsRouter };
