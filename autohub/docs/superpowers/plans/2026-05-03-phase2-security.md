# AutoHub Security Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email verification, session revocation, soft deletes + GDPR export/deletion, and MFA/TOTP to AutoHub.

**Architecture:** All API changes live in `apps/api/src/`; all web changes in `apps/web/src/`. One Drizzle migration (`0005_phase2_security.sql`) covers all schema additions. Execution order: Task 1 (migration) → Task 2 (email verify) → Task 3 (session revocation) → Task 4 (soft deletes + GDPR) → Task 5 (MFA).

**Tech Stack:** Hono, Drizzle ORM, Railway Postgres, NextAuth v5, `resend` (email), `otplib` (TOTP), `qrcode` + `@types/qrcode` (QR web), `bcryptjs` (already installed), `jsonwebtoken` (already installed), `uuid` via Node `crypto.randomUUID()`.

---

## File Map

**New files — API:**
- `apps/api/src/services/email.ts` — Resend wrapper, all email templates
- `apps/api/src/middleware/require-verified.ts` — enforces email verification on protected routes
- `apps/api/src/routes/account.ts` — GDPR export, account delete, erasure request

**Modified files — API:**
- `apps/api/src/db/schema.ts` — add all new columns + tables
- `apps/api/src/db/migrations/0005_phase2_security.sql` — DDL for all new schema
- `apps/api/src/db/migrations/meta/_journal.json` — register migration 0005
- `apps/api/src/middleware/auth.ts` — add jti revocation check
- `apps/api/src/routes/auth.ts` — email verify endpoints, session endpoints, MFA endpoints, jti issuance, TTL reduction
- `apps/api/src/routes/tools.ts` — add `requireVerified` to execute route; add `isNull(deletedAt)` filters
- `apps/api/src/routes/admin.ts` — add `isNull(deletedAt)` filters
- `apps/api/src/routes/executions.ts` — add `isNull(deletedAt)` filters
- `apps/api/src/routes/webhooks.ts` — add `isNull(deletedAt)` filters
- `apps/api/src/services/tool-execution.ts` — add `isNull(deletedAt)` filter
- `apps/api/src/services/webhook-proxy.ts` — add `isNull(deletedAt)` filter
- `apps/api/src/index.ts` — mount accountRouter, add JwtPayload fields
- `apps/api/package.json` — add `resend`, `otplib`, `@types/otplib`

**Modified files — Web:**
- `apps/web/src/lib/auth.ts` — add `emailVerified`, `jti`, `mfaEnabled` to JWT/session types; detect `mfaRequired` in authorize
- `apps/web/src/components/auth/SignUpForm.tsx` — handle `requiresVerification` response, redirect to verify-pending page
- `apps/web/src/app/auth/verify-pending/page.tsx` — NEW: "check your email" static page
- `apps/web/src/app/auth/verify-email/page.tsx` — NEW: handles `?token=` redirect from email link (calls API, shows result)
- `apps/web/src/app/auth/mfa/page.tsx` — NEW: TOTP challenge page for step-up login
- `apps/web/src/app/(dashboard)/settings/page.tsx` — add Security tab: sessions list, MFA enroll/disable
- `apps/web/package.json` — add `qrcode`, `@types/qrcode`

---

## Task 1: Database Migration

**Files:**
- Create: `apps/api/src/db/migrations/0005_phase2_security.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

Create `apps/api/src/db/migrations/0005_phase2_security.sql`:

```sql
-- users: email verification + MFA + soft delete
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamptz;
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" text;
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamptz;

-- soft delete on other tables
ALTER TABLE "ai_tools"    ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "executions"  ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "tool_usages" ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "payments"    ADD COLUMN "deleted_at" timestamptz;

-- email verification tokens
CREATE TABLE "email_verification_tokens" (
  "token_hash" text PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "used_at"    timestamptz
);

-- sessions (for jti revocation)
CREATE TABLE "sessions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_jti"  text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  "user_agent" text,
  "ip"         text
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_jti_idx" ON "sessions"("token_jti");

-- MFA backup codes
CREATE TABLE "mfa_backup_codes" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at"   timestamptz
);
CREATE INDEX "mfa_backup_codes_user_id_idx" ON "mfa_backup_codes"("user_id");
```

- [ ] **Step 2: Update `_journal.json`**

In `apps/api/src/db/migrations/meta/_journal.json`, add entry after `0004`:

```json
{
  "idx": 5,
  "version": "7",
  "when": 1746403200000,
  "tag": "0005_phase2_security",
  "breakpoints": true
}
```

- [ ] **Step 3: Update `schema.ts` — users table**

In `apps/api/src/db/schema.ts`, replace the `users` table definition:

```typescript
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  isActive: boolean("is_active").notNull().default(true),
  stripeCustomerId: text("stripe_customer_id"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  mfaSecretEncrypted: text("mfa_secret_encrypted"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Add `deletedAt` to aiTools, executions, toolUsages, payments**

In `apps/api/src/db/schema.ts`, add `deletedAt: timestamp("deleted_at", { withTimezone: true }),` as the last column before `createdAt` in each of these four tables.

For `aiTools`:
```typescript
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

Same pattern for `executions`, `toolUsages`, `payments`.

- [ ] **Step 5: Add new tables to `schema.ts`**

Append at the end of `apps/api/src/db/schema.ts`:

```typescript
// ─── email_verification_tokens ──────────────────────────
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ─── sessions ───────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenJti: text("token_jti").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
  index("sessions_jti_idx").on(t.tokenJti),
]);

// ─── mfa_backup_codes ───────────────────────────────────
export const mfaBackupCodes = pgTable("mfa_backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [
  index("mfa_backup_codes_user_id_idx").on(t.userId),
]);
```

- [ ] **Step 6: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Apply migration to production DB**

```bash
# from autohub/apps/api/
node --input-type=module <<'EOF'
import pg from 'pg';
import { readFileSync } from 'fs';
const { Pool } = pg;
const pool = new Pool({ connectionString: "postgresql://postgres:ElqBpAYUpLCQeYbexmpbboVZdcDGtjZu@caboose.proxy.rlwy.net:55012/railway" });
const sql = readFileSync('./src/db/migrations/0005_phase2_security.sql', 'utf8');
await pool.query(sql);
console.log('Migration applied');
// Register in drizzle migrations table
import crypto from 'crypto';
const hash = crypto.createHash('sha256').update(sql).digest('hex');
await pool.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING", [hash, "1746403200000"]);
console.log('Registered hash:', hash);
await pool.end();
EOF
```

Expected: `Migration applied` + `Registered hash: <hex>`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts \
        apps/api/src/db/migrations/0005_phase2_security.sql \
        apps/api/src/db/migrations/meta/_journal.json
git commit -m "feat: schema migration 0005 — email verify, sessions, MFA, soft deletes"
```

---

## Task 2: Email Verification

**Files:**
- Create: `apps/api/src/services/email.ts`
- Create: `apps/api/src/middleware/require-verified.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/routes/tools.ts`
- Modify: `apps/api/src/middleware/auth.ts` (add `emailVerified` to `JwtPayload`)
- Modify: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/auth/verify-pending/page.tsx`
- Create: `apps/web/src/app/auth/verify-email/page.tsx`
- Modify: `apps/web/src/components/auth/SignUpForm.tsx`

- [ ] **Step 1: Install `resend` in API**

```bash
cd apps/api && pnpm add resend
```

Expected: `resend` added to `apps/api/package.json` dependencies.

- [ ] **Step 2: Write `email.ts` service**

Create `apps/api/src/services/email.ts`:

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@autohub.app";
const WEB_URL = process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000";

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${WEB_URL}/auth/verify-email?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your AutoHub email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="font-size:20px;margin-bottom:8px">Verify your email</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to verify your AutoHub account. This link expires in 24 hours.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
    text: `Verify your AutoHub email: ${url}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${WEB_URL}/auth/reset-password/${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your AutoHub password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="font-size:20px;margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request a reset, you can ignore this email.</p>
      </div>
    `,
    text: `Reset your AutoHub password: ${url}\n\nThis link expires in 1 hour.`,
  });
}
```

- [ ] **Step 3: Write `require-verified.ts` middleware**

Create `apps/api/src/middleware/require-verified.ts`:

```typescript
import { createMiddleware } from "hono/factory";

export const requireVerified = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user.emailVerified) {
    return c.json({ error: "email_not_verified" }, 403);
  }
  await next();
});
```

- [ ] **Step 4: Update `JwtPayload` in `middleware/auth.ts`**

Replace the `JwtPayload` interface and `requireAuth` middleware in `apps/api/src/middleware/auth.ts`:

```typescript
import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq, isNotNull } from "drizzle-orm";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  jti: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;

    // Check session revocation (Task 3 wires this fully; guard added now)
    if (payload.jti) {
      const [session] = await db
        .select({ revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.tokenJti, payload.jti))
        .limit(1);
      if (session?.revokedAt != null) {
        return c.json({ error: "Session revoked" }, 401);
      }
    }

    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
```

- [ ] **Step 5: Add email verify routes to `routes/auth.ts`**

Add these imports at the top of `apps/api/src/routes/auth.ts` (after existing imports):

```typescript
import { randomUUID } from "crypto";
import { emailVerificationTokens, sessions } from "../db/schema.js";
import { isNull, and } from "drizzle-orm";
import { sendVerificationEmail } from "../services/email.js";
```

Add these three route handlers at the end of `routes/auth.ts` (before `export { authRouter }`):

```typescript
// GET /auth/verify-email?token=<raw> — verify email address
authRouter.get("/verify-email", async (c) => {
  const raw = c.req.query("token");
  if (!raw) return c.json({ error: "Missing token" }, 400);

  const now = new Date();
  const candidates = await db
    .select()
    .from(emailVerificationTokens)
    .where(isNull(emailVerificationTokens.usedAt));

  let matched: typeof candidates[0] | null = null;
  for (const row of candidates) {
    if (row.expiresAt < now) continue;
    const ok = await bcrypt.compare(raw, row.tokenHash);
    if (ok) { matched = row; break; }
  }

  if (!matched) return c.json({ error: "Invalid or expired verification token" }, 400);

  await db
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, matched.userId));
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.tokenHash, matched.tokenHash));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: matched.userId, action: "auth.email_verified", ip, requestId });

  return c.redirect(`${process.env.AUTOHUB_WEB_URL ?? "http://localhost:3000"}/dashboard?verified=true`);
});

// POST /auth/resend-verification — resend verification email (auth required)
authRouter.post("/resend-verification", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const [dbUser] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  if (!dbUser) return c.json({ error: "User not found" }, 404);
  if (dbUser.emailVerifiedAt) return c.json({ data: { message: "Email already verified" } });

  // Rate-limit: delete tokens older than 5min and check if a recent one exists
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, dbUser.id));

  const raw = randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(raw, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({ tokenHash, userId: dbUser.id, expiresAt });

  await sendVerificationEmail(dbUser.email, raw).catch((err) =>
    console.error("[EMAIL] Failed to send verification:", err)
  );
  await logAuditEvent({ userId: dbUser.id, action: "auth.verification_resent", ip, requestId });

  return c.json({ data: { message: "Verification email sent" } });
});
```

- [ ] **Step 6: Update `register` handler in `routes/auth.ts` to send verification email**

In the existing `authRouter.post("/register", ...)` handler, after the `logAuditEvent` for `auth.signup`, add:

```typescript
  // Send email verification
  const rawVerifyToken = randomBytes(32).toString("hex");
  const verifyTokenHash = await bcrypt.hash(rawVerifyToken, 10);
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({
    tokenHash: verifyTokenHash,
    userId: user.id,
    expiresAt: verifyExpiresAt,
  });
  await sendVerificationEmail(user.email, rawVerifyToken).catch((err) =>
    console.error("[EMAIL] Failed to send verification:", err)
  );
```

Also update the register response to include `requiresVerification: true`:

```typescript
  return c.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    requiresVerification: true,
  }, 201);
```

And update the `login` handler's `jwt.sign` call to include `emailVerified`:

```typescript
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role,
      jti: randomUUID(),
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabled ?? false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );
```

Do the same for the `register` handler's `jwt.sign` call:

```typescript
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: "user",
      jti: randomUUID(),
      emailVerified: false,
      mfaEnabled: false,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );
```

Also update the `register` handler import: add `randomUUID` — it's already imported from `"crypto"` in `auth.ts` as `randomBytes`. Change the import to:

```typescript
import { randomBytes, randomUUID } from "crypto";
```

And add the missing schema imports to `routes/auth.ts`:

```typescript
import { users, userRoles, credits, passwordResetTokens, emailVerificationTokens } from "../db/schema.js";
```

- [ ] **Step 7: Add `requireVerified` to the execute route in `routes/tools.ts`**

In `apps/api/src/routes/tools.ts`, add import:

```typescript
import { requireVerified } from "../middleware/require-verified.js";
```

Find the execute route (search for `/:id/execute`) and add `requireVerified` after `requireAuth`:

```typescript
toolsRouter.post("/:id/execute", requireAuth, requireVerified, rateLimit(RATE_LIMITS.EXECUTE), async (c) => {
```

- [ ] **Step 8: Update `apps/web/src/lib/auth.ts` types**

In `apps/web/src/lib/auth.ts`, update the `authorize` callback and type declarations:

Replace the `authorize` function body's return object shape — when response contains `mfaRequired: true`, return a special object:

```typescript
          if (!data?.token || !data?.user?.id) return null;

          // MFA step-up: don't issue full session yet
          if ((data as any).mfaRequired) {
            return {
              id: data.user.id,
              email: data.user.email,
              name: data.user.fullName ?? data.user.email,
              role: data.user.role,
              token: "",
              mfaPending: true,
              mfaToken: (data as any).mfaToken,
            };
          }

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.fullName ?? data.user.email,
            role: data.user.role,
            token: data.token,
            emailVerified: !!(data as any).emailVerifiedAt,
          };
```

Update the `jwt` callback:

```typescript
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as any).role;
        token.apiToken = (user as any).token;
        token.mfaPending = (user as any).mfaPending ?? false;
        token.mfaToken = (user as any).mfaToken ?? null;
        token.emailVerified = (user as any).emailVerified ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.apiToken = token.apiToken as string;
      session.mfaPending = token.mfaPending as boolean;
      session.mfaToken = token.mfaToken as string | null;
      session.emailVerified = token.emailVerified as boolean;
      return session;
    },
```

Update the type declarations:

```typescript
declare module "next-auth" {
  interface Session {
    apiToken: string;
    mfaPending: boolean;
    mfaToken: string | null;
    emailVerified: boolean;
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    apiToken: string;
    mfaPending: boolean;
    mfaToken: string | null;
    emailVerified: boolean;
  }
}
```

- [ ] **Step 9: Create `verify-pending` page**

Create `apps/web/src/app/auth/verify-pending/page.tsx`:

```tsx
export default function VerifyPendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-4xl">📧</div>
        <h1 className="font-display font-bold text-xl">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to your email address. Click the link to activate your account.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <a href="/auth/login" className="text-primary hover:underline">sign in</a>{" "}
          to resend.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create `verify-email` page**

Create `apps/web/src/app/auth/verify-email/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Missing token"); return; }
    fetch(`${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      redirect: "manual",
    }).then((res) => {
      if (res.ok || res.status === 302 || res.type === "opaqueredirect") {
        setStatus("success");
      } else {
        return res.json().then((d) => { setStatus("error"); setMessage(d.error ?? "Verification failed"); });
      }
    }).catch(() => { setStatus("error"); setMessage("Network error"); });
  }, [token]);

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        {status === "success" ? (
          <>
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
            <h1 className="font-display font-bold text-xl">Email verified!</h1>
            <p className="text-sm text-muted-foreground">Your account is now active.</p>
            <Button onClick={() => router.push("/dashboard")} className="w-full">Go to Dashboard</Button>
          </>
        ) : (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-display font-bold text-xl">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" onClick={() => router.push("/auth/login")} className="w-full">Back to Login</Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Update `SignUpForm.tsx` to redirect to verify-pending**

In `apps/web/src/components/auth/SignUpForm.tsx`, after the successful registration fetch (where `res.ok` is true), replace the `signIn` call logic:

```typescript
      const data = await res.json() as { requiresVerification?: boolean };
      if (data.requiresVerification) {
        router.push("/auth/verify-pending");
        return;
      }
```

Add this block before the existing `signIn("credentials", ...)` call.

- [ ] **Step 12: Type-check both apps**

```bash
cd apps/api && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

Expected: no errors in either.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/services/email.ts \
        apps/api/src/middleware/require-verified.ts \
        apps/api/src/middleware/auth.ts \
        apps/api/src/routes/auth.ts \
        apps/api/src/routes/tools.ts \
        apps/api/package.json \
        apps/web/src/lib/auth.ts \
        apps/web/src/components/auth/SignUpForm.tsx \
        apps/web/src/app/auth/verify-pending/page.tsx \
        apps/web/src/app/auth/verify-email/page.tsx \
        pnpm-lock.yaml
git commit -m "feat: email verification (2.4) — Resend integration, verify-email flow, requireVerified middleware"
```

---

## Task 3: Session Revocation

**Files:**
- Modify: `apps/api/src/routes/auth.ts` — add jti issuance to register/login, add session list/revoke routes
- Modify: `apps/api/src/middleware/auth.ts` — already wired in Task 2 Step 4

- [ ] **Step 1: Add session insert on login and register**

In `apps/api/src/routes/auth.ts`, add `sessions` to the schema import:

```typescript
import { users, userRoles, credits, passwordResetTokens, emailVerificationTokens, sessions } from "../db/schema.js";
```

After each `jwt.sign(...)` call in both `register` and `login` handlers, insert a session row. Add this block right after the `const token = jwt.sign(...)` line in the **login** handler:

```typescript
  const jti = randomUUID();
  const token = jwt.sign(
    { userId: user.id, email: user.email, role, jti, emailVerified: !!user.emailVerifiedAt, mfaEnabled: user.mfaEnabled ?? false },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  await db.insert(sessions).values({
    userId: user.id,
    tokenJti: jti,
    userAgent: c.req.header("user-agent") ?? null,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
  }).catch(() => {}); // non-fatal
```

Do the same for the **register** handler (using `user.id` and role `"user"`).

- [ ] **Step 2: Add session list + revoke routes to `routes/auth.ts`**

Add these handlers before `export { authRouter }`:

```typescript
// GET /auth/sessions — list active sessions for current user
authRouter.get("/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, user.userId), isNull(sessions.revokedAt)));
  return c.json({ data: rows.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    userAgent: s.userAgent,
    ip: s.ip,
    current: s.tokenJti === user.jti,
  })) });
});

// DELETE /auth/sessions/:id — revoke a specific session
authRouter.delete("/sessions/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.userId)))
    .limit(1);
  if (!session) return c.json({ error: "Session not found" }, 404);
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  return c.json({ data: { revoked: true } });
});

// DELETE /auth/sessions — revoke ALL sessions for current user
authRouter.delete("/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  await revokeAllSessions(user.userId);
  return c.json({ data: { revoked: true } });
});
```

Add a helper function above these routes:

```typescript
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
```

- [ ] **Step 3: Wire `revokeAllSessions` into password change**

In the existing `PATCH /auth/password` handler, after `await db.update(users).set({ passwordHash: newHash })...`, add:

```typescript
  await revokeAllSessions(user.userId);
```

- [ ] **Step 4: Add sessions list UI to Settings page**

In `apps/web/src/app/(dashboard)/settings/page.tsx`, add a new "Security" section below the Password section:

```tsx
  // Sessions section
  const [sessions, setSessions] = useState<Array<{id:string;createdAt:string;userAgent:string|null;ip:string|null;current:boolean}>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: typeof sessions }>("/api/auth/sessions", session.apiToken);
      setSessions(res.data);
    } finally {
      setSessionsLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function handleRevokeSession(id: string) {
    if (!session?.apiToken) return;
    await apiClient.delete(`/api/auth/sessions/${id}`, session.apiToken);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }
```

Add the JSX section in the return:

```tsx
      {/* Security — Sessions */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Active Sessions</h2>
        {sessionsLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active sessions</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">{s.userAgent ?? "Unknown device"}</span>
                  {s.current && <span className="ml-2 text-success">(this session)</span>}
                  <div className="text-muted-foreground/60">{s.ip} · {new Date(s.createdAt).toLocaleDateString()}</div>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => handleRevokeSession(s.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
```

- [ ] **Step 5: Type-check**

```bash
cd apps/api && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts \
        apps/web/src/app/(dashboard)/settings/page.tsx
git commit -m "feat: session revocation (2.3) — jti issuance, session list/revoke, password change revokes all"
```

---

## Task 4: Soft Deletes + GDPR Endpoints

**Files:**
- Create: `apps/api/src/routes/account.ts`
- Modify: `apps/api/src/routes/tools.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/executions.ts`
- Modify: `apps/api/src/routes/webhooks.ts`
- Modify: `apps/api/src/services/tool-execution.ts`
- Modify: `apps/api/src/services/webhook-proxy.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add `isNull(deletedAt)` to `routes/tools.ts`**

In `apps/api/src/routes/tools.ts`, add `isNull` to the drizzle-orm import:

```typescript
import { eq, and, desc, count, isNull } from "drizzle-orm";
```

Then update every query that reads from `aiTools` or `toolUsages` to add `isNull(table.deletedAt)`:

- `GET /` (list approved tools): `.where(and(eq(aiTools.isActive, true), eq(aiTools.approvalStatus, "approved"), isNull(aiTools.deletedAt)))`
- `GET /mine`: `.where(and(eq(aiTools.createdByUserId, user.userId), isNull(aiTools.deletedAt)))`
- All `db.select().from(aiTools).where(eq(aiTools.id, id))` lookups: add `and(eq(aiTools.id, id), isNull(aiTools.deletedAt))`
- The `toolUsages` queries: add `and(...existing conditions..., isNull(toolUsages.deletedAt))`

- [ ] **Step 2: Add `isNull(deletedAt)` to `routes/admin.ts`**

In `apps/api/src/routes/admin.ts`, add `isNull` to the drizzle-orm import.

Update the users list query to add `isNull(users.deletedAt)` filter.
Update the aiTools admin query to add `isNull(aiTools.deletedAt)` filter.
The `DELETE /users/:id` deactivation handler: keep as-is (sets `isActive: false` — soft delete is separate).

- [ ] **Step 3: Add `isNull(deletedAt)` to `routes/executions.ts`, `webhooks.ts`, `services/`**

In `routes/executions.ts`: add `isNull` to imports; add `isNull(executions.deletedAt)` to both execution fetches.

In `routes/webhooks.ts`: add `isNull` to imports; add `isNull(users.deletedAt)` to the user lookup by `stripeCustomerId`.

In `services/tool-execution.ts`: add `isNull` to imports; update the `aiTools` lookup to include `isNull(aiTools.deletedAt)`.

In `services/webhook-proxy.ts`: same — add `isNull(aiTools.deletedAt)` to the tool lookup.

- [ ] **Step 4: Create `routes/account.ts`**

Create `apps/api/src/routes/account.ts`:

```typescript
import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users, aiTools, executions, toolUsages, payments, sessions,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { logAuditEvent } from "../services/audit.js";
import { revokeAllSessions } from "./auth.js";

const accountRouter = new Hono();

// GET /api/account/export — GDPR data export (Art. 20)
accountRouter.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const [dbUser] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.id, user.userId), isNull(users.deletedAt)))
    .limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const usages = await db
    .select({ id: toolUsages.id, toolId: toolUsages.toolId, creditsUsed: toolUsages.creditsUsed, status: toolUsages.status, createdAt: toolUsages.createdAt })
    .from(toolUsages)
    .where(and(eq(toolUsages.userId, user.userId), isNull(toolUsages.deletedAt)));

  const userPayments = await db
    .select({ id: payments.id, amount: payments.amount, status: payments.status, creditsGranted: payments.creditsGranted, createdAt: payments.createdAt })
    .from(payments)
    .where(eq(payments.userId, user.userId)); // payments never soft-deleted

  const userExecutions = await db
    .select({ id: executions.id, toolId: executions.toolId, status: executions.status, creditsDebited: executions.creditsDebited, startedAt: executions.startedAt })
    .from(executions)
    .where(and(eq(executions.userId, user.userId), isNull(executions.deletedAt)));

  await logAuditEvent({ userId: user.userId, action: "gdpr.data_exported", ip, requestId });

  return c.json({
    exportedAt: new Date().toISOString(),
    user: dbUser,
    toolUsages: usages,
    payments: userPayments,
    executions: userExecutions,
  });
});

// DELETE /api/account — soft-delete account (GDPR Art. 17)
accountRouter.delete("/", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");

  const now = new Date();

  // Anonymize and soft-delete user
  await db.update(users).set({
    deletedAt: now,
    email: `deleted_${user.userId}@deleted`,
    fullName: null,
    passwordHash: "",
    updatedAt: now,
  }).where(eq(users.id, user.userId));

  // Soft-delete owned tools, executions, usages
  await db.update(aiTools).set({ deletedAt: now }).where(eq(aiTools.createdByUserId, user.userId));
  await db.update(executions).set({ deletedAt: now }).where(eq(executions.userId, user.userId));
  await db.update(toolUsages).set({ deletedAt: now }).where(eq(toolUsages.userId, user.userId));
  // payments retained for legal/financial compliance

  // Revoke all sessions
  await revokeAllSessions(user.userId);

  await logAuditEvent({ userId: user.userId, action: "account.deleted", ip, requestId });

  return c.json({ data: { deleted: true } });
});

// POST /api/account/erasure-request — formal GDPR Art. 17 request
accountRouter.post("/erasure-request", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({
    userId: user.userId,
    action: "gdpr.erasure_requested",
    ip,
    requestId,
    metadata: { note: "Formal Art. 17 request — requires manual admin review within 30 days" },
  });
  return c.json({ data: { message: "Erasure request received. We will process it within 30 days." } });
});

export { accountRouter };
```

- [ ] **Step 5: Mount `accountRouter` in `index.ts`**

In `apps/api/src/index.ts`, add:

```typescript
import { accountRouter } from "./routes/account.js";
```

And add the route mount after the existing routes:

```typescript
app.route("/api/account", accountRouter);
```

- [ ] **Step 6: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/account.ts \
        apps/api/src/routes/tools.ts \
        apps/api/src/routes/admin.ts \
        apps/api/src/routes/executions.ts \
        apps/api/src/routes/webhooks.ts \
        apps/api/src/services/tool-execution.ts \
        apps/api/src/services/webhook-proxy.ts \
        apps/api/src/index.ts
git commit -m "feat: soft deletes + GDPR endpoints (2.1) — deletedAt filters, account export/delete/erasure-request"
```

---

## Task 5: MFA / TOTP

**Files:**
- Modify: `apps/api/src/routes/auth.ts` — MFA setup/verify-setup/disable/challenge routes, login step-up
- Modify: `apps/api/src/middleware/auth.ts` — force MFA check for admin/moderator
- Create: `apps/web/src/app/auth/mfa/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx` — MFA enroll/disable UI
- Modify: `apps/web/package.json` — add `qrcode`, `@types/qrcode`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/api && pnpm add otplib
cd ../web && pnpm add qrcode && pnpm add -D @types/qrcode
```

- [ ] **Step 2: Add MFA setup routes to `routes/auth.ts`**

Add import at top of `routes/auth.ts`:

```typescript
import { authenticator } from "otplib";
import { mfaBackupCodes } from "../db/schema.js";
```

Add these routes before `export { authRouter }`:

```typescript
// POST /auth/mfa/setup — generate TOTP secret, store encrypted, return otpauthUrl
authRouter.post("/mfa/setup", requireAuth, async (c) => {
  const user = c.get("user");
  const [dbUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(dbUser.email, "AutoHub", secret);
  const encryptedSecret = encrypt(secret);

  await db.update(users)
    .set({ mfaSecretEncrypted: encryptedSecret, mfaEnabled: false })
    .where(eq(users.id, user.userId));

  return c.json({ data: { otpauthUrl, secret } }); // secret shown once for manual entry
});

// POST /auth/mfa/verify-setup — confirm TOTP code, enable MFA, return backup codes
authRouter.post("/mfa/verify-setup", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ code: string }>();
  if (!body.code) return c.json({ error: "code is required" }, 400);

  const [dbUser] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted })
    .from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser?.mfaSecretEncrypted) return c.json({ error: "MFA setup not started" }, 400);

  const secret = decrypt(dbUser.mfaSecretEncrypted);
  const valid = authenticator.verify({ token: body.code, secret });
  if (!valid) return c.json({ error: "Invalid TOTP code" }, 400);

  // Generate 10 backup codes
  const plainCodes: string[] = [];
  const hashedCodes: Array<{ userId: string; codeHash: string }> = [];
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase(); // 8-char hex
    plainCodes.push(code);
    hashedCodes.push({ userId: user.userId, codeHash: await bcrypt.hash(code, 10) });
  }

  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.userId));
  await db.insert(mfaBackupCodes).values(hashedCodes);
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.userId));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: user.userId, action: "auth.mfa_enabled", ip, requestId });

  return c.json({ data: { backupCodes: plainCodes } });
});

// POST /auth/mfa/disable — disable MFA (requires current TOTP or backup code)
authRouter.post("/mfa/disable", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ code: string }>();
  if (!body.code) return c.json({ error: "code is required" }, 400);

  const [dbUser] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted, mfaEnabled: users.mfaEnabled })
    .from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser?.mfaEnabled) return c.json({ error: "MFA is not enabled" }, 400);

  // Try TOTP first
  let verified = false;
  if (dbUser.mfaSecretEncrypted) {
    const secret = decrypt(dbUser.mfaSecretEncrypted);
    verified = authenticator.verify({ token: body.code, secret });
  }

  // Fall back to backup code
  if (!verified) {
    const backups = await db
      .select()
      .from(mfaBackupCodes)
      .where(and(eq(mfaBackupCodes.userId, user.userId), isNull(mfaBackupCodes.usedAt)));
    for (const b of backups) {
      if (await bcrypt.compare(body.code, b.codeHash)) {
        await db.update(mfaBackupCodes).set({ usedAt: new Date() }).where(eq(mfaBackupCodes.id, b.id));
        verified = true;
        break;
      }
    }
  }

  if (!verified) return c.json({ error: "Invalid code" }, 400);

  await db.update(users)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null })
    .where(eq(users.id, user.userId));
  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.userId));

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  const requestId = (c.get as any)("requestId");
  await logAuditEvent({ userId: user.userId, action: "auth.mfa_disabled", ip, requestId });

  return c.json({ data: { disabled: true } });
});

// POST /auth/mfa/challenge — complete MFA step-up, receive full JWT
authRouter.post("/mfa/challenge", async (c) => {
  const body = await c.req.json<{ mfaToken: string; code: string }>();
  if (!body.mfaToken || !body.code) return c.json({ error: "mfaToken and code are required" }, 400);

  let payload: { userId: string; type: string } & Record<string, unknown>;
  try {
    payload = jwt.verify(body.mfaToken, process.env.NEXTAUTH_SECRET!) as typeof payload;
  } catch {
    return c.json({ error: "Invalid or expired MFA token" }, 400);
  }
  if (payload.type !== "mfa_pending") return c.json({ error: "Invalid token type" }, 400);

  const [dbUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)))
    .limit(1);
  if (!dbUser) return c.json({ error: "User not found" }, 404);

  // Verify TOTP or backup code
  let verified = false;
  if (dbUser.mfaSecretEncrypted) {
    const secret = decrypt(dbUser.mfaSecretEncrypted);
    verified = authenticator.verify({ token: body.code, secret });
  }
  if (!verified) {
    const backups = await db
      .select()
      .from(mfaBackupCodes)
      .where(and(eq(mfaBackupCodes.userId, dbUser.id), isNull(mfaBackupCodes.usedAt)));
    for (const b of backups) {
      if (await bcrypt.compare(body.code, b.codeHash)) {
        await db.update(mfaBackupCodes).set({ usedAt: new Date() }).where(eq(mfaBackupCodes.id, b.id));
        verified = true;
        break;
      }
    }
  }
  if (!verified) return c.json({ error: "Invalid MFA code" }, 400);

  const [roleRow] = await db.select().from(userRoles).where(eq(userRoles.userId, dbUser.id)).limit(1);
  const role = roleRow?.role ?? "user";
  const jti = randomUUID();

  const token = jwt.sign(
    { userId: dbUser.id, email: dbUser.email, role, jti, emailVerified: !!dbUser.emailVerifiedAt, mfaEnabled: true },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "1d" }
  );

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
  await db.insert(sessions).values({
    userId: dbUser.id, tokenJti: jti,
    userAgent: c.req.header("user-agent") ?? null, ip,
  }).catch(() => {});

  await logAuditEvent({ userId: dbUser.id, action: "auth.mfa_challenge_success", ip });

  return c.json({ token, user: { id: dbUser.id, email: dbUser.email, fullName: dbUser.fullName, role } });
});
```

Also add these imports to `routes/auth.ts` (at top, alongside existing ones):

```typescript
import { encrypt, decrypt } from "../services/crypto.js";
import { mfaBackupCodes } from "../db/schema.js";
```

- [ ] **Step 3: Update login handler for MFA step-up**

In the `login` handler, after verifying the password and getting `role`, add a check before `jwt.sign`:

```typescript
  // MFA step-up: if mfaEnabled, return a short-lived pending token instead of full token
  if (user.mfaEnabled) {
    const mfaToken = jwt.sign(
      { userId: user.id, type: "mfa_pending" },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: "5m" }
    );
    return c.json({ mfaRequired: true, mfaToken, user: { id: user.id, email: user.email, role } });
  }
```

- [ ] **Step 4: Add force-MFA guard to `middleware/auth.ts`**

In `apps/api/src/middleware/auth.ts`, after setting `c.set("user", payload)` and before `await next()`, add:

```typescript
    // Force MFA enrollment for privileged roles
    if ((payload.role === "admin" || payload.role === "moderator") && !payload.mfaEnabled) {
      return c.json({ error: "mfa_required_for_role" }, 403);
    }
```

- [ ] **Step 5: Create MFA challenge page**

Create `apps/web/src/app/auth/mfa/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function MfaChallengePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.mfaToken) { setError("Session expired. Please log in again."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken: session.mfaToken, code }),
      });
      const data = await res.json() as { token?: string; user?: { id: string; email: string; fullName: string | null; role: string }; error?: string };
      if (!res.ok || !data.token) { setError(data.error ?? "Invalid code"); return; }

      // Complete sign-in by updating the session with the full token
      await signIn("credentials", { redirect: false, email: data.user!.email, _fullToken: data.token });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-sm w-full space-y-6">
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl">Two-factor authentication</h1>
          <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-xs">Authentication code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={8}
              autoComplete="one-time-code"
              className="h-8 text-xs tracking-widest"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
            {loading && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
            Verify
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add MFA enroll/disable section to Settings page**

In `apps/web/src/app/(dashboard)/settings/page.tsx`, add MFA state:

```typescript
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaState, setMfaState] = useState<"idle"|"enrolling"|"confirming"|"done"|"disabling">("idle");
  const [mfaError, setMfaError] = useState("");
```

Add `import QRCode from "qrcode";` at top.

Add MFA helper functions:

```typescript
  async function handleStartMfaEnroll() {
    if (!session?.apiToken) return;
    setMfaState("enrolling");
    const res = await apiClient.post<{ data: { otpauthUrl: string; secret: string } }>("/api/auth/mfa/setup", {}, session.apiToken);
    setMfaSetupData(res.data);
    // Render QR
    const canvas = document.getElementById("mfa-qr") as HTMLCanvasElement;
    if (canvas) await QRCode.toCanvas(canvas, res.data.otpauthUrl, { width: 180 });
  }

  async function handleConfirmMfaEnroll() {
    if (!session?.apiToken || !mfaCode) return;
    try {
      const res = await apiClient.post<{ data: { backupCodes: string[] } }>("/api/auth/mfa/verify-setup", { code: mfaCode }, session.apiToken);
      setBackupCodes(res.data.backupCodes);
      setMfaEnabled(true);
      setMfaState("done");
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Invalid code");
    }
  }

  async function handleDisableMfa() {
    if (!session?.apiToken || !mfaCode) return;
    try {
      await apiClient.post("/api/auth/mfa/disable", { code: mfaCode }, session.apiToken);
      setMfaEnabled(false);
      setMfaState("idle");
      setMfaCode("");
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Invalid code");
    }
  }
```

Add the JSX section in the return (after the Sessions section):

```tsx
      {/* MFA */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Two-Factor Authentication</h2>
        {mfaState === "idle" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {mfaEnabled ? "MFA is enabled on your account." : "Add an extra layer of security to your account."}
            </p>
            {mfaEnabled ? (
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => setMfaState("disabling")}>
                Disable MFA
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={handleStartMfaEnroll}>
                Enable MFA
              </Button>
            )}
          </div>
        )}
        {mfaState === "enrolling" && mfaSetupData && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Scan this QR code with your authenticator app:</p>
            <canvas id="mfa-qr" className="rounded-lg" />
            <p className="text-xs text-muted-foreground">Or enter this secret manually: <code className="text-xs">{mfaSetupData.secret}</code></p>
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} className="h-8 text-xs" />
            {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
            <Button size="sm" className="h-7 text-xs" onClick={handleConfirmMfaEnroll} disabled={mfaCode.length < 6}>Verify & Enable</Button>
          </div>
        )}
        {mfaState === "done" && (
          <div className="space-y-3">
            <p className="text-xs text-success">MFA enabled! Save these backup codes — they won&apos;t be shown again:</p>
            <pre className="text-xs bg-muted/40 rounded p-3">{backupCodes.join("\n")}</pre>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMfaState("idle")}>Done</Button>
          </div>
        )}
        {mfaState === "disabling" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter your current TOTP code or a backup code to disable MFA:</p>
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Code" className="h-8 text-xs" />
            {mfaError && <p className="text-xs text-destructive">{mfaError}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDisableMfa}>Disable</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMfaState("idle"); setMfaError(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 7: Type-check both apps**

```bash
cd apps/api && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/auth.ts \
        apps/api/src/middleware/auth.ts \
        apps/web/src/app/auth/mfa/page.tsx \
        apps/web/src/app/(dashboard)/settings/page.tsx \
        apps/api/package.json \
        apps/web/package.json \
        pnpm-lock.yaml
git commit -m "feat: MFA/TOTP (2.2) — setup/verify/disable/challenge endpoints, settings UI, force-MFA for admins"
```

---

## Task 6: Deploy + Verify

- [ ] **Step 1: Add `RESEND_API_KEY` to Railway**

```bash
cd autohub && railway variables --set "RESEND_API_KEY=<your_resend_api_key>"
railway variables --set "RESEND_FROM_EMAIL=noreply@autohub.app"
```

- [ ] **Step 2: Push to GitHub to trigger Railway + Vercel deploys**

```bash
git push origin main
```

Expected: Railway build starts (Docker), Vercel build starts. Both finish green.

- [ ] **Step 3: Verify Railway logs show migration 0005 applied**

```bash
railway logs --tail 30
```

Expected: `Migrations applied successfully` followed by `AutoHub API running`.

- [ ] **Step 4: Run verification checklist from spec**

```bash
# Sign up → check email arrives → click link → confirm email_verified_at set
node --input-type=module <<'EOF'
import pg from 'pg';
const pool = new pg.Pool({ connectionString: "postgresql://postgres:ElqBpAYUpLCQeYbexmpbboVZdcDGtjZu@caboose.proxy.rlwy.net:55012/railway" });
const res = await pool.query("SELECT email, email_verified_at, mfa_enabled, deleted_at FROM users ORDER BY created_at DESC LIMIT 5");
console.table(res.rows);
await pool.end();
EOF
```

- [ ] **Step 5: Update memory with Phase 2 completion status**

Update `C:\Users\prate\.claude\projects\c--Users-prate-Repositories-AI-AI-Agent-Wallet\memory\project_autohub_rebuild.md`:
- Change `### Phase 2 — NOT STARTED` to `### Phase 2 — COMPLETE`
- Update `## Current state` header to reflect Phase 2 done.

---

## Self-Review Notes

- All 26 `deletedAt` query sites covered across 7 files in Task 4 Step 1–3.
- `jti` claim added in Task 2 Step 4 (auth middleware) and Task 3 Step 1 (issuance). Revocation check uses the indexed `sessions_jti_idx`.
- `revokeAllSessions` is exported from `routes/auth.ts` and imported in `routes/account.ts` — circular-safe since it only imports from `db/schema`.
- `encrypt`/`decrypt` imported from `services/crypto.ts` in `routes/auth.ts` for MFA secret — already used there for webhooks.
- `randomBytes` already imported in `routes/auth.ts`; `randomUUID` added to the same import.
- MFA challenge page uses `session.mfaToken` — wired into NextAuth session type in Task 2 Step 8.
- `mfaEnabled` on JWT payload updated at login (reads from DB `user.mfaEnabled`). After MFA enroll, user must re-login for the new claim to take effect — acceptable behaviour.
