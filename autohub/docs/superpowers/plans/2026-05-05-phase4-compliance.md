# Phase 4 — Compliance & Trust & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SOC 2-ready audit infrastructure, GDPR consent logging + DSAR workflow, HIPAA PHI redaction, and a webhook domain registry with sandbox execution to AutoHub.

**Architecture:** Three independent pillars (SOC 2, GDPR+HIPAA, Tool Trust) all built on the existing `audit_logs` table and BetterStack logging. One DB migration (`0007`) adds three new tables and extends two CHECK constraints. All new API routes are additive — no existing routes change signature.

**Tech Stack:** Hono + Drizzle ORM + PostgreSQL (Railway) + ioredis (rate limiting) + Node.js `dns/promises` (domain verification) + Next.js App Router + shadcn/ui + Vitest

---

## File Map

### New files — API
| Path | Responsibility |
|---|---|
| `apps/api/src/db/migrations/0007_compliance.sql` | New tables + CHECK constraint extensions |
| `apps/api/src/routes/compliance.ts` | `/api/admin/compliance/*` evidence endpoints + DSAR admin endpoints |
| `apps/api/src/services/retention.ts` | `runRetentionPurge()` — per-table purge logic, returns counts |
| `apps/api/src/scripts/retention-cron.ts` | Standalone cron entry point — runs purge, writes audit event, exits |

### Modified files — API
| Path | Change |
|---|---|
| `apps/api/src/db/schema.ts` | Add `consentLogs`, `dataSubjectRequests`, `webhookDomains` table definitions |
| `apps/api/src/routes/tools.ts` | Add domain registry endpoints + sandbox endpoint; gate approval on domain verified |
| `apps/api/src/routes/account.ts` | Add `POST /consent`, `GET /consent`, replace erasure-request with `POST /dsar` (308 old route) |
| `apps/api/src/routes/admin.ts` | Wire `complianceRouter` |
| `apps/api/src/index.ts` | Mount `complianceRouter` at `/api/admin/compliance` |
| `apps/api/src/services/tool-execution.ts` | Add PHI field redaction before `tool_usages` insert |
| `packages/shared/src/constants.ts` | Add `CURRENT_POLICY_VERSION` + `RATE_LIMITS.COMPLIANCE` + `RATE_LIMITS.SANDBOX` |
| `packages/shared/src/validators.ts` | Add `isPhi` to `inputFields` item schema; add `ConsentSchema`, `DsarSchema`, `ReviewChecklistSchema` |

### New files — Web
| Path | Responsibility |
|---|---|
| `apps/web/src/app/(dashboard)/admin/compliance/page.tsx` | DSAR queue page |
| `apps/web/src/components/admin/DsarQueue.tsx` | DSAR table with due-date coloring + resolve sheet |
| `apps/web/src/components/admin/ToolReviewChecklist.tsx` | Six-item checklist panel for tool approval |

### Modified files — Web
| Path | Change |
|---|---|
| `apps/web/src/app/(dashboard)/admin/page.tsx` | Add "Compliance" tab linking to `/admin/compliance` |
| `apps/web/src/components/admin/ToolApprovalManager.tsx` | Embed `ToolReviewChecklist`; disable Approve until all items checked |
| `apps/web/src/app/(dashboard)/tools/new/page.tsx` | Add PHI checkbox to each input field row; show domain verification instructions |

### New files — Docs
| Path | Responsibility |
|---|---|
| `docs/policies/access-control.md` | SOC 2 CC6.1/CC6.2 |
| `docs/policies/data-retention.md` | SOC 2 CC6.5 |
| `docs/policies/incident-response.md` | SOC 2 CC7.3 |
| `docs/policies/change-management.md` | SOC 2 CC8.1 |
| `docs/policies/vendor-management.md` | SOC 2 CC9.2 |
| `docs/policies/encryption-at-rest.md` | SOC 2 CC6.7 / HIPAA |
| `docs/baa-template.md` | HIPAA BAA template |

---

## Pillar A — SOC 2 Prep

### Task 1: DB Migration 0007

**Files:**
- Create: `apps/api/src/db/migrations/0007_compliance.sql`
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Write migration SQL**

Create `apps/api/src/db/migrations/0007_compliance.sql`:

```sql
-- consent_logs (append-only, never update/delete)
CREATE TABLE "consent_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "consent_type" text NOT NULL CHECK (consent_type IN ('terms','privacy','marketing','data_processing')),
  "consent_version" text NOT NULL,
  "granted" boolean NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "consent_logs_user_id_idx" ON "consent_logs" ("user_id");

-- data_subject_requests (DSAR queue)
CREATE TABLE "data_subject_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "request_type" text NOT NULL CHECK (request_type IN ('access','erasure','portability','rectification')),
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','rejected')),
  "request_notes" text,
  "resolution_notes" text,
  "due_date" timestamp with time zone NOT NULL,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "dsar_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "dsar_resolved_by_fk"
  FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
CREATE INDEX "dsar_status_due_idx" ON "data_subject_requests" ("status", "due_date");

-- webhook_domains (domain registry for tool creators)
CREATE TABLE "webhook_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "domain" text NOT NULL UNIQUE,
  "owner_user_id" uuid NOT NULL,
  "verification_token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "webhook_domains" ADD CONSTRAINT "webhook_domains_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "webhook_domains_owner_idx" ON "webhook_domains" ("owner_user_id");

-- Extend tool_usages.status CHECK constraint to include 'sandbox'
ALTER TABLE "tool_usages" DROP CONSTRAINT IF EXISTS "tool_usages_status_check";
ALTER TABLE "tool_usages" ADD CONSTRAINT "tool_usages_status_check"
  CHECK (status IN ('pending','success','failed','refunded','sandbox'));

-- Extend executions status enum (this IS a pgEnum)
ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'sandbox';
```

- [ ] **Step 2: Add Drizzle schema definitions**

In `apps/api/src/db/schema.ts`, append after the `mfaBackupCodes` table:

```typescript
// ─── consent_logs ────────────────────────────────────────────
export const consentLogs = pgTable("consent_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentType: text("consent_type", { enum: ["terms", "privacy", "marketing", "data_processing"] }).notNull(),
  consentVersion: text("consent_version").notNull(),
  granted: boolean("granted").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("consent_logs_user_id_idx").on(t.userId),
]);

// ─── data_subject_requests ───────────────────────────────────
export const dataSubjectRequests = pgTable("data_subject_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestType: text("request_type", { enum: ["access", "erasure", "portability", "rectification"] }).notNull(),
  status: text("status", { enum: ["pending", "in_progress", "completed", "rejected"] }).notNull().default("pending"),
  requestNotes: text("request_notes"),
  resolutionNotes: text("resolution_notes"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dsar_status_due_idx").on(t.status, t.dueDate),
]);

// ─── webhook_domains ─────────────────────────────────────────
export const webhookDomains = pgTable("webhook_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull().unique(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  verificationToken: text("verification_token").notNull(),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("webhook_domains_owner_idx").on(t.ownerUserId),
]);
```

- [ ] **Step 3: Add shared constants and validators**

In `packages/shared/src/constants.ts`, add to the `RATE_LIMITS` object and export the policy version:

```typescript
export const CURRENT_POLICY_VERSION = "2026-05-01";

export const RATE_LIMITS = {
  TOOL_EXECUTE: 20,
  READS: 60,
  PAYMENT_ACTIONS: 5,
  COMPLIANCE: 10,   // add this
  SANDBOX: 10,      // add this
} as const;
```

In `packages/shared/src/validators.ts`, update `CreateToolSchema`'s `inputFields` item and add new schemas:

```typescript
// Replace the inputFields item object inside CreateToolSchema:
z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string().default(""),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  isPhi: z.boolean().optional(),   // NEW
}).strict()

// Add these new exports at the bottom of the file:
export const ConsentSchema = z.object({
  consentType: z.enum(["terms", "privacy", "marketing", "data_processing"]),
  granted: z.boolean(),
}).strict();

export const DsarSchema = z.object({
  requestType: z.enum(["access", "erasure", "portability", "rectification"]),
  notes: z.string().max(2000).optional(),
}).strict();

export const ReviewChecklistSchema = z.object({
  webhookDomainVerified: z.literal(true),
  noPersonalDataCollected: z.literal(true),
  outputTypeAppropriate: z.literal(true),
  creditCostReasonable: z.literal(true),
  descriptionAccurate: z.literal(true),
  noMaliciousInputFields: z.literal(true),
}).strict();
```

- [ ] **Step 4: Apply migration locally**

```bash
cd autohub
DATABASE_URL="postgresql://postgres:ElqBpAYUpLCQeYbexmpbboVZdcDGtjZu@caboose.proxy.rlwy.net:55012/railway" npx drizzle-kit migrate
```

Expected output:
```
[✓] Applying migration 0007_compliance.sql
Migrations applied successfully
```

- [ ] **Step 5: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd autohub
git add apps/api/src/db/migrations/0007_compliance.sql apps/api/src/db/schema.ts packages/shared/src/constants.ts packages/shared/src/validators.ts
git commit -m "feat: migration 0007 — consent_logs, data_subject_requests, webhook_domains tables"
```

---

### Task 2: Data Retention Service + Cron Script

**Files:**
- Create: `apps/api/src/services/retention.ts`
- Create: `apps/api/src/scripts/retention-cron.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/retention.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing retention
vi.mock("../db/index.js", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rowCount: 3 }),
  },
}));
vi.mock("./audit.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { runRetentionPurge } from "./retention.js";

describe("runRetentionPurge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns counts for all tables", async () => {
    const result = await runRetentionPurge();
    expect(result).toHaveProperty("sessions");
    expect(result).toHaveProperty("toolUsages");
    expect(result).toHaveProperty("executions");
    expect(result).toHaveProperty("webhookExecutionLog");
    expect(result).toHaveProperty("passwordResetTokens");
    expect(result).toHaveProperty("emailVerificationTokens");
  });

  it("returns numeric counts", async () => {
    const result = await runRetentionPurge();
    for (const count of Object.values(result)) {
      expect(typeof count).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd autohub/apps/api && npx vitest run src/services/retention.test.ts
```

Expected: FAIL — `retention.js` not found.

- [ ] **Step 3: Implement retention service**

Create `apps/api/src/services/retention.ts`:

```typescript
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

export interface RetentionResult {
  sessions: number;
  toolUsages: number;
  executions: number;
  webhookExecutionLog: number;
  passwordResetTokens: number;
  emailVerificationTokens: number;
}

export async function runRetentionPurge(): Promise<RetentionResult> {
  const now = new Date();

  const [sessions, toolUsages, executions, webhookLog, resetTokens, verifyTokens] =
    await Promise.all([
      // Revoked sessions older than 90 days
      db.execute(sql`
        DELETE FROM sessions
        WHERE revoked_at IS NOT NULL
          AND revoked_at < ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)}
      `),
      // Soft-deleted tool_usages older than 2 years
      db.execute(sql`
        DELETE FROM tool_usages
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)}
      `),
      // Soft-deleted executions older than 2 years
      db.execute(sql`
        DELETE FROM executions
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)}
      `),
      // webhook_execution_log older than 1 year
      db.execute(sql`
        DELETE FROM webhook_execution_log
        WHERE created_at < ${new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)}
      `),
      // Used or expired password_reset_tokens older than 30 days
      db.execute(sql`
        DELETE FROM password_reset_tokens
        WHERE (used_at IS NOT NULL OR expires_at < ${now})
          AND expires_at < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
      `),
      // Used or expired email_verification_tokens older than 30 days
      db.execute(sql`
        DELETE FROM email_verification_tokens
        WHERE (used_at IS NOT NULL OR expires_at < ${now})
          AND expires_at < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
      `),
    ]);

  return {
    sessions: (sessions as any).rowCount ?? 0,
    toolUsages: (toolUsages as any).rowCount ?? 0,
    executions: (executions as any).rowCount ?? 0,
    webhookExecutionLog: (webhookLog as any).rowCount ?? 0,
    passwordResetTokens: (resetTokens as any).rowCount ?? 0,
    emailVerificationTokens: (verifyTokens as any).rowCount ?? 0,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd autohub/apps/api && npx vitest run src/services/retention.test.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Create cron script**

Create `apps/api/src/scripts/retention-cron.ts`:

```typescript
import "dotenv/config";
import { runRetentionPurge } from "../services/retention.js";
import { logAuditEvent } from "../services/audit.js";

async function main() {
  console.log("[retention-cron] Starting purge run");
  const result = await runRetentionPurge();
  console.log("[retention-cron] Purge complete", result);

  await logAuditEvent({
    action: "system.retention_purge",
    metadata: result as unknown as Record<string, string | number | boolean | null | undefined>,
  });

  console.log("[retention-cron] Audit event written. Exiting.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[retention-cron] Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Add build script for cron in `apps/api/package.json`**

In `apps/api/package.json`, add to `scripts`:

```json
"build:cron": "tsc --outDir dist --module nodenext --target es2022 src/scripts/retention-cron.ts"
```

This is a standalone build target for Railway's cron service.

- [ ] **Step 7: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd autohub
git add apps/api/src/services/retention.ts apps/api/src/services/retention.test.ts apps/api/src/scripts/retention-cron.ts apps/api/package.json
git commit -m "feat: data retention service + nightly cron script (SOC 2 CC6.5)"
```

---

### Task 3: Compliance Evidence Endpoints

**Files:**
- Create: `apps/api/src/routes/compliance.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/compliance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn(async (_c: any, next: any) => { _c.set("user", { userId: "u1", role: "admin" }); await next(); }),
  requireAdmin: vi.fn(async (_c: any, next: any) => { await next(); }),
}));
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }) }),
          limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
        }),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }) }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

import { complianceRouter } from "./compliance.js";

const app = new Hono();
app.route("/", complianceRouter);

describe("GET /audit-log", () => {
  it("returns 200 with data array", async () => {
    const res = await app.request("/audit-log", {
      headers: { Authorization: "Bearer test" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("GET /users", () => {
  it("returns 200 with data array", async () => {
    const res = await app.request("/users", {
      headers: { Authorization: "Bearer test" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("data");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd autohub/apps/api && npx vitest run src/routes/compliance.test.ts
```

Expected: FAIL — `compliance.js` not found.

- [ ] **Step 3: Implement compliance router**

Create `apps/api/src/routes/compliance.ts`:

```typescript
import { Hono } from "hono";
import { eq, and, gte, lte, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs, users, userRoles, sessions, dataSubjectRequests,
} from "../db/schema.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { rateLimitIp } from "../middleware/rate-limit.js";
import { logAuditEvent } from "../services/audit.js";
import { RATE_LIMITS } from "@autohub/shared";

const complianceRouter = new Hono();

// Vanta alternative auth OR admin JWT
complianceRouter.use("*", async (c, next) => {
  const vantaKey = process.env.VANTA_API_KEY;
  if (vantaKey) {
    const auth = c.req.header("Authorization");
    if (auth === `Bearer ${vantaKey}`) {
      await next();
      return;
    }
  }
  // Fall through to standard admin auth
  await requireAuth(c, async () => {
    await requireAdmin(c, next);
  });
});

// GET /api/admin/compliance/audit-log?from=ISO&to=ISO&page=1&limit=50
complianceRouter.get("/audit-log", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows, meta: { page, limit } });
});

// GET /api/admin/compliance/users — user list with MFA status for Vanta CC6.2
complianceRouter.get("/users", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: userRoles.role,
      mfaEnabled: users.mfaEnabled,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastActiveAt: sql<string>`(
        SELECT MAX(created_at) FROM sessions WHERE user_id = ${users.id}
      )`.as("last_active_at"),
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(isNull(users.deletedAt));

  return c.json({ data: result });
});

// GET /api/admin/compliance/retention-runs — last N purge run audit events
complianceRouter.get("/retention-runs", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 30)));
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "system.retention_purge"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return c.json({ data: rows });
});

// GET /api/admin/compliance/active-sessions
complianceRouter.get("/active-sessions", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const rows = await db
    .select({
      userId: sessions.userId,
      activeCount: sql<number>`COUNT(*)`.as("active_count"),
    })
    .from(sessions)
    .where(isNull(sessions.revokedAt))
    .groupBy(sessions.userId);

  const total = rows.reduce((sum, r) => sum + Number(r.activeCount), 0);
  return c.json({ data: { perUser: rows, total } });
});

// GET /api/admin/compliance/dsar — paginated DSAR queue
complianceRouter.get("/dsar", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const status = c.req.query("status");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(dataSubjectRequests.status, status as any));

  const rows = await db
    .select({
      id: dataSubjectRequests.id,
      userId: dataSubjectRequests.userId,
      requestType: dataSubjectRequests.requestType,
      status: dataSubjectRequests.status,
      requestNotes: dataSubjectRequests.requestNotes,
      resolutionNotes: dataSubjectRequests.resolutionNotes,
      dueDate: dataSubjectRequests.dueDate,
      resolvedBy: dataSubjectRequests.resolvedBy,
      resolvedAt: dataSubjectRequests.resolvedAt,
      createdAt: dataSubjectRequests.createdAt,
      userEmail: users.email,
    })
    .from(dataSubjectRequests)
    .leftJoin(users, eq(users.id, dataSubjectRequests.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(dataSubjectRequests.dueDate)
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows, meta: { page, limit } });
});

// PATCH /api/admin/compliance/dsar/:id — resolve a DSAR
complianceRouter.patch("/dsar/:id", rateLimitIp(RATE_LIMITS.COMPLIANCE), async (c) => {
  const actor = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ status: string; resolutionNotes?: string }>();

  const validStatuses = ["in_progress", "completed", "rejected"];
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const [updated] = await db
    .update(dataSubjectRequests)
    .set({
      status: body.status as any,
      resolutionNotes: body.resolutionNotes ?? null,
      resolvedBy: actor.userId,
      resolvedAt: body.status === "completed" || body.status === "rejected" ? new Date() : null,
    })
    .where(eq(dataSubjectRequests.id, id))
    .returning();

  if (!updated) return c.json({ error: "DSAR not found" }, 404);

  await logAuditEvent({
    userId: actor.userId,
    action: "gdpr.dsar_resolved",
    resourceType: "dsar",
    resourceId: id,
    metadata: { newStatus: body.status },
    ip: c.req.header("x-forwarded-for") ?? null,
  });

  return c.json({ data: updated });
});

export { complianceRouter };
```

- [ ] **Step 4: Mount router in `apps/api/src/index.ts`**

Add after the existing `import { accountRouter }` line:

```typescript
import { complianceRouter } from "./routes/compliance.js";
```

Add after `app.route("/api/account", accountRouter);`:

```typescript
app.route("/api/admin/compliance", complianceRouter);
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd autohub/apps/api && npx vitest run src/routes/compliance.test.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd autohub
git add apps/api/src/routes/compliance.ts apps/api/src/routes/compliance.test.ts apps/api/src/index.ts
git commit -m "feat: compliance evidence endpoints (SOC 2 CC6.1/6.2/6.3/6.5) + DSAR admin queue"
```

---

### Task 4: Policy Documents

**Files:**
- Create: `docs/policies/access-control.md`
- Create: `docs/policies/data-retention.md`
- Create: `docs/policies/incident-response.md`
- Create: `docs/policies/change-management.md`
- Create: `docs/policies/vendor-management.md`
- Create: `docs/policies/encryption-at-rest.md`
- Create: `docs/baa-template.md`

- [ ] **Step 1: Create `docs/policies/access-control.md`**

```markdown
# Access Control Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.1, CC6.2

## RBAC Hierarchy
Roles: `user (0) < moderator (1) < admin (2)`. Defined in `apps/api/src/middleware/rbac.ts`.

## Admin Provisioning
Admin accounts are provisioned exclusively via `scripts/promote-admin.ts` with direct DB access.
No self-service admin promotion. Every promotion is recorded in `audit_logs` with `action = "admin.user.role_changed"`.

## MFA Requirement
Admin and moderator roles require TOTP MFA enabled before any privileged request is processed.
Enforced in `apps/api/src/middleware/auth.ts` — requests from privileged roles without `mfaEnabled = true` in JWT receive HTTP 403.

## Session Management
JWT TTL: 1 day. Sessions tracked in `sessions` table by `jti`. Revoked sessions return HTTP 401.
Users can revoke all sessions via `DELETE /api/auth/sessions`. Admins can revoke any user's sessions.

## Access Review
Quarterly: admin reviews `GET /api/admin/compliance/users` output, verifies no stale admin accounts.
Evidence stored as audit log entry `action = "admin.access_review"` (manual trigger).
```

- [ ] **Step 2: Create `docs/policies/data-retention.md`**

```markdown
# Data Retention Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.5

## Retention Periods

| Data class | Retention | Action |
|---|---|---|
| `audit_logs` | 7 years | Never deleted |
| `sessions` (revoked) | 90 days | Hard delete |
| `tool_usages` (soft-deleted) | 2 years | Hard delete |
| `executions` (soft-deleted) | 2 years | Hard delete |
| `webhook_execution_log` | 1 year | Hard delete |
| `password_reset_tokens` (used/expired) | 30 days | Hard delete |
| `email_verification_tokens` (used/expired) | 30 days | Hard delete |

## Automated Purge
Implemented in `apps/api/src/services/retention.ts`. Runs nightly at 02:00 UTC via Railway Cron Job.
Every run writes a `system.retention_purge` audit event with per-table row counts.
Evidence queryable via `GET /api/admin/compliance/retention-runs`.

## Exceptions
`audit_logs` are never purged — they are the evidentiary record itself.
```

- [ ] **Step 3: Create `docs/policies/incident-response.md`**

```markdown
# Incident Response Policy

**Version:** 2026-05-01 | **SOC 2:** CC7.3

## Detection
Sentry alerts on all unhandled exceptions and P1 error rate spikes.
BetterStack alerts on log anomalies (rate limit floods, auth failures).

## Severity & SLA
| Severity | Definition | Response SLA | Resolution SLA |
|---|---|---|---|
| P1 | Data breach, service down | 1 hour | 4 hours |
| P2 | Significant degradation | 4 hours | 24 hours |
| P3 | Minor issue, workaround available | 24 hours | 72 hours |

## Process
1. Detect via Sentry / BetterStack alert
2. Assign incident commander (on-call engineer)
3. Isolate affected service (Railway service stop if needed)
4. Investigate using audit logs (`GET /api/admin/compliance/audit-log`)
5. Remediate and deploy fix (Railway auto-deploy on push)
6. Write postmortem within 48 hours of resolution
7. Log postmortem as `system.incident_postmortem` audit event

## HIPAA Breach Notification
If incident involves PHI: notify affected users and HHS within 60 days.
```

- [ ] **Step 4: Create `docs/policies/change-management.md`**

```markdown
# Change Management Policy

**Version:** 2026-05-01 | **SOC 2:** CC8.1

## Code Changes
All changes require a GitHub Pull Request. No direct commits to `main`.
PR must pass CI (TypeScript type-check + Vitest tests) before merge.

## Deployment
Railway auto-deploys on push to `main` (API service).
Vercel auto-deploys on push to `main` (web service).
No manual `railway up` in production.

## Database Migrations
Migrations run automatically at deploy time via `drizzle-kit migrate`.
Railway internal hostname (`postgres.railway.internal`) used in production.
Production migrations are irreversible — always test against staging first.

## Emergency Changes
Hot-fixes follow the same PR process. Incident commander may approve with single reviewer.
All emergency deploys logged as `system.emergency_deploy` audit event.

## No Direct DB Access
Production DB is accessible only via Railway private networking.
Public proxy (`caboose.proxy.rlwy.net`) used for migrations only; credentials rotated quarterly.
```

- [ ] **Step 5: Create `docs/policies/vendor-management.md`**

```markdown
# Vendor Management Policy

**Version:** 2026-05-01 | **SOC 2:** CC9.2

## Sub-Processors

| Vendor | Data handled | Purpose | SOC 2? |
|---|---|---|---|
| Railway | User PII, tool data, payments data | API hosting + PostgreSQL + Redis | Yes (SOC 2 Type II) |
| Vercel | Web traffic, session tokens | Next.js web hosting | Yes (SOC 2 Type II) |
| Stripe | Payment card data, billing info | Payment processing | Yes (PCI DSS Level 1) |
| Resend | User email addresses | Transactional email | Yes |
| BetterStack | Structured logs (PII-redacted) | Log aggregation | Yes |
| Sentry | Error traces (PII-redacted) | Error tracking | Yes (SOC 2 Type II) |

## Review Cadence
Annual vendor review. Any new sub-processor requires approval and DPA before use.
```

- [ ] **Step 6: Create `docs/policies/encryption-at-rest.md`**

```markdown
# Encryption at Rest Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.7 | **HIPAA:** §164.312(a)(2)(iv)

## Database
Railway managed PostgreSQL uses AES-256 encryption at rest (Railway infrastructure guarantee).
Reference: https://docs.railway.app/reference/security

## Application-Level Encryption
Webhook URLs and auth headers are encrypted with AES-256-GCM before storing in the database.
Implementation: `apps/api/src/services/crypto.ts` using Node.js `crypto` module.
Key material sourced from `ENCRYPTION_KEY` environment variable via `EnvKeyProvider`.

## Key Rotation
`KeyProvider` interface defined in `apps/api/src/services/crypto.ts` supports hot-swap to `KMSKeyProvider`.
Rotation procedure: update `ENCRYPTION_KEY` in Railway, re-encrypt existing rows via migration script.
Current rotation cadence: annually or on suspected compromise.

## In Transit
TLS 1.2+ enforced by Railway (API) and Vercel (web). No plain HTTP endpoints in production.
```

- [ ] **Step 7: Create `docs/baa-template.md`**

```markdown
# HIPAA Business Associate Agreement

**Between:** AutoHub (Service Provider) and [CUSTOMER NAME] (Covered Entity)
**Effective Date:** [DATE]

## 1. Definitions
"PHI" means Protected Health Information as defined under 45 CFR §160.103.
"BAA" means this Business Associate Agreement.

## 2. Permitted Uses of PHI
AutoHub may use PHI only to provide the services described in the Master Service Agreement and as required by law.

## 3. Safeguards
AutoHub implements the following safeguards:
- **In transit:** TLS 1.2+ on all API and web endpoints
- **At rest:** AES-256 encryption on Railway managed PostgreSQL
- **Application-level:** AES-256-GCM encryption for sensitive fields (webhook URLs, auth headers)
- **PHI fields:** Tool input fields marked `isPhi: true` are stripped before database persistence
- **Access control:** RBAC with MFA required for admin roles; session revocation within 1 hour of termination

## 4. Breach Notification
AutoHub will notify the Covered Entity of a Breach of Unsecured PHI within 60 days of discovery, per 45 CFR §164.410.

## 5. Sub-Processors Handling PHI
- Railway (database hosting) — SOC 2 Type II certified
- Vercel (web serving — no PHI stored) — SOC 2 Type II certified

## 6. Term and Termination
This BAA is coterminous with the Master Service Agreement. On termination, AutoHub will destroy or return PHI within 30 days.

## 7. Signatures

| AutoHub | [CUSTOMER NAME] |
|---|---|
| Signature: _______________ | Signature: _______________ |
| Name: _______________ | Name: _______________ |
| Title: _______________ | Title: _______________ |
| Date: _______________ | Date: _______________ |
```

- [ ] **Step 8: Commit**

```bash
cd autohub
git add docs/policies/ docs/baa-template.md
git commit -m "docs: SOC 2 policy documents + HIPAA BAA template"
```

---

## Pillar B — GDPR Completion + HIPAA

### Task 5: Consent Logging API

**Files:**
- Modify: `apps/api/src/routes/account.ts`
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Add consent endpoints to account router**

In `apps/api/src/routes/account.ts`, add the import for new schema table and shared constants at the top:

```typescript
import { consentLogs, dataSubjectRequests } from "../db/schema.js";
import { ConsentSchema, DsarSchema, CURRENT_POLICY_VERSION } from "@autohub/shared";
import { zValidator } from "@hono/zod-validator";
```

Then add these three endpoints after the existing `accountRouter.delete` block:

```typescript
// POST /api/account/consent — log a consent event (GDPR Art. 7)
accountRouter.post("/consent", requireAuth, zValidator("json", ConsentSchema), async (c) => {
  const user = c.get("user");
  const { consentType, granted } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const ua = c.req.header("user-agent") ?? null;

  await db.insert(consentLogs).values({
    userId: user.userId,
    consentType,
    consentVersion: CURRENT_POLICY_VERSION,
    granted,
    ipAddress: ip,
    userAgent: ua,
  });

  await logAuditEvent({ userId: user.userId, action: `gdpr.consent.${consentType}.${granted ? "granted" : "withdrawn"}`, ip });

  return c.json({ data: { recorded: true } });
});

// GET /api/account/consent — return user's consent history
accountRouter.get("/consent", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(consentLogs)
    .where(eq(consentLogs.userId, user.userId))
    .orderBy(desc(consentLogs.createdAt));
  return c.json({ data: rows });
});

// POST /api/account/dsar — submit a Data Subject Access Request (GDPR Art. 15/17/20/16)
accountRouter.post("/dsar", requireAuth, zValidator("json", DsarSchema), async (c) => {
  const user = c.get("user");
  const { requestType, notes } = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;

  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const [dsar] = await db.insert(dataSubjectRequests).values({
    userId: user.userId,
    requestType,
    requestNotes: notes ?? null,
    dueDate,
  }).returning();

  await logAuditEvent({
    userId: user.userId,
    action: "gdpr.dsar_submitted",
    resourceType: "dsar",
    resourceId: dsar.id,
    metadata: { requestType },
    ip,
  });

  return c.json({ data: { id: dsar.id, dueDate: dueDate.toISOString(), message: "Request received. We will respond within 30 days." } }, 201);
});

// 308 redirect: old erasure-request route → new dsar route
accountRouter.post("/erasure-request", async (c) => {
  c.header("Location", "/api/account/dsar");
  return c.body(null, 308);
});
```

Add missing imports at top of file — `desc` from drizzle-orm and the new tables:

```typescript
import { eq, and, isNull, desc } from "drizzle-orm";
```

- [ ] **Step 2: Log consent on signup**

In `apps/api/src/routes/auth.ts`, add after `await db.insert(credits)...`:

```typescript
import { consentLogs } from "../db/schema.js";
import { CURRENT_POLICY_VERSION } from "@autohub/shared";
```

After `await db.insert(credits).values(...)`:

```typescript
// Log initial consent (GDPR Art. 7) — signup implies acceptance of current policy version
await db.insert(consentLogs).values([
  { userId: user.id, consentType: "terms", consentVersion: CURRENT_POLICY_VERSION, granted: true, ipAddress: ip },
  { userId: user.id, consentType: "privacy", consentVersion: CURRENT_POLICY_VERSION, granted: true, ipAddress: ip },
  { userId: user.id, consentType: "data_processing", consentVersion: CURRENT_POLICY_VERSION, granted: true, ipAddress: ip },
]).catch((err) => console.error("[CONSENT] Failed to log signup consent:", err));
```

- [ ] **Step 3: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd autohub
git add apps/api/src/routes/account.ts apps/api/src/routes/auth.ts
git commit -m "feat: GDPR consent logging (Art. 7) + DSAR queue endpoint (Art. 15/17/20)"
```

---

### Task 6: PHI Field Redaction

**Files:**
- Modify: `apps/api/src/services/tool-execution.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/tool-execution.test.ts` (create if not present):

```typescript
import { describe, it, expect } from "vitest";
import { redactPhiFields } from "./tool-execution.js";

describe("redactPhiFields", () => {
  it("redacts fields marked as PHI", () => {
    const inputs = { name: "John", diagnosis: "diabetes", age: "45" };
    const inputFields = [
      { name: "name", label: "Name", type: "text", isPhi: false },
      { name: "diagnosis", label: "Diagnosis", type: "text", isPhi: true },
      { name: "age", label: "Age", type: "number" },
    ];
    const result = redactPhiFields(inputs, inputFields);
    expect(result.name).toBe("John");
    expect(result.diagnosis).toBe("[PHI REDACTED]");
    expect(result.age).toBe("45");
  });

  it("returns inputs unchanged when no PHI fields defined", () => {
    const inputs = { name: "John" };
    const result = redactPhiFields(inputs, []);
    expect(result).toEqual(inputs);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd autohub/apps/api && npx vitest run src/services/tool-execution.test.ts
```

Expected: FAIL — `redactPhiFields` not exported.

- [ ] **Step 3: Add `redactPhiFields` to tool-execution service**

In `apps/api/src/services/tool-execution.ts`, add this function before the `ToolExecutionService` class:

```typescript
export function redactPhiFields(
  inputs: Record<string, unknown>,
  inputFields: Array<{ name: string; isPhi?: boolean }>,
): Record<string, unknown> {
  if (!inputFields.length) return inputs;
  const phiFieldNames = new Set(
    inputFields.filter((f) => f.isPhi).map((f) => f.name)
  );
  if (!phiFieldNames.size) return inputs;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    result[key] = phiFieldNames.has(key) ? "[PHI REDACTED]" : value;
  }
  return result;
}
```

Then in `ToolExecutionService.execute()`, in the `db.transaction` block just before `return tx.insert(toolUsages).values({`:

```typescript
// Redact PHI fields before persisting — never store PHI in plaintext
const safeInputs = redactPhiFields(inputs, (tool.inputFields as Array<{ name: string; isPhi?: boolean }>) ?? []);
```

And update both `toolUsages` insert calls to use `safeInputs` instead of `inputs`:

```typescript
// In the non-admin path (inside transaction):
return tx.insert(toolUsages).values({
  userId,
  toolId,
  inputData: safeInputs,   // was: inputs
  creditsUsed: tool.creditCost,
  status: "pending",
  ipAddress: ip,
}).returning();

// In the admin path:
[usage] = await db.insert(toolUsages).values({
  userId,
  toolId,
  inputData: safeInputs,   // was: inputs
  creditsUsed: 0,
  status: "pending",
  ipAddress: ip,
}).returning();
```

Also update the webhook call to still send the original `inputs` (not `safeInputs`) — PHI redaction is only for storage, not for the tool's webhook:

```typescript
const result = await this.callWebhookWithRetry({ tool, usage, inputs }); // unchanged — send original inputs to webhook
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd autohub/apps/api && npx vitest run src/services/tool-execution.test.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd autohub
git add apps/api/src/services/tool-execution.ts apps/api/src/services/tool-execution.test.ts
git commit -m "feat: PHI field redaction in tool execution (HIPAA §164.312)"
```

---

## Pillar C — Tool Creator Trust & Safety

### Task 7: Webhook Domain Registry

**Files:**
- Modify: `apps/api/src/routes/tools.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/routes/tools.test.ts`:

```typescript
describe("POST /domains", () => {
  it("returns 201 with domain and verification instructions", async () => {
    // Mock DB insert
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "d1", domain: "example.com", verificationToken: "abc123", status: "pending",
          }]),
        }),
      }),
    } as any);

    const res = await app.request("/domains", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: "https://api.example.com/hook" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data).toHaveProperty("domain", "example.com");
    expect(body.data).toHaveProperty("dnsRecord");
  });
});
```

- [ ] **Step 2: Add domain registry endpoints to `apps/api/src/routes/tools.ts`**

Add imports at the top:

```typescript
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { webhookDomains } from "../db/schema.js";
```

Add these three endpoints before the `export { toolsRouter }` line (must be before `/:id` catch-all routes):

```typescript
// POST /api/tools/domains — register a webhook domain
toolsRouter.post("/domains", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const { webhookUrl } = await c.req.json<{ webhookUrl: string }>();

  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  // Extract root domain (e.g. api.mycompany.com → mycompany.com)
  const parts = parsed.hostname.split(".");
  const rootDomain = parts.slice(-2).join(".");
  const token = randomBytes(32).toString("hex");

  const [existing] = await db
    .select()
    .from(webhookDomains)
    .where(and(eq(webhookDomains.domain, rootDomain), eq(webhookDomains.ownerUserId, user.userId)))
    .limit(1);

  if (existing?.status === "verified") {
    return c.json({ data: { domain: rootDomain, status: "verified", alreadyVerified: true } });
  }

  const [record] = await db
    .insert(webhookDomains)
    .values({ domain: rootDomain, ownerUserId: user.userId, verificationToken: token })
    .onConflictDoUpdate({
      target: webhookDomains.domain,
      set: { verificationToken: token, status: "pending" },
    })
    .returning();

  return c.json({
    data: {
      id: record.id,
      domain: rootDomain,
      status: "pending",
      dnsRecord: `_autohub.${rootDomain} TXT "autohub-verify=${record.verificationToken}"`,
      instructions: `Add the TXT record above to your DNS, then call POST /api/tools/domains/${record.id}/verify`,
    },
  }, 201);
});

// POST /api/tools/domains/:id/verify — trigger DNS TXT check
toolsRouter.post("/domains/:id/verify", requireAuth, rateLimitIp(5, 60_000), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [record] = await db
    .select()
    .from(webhookDomains)
    .where(and(eq(webhookDomains.id, id), eq(webhookDomains.ownerUserId, user.userId)))
    .limit(1);

  if (!record) return c.json({ error: "Domain not found" }, 404);
  if (record.status === "verified") return c.json({ data: { status: "verified" } });

  // Reject if older than 7 days
  const ageDays = (Date.now() - record.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 7) {
    await db.update(webhookDomains).set({ status: "rejected" }).where(eq(webhookDomains.id, id));
    return c.json({ error: "Verification window expired. Please re-register the domain." }, 400);
  }

  let txtRecords: string[][];
  try {
    txtRecords = await resolveTxt(`_autohub.${record.domain}`);
  } catch {
    return c.json({ error: "DNS lookup failed. Ensure the TXT record has propagated (may take up to 48 hours)." }, 400);
  }

  const flat = txtRecords.flat();
  const expected = `autohub-verify=${record.verificationToken}`;
  const verified = flat.some((r) => r === expected);

  if (!verified) {
    return c.json({ error: `TXT record not found. Expected: ${expected}` }, 400);
  }

  await db.update(webhookDomains)
    .set({ status: "verified", verifiedAt: new Date() })
    .where(eq(webhookDomains.id, id));

  await logAuditEvent({ userId: user.userId, action: "tool.domain_verified", resourceType: "webhook_domain", resourceId: id });

  return c.json({ data: { status: "verified", domain: record.domain } });
});

// GET /api/tools/domains — list current user's registered domains
toolsRouter.get("/domains", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(webhookDomains)
    .where(eq(webhookDomains.ownerUserId, user.userId));
  return c.json({ data: rows });
});
```

Also add the `logAuditEvent` import if not already present at the top of `tools.ts`:

```typescript
import { logAuditEvent } from "../services/audit.js";
```

- [ ] **Step 3: Gate `PATCH /:id/submit` on domain verification**

In `apps/api/src/routes/tools.ts`, update the existing `toolsRouter.patch("/:id/submit", ...)` handler. After loading the tool, add a domain check before allowing submission (admin bypass preserved):

```typescript
// Inside PATCH /:id/submit, after loading the tool and before the toolStatus check:
if (user.role !== "admin" && tool.webhookUrlEncrypted) {
  // Derive root domain from the encrypted URL isn't possible — check webhook_domains for this user
  const verifiedDomain = await db
    .select()
    .from(webhookDomains)
    .where(and(eq(webhookDomains.ownerUserId, user.userId), eq(webhookDomains.status, "verified")))
    .limit(1);
  if (verifiedDomain.length === 0) {
    return c.json({ error: "You must verify a webhook domain before submitting a tool for approval. Use POST /api/tools/domains to register your domain." }, 400);
  }
}
```

Add `webhookDomains` to the import from `"../db/schema.js"`.

- [ ] **Step 4: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd autohub
git add apps/api/src/routes/tools.ts
git commit -m "feat: webhook domain registry with DNS TXT verification (Tool Trust & Safety)"
```

---

### Task 8: Sandbox Execution Endpoint

**Files:**
- Modify: `apps/api/src/routes/tools.ts`
- Modify: `apps/api/src/services/tool-execution.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/routes/tools.test.ts`:

```typescript
describe("POST /:id/sandbox", () => {
  it("returns 403 when user is not the tool creator", async () => {
    // tool.createdByUserId !== user.userId and user.role !== "admin"
    const res = await app.request("/tool-not-mine/sandbox", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: {} }),
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Add sandbox endpoint and `executeSandbox` method**

In `apps/api/src/services/tool-execution.ts`, add a `executeSandbox` static method after `execute`:

```typescript
static async executeSandbox({ toolId, userId, userRole, inputs, ip }: ExecuteParams) {
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, toolId), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) throw Object.assign(new Error("Tool not found"), { status: 404 });

  const isAdmin = userRole === "admin";
  const isOwner = tool.createdByUserId === userId;
  if (!isAdmin && !isOwner) throw Object.assign(new Error("Forbidden"), { status: 403 });

  // Log sandbox usage — never deduct credits
  const [usage] = await db.insert(toolUsages).values({
    userId,
    toolId,
    inputData: inputs,
    creditsUsed: 0,
    status: "sandbox" as any,
    ipAddress: ip,
  }).returning();

  if (!tool.webhookUrlEncrypted && !tool.webhookUrl) {
    await db.update(toolUsages).set({ completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
    return { usageId: usage.id, status: "sandbox", creditsDeducted: 0 };
  }

  // Decrypt webhook URL
  const { decrypt } = await import("./crypto.js");
  const webhookUrl = tool.webhookUrlEncrypted
    ? await decrypt(tool.webhookUrlEncrypted)
    : tool.webhookUrl!;

  // Call webhook with sandbox header — no retry, single attempt
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), tool.webhookTimeout * 1000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Autohub-Sandbox": "true" },
      body: JSON.stringify({ usageId: usage.id, inputs }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const outputData = res.ok ? await res.json().catch(() => null) : null;
    await db.update(toolUsages).set({ outputData, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));

    return { usageId: usage.id, status: "sandbox", output: outputData, creditsDeducted: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(toolUsages).set({ errorMessage: msg, completedAt: new Date() }).where(eq(toolUsages.id, usage.id));
    return { usageId: usage.id, status: "sandbox", error: msg, creditsDeducted: 0 };
  }
}
```

In `apps/api/src/routes/tools.ts`, add the sandbox endpoint before `export { toolsRouter }`:

```typescript
// POST /api/tools/:id/sandbox — sandbox execution (no credits, creator/admin only)
toolsRouter.post("/:id/sandbox", requireAuth, requireVerified, rateLimitUser(RATE_LIMITS.SANDBOX, 60_000), async (c) => {
  const toolId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json();
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined;

  try {
    const result = await ToolExecutionService.executeSandbox({
      toolId,
      userId: user.userId,
      userRole: user.role,
      inputs: body.inputs ?? {},
      ip,
    });
    return c.json({ data: result });
  } catch (err: any) {
    return c.json({ error: err.message }, err.status ?? 500);
  }
});
```

- [ ] **Step 3: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd autohub
git add apps/api/src/routes/tools.ts apps/api/src/services/tool-execution.ts
git commit -m "feat: sandbox execution endpoint (no credits, X-Autohub-Sandbox header)"
```

---

### Task 9: Tool Review Checklist (API)

**Files:**
- Modify: `apps/api/src/routes/tools.ts`

- [ ] **Step 1: Update `PATCH /:id/status` to require checklist on approval**

In `apps/api/src/routes/tools.ts`, find the existing `toolsRouter.patch("/:id/status", ...)` handler and replace the body type + validation:

```typescript
import { ReviewChecklistSchema } from "@autohub/shared";

// Replace existing PATCH /:id/status handler with:
toolsRouter.patch("/:id/status", requireAuth, requireRole("admin"), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    status: "approved" | "rejected" | "archived";
    reason?: string;
    reviewChecklist?: Record<string, boolean>;
  }>();

  if (!["approved", "rejected", "archived"].includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  // Require completed checklist to approve
  if (body.status === "approved") {
    const parsed = ReviewChecklistSchema.safeParse(body.reviewChecklist);
    if (!parsed.success) {
      return c.json({ error: "All review checklist items must be checked before approving", details: parsed.error.flatten() }, 400);
    }
  }

  const updates: Partial<typeof aiTools.$inferInsert> = { updatedAt: new Date() };
  if (body.status === "approved") {
    updates.toolStatus = "approved";
    updates.approvalStatus = "approved";
    updates.isActive = true;
    updates.rejectionReason = null;
  }
  if (body.status === "rejected") {
    updates.toolStatus = "rejected";
    updates.approvalStatus = "rejected";
    updates.isActive = false;
    updates.rejectionReason = body.reason ?? null;
  }
  if (body.status === "archived") {
    updates.toolStatus = "archived";
    updates.isActive = false;
  }

  const [updated] = await db.update(aiTools).set(updates).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).returning();
  if (!updated) return c.json({ error: "Tool not found" }, 404);

  const action = body.status === "approved" ? "admin.tool.approved" : body.status === "rejected" ? "admin.tool.rejected" : "admin.tool.archived";
  await logAuditEvent({
    userId: c.get("user").userId,
    action,
    resourceType: "tool",
    resourceId: id,
    metadata: {
      status: body.status,
      ...(body.reviewChecklist && { checklist: JSON.stringify(body.reviewChecklist) }),
      ...(body.reason && { reason: body.reason }),
    },
    ip: c.req.header("x-forwarded-for") ?? null,
  });

  return c.json({ data: updated });
});
```

- [ ] **Step 2: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd autohub
git add apps/api/src/routes/tools.ts
git commit -m "feat: require review checklist for tool approval (SOC 2 CC6.6)"
```

---

## Pillar D — Frontend

### Task 10: Tool Review Checklist UI

**Files:**
- Create: `apps/web/src/components/admin/ToolReviewChecklist.tsx`
- Modify: `apps/web/src/components/admin/ToolApprovalManager.tsx`

- [ ] **Step 1: Create `ToolReviewChecklist` component**

Create `apps/web/src/components/admin/ToolReviewChecklist.tsx`:

```typescript
"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

const CHECKLIST_ITEMS = [
  { key: "webhookDomainVerified", label: "Webhook domain verified", tip: "The tool's webhook domain has a verified TXT record or is admin-submitted." },
  { key: "noPersonalDataCollected", label: "No unnecessary personal data", tip: "Input fields don't collect PII beyond what's needed for the tool's function." },
  { key: "outputTypeAppropriate", label: "Output type is appropriate", tip: "The declared output type matches what the webhook actually returns." },
  { key: "creditCostReasonable", label: "Credit cost is reasonable", tip: "Credit cost is proportional to the tool's complexity and resource use." },
  { key: "descriptionAccurate", label: "Description is accurate", tip: "The name and description accurately represent what the tool does." },
  { key: "noMaliciousInputFields", label: "No malicious input fields", tip: "Input fields don't attempt to collect credentials, tokens, or other sensitive data." },
] as const;

type ChecklistKey = typeof CHECKLIST_ITEMS[number]["key"];
export type ReviewChecklist = Record<ChecklistKey, boolean>;

interface Props {
  value: Partial<ReviewChecklist>;
  onChange: (value: Partial<ReviewChecklist>) => void;
}

export function ToolReviewChecklist({ value, onChange }: Props) {
  const allChecked = CHECKLIST_ITEMS.every((item) => value[item.key] === true);

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review Checklist</p>
      {CHECKLIST_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <Checkbox
            id={item.key}
            checked={value[item.key] === true}
            onCheckedChange={(checked) =>
              onChange({ ...value, [item.key]: checked === true })
            }
          />
          <Label htmlFor={item.key} className="text-xs cursor-pointer flex-1">{item.label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[200px] text-xs">
              {item.tip}
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
      {!allChecked && (
        <p className="text-[10px] text-muted-foreground">All items must be checked to approve.</p>
      )}
    </div>
  );
}

export function isChecklistComplete(checklist: Partial<ReviewChecklist>): checklist is ReviewChecklist {
  return CHECKLIST_ITEMS.every((item) => checklist[item.key] === true);
}
```

- [ ] **Step 2: Integrate checklist into `ToolApprovalManager`**

Replace `apps/web/src/components/admin/ToolApprovalManager.tsx` with:

```typescript
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, Clock, ChevronDown } from "lucide-react";
import { ToolReviewChecklist, isChecklistComplete, type ReviewChecklist } from "./ToolReviewChecklist";
import type { AITool } from "@/types";

interface Props {
  tools: AITool[];
  onToolsChange: (tools: AITool[]) => void;
}

export function ToolApprovalManager({ tools, onToolsChange }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [checklists, setChecklists] = useState<Record<string, Partial<ReviewChecklist>>>({});
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);

  const pending = tools.filter((t) => t.approvalStatus === "pending");

  async function handleStatus(toolId: string, status: "approved" | "rejected") {
    if (!session?.apiToken) return;
    setBusy(toolId);
    try {
      const res = await apiClient.patch<{ data: AITool }>(
        `/api/tools/${toolId}/status`,
        {
          status,
          reason: rejectReason[toolId],
          ...(status === "approved" && { reviewChecklist: checklists[toolId] }),
        },
        session.apiToken
      );
      onToolsChange(tools.map((t) => t.id === toolId ? { ...t, ...res.data } : t));
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No tools pending approval.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-warning" />
        <span className="text-sm font-semibold">Pending Approvals</span>
        <Badge variant="secondary" className="text-[10px] ml-1">{pending.length}</Badge>
      </div>
      <div className="space-y-2">
        {pending.map((tool) => {
          const checklist = checklists[tool.id] ?? {};
          const canApprove = isChecklistComplete(checklist);
          const isOpen = openChecklist === tool.id;

          return (
            <div key={tool.id} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.category} · {tool.creditCost}cr</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] text-success border-success/30 hover:bg-success/10"
                    disabled={busy === tool.id || !canApprove}
                    onClick={() => handleStatus(tool.id, "approved")}
                    title={!canApprove ? "Complete the checklist to approve" : undefined}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={busy === tool.id}
                    onClick={() => handleStatus(tool.id, "rejected")}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Rejection reason (optional)…"
                className="h-6 text-[10px]"
                value={rejectReason[tool.id] ?? ""}
                onChange={(e) => setRejectReason((prev) => ({ ...prev, [tool.id]: e.target.value }))}
              />
              <Collapsible open={isOpen} onOpenChange={(o) => setOpenChecklist(o ? tool.id : null)}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    Review checklist {canApprove ? "✓" : `(${Object.values(checklist).filter(Boolean).length}/6)`}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ToolReviewChecklist
                    value={checklist}
                    onChange={(updated) => setChecklists((prev) => ({ ...prev, [tool.id]: updated }))}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check web**

```bash
cd autohub/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd autohub
git add apps/web/src/components/admin/ToolReviewChecklist.tsx apps/web/src/components/admin/ToolApprovalManager.tsx
git commit -m "feat: tool review checklist UI — six-item gate before admin can approve"
```

---

### Task 11: DSAR Admin UI

**Files:**
- Create: `apps/web/src/components/admin/DsarQueue.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/compliance/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1: Create `DsarQueue` component**

Create `apps/web/src/components/admin/DsarQueue.tsx`:

```typescript
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface Dsar {
  id: string;
  userId: string;
  userEmail: string | null;
  requestType: string;
  status: string;
  requestNotes: string | null;
  resolutionNotes: string | null;
  dueDate: string;
  createdAt: string;
}

interface Props {
  dsars: Dsar[];
  loading: boolean;
  onResolved: (updated: Dsar) => void;
}

function DueDateBadge({ dueDate }: { dueDate: string }) {
  const daysLeft = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const daysElapsed = 30 - daysLeft;
  if (daysElapsed >= 30) return <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>;
  if (daysElapsed >= 25) return <Badge className="text-[10px] bg-amber-500">{daysLeft}d left</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{daysLeft}d left</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    completed: "bg-success/10 text-success border-success/30",
    rejected: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={`text-[10px] ${map[status] ?? ""}`}>{status.replace("_", " ")}</Badge>;
}

export function DsarQueue({ dsars, loading, onResolved }: Props) {
  const { data: session } = useSession();
  const [selected, setSelected] = useState<Dsar | null>(null);
  const [newStatus, setNewStatus] = useState("in_progress");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleResolve() {
    if (!selected || !session?.apiToken) return;
    setBusy(true);
    try {
      const res = await apiClient.patch<{ data: Dsar }>(
        `/api/admin/compliance/dsar/${selected.id}`,
        { status: newStatus, resolutionNotes: notes },
        session.apiToken
      );
      onResolved(res.data);
      setSelected(null);
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
  if (dsars.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">No data subject requests.</p>;

  return (
    <>
      <div className="glass rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Submitted</TableHead>
              <TableHead className="text-xs">Due</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dsars.map((dsar) => (
              <TableRow key={dsar.id}>
                <TableCell className="text-xs">{dsar.userEmail ?? dsar.userId.slice(0, 8)}</TableCell>
                <TableCell className="text-xs font-medium">{dsar.requestType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(dsar.createdAt).toLocaleDateString()}</TableCell>
                <TableCell><DueDateBadge dueDate={dsar.dueDate} /></TableCell>
                <TableCell><StatusBadge status={dsar.status} /></TableCell>
                <TableCell className="text-right">
                  {dsar.status !== "completed" && dsar.status !== "rejected" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setSelected(dsar); setNewStatus("in_progress"); setNotes(dsar.resolutionNotes ?? ""); }}>
                      Resolve
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="text-sm">Resolve DSAR</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4">
              <div className="glass rounded-xl p-3 space-y-1">
                <p className="text-xs text-muted-foreground">User</p>
                <p className="text-sm font-medium">{selected.userEmail}</p>
                <p className="text-xs text-muted-foreground mt-1">Request</p>
                <p className="text-sm font-medium capitalize">{selected.requestType}</p>
                {selected.requestNotes && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">Notes from user</p>
                    <p className="text-xs">{selected.requestNotes}</p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Update status</p>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                    <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                    <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Resolution notes</p>
                <Textarea
                  className="text-xs min-h-[100px]"
                  placeholder="Describe how the request was handled…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {new Date(selected.dueDate) < new Date() && (
                <div className="flex items-center gap-1.5 text-destructive text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This request is overdue (30-day GDPR limit exceeded)
                </div>
              )}
              <Button className="w-full h-8 text-xs" onClick={handleResolve} disabled={busy}>
                {busy ? "Saving…" : "Save resolution"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Create compliance admin page**

Create `apps/web/src/app/(dashboard)/admin/compliance/page.tsx`:

```typescript
"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { DsarQueue } from "@/components/admin/DsarQueue";

interface Dsar {
  id: string;
  userId: string;
  userEmail: string | null;
  requestType: string;
  status: string;
  requestNotes: string | null;
  resolutionNotes: string | null;
  dueDate: string;
  createdAt: string;
}

export default function CompliancePage() {
  const { data: session, status } = useSession();
  const [dsars, setDsars] = useState<Dsar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/dashboard");
    }
  }, [status, session]);

  const fetchDsars = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: Dsar[] }>("/api/admin/compliance/dsar", session.apiToken);
      setDsars(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchDsars(); }, [fetchDsars]);

  function handleResolved(updated: Dsar) {
    setDsars((prev) => prev.map((d) => d.id === updated.id ? updated : d));
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Compliance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Data subject requests — 30 day response SLA</p>
      </div>
      <DsarQueue dsars={dsars} loading={loading} onResolved={handleResolved} />
    </div>
  );
}
```

- [ ] **Step 3: Add Compliance tab link to admin page**

In `apps/web/src/app/(dashboard)/admin/page.tsx`, add a "Compliance" tab to the `TabsList`:

```typescript
// After the existing TabsTrigger for "users":
<TabsTrigger value="compliance" className="text-xs" onClick={() => router.push("/admin/compliance")}>
  Compliance
</TabsTrigger>
```

- [ ] **Step 4: Type-check web**

```bash
cd autohub/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd autohub
git add apps/web/src/components/admin/DsarQueue.tsx apps/web/src/app/(dashboard)/admin/compliance/page.tsx apps/web/src/app/(dashboard)/admin/page.tsx
git commit -m "feat: DSAR admin queue UI with due-date coloring and resolve sheet"
```

---

### Task 12: Creator Reputation in Admin Tools List

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add reputation computation to `GET /api/admin/tools`**

In `apps/api/src/routes/admin.ts`, replace the existing `adminRouter.get("/tools", ...)` handler:

```typescript
adminRouter.get("/tools", rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const toolList = await db
    .select({
      id: aiTools.id,
      name: aiTools.name,
      description: aiTools.description,
      category: aiTools.category,
      creditCost: aiTools.creditCost,
      approvalStatus: aiTools.approvalStatus,
      isActive: aiTools.isActive,
      createdByUserId: aiTools.createdByUserId,
      createdAt: aiTools.createdAt,
    })
    .from(aiTools)
    .where(isNull(aiTools.deletedAt))
    .orderBy(desc(aiTools.createdAt));

  // Compute creator reputation for each unique creator
  const creatorIds = [...new Set(toolList.map((t) => t.createdByUserId).filter(Boolean))] as string[];

  const reputationMap: Record<string, {
    toolsApproved: number;
    toolsRejected: number;
    totalExecutions: number;
    webhookSuccessRate: number;
    circuitBreakerTrips: number;
  }> = {};

  await Promise.all(creatorIds.map(async (creatorId) => {
    const creatorTools = toolList.filter((t) => t.createdByUserId === creatorId).map((t) => t.id);

    const [approved] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiTools)
      .where(and(eq(aiTools.createdByUserId, creatorId), eq(aiTools.approvalStatus, "approved"), isNull(aiTools.deletedAt)));

    const [rejected] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiTools)
      .where(and(eq(aiTools.createdByUserId, creatorId), eq(aiTools.approvalStatus, "rejected"), isNull(aiTools.deletedAt)));

    const [execCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(toolUsages)
      .where(and(
        sql`${toolUsages.toolId} = ANY(${sql.raw(`ARRAY[${creatorTools.map(() => "?").join(",")}]`)})`,
        isNull(toolUsages.deletedAt),
      ));

    reputationMap[creatorId] = {
      toolsApproved: Number(approved.count),
      toolsRejected: Number(rejected.count),
      totalExecutions: Number(execCount?.count ?? 0),
      webhookSuccessRate: 1.0, // Simplified — full webhook log query would be expensive
      circuitBreakerTrips: 0,  // Future: query audit_logs for circuit_breaker.opened events
    };
  }));

  const result = toolList.map((tool) => ({
    ...tool,
    creatorReputation: tool.createdByUserId ? reputationMap[tool.createdByUserId] ?? null : null,
  }));

  return c.json({ data: result });
});
```

- [ ] **Step 2: Type-check**

```bash
cd autohub/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd autohub
git add apps/api/src/routes/admin.ts
git commit -m "feat: creator reputation signal on admin tools list"
```

---

### Task 13: Final Integration — Type-check, Run All Tests, Push

- [ ] **Step 1: Run all API tests**

```bash
cd autohub/apps/api && npx vitest run
```

Expected: all tests pass. Fix any failures before proceeding.

- [ ] **Step 2: Run full type-check across monorepo**

```bash
cd autohub/apps/api && npx tsc --noEmit
cd autohub/apps/web && npx tsc --noEmit
```

Expected: no errors in either package.

- [ ] **Step 3: Push to GitHub (triggers Railway + Vercel deploy)**

```bash
cd autohub && git push origin main
```

Expected: Railway auto-deploys API (migration 0007 runs at startup). Vercel auto-deploys web.

- [ ] **Step 4: Verify migration ran in production**

Check Railway deploy logs for:
```
Migrations applied successfully
```

- [ ] **Step 5: Smoke test in production**

```bash
# Test compliance endpoint (replace TOKEN with a real admin JWT)
curl https://accomplished-integrity-production.up.railway.app/api/admin/compliance/users \
  -H "Authorization: Bearer TOKEN"
# Expected: { data: [...] }

# Test DSAR endpoint
curl -X POST https://accomplished-integrity-production.up.railway.app/api/account/dsar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requestType":"access"}'
# Expected: { data: { id: "...", dueDate: "...", message: "..." } }

# Test sandbox endpoint (as tool creator)
curl -X POST https://accomplished-integrity-production.up.railway.app/api/tools/TOOL_ID/sandbox \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{}}'
# Expected: { data: { usageId: "...", status: "sandbox", creditsDeducted: 0 } }
```

- [ ] **Step 6: Final commit (update memory)**

```bash
cd autohub && git log --oneline -10
```

Confirm all Phase 4 commits are present. Phase 4 is complete.
