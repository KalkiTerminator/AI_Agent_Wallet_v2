import * as Sentry from "@sentry/node";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function errorHandler(err: Error, c: Context) {
  const status = ((err as { status?: number }).status ?? 500) as ContentfulStatusCode;
  console.error("[API Error]", err.message, err.stack);
  // Only report unexpected server errors to Sentry (not 4xx client errors)
  if (Number(status) >= 500) {
    Sentry.captureException(err);
  }
  return c.json({ error: err.message ?? "Internal server error" }, status);
}
