# Phase 4 — Full Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all dashboard pages to the Hono API, complete the CommandPalette, and implement the useToolQueue hook so AutoHub is a fully functional app (no stubs remaining in Phase 4 scope).

**Architecture:** Client components use `useSession()` to extract `session.apiToken` and pass it to `apiClient`; Server Components use `getServerApiToken()`. All API field names are camelCase (`creditCost`, `inputFields`, `iconUrl`). The design system uses `.glass`, `.glass-subtle`, `font-display`, `text-primary`/`text-destructive` from `globals.css`.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, shadcn/ui, Tailwind CSS, Lucide icons, react-hook-form, Zod, cmdk (already in shadcn command component)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/(dashboard)/layout.tsx` | Modify | Real sidebar with nav links, credit balance, sign-out |
| `apps/web/src/hooks/useCredits.ts` | Create | Fetch credit balance from `GET /credits` via apiClient |
| `apps/web/src/hooks/useTools.ts` | Create | Fetch tools list from `GET /tools`, favorites toggle |
| `apps/web/src/hooks/useToolQueue.ts` | Modify | Full implementation: queue state, sequential API execution |
| `apps/web/src/app/(dashboard)/dashboard/page.tsx` | Modify | Tool grid + search + layout toggle + tool execute dialog |
| `apps/web/src/components/dashboard/ToolExecuteDialog.tsx` | Create | Modal: dynamic input fields, execute, show result |
| `apps/web/src/app/(dashboard)/tools/[id]/page.tsx` | Create | Tool detail page (full input form, execute, result display) |
| `apps/web/src/app/(dashboard)/usage/page.tsx` | Create | Usage history table (paginated) |
| `apps/web/src/app/(dashboard)/settings/page.tsx` | Create | Profile update form + subscription status panel |
| `apps/web/src/components/shared/CommandPalette.tsx` | Modify | Working Cmd+K palette: tool search + navigation |

---

## Task 1: Sidebar Layout (Dashboard Layout)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/hooks/useCredits.ts`

### useCredits hook

- [ ] **Step 1: Create `apps/web/src/hooks/useCredits.ts`**

```ts
"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { CreditBalance } from "@/types";

export function useCredits() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.apiToken) return;
    apiClient
      .get<{ data: CreditBalance }>("/credits", session.apiToken)
      .then((res) => setCredits(res.data.currentCredits))
      .catch(() => setCredits(null))
      .finally(() => setLoading(false));
  }, [session?.apiToken]);

  return { credits, loading };
}
```

> **Note:** The Hono API does not yet have a `GET /credits` route. Add it to `apps/api/src/routes/credits.ts` and register it in `apps/api/src/index.ts` as part of this step.

- [ ] **Step 2: Create `apps/api/src/routes/credits.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { credits } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";

const creditsRouter = new Hono();

creditsRouter.get("/", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const [row] = await db.select().from(credits).where(eq(credits.userId, user.userId)).limit(1);
  if (!row) return c.json({ error: "Credits not found" }, 404);
  return c.json({ data: { currentCredits: row.currentCredits, lifetimeCreditsUsed: row.lifetimeCreditsUsed } });
});

export { creditsRouter };
```

- [ ] **Step 3: Register credits route in `apps/api/src/index.ts`**

Open `apps/api/src/index.ts` and add:
```ts
import { creditsRouter } from "./routes/credits.js";
// ...
app.route("/credits", creditsRouter);
```

(Add after the existing route registrations, following the same pattern.)

- [ ] **Step 4: Replace `apps/web/src/app/(dashboard)/layout.tsx` with full sidebar**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarClient } from "@/components/dashboard/SidebarClient";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarClient user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/components/dashboard/SidebarClient.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Wrench, BarChart2, Settings, LogOut, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";

interface SidebarClientProps {
  user: { name: string; email: string; role: string };
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/usage", label: "Usage", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarClient({ user }: SidebarClientProps) {
  const pathname = usePathname();
  const { credits, loading } = useCredits();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 pb-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-display font-bold text-sm">AutoHub</span>
        </Link>
      </div>

      {/* Credit balance */}
      <div className="mx-3 mb-3 px-3 py-2 rounded-lg glass-subtle">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Credits</p>
        {loading ? (
          <div className="h-5 w-16 rounded bg-muted animate-pulse" />
        ) : (
          <p className="text-sm font-semibold font-mono">
            {credits ?? "—"} <span className="text-[10px] text-muted-foreground font-normal">available</span>
          </p>
        )}
      </div>

      <Separator className="mx-3 mb-2" />

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors",
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        ))}

        {user.role === "admin" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Admin
          </Link>
        )}
      </nav>

      {/* User + sign out */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium truncate">{user.name || user.email}</p>
            {user.role !== "user" && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 rounded">{user.role}</Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-7 text-[11px] text-muted-foreground hover:text-destructive gap-2"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add autohub/apps/api/src/routes/credits.ts autohub/apps/api/src/index.ts autohub/apps/web/src/hooks/useCredits.ts autohub/apps/web/src/app/\(dashboard\)/layout.tsx autohub/apps/web/src/components/dashboard/SidebarClient.tsx
git commit -m "feat(phase4): sidebar layout with credit balance and nav"
```

---

## Task 2: useTools Hook

**Files:**
- Create: `apps/web/src/hooks/useTools.ts`

- [ ] **Step 1: Create `apps/web/src/hooks/useTools.ts`**

```ts
"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { AITool } from "@/types";

export function useTools() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<AITool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchTools = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ data: AITool[] }>("/tools", session.apiToken);
      setTools(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const toggleFavorite = useCallback((toolId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  }, []);

  return { tools, loading, error, favorites, toggleFavorite, refetch: fetchTools };
}
```

- [ ] **Step 2: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add autohub/apps/web/src/hooks/useTools.ts
git commit -m "feat(phase4): useTools hook with favorites"
```

---

## Task 3: useToolQueue — Full Implementation

**Files:**
- Modify: `apps/web/src/hooks/useToolQueue.ts`

- [ ] **Step 1: Replace `apps/web/src/hooks/useToolQueue.ts` with full implementation**

```ts
"use client";
import { useSession } from "next-auth/react";
import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { ToolExecutionResult } from "@/types";

export interface QueueItem {
  id: string;
  toolId: string;
  toolName: string;
  inputs: Record<string, unknown>;
  status: "pending" | "processing" | "success" | "failed";
  creditsUsed?: number;
  output?: unknown;
  error?: string;
}

export function useToolQueue() {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const addToQueue = useCallback((toolId: string, toolName: string, inputs: Record<string, unknown>) => {
    setQueue((prev) => [
      ...prev,
      { id: crypto.randomUUID(), toolId, toolName, inputs, status: "pending" },
    ]);
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id || item.status !== "pending"));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === "pending" || item.status === "processing"));
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !session?.apiToken) return;
    processingRef.current = true;
    setIsProcessing(true);

    try {
      // Process pending items sequentially
      let currentQueue = queue;
      const pending = currentQueue.filter((i) => i.status === "pending");

      for (const item of pending) {
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i))
        );

        try {
          const res = await apiClient.post<{ data: ToolExecutionResult }>(
            `/tools/${item.toolId}/execute`,
            { inputs: item.inputs },
            session.apiToken
          );
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "success", output: res.data.output, creditsUsed: res.data.creditsCharged }
                : i
            )
          );
        } catch (e) {
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "failed", error: e instanceof Error ? e.message : "Execution failed" }
                : i
            )
          );
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [session?.apiToken, queue]);

  return { queue, isProcessing, addToQueue, processQueue, removeFromQueue, clearCompleted };
}
```

- [ ] **Step 2: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add autohub/apps/web/src/hooks/useToolQueue.ts
git commit -m "feat(phase4): useToolQueue — full sequential execution implementation"
```

---

## Task 4: ToolExecuteDialog Component

**Files:**
- Create: `apps/web/src/components/dashboard/ToolExecuteDialog.tsx`

- [ ] **Step 1: Create `apps/web/src/components/dashboard/ToolExecuteDialog.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Zap, CheckCircle, XCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { AITool, ToolExecutionResult, InputField } from "@/types";

interface ToolExecuteDialogProps {
  tool: AITool | null;
  credits: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (creditsRemaining: number) => void;
}

type ExecState = "idle" | "loading" | "success" | "error";

export function ToolExecuteDialog({ tool, credits, open, onOpenChange, onSuccess }: ToolExecuteDialogProps) {
  const { data: session } = useSession();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [state, setState] = useState<ExecState>("idle");
  const [result, setResult] = useState<ToolExecutionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (!tool) return null;

  const fields: InputField[] = Array.isArray(tool.inputFields)
    ? tool.inputFields
    : Object.entries(tool.inputFields ?? {}).map(([name, cfg]) => ({ name, ...(cfg as object) } as InputField));

  const canAfford = credits !== null && credits >= tool.creditCost;

  const handleExecute = async () => {
    if (!session?.apiToken || !canAfford) return;
    setState("loading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await apiClient.post<{ data: ToolExecutionResult }>(
        `/tools/${tool.id}/execute`,
        { inputs },
        session.apiToken
      );
      setResult(res.data);
      setState("success");
      onSuccess?.(credits! - tool.creditCost);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Execution failed");
      setState("error");
    }
  };

  const handleClose = () => {
    setState("idle");
    setInputs({});
    setResult(null);
    setErrorMsg("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg glass">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{tool.iconUrl}</span>
            <div>
              <DialogTitle className="font-display text-base">{tool.name}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">{tool.description}</DialogDescription>
            </div>
            <Badge variant="secondary" className="ml-auto text-[10px] font-mono shrink-0">
              {tool.creditCost} cr
            </Badge>
          </div>
        </DialogHeader>

        {state === "idle" || state === "loading" ? (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label className="text-xs">{field.label ?? field.name}</Label>
                {field.type === "textarea" ? (
                  <Textarea
                    placeholder={field.placeholder}
                    value={inputs[field.name] ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, [field.name]: e.target.value }))}
                    className="text-xs min-h-[80px]"
                    required={field.required}
                  />
                ) : field.type === "select" && field.options ? (
                  <Select
                    value={inputs[field.name] ?? ""}
                    onValueChange={(v) => setInputs((p) => ({ ...p, [field.name]: v }))}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder={field.placeholder ?? "Select…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder}
                    value={inputs[field.name] ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, [field.name]: e.target.value }))}
                    className="text-xs h-8"
                    required={field.required}
                  />
                )}
              </div>
            ))}

            {!canAfford && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Not enough credits ({credits ?? 0} / {tool.creditCost} required)
              </p>
            )}

            <Button
              onClick={handleExecute}
              disabled={!canAfford || state === "loading"}
              className="w-full h-8 text-xs shadow-glow"
            >
              {state === "loading" ? (
                <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Running…</>
              ) : (
                <><Play className="mr-1.5 h-3 w-3" />Execute — {tool.creditCost} credits</>
              )}
            </Button>
          </div>
        ) : state === "success" && result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success text-xs font-medium">
              <CheckCircle className="h-4 w-4" />
              Success — {result.creditsCharged} credit{result.creditsCharged !== 1 ? "s" : ""} used
            </div>
            <div className="rounded-lg glass-subtle p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
              {typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output, null, 2)}
            </div>
            <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setState("idle")}>
              Run Again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
              <XCircle className="h-4 w-4" />
              Execution failed
            </div>
            <p className="text-xs text-muted-foreground glass-subtle p-3 rounded-lg">{errorMsg}</p>
            <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setState("idle")}>
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add autohub/apps/web/src/components/dashboard/ToolExecuteDialog.tsx
git commit -m "feat(phase4): ToolExecuteDialog — dynamic input fields, execute, result display"
```

---

## Task 5: Dashboard Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace `apps/web/src/app/(dashboard)/dashboard/page.tsx`**

```tsx
"use client";
import { useState, useMemo } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useTools } from "@/hooks/useTools";
import { useToolQueue } from "@/hooks/useToolQueue";
import { ToolCard } from "@/components/dashboard/ToolCard";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { ToolQueue } from "@/components/dashboard/ToolQueue";
import { LayoutToggle } from "@/components/dashboard/LayoutToggle";
import type { DashboardLayout } from "@/components/dashboard/LayoutToggle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { AITool } from "@/types";
import { TOOL_CATEGORIES } from "@autohub/shared";

export default function DashboardPage() {
  const { credits, loading: creditsLoading } = useCredits();
  const { tools, loading: toolsLoading, favorites, toggleFavorite } = useTools();
  const { queue, isProcessing, addToQueue, processQueue, removeFromQueue, clearCompleted } = useToolQueue();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [layout, setLayout] = useState<DashboardLayout>("compact");
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = tools;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (category !== "all") {
      list = list.filter((t) => t.category === category);
    }
    return list;
  }, [tools, search, category]);

  const openTool = (tool: AITool) => {
    setSelectedTool(tool);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl">Tools</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {toolsLoading ? "Loading…" : `${filtered.length} tools available`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToolQueue
            queue={queue}
            isProcessing={isProcessing}
            onProcess={processQueue}
            onRemove={removeFromQueue}
            onClearCompleted={clearCompleted}
          />
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All categories</SelectItem>
            {TOOL_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tool Grid */}
      {toolsLoading ? (
        <div className={`grid gap-3 ${layout === "list" ? "grid-cols-1" : layout === "comfortable" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className={layout === "list" ? "h-12 rounded-lg" : "h-36 rounded-xl"} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No tools found {search ? `for "${search}"` : ""}
        </div>
      ) : (
        <div className={`grid gap-3 ${layout === "list" ? "grid-cols-1" : layout === "comfortable" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
          {filtered.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              credits={credits ?? 0}
              layout={layout}
              isFavorite={favorites.has(tool.id)}
              onToggleFavorite={() => toggleFavorite(tool.id)}
              onUse={() => openTool(tool)}
              onAddToQueue={(inputData) => addToQueue(tool.id, tool.name, inputData)}
            />
          ))}
        </div>
      )}

      <ToolExecuteDialog
        tool={selectedTool}
        credits={credits}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "autohub/apps/web/src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(phase4): dashboard page — tool grid, search, filter, execute dialog"
```

---

## Task 6: Tool Detail Page (`/tools/[id]`)

**Files:**
- Create: `apps/web/src/app/(dashboard)/tools/[id]/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/(dashboard)/tools/[id]/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCredits } from "@/hooks/useCredits";
import { apiClient } from "@/lib/api-client";
import { ToolExecuteDialog } from "@/components/dashboard/ToolExecuteDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Play, Zap } from "lucide-react";
import Link from "next/link";
import type { AITool } from "@/types";

export default function ToolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { credits } = useCredits();
  const [tool, setTool] = useState<AITool | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!session?.apiToken) return;
    apiClient
      .get<{ data: AITool }>(`/tools/${id}`, session.apiToken)
      .then((res) => setTool(res.data))
      .finally(() => setLoading(false));
  }, [id, session?.apiToken]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Tool not found.{" "}
        <Link href="/dashboard" className="text-primary underline">Back to dashboard</Link>
      </div>
    );
  }

  const canAfford = credits !== null && credits >= tool.creditCost;

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard
      </Link>

      {/* Tool header */}
      <div className="glass rounded-xl p-5 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tool.iconUrl}</span>
            <div>
              <h1 className="font-display font-bold text-lg">{tool.name}</h1>
              <Badge variant="outline" className="text-[10px] mt-1">{tool.category}</Badge>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm font-mono">{tool.creditCost} credits</Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
      </div>

      {/* Execute CTA */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Run this tool</h2>
        {!canAfford && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <Zap className="h-3 w-3" />
            You need {tool.creditCost} credits ({credits ?? 0} available).
          </p>
        )}
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!canAfford}
          className="h-9 text-xs shadow-glow"
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Execute — {tool.creditCost} credits
        </Button>
      </div>

      <ToolExecuteDialog
        tool={tool}
        credits={credits}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "autohub/apps/web/src/app/(dashboard)/tools/[id]/page.tsx"
git commit -m "feat(phase4): tool detail page /tools/[id]"
```

---

## Task 7: Usage History Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/usage/page.tsx`

The API's `GET /tools/usage` route doesn't exist yet. Add it to `tools.ts`.

- [ ] **Step 1: Add usage route to `apps/api/src/routes/tools.ts`**

Add before `export { toolsRouter }`:

```ts
// GET /api/tools/usage — paginated usage history for current user
toolsRouter.get("/usage", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const page = Number(c.req.query("page") ?? 1);
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = (page - 1) * limit;

  const { toolUsages } = await import("../db/schema.js");
  const { desc, count } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(toolUsages)
    .where(eq(toolUsages.userId, user.userId))
    .orderBy(desc(toolUsages.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(toolUsages)
    .where(eq(toolUsages.userId, user.userId));

  return c.json({ data: rows, meta: { page, limit, total: Number(total) } });
});
```

- [ ] **Step 2: Create `apps/web/src/app/(dashboard)/usage/page.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { UsageData } from "@/types";

const PAGE_SIZE = 20;

export default function UsagePage() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsage = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: UsageData[]; meta: { total: number } }>(
        `/tools/usage?page=${page}&limit=${PAGE_SIZE}`,
        session.apiToken
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken, page]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl">Usage History</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{total} total executions</p>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Tool</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Credits</TableHead>
              <TableHead className="text-xs">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              : rows.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-12">
                    No usage history yet. Run a tool to get started.
                  </TableCell>
                </TableRow>
              )
              : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-medium">{row.toolId}</TableCell>
                  <TableCell>
                    {row.status === "success" ? (
                      <Badge variant="outline" className="text-[10px] text-success border-success/30 gap-1">
                        <CheckCircle className="h-2.5 w-2.5" />success
                      </Badge>
                    ) : row.status === "failed" ? (
                      <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 gap-1">
                        <XCircle className="h-2.5 w-2.5" />failed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />{row.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{row.creditsCharged ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check both apps**

```bash
cd autohub && pnpm --filter @autohub/api tsc --noEmit && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add autohub/apps/api/src/routes/tools.ts "autohub/apps/web/src/app/(dashboard)/usage/page.tsx"
git commit -m "feat(phase4): usage history page + GET /tools/usage API route"
```

---

## Task 8: Settings Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/settings/page.tsx`

The API needs `PATCH /auth/profile` and `PATCH /auth/password`. Add them to `auth.ts`.

- [ ] **Step 1: Add profile + password routes to `apps/api/src/routes/auth.ts`**

Add before `export { authRouter }`:

```ts
// PATCH /auth/profile — update fullName
authRouter.patch("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ fullName?: string }>();
  if (!body.fullName?.trim()) return c.json({ error: "fullName is required" }, 400);
  const [updated] = await db
    .update(users)
    .set({ fullName: body.fullName.trim() })
    .where(eq(users.id, user.userId))
    .returning();
  return c.json({ data: { id: updated.id, email: updated.email, fullName: updated.fullName } });
});

// PATCH /auth/password — change password
authRouter.patch("/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!body.currentPassword || !body.newPassword) return c.json({ error: "Both passwords are required" }, 400);
  if (body.newPassword.length < 8) return c.json({ error: "New password must be at least 8 characters" }, 400);

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  const valid = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
  if (!valid) return c.json({ error: "Current password is incorrect" }, 401);

  const newHash = await bcrypt.hash(body.newPassword, 12);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.userId));
  return c.json({ data: { success: true } });
});
```

Also add `requireAuth` import at the top of `auth.ts` if not already present:
```ts
import { requireAuth } from "../middleware/auth.js";
```

- [ ] **Step 2: Create `apps/web/src/app/(dashboard)/settings/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import type { SubscriptionStatus } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [fullName, setFullName] = useState(session?.user.name ?? "");
  const [profileState, setProfileState] = useState<SaveState>("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordState, setPasswordState] = useState<SaveState>("idle");
  const [passwordError, setPasswordError] = useState("");

  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!session?.apiToken) return;
    apiClient
      .get<{ data: SubscriptionStatus }>("/subscriptions/status", session.apiToken)
      .then((res) => setSub(res.data))
      .finally(() => setSubLoading(false));
  }, [session?.apiToken]);

  const saveProfile = async () => {
    if (!session?.apiToken || !fullName.trim()) return;
    setProfileState("saving");
    try {
      await apiClient.patch("/auth/profile", { fullName }, session.apiToken);
      setProfileState("saved");
      setTimeout(() => setProfileState("idle"), 2000);
    } catch {
      setProfileState("error");
    }
  };

  const changePassword = async () => {
    if (!session?.apiToken) return;
    setPasswordError("");
    if (newPassword.length < 8) { setPasswordError("New password must be at least 8 characters"); return; }
    setPasswordState("saving");
    try {
      await apiClient.patch("/auth/password", { currentPassword, newPassword }, session.apiToken);
      setPasswordState("saved");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPasswordState("idle"), 2000);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to update password");
      setPasswordState("error");
    }
  };

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your profile and account</p>
      </div>

      {/* Profile */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Profile</h2>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input value={session?.user.email ?? ""} disabled className="text-xs h-8 bg-muted/50" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Full Name</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            className="text-xs h-8"
          />
        </div>
        <Button onClick={saveProfile} size="sm" className="h-7 text-xs" disabled={profileState === "saving"}>
          {profileState === "saving" ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Saving…</> :
           profileState === "saved" ? <><CheckCircle className="h-3 w-3 mr-1 text-success" />Saved</> :
           profileState === "error" ? <><XCircle className="h-3 w-3 mr-1" />Error</> :
           "Save Profile"}
        </Button>
      </div>

      <Separator />

      {/* Password */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Change Password</h2>
        <div className="space-y-1">
          <Label className="text-xs">Current Password</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="text-xs h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">New Password</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="text-xs h-8" />
        </div>
        {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
        <Button onClick={changePassword} size="sm" className="h-7 text-xs" disabled={passwordState === "saving" || !currentPassword || !newPassword}>
          {passwordState === "saving" ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Updating…</> :
           passwordState === "saved" ? <><CheckCircle className="h-3 w-3 mr-1 text-success" />Updated</> :
           "Update Password"}
        </Button>
      </div>

      <Separator />

      {/* Subscription */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Subscription</h2>
        {subLoading ? (
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        ) : sub?.subscribed ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-[10px]">Active</Badge>
              {sub.cancelAtPeriodEnd && <Badge variant="outline" className="text-[10px] text-warning">Cancels at period end</Badge>}
            </div>
            {sub.subscriptionEnd && (
              <p className="text-xs text-muted-foreground">
                Renews {new Date(sub.subscriptionEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">You are on the free plan.</p>
            <Button size="sm" className="h-7 text-xs" onClick={() => window.location.href = "/payments"}>
              Upgrade to Pro
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check both apps**

```bash
cd autohub && pnpm --filter @autohub/api tsc --noEmit && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add autohub/apps/api/src/routes/auth.ts "autohub/apps/web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(phase4): settings page + PATCH /auth/profile + PATCH /auth/password"
```

---

## Task 9: CommandPalette — Full Implementation

**Files:**
- Modify: `apps/web/src/components/shared/CommandPalette.tsx`

The `CommandPalette` stub currently returns null. Replace it with a working Cmd+K palette built on shadcn's `<Command>` component (cmdk).

- [ ] **Step 1: Replace `apps/web/src/components/shared/CommandPalette.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTools } from "@/hooks/useTools";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { LayoutDashboard, BarChart2, Settings, Wrench } from "lucide-react";
import type { AITool } from "@/types";

interface CommandPaletteProps {
  onSelectTool?: (tool: AITool) => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Usage", href: "/usage", icon: BarChart2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette({ onSelectTool }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { tools } = useTools();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNav = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleTool = (tool: AITool) => {
    setOpen(false);
    if (onSelectTool) {
      onSelectTool(tool);
    } else {
      router.push(`/tools/${tool.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-md overflow-hidden glass">
        <Command className="bg-transparent">
          <CommandInput placeholder="Search tools or navigate…" className="text-xs h-10" />
          <CommandList className="max-h-72">
            <CommandEmpty className="text-xs text-muted-foreground py-6 text-center">No results found.</CommandEmpty>
            <CommandGroup heading="Navigate" className="[&_[cmdk-group-heading]]:text-[10px]">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => handleNav(item.href)}
                  className="text-xs gap-2"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {tools.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Tools" className="[&_[cmdk-group-heading]]:text-[10px]">
                  {tools.slice(0, 20).map((tool) => (
                    <CommandItem
                      key={tool.id}
                      value={`${tool.name} ${tool.description} ${tool.category}`}
                      onSelect={() => handleTool(tool)}
                      className="text-xs gap-2"
                    >
                      <span className="text-base w-5 text-center">{tool.iconUrl}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-muted-foreground ml-1.5 text-[10px]">{tool.category}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{tool.creditCost} cr</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
```

- [ ] **Step 2: Mount CommandPalette in the dashboard layout**

In `apps/web/src/app/(dashboard)/layout.tsx`, import and render `CommandPalette` inside the layout so it's available on all dashboard pages:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarClient } from "@/components/dashboard/SidebarClient";
import { CommandPalette } from "@/components/shared/CommandPalette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarClient user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }} />
      <main className="flex-1 overflow-auto">{children}</main>
      <CommandPalette />
    </div>
  );
}
```

> Note: `CommandPalette` is a client component (`"use client"`) and can be rendered inside a server component layout — Next.js handles the boundary automatically.

- [ ] **Step 3: Type-check**

```bash
cd autohub && pnpm --filter @autohub/web tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add autohub/apps/web/src/components/shared/CommandPalette.tsx "autohub/apps/web/src/app/(dashboard)/layout.tsx"
git commit -m "feat(phase4): CommandPalette — Cmd+K tool search + navigation"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Sidebar with nav, credits, sign-out | Task 1 |
| `GET /credits` API route | Task 1 |
| useCredits hook | Task 1 |
| useTools hook with favorites | Task 2 |
| useToolQueue full implementation | Task 3 |
| ToolExecuteDialog — dynamic inputs, execute, result | Task 4 |
| `/dashboard` page — grid, search, filter, layout toggle | Task 5 |
| `/tools/[id]` detail page | Task 6 |
| `/usage` page — paginated table | Task 7 |
| `GET /tools/usage` API route | Task 7 |
| `/settings` page — profile + password + subscription | Task 8 |
| `PATCH /auth/profile` + `PATCH /auth/password` | Task 8 |
| CommandPalette — Cmd+K, tool search, navigation | Task 9 |
| CommandPalette mounted in layout | Task 9 |

All spec items covered. No TODOs or stubs remaining in Phase 4 scope.

### Type consistency check

- `QueueItem.creditsUsed` in `useToolQueue.ts` vs `ToolExecutionResult.creditsCharged` in the dialog: the dialog correctly reads `res.data.creditsCharged` and maps it to `creditsUsed` in queue items. Consistent.
- `AITool.inputFields` is typed in `@autohub/shared` as `InputField[]` (array). Both `ToolCard` and `ToolExecuteDialog` normalize it with an `Array.isArray` guard. Consistent.
- `session.apiToken` — typed in `@/lib/auth.ts` module augmentation. All client hooks access it as `session?.apiToken`. Consistent.
- `SubscriptionStatus` type from shared — used in settings page. The API returns `{ subscribed, status, subscriptionEnd, cancelAtPeriodEnd }`. Type matches.
