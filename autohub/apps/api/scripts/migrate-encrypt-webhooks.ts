/**
 * One-time migration: encrypts existing plain-text webhookUrl values.
 * Run ONCE after deploying the schema change and setting ENCRYPTION_KEY.
 *
 * Usage:
 *   DATABASE_URL=... ENCRYPTION_KEY=... npx tsx scripts/migrate-encrypt-webhooks.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { aiTools } from "../src/db/schema.js";
import { isNotNull, isNull } from "drizzle-orm";
import { encrypt, isEncrypted } from "../src/services/crypto.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  // Find all rows with a plain webhookUrl but no webhookUrlEncrypted yet
  const rows = await db
    .select({ id: aiTools.id, webhookUrl: aiTools.webhookUrl, webhookUrlEncrypted: aiTools.webhookUrlEncrypted })
    .from(aiTools);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.webhookUrlEncrypted) {
      skipped++;
      continue;
    }
    if (!row.webhookUrl) {
      skipped++;
      continue;
    }
    if (isEncrypted(row.webhookUrl)) {
      // Already encrypted in old column — move it
      await db.update(aiTools)
        .set({ webhookUrlEncrypted: row.webhookUrl, webhookUrl: null })
        // @ts-ignore drizzle dynamic update
        .where(/* eq */ (t: typeof aiTools) => t.id === row.id);
      migrated++;
      continue;
    }

    const encrypted = encrypt(row.webhookUrl);
    await pool.query(
      "UPDATE ai_tools SET webhook_url_encrypted = $1, webhook_url = NULL WHERE id = $2",
      [encrypted, row.id]
    );
    migrated++;
  }

  console.log(`Migration complete: ${migrated} encrypted, ${skipped} skipped.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
