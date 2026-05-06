import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn(async (_c: any, next: any) => { _c.set("user", { userId: "u1", role: "admin" }); await next(); }),
  requireAdmin: vi.fn(async (_c: any, next: any) => { await next(); }),
}));
vi.mock("../db/index.js", () => {
  function makeChain(): any {
    const chain: any = {};
    const self = () => chain;
    const selfAsync = () => Promise.resolve([]);
    chain.where = vi.fn(self);
    chain.orderBy = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.offset = vi.fn(selfAsync);
    chain.leftJoin = vi.fn(self);
    chain.groupBy = vi.fn(selfAsync);
    return chain;
  }
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(makeChain()),
      }),
    },
  };
});

import { complianceRouter } from "./compliance.js";

const app = new Hono();
app.route("/", complianceRouter);

describe("GET /audit-log", () => {
  it("returns 200 with data array", async () => {
    const res = await app.request("/audit-log", {
      headers: { Authorization: "Bearer test" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("GET /users", () => {
  it("returns 200 with data array", async () => {
    const res = await app.request("/users", {
      headers: { Authorization: "Bearer test" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("data");
  });
});
