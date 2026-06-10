import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { webhookEvents } from "../db/schema.js";

export async function ingestStripeEvent(event: Stripe.Event): Promise<"first" | "duplicate"> {
  const result = await db
    .insert(webhookEvents)
    .values({ eventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.eventId });
  return result.length === 0 ? "duplicate" : "first";
}

/**
 * Un-ingest an event so Stripe's retry can be processed.
 * Use when processing fails or must be deferred (e.g. out-of-order delivery:
 * invoice.paid arriving before customer.subscription.created).
 */
export async function releaseStripeEvent(eventId: string): Promise<void> {
  await db.delete(webhookEvents).where(eq(webhookEvents.eventId, eventId));
}
