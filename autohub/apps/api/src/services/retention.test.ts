import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing retention
vi.mock("../db/index.js", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rowCount: 3 }),
  },
}));
vi.mock("./audit.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { runRetentionPurge } from "./retention.js";

describe("runRetentionPurge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns counts for all tables", async () => {
    const result = await runRetentionPurge();
    expect(result).toHaveProperty("sessions");
    expect(result).toHaveProperty("toolUsages");
    expect(result).toHaveProperty("executions");
    expect(result).toHaveProperty("webhookExecutionLog");
    expect(result).toHaveProperty("passwordResetTokens");
    expect(result).toHaveProperty("emailVerificationTokens");
  });

  it("returns numeric counts", async () => {
    const result = await runRetentionPurge();
    for (const count of Object.values(result)) {
      expect(typeof count).toBe("number");
    }
  });
});
