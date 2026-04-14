import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function errorHandler(err: Error, c: Context) {
  console.error("[API Error]", err.message, err.stack);
  const status = ((err as { status?: number }).status ?? 500) as ContentfulStatusCode;
  return c.json({ error: err.message ?? "Internal server error" }, status);
}
