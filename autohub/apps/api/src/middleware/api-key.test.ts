import { describe, it, expect, vi } from "vitest";

vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("./auth.js", () => ({ requireAuth: vi.fn() }));
vi.mock("../env.js", () => ({ env: { NEXTAUTH_SECRET: "test-secret-at-least-32-characters-long" } }));

const { hashApiKey, API_KEY_PREFIX } = await import("./api-key.js");

describe("hashApiKey", () => {
  it("is deterministic for the same key", () => {
    const key = `${API_KEY_PREFIX}abc123`;
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("produces a 64-char hex sha256 digest", () => {
    expect(hashApiKey("ah_whatever")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("yields different hashes for different keys", () => {
    expect(hashApiKey("ah_one")).not.toBe(hashApiKey("ah_two"));
  });

  it("never returns the plaintext", () => {
    const key = "ah_supersecretvalue";
    expect(hashApiKey(key)).not.toContain("supersecret");
  });
});
