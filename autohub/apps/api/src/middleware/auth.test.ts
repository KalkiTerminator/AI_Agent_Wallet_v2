import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockVerify = vi.fn();

vi.mock("jsonwebtoken", () => ({
  default: { verify: (...args: unknown[]) => mockVerify(...args), sign: vi.fn() },
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no revoked session
    }),
  },
}));

vi.mock("../env.js", () => ({
  env: { NEXTAUTH_SECRET: "test-secret" },
}));

const { requireAuth } = await import("./auth.js");

// Mirror the real mount points: /api/auth/mfa/* and /api/account/me
const app = new Hono();
app.post("/api/auth/mfa/setup", requireAuth, (c) => c.json({ ok: "setup" }));
app.post("/api/auth/mfa/verify-setup", requireAuth, (c) => c.json({ ok: "verify" }));
app.get("/api/account/me", requireAuth, (c) => c.json({ ok: "me" }));
app.post("/api/account/onboarding/complete", requireAuth, (c) => c.json({ ok: "onboarding" }));
app.post("/api/tools", requireAuth, (c) => c.json({ ok: "tools" }));

function payload(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1", email: "a@b.c", role: "user", jti: "j1",
    emailVerified: true, mfaEnabled: false, ...overrides,
  };
}

async function req(path: string, method = "POST") {
  return app.request(path, { method, headers: { Authorization: "Bearer tok" } });
}

describe("requireAuth — privileged MFA gate", () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it("blocks admin without MFA on normal routes", async () => {
    mockVerify.mockReturnValue(payload({ role: "admin" }));
    const res = await req("/api/tools");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("mfa_required_for_role");
  });

  it("allows admin without MFA to reach MFA enrollment endpoints (no deadlock)", async () => {
    mockVerify.mockReturnValue(payload({ role: "admin" }));
    expect((await req("/api/auth/mfa/setup")).status).toBe(200);
    expect((await req("/api/auth/mfa/verify-setup")).status).toBe(200);
    expect((await req("/api/account/me", "GET")).status).toBe(200);
  });

  it("allows admin without MFA to complete onboarding (welcome dialog must not loop)", async () => {
    mockVerify.mockReturnValue(payload({ role: "admin" }));
    expect((await req("/api/account/onboarding/complete")).status).toBe(200);
  });

  it("allows admin with MFA everywhere", async () => {
    mockVerify.mockReturnValue(payload({ role: "admin", mfaEnabled: true }));
    expect((await req("/api/tools")).status).toBe(200);
  });

  it("does not gate regular users without MFA", async () => {
    mockVerify.mockReturnValue(payload({ role: "user" }));
    expect((await req("/api/tools")).status).toBe(200);
  });
});
