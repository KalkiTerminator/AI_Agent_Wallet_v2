import Redis from "ioredis";
import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";
import * as Sentry from "@sentry/node";

let redis: Redis | null = null;
let warnedAboutMissingRedis = false;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL ?? process.env.REDIS_PRIVATE_URL;
  if (!url) {
    if (!warnedAboutMissingRedis) {
      logger.warn("REDIS_URL not configured — rate limiting disabled");
      warnedAboutMissingRedis = true;
    }
    return null;
  }
  if (!redis) {
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on("error", (err) => logger.warn({ err }, "Redis connection error"));
  }
  return redis;
}

// Sliding window via Lua — atomic, no race conditions
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local expires = now + window

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1, 1000000))
  redis.call('PEXPIREAT', key, expires)
  return {1, limit, limit - count - 1, expires}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = oldest[2] and (tonumber(oldest[2]) + window) or expires
  return {0, limit, 0, resetAt}
end
`.trim();

export type CheckLimitResult =
  | { success: boolean; limit: number; remaining: number; reset: number; redisDown?: false }
  | { redisDown: true };

export async function checkLimit(
  prefix: string,
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<CheckLimitResult | null> {
  const r = getRedis();
  if (!r) return null; // Redis not configured — caller treats as no-op

  const key = `autohub:rl:${prefix}:${maxRequests}:${windowMs}:${identifier}`;
  const now = Date.now();

  try {
    const result = await r.eval(SLIDING_WINDOW_SCRIPT, 1, key, now, windowMs, maxRequests) as number[];
    return {
      success: result[0] === 1,
      limit: result[1],
      remaining: result[2],
      reset: result[3],
    };
  } catch (err) {
    logger.warn({ err }, "Rate limit check failed");
    return { redisDown: true };
  }
}

function applyRateLimitHeaders(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], result: CheckLimitResult) {
  if (!result.redisDown) {
    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(result.reset));
  }
}

export function rateLimitIp(maxRequests: number, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
      ?? c.req.header("x-real-ip")
      ?? "unknown";

    const result = await checkLimit("ip", ip, maxRequests, windowMs);
    if (result) {
      if (result.redisDown) {
        Sentry.captureMessage("rate-limit-redis-down", "warning");
      } else {
        applyRateLimitHeaders(c, result);
        if (!result.success) return c.json({ error: "Too many requests" }, 429);
      }
    }
    await next();
  });
}

// Fail-closed: returns 503 if Redis is down. Use on auth + payment endpoints.
export function rateLimitIpStrict(maxRequests: number, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
      ?? c.req.header("x-real-ip")
      ?? "unknown";

    const result = await checkLimit("ip", ip, maxRequests, windowMs);
    if (result === null) {
      // Redis not configured — fail-open in dev; in prod env validation already requires REDIS_URL
      await next();
      return;
    }
    if (result.redisDown) {
      Sentry.captureMessage("rate-limit-redis-down", "error");
      return c.json({ error: "Service unavailable" }, 503);
    }
    applyRateLimitHeaders(c, result);
    if (!result.success) return c.json({ error: "Too many requests" }, 429);
    await next();
  });
}

export function rateLimitUser(maxRequests: number, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user" as any);
    if (!user?.userId) {
      await next();
      return;
    }

    const result = await checkLimit("user", user.userId, maxRequests, windowMs);
    if (result) {
      if (result.redisDown) {
        Sentry.captureMessage("rate-limit-redis-down", "warning");
      } else {
        applyRateLimitHeaders(c, result);
        if (!result.success) return c.json({ error: "Too many requests" }, 429);
      }
    }
    await next();
  });
}
