import { z } from "zod";

const hexKey64 = z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex chars (32-byte AES key)");

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_KEY: hexKey64,
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  AUTOHUB_WEB_URL: z.string().url(),
  AUTOHUB_API_URL: z.string().url(),
  // Required in production; optional in dev (missing → warning above in rate-limit)
  REDIS_URL: z.string().optional(),
  // Optional with production warning
  SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SEED_SECRET: z.string().optional(),
  // Email
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  // CORS
  AUTOHUB_CORS_ORIGINS: z.string().optional(),
  // Stripe allowlisted price IDs (comma-separated)
  STRIPE_ALLOWED_PRICE_IDS: z.string().optional().transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().optional(),
});

function validateEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  const data = result.data;

  if (data.NODE_ENV === "production") {
    if (!data.REDIS_URL) {
      throw new Error("Environment validation failed:\n  REDIS_URL: required in production");
    }
    const warns: string[] = [];
    if (!data.SENTRY_DSN) warns.push("SENTRY_DSN");
    if (warns.length > 0) {
      console.warn(`[env] WARNING: missing optional vars in production: ${warns.join(", ")}`);
    }
  }

  return data;
}

export const env = validateEnv();
