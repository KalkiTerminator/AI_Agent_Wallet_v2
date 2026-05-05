import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";

let redis: Redis | null = null;
let rateLimiters: Map<string, Ratelimit> = new Map();
let warnedAboutMissingRedis = false;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warnedAboutMissingRedis) {
      logger.warn("Upstash Redis not configured — rate limiting disabled");
      warnedAboutMissingRedis = true;
    }
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function getLimiter(key: string, maxRequests: number, windowMs: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const windowSec = Math.max(1, Math.floor(windowMs / 1000));
  const cacheKey = `${key}:${maxRequests}:${windowSec}`;
  if (!rateLimiters.has(cacheKey)) {
    rateLimiters.set(
      cacheKey,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
        prefix: `autohub:rl:${key}:${maxRequests}:${windowSec}`,
      })
    );
  }
  return rateLimiters.get(cacheKey)!;
}

export function rateLimitIp(maxRequests: number, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
      ?? c.req.header("x-real-ip")
      ?? "unknown";
    const limiter = getLimiter("ip", maxRequests, windowMs);

    if (!limiter) {
      await next();
      return;
    }

    const { success, limit, remaining, reset } = await limiter.limit(ip);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(reset));

    if (!success) {
      return c.json({ error: "Too many requests" }, 429);
    }
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
    const limiter = getLimiter("user", maxRequests, windowMs);

    if (!limiter) {
      await next();
      return;
    }

    const { success, limit, remaining, reset } = await limiter.limit(user.userId);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(reset));

    if (!success) {
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
}
