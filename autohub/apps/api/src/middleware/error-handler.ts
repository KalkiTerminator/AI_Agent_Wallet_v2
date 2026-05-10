import * as Sentry from "@sentry/node";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "../lib/logger.js";

export function errorHandler(err: Error, c: Context) {
  const status = ((err as { status?: number }).status ?? 500) as ContentfulStatusCode;
  if (Number(status) >= 500) {
    logger.error({ err, requestId: (c.get as any)("requestId") }, "unhandled");
    Sentry.captureException(err);
  }
  return c.json({ error: err.message ?? "Internal server error" }, status);
}
