import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitIp } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "@autohub/shared";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const toolsRouter = new Hono();

toolsRouter.post("/checkout/credits", requireAuth, rateLimitIp(RATE_LIMITS.PAYMENT_ACTIONS), async (c) => {
  const user = c.get("user");
  const { pack } = await c.req.json();

  const packMap: Record<string, { credits: number; price: number }> = {
    "100": { credits: 100, price: 999 },
    "500": { credits: 500, price: 3999 },
    "1000": { credits: 1000, price: 6999 },
  };

  const selected = packMap[pack as string];
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
    success_url: `${process.env.AUTOHUB_WEB_URL}/dashboard?payment=success`,
    cancel_url: `${process.env.AUTOHUB_WEB_URL}/dashboard?payment=cancelled`,
  });

  return c.json({ url: session.url });
});

toolsRouter.post("/checkout/subscription", requireAuth, rateLimitIp(RATE_LIMITS.PAYMENT_ACTIONS), async (c) => {
  const user = c.get("user");
  const { priceId } = await c.req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: user.userId, type: "subscription" },
    success_url: `${process.env.AUTOHUB_WEB_URL}/dashboard?payment=success`,
    cancel_url: `${process.env.AUTOHUB_WEB_URL}/dashboard?payment=cancelled`,
  });

  return c.json({ url: session.url });
});

toolsRouter.post("/portal", requireAuth, rateLimitIp(RATE_LIMITS.PAYMENT_ACTIONS), async (c) => {
  const user = c.get("user");
  const { stripeCustomerId } = await c.req.json();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.AUTOHUB_WEB_URL}/settings`,
  });

  return c.json({ url: session.url });
});

export { toolsRouter as paymentsRouter };
