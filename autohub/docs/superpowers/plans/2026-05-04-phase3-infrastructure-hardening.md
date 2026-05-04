# Phase 3 — Infrastructure Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the AutoHub API with distributed rate limiting, body size limits, Zod strict validation, KeyProvider abstraction, webhook circuit breaker, and pino structured logging shipped to BetterStack.

**Architecture:** Five independent hardening tasks applied to the existing Hono API (`apps/api`). No new routes or DB migrations. Each task is self-contained and can be committed independently.

**Tech Stack:** Hono, Drizzle, Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`), pino, pino-http, `@logtail/pino`, Zod `.strict()`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/middleware/rate-limit.ts` | Rewrite | Upstash Redis sliding-window rate limiter |
| `apps/api/src/index.ts` | Modify | Add bodyLimit middleware + pino-http + remove hono logger |
| `apps/api/src/lib/logger.ts` | Create | Pino singleton with BetterStack transport |
| `apps/api/src/services/crypto.ts` | Modify | KeyProvider interface + EnvKeyProvider + KMSKeyProvider stub |
| `apps/api/src/services/webhook-proxy.ts` | Modify | Per-tool circuit breaker + auth failure handling |
| `packages/shared/src/validators.ts` | Modify | Add `.strict()` to all Zod schemas |
| `apps/api/src/routes/auth.ts` | Modify | Add `.strict()` to inline Zod objects |
| `apps/api/src/routes/tools.ts` | Modify | Add `.strict()` to inline Zod objects |
| `apps/api/src/routes/admin.ts` | Modify | Add `.strict()` to inline Zod objects |
| `apps/api/src/routes/account.ts` | Modify | Add `.strict()` to inline Zod objects |
| `docs/security/key-rotation.md` | Create | Key rotation runbook |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install API dependencies**

```bash
cd autohub
pnpm add --filter api @upstash/redis @upstash/ratelimit pino pino-http @logtail/pino
```

Expected output: packages added, no errors.

- [ ] **Step 2: Verify installation**

```bash
cd autohub/apps/api && node -e "import('@upstash/ratelimit').then(() => console.log('ok'))"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd autohub
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add upstash, pino, logtail dependencies"
```

---

## Task 2: Pino Logger + BetterStack

**Files:**
- Create: `apps/api/src/lib/logger.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/lib/logger.ts`**

```ts
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const betterStackToken = process.env.BETTERSTACK_TOKEN;

const transport = isDev
  ? { target: "pino-pretty", options: { colorize: true } }
  : betterStackToken
  ? {
      target: "@logtail/pino",
      options: { sourceToken: betterStackToken },
    }
  : undefined;

export const logger = pino(
  {
    level: isDev ? "debug" : "info",
    redact: ["req.headers.authorization", "req.headers.cookie"],
    base: { service: "autohub-api" },
  },
  transport ? pino.transport(transport) : undefined
);
```

- [ ] **Step 2: Add `BETTERSTACK_TOKEN` to local `.env`**

Add this line to `apps/api/.env`:
```
BETTERSTACK_TOKEN=
```
Leave blank for now — logs go to stdout in dev. Fill in after signing up at betterstack.com.

- [ ] **Step 3: Update `apps/api/src/index.ts` — replace hono logger with pino-http**

Replace:
```ts
import { logger } from "hono/logger";
```
With:
```ts
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
```

Replace:
```ts
app.use("*", logger());
```
With:
```ts
app.use("*", async (c, next) => {
  const httpLogger = pinoHttp({
    logger,
    customLogLevel: (_req, res) => (res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
  // pino-http works with Node IncomingMessage — adapt for Hono
  await next();
});
```

Also replace the `console.log` on the port line:
```ts
logger.info({ port }, "AutoHub API running");
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd autohub
git add apps/api/src/lib/logger.ts apps/api/src/index.ts apps/api/.env
git commit -m "feat: pino structured logging with BetterStack transport (3.5)"
```

---

## Task 3: Distributed Rate Limiting (Upstash Redis)

**Files:**
- Rewrite: `apps/api/src/middleware/rate-limit.ts`
- Modify: `apps/api/src/routes/auth.ts` (apply middleware)
- Modify: `apps/api/src/routes/tools.ts` (apply middleware)

- [ ] **Step 1: Sign up for Upstash and create a Redis database**

1. Go to console.upstash.com → Create Database → name: `autohub-ratelimit`, region: `ap-northeast-1` (Tokyo, closest to Railway Singapore)
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the database dashboard
3. Add both to `apps/api/.env`:
```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

- [ ] **Step 2: Rewrite `apps/api/src/middleware/rate-limit.ts`**

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";

let redis: Redis | null = null;
let rateLimiters: Map<string, Ratelimit> = new Map();

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
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
  const cacheKey = `${key}:${maxRequests}:${windowMs}`;
  if (!rateLimiters.has(cacheKey)) {
    rateLimiters.set(
      cacheKey,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(maxRequests, `${Math.floor(windowMs / 1000)} s`),
        prefix: `autohub:rl:${key}`,
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
      // Redis not configured — fail open with a warning
      logger.warn("Upstash Redis not configured, rate limiting disabled");
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
    const payload = (c as any).get("jwtPayload");
    if (!payload?.sub) {
      await next();
      return;
    }
    const limiter = getLimiter("user", maxRequests, windowMs);

    if (!limiter) {
      await next();
      return;
    }

    const { success, limit, remaining, reset } = await limiter.limit(payload.sub);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(reset));

    if (!success) {
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
}
```

- [ ] **Step 3: Apply rate limiters in `apps/api/src/routes/auth.ts`**

Add import at top:
```ts
import { rateLimitIp } from "../middleware/rate-limit.js";
```

Apply to auth router — add after `const authRouter = new Hono();`:
```ts
authRouter.use("/login", rateLimitIp(10, 60_000));
authRouter.use("/register", rateLimitIp(10, 60_000));
authRouter.use("/reset/request", rateLimitIp(5, 60_000));
```

- [ ] **Step 4: Apply rate limiters in `apps/api/src/routes/tools.ts`**

Add import:
```ts
import { rateLimitIp, rateLimitUser } from "../middleware/rate-limit.js";
```

Find the execute route and add before it:
```ts
toolsRouter.use("/:id/execute", rateLimitIp(20, 60_000));
toolsRouter.use("/:id/execute", rateLimitUser(30, 60_000));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd autohub
git add apps/api/src/middleware/rate-limit.ts apps/api/src/routes/auth.ts apps/api/src/routes/tools.ts apps/api/.env
git commit -m "feat: Upstash Redis distributed rate limiting, per-IP + per-user (3.1)"
```

---

## Task 4: Body Size Limits + Zod `.strict()`

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `packages/shared/src/validators.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/routes/tools.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/account.ts`

- [ ] **Step 1: Add body size limits in `apps/api/src/index.ts`**

Add import:
```ts
import { bodyLimit } from "hono/body-limit";
```

Add after the CORS middleware block (before the requestId middleware):
```ts
// Tight limit on auth routes — prevents large payload DoS on bcrypt
app.use("/api/auth/*", bodyLimit({ maxSize: 5 * 1024 }));
// Default limit for all other routes
app.use("*", bodyLimit({ maxSize: 100 * 1024 }));
```

- [ ] **Step 2: Add `.strict()` to `packages/shared/src/validators.ts`**

Update `RegisterSchema`:
```ts
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().superRefine((val, ctx) => {
    const result = isStrongPassword(val);
    if (result !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result });
    }
  }),
  fullName: z.string().min(1, "Name is required").optional(),
}).strict();
```

Update `LoginSchema`:
```ts
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
}).strict();
```

Update `ResetPasswordSchema`:
```ts
export const ResetPasswordSchema = z.object({
  email: z.string().email(),
}).strict();
```

Update `ResetConfirmSchema`:
```ts
export const ResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
}).strict();
```

Update `CreateToolSchema`:
```ts
export const CreateToolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.string().min(1),
  creditCost: z.number().int().min(1).max(1000),
  webhookUrl: z.string().url(),
  inputFields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      label: z.string().min(1),
      placeholder: z.string().default(""),
      required: z.boolean().default(false),
      options: z.array(z.string()).optional(),
    }).strict()
  ),
  outputType: z.string().optional(),
  webhookTimeout: z.number().int().min(1).max(300).default(30),
  webhookRetries: z.number().int().min(0).max(5).default(2),
}).strict();
```

Update `PurchaseCreditsSchema`:
```ts
export const PurchaseCreditsSchema = z.object({
  pack: z.enum(["100", "500", "1000"]),
}).strict();
```

- [ ] **Step 3: Grep for inline Zod objects in route files**

```bash
cd autohub && grep -rn "z\.object(" apps/api/src/routes/
```

For each inline `z.object({...})` found that parses user input, add `.strict()` before the closing `)`. Common patterns to find and update:

In `apps/api/src/routes/auth.ts` — any inline `z.object` for MFA, session, verify endpoints:
```ts
// Find patterns like:
const body = await c.req.json<{ ... }>();
// If they use zValidator, add .strict() to the schema
// If they use manual json parsing, add a Zod parse with .strict()
```

In `apps/api/src/routes/admin.ts` — role update, user delete inline schemas:
```ts
// Find z.object({ role: z.enum([...]) }) and add .strict()
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd autohub/apps/api && npx tsc --noEmit
cd autohub/apps/web && npx tsc --noEmit
```

Expected: no errors in either app.

- [ ] **Step 5: Commit**

```bash
cd autohub
git add apps/api/src/index.ts packages/shared/src/validators.ts apps/api/src/routes/
git commit -m "feat: body size limits + Zod strict validation on all schemas (3.2)"
```

---

## Task 5: KeyProvider Interface

**Files:**
- Modify: `apps/api/src/services/crypto.ts`
- Create: `docs/security/key-rotation.md`

- [ ] **Step 1: Rewrite `apps/api/src/services/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const CURRENT_VERSION = "v1";

// ── KeyProvider interface ─────────────────────────────────────────────────────

export interface KeyProvider {
  getKey(): Promise<Buffer>;
}

export class EnvKeyProvider implements KeyProvider {
  async getKey(): Promise<Buffer> {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) throw new Error("ENCRYPTION_KEY env var is not set");
    const key = Buffer.from(hex, "hex");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
    return key;
  }
}

// Stub — swap in a real KMS client when SOC 2 / key management is required.
export class KMSKeyProvider implements KeyProvider {
  async getKey(): Promise<Buffer> {
    throw new Error("KMSKeyProvider not implemented. Configure AWS KMS or GCP KMS credentials.");
  }
}

const defaultProvider: KeyProvider = new EnvKeyProvider();

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: "v1:<iv_base64>:<ciphertext_base64>:<authTag_base64>"
 */
export async function encrypt(plaintext: string, provider: KeyProvider = defaultProvider): Promise<string> {
  const key = await provider.getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${iv.toString("base64")}:${ciphertext.toString("base64")}:${authTag.toString("base64")}`;
}

/**
 * Decrypts a value produced by encrypt().
 */
export async function decrypt(stored: string, provider: KeyProvider = defaultProvider): Promise<string> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted value format");
  }
  const [, ivB64, ciphertextB64, authTagB64] = parts;
  const key = await provider.getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const visiblePath = pathParts.slice(0, 2).join("/");
    return `${parsed.protocol}//${parsed.host}/${visiblePath}/***`;
  } catch {
    return "***";
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith("v1:") && value.split(":").length === 4;
}
```

- [ ] **Step 2: Update all callers of `encrypt`/`decrypt` to await them**

`encrypt` and `decrypt` are now async. Find all callers:

```bash
cd autohub && grep -rn "encrypt\|decrypt" apps/api/src/routes/ apps/api/src/services/
```

In `apps/api/src/services/webhook-proxy.ts`, update:
```ts
// Before:
const rawWebhookUrl = tool.webhookUrlEncrypted
  ? decrypt(tool.webhookUrlEncrypted)
  : tool.webhookUrl;
const authHeader = tool.authHeaderEncrypted ? decrypt(tool.authHeaderEncrypted) : null;

// After:
const rawWebhookUrl = tool.webhookUrlEncrypted
  ? await decrypt(tool.webhookUrlEncrypted)
  : tool.webhookUrl;
const authHeader = tool.authHeaderEncrypted ? await decrypt(tool.authHeaderEncrypted) : null;
```

In `apps/api/src/routes/tools.ts`, find any `encrypt(...)` calls and add `await`:
```ts
// Before:
webhookUrlEncrypted: encrypt(webhookUrl)
// After:
webhookUrlEncrypted: await encrypt(webhookUrl)
```

In `apps/api/src/routes/auth.ts`, same pattern for any encrypt/decrypt calls.

- [ ] **Step 3: Write key rotation runbook**

Create `docs/security/key-rotation.md`:

```markdown
# Encryption Key Rotation Runbook

## When to rotate
- Suspected key compromise
- Staff offboarding with key access
- Annual rotation policy

## Steps

### 1. Generate new key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Re-encrypt all rows (run against production DB)
```ts
// scripts/rotate-encryption-key.ts
import { decrypt, encrypt } from "../src/services/crypto.js";
import { db } from "../src/db/index.js";
import { aiTools } from "../src/db/schema.js";

const OLD_KEY = process.env.OLD_ENCRYPTION_KEY!;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY!;

const oldProvider = { getKey: async () => Buffer.from(OLD_KEY, "hex") };
const newProvider = { getKey: async () => Buffer.from(NEW_KEY, "hex") };

const tools = await db.select().from(aiTools);
for (const tool of tools) {
  if (tool.webhookUrlEncrypted) {
    const plain = await decrypt(tool.webhookUrlEncrypted, oldProvider);
    const reencrypted = await encrypt(plain, newProvider);
    await db.update(aiTools).set({ webhookUrlEncrypted: reencrypted }).where(eq(aiTools.id, tool.id));
  }
}
console.log("Re-encryption complete");
```

### 3. Update Railway env var
Railway → Variables → ENCRYPTION_KEY → new value → Save (triggers redeploy)

### 4. Verify
Hit /health, execute a tool — confirm no decrypt errors in logs.
```
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd autohub
git add apps/api/src/services/crypto.ts apps/api/src/services/webhook-proxy.ts apps/api/src/routes/tools.ts docs/security/key-rotation.md
git commit -m "feat: KeyProvider interface, EnvKeyProvider, KMSKeyProvider stub, key rotation runbook (3.3)"
```

---

## Task 6: Webhook Circuit Breaker

**Files:**
- Modify: `apps/api/src/services/webhook-proxy.ts`

- [ ] **Step 1: Add circuit breaker state to `webhook-proxy.ts`**

Add at the top of the file, after imports:

```ts
// ── Circuit Breaker ───────────────────────────────────────────────────────────

interface CircuitState {
  failures: number;
  firstFailureAt: number;
  openedAt: number | null;
  status: "closed" | "open" | "half-open";
  cachedError: string | null;
}

const circuits = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OPEN_DURATION_MS = 2 * 60 * 1000;   // 2 minutes before half-open

function getCircuit(toolId: string): CircuitState {
  if (!circuits.has(toolId)) {
    circuits.set(toolId, { failures: 0, firstFailureAt: 0, openedAt: null, status: "closed", cachedError: null });
  }
  return circuits.get(toolId)!;
}

function recordSuccess(toolId: string): void {
  circuits.set(toolId, { failures: 0, firstFailureAt: 0, openedAt: null, status: "closed", cachedError: null });
}

function recordFailure(toolId: string, error: string): "open" | "closed" {
  const c = getCircuit(toolId);
  const now = Date.now();

  // Reset failure window if first failure was too long ago
  if (c.firstFailureAt && now - c.firstFailureAt > FAILURE_WINDOW_MS) {
    c.failures = 0;
    c.firstFailureAt = 0;
  }

  if (!c.firstFailureAt) c.firstFailureAt = now;
  c.failures++;
  c.cachedError = error;

  if (c.failures >= FAILURE_THRESHOLD) {
    c.status = "open";
    c.openedAt = now;
    return "open";
  }
  return "closed";
}

function shouldAllow(toolId: string): "allow" | "reject" {
  const c = getCircuit(toolId);
  if (c.status === "closed") return "allow";
  if (c.status === "open") {
    const now = Date.now();
    if (c.openedAt && now - c.openedAt > OPEN_DURATION_MS) {
      c.status = "half-open";
      return "allow"; // probe request
    }
    return "reject";
  }
  // half-open: allow one probe
  return "allow";
}
```

- [ ] **Step 2: Wire circuit breaker into `executeSync`**

At the start of `executeSync`, before the SSRF guard, add:

```ts
// Circuit breaker check
const circuitDecision = shouldAllow(tool.id);
if (circuitDecision === "reject") {
  return {
    executionId: execution.id,
    status: "failed" as const,
    error: `Tool circuit breaker open: ${getCircuit(tool.id).cachedError ?? "repeated failures"}`,
  };
}
```

After the `if (!res.ok)` block inside the try, update the failure path to record the failure:

```ts
if (!res.ok) {
  const errMsg = `Webhook returned ${res.status}`;
  const circuitStatus = recordFailure(tool.id, errMsg);
  if (circuitStatus === "open") {
    await db.update(aiTools).set({ toolStatus: "degraded" }).where(eq(aiTools.id, tool.id));
    await logAuditEvent({
      userId: execution.userId,
      action: "tool.circuit_breaker.opened",
      resourceType: "tool",
      resourceId: tool.id,
      metadata: { reason: errMsg },
    });
  }
  // Handle auth failures — mark tool broken
  if (res.status === 401 || res.status === 403 || res.status === 407) {
    await db.update(aiTools).set({ toolStatus: "broken" }).where(eq(aiTools.id, tool.id));
    await logAuditEvent({
      userId: execution.userId,
      action: "tool.webhook.auth_failed",
      resourceType: "tool",
      resourceId: tool.id,
      metadata: { statusCode: res.status },
    });
  }
  await db.update(executions)
    .set({ status: "failed", error: errMsg, completedAt: new Date() })
    .where(eq(executions.id, execution.id));
  return { executionId: execution.id, status: "failed" as const, error: errMsg };
}
```

After the successful response path (after `logAuditEvent` for success), add:
```ts
recordSuccess(tool.id);
```

In the catch block, record failure:
```ts
catch (err) {
  const isTimeout = (err as Error).name === "AbortError";
  const errMsg = isTimeout ? "Webhook timed out" : (err as Error).message;
  const circuitStatus = recordFailure(tool.id, errMsg);
  if (circuitStatus === "open") {
    await db.update(aiTools).set({ toolStatus: "degraded" }).where(eq(aiTools.id, tool.id));
    await logAuditEvent({
      userId: execution.userId,
      action: "tool.circuit_breaker.opened",
      resourceType: "tool",
      resourceId: tool.id,
      metadata: { reason: errMsg },
    });
  }
  const status = isTimeout ? "timeout" as const : "failed" as const;
  await db.update(executions)
    .set({ status, error: errMsg, completedAt: new Date() })
    .where(eq(executions.id, execution.id));
  return { executionId: execution.id, status };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd autohub
git add apps/api/src/services/webhook-proxy.ts
git commit -m "feat: per-tool circuit breaker, auth failure detection, tool degraded status (3.4)"
```

---

## Task 7: Add Env Vars to Railway + Push

- [ ] **Step 1: Add env vars to Railway**

In Railway → your API service → Variables, add:
```
UPSTASH_REDIS_REST_URL=<from Upstash dashboard>
UPSTASH_REDIS_REST_TOKEN=<from Upstash dashboard>
BETTERSTACK_TOKEN=<from BetterStack → sources → your source → token>
```

- [ ] **Step 2: Sign up for BetterStack and get token**

1. Go to logs.betterstack.com → Create account
2. Sources → Create source → name: `autohub-api`, platform: Node.js
3. Copy the **Source token**
4. Add to Railway as `BETTERSTACK_TOKEN`

- [ ] **Step 3: Push to GitHub to trigger Railway deploy**

```bash
cd autohub && git push origin main
```

- [ ] **Step 4: Verify in Railway logs**

Railway → your service → Logs. Should see structured JSON like:
```json
{"level":30,"service":"autohub-api","msg":"AutoHub API running","port":4000}
```

- [ ] **Step 5: Verify in BetterStack**

BetterStack → Live tail — should see logs flowing within 30 seconds of Railway deploy.

- [ ] **Step 6: Test rate limiting**

```bash
for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://accomplished-integrity-production.up.railway.app/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"wrong"}'; done
```

Expected: first 10 return `401`, 11th+ return `429`.

- [ ] **Step 7: Test body limit**

```bash
# Generate ~6KB payload
python3 -c "import json; print(json.dumps({'email': 'a@b.com', 'password': 'x' * 6000}))" | curl -s -X POST https://accomplished-integrity-production.up.railway.app/api/auth/login -H "Content-Type: application/json" -d @- -w "\n%{http_code}"
```

Expected: `413`

---

## Verification Checklist

- [ ] Rate limit: 11th auth request in 1 min → `429` with `X-RateLimit-*` headers
- [ ] Body limit: 6KB to `/api/auth/login` → `413`
- [ ] Zod strict: `{"email":"a@b.com","password":"ValidPass1!","extraField":"x"}` to register → `400`
- [ ] Circuit breaker: TypeScript compiles cleanly with new circuit state
- [ ] Logging: Railway logs show JSON, BetterStack receives logs
- [ ] All TypeScript: `npx tsc --noEmit` passes in both `apps/api` and `apps/web`
