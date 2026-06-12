import { getRedis } from "../middleware/rate-limit.js";

/**
 * Redis-backed per-tool circuit breaker. Unlike an in-process Map it works
 * across Railway replicas. Fails OPEN (allows the call) whenever Redis is
 * unavailable so a Redis outage never blocks all tool execution.
 *
 * Behaviour:
 *   - failures are counted in a rolling window (failKey, TTL = window)
 *   - on the Nth failure the breaker opens (openKey, TTL = cooldown) → calls reject
 *   - when the openKey TTL elapses, calls are allowed again automatically; a
 *     single continued failure re-opens it, a success resets everything
 */

const FAILURE_THRESHOLD = 5;     // failures within the window before opening
const FAILURE_WINDOW_SEC = 600;  // 10 min rolling window for the failure count
const OPEN_COOLDOWN_SEC = 120;   // 2 min rejecting before calls are allowed again

const failKey = (toolId: string) => `autohub:cb:fail:${toolId}`;
const openKey = (toolId: string) => `autohub:cb:open:${toolId}`;

export type CircuitDecision = "allow" | "reject";

/** Decide whether a call to this tool's webhook may proceed. */
export async function canAttempt(toolId: string): Promise<CircuitDecision> {
  const r = getRedis();
  if (!r) return "allow"; // fail-open: no Redis → no breaker
  try {
    return (await r.get(openKey(toolId))) ? "reject" : "allow";
  } catch {
    return "allow";
  }
}

/** Record a successful call — resets the breaker to closed. */
export async function recordSuccess(toolId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(failKey(toolId), openKey(toolId));
  } catch {
    /* fail-open */
  }
}

/** Record a failed call. Returns true if this failure tripped the breaker open. */
export async function recordFailure(toolId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const count = await r.incr(failKey(toolId));
    if (count === 1) await r.expire(failKey(toolId), FAILURE_WINDOW_SEC);
    if (count >= FAILURE_THRESHOLD) {
      await r.set(openKey(toolId), "1", "EX", OPEN_COOLDOWN_SEC);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
