import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock Stripe — constructEvent just returns the raw body parsed as JSON
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn((_body: string, _sig: string, _secret: string) => JSON.parse(_body)),
      },
    })),
  };
});

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../services/audit.js", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("../env.js", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_xxx",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    AUTOHUB_WEB_URL: "http://localhost:3000",
    STRIPE_ALLOWED_PRICE_IDS: [],
  },
}));

vi.mock("../services/stripe-webhook-dedup.js", () => ({
  ingestStripeEvent: vi.fn().mockResolvedValue("first"),
}));

const { webhooksRouter } = await import("./webhooks.js");
const { db } = await import("../db/index.js");

const app = new Hono();
app.route("/api/webhooks", webhooksRouter);

function makeEvent(type: string, data: object) {
  return JSON.stringify({ type, data: { object: data } });
}

describe("POST /api/webhooks/stripe — invoice.paid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants credits on first invoice.paid for active subscription", async () => {
    // subscription lookup returns active sub for user-1
    (db.select as any).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ userId: "user-1", status: "active" }]) }) }),
    });
    // subscription_invoices check: not exists
    (db.select as any).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    (db.insert as any).mockReturnValue({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) });
    (db.execute as any).mockResolvedValue(undefined);

    const body = makeEvent("invoice.paid", {
      id: "in_001",
      subscription: "sub_001",
      amount_paid: 2000,
    });

    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig", "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("is idempotent — does not grant credits if invoice already processed", async () => {
    // subscription lookup returns active sub
    (db.select as any).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ userId: "user-1", status: "active" }]) }) }),
    });
    // subscription_invoices check: already exists
    (db.select as any).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "existing" }]) }) }),
    });

    const body = makeEvent("invoice.paid", {
      id: "in_001",
      subscription: "sub_001",
      amount_paid: 2000,
    });

    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig", "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("skips invoice.paid when invoice has no subscription (one-time payment)", async () => {
    const body = makeEvent("invoice.paid", {
      id: "in_002",
      subscription: null,
      amount_paid: 999,
    });

    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig", "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
});
