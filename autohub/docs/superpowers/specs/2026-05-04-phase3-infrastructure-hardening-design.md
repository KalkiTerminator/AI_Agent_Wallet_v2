# Phase 3 — Infrastructure Hardening Design

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** AutoHub API (`apps/api`) — distributed rate limiting, body limits, key management, circuit breaker, structured logging

---

## 3.1 Distributed Rate Limiting (Upstash Redis)

### Problem
Current `rate-limit.ts` uses an in-memory `Map`. It resets on every Railway restart, doesn't share state across instances, and only keys by IP — a single user can bypass it by rotating IPs.

### Solution
Replace with `@upstash/ratelimit` + `@upstash/redis`. Two limiters per route:
- **Per-IP** sliding window — guards against bot floods from a single IP
- **Per-user** sliding window — guards against credential-stuffing via rotating IPs (authenticated routes only, keyed by JWT `sub`)

### Rate Limits

| Route group | Per-IP | Per-user |
|-------------|--------|----------|
| Auth (`/api/auth/*`) | 10 req/min | — |
| Execute (`/api/tools/:id/execute`) | 20 req/min | 30 req/min |
| General API | 100 req/min | — |

### Implementation
- `middleware/rate-limit.ts` — rewrite to export `rateLimitIp(max, window)` and `rateLimitUser(max, window)`
- Upstash Redis provisioned via Upstash console → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars
- Graceful degradation: if Redis is unreachable, log warning and allow request (fail open) to avoid blocking legitimate traffic during Redis downtime
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 3.2 Request Body Size Limits + Zod `.strict()`

### Problem
No body size limits — a malicious client can POST arbitrarily large payloads to exhaust memory. Zod schemas use `.object()` which silently strips unknown fields instead of rejecting them (mass-assignment risk).

### Solution

**Body limits** via Hono `bodyLimit` middleware in `index.ts`:

| Route group | Limit |
|-------------|-------|
| `/api/auth/*` | 5 KB |
| All other routes | 100 KB |

**Zod `.strict()`** on all validators:
- `packages/shared/src/validators.ts` — `RegisterSchema`, `LoginSchema`, `PasswordSchema` → add `.strict()`
- Inline Zod objects in route files (`auth.ts`, `tools.ts`, `admin.ts`, `account.ts`) → add `.strict()`

Returns `400 Bad Request` with `"Unexpected fields: [fieldName]"` on unknown field rejection.

---

## 3.3 Encryption Key Management (KeyProvider Interface)

### Problem
`crypto.ts` reads `ENCRYPTION_KEY` directly from `process.env`. No abstraction — swapping to AWS KMS or rotating keys requires changing core crypto logic.

### Solution
Introduce a `KeyProvider` interface. Existing behavior moves into `EnvKeyProvider`. A `KMSKeyProvider` stub is added for future use.

```ts
interface KeyProvider {
  getKey(): Promise<Buffer>;
}

class EnvKeyProvider implements KeyProvider { ... }   // current logic
class KMSKeyProvider implements KeyProvider { ... }    // stub — throws NotImplemented
```

`encrypt()` and `decrypt()` accept an optional `KeyProvider` parameter (default: `EnvKeyProvider` singleton). All existing callers work unchanged.

**Key rotation runbook** written to `docs/security/key-rotation.md`:
- How to generate a new `ENCRYPTION_KEY`
- Re-encryption script pattern (decrypt with old key → encrypt with new key)
- Railway env var rotation steps with zero downtime

---

## 3.4 Webhook Circuit Breaker + Outbound Hardening

### Problem
If an external webhook URL is permanently broken, AutoHub keeps making HTTP calls on every tool execution — wasting credits, increasing latency, and burning user trust.

### Solution
Per-tool in-memory circuit breaker in `webhook-proxy.ts`:

**States:** `closed` (normal) → `open` (failing) → `half-open` (testing recovery)

**Thresholds:**
- 5 consecutive failures within 10 minutes → circuit opens
- After 2 minutes in `open` state → moves to `half-open`, allows one probe request
- Probe succeeds → `closed`; probe fails → back to `open`

**When circuit is open:**
- Return cached error immediately (no HTTP call)
- Update tool `toolStatus` to `degraded` in DB (one DB write, not per-request)
- Log audit event `tool.circuit_breaker.opened`

**Additional hardening:**
- Hard platform timeout cap: 60s (overrides tool-configured timeout if higher)
- Response size cap: read max 1MB, reject with `502` if exceeded
- On `401`/`403`/`407` from webhook: mark tool `broken`, log audit event `tool.webhook.auth_failed`

Circuit breaker state is in-memory (resets on restart) — acceptable since Railway runs single instances. Add Redis-backed state in Phase 4 if horizontal scaling is needed.

---

## 3.5 Pino Structured Logging + BetterStack

### Problem
All logging is via `console.log/error` — unstructured, no `requestId` correlation, no retention, no search.

### Solution

**New `src/lib/logger.ts`** — pino logger singleton:
```ts
logger.info({ requestId, userId, route, latencyMs, statusCode }, "request completed")
logger.error({ requestId, err }, "unhandled error")
```

Fields: `requestId`, `userId` (when authenticated), `route`, `method`, `latencyMs`, `statusCode`. No PII (no email, no IP in body, no tokens).

**`pino-http`** middleware added in `index.ts` — auto-logs every request/response.

**BetterStack transport** via `@logtail/pino` — ships JSON logs to BetterStack over HTTPS. Single env var: `BETTERSTACK_TOKEN`.

**Replace** all `console.log/error/warn` calls across the codebase with `logger.*`.

**Log levels by environment:**
- `production`: `info` and above
- `development`: `debug` and above

---

## Architecture Impact

No new routes. No DB schema changes. All changes are in:
- `apps/api/src/middleware/rate-limit.ts` (rewrite)
- `apps/api/src/index.ts` (body limits, pino-http)
- `apps/api/src/services/crypto.ts` (KeyProvider refactor)
- `apps/api/src/services/webhook-proxy.ts` (circuit breaker)
- `apps/api/src/lib/logger.ts` (new)
- `packages/shared/src/validators.ts` (Zod strict)

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `@upstash/redis` | Redis HTTP client |
| `@upstash/ratelimit` | Sliding-window rate limit algorithms |
| `pino` | Structured JSON logger |
| `pino-http` | HTTP request/response auto-logging |
| `@logtail/pino` | BetterStack transport for pino |

---

## New Env Vars

| Var | Where |
|-----|-------|
| `UPSTASH_REDIS_REST_URL` | Railway + local `.env` |
| `UPSTASH_REDIS_REST_TOKEN` | Railway + local `.env` |
| `BETTERSTACK_TOKEN` | Railway + local `.env` |

---

## Verification

- **Rate limit:** `ab -n 20 -c 20` against `/api/auth/login` → 11th+ request returns `429`
- **Body limit:** POST 10KB JSON to `/api/auth/login` → `413 Payload Too Large`
- **Zod strict:** POST `{ email, password, injectedField: "x" }` to `/api/auth/login` → `400`
- **Circuit breaker:** Configure tool with always-failing URL → run 6 times → 7th returns cached error without HTTP call; DB shows `toolStatus: degraded`
- **Logging:** Railway logs show structured JSON with `requestId`; BetterStack dashboard receives logs within 30s
