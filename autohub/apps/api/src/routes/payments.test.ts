import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../middleware/auth.js", () => ({
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { userId: "user-1", email: "user@example.com", role: "user" });
    await next();
  },
}));

vi.mock("../middleware/rate-limit.js", () => ({
  rateLimitIp: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.stripe.com/test" }) } },
  })),
}));

const { paymentsRouter } = await import("./payments.js");
const { db } = await import("../db/index.js");

const app = new Hono();
app.route("/api/payments", paymentsRouter);

describe("POST /api/payments/portal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when user has no stripeCustomerId", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ stripeCustomerId: null }]) }) }),
    });

    const res = await app.request("/api/payments/portal", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/No billing account/);
  });

  it("returns portal URL when stripeCustomerId found server-side", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ stripeCustomerId: "cus_abc123" }]) }) }),
    });

    const res = await app.request("/api/payments/portal", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.url).toBe("https://portal.stripe.com/test");
  });
});
