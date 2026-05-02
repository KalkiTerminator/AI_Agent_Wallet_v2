# AutoHub Security Hardening: Pipedream-Grade Compliance

> **Living document.** This is the canonical security plan for AutoHub. The same content is mirrored in Claude's project memory so it is auto-loaded into every coding session.
> Companion file: [`SECURITY_PROTOCOLS.md`](./SECURITY_PROTOCOLS.md) — the per-change checklist.

## Context

AutoHub is a credit-based marketplace where end users trigger AI workflows hosted on third-party platforms (n8n, Zapier, Make). The platform sits as a **monetized control-plane on top of external automation infrastructure** — making outbound HTTP calls to user-submitted webhook URLs the central trust boundary of the entire product.

The current code has correct architectural bones (NextAuth v5, JWT sessions, two-phase commit on credit deduction, HMAC-signed outbound requests, Stripe webhook signature verification, Zod validation, Sentry monitoring) but several **critical security gaps** that must be closed before shipping a marketplace where strangers submit URLs we will call from our infrastructure.

The goal is to bring AutoHub's security posture in line with **Pipedream's published standards: SOC 2 Type II, HIPAA-eligible, GDPR-compliant**. This is delivered in **four phases**, each independently shippable so we keep development moving.

The security audit identified twelve gaps across four severity levels. The phasing groups them by blast-radius and prerequisite ordering — Phase 1 fixes things that could cause a breach this week; Phase 4 builds the formal certification artifacts.

---

## Critical Files (current state)

- `autohub/apps/api/src/index.ts` — Hono entry, CORS, missing security headers, dev-only `/seed/promote-admin` route still mounted in prod
- `autohub/apps/api/src/services/webhook-proxy.ts` — Outbound webhook caller; **no SSRF check**, plain-text URL, async branch can race credit deduction
- `autohub/apps/api/src/services/hmac.ts` — Already uses timing-safe compare, good baseline
- `autohub/apps/api/src/db/schema.ts` — `auditLogs` table defined but never written to; `webhookUrl` stored plain text; no `deletedAt` columns
- `autohub/apps/api/src/middleware/rate-limit.ts` — In-memory only, lost on restart, doesn't scale
- `autohub/apps/api/src/middleware/auth.ts` — JWT verify, no session revocation list
- `autohub/apps/api/src/routes/webhooks.ts` — Stripe verification correct
- `autohub/apps/web/src/lib/auth.ts` — NextAuth v5, bcrypt(12), no MFA, 7-day token TTL
- `autohub/apps/web/next.config.ts` — No CSP, no security headers
- `autohub/packages/shared/src/validators.ts` — Zod schemas, password min 8 chars (weak)

---

## Phase 1 — Critical Bug Fixes (Week 1, ~5-7 days)

These close the breach-class vulnerabilities. Ship before any other security work.

### 1.1 SSRF Protection on Outbound Webhooks
**Files:** new `autohub/apps/api/src/services/url-guard.ts`, modify `webhook-proxy.ts`

- New `validateOutboundUrl(url)` helper:
  - Require `https://` scheme (reject `http://`, `file://`, `gopher://`, etc.)
  - DNS-resolve hostname; reject if any A/AAAA record falls in: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16` (link-local/AWS metadata), `::1`, `fc00::/7`, `fe80::/10`
  - Reject hostnames `localhost`, `metadata.google.internal`, `metadata.azure.com`
  - Re-check on every call (not just at submit time) to defeat DNS rebinding — pin the resolved IP and pass it via `Host` header preserving the original hostname
- Call `validateOutboundUrl` inside `WebhookProxyService.executeSync` and `executeAsync` before `fetch`
- Validate again at tool creation in `routes/tools.ts` to fail fast for creators

### 1.2 Encrypt User-Submitted Webhook Secrets
**Files:** new `autohub/apps/api/src/services/crypto.ts`, schema migration, `webhook-proxy.ts`

- New `crypto.ts` exposing `encrypt(plaintext)` / `decrypt(ciphertext)` using AES-256-GCM
  - Master key from `ENCRYPTION_KEY` env (32 bytes hex), random 12-byte IV per record, store as `iv:ciphertext:authTag` base64
  - Wrapper supports key versioning prefix (`v1:...`) so we can rotate later without rewriting rows
- Schema migration on `aiTools`:
  - Rename `webhookUrl` → `webhookUrlEncrypted text`
  - Add `authHeaderEncrypted text` (creators can store `Authorization: Bearer xyz` for n8n/Zapier basic-auth-protected webhooks)
  - One-time data migration script: encrypt existing values
- `webhook-proxy.ts` decrypts at call-time only, never returns plaintext to any API response, never logs decrypted value
- `routes/tools.ts` GET responses return `webhookUrlMasked` (e.g., `https://hooks.zapier.com/****/abc`)

### 1.3 Activate Audit Logging
**Files:** new `autohub/apps/api/src/services/audit.ts`, wire into all sensitive routes

- `audit.ts` exports `logAuditEvent({ userId, action, resourceType, resourceId, metadata, ip, requestId })`
- Add a Hono middleware in `index.ts` that injects `requestId` (UUID) into context — every audit row carries it
- Wire into:
  - `routes/auth.ts` — `auth.login.success`, `auth.login.failure`, `auth.password_reset.requested`, `auth.password_reset.completed`, `auth.signup`
  - `routes/admin.ts` — `admin.user.role_changed`, `admin.tool.approved`, `admin.tool.rejected`, `admin.user.deactivated`
  - `routes/tools.ts` — `tool.created`, `tool.updated`, `tool.deleted`
  - `webhook-proxy.ts` — `tool.executed` (every call, with execution_id but **not** request payload)
  - `routes/webhooks.ts` — `payment.completed`, `subscription.activated`
- PII redaction: never log `email`, `password*`, `token*`, `secret*`, `webhookUrl*`, `authHeader*` keys in metadata. Centralized redactor in `audit.ts`

### 1.4 Security Headers + Remove Seed Route
**Files:** `autohub/apps/web/next.config.ts`, `autohub/apps/api/src/index.ts`, new `autohub/apps/api/src/middleware/security-headers.ts`

- Add `helmet`-style headers via Hono middleware on API:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- Next.js `headers()` in `next.config.ts` adds CSP for the web app:
  - `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; connect-src 'self' ${API_URL} https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`
- Gate `/seed/promote-admin` behind `NODE_ENV !== "production"` AND additional `X-Seed-Token` header check (or move out of HTTP entirely into a CLI script in `apps/api/scripts/promote-admin.ts`)

### 1.5 Fix Async Webhook Race Condition
**File:** `webhook-proxy.ts:114-139`

The async branch currently fires the webhook with `fetch().catch(...)` and returns `pending`, but credits are never deducted on success — only on the eventual callback in `routes/executions.ts`. Verify the callback path actually deducts and document the invariant in code, OR switch async tools to **deduct-on-fire + refund-on-failure-callback** to match sync semantics. Add integration test covering both paths.

### 1.6 Strengthen Password Policy
**File:** `autohub/packages/shared/src/validators.ts`

- Bump password min from 8 → 12 chars, add complexity check (must contain at least 3 of: lower, upper, digit, symbol) OR run zxcvbn and require score ≥ 3
- Reject top-1000 common passwords via embedded list

---

## Phase 2 — GDPR + Account Hardening (Week 2-3, ~7-8 days)

### 2.1 Soft Deletes + GDPR Endpoints
**Files:** schema migration, new `autohub/apps/api/src/routes/account.ts`

- Add `deletedAt timestamp` to: `users`, `aiTools`, `executions`, `toolUsages`, `payments`. Switch all `select` queries to filter `deletedAt IS NULL`
- Convert `onDelete: "cascade"` → application-level soft cascade in account deletion service
- Wire `routes/account.ts`:
  - `GET /api/account/export` — returns ZIP/JSON of all user data (profile, tool usages, payments, executions). Async job, emails download link
  - `DELETE /api/account` — soft-deletes user, anonymizes email/name, retains audit/payment rows for 7 years (legal), purges executions/usages metadata after 30-day grace
  - `POST /api/account/data-erasure-request` — formal GDPR Art. 17 request, audit-logged, manual review

### 2.2 MFA / TOTP
**Files:** `autohub/apps/web/src/lib/auth.ts`, schema additions, new UI

- Add `users.mfaSecretEncrypted text`, `users.mfaEnabled boolean`, `mfa_backup_codes` table (hashed)
- Use `otplib` for TOTP (industry standard, Pipedream uses similar)
- NextAuth credentials provider: after password verify, if `mfaEnabled` → return partial session requiring TOTP step
- Settings UI: enroll → show QR (otpauth URL) → verify code → show 10 backup codes
- Force MFA for users with `admin` or `moderator` role (configurable in `app_config`)

### 2.3 Session Revocation
**Files:** schema, `auth.ts` middleware, NextAuth callbacks

- New `sessions` table: `id`, `userId`, `tokenJti` (JWT ID claim), `createdAt`, `revokedAt`, `userAgent`, `ip`
- Issue `jti` claim in every JWT; auth middleware checks `revokedAt IS NULL`
- `POST /api/auth/sessions/:id/revoke` — revoke a specific session
- `POST /api/auth/logout` — revoke current session
- `POST /api/auth/logout-everywhere` — revoke all user sessions (used after password change)
- Reduce JWT TTL from 7d → 1d, use refresh-token rotation for longer sessions

### 2.4 Email Verification
**Files:** schema, `auth.ts`, new `routes/auth/verify.ts`

- Add `users.emailVerifiedAt timestamp`
- Signup sends verification email (Resend); unverified users have read-only access (no tool execution, no payment)
- 7-day verification window, then account flagged for review

---

## Phase 3 — Infrastructure Hardening (Week 3-4, ~7-8 days)

### 3.1 Distributed Rate Limiting (Redis)
**Files:** `autohub/apps/api/src/middleware/rate-limit.ts`, new Railway Redis service

- Replace in-memory map with Upstash Redis or Railway Redis
- Sliding-window algorithm via `INCR + EXPIRE` Lua script
- Per-user buckets (in addition to per-IP) for authenticated routes
- Add bot detection: `Cloudflare Turnstile` or `hCaptcha` on signup/login if rate exceeded

### 3.2 Request Size Limits + Input Hardening
**File:** `autohub/apps/api/src/index.ts`

- Hono `bodyLimit` middleware: 100KB default, 1MB for file-upload routes, 5KB for auth routes
- Reject `Transfer-Encoding: chunked` without `Content-Length` for non-streaming routes
- Add Zod `.strict()` to all body validators to reject extra fields (mass-assignment defense)

### 3.3 Encryption Key Management Foundation
**File:** `autohub/apps/api/src/services/crypto.ts`

- Refactor crypto.ts to support a `KeyProvider` interface
- Default impl: `EnvKeyProvider` (current approach)
- Stub: `KMSKeyProvider` (AWS KMS / GCP KMS — not implemented yet, but interface ready)
- Document key rotation runbook in `autohub/docs/security/key-rotation.md`

### 3.4 Webhook Outbound Hardening
**File:** `autohub/apps/api/src/services/webhook-proxy.ts`

- Per-tool circuit breaker (mentioned in plan.md but not built): 5 failures in 10min → mark tool `degraded`, return cached error to user without making call
- Outbound timeout cap: tool-configured timeout AND a hard platform cap of 60s
- Response size cap: read max 1MB of response body, reject larger
- Forbidden response handling: if external webhook returns 401/403/407, mark tool as broken and notify creator (likely their auth expired)
- Egress IP allowlist in production: route all outbound calls through a known static IP (Railway egress) so creators can firewall to it

### 3.5 Compliance-Ready Logging Pipeline
**Files:** new `autohub/apps/api/src/lib/logger.ts`

- Structured JSON logs (pino) with `requestId`, `userId`, `route`, `latencyMs`, no PII
- Ship to a long-retention store (BetterStack, Datadog, or self-hosted Loki) with 1-year retention for SOC 2
- Audit logs separately backed up to immutable object storage (S3 with object lock) daily

---

## Phase 4 — Certification Path (Week 5+, ongoing)

This phase is about **organizational and procedural** controls, not code. Many require external auditors and legal review.

### 4.1 SOC 2 Type II Prep
- Engage auditor (Vanta / Drata / Secureframe to manage evidence collection)
- Document security policies: incident response, access control, change management, vendor management
- Quarterly access reviews (script: list all admin users, prove they still need access)
- Vulnerability scanning: Snyk / Dependabot on all PRs, weekly Trivy scans on Docker images
- Penetration test (annual, third-party)
- Formal vendor list: Stripe, Sentry, Resend, Railway — get their SOC 2 reports on file

### 4.2 HIPAA Eligibility (only if onboarding healthcare customers)
- Sign BAA with all subprocessors (Stripe, Railway, Resend, Sentry — all support BAAs)
- Encrypt PHI at rest with customer-managed keys
- Audit log retention: 6 years minimum
- Workforce training, designated security officer
- Risk assessment and gap analysis

### 4.3 GDPR Compliance Beyond Code
- Publish privacy policy with lawful basis for each processing activity
- Data Processing Agreement template for B2B customers
- Cookie consent banner (web app)
- Data Protection Officer designation (if >250 employees or large-scale processing)
- Records of Processing Activities (Art. 30) — internal document
- Breach notification process: 72-hour SLA to authorities

### 4.4 Tool Creator Trust & Safety
- Tool creator KYC: verify identity before approving for public marketplace
- Automated webhook scanning: weekly health check of all approved tool webhooks; auto-disable broken ones
- Manual review queue for new tools with risk scoring (new account + high credit cost = high risk)
- Public security disclosure policy + bug bounty (HackerOne or self-hosted)

---

## Reusable Existing Components

These already exist — don't rewrite them:

- **HMAC signing**: `autohub/apps/api/src/services/hmac.ts` already has timing-safe verification. Reuse for new use cases (session tokens, callback URLs).
- **Stripe webhook verification pattern**: `autohub/apps/api/src/routes/webhooks.ts` is the canonical pattern for any new inbound webhook (e.g., n8n result callbacks).
- **Zod validators**: `autohub/packages/shared/src/validators.ts` — extend, don't duplicate. Add new schemas for MFA codes, GDPR requests.
- **Sentry context**: `autohub/apps/api/src/instrument.js` already initialized — wire `setUser({ id })` in auth middleware so errors carry user context.
- **NextAuth callbacks**: `autohub/apps/web/src/lib/auth.ts` `jwt` and `session` callbacks already exist — extend them for MFA step-up and `jti` injection rather than replacing.

---

## Verification Plan

### Phase 1 verification
- **SSRF**: Submit a tool with `http://169.254.169.254/latest/meta-data/` (AWS metadata) → expect rejection. Same for `http://localhost:4000`, `http://10.0.0.1`, `https://127.0.0.1.nip.io`. Add unit tests in `apps/api/src/services/__tests__/url-guard.test.ts`.
- **Encryption**: Create a tool with webhook URL → query DB directly → confirm `webhookUrlEncrypted` is base64 ciphertext, not readable. Restart API, execute tool → confirm decryption works.
- **Audit logging**: Login + change role + execute tool → query `audit_logs` → verify all three rows present with correct `requestId`. Verify no PII in metadata jsonb.
- **Headers**: `curl -I https://staging.autohub` → confirm `Strict-Transport-Security`, `X-Frame-Options`, `Content-Security-Policy` present.
- **Async race**: Run integration test in `apps/api/src/__tests__/async-execution.test.ts` — fire async tool, simulate callback success, confirm credits deducted exactly once.
- **Password policy**: Try to sign up with `password123` → rejected. Try `Tr0ub4dor&3` → rejected (zxcvbn weak). Try `correct horse battery staple` → accepted.

### Phase 2 verification
- **GDPR export**: `curl /api/account/export` → receive download link → unzip → verify all user-related data present, no other users' data leaked.
- **MFA**: Enroll → receive QR → scan with Google Authenticator → log out → log in with password → prompted for TOTP → enter code → success. Test backup code flow.
- **Session revocation**: Log in on two browsers → revoke session A from settings → confirm browser A is logged out within 1 minute (next API call returns 401).
- **Email verification**: Sign up → verify can browse but can't execute tool → click email link → can now execute.

### Phase 3 verification
- **Redis rate limit**: Hammer `/api/tools/:id/execute` from 5 different IPs sharing one user → confirm per-user limit hits even though per-IP doesn't.
- **Body limits**: POST 10MB JSON to `/api/auth/login` → expect `413 Payload Too Large`.
- **Circuit breaker**: Submit a tool with an always-failing webhook → run 6 times → 7th call should return cached failure without hitting the webhook.

### Phase 4 verification
- Vanta/Drata dashboard shows ≥95% control coverage
- External pentest report shows no critical findings
- Privacy policy published, cookie banner functional
- BAAs signed with all subprocessors (filed in `docs/legal/baa/`)

### Test Suite
- `pnpm test` runs Vitest unit tests for all new services
- `pnpm e2e` runs Playwright tests covering: signup → email verify → MFA enroll → execute tool → request GDPR export → delete account
- `pnpm test:security` runs custom suite hammering SSRF, rate limits, audit log completeness
