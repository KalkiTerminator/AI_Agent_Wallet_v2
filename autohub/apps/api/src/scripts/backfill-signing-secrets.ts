import "dotenv/config";
import "./instrument.js";
import { randomBytes } from "crypto";
import { isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiTools, users } from "../db/schema.js";
import { encrypt } from "../services/crypto.js";
import { sendSigningSecretRotationEmail } from "../services/email.js";
import { eq } from "drizzle-orm";

async function main() {
  console.log("[backfill-signing-secrets] Starting");

  // Only process tools that don't yet have the new encrypted secret
  const tools = await db
    .select({
      id: aiTools.id,
      name: aiTools.name,
      createdByUserId: aiTools.createdByUserId,
    })
    .from(aiTools)
    .where(isNull(aiTools.signingSecretEncrypted));

  console.log(`[backfill-signing-secrets] Found ${tools.length} tools to backfill`);

  let success = 0;
  let failed = 0;

  for (const tool of tools) {
    try {
      const plainSecret = randomBytes(32).toString("hex");
      const signingSecretEncrypted = await encrypt(plainSecret);

      await db
        .update(aiTools)
        .set({ signingSecretEncrypted, updatedAt: new Date() })
        .where(eq(aiTools.id, tool.id));

      // Notify creator if known
      if (tool.createdByUserId) {
        const [creator] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, tool.createdByUserId))
          .limit(1);

        if (creator?.email) {
          await sendSigningSecretRotationEmail(creator.email, tool.name, plainSecret).catch((err) => {
            console.warn(`[backfill-signing-secrets] Email failed for tool ${tool.id}:`, err.message);
          });
        }
      }

      console.log(`[backfill-signing-secrets] Backfilled tool ${tool.id}`);
      success++;
    } catch (err) {
      console.error(`[backfill-signing-secrets] Failed tool ${tool.id}:`, err);
      failed++;
    }
  }

  console.log(`[backfill-signing-secrets] Done. success=${success} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-signing-secrets] Fatal:", err);
  process.exit(1);
});
