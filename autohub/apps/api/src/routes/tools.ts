import { Hono } from "hono";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, toolUsages } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import { ToolExecutionService } from "../services/tool-execution.js";

const toolsRouter = new Hono();

// GET /api/tools — list approved active tools
toolsRouter.get("/", rateLimit(RATE_LIMITS.READS), async (c) => {
  const tools = await db
    .select()
    .from(aiTools)
    .where(and(eq(aiTools.isActive, true), eq(aiTools.approvalStatus, "approved")));
  return c.json({ data: tools });
});

// GET /api/tools/mine — tools created by current user
toolsRouter.get("/mine", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const tools = await db.select().from(aiTools).where(eq(aiTools.createdByUserId, user.userId));
  return c.json({ data: tools });
});

// GET /api/tools/usage — paginated usage history for current user
toolsRouter.get("/usage", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = (page - 1) * limit;

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

// POST /api/tools — submit a new tool (approval required)
toolsRouter.post("/", requireAuth, rateLimit(RATE_LIMITS.READS), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name: string;
    description: string;
    category: string;
    creditCost?: number;
    inputFields?: unknown[];
    iconUrl?: string;
    webhookUrl?: string;
    outputType?: string;
    webhookTimeout?: number;
    webhookRetries?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
  if (!body.description?.trim()) return c.json({ error: "description is required" }, 400);
  if (!body.category?.trim()) return c.json({ error: "category is required" }, 400);

  const [tool] = await db
    .insert(aiTools)
    .values({
      name: body.name.trim(),
      description: body.description.trim(),
      category: body.category,
      creditCost: body.creditCost ?? 1,
      inputFields: body.inputFields ?? [],
      iconUrl: body.iconUrl ?? null,
      webhookUrl: body.webhookUrl ?? null,
      hasWebhook: !!body.webhookUrl,
      outputType: body.outputType ?? "smart",
      webhookTimeout: body.webhookTimeout ?? 30,
      webhookRetries: body.webhookRetries ?? 2,
      approvalStatus: "pending",
      isActive: false,
      createdByUserId: user.userId,
    })
    .returning();

  return c.json({ data: tool }, 201);
});

// GET /api/tools/:id
toolsRouter.get("/:id", rateLimit(RATE_LIMITS.READS), async (c) => {
  const id = c.req.param("id");
  const [tool] = await db.select().from(aiTools).where(eq(aiTools.id, id)).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  return c.json({ data: tool });
});

// POST /api/tools/:id/execute — two-phase commit execution
toolsRouter.post("/:id/execute", requireAuth, rateLimit(RATE_LIMITS.TOOL_EXECUTE), async (c) => {
  const toolId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json();
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined;

  const result = await ToolExecutionService.execute({ toolId, userId: user.userId, inputs: body.inputs ?? {}, ip });
  return c.json({ data: result });
});

export { toolsRouter };
