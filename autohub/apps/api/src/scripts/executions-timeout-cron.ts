import "dotenv/config";
import { expireStuckExecutions } from "../services/executions-timeout.js";

async function main() {
  console.log("[executions-timeout-cron] Starting");
  const count = await expireStuckExecutions();
  console.log(`[executions-timeout-cron] Expired ${count} stuck executions`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[executions-timeout-cron] Fatal error:", err);
  process.exit(1);
});
