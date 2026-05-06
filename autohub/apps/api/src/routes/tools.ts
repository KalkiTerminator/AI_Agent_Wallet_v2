import { Hono } from "hono";
import { eq, and, desc, count, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { db } from "../db/index.js";
import { aiTools, toolUsages, toolAccess, webhookDomains } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { requireVerified } from "../middleware/require-verified.js";
import { rateLimitIp, rateLimitUser } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import { ToolExecutionService } from "../services/tool-execution.js";
import { validateOutboundUrl, SSRFError } from "../services/url-guard.js";
import { encrypt, maskUrl } from "../services/crypto.js";
import { logAuditEvent } from "../services/audit.js";

const toolsRouter = new Hono();

function sanitizeToolForClient(tool: typeof aiTools.$inferSelect) {
  return {
    ...tool,
    webhookUrl: undefined,
    webhookUrlEncrypted: undefined,
    authHeaderEncrypted: undefined,
    hasAuthHeader: !!tool.authHeaderEncrypted,
  };
}

// GET /api/tools — list approved active tools
toolsRouter.get("/", rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const tools = await db
    .select()
    .from(aiTools)
    .where(and(eq(aiTools.isActive, true), eq(aiTools.approvalStatus, "approved"), isNull(aiTools.deletedAt)));
  return c.json({ data: tools.map(sanitizeToolForClient) });
});

// GET /api/tools/mine — tools created by current user
toolsRouter.get("/mine", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const tools = await db.select().from(aiTools).where(and(eq(aiTools.createdByUserId, user.userId), isNull(aiTools.deletedAt)));
  return c.json({ data: tools });
});

// GET /api/tools/usage — paginated usage history for current user
toolsRouter.get("/usage", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(toolUsages)
    .where(and(eq(toolUsages.userId, user.userId), isNull(toolUsages.deletedAt)))
    .orderBy(desc(toolUsages.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(toolUsages)
    .where(and(eq(toolUsages.userId, user.userId), isNull(toolUsages.deletedAt)));

  return c.json({ data: rows, meta: { page, limit, total: Number(total) } });
});

// POST /api/tools — submit a new tool (approval required)
toolsRouter.post("/", requireAuth, rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name: string;
    description: string;
    category: string;
    creditCost?: number;
    inputFields?: unknown[];
    iconUrl?: string;
    webhookUrl?: string;
    authHeader?: string; // e.g. "Authorization: Bearer xyz" — stored encrypted
    outputType?: string;
    webhookTimeout?: number;
    webhookRetries?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
  if (!body.description?.trim()) return c.json({ error: "description is required" }, 400);
  if (!body.category?.trim()) return c.json({ error: "category is required" }, 400);

  // Validate webhook URL for SSRF before storing
  if (body.webhookUrl) {
    try {
      await validateOutboundUrl(body.webhookUrl);
    } catch (err) {
      if (err instanceof SSRFError) {
        return c.json({ error: `Invalid webhook URL: ${err.message}` }, 400);
      }
      return c.json({ error: "Webhook URL validation failed" }, 400);
    }
  }

  const webhookUrlEncrypted = body.webhookUrl ? await encrypt(body.webhookUrl) : null;
  const authHeaderEncrypted = body.authHeader ? await encrypt(body.authHeader) : null;

  const [tool] = await db
    .insert(aiTools)
    .values({
      name: body.name.trim(),
      description: body.description.trim(),
      category: body.category,
      creditCost: body.creditCost ?? 1,
      inputFields: body.inputFields ?? [],
      iconUrl: body.iconUrl ?? null,
      webhookUrl: null, // no longer store plain text
      webhookUrlEncrypted,
      authHeaderEncrypted,
      hasWebhook: !!body.webhookUrl,
      outputType: body.outputType ?? "smart",
      webhookTimeout: body.webhookTimeout ?? 30,
      webhookRetries: body.webhookRetries ?? 2,
      approvalStatus: "pending",
      isActive: false,
      createdByUserId: user.userId,
    })
    .returning();

  // Return masked URL — never return plaintext or encrypted blob to client
  const safeData = {
    ...tool,
    webhookUrlEncrypted: undefined,
    authHeaderEncrypted: undefined,
    webhookUrl: undefined,
    webhookUrlMasked: body.webhookUrl ? maskUrl(body.webhookUrl) : null,
    hasAuthHeader: !!body.authHeader,
  };

  return c.json({ data: safeData }, 201);
});

// PATCH /api/tools/:id/submit — moderator submits draft for approval
toolsRouter.patch("/:id/submit", requireAuth, requireRole("moderator"), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  if (tool.createdByUserId !== user.userId && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  // Gate: non-admin tool creators must have a verified webhook domain
  if (user.role !== "admin" && tool.webhookUrlEncrypted) {
    const verifiedDomain = await db
      .select()
      .from(webhookDomains)
      .where(and(eq(webhookDomains.ownerUserId, user.userId), eq(webhookDomains.status, "verified")))
      .limit(1);
    if (verifiedDomain.length === 0) {
      return c.json({ error: "You must verify a webhook domain before submitting a tool for approval. Use POST /api/tools/domains to register your domain." }, 400);
    }
  }
  if (tool.toolStatus !== "draft" && tool.toolStatus !== "rejected") {
    return c.json({ error: "Tool must be in draft or rejected state" }, 400);
  }
  const [updated] = await db
    .update(aiTools)
    .set({ toolStatus: "pending_approval", rejectionReason: null, updatedAt: new Date() })
    .where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt)))
    .returning();
  return c.json({ data: updated });
});

// PATCH /api/tools/:id/status — admin approves/rejects/archives
toolsRouter.patch("/:id/status", requireAuth, requireRole("admin"), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ status: "approved" | "rejected" | "archived"; reason?: string }>();
  if (!["approved", "rejected", "archived"].includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }
  const updates: Partial<typeof aiTools.$inferInsert> = {
    toolStatus: body.status,
    updatedAt: new Date(),
  };
  if (body.status === "approved") {
    updates.approvalStatus = "approved";
    updates.isActive = true;
    updates.rejectionReason = null;
  }
  if (body.status === "rejected") {
    updates.approvalStatus = "rejected";
    updates.isActive = false;
    updates.rejectionReason = body.reason ?? null;
  }
  if (body.status === "archived") {
    updates.isActive = false;
  }
  const [updated] = await db.update(aiTools).set(updates).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).returning();
  if (!updated) return c.json({ error: "Tool not found" }, 404);
  return c.json({ data: updated });
});

// PATCH /api/tools/:id/visibility — moderator/admin toggles public/private
toolsRouter.patch("/:id/visibility", requireAuth, requireRole("moderator"), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ visibility: "private" | "public" }>();
  if (!["private", "public"].includes(body.visibility)) {
    return c.json({ error: "Invalid visibility" }, 400);
  }
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  if (tool.createdByUserId !== user.userId && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const updates: Partial<typeof aiTools.$inferInsert> = { visibility: body.visibility, updatedAt: new Date() };
  if (body.visibility === "public" && tool.toolStatus === "approved") {
    updates.toolStatus = "pending_approval";
    updates.approvalStatus = "pending";
    updates.isActive = false;
  }
  const [updated] = await db.update(aiTools).set(updates).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).returning();
  return c.json({ data: updated });
});

// POST /api/tools/:id/access — moderator grants access to a user
toolsRouter.post("/:id/access", requireAuth, requireRole("moderator"), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ userId: string }>();
  if (!body.userId) return c.json({ error: "userId is required" }, 400);
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  if (tool.createdByUserId !== user.userId && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.insert(toolAccess).values({ toolId: id, userId: body.userId, grantedBy: user.userId }).onConflictDoNothing();
  return c.json({ data: { toolId: id, userId: body.userId } }, 201);
});

// DELETE /api/tools/:id/access/:userId — moderator revokes access
toolsRouter.delete("/:id/access/:userId", requireAuth, requireRole("moderator"), async (c) => {
  const user = c.get("user");
  const { id, userId } = c.req.param();
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  if (tool.createdByUserId !== user.userId && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.delete(toolAccess).where(and(eq(toolAccess.toolId, id), eq(toolAccess.userId, userId)));
  return c.json({ data: { success: true } });
});

// POST /api/tools/domains — register a webhook domain
toolsRouter.post("/domains", requireAuth, rateLimitIp(5, 60_000), async (c) => {
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

  // Check if another user already owns this domain
  const [crossUserRecord] = await db
    .select({ ownerUserId: webhookDomains.ownerUserId })
    .from(webhookDomains)
    .where(eq(webhookDomains.domain, rootDomain))
    .limit(1);

  if (crossUserRecord && crossUserRecord.ownerUserId !== user.userId) {
    return c.json({ error: "This domain is already registered by another user." }, 409);
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

// GET /api/tools/:id
toolsRouter.get("/:id", rateLimitIp(RATE_LIMITS.READS), async (c) => {
  const id = c.req.param("id");
  const [tool] = await db.select().from(aiTools).where(and(eq(aiTools.id, id), isNull(aiTools.deletedAt))).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  return c.json({ data: sanitizeToolForClient(tool) });
});

// POST /api/tools/:id/execute — two-phase commit execution
toolsRouter.post("/:id/execute", requireAuth, requireVerified, rateLimitIp(RATE_LIMITS.TOOL_EXECUTE), rateLimitUser(30, 60_000), async (c) => {
  const toolId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json();
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined;

  const result = await ToolExecutionService.execute({ toolId, userId: user.userId, userRole: user.role, inputs: body.inputs ?? {}, ip });
  return c.json({ data: result });
});

export { toolsRouter };
