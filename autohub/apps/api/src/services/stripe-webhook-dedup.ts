import type Stripe from "stripe";
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
