# AutoHub Phase 5 & 6 Design Spec

**Date:** 2026-05-06
**Status:** Approved
**Scope:** Phase 5 (Stripe fixes) + Phase 6A/6B/6C (creator portal, onboarding, analytics)

---

## Phase 5 — Stripe Payment Fixes

### 5A: Subscription Credit Refresh (`invoice.paid`)

**Problem:** Pro subscribers' credits are never refreshed on monthly renewal because `invoice.paid` is not handled.

**Solution:** Add `invoice.paid` case to `apps/api/src/routes/webhooks.ts`. This event is the sole owner of subscription credit grants (both initial and renewals). `checkout.session.completed` handles only one-time credit purchases.

**New DB table:** `subscription_invoices`
```sql
CREATE TABLE subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,  -- idempotency key
  amount_cents INTEGER NOT NULL,
  credits_granted INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Webhook handler logic (`invoice.paid`):**
1. If `invoice.subscription` is null → skip (one-time payment, not a subscription)
2. Look up subscription row by `stripeSubscriptionId` → get `userId`
3. If not found or `status !== 'active'` → skip
4. Check `subscription_invoices` for `stripeInvoiceId` → if exists, return 200 (idempotent)
5. Insert `subscription_invoices` row
6. Atomic: `UPDATE credits SET current_credits = current_credits + 500 WHERE user_id = $userId`
7. `logAuditEvent("payment.subscription_renewal", ...)`

**`checkout.session.completed` update:**
- `type === "credit_purchase"` → grant credits + insert payment row (unchanged)
- `type === "subscription"` → write `stripeCustomerId` back to `users.stripe_customer_id` (if null), insert payment row with `creditsGranted: 0`. Credits come exclusively from `invoice.paid`.

**New `customer.subscription.created` handler:**
- Upsert subscription row with `status: active`, `currentPeriodStart`, `currentPeriodEnd`.

**`customer.subscription.updated` / `deleted`:**
- Status sync only.
- After upsert, backfill `users.stripe_customer_id` if null: `UPDATE users SET stripe_customer_id = $customerId WHERE id = $userId AND stripe_customer_id IS NULL`.

**New shared constant:**
```ts
// packages/shared/src/constants.ts
export const SUBSCRIPTION_MONTHLY_CREDITS = 500;
```

**Webhook events handled (complete list):**
| Event | Action |
|---|---|
| `checkout.session.completed` | One-time purchase → grant credits. Subscription → store stripeCustomerId, payment row (0 credits). |
| `customer.subscription.created` | Upsert subscription row, status: active. |
| `invoice.paid` | Sole credit grant for subscriptions. Idempotent via subscription_invoices. |
| `customer.subscription.updated` | Status sync + stripeCustomerId backfill. |
| `customer.subscription.deleted` | Set status: canceled. |
| `invoice.payment_failed` | Set status: past_due. |

---

### 5B: Payment Portal Security Fix

**Problem:** `POST /api/payments/portal` accepts `stripeCustomerId` from the client body — any authenticated user can supply another user's customer ID.

**Fix:** Remove `stripeCustomerId` from request body entirely. Look up `users.stripeCustomerId` server-side for the authenticated user.

```ts
// Before (insecure)
const { stripeCustomerId } = await c.req.json();

// After (secure)
const [userRow] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
const stripeCustomerId = userRow?.stripeCustomerId;
if (!stripeCustomerId) return c.json({ error: "No billing account found. Please contact support." }, 400);
```

No schema change needed — `users.stripeCustomerId` already exists.

---

## Phase 6A — Creator Portal Enhancements

### New API Endpoints

**`PATCH /api/tools/:id`** — Edit tool, owner or admin only.
- Validates same fields as `POST /api/tools`
- SSRF-validates new webhook URL if provided
- Encrypts new webhook URL / auth header
- If tool is currently `approved`, resets `toolStatus` to `draft` and `approvalStatus` to `pending`, `isActive` to `false` (re-enters approval queue)
- Returns updated tool (sanitized)

**`DELETE /api/tools/:id`** — Soft-delete, owner or admin only.
- Sets `deletedAt = now()`
- Returns 204

### Frontend Changes

**`/tools/new` (page.tsx):**
- On page load, fetch `GET /api/tools/domains` — if no verified domain exists, show a persistent yellow callout: "You'll need a verified webhook domain before your tool can be submitted. [Verify domain →]" linking to a modal.
- Domain verification modal: input for webhook URL → `POST /api/tools/domains` → show DNS TXT record → "Check verification" button → `POST /api/tools/domains/:id/verify` → on success, dismiss modal and enable submit.
- No change to the form submission flow itself.

**`/tools/[id]/edit` (new page):**
- Full-page form mirroring `/tools/new`, pre-populated with existing tool data.
- On load: fetch `GET /api/tools/:id` to get current values.
- On submit: calls `PATCH /api/tools/:id`.
- Shows warning if tool is currently `approved`: "Editing will re-submit this tool for review and temporarily remove it from the marketplace."
- Owner or admin only (redirect to `/tools/mine` if neither).

**`/tools/mine` (page.tsx):**
- Each card shows `toolStatus` badge (not just `approvalStatus`).
- Rejection reason shown inline as a red callout when `toolStatus === "rejected"`.
- Per-status CTAs:
  - `draft` → "Submit for review" button (calls `PATCH /:id/submit`)
  - `pending_approval` → greyed "Under review" badge
  - `rejected` → "Edit & resubmit" link to `/tools/:id/edit`
  - `approved` → "Sandbox" button + "Edit" link
  - `archived` → "Edit" link only
- Delete: confirmation AlertDialog → `DELETE /api/tools/:id` → removes card from list.
- Sandbox: calls `POST /api/tools/:id/sandbox`, shows result in a Dialog.

---

## Phase 6B — Onboarding (Server-Side Source of Truth)

### DB Change
```sql
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;
```
Migration: `apps/api/src/db/migrations/0008_onboarding_analytics.sql`

### New API Endpoints

**`GET /api/account/me`** — Full user profile. Auth required.
```ts
// Response
{
  data: {
    id: string,
    email: string,
    fullName: string | null,
    role: string,
    currentCredits: number,
    onboardedAt: string | null,  // ISO8601 or null
    emailVerifiedAt: string | null,
    mfaEnabled: boolean,
  }
}
```
Joins `users`, `user_roles`, `credits` tables. Rate-limited at `RATE_LIMITS.READS`.

**`POST /api/account/onboarding/complete`** — Mark user as onboarded. Auth required.
- Sets `users.onboarded_at = now()` for authenticated user (idempotent — no-op if already set).
- Returns `{ data: { onboardedAt: string } }`.
- Rate-limited at 5 req/min.

### Frontend Changes

**`UserProfileContext`** — new React context in `apps/web/src/context/UserProfileContext.tsx`:
```ts
interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  currentCredits: number;
  onboardedAt: string | null;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
}
```
Fetches `GET /api/account/me` once on mount. Provides `profile`, `loading`, and `refetch` + `markOnboarded()` updater.

**`(dashboard)/layout.tsx`** — wrap children with `<UserProfileProvider>`.

**`OnboardingDialog`:**
- Replace `localStorage`-only check with: read `profile.onboardedAt` from context. If non-null → don't show.
- `localStorage` remains as write-through cache: on dismiss, write to localStorage immediately (prevents flicker on same device) AND call `POST /api/account/onboarding/complete` + call `markOnboarded()` on context.
- On new device: localStorage empty, `profile.onboardedAt` set → dialog hidden. Correct.
- On first ever login: localStorage empty, `profile.onboardedAt` null → dialog shows. Correct.

**Credits display:** Dashboard and sidebar credit count now reads from `UserProfileContext` instead of a separate credits fetch, eliminating a duplicate API call.

---

## Phase 6C — Admin Analytics Dashboard

### API Changes

**`GET /api/admin/analytics?range=7d|30d|90d`** — extended response:

```ts
{
  data: {
    summary: {
      totalUsers: number,
      totalUsages: number,
      totalRevenueCents: number,
    },
    charts: {
      dailyRevenue: Array<{ date: string, amountCents: number }>,
      dailySignups: Array<{ date: string, count: number }>,
      dailyExecutions: Array<{ date: string, count: number }>,
      activeSubscriptions: Array<{ date: string, count: number }>,
      topTools: Array<{ toolId: string, name: string, count: number }>,
    }
  }
}
```

Range defaults to `30d`. Validated with Zod: `z.enum(["7d", "30d", "90d"]).default("30d")`.

**Six parallel SQL queries (all run with `Promise.all`):**

1. **dailyRevenue** — `SELECT date_trunc('day', created_at)::date AS date, SUM(amount) AS amount_cents FROM payments WHERE status='completed' AND created_at >= now() - $interval GROUP BY 1 ORDER BY 1`

2. **dailySignups** — `SELECT date_trunc('day', created_at)::date AS date, COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND created_at >= now() - $interval GROUP BY 1 ORDER BY 1`

3. **dailyExecutions** — `SELECT date_trunc('day', created_at)::date AS date, COUNT(*) AS count FROM tool_usages WHERE deleted_at IS NULL AND created_at >= now() - $interval GROUP BY 1 ORDER BY 1`

4. **activeSubscriptions** — correlated count per day:
```sql
SELECT d::date AS date, COUNT(s.id) AS count
FROM generate_series(now() - $interval, now(), '1 day'::interval) AS d
LEFT JOIN subscriptions s
  ON s.current_period_start <= d
  AND s.current_period_end >= d
  AND s.status = 'active'
GROUP BY 1 ORDER BY 1
```

5. **topTools** —
```sql
SELECT tu.tool_id, t.name, COUNT(*) AS count
FROM tool_usages tu
JOIN ai_tools t ON t.id = tu.tool_id
WHERE tu.deleted_at IS NULL AND tu.created_at >= now() - $interval
GROUP BY tu.tool_id, t.name
ORDER BY count DESC LIMIT 5
```

Zero-fill: queries 1-3 use `generate_series` LEFT JOIN in the same pattern as query 4 to ensure every day in the range appears, even with 0 values. No missing dates in charts.

**Summary totals** remain lifetime (no range filter) — consistent with current behaviour.

### Frontend Changes

**`/admin` page:**
- Add "Analytics" tab to existing `Tabs` component (between "Manage Tools" and "User Management").
- Tab content lazy-loads: fetch only when tab first activated (`hasFetched` ref guard).
- Range selector: shadcn `ToggleGroup` with values `7d` / `30d` / `90d`. Default `30d`. Re-fetches on change.
- Five recharts components:
  - `LineChart` — Daily Revenue (Y axis in dollars, formatted from cents)
  - `LineChart` — Daily Signups
  - `LineChart` — Daily Executions
  - `LineChart` — Active Subscriptions
  - `BarChart` horizontal — Top 5 Tools by executions
- All charts use `ResponsiveContainer width="100%"` for responsiveness.
- Loading state: `Skeleton` placeholders matching chart dimensions.
- recharts already installed in `apps/web`.

---

## DB Migration Summary

Single migration file: `apps/api/src/db/migrations/0008_onboarding_analytics.sql`

```sql
-- subscription_invoices (Phase 5A idempotency)
CREATE TABLE subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  credits_granted INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscription_invoices_user_id_idx ON subscription_invoices(user_id);

-- onboarded_at (Phase 6B)
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;

-- analytics indexes (Phase 6C — query performance)
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments(created_at);
CREATE INDEX IF NOT EXISTS tool_usages_created_at_idx ON tool_usages(created_at);
CREATE INDEX IF NOT EXISTS subscriptions_period_status_idx ON subscriptions(current_period_start, current_period_end, status);
```

---

## Drizzle Schema Changes

**`subscriptionInvoices` table** — add to `schema.ts`
**`users.onboardedAt`** — add `onboardedAt: timestamp("onboarded_at", { withTimezone: true })` to users table

---

## Test Coverage

**Phase 5:**
- `webhooks.test.ts`: `invoice.paid` idempotency (same invoice ID twice → credits granted once), `invoice.paid` with missing subscription → no-op, portal endpoint rejects missing `stripeCustomerId`

**Phase 6A:**
- `tools.test.ts`: `PATCH /:id` resets approved tool to draft, `DELETE /:id` soft-deletes, non-owner gets 403

**Phase 6B:**
- `account.test.ts`: `GET /api/account/me` returns correct shape, `POST /api/account/onboarding/complete` idempotent

**Phase 6C:**
- `admin.test.ts`: analytics endpoint with `range=7d` returns correct shape, invalid range returns 400

---

## Files Changed (Summary)

| File | Change |
|---|---|
| `apps/api/src/routes/webhooks.ts` | Add `invoice.paid`, `customer.subscription.created`, update `checkout.session.completed`, portal fix |
| `apps/api/src/routes/payments.ts` | Remove client-supplied `stripeCustomerId` from portal |
| `apps/api/src/routes/account.ts` | Add `GET /me`, `POST /onboarding/complete` |
| `apps/api/src/routes/tools.ts` | Add `PATCH /:id`, `DELETE /:id` |
| `apps/api/src/routes/admin.ts` | Extend analytics endpoint with time-series queries |
| `apps/api/src/db/schema.ts` | Add `subscriptionInvoices` table, `users.onboardedAt` |
| `apps/api/src/db/migrations/0008_onboarding_analytics.sql` | New migration |
| `packages/shared/src/constants.ts` | Add `SUBSCRIPTION_MONTHLY_CREDITS = 500` |
| `apps/web/src/context/UserProfileContext.tsx` | New context |
| `apps/web/src/app/(dashboard)/layout.tsx` | Wrap with UserProfileProvider |
| `apps/web/src/components/shared/OnboardingDialog.tsx` | Use context, server-side source of truth |
| `apps/web/src/app/(dashboard)/tools/new/page.tsx` | Domain verification prerequisite callout |
| `apps/web/src/app/(dashboard)/tools/[id]/edit/page.tsx` | New edit page |
| `apps/web/src/app/(dashboard)/tools/mine/page.tsx` | Status-driven CTAs, sandbox, delete |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | Add Analytics tab with recharts |
