import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { executions, aiTools, credits, userRoles } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { verifySignature } from "../services/hmac.js";

const executionsRouter = new Hono();

// GET /api/executions/:id — poll execution status
executionsRouter.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const [execution] = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!execution) return c.json({ error: "Not found" }, 404);
  if (execution.userId !== user.userId && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({ data: execution });
});

// POST /api/executions/:id/callback — n8n posts result here
executionsRouter.post("/:id/callback", async (c) => {
  const { id } = c.req.param();
  const rawBody = await c.req.text();
  const timestamp = c.req.header("x-autohub-timestamp") ?? "";
  const signature = c.req.header("x-autohub-signature") ?? "";

  const [execution] = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!execution) return c.json({ error: "Not found" }, 404);

  // Idempotent: already terminal
  if (["success", "failed", "timeout"].includes(execution.status)) {
    return c.json({ ok: true });
  }

  const [tool] = await db.select().from(aiTools).where(eq(aiTools.id, execution.toolId)).limit(1);
  if (!tool) return c.json({ error: "Tool not found" }, 404);

  if (tool.signingSecretHash && signature) {
    const valid = verifySignature({
      secret: tool.signingSecretHash,
      timestamp,
      executionId: id,
      rawBody,
      signature,
    });
    if (!valid) return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody) as { success?: boolean; output?: unknown; error?: string };
  const isSuccess = payload.success !== false;

  if (isSuccess) {
    const [userRoleRow] = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, execution.userId))
      .limit(1);
    const shouldDebit = userRoleRow?.role !== "admin";

    if (shouldDebit) {
      await db.execute(
        sql`UPDATE credits SET current_credits = current_credits - ${tool.creditCost} WHERE user_id = ${execution.userId} AND current_credits >= ${tool.creditCost}`
      );
    }

    await db.update(executions)
      .set({
        status: "success",
        responsePayload: payload.output ?? payload,
        creditsDebited: shouldDebit ? tool.creditCost : 0,
        completedAt: new Date(),
      })
      .where(eq(executions.id, id));
  } else {
    await db.update(executions)
      .set({ status: "failed", error: payload.error ?? "Webhook reported failure", completedAt: new Date() })
      .where(eq(executions.id, id));
  }

  return c.json({ ok: true });
});

export { executionsRouter };
