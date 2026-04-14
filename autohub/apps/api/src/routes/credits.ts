import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { credits } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";

const creditsRouter = new Hono();

creditsRouter.get("/", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const [row] = await db.select().from(credits).where(eq(credits.userId, user.userId)).limit(1);
  if (!row) return c.json({ error: "Credits not found" }, 404);
  return c.json({ data: { currentCredits: row.currentCredits, userId: row.userId } });
});

export { creditsRouter };
