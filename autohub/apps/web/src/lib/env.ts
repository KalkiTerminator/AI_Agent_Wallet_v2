import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url("must be a valid URL")
    .refine(
      (v) => !isProduction || !v.includes("localhost"),
      "NEXT_PUBLIC_API_URL must not point to localhost in production"
    ),
  NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: z
    .string()
    .regex(/^price_/, "must start with 'price_'")
    .optional(),
});

function validateEnv() {
  const result = schema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Web environment validation failed:\n${issues}`);
  }

  return result.data;
}

export const env = validateEnv();
