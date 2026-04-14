import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { toolsRouter } from "./routes/tools.js";
import { paymentsRouter } from "./routes/payments.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { adminRouter } from "./routes/admin.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { authRouter } from "./routes/auth.js";
import { creditsRouter } from "./routes/credits.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = new Hono();

const allowedOrigins = (process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000").split(",");

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use("*", logger());
app.onError(errorHandler);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.route("/api/auth", authRouter);
app.route("/api/tools", toolsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/subscriptions", subscriptionsRouter);
app.route("/api/admin", adminRouter);
app.route("/api/webhooks", webhooksRouter);
app.route("/api/credits", creditsRouter);

const port = Number(process.env.PORT ?? 4000);
console.log(`AutoHub API running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
