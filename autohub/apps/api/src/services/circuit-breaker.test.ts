import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake Redis with just the commands the breaker uses.
class FakeRedis {
  store = new Map<string, string>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async incr(k: string) {
    const n = Number(this.store.get(k) ?? "0") + 1;
    this.store.set(k, String(n));
    return n;
  }
  async expire() { return 1; }
  async del(...keys: string[]) { keys.forEach((k) => this.store.delete(k)); return keys.length; }
  async set(k: string, v: string, _ex?: string, _ttl?: number, nx?: string) {
    if (nx === "NX" && this.store.has(k)) return null;
    this.store.set(k, v);
    return "OK";
  }
}

let fake: FakeRedis | null = new FakeRedis();
vi.mock("../middleware/rate-limit.js", () => ({
  getRedis: () => fake,
}));

const { canAttempt, recordSuccess, recordFailure } = await import("./circuit-breaker.js");

describe("circuit-breaker", () => {
  beforeEach(() => { fake = new FakeRedis(); });

  it("allows calls when closed", async () => {
    expect(await canAttempt("tool-1")).toBe("allow");
  });

  it("stays closed below the failure threshold", async () => {
    for (let i = 0; i < 4; i++) expect(await recordFailure("tool-1")).toBe(false);
    expect(await canAttempt("tool-1")).toBe("allow");
  });

  it("opens on the 5th failure and then rejects", async () => {
    for (let i = 0; i < 4; i++) await recordFailure("tool-1");
    expect(await recordFailure("tool-1")).toBe(true); // 5th trips it
    expect(await canAttempt("tool-1")).toBe("reject");
  });

  it("recordSuccess closes the breaker", async () => {
    for (let i = 0; i < 5; i++) await recordFailure("tool-1");
    await recordSuccess("tool-1");
    expect(await canAttempt("tool-1")).toBe("allow");
  });

  it("fails open when Redis is unavailable", async () => {
    fake = null;
    expect(await canAttempt("tool-x")).toBe("allow");
    expect(await recordFailure("tool-x")).toBe(false);
  });
});
