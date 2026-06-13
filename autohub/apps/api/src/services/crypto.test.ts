import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

// A valid 32-byte AES key (64 hex) for the EnvKeyProvider.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

const { encrypt, decrypt, isEncrypted, maskUrl } = await import("./crypto.js");

describe("crypto encrypt/decrypt", () => {
  it("round-trips a value", async () => {
    const plain = "https://hooks.n8n.cloud/webhook/secret-path";
    const enc = await encrypt(plain);
    expect(enc).not.toContain("secret-path");
    expect(await decrypt(enc)).toBe(plain);
  });

  it("produces the versioned 4-part format", async () => {
    const enc = await encrypt("hello");
    expect(enc.split(":")).toHaveLength(4);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(isEncrypted(enc)).toBe(true);
  });

  it("uses a fresh IV each time (different ciphertext for same input)", async () => {
    expect(await encrypt("same")).not.toBe(await encrypt("same"));
  });

  it("rejects a tampered ciphertext (GCM auth tag)", async () => {
    const enc = await encrypt("tamper-me");
    const parts = enc.split(":");
    const bad = Buffer.from(parts[2], "base64");
    bad[0] ^= 0xff; // flip a bit in the ciphertext
    parts[2] = bad.toString("base64");
    await expect(decrypt(parts.join(":"))).rejects.toBeTruthy();
  });

  it("rejects a malformed value", async () => {
    await expect(decrypt("not-encrypted")).rejects.toThrow(/Invalid encrypted value/);
  });

  it("maskUrl hides the path tail", () => {
    expect(maskUrl("https://api.example.com/a/b/secret")).toContain("***");
    expect(maskUrl("https://api.example.com/a/b/secret")).not.toContain("secret");
  });
});
