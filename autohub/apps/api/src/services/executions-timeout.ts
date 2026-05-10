import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { executions } from "../db/schema.js";
import { logAuditEvent } from "./audit.js";

export async function expireStuckExecutions(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60_000);

  const expired = await db
    .update(executions)
    .set({ status: "timeout", error: "Async webhook callback never arrived", completedAt: new Date() })
    .where(and(eq(executions.status, "pending"), lt(executions.startedAt, cutoff)))
    .returning({ id: executions.id, userId: executions.userId, toolId: executions.toolId });

  for (const row of expired) {
    await logAuditEvent({
      userId: row.userId,
      action: "execution.timeout",
      resourceType: "execution",
      resourceId: row.id,
    });
  }

  return expired.length;
}
