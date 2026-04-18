import { createHmac, timingSafeEqual } from "crypto";

export function signPayload(secret: string, timestamp: string, executionId: string, rawBody: string): string {
  const message = `${timestamp}.${executionId}.${rawBody}`;
  return "sha256=" + createHmac("sha256", secret).update(message).digest("hex");
}

interface VerifyParams {
  secret: string;
  timestamp: string;
  executionId: string;
  rawBody: string;
  signature: string;
}

export function verifySignature({ secret, timestamp, executionId, rawBody, signature }: VerifyParams): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 300) return false;

  const expected = signPayload(secret, timestamp, executionId, rawBody);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
