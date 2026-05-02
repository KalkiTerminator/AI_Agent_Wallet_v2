/**
 * CLI script to promote a user to admin. Use this in production instead of the HTTP route.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/promote-admin.ts user@example.com
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, userRoles } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/promote-admin.ts <email>");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const [updated] = await db
  .update(userRoles)
  .set({ role: "admin", isOwner: true })
  .where(eq(userRoles.userId, user.id))
  .returning();

if (!updated) {
  console.error("User role row not found — was the user created properly?");
  process.exit(1);
}

console.log(`Promoted ${email} to admin (userId: ${user.id})`);
await pool.end();
