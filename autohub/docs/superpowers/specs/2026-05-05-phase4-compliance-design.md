# Phase 4 — Compliance & Trust & Safety Design

**Date:** 2026-05-05
**Status:** Approved
**Scope:** AutoHub API (`apps/api`) + Web (`apps/web`) + Policy docs (`docs/policies/`)

---

## 1. Context

Phase 3 delivered: Pino + BetterStack structured logging, Railway Redis rate limiting, Zod strict validation, KeyProvider interface, per-tool circuit breaker.

Phase 4 builds the compliance and trust layer on top of that foundation. It is entirely additive — no existing routes, middleware, or schema tables are modified except for enum extensions and the addition of three new tables.

**Approach:** Vanta-compatible in-code compliance. Build all controls in code, structure the evidence endpoints so Vanta's automated collector can pull them when you subscribe. No Vanta subscription required to ship — the hooks are just structured correctly for future use.

**Existing controls already in place (do not rebuild):**
- GDPR Art. 17 soft-delete + email scramble (`DELETE /api/account`)
- GDPR Art. 20 data export (`GET /api/account/export`)
- GDPR Art. 17 formal erasure request (`POST /api/account/erasure-request`)
- Audit log table with PII redaction (`src/services/audit.ts`)
- Sentry error tracking + BetterStack structured logs
- SSRF guard, encrypted webhook URLs, HMAC signing
- MFA/TOTP, session revocation, Zod strict validation, security headers, rate limiting

---

## 2. Architecture

Phase 4 has three independent pillars. They share the `audit_logs` table but have no other coupling.

```
┌─────────────────────────────────────────────────────────────┐
│                     Phase 4 Pillars                         │
├──────────────────┬──────────────────┬───────────────────────┤
│   4.1 SOC 2      │  4.2 GDPR+HIPAA  │  4.3 Tool Trust       │
│   Prep           │  Completion      │  & Safety             │
├──────────────────┼──────────────────┼───────────────────────┤
│ • Retention cron │ • consent_logs   │ • webhook_domains     │
│ • /compliance/*  │   table          │   DNS TXT verify      │
│   endpoints      │ • data_subject_  │ • Review checklist    │
│ • Policy docs    │   requests table │ • Sandbox execution   │
│ • Vanta hooks    │ • PHI redaction  │ • Creator reputation  │
│                  │ • BAA template   │                       │
└──────────────────┴──────────────────┴───────────────────────┘
                            │
              audit_logs (already live)
              BetterStack structured logs (already live)
              Sentry error tracking (already live)
```

**New DB migration:** `0007` — adds `consent_logs`, `data_subject_requests`, `webhook_domains` tables; extends `tool_usages.status` and `executions.status` enums with `"sandbox"`.

---

## 3. Pillar 4.1 — SOC 2 Type II Prep

### 3.1 Data Retention & Purge

**Retention policy (authoritative — code and docs must match exactly):**

| Data class | Retention period | Action |
|---|---|---|
| `audit_logs` | 7 years | Never deleted — archive to cold storage in future |
| `sessions` (revoked, `revokedAt IS NOT NULL`) | 90 days | Hard delete |
| `tool_usages` (soft-deleted, `deletedAt IS NOT NULL`) | 2 years | Hard delete |
| `executions` (soft-deleted, `deletedAt IS NOT NULL`) | 2 years | Hard delete |
| `webhook_execution_log` | 1 year | Hard delete |
| `password_reset_tokens` (used or expired) | 30 days | Hard delete |
| `email_verification_tokens` (used or expired) | 30 days | Hard delete |

**Implementation:**
- `apps/api/src/services/retention.ts` — exports `runRetentionPurge(): Promise<RetentionResult>`. Executes each purge as a single SQL `DELETE WHERE` with a date cutoff. Returns per-table row counts.
- `apps/api/src/scripts/retention-cron.ts` — standalone Node.js script (not an in-process `setInterval`). Runs as a Railway Cron Job nightly at **02:00 UTC**. Calls `runRetentionPurge()`, writes a `system.retention_purge` audit event with the result counts, exits.
- Railway Cron Job config: separate service in `sunny-compassion` project, command `node dist/scripts/retention-cron.js`, schedule `0 2 * * *`.

**Why Railway Cron Job (not in-process):** produces an independent log stream Vanta can reference as evidence; runs regardless of API instance restarts; aligns with SOC 2 CC6.5 (disposal of data).

### 3.2 Compliance Evidence Endpoints

All endpoints at `/api/admin/compliance/*`. Require `requireAuth` + `requireAdmin`. Rate-limited at 10 req/min.

**Vanta alternative auth:** if `Authorization: Bearer <VANTA_API_KEY>` header matches `process.env.VANTA_API_KEY` (when set), skip JWT check. When `VANTA_API_KEY` is unset, admin JWT is the only accepted credential. This allows Vanta's automated collector to pull evidence without a human session.

| Endpoint | Query params | Returns | SOC 2 control |
|---|---|---|---|
| `GET /api/admin/compliance/audit-log` | `from`, `to` (ISO dates), `page`, `limit` | Paginated audit_logs rows | CC6.1 Logical access |
| `GET /api/admin/compliance/users` | — | Users with role, MFA status, `lastActiveAt` | CC6.2 User provisioning |
| `GET /api/admin/compliance/retention-runs` | `limit` | Last N `system.retention_purge` audit events | CC6.5 Data disposal |
| `GET /api/admin/compliance/active-sessions` | — | Active session count per user, total count | CC6.3 Session management |

`lastActiveAt` for the users endpoint is derived from the most recent `sessions.createdAt` for that user — no new column needed.

### 3.3 Policy Documents

Committed to `docs/policies/` as Markdown, versioned with the codebase. Each doc references the actual code control it describes so they stay in sync.

| File | SOC 2 criterion | Content |
|---|---|---|
| `access-control.md` | CC6.1, CC6.2 | RBAC hierarchy, admin provisioning, MFA requirement, session timeout |
| `data-retention.md` | CC6.5 | Retention periods table (exact copy of §3.1 above), purge schedule |
| `incident-response.md` | CC7.3 | Sentry alert → triage → postmortem SLA (P1: 1h, P2: 4h, P3: 24h) |
| `change-management.md` | CC8.1 | GitHub PR required, Railway auto-deploy on merge to main, no direct DB access in prod |
| `vendor-management.md` | CC9.2 | Sub-processors: Railway, Vercel, Stripe, Resend, BetterStack, Sentry — with data category each handles |
| `encryption-at-rest.md` | CC6.7 | Railway Postgres AES-256 at rest attestation, AES-256-GCM for webhook URLs via `crypto.ts`, KeyProvider rotation path |

### 3.4 Vanta Environment Variable

Add `VANTA_API_KEY` to Railway env vars. Set to empty string now; populated when Vanta subscription is activated. The compliance endpoints already handle it — no code change needed at that point.

---

## 4. Pillar 4.2 — GDPR Completion + HIPAA Eligibility

### 4.1 Consent Logging

**New table: `consent_logs`** — append-only, no updates or deletes ever.

```
consent_logs
├── id              uuid, pk, defaultRandom()
├── user_id         uuid, → users.id ON DELETE CASCADE
├── consent_type    text enum: "terms" | "privacy" | "marketing" | "data_processing"
├── consent_version text  (policy version date string e.g. "2026-05-01")
├── granted         boolean
├── ip_address      text, nullable
├── user_agent      text, nullable
└── created_at      timestamp with timezone, defaultNow()
```

**When written:**
- **Signup** (`POST /api/auth/register`): automatically log `terms`, `privacy`, `data_processing` with `granted = true`, `consent_version = CURRENT_POLICY_VERSION` constant (defined in `packages/shared/src/constants.ts`).
- **Marketing opt-in/out** (`POST /api/account/consent`): log `marketing` with `granted = true/false`.
- **Policy version change**: update `CURRENT_POLICY_VERSION` constant → on next login, if user has no consent log for the new version, force a re-consent modal before dashboard access.

**New endpoints:**
- `POST /api/account/consent` — body: `{ consentType, granted }`. Logs consent event. Used by settings page marketing toggle and policy re-consent modal.
- `GET /api/account/consent` — returns user's full consent history. Included in GDPR data export.

**Policy version constant:** `CURRENT_POLICY_VERSION = "2026-05-01"` in `packages/shared/src/constants.ts`. Bump this string when policies change — triggers re-consent flow automatically.

### 4.2 DSAR Admin Workflow

**New table: `data_subject_requests`**

```
data_subject_requests
├── id               uuid, pk, defaultRandom()
├── user_id          uuid, → users.id ON DELETE CASCADE
├── request_type     text enum: "access" | "erasure" | "portability" | "rectification"
├── status           text enum: "pending" | "in_progress" | "completed" | "rejected"
├── request_notes    text, nullable  (user's free-text reason)
├── resolution_notes text, nullable  (admin's resolution notes)
├── due_date         timestamp with timezone  (created_at + 30 days)
├── resolved_by      uuid, → users.id ON DELETE SET NULL, nullable
├── resolved_at      timestamp with timezone, nullable
└── created_at       timestamp with timezone, defaultNow()
```

**API changes:**
- `POST /api/account/dsar` — replaces `/api/account/erasure-request` (old route kept as 301 redirect for backwards compat). Body: `{ requestType, notes? }`. Creates `data_subject_requests` row + `gdpr.dsar_submitted` audit event.
- `GET /api/admin/compliance/dsar` — admin only. Query: `status`, `page`, `limit`. Returns DSARs ordered by `due_date ASC` (most urgent first).
- `PATCH /api/admin/compliance/dsar/:id` — admin only. Body: `{ status, resolutionNotes }`. Updates status, sets `resolved_by`, `resolved_at`. Logs `gdpr.dsar_resolved` audit event.

**Admin UI:** new "DSARs" tab in `/admin` page alongside existing "Tool Approvals", "Manage Tools", "User Management" tabs.
- Table columns: User email, Request type, Submitted date, Due date, Status badge, Action button
- Due date coloring: >25 days elapsed → amber badge, >30 days → red badge + "OVERDUE" label
- Resolve action: opens a sheet with status dropdown + resolution notes textarea

### 4.3 PHI Field Tagging

AutoHub is not a healthcare app, but HIPAA eligibility requires that if tool creators collect health data, it is never logged in plaintext.

**`inputFields` item schema extension** (in `packages/shared/src/validators.ts`):

```typescript
const InputFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "select", "boolean"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  isPhi: z.boolean().optional(),  // NEW — marks field as Protected Health Information
});
```

**In `ToolExecutionService.execute()`:** before inserting `tool_usages.inputData`, apply `redactPhiFields(inputs, tool.inputFields)` — strips any key where the corresponding `inputFields` entry has `isPhi: true`. Identical pattern to `redactPII()` in `audit.ts`. Raw PHI inputs are never persisted.

**In tool submission form** (`/tools/new`): each input field row gains a "PHI" checkbox with tooltip: "Check if this field may contain Protected Health Information (e.g. diagnosis, medication, patient ID)."

### 4.4 BAA Template + Encryption Attestation

**`docs/baa-template.md`** — HIPAA Business Associate Agreement template covering:
- Permitted uses and disclosures of PHI
- Safeguards: TLS 1.2+ in transit, AES-256 at rest (Railway managed Postgres)
- Breach notification: within 60 days of discovery
- Sub-processors who may handle PHI: Railway (DB), Vercel (web serving)
- Term and termination

Fill in `[CUSTOMER NAME]` and `[DATE]` when a customer requests a BAA. Sign and exchange via DocuSign or equivalent.

**`docs/policies/encryption-at-rest.md`** — attestation: Railway Postgres uses AES-256 encryption at rest. Webhook URLs and auth headers use AES-256-GCM via `crypto.ts`. References the `KeyProvider` interface from Phase 3 for rotation path.

---

## 5. Pillar 4.3 — Tool Creator Trust & Safety

### 5.1 Webhook Domain Registry (DNS TXT Verification)

**Why:** SSRF guard (Phase 3) blocks private IPs but accepts any public HTTPS domain. A positive domain registry adds trust — only verified domains can have approved tools. Same model used by Stripe, Twilio, Sendgrid.

**New table: `webhook_domains`**

```
webhook_domains
├── id                  uuid, pk, defaultRandom()
├── domain              text, unique  (root domain only, e.g. "mycompany.com")
├── owner_user_id       uuid, → users.id ON DELETE CASCADE
├── verification_token  text  (random 32-byte hex stored in plaintext — not sensitive, just random)
├── status              text enum: "pending" | "verified" | "rejected"
├── verified_at         timestamp with timezone, nullable
└── created_at          timestamp with timezone, defaultNow()
```

**Verification flow:**
1. Creator submits tool with `webhookUrl: https://api.mycompany.com/hook`
2. `POST /api/tools` extracts root domain (`mycompany.com`), upserts a `webhook_domains` row with status `pending` and a `crypto.randomBytes(32).toString('hex')` token
3. Response includes: `{ webhookDomainId, verificationToken, dnsRecord: "_autohub.mycompany.com TXT autohub-verify=<token>" }`
4. Creator adds the TXT record to their DNS
5. Creator calls `POST /api/tools/domains/:id/verify` → server does `dns.resolveTxt('_autohub.mycompany.com')`, checks token presence
6. On success: `webhook_domains.status = "verified"`, `verified_at = now()`, `gdpr.domain_verified` audit event
7. Tool can only be submitted for approval once its domain is verified

**Bypass:** tools submitted by `role === "admin"` skip domain verification entirely. Existing approved tools are grandfathered.

**Expiry:** `POST /api/tools/domains/:id/verify` returns 400 if domain was created >7 days ago and is still pending — creator must re-register.

**New endpoints:**
- `POST /api/tools/domains` — register a domain, get verification instructions
- `POST /api/tools/domains/:id/verify` — trigger DNS TXT check
- `GET /api/tools/domains` — list current user's domains + status

### 5.2 Structured Review Checklist

**Why:** `PATCH /api/admin/tools/:id/status` currently accepts approve/reject with no required evidence. SOC 2 CC6.6 (restriction of access) and audit consistency require a documented review.

**Change to `PATCH /api/admin/tools/:id/status`:** body now requires `reviewChecklist` when `status === "approved"`:

```typescript
const ReviewChecklist = z.object({
  webhookDomainVerified: z.literal(true),
  noPersonalDataCollected: z.literal(true),
  outputTypeAppropriate: z.literal(true),
  creditCostReasonable: z.literal(true),
  descriptionAccurate: z.literal(true),
  noMaliciousInputFields: z.literal(true),
});
```

All six items must be `true` to approve — Zod `z.literal(true)` enforces this server-side. Rejection only requires `reason` text (no checklist).

Checklist stored in audit log `metadata.checklist` — not a new table. Auditors can query `audit_logs WHERE action = 'admin.tool.approved'` and see the checklist for every approval.

**Admin UI:** tool approval card gains a checklist panel. "Approve" button is disabled until all six checkboxes are checked. Each checkbox has a tooltip explaining what to verify.

### 5.3 Sandbox Execution

**New endpoint:** `POST /api/tools/:id/sandbox`

**Behaviour:**
- Credits: never deducted regardless of user role
- Webhook: called with `X-Autohub-Sandbox: true` header (creator's server can branch on this)
- Logging: creates `tool_usages` row with `status = "sandbox"` — excluded from public usage stats
- Access: only tool's `createdByUserId` and admins can call this endpoint (403 otherwise)
- Rate limit: 10 sandbox executions per user per tool per hour (Redis sliding window, same pattern as existing rate limiter)
- Execution: reuses `ToolExecutionService` internal webhook calling logic, not a new code path

**Schema change:** `tool_usages.status` enum adds `"sandbox"`. `executions.status` enum adds `"sandbox"`. New migration `0007` handles both.

**No new webhook infrastructure** — sandbox hits the real webhook URL with the sandbox header. Creator is responsible for their server handling it. Identical to Stripe's test mode model.

### 5.4 Creator Reputation (Computed)

Read-only signal for admins during tool review. Computed on the fly in `GET /api/admin/tools` response — no stored column.

```typescript
interface CreatorReputation {
  toolsApproved: number;
  toolsRejected: number;
  totalExecutions: number;
  webhookSuccessRate: number;  // 0.0–1.0
  circuitBreakerTrips: number;
}
```

Derived from existing tables: `ai_tools` (approved/rejected counts), `tool_usages` (execution count), `webhook_execution_log` (success rate), `audit_logs WHERE action = 'circuit_breaker.opened'` (trips).

No automatic blocking — admins use this as a signal, not a gate.

---

## 6. Database Migration 0007

Single migration file: `apps/api/src/db/migrations/0007_compliance.sql`

```sql
-- consent_logs
CREATE TABLE consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms','privacy','marketing','data_processing')),
  consent_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consent_logs_user_id_idx ON consent_logs(user_id);

-- data_subject_requests
CREATE TABLE data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('access','erasure','portability','rectification')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','rejected')),
  request_notes TEXT,
  resolution_notes TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX dsar_status_due_idx ON data_subject_requests(status, due_date);

-- webhook_domains
CREATE TABLE webhook_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX webhook_domains_owner_idx ON webhook_domains(owner_user_id);

-- Extend tool_usages.status enum
ALTER TYPE tool_usages_status ADD VALUE IF NOT EXISTS 'sandbox';

-- Extend executions.status enum
ALTER TYPE execution_status ADD VALUE IF NOT EXISTS 'sandbox';
```

---

## 7. New Files Summary

### API (`apps/api/src/`)
| File | Purpose |
|---|---|
| `routes/compliance.ts` | `/api/admin/compliance/*` evidence endpoints + DSAR admin endpoints |
| `services/retention.ts` | `runRetentionPurge()` — per-table delete logic, returns row counts |
| `scripts/retention-cron.ts` | Standalone cron script — calls retention service, logs audit event, exits |
| `db/migrations/0007_compliance.sql` | New tables + enum extensions |

### Web (`apps/web/src/`)
| File | Purpose |
|---|---|
| `app/(dashboard)/admin/compliance/page.tsx` | DSAR queue with due-date coloring and resolve action |
| `components/admin/DsarQueue.tsx` | DSAR table component |
| `components/admin/ToolReviewChecklist.tsx` | Checklist panel for tool approval |

### Docs (`docs/`)
| File | Purpose |
|---|---|
| `policies/access-control.md` | SOC 2 CC6.1/CC6.2 |
| `policies/data-retention.md` | SOC 2 CC6.5 |
| `policies/incident-response.md` | SOC 2 CC7.3 |
| `policies/change-management.md` | SOC 2 CC8.1 |
| `policies/vendor-management.md` | SOC 2 CC9.2 |
| `policies/encryption-at-rest.md` | SOC 2 CC6.7 / HIPAA |
| `baa-template.md` | HIPAA BAA template |
| `superpowers/specs/2026-05-05-phase4-compliance-design.md` | This document |

---

## 8. What Is Explicitly Out of Scope

- Automated SOC 2 audit (requires Vanta subscription — hooks are ready, subscription is a business decision)
- HIPAA certification (requires formal assessment — BAA template + PHI redaction are the technical prerequisites)
- Cookie consent banner (frontend-only, outside this sprint's API-first scope)
- Org/team features (Phase 6)
- Admin analytics charts (Phase 6)
- Payment subscription credit refresh (Phase 5)

---

## 9. Testing

### Unit tests (Vitest)
- `retention.ts` — mock DB, assert correct rows deleted per table, assert counts returned
- `compliance.ts` — assert Vanta API key auth path, assert admin JWT path, assert 403 for non-admins
- Domain verify endpoint — mock `dns.resolveTxt`, assert success/failure paths
- Sandbox endpoint — assert credits not deducted, assert access control

### Integration tests
- Full DSAR flow: submit → admin lists → admin resolves → audit log contains both events
- Consent log: signup writes 3 consent rows, export includes them

### Manual verification
- Run retention cron locally, verify `system.retention_purge` audit event written
- DNS verification: test with a real domain or mock `dns.resolveTxt` in test env
- Sandbox: execute tool in sandbox, verify `tool_usages.status = 'sandbox'`, verify credits unchanged
