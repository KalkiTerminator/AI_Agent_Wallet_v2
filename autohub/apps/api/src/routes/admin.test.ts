import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../middleware/auth.js", () => ({
  requireAuth: async (c: any, next: any) => { c.set("user", { userId: "u1", role: "admin" }); await next(); },
  requireAdmin: async (_c: any, next: any) => { await next(); },
}));

vi.mock("../middleware/rate-limit.js", () => ({
  rateLimitIp: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../services/audit.js", () => ({ logAuditEvent: vi.fn() }));

const { adminRouter } = await import("./admin.js");
const { db } = await import("../db/index.js");

const app = new Hono();
app.use("*", async (c, next) => { c.set("user", { userId: "u1", role: "admin", email: "admin@test.com", jti: "jti1", emailVerified: true, mfaEnabled: false }); await next(); });
app.route("/api/admin", adminRouter);

describe("GET /api/admin/analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns summary + charts shape with default range", async () => {
    // Build a chainable thenable that resolves to a one-element array with default fields.
    // This lets code do both `await db.select().from(t)` and `await db.select().from(t).where(...)`.
    const makeThen = (val: any[]) => {
      const obj: any = {
        then: (resolve: (v: any) => any) => Promise.resolve(val).then(resolve),
      };
      obj.where = () => makeThen(val);
      obj.leftJoin = () => makeThen(val);
      obj.groupBy = () => makeThen(val);
      return obj;
    };

    (db.select as any).mockReturnValue({
      from: () => makeThen([{ count: 0, total: 0 }]),
    });
    (db.execute as any).mockResolvedValue({ rows: [] });

    const res = await app.request("/api/admin/analytics", {
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toHaveProperty("summary");
    expect(body.data).toHaveProperty("charts");
    expect(body.data.charts).toHaveProperty("dailyRevenue");
    expect(body.data.charts).toHaveProperty("dailySignups");
    expect(body.data.charts).toHaveProperty("dailyExecutions");
    expect(body.data.charts).toHaveProperty("activeSubscriptions");
    expect(body.data.charts).toHaveProperty("topTools");
  });

  it("returns 400 for invalid range", async () => {
    const res = await app.request("/api/admin/analytics?range=invalid", {
      headers: { Authorization: "Bearer token" },
    });
    expect(res.status).toBe(400);
  });
});
