import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CURRENT_VERSION = "v1";

function getMasterKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY env var is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return key;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: "v1:<iv_base64>:<ciphertext_base64>:<authTag_base64>"
 * The version prefix allows future key rotation without rewriting all rows.
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${iv.toString("base64")}:${ciphertext.toString("base64")}:${authTag.toString("base64")}`;
}

/**
 * Decrypts a value produced by encrypt().
 */
export function decrypt(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted value format");
  }
  const [, ivB64, ciphertextB64, authTagB64] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Masks a URL for safe display: shows scheme + host + first path segment, hides the rest.
 * e.g. https://hooks.zapier.com/hooks/catch/abc123/xyz → https://hooks.zapier.com/hooks/catch/***
 */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const visiblePath = pathParts.slice(0, 2).join("/");
    return `${parsed.protocol}//${parsed.host}/${visiblePath}/***`;
  } catch {
    return "***";
  }
}

/** Returns true if the value looks like an encrypted blob (not plain text). */
export function isEncrypted(value: string): boolean {
  return value.startsWith("v1:") && value.split(":").length === 4;
}
