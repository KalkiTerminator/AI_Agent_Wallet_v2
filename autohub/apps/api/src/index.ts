import "./instrument.js"; // Sentry must be imported before everything else
import "dotenv/config";
import { env } from "./env.js"; // validates all required env vars at startup
import * as Sentry from "@sentry/node";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { logger } from "./lib/logger.js";
import { randomUUID } from "crypto";
import { toolsRouter } from "./routes/tools.js";
import { paymentsRouter } from "./routes/payments.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { adminRouter } from "./routes/admin.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { creditsRouter } from "./routes/credits.js";
import { executionsRouter } from "./routes/executions.js";
import { accountRouter } from "./routes/account.js";
import { complianceRouter } from "./routes/compliance.js";
import { errorHandler } from "./middleware/error-handler.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { db } from "./db/index.js";
import { users, userRoles } from "./db/schema.js";
import { eq, sql } from "drizzle-orm";
import { getRedis } from "./middleware/rate-limit.js";

const app = new Hono();

const allowedOrigins = (env.AUTOHUB_CORS_ORIGINS ?? env.AUTOHUB_WEB_URL).split(",");

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  logger[level]({ method: c.req.method, url: c.req.path, status, durationMs: ms, requestId: (c.get as any)("requestId") }, "http");
});

// Body limits after logger so 413 rejections still produce access log entries.
// Auth routes capped at 5 KB — prevents large-payload DoS amplification through bcrypt.
// Default 100 KB for all other routes.
app.use("/api/auth/*", bodyLimit({ maxSize: 5 * 1024 }));
app.use("*", bodyLimit({ maxSize: 100 * 1024 }));
app.use("*", securityHeaders());

// Inject requestId into every request context for audit trail correlation
app.use("*", async (c, next) => {
  c.set("requestId" as any, randomUUID());
  await next();
});

app.onError(errorHandler);

app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    let redis: "ok" | "down" = "ok";
    try {
      const redisClient = getRedis();
      if (redisClient) await redisClient.ping();
      else redis = "down";
    } catch {
      redis = "down";
    }
    return c.json({ status: "ok", db: "ok", redis }, 200);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "healthcheck" } });
    return c.json({ status: "error", db: "down" }, 503);
  }
});

// Promote a user to admin by email.
// DISABLED in production — use scripts/promote-admin.ts (direct DB access) instead.
if (env.NODE_ENV !== "production") {
  app.post("/seed/promote-admin", async (c) => {
    const secret = env.SEED_SECRET;
    if (!secret) return c.json({ error: "SEED_SECRET not configured" }, 403);
    // Require both env secret AND a matching X-Seed-Token header
    const headerToken = c.req.header("X-Seed-Token");
    if (!headerToken || headerToken !== secret) return c.json({ error: "Forbidden" }, 403);
    const body = await c.req.json<{ email: string }>();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
    if (!user) return c.json({ error: "User not found" }, 404);
    const [updated] = await db
      .update(userRoles)
      .set({ role: "admin", isOwner: true })
      .where(eq(userRoles.userId, user.id))
      .returning();
    if (!updated) return c.json({ error: "User role row not found" }, 404);
    return c.json({ ok: true, userId: user.id, role: updated.role });
  });
}

app.route("/api/auth", authRouter);
app.route("/api/tools", toolsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/subscriptions", subscriptionsRouter);
app.route("/api/admin", adminRouter);
app.route("/api/webhooks", webhooksRouter);
app.route("/api/credits", creditsRouter);
app.route("/api/executions", executionsRouter);
app.route("/api/account", accountRouter);
app.route("/api/admin/compliance", complianceRouter);

const port = Number(env.PORT ?? 4000);
logger.info({ port }, "AutoHub API running");
serve({ fetch: app.fetch, port });

// Flush Sentry on graceful shutdown
process.on("SIGTERM", async () => {
  await Sentry.close(2000);
  process.exit(0);
});
