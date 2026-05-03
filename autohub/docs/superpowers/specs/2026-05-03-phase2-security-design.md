# AutoHub Security Phase 2 — Design Spec

**Date:** 2026-05-03  
**Scope:** GDPR + Account Hardening (tasks 2.1–2.4)  
**Execution order:** 2.4 → 2.3 → 2.1 → 2.2

---

## Context

Phase 1 closed breach-class vulnerabilities (SSRF, encryption, audit logging, headers, password policy). Phase 2 adds GDPR compliance, session control, email verification, and MFA — the features needed before opening the marketplace to the public.

Stack: Hono API (Railway), Next.js 15 + NextAuth v5 (Vercel), Drizzle + Railway Postgres, Resend for email, `otplib` for TOTP.

---

## Task 2.4 — Email Verification

### Goal
Block tool execution and payments for unverified accounts. Verified at signup via a time-limited link.

### Schema addition (users table)
```sql
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
```

New table:
```sql
CREATE TABLE email_verification_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
```

### Flow
1. On `POST /auth/register` — insert token (24h TTL), send verification email via Resend, return `{ requiresVerification: true }` alongside the token.
2. `GET /api/auth/verify-email?token=<raw>` — hash-compare against `email_verification_tokens`, set `email_verified_at = now()`, redirect to `/dashboard?verified=true`.
3. `POST /api/auth/resend-verification` (auth required) — rate-limited to 1 send/5min per user, re-sends if `email_verified_at IS NULL`.

### Enforcement
- `requireVerified` Hono middleware: checks `emailVerified` boolean claim on the JWT (set at login time, refreshed after verification). No extra DB read per request. Returns `403 { error: "email_not_verified" }` for:
  - `POST /api/tools/:id/execute`
  - Stripe checkout endpoints
- Unverified users can browse tools and dashboard but cannot execute or pay.
- JWT gains `emailVerified: boolean` claim, refreshed on verification.

### Email template
Plain-text + HTML via Resend. Subject: "Verify your AutoHub email". Single CTA button → verification URL. From: `noreply@autohub.app` (or `RESEND_FROM_EMAIL` env var).

### Env vars added
- `RESEND_API_KEY` — Railway secret
- `RESEND_FROM_EMAIL` — default `noreply@autohub.app`

---

## Task 2.3 — Session Revocation

### Goal
Allow users to revoke specific sessions (e.g., after a device is lost). Reduce JWT TTL from 7d → 1d. Revoke all sessions on password change.

### Schema addition
New table:
```sql
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti   text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  user_agent  text,
  ip          text
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_jti_idx ON sessions(token_jti);
```

### JWT changes
- Add `jti` (UUID v4) claim to every issued token (`register`, `login`).
- Reduce `expiresIn` from `"7d"` → `"1d"`.
- Insert a row into `sessions` on every token issuance.

### Middleware change (`middleware/auth.ts`)
After `jwt.verify()` succeeds, check `sessions` table: `SELECT revoked_at FROM sessions WHERE token_jti = $jti`. If `revoked_at IS NOT NULL` → 401. This is one extra indexed DB read per request — acceptable at current scale (add Redis in Phase 3 if needed).

### New routes (`routes/auth.ts`)
- `GET /api/auth/sessions` — list user's active sessions (id, createdAt, userAgent, ip, current flag).
- `DELETE /api/auth/sessions/:id` — revoke a specific session by id (must belong to calling user).
- `DELETE /api/auth/sessions` — revoke ALL sessions for user (used after password change and on logout-everywhere).

### Password change integration
`PATCH /auth/password` existing handler: after successful hash update, call `revokeAllSessions(userId)` so all other devices are logged out.

### NextAuth integration
No NextAuth changes needed — NextAuth holds the JWT client-side. On next API call with a revoked `jti`, the API returns 401, NextAuth's `signOut()` is called from the web app's global error handler.

---

## Task 2.1 — Soft Deletes + GDPR Endpoints

### Goal
Never hard-delete user data. Provide GDPR Art. 17 erasure and Art. 20 data export.

### Schema additions
```sql
ALTER TABLE users       ADD COLUMN deleted_at timestamptz;
ALTER TABLE ai_tools    ADD COLUMN deleted_at timestamptz;
ALTER TABLE executions  ADD COLUMN deleted_at timestamptz;
ALTER TABLE tool_usages ADD COLUMN deleted_at timestamptz;
ALTER TABLE payments    ADD COLUMN deleted_at timestamptz;
```

### Query site updates (26 sites across 7 files)
Add `isNull(table.deletedAt)` to every `.where()` clause that reads from these tables. Files affected:
- `routes/admin.ts` — 4 sites
- `routes/auth.ts` — 4 sites
- `routes/tools.ts` — 10 sites
- `routes/executions.ts` — 3 sites
- `routes/webhooks.ts` — 2 sites
- `services/tool-execution.ts` — 1 site
- `services/webhook-proxy.ts` — 1 site
- `index.ts` — 1 site (seed route user lookup)

Existing `isActive` checks are retained — `deletedAt` is an additional filter, not a replacement.

### Account deletion (`DELETE /api/account`)
Soft-delete cascade in application code:
1. Set `users.deletedAt = now()`, anonymize: `email = deleted_<uuid>@deleted`, `fullName = null`, `passwordHash = ''`.
2. Set `deletedAt = now()` on all user's `aiTools`, `executions`, `toolUsages`.
3. Retain `payments` rows undeleted (legal requirement, 7-year retention).
4. Revoke all sessions.
5. Audit-log `account.deleted`.

**Do not** use DB `ON DELETE CASCADE` — application-level cascade gives us control over what gets retained.

### Data export (`GET /api/account/export`)
Synchronous JSON response (no async job needed at this scale):
```json
{
  "exportedAt": "...",
  "user": { "id", "email", "fullName", "createdAt" },
  "toolUsages": [...],
  "payments": [...],
  "executions": [...]
}
```
Strip: `passwordHash`, `stripeCustomerId`, any `*Encrypted` fields, `*Hash` fields.
Auth required. Rate-limited: 1 export/hour per user.

### GDPR erasure request (`POST /api/account/erasure-request`)
Inserts an `audit_log` row with `action: "gdpr.erasure_requested"`. Manual admin review via the admin panel. Does not immediately delete — logs the formal Art. 17 request for compliance paper trail.

### New route file
`apps/api/src/routes/account.ts` — mounted at `/api/account`.

---

## Task 2.2 — MFA / TOTP

### Goal
TOTP-based MFA using `otplib`. Required for admin/moderator roles, optional for users.

### Schema additions (users table)
```sql
ALTER TABLE users ADD COLUMN mfa_secret_encrypted text;
ALTER TABLE users ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false;
```

New table:
```sql
CREATE TABLE mfa_backup_codes (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,   -- bcrypt(10) of 8-char alphanumeric code
  used_at  timestamptz
);
```

### MFA enrollment flow (API)
1. `POST /api/auth/mfa/setup` — generates TOTP secret via `otplib`, encrypts with `crypto.ts`, stores in `mfa_secret_encrypted`, returns `{ otpauthUrl, secret }` (secret shown once for manual entry).
2. `POST /api/auth/mfa/verify-setup` — verifies submitted TOTP code against stored secret. On success: sets `mfa_enabled = true`, generates 10 backup codes (random 8-char), bcrypt(10)-hashes each, stores in `mfa_backup_codes`, returns plaintext codes (shown once).
3. `POST /api/auth/mfa/disable` — requires current TOTP or backup code + password re-confirmation. Sets `mfa_enabled = false`, nulls `mfa_secret_encrypted`, deletes backup codes. Audit-logged.

### Login step-up (NextAuth + API)
The existing login flow (`POST /api/auth/login`) is extended:
- If `mfaEnabled = true`: return `{ mfaRequired: true, mfaToken: <short-lived 5min JWT with claim type:"mfa_pending", userId> }` instead of full token.
- New endpoint `POST /api/auth/mfa/challenge`: accepts `{ mfaToken, code }`. Verifies TOTP or backup code. On success: issues full JWT, marks session.
- NextAuth `authorize()` callback: detects `mfaRequired: true` → returns special user object with `mfaPending: true`. Subsequent page redirects to `/auth/mfa` challenge page.
- `/auth/mfa` page submits code → calls `/api/auth/mfa/challenge` → on success calls `signIn` again with the full token to complete session.

### Force MFA for privileged roles
`requireAuth` middleware: if `user.role` is `admin` or `moderator` AND `mfaEnabled = false` → `403 { error: "mfa_required_for_role" }`. Redirects to MFA enrollment page.

### Web UI
- Settings page tab: "Security" — shows MFA status, enroll/disable button.
- QR code rendered client-side using `qrcode` npm package (web dep only).
- `/auth/mfa` challenge page: code input, "Use backup code" toggle.

### Dependencies added
- `otplib` — API (TOTP generation/verification)
- `resend` — API (email sending, tasks 2.4 + 2.3 notifications)
- `qrcode` + `@types/qrcode` — Web (QR rendering)

---

## Migration Plan

Single Drizzle migration `0005_phase2_security.sql` covering all schema changes above. Applied at deploy time via existing `migrate.js` startup hook.

**No data backfill needed** — all new columns are nullable or have safe defaults.

---

## Env Vars Required (add to Railway before deploy)

| Var | Where | Purpose |
|-----|-------|---------|
| `RESEND_API_KEY` | Railway | Email sending |
| `RESEND_FROM_EMAIL` | Railway | Sender address (default: `noreply@autohub.app`) |

`ENCRYPTION_KEY` already set from Phase 1 — used for `mfa_secret_encrypted`.

---

## Verification Checklist

- [ ] Sign up → receive verification email → click link → `email_verified_at` set in DB
- [ ] Unverified user attempts tool execution → 403 `email_not_verified`
- [ ] Login on two browsers → revoke session A from settings → next API call from A returns 401
- [ ] Password change → all other sessions revoked automatically
- [ ] `GET /api/account/export` returns all user data, no PII fields (`passwordHash`, encrypted cols)
- [ ] `DELETE /api/account` soft-deletes user, anonymizes email, retains payments
- [ ] Enroll MFA → scan QR → log out → log back in → TOTP challenge shown → success
- [ ] Admin without MFA → `403 mfa_required_for_role` on any API call
- [ ] Use backup code on MFA challenge → code marked used, cannot be reused
