# Encryption Key Rotation Runbook

## When to rotate
- Suspected key compromise
- Staff offboarding with key access
- Annual rotation policy

## Steps

### 1. Generate new key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Re-encrypt all rows (run against production DB)
```ts
// scripts/rotate-encryption-key.ts
import { decrypt, encrypt } from "../src/services/crypto.js";
import { db } from "../src/db/index.js";
import { aiTools } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const OLD_KEY = process.env.OLD_ENCRYPTION_KEY!;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY!;

const oldProvider = { getKey: async () => Buffer.from(OLD_KEY, "hex") };
const newProvider = { getKey: async () => Buffer.from(NEW_KEY, "hex") };

const tools = await db.select().from(aiTools);
for (const tool of tools) {
  if (tool.webhookUrlEncrypted) {
    const plain = await decrypt(tool.webhookUrlEncrypted, oldProvider);
    const reencrypted = await encrypt(plain, newProvider);
    await db.update(aiTools).set({ webhookUrlEncrypted: reencrypted }).where(eq(aiTools.id, tool.id));
  }
}
console.log("Re-encryption complete");
```

### 3. Update Railway env var
Railway → Variables → ENCRYPTION_KEY → new value → Save (triggers redeploy)

### 4. Verify
Hit /health, execute a tool — confirm no decrypt errors in logs.
