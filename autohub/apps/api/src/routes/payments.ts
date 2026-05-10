import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitIpStrict } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import Stripe from "stripe";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const CreditPackSchema = z.object({ pack: z.enum(["100", "500", "1000"]) });
const SubscriptionSchema = z.object({ priceId: z.string().regex(/^price_/).max(100) });

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const toolsRouter = new Hono();

toolsRouter.post("/checkout/credits", requireAuth, rateLimitIpStrict(RATE_LIMITS.PAYMENT_ACTIONS), zValidator("json", CreditPackSchema), async (c) => {
  const user = c.get("user");
  const { pack } = c.req.valid("json");

  const packMap: Record<string, { credits: number; price: number }> = {
    "100": { credits: 100, price: 999 },
    "500": { credits: 500, price: 3999 },
    "1000": { credits: 1000, price: 6999 },
  };

  const selected = packMap[pack];
  if (!selected) return c.json({ error: "Invalid credit pack" }, 400);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: selected.price,
          product_data: { name: `${selected.credits} AutoHub Credits`, description: `Purchase ${selected.credits} credits for AutoHub tools` },
        },
        quantity: 1,
      },
    ],
    metadata: { userId: user.userId, credits: String(selected.credits), type: "credit_purchase" },
    success_url: `${env.AUTOHUB_WEB_URL}/dashboard?payment=success`,
    cancel_url: `${env.AUTOHUB_WEB_URL}/dashboard?payment=cancelled`,
  });

  return c.json({ url: session.url });
});

toolsRouter.post("/checkout/subscription", requireAuth, rateLimitIpStrict(RATE_LIMITS.PAYMENT_ACTIONS), zValidator("json", SubscriptionSchema), async (c) => {
  const user = c.get("user");
  const { priceId } = c.req.valid("json");

  if (env.STRIPE_ALLOWED_PRICE_IDS.length > 0 && !env.STRIPE_ALLOWED_PRICE_IDS.includes(priceId)) {
    return c.json({ error: "Invalid price ID" }, 400);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: user.userId, type: "subscription" },
    success_url: `${env.AUTOHUB_WEB_URL}/dashboard?payment=success`,
    cancel_url: `${env.AUTOHUB_WEB_URL}/dashboard?payment=cancelled`,
  });

  return c.json({ url: session.url });
});

toolsRouter.post("/portal", requireAuth, rateLimitIpStrict(RATE_LIMITS.PAYMENT_ACTIONS), async (c) => {
  const user = c.get("user");

  const [userRow] = await db.select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  if (!userRow?.stripeCustomerId) {
    return c.json({ error: "No billing account found. Please contact support." }, 400);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: userRow.stripeCustomerId,
    return_url: `${env.AUTOHUB_WEB_URL}/settings`,
  });

  return c.json({ url: session.url });
});

export { toolsRouter as paymentsRouter };
