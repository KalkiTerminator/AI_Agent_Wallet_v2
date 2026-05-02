# Phase 3 — NextAuth.js v5 Authentication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire NextAuth.js v5 (Auth.js) into the Next.js app using a Credentials provider that calls the existing Hono `/auth/login` and `/auth/register` endpoints, replacing the current cookie-name stub in middleware with a real session check.

**Architecture:** NextAuth v5 runs as an App Router route handler at `app/api/auth/[...nextauth]/route.ts`. The Credentials provider POSTs to the Hono API and stores `{ id, email, role, token }` in the JWT. The middleware uses `auth()` from NextAuth to read the session server-side — no client-side cookie name guessing. A `useSession` hook and `SessionProvider` are wired into the root layout. Login and signup pages become real forms using `react-hook-form` + `zod`.

**Tech Stack:** Next.js 15 App Router, NextAuth v5 (beta.25, already installed), `react-hook-form` + `zod` (already installed), Hono API on `NEXT_PUBLIC_API_URL`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/lib/auth.ts` | NextAuth config — providers, callbacks, session shape |
| Create | `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Route handler that exports GET/POST from auth config |
| Modify | `apps/web/src/middleware.ts` | Replace cookie-stub with NextAuth `auth()` check |
| Modify | `apps/web/src/app/layout.tsx` | Wrap children in `SessionProvider` |
| Create | `apps/web/src/components/auth/LoginForm.tsx` | Controlled login form — calls `signIn("credentials")` |
| Create | `apps/web/src/components/auth/SignUpForm.tsx` | Controlled signup form — POSTs to Hono `/auth/register`, then signs in |
| Modify | `apps/web/src/app/auth/login/page.tsx` | Mount `<LoginForm />` |
| Modify | `apps/web/src/app/auth/signup/page.tsx` | Mount `<SignUpForm />` |
| Modify | `apps/web/src/lib/api-client.ts` | Add `getSessionToken()` helper + server-side variant |

---

## Task 1: NextAuth Config (`src/lib/auth.ts`)

**Files:**
- Create: `apps/web/src/lib/auth.ts`

- [ ] **Step 1: Write the file**

```ts
// apps/web/src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        if (!res.ok) return null;

        const data = await res.json() as {
          token: string;
          user: { id: string; email: string; fullName: string | null; role: string };
        };

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName ?? data.user.email,
          role: data.user.role,
          token: data.token,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.apiToken = (user as { token: string }).token;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.apiToken = token.apiToken as string;
      return session;
    },
  },

  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
});
```

- [ ] **Step 2: Add module augmentation for TypeScript** — append to the same file:

```ts
// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    apiToken: string;
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
  }
}
```

- [ ] **Step 3: Run type-check — expect no errors for this file**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: no new errors (the file is not yet imported anywhere so zero impact).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth.ts
git commit -m "feat(auth): add NextAuth v5 config with Credentials provider"
```

---

## Task 2: Route Handler (`app/api/auth/[...nextauth]/route.ts`)

**Files:**
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create the directory and file**

```ts
// apps/web/src/app/api/auth/[...nextauth]/route.ts
export { handlers as GET, handlers as POST } from "@/lib/auth";
```

> Note: In NextAuth v5, `handlers` contains both `GET` and `POST`. The single named export pattern is the official v5 way.

- [ ] **Step 2: Verify directory was created correctly**

```bash
ls autohub/apps/web/src/app/api/auth/\[...nextauth\]/
```

Expected: `route.ts`

- [ ] **Step 3: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/auth/\[...nextauth\]/route.ts
git commit -m "feat(auth): add NextAuth route handler"
```

---

## Task 3: Update Middleware

**Files:**
- Modify: `apps/web/src/middleware.ts`

The current middleware guesses at cookie names. Replace with NextAuth's `auth()` wrapper which reads the session properly.

- [ ] **Step 1: Replace the entire file content**

```ts
// apps/web/src/middleware.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/usage", "/settings", "/onboarding", "/tools", "/org"];
const adminRoutes = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));
  const isAdmin = adminRoutes.some((r) => pathname.startsWith(r));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  if (isAdmin && session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(auth): replace cookie stub with NextAuth auth() middleware"
```

---

## Task 4: SessionProvider in Root Layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Update the layout to wrap with SessionProvider**

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AutoHub — AI Tools Marketplace",
  description: "Credit-based AI tools marketplace. Access powerful AI tools with flexible credit packages.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(auth): wrap root layout in SessionProvider"
```

---

## Task 5: LoginForm Component

**Files:**
- Create: `apps/web/src/components/auth/LoginForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/auth/LoginForm.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setServerError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/auth/signup" className="text-primary hover:underline">
          Sign up
        </a>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/LoginForm.tsx
git commit -m "feat(auth): add LoginForm component with react-hook-form"
```

---

## Task 6: SignUpForm Component

**Files:**
- Create: `apps/web/src/components/auth/SignUpForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/auth/SignUpForm.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const signUpSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (values: SignUpFormValues) => {
    setServerError(null);

    // Step 1: Register via Hono API
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" })) as { error?: string };
      setServerError(body.error ?? "Registration failed. Please try again.");
      return;
    }

    // Step 2: Auto sign-in after registration
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setServerError("Account created but sign-in failed. Please log in manually.");
      router.push("/auth/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          type="text"
          placeholder="Jane Smith"
          autoComplete="name"
          {...register("fullName")}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/auth/login" className="text-primary hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/SignUpForm.tsx
git commit -m "feat(auth): add SignUpForm component with registration + auto sign-in"
```

---

## Task 7: Wire Forms into Auth Pages

**Files:**
- Modify: `apps/web/src/app/auth/login/page.tsx`
- Modify: `apps/web/src/app/auth/signup/page.tsx`

- [ ] **Step 1: Update login page**

```tsx
// apps/web/src/app/auth/login/page.tsx
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 rounded-xl w-full max-w-md">
        <h1 className="text-2xl font-display font-bold mb-6">Sign in to AutoHub</h1>
        <LoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update signup page**

```tsx
// apps/web/src/app/auth/signup/page.tsx
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 rounded-xl w-full max-w-md">
        <h1 className="text-2xl font-display font-bold mb-6">Create your account</h1>
        <SignUpForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/auth/login/page.tsx apps/web/src/app/auth/signup/page.tsx
git commit -m "feat(auth): wire LoginForm and SignUpForm into auth pages"
```

---

## Task 8: Add `getSessionToken()` to apiClient

Server components and route handlers need the API token from the session. Add a helper.

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Append a server-side helper (separate from the client apiClient)**

```ts
// apps/web/src/lib/api-client.ts
// (Keep all existing code, add this at the bottom:)

/**
 * Server-side helper — reads API token from the NextAuth session.
 * Only call this from Server Components or Route Handlers.
 */
export async function getServerApiToken(): Promise<string | undefined> {
  // Dynamic import keeps next-auth/react out of the server bundle
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  return session?.apiToken;
}
```

- [ ] **Step 2: Run type-check**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(auth): add getServerApiToken() helper for server components"
```

---

## Task 9: Set NEXTAUTH_SECRET in `.env.example`

**Files:**
- Modify: `autohub/.env.example`

- [ ] **Step 1: Read the existing .env.example**

```bash
cat autohub/.env.example
```

- [ ] **Step 2: Add the missing NEXTAUTH vars if not already present**

Ensure these lines exist in `autohub/.env.example`:

```
# NextAuth — generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```bash
git add autohub/.env.example
git commit -m "chore: document NEXTAUTH_SECRET and NEXTAUTH_URL in .env.example"
```

---

## Task 10: Final Type-Check + Smoke Test

- [ ] **Step 1: Full type-check of the entire monorepo**

```bash
cd autohub && pnpm --filter @autohub/web exec npx tsc --noEmit && pnpm --filter @autohub/api exec npx tsc --noEmit
```

Expected: both exit 0, no errors.

- [ ] **Step 2: Verify `.env` has required vars** — copy `.env.example` to a local `.env` if it doesn't exist and fill in:

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 3: Start both apps and smoke-test login**

```bash
# Terminal 1 — API
cd autohub && pnpm --filter @autohub/api dev

# Terminal 2 — Web
cd autohub && pnpm --filter @autohub/web dev
```

Smoke test checklist:
- [ ] `http://localhost:3000/dashboard` redirects to `/auth/login` (unauthenticated)
- [ ] Sign-up form creates an account and redirects to `/dashboard`
- [ ] Login form signs in and redirects to `/dashboard`
- [ ] `http://localhost:3000/admin` redirects to `/dashboard` for non-admin users

---

## Self-Review

### Spec coverage
- [x] NextAuth.js v5 config at `src/lib/auth.ts` — Task 1
- [x] API route at `app/api/auth/[...nextauth]/route.ts` — Task 2
- [x] Middleware updated to use `auth()` — Task 3
- [x] SessionProvider in root layout — Task 4
- [x] Login page form — Tasks 5, 7
- [x] Signup page form — Tasks 6, 7
- [x] `apiClient` server-side token helper — Task 8
- [x] Env vars documented — Task 9

### Placeholder scan
- No TBD / TODO / "fill in" phrases found.

### Type consistency
- `session.apiToken` set in `callbacks.session` (Task 1) and read in `getServerApiToken` (Task 8) — consistent.
- `session.user.role` set in `callbacks.session` (Task 1) and read as `session?.user?.role` in middleware (Task 3) — consistent.
- `LoginForm` / `SignUpForm` export names match their imports in pages — consistent.
