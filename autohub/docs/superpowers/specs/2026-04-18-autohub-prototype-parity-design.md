# AutoHub Prototype Parity — Design Spec

**Date:** 2026-04-18
**Status:** Proposed
**Supersedes:** N/A

## 1. Context

AutoHub is a webhook aggregator for automation workflows. Users build automations in n8n (or comparable tools like Zapier/Make) that expose an HTTP webhook. In AutoHub, a **moderator** registers that webhook URL as a **Tool**. End users then execute the tool from the AutoHub dashboard, AutoHub proxies the call to n8n, n8n runs the workflow, and the result flows back. Execution is billed against the user's credit wallet.

A Lovable-generated prototype (`Ai_agent_wallet/`) exists as the reference product. Most functionality has already been ported into the `autohub/` monorepo (Next.js web + Hono/Drizzle API + shared package), but a gap audit identified missing functional pieces and a large visual-parity gap.

This spec covers what needs to be built in `autohub/` to reach feature and visual parity with the prototype, adapted for the webhook-aggregator product model.

## 2. Goals

- Reach visual parity with the prototype's landing experience (hero, features page, marketing polish).
- Close remaining functional gaps: password reset, admin component extraction, tool-suggestion submission flow.
- Establish a production-grade webhook proxy with industry-standard async callback security.
- Formalize the three-tier RBAC model (user / moderator / admin) in schema, middleware, and UI.

## 3. Non-Goals

- Group/workspace-based access control (deferred; per-user grants only in v1).
- A dedicated "prototype-quality" refactor of every dashboard component — only the hero/landing/features surface area and the admin extraction.
- Migration of Supabase Edge Function code verbatim. Logic is reimplemented idiomatically in Hono.
- Multi-provider webhook support (Zapier/Make). v1 targets any HTTP webhook but test against n8n.
- Group billing, team accounts, or credit transfers.

## 4. Product Model

### 4.1 Roles (three-tier RBAC)

| Role | Can do |
|---|---|
| **User** | Browse approved public tools; run tools they have access to; view own usage/credits; purchase credits; manage own profile. |
| **Moderator** | All user capabilities + create/edit tools; toggle enable/disable; set public/private; grant per-user access to private tools; submit tools for admin approval. |
| **Admin** | All moderator capabilities + approve/reject submitted tools; promote/demote users to moderator; remove users; infinite credits (execution never debits). |

Role is a single enum on the user record — users hold exactly one role at a time. Stored as `role: "user" | "moderator" | "admin"`.

### 4.2 Tool lifecycle

```
draft ──submit──▶ pending_approval ──approve──▶ approved (enabled) ◀──▶ approved (disabled)
                       │                              │
                       └──reject──▶ rejected          └──archive──▶ archived
```

- Only `approved + enabled` tools are executable.
- Admin can archive at any time; archive hides the tool but preserves history.
- Rejected tools return to draft for the moderator to edit and resubmit.

### 4.3 Tool visibility

- **Private** (default on creation): visible only to the owning moderator and users listed in `tool_access`.
- **Public**: visible to all users once admin-approved. Moderator can flip private↔public; flipping to public requires re-approval.

### 4.4 Execution model

Per-tool setting `execution_mode: "sync" | "async"`.

- **Sync**: autohub POSTs to n8n and waits for the HTTP response (timeout 30s). Response body returned to client. Credits debited on 2xx.
- **Async**: autohub POSTs to n8n with a `callback_url` and `execution_id`; immediately returns `{execution_id, status: "pending"}` to client. Client polls `/executions/:id` (or subscribes via SSE). n8n POSTs the final result to the callback URL when complete. Credits debited when the callback arrives with a success status.

Admin users never have credits debited, regardless of mode.

### 4.5 Webhook callback security (industry standard)

Each tool is issued a unique **signing secret** at creation. The moderator copies it into n8n's HTTP Request node as a header. Callback requests must include:

- `X-AutoHub-Timestamp: <unix seconds>`
- `X-AutoHub-Signature: sha256=<hex HMAC>`

Where the HMAC is computed as `HMAC-SHA256(secret, "${timestamp}.${execution_id}.${raw_body}")`. Autohub rejects callbacks outside ±300s and with mismatched signatures. This matches the Stripe/GitHub/Shopify webhook-verification pattern.

Secrets are stored hashed at rest (bcrypt) and shown once at creation + on an explicit "reveal" action gated by re-auth.

## 5. Architecture

### 5.1 Track A — Visual parity

New/replaced files in `apps/web`:

- `src/app/page.tsx` — replace the stub with a composed landing page.
- `src/components/landing/Header.tsx` — sticky glass nav.
- `src/components/landing/HeroSection.tsx` — aurora background, three floating orbs (violet/pink/teal), mesh grid overlay, animated badge with `border-glow`, gradient headline, CTA pair.
- `src/components/landing/FeaturesSection.tsx` — icon-led benefit grid.
- `src/components/landing/PricingSection.tsx` — credit-pack + subscription tiers (pull from existing pricing data).
- `src/components/landing/Footer.tsx`.
- `src/app/features/page.tsx` — dedicated marketing page with API/webhook docs, RBAC explanation, rate-limit notes, code snippets.
- Apply `border-glow` utility to primary CTA buttons project-wide (via a variant on the existing `<Button>` component).
- Apply `spotlight-card` to dashboard stat cards in `src/app/(dashboard)/dashboard/page.tsx`.
- Apply `shimmer` to the existing loading skeletons.

All CSS utilities (`.orb`, `.glass`, `.border-glow`, `.aurora-bg`, `.shimmer`, gradient text, etc.) already exist in `globals.css` — this track consumes them, doesn't define new ones.

### 5.2 Track B — Functional gaps

**B1. Password reset**
- `apps/api/src/routes/auth.ts` — add `POST /auth/reset/request` (emit token, email via existing mailer) and `POST /auth/reset/confirm` (validate token, set password).
- `apps/web/src/app/auth/reset-password/page.tsx` — request form.
- `apps/web/src/app/auth/reset-password/[token]/page.tsx` — confirm form.
- New table `password_reset_tokens (token_hash, user_id, expires_at, used_at)`. Tokens are single-use, 1h TTL.

**B2. Admin componentization**
Extract the monolithic `admin/page.tsx` into:
- `components/admin/UserRoleManager.tsx` — list users, change role, remove user. Wraps existing `/admin/users` endpoint.
- `components/admin/ToolApprovalManager.tsx` — queue of pending tools, approve/reject with reason. Calls `PATCH /tools/:id/status`.
- `components/admin/ToolManagement.tsx` — all-tools table with archive/unarchive, disable/enable (admin override).
- `components/admin/ToolCreationForm.tsx` — shared form used by both `/tools/new` (moderator self-serve) and admin quick-create.
- `app/(dashboard)/admin/page.tsx` becomes a tabbed shell composing the four components.

**B3. Tool submission (`suggest-tool`)**
In this product, "suggest-tool" means a moderator submits their draft for admin approval.
- `PATCH /tools/:id/submit` — moderator-only, transitions `draft → pending_approval`.
- `PATCH /tools/:id/status` — admin-only, accepts `{status: "approved" | "rejected", reason?}`. On approve, enables the tool.
- UI: a "Submit for Approval" button on the tool edit page; status badge on tool cards; admin sees a pending queue.
- No LLM involved. Name retained for spec-audit traceability only; in code it's `submitForApproval` / `reviewSubmission`.

**B4. Webhook proxy service**
New `apps/api/src/services/webhook-proxy.ts` owning:
- Outbound call to the tool's n8n URL (POST, configurable headers, 30s timeout, no retries by default — retries are n8n's job).
- Request signing header (`X-AutoHub-Signature` on outbound, so n8n can verify autohub).
- Async path: generates `execution_id`, persists `executions` row with `status=pending`, includes `callback_url` in payload.
- Callback receiver route `POST /executions/:id/callback` verifies HMAC + timestamp, updates row, debits credits on success, publishes to SSE channel for UI streaming.
- Uses the existing `ToolExecutionService` for the credit two-phase commit — webhook-proxy is the transport layer, tool-execution is the domain layer.

**B5. Private-tool access grants**
- New table `tool_access (tool_id, user_id, granted_by, granted_at)`, unique on `(tool_id, user_id)`.
- Moderator UI on tool edit page: "Share with user" search + chip list.
- Visibility rule: a user can see a tool iff `tool.visibility = public AND tool.status = approved AND tool.enabled` **OR** `tool.owner_id = me` **OR** exists `tool_access(tool_id, me)`.

### 5.3 Data model changes (Drizzle)

```
users: + role enum ('user','moderator','admin') default 'user'

tools: + owner_id (fk users)
       + visibility enum ('private','public') default 'private'
       + status enum ('draft','pending_approval','approved','rejected','archived') default 'draft'
       + enabled boolean default true
       + execution_mode enum ('sync','async') default 'sync'
       + webhook_url text
       + signing_secret_hash text
       + rejection_reason text nullable

tool_access: tool_id, user_id, granted_by, granted_at   (composite pk)

executions: id, tool_id, user_id, status ('pending','success','failed','timeout'),
            request_payload jsonb, response_payload jsonb, error text,
            started_at, completed_at, credits_debited int

password_reset_tokens: token_hash pk, user_id fk, expires_at, used_at nullable
```

Migrations are additive; existing `tools` rows backfill: `owner_id = first admin`, `visibility = public`, `status = approved`, `execution_mode = sync`.

### 5.4 Middleware & authorization

`apps/api/src/middleware/rbac.ts` exposes `requireRole("moderator" | "admin")` and `requireToolAccess(toolId)`. Applied per-route. Admin role always short-circuits to true. Credit-deduction helper checks role and skips debit for admins.

## 6. Error handling

- **Webhook timeout (sync)** → execution marked `timeout`, no credit debit, user sees retry option.
- **Webhook 4xx/5xx** → execution marked `failed`, no credit debit, error body surfaced to user (sanitized).
- **Callback with bad signature** → 401, logged, never mutates execution.
- **Callback after execution already terminal** → 409 idempotent-replay, swallowed.
- **Callback for unknown execution_id** → 404.
- **Insufficient credits** → 402 before the outbound POST; no n8n call made.
- **Admin executing** → credits branch short-circuits; execution still logged with `credits_debited = 0`.

## 7. Testing

- Unit: HMAC sign/verify, timestamp replay window, RBAC middleware, tool-visibility predicate.
- Integration (against real Postgres): tool lifecycle transitions, access-grant visibility, credit debit on success path, admin bypass.
- E2E (Playwright, already configured): moderator creates tool → admin approves → user runs tool (sync) → credits decrement; async path with a stubbed n8n that posts a callback.

No mocked DB for integration tests — existing pattern uses a real Postgres instance.

## 8. Scope boundaries (cut from original audit)

- `useToolUsages`, `useFavorites`, `useKeyboardShortcuts` as standalone hooks — **not in scope**. Current inlined/consolidated versions work; extracting is polish, not a gap.
- Proxy-webhook retry logic — **deferred**. n8n owns retry semantics on its side.
- LLM-based tool suggestion — **out of scope** (product model doesn't need it).

## 9. Open questions

None blocking. Resolved during brainstorming:
- Async auth → per-tool HMAC signing secret.
- Access grants → per-user only; no groups in v1.
- Admin credits → infinite / bypass.
