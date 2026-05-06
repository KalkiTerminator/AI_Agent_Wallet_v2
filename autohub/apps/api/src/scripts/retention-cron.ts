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
