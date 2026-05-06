import { Hono } from "hono";
import Stripe from "stripe";
import { eq, sql, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { payments, subscriptions, users, subscriptionInvoices } from "../db/schema.js";
import { logAuditEvent } from "../services/audit.js";
import { SUBSCRIPTION_MONTHLY_CREDITS } from "@autohub/shared";

const webhooksRouter = new Hono();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

webhooksRouter.post("/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, credits: creditAmount, type } = session.metadata ?? {};

      if (type === "credit_purchase" && userId && creditAmount) {
        const existing = await db.select().from(payments).where(eq(payments.stripeSessionId, session.id)).limit(1);
        if (existing.length === 0) {
          await db.insert(payments).values({
            userId,
            stripeSessionId: session.id,
            amount: session.amount_total ?? 0,
            status: "completed",
            creditsGranted: Number(creditAmount),
          });
          await db.execute(sql`UPDATE credits SET current_credits = current_credits + ${Number(creditAmount)} WHERE user_id = ${userId}`);
          await logAuditEvent({
            userId,
            action: "payment.completed",
            resourceType: "payment",
            resourceId: session.id,
            metadata: { credits: creditAmount, amountCents: session.amount_total },
          });
        }
      }

      if (type === "subscription" && userId && session.customer) {
        // Store stripeCustomerId — credits granted exclusively by invoice.paid
        await db
          .update(users)
          .set({ stripeCustomerId: session.customer as string })
          .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)));

        const existing = await db.select().from(payments).where(eq(payments.stripeSessionId, session.id)).limit(1);
        if (existing.length === 0) {
          await db.insert(payments).values({
            userId,
            stripeSessionId: session.id,
            amount: session.amount_total ?? 0,
            status: "completed",
            creditsGranted: 0,
          });
        }
      }
      break;
    }

    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const [userRow] = await db
        .select()
        .from(users)
        .where(and(eq(users.stripeCustomerId, sub.customer as string), isNull(users.deletedAt)))
        .limit(1);
      if (userRow) {
        await db
          .insert(subscriptions)
          .values({
            userId: userRow.id,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            status: sub.status as any,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: {
              status: sub.status as any,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            },
          });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string))
        .limit(1);

      if (!sub || sub.status !== "active") break;

      // Idempotency check
      const [existing] = await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.stripeInvoiceId, invoice.id))
        .limit(1);
      if (existing) break;

      await db.insert(subscriptionInvoices).values({
        userId: sub.userId,
        stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_paid,
        creditsGranted: SUBSCRIPTION_MONTHLY_CREDITS,
      }).onConflictDoNothing();

      await db.execute(
        sql`UPDATE credits SET current_credits = current_credits + ${SUBSCRIPTION_MONTHLY_CREDITS} WHERE user_id = ${sub.userId}`
      );

      await logAuditEvent({
        userId: sub.userId,
        action: "payment.subscription_renewal",
        resourceType: "subscription",
        resourceId: invoice.id,
        metadata: { creditsGranted: SUBSCRIPTION_MONTHLY_CREDITS, amountCents: invoice.amount_paid },
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const [userRow] = await db
        .select()
        .from(users)
        .where(and(eq(users.stripeCustomerId, sub.customer as string), isNull(users.deletedAt)))
        .limit(1);
      if (userRow) {
        await db
          .insert(subscriptions)
          .values({
            userId: userRow.id,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            status: sub.status as any,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: {
              status: sub.status as any,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            },
          });

        // Backfill stripeCustomerId if not yet set
        await db
          .update(users)
          .set({ stripeCustomerId: sub.customer as string })
          .where(and(eq(users.id, userRow.id), isNull(users.stripeCustomerId)));
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await db
          .update(subscriptions)
          .set({ status: "past_due" })
          .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
      }
      break;
    }
  }

  return c.json({ received: true });
});

export { webhooksRouter };
