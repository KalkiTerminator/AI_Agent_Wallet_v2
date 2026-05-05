import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const CURRENT_VERSION = "v1";

// ── KeyProvider interface ─────────────────────────────────────────────────────

export interface KeyProvider {
  getKey(): Promise<Buffer>;
}

export class EnvKeyProvider implements KeyProvider {
  async getKey(): Promise<Buffer> {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) throw new Error("ENCRYPTION_KEY env var is not set");
    const key = Buffer.from(hex, "hex");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
    return key;
  }
}

// Stub — swap in a real KMS client when SOC 2 / key management is required.
export class KMSKeyProvider implements KeyProvider {
  async getKey(): Promise<Buffer> {
    throw new Error("KMSKeyProvider not implemented. Configure AWS KMS or GCP KMS credentials.");
  }
}

const defaultProvider: KeyProvider = new EnvKeyProvider();

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

export async function encrypt(plaintext: string, provider: KeyProvider = defaultProvider): Promise<string> {
  const key = await provider.getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${iv.toString("base64")}:${ciphertext.toString("base64")}:${authTag.toString("base64")}`;
}

export async function decrypt(stored: string, provider: KeyProvider = defaultProvider): Promise<string> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted value format");
  }
  const [, ivB64, ciphertextB64, authTagB64] = parts;
  const key = await provider.getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function isEncrypted(value: string): boolean {
  return value.startsWith("v1:") && value.split(":").length === 4;
}
