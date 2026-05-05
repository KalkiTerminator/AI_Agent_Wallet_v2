# Encryption Key Rotation Runbook

## When to rotate
- Suspected key compromise
- Staff offboarding with key access
- Annual rotation policy

## Encrypted columns

| Table | Column |
|-------|--------|
| `ai_tools` | `webhook_url_encrypted` |
| `ai_tools` | `auth_header_encrypted` |
| `users` | `mfa_secret_encrypted` |

## Steps

### 1. Generate new key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Add new key to Railway (keep old key active)
Railway → Variables → add `NEW_ENCRYPTION_KEY=<new value>` → Save.
Do NOT remove `ENCRYPTION_KEY` yet — the running service still needs it to decrypt existing rows.

### 3. Re-encrypt all rows (run against production DB)
```ts
// scripts/rotate-encryption-key.ts
import { decrypt, encrypt } from "../src/services/crypto.js";
import { db } from "../src/db/index.js";
import { aiTools, users } from "../src/db/schema.js";
import { eq, isNotNull } from "drizzle-orm";

const OLD_KEY = process.env.ENCRYPTION_KEY!;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY!;

const oldProvider = { getKey: async () => Buffer.from(OLD_KEY, "hex") };
const newProvider = { getKey: async () => Buffer.from(NEW_KEY, "hex") };

// Re-encrypt ai_tools
const tools = await db.select().from(aiTools);
for (const tool of tools) {
  const updates: Record<string, string> = {};
  if (tool.webhookUrlEncrypted) {
    updates.webhookUrlEncrypted = await encrypt(await decrypt(tool.webhookUrlEncrypted, oldProvider), newProvider);
  }
  if (tool.authHeaderEncrypted) {
    updates.authHeaderEncrypted = await encrypt(await decrypt(tool.authHeaderEncrypted, oldProvider), newProvider);
  }
  if (Object.keys(updates).length) {
    await db.update(aiTools).set(updates).where(eq(aiTools.id, tool.id));
  }
}

// Re-encrypt users.mfa_secret_encrypted
const mfaUsers = await db.select({ id: users.id, mfaSecretEncrypted: users.mfaSecretEncrypted })
  .from(users).where(isNotNull(users.mfaSecretEncrypted));
for (const u of mfaUsers) {
  if (u.mfaSecretEncrypted) {
    const reencrypted = await encrypt(await decrypt(u.mfaSecretEncrypted, oldProvider), newProvider);
    await db.update(users).set({ mfaSecretEncrypted: reencrypted }).where(eq(users.id, u.id));
  }
}

console.log("Re-encryption complete");
```

### 4. Promote new key and remove old key
Railway → Variables → rename `NEW_ENCRYPTION_KEY` to `ENCRYPTION_KEY` (remove old value) → Save.
This triggers a redeploy. All rows are already encrypted with the new key, so no decrypt errors occur.

### 5. Verify
Hit `/health`, execute a tool, complete an MFA challenge — confirm no decrypt errors in logs.
