import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireRole } from "./rbac.js";

function makeApp(role: string) {
  const app = new Hono();
  // Simulate requireAuth by injecting user context manually
  app.use("*", async (c, next) => {
    c.set("user", { userId: "u1", email: "t@t.com", role, jti: "test-jti", emailVerified: true, mfaEnabled: false });
    await next();
  });
  app.get("/test", requireRole("moderator"), (c) => c.json({ ok: true }));
  return app;
}

describe("requireRole", () => {
  it("allows moderator", async () => {
    const res = await makeApp("moderator").request("/test");
    expect(res.status).toBe(200);
  });

  it("allows admin (short-circuits hierarchy)", async () => {
    const res = await makeApp("admin").request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks user", async () => {
    const res = await makeApp("user").request("/test");
    expect(res.status).toBe(403);
  });
});
