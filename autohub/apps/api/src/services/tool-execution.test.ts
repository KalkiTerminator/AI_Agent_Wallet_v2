import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB so we can drive the credit-deduction transaction deterministically.
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
};
vi.mock("../db/index.js", () => ({ db: mockDb }));

const { redactPhiFields, ToolExecutionService } = await import("./tool-execution.js");

describe("redactPhiFields", () => {
  it("redacts fields marked as PHI", () => {
    const inputs = { name: "John", diagnosis: "diabetes", age: "45" };
    const inputFields = [
      { name: "name", label: "Name", type: "text", isPhi: false },
      { name: "diagnosis", label: "Diagnosis", type: "text", isPhi: true },
      { name: "age", label: "Age", type: "number" },
    ];
    const result = redactPhiFields(inputs, inputFields);
    expect(result.name).toBe("John");
    expect(result.diagnosis).toBe("[PHI REDACTED]");
    expect(result.age).toBe("45");
  });

  it("returns inputs unchanged when no PHI fields defined", () => {
    const inputs = { name: "John" };
    const result = redactPhiFields(inputs, []);
    expect(result).toEqual(inputs);
  });
});

// ── Credit deduction (the money-bug fix) ─────────────────────────────────────
const TOOL = {
  id: "tool-1", isActive: true, approvalStatus: "approved", creditCost: 1,
  inputFields: [], webhookUrlEncrypted: null, webhookUrl: null,
  signingSecretEncrypted: null, authHeaderEncrypted: null, webhookTimeout: 30, webhookRetries: 2,
};

function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

describe("ToolExecutionService.execute — credit deduction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects with 402 when the atomic deduction affects 0 rows (concurrent race)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([TOOL]))            // tool lookup
      .mockReturnValueOnce(selectChain([{ currentCredits: 5 }])); // pre-check passes
    // Inside the transaction, the UPDATE matched no row → rowCount 0
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ execute: vi.fn().mockResolvedValue({ rowCount: 0 }) })
    );

    await expect(
      ToolExecutionService.execute({ toolId: "tool-1", userId: "u1", userRole: "user", inputs: {} })
    ).rejects.toMatchObject({ status: 402 });
  });

  it("deducts and succeeds when the row is updated (rowCount 1, no webhook)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([TOOL]))
      .mockReturnValueOnce(selectChain([{ currentCredits: 5 }]));
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
        insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "usage-1", userId: "u1" }]) }) }),
      })
    );
    mockDb.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });

    const res = await ToolExecutionService.execute({ toolId: "tool-1", userId: "u1", userRole: "user", inputs: {} });
    expect(res.status).toBe("success");
    expect(res.creditsDeducted).toBe(1);
  });

  it("never charges admins (creditsDeducted 0, no transaction)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([TOOL]));
    mockDb.insert.mockReturnValue({ values: () => ({ returning: () => Promise.resolve([{ id: "usage-1", userId: "admin" }]) }) });
    mockDb.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });

    const res = await ToolExecutionService.execute({ toolId: "tool-1", userId: "admin", userRole: "admin", inputs: {} });
    expect(res.creditsDeducted).toBe(0);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
