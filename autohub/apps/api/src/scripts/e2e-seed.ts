/**
 * E2E seed script — creates two test users in the DB for Playwright tests.
 *
 * Usage:
 *   cd autohub/apps/api
 *   DATABASE_URL=<url> npx tsx src/scripts/e2e-seed.ts
 *
 * Safe to run repeatedly — upserts, never duplicates.
 *
 * Users created:
 *   e2e@autohub.test      / e2epassword123   role: user   (10 credits)
 *   admin-e2e@autohub.test / e2epassword123   role: admin  (10 credits)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../db/schema.js";

const { users, userRoles, credits, emailVerificationTokens } = schema;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const PASSWORD_HASH = await bcrypt.hash("e2epassword123", 12);

const TEST_USERS = [
  { email: "e2e@autohub.test", fullName: "E2E User", role: "user" as const },
  { email: "admin-e2e@autohub.test", fullName: "E2E Admin", role: "admin" as const },
];

for (const u of TEST_USERS) {
  const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);

  let userId: string;

  if (existing.length > 0) {
    userId = existing[0].id;
    // Ensure email is verified, user is active, and onboarding is complete
    await db.update(users)
      .set({ emailVerifiedAt: new Date(), isActive: true, deletedAt: null, onboardedAt: new Date() })
      .where(eq(users.id, userId));
    console.log(`[seed] updated  ${u.email}`);
  } else {
    const [inserted] = await db.insert(users).values({
      email: u.email,
      passwordHash: PASSWORD_HASH,
      fullName: u.fullName,
      emailVerifiedAt: new Date(),
      onboardedAt: new Date(),
      isActive: true,
    }).returning();
    userId = inserted.id;

    await db.insert(userRoles).values({ userId, role: u.role });
    await db.insert(credits).values({ userId, currentCredits: 10 });
    console.log(`[seed] created  ${u.email} (${u.role})`);
  }

  // Remove any stale verification tokens so login isn't blocked
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId)).catch(() => null);
}

await pool.end();
console.log("[seed] done");
