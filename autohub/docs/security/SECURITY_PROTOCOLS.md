# AutoHub Security Protocols — MUST APPLY TO EVERY CHANGE

> **Per-change checklist** distilled from [`SECURITY_PLAN.md`](./SECURITY_PLAN.md).
> Mirrored into Claude project memory so it auto-loads in every coding session.

**Why:** AutoHub sits as a monetized control-plane on top of third-party automation infra (n8n, Zapier, Make), making outbound HTTP calls to user-submitted webhook URLs. The trust boundary is the entire product. Target posture is **Pipedream-grade**: SOC 2 Type II, HIPAA-eligible, GDPR-compliant.

**How to apply:** Before writing or modifying any feature, walk through the relevant checklists below. If a change touches auth, webhooks, secrets, PII, or admin actions — it MUST be reviewed against these protocols.

---

## 1. Outbound HTTP Calls (Webhooks, External APIs)

Every outbound `fetch` to a user-influenced URL MUST:

- Go through `services/url-guard.ts` `validateOutboundUrl()` — rejects non-HTTPS, private IPs (10.x, 172.16/12, 192.168/16, 127.x, 169.254/16, ::1, fc00::/7, fe80::/10), localhost, cloud metadata endpoints
- Re-resolve DNS at call-time (defeat DNS rebinding); pin resolved IP, preserve `Host` header
- Have a hard timeout cap of 60s regardless of tool config
- Cap response body read at 1MB
- Use `AbortController` for cancellation
- Be wrapped by per-tool circuit breaker (5 failures / 10 min → degraded)
- Never log the full URL or response body — log host + path + status only

## 2. Secrets & Sensitive Data at Rest

- User-submitted webhook URLs, auth headers, API keys → `services/crypto.ts` `encrypt()` (AES-256-GCM, key versioned `v1:iv:ciphertext:authTag`)
- Never return decrypted secrets in any API response — return masked form (`https://hooks.zapier.com/****/abc`)
- Decrypt only at point of use, never assign decrypted value to a variable that outlives the function
- Passwords: bcrypt cost 12 minimum, never logged
- Reset tokens, MFA secrets, backup codes: stored as bcrypt hashes only
- Never commit `.env`, never log `process.env.*_SECRET` or `*_KEY`

## 3. Authentication & Sessions

- Every protected route uses the auth middleware — no DIY JWT verification in route handlers
- JWT TTL: 1 day max, with refresh-token rotation for longer sessions
- Every JWT carries a `jti` claim; auth middleware checks `sessions.revokedAt IS NULL`
- Admin/moderator roles MUST have MFA enrolled (enforced at login)
- Password changes trigger `logout-everywhere` (revoke all sessions for user)
- Email verification required before tool execution or payment

## 4. Audit Logging — Wire Into Every Sensitive Action

Every change to these resources MUST call `services/audit.ts` `logAuditEvent()`:

- **Auth events**: `auth.login.success`, `auth.login.failure`, `auth.signup`, `auth.password_reset.*`, `auth.mfa.enrolled`, `auth.mfa.verified`, `auth.session.revoked`
- **Admin actions**: `admin.user.role_changed`, `admin.user.deactivated`, `admin.tool.approved`, `admin.tool.rejected`
- **Tool lifecycle**: `tool.created`, `tool.updated`, `tool.deleted`, `tool.executed`
- **Payment events**: `payment.completed`, `payment.refunded`, `subscription.activated`, `subscription.canceled`
- **Account events**: `account.exported`, `account.deleted`, `account.erasure_requested`

Every audit row carries `requestId`, `userId`, `ip`. **Never** put PII keys (`email`, `password*`, `token*`, `secret*`, `webhookUrl*`, `authHeader*`) in `metadata` — use the centralized redactor.

## 5. Database Schema Rules

- New PII-bearing tables MUST have `deletedAt timestamp` for GDPR Art. 17 (right to erasure) — never hard delete user data
- Application-level soft cascade only; remove `onDelete: "cascade"` from PII tables
- Sensitive columns use `*Encrypted` naming (`webhookUrlEncrypted`, `authHeaderEncrypted`, `mfaSecretEncrypted`)
- All schema migrations require corresponding data migration script and rollback plan
- Audit log table is append-only — no `UPDATE` or `DELETE` allowed in app code

## 6. API Input Validation

- Every route body validated by Zod schema in `packages/shared/src/validators.ts`
- All Zod object schemas use `.strict()` to reject extra fields (mass-assignment defense)
- Body size limits via Hono `bodyLimit`: 5KB for auth routes, 100KB default, 1MB for file uploads
- Reject `Transfer-Encoding: chunked` without `Content-Length` on non-streaming routes
- Password validation: min 12 chars, zxcvbn score ≥ 3, reject top-1000 common passwords

## 7. Security Headers (Web + API)

API responses include via `middleware/security-headers.ts`:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

Web app `next.config.ts` enforces CSP allowlisting only `'self'`, Stripe domains, and the API URL. Never add `unsafe-eval`. Inline scripts only with nonces.

## 8. Rate Limiting

- All routes pass through Redis-backed sliding-window limiter (NOT in-memory map — that's pre-hardening)
- Per-IP AND per-user buckets for authenticated routes
- Defaults: 20 req/min tool execution, 60 req/min reads, 5 req/min payment/auth actions
- Bot challenge (Turnstile) on signup/login when threshold exceeded

## 9. Error Handling

- Errors propagate to `middleware/error-handler.ts` — never `try/catch` and silently swallow
- 4xx responses: generic message, no stack trace, no internal field names
- 5xx responses: report to Sentry with `requestId`, return `{ error: "Internal error", requestId }` to client
- Never echo user input back in error messages without escaping (XSS in JSON responses is real)

## 10. New Features Checklist

Before merging any new feature, confirm:

- [ ] Outbound calls validated by `url-guard`
- [ ] Sensitive fields encrypted at rest
- [ ] Audit events wired
- [ ] Zod `.strict()` validators added
- [ ] Auth + role check on every route
- [ ] Soft delete fields on new PII tables
- [ ] Rate limit applied
- [ ] Tests cover: happy path, auth bypass attempt, SSRF attempt (if outbound), input fuzzing
- [ ] No PII in logs (grep new logger calls)
- [ ] Secrets only in env, never hardcoded

## 11. Things That Are Always Forbidden

- `eval()`, `Function()` constructor, dynamic `require()` of user input
- Building SQL via string concatenation — Drizzle parameterized queries only
- Trusting `req.ip` directly when behind a proxy — use the configured trust-proxy chain
- Storing secrets in localStorage or non-`HttpOnly` cookies
- `unsafe-eval` or `unsafe-inline` in CSP without explicit security review
- Deploying with `NODE_ENV !== "production"` to prod
- `/seed/*` or any admin-promotion HTTP routes in production builds
- Allowing arbitrary HTTP (non-HTTPS) outbound calls
- Returning decrypted secrets to the client
- Hard-deleting user data without going through the GDPR erasure flow
