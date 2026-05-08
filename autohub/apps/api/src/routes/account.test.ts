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
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../services/audit.js", () => ({ logAuditEvent: vi.fn() }));
vi.mock("./auth.js", () => ({ revokeAllSessions: vi.fn() }));
vi.mock("@autohub/shared", async (importOriginal) => {
  const orig = await importOriginal() as any;
  return { ...orig, ConsentSchema: orig.ConsentSchema, DsarSchema: orig.DsarSchema };
});

const { accountRouter } = await import("./account.js");
const { db } = await import("../db/index.js");

const app = new Hono();
app.route("/api/account", accountRouter);

describe("GET /api/account/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns user profile with correct shape", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        leftJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{
                id: "user-1",
                email: "user@example.com",
                fullName: "Test User",
                role: "user",
                currentCredits: 50,
                onboardedAt: null,
                emailVerifiedAt: null,
                mfaEnabled: false,
              }]),
            }),
          }),
        }),
      }),
    });

    const res = await app.request("/api/account/me", {
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toMatchObject({
      id: "user-1",
      email: "user@example.com",
      role: "user",
      currentCredits: 50,
      onboardedAt: null,
    });
  });
});

describe("POST /api/account/onboarding/complete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets onboardedAt and returns it", async () => {
    (db.update as any).mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ onboardedAt: new Date("2026-05-06T10:00:00Z") }]),
        }),
      }),
    });

    const res = await app.request("/api/account/onboarding/complete", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.onboardedAt).toBeTruthy();
  });

  it("is idempotent — returns existing onboardedAt if already set", async () => {
    const existing = new Date("2026-04-01T00:00:00Z");
    // update returns empty (already onboarded — WHERE isNull(onboardedAt) didn't match)
    (db.update as any).mockReturnValue({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    });
    // fallback select
    (db.select as any).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ onboardedAt: existing }]),
        }),
      }),
    });

    const res = await app.request("/api/account/onboarding/complete", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.onboardedAt).toBeTruthy();
  });
});
