import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "./hmac.js";

describe("signPayload", () => {
  it("returns sha256=<hex> format", () => {
    const sig = signPayload("secret", "1714000000", "exec-id-123", '{"key":"val"}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("same inputs produce same signature", () => {
    const a = signPayload("s", "t", "e", "b");
    const b = signPayload("s", "t", "e", "b");
    expect(a).toBe(b);
  });
});

describe("verifySignature", () => {
  it("returns true for valid signature", () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signPayload("secret", ts, "exec-1", '{}');
    expect(verifySignature({ secret: "secret", timestamp: ts, executionId: "exec-1", rawBody: "{}", signature: sig })).toBe(true);
  });

  it("returns false for mismatched signature", () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    expect(verifySignature({ secret: "secret", timestamp: ts, executionId: "exec-1", rawBody: "{}", signature: "sha256=abc" })).toBe(false);
  });

  it("returns false for timestamp outside ±300s window", () => {
    const ts = (Math.floor(Date.now() / 1000) - 400).toString();
    const sig = signPayload("secret", ts, "exec-1", '{}');
    expect(verifySignature({ secret: "secret", timestamp: ts, executionId: "exec-1", rawBody: "{}", signature: sig })).toBe(false);
  });
});
