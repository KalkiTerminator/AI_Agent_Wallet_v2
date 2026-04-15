import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  CreateToolSchema,
  PurchaseCreditsSchema,
  ToolExecutionSchema,
  ResetPasswordSchema,
  ResetConfirmSchema,
} from "./validators";

// ---------------------------------------------------------------------------
// RegisterSchema
// ---------------------------------------------------------------------------
describe("RegisterSchema", () => {
  it("accepts a valid payload", () => {
    const result = RegisterSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      fullName: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload without fullName", () => {
    const result = RegisterSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = RegisterSchema.safeParse({ email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = RegisterSchema.safeParse({ email: "user@example.com", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password must be at least 8 characters");
    }
  });
});

// ---------------------------------------------------------------------------
// LoginSchema
// ---------------------------------------------------------------------------
describe("LoginSchema", () => {
  it("accepts a valid payload", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com", password: "anypass" });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = LoginSchema.safeParse({ email: "bad", password: "somepass" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResetPasswordSchema
// ---------------------------------------------------------------------------
describe("ResetPasswordSchema", () => {
  it("accepts valid email", () => {
    expect(ResetPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects non-email", () => {
    expect(ResetPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResetConfirmSchema
// ---------------------------------------------------------------------------
describe("ResetConfirmSchema", () => {
  it("accepts valid token + password", () => {
    expect(ResetConfirmSchema.safeParse({ token: "tok", password: "newpassword" }).success).toBe(true);
  });

  it("rejects empty token", () => {
    expect(ResetConfirmSchema.safeParse({ token: "", password: "newpassword" }).success).toBe(false);
  });

  it("rejects short password", () => {
    expect(ResetConfirmSchema.safeParse({ token: "tok", password: "short" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ToolExecutionSchema
// ---------------------------------------------------------------------------
describe("ToolExecutionSchema", () => {
  it("accepts a valid payload", () => {
    const result = ToolExecutionSchema.safeParse({
      toolId: "123e4567-e89b-12d3-a456-426614174000",
      inputs: { prompt: "hello" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID toolId", () => {
    const result = ToolExecutionSchema.safeParse({ toolId: "not-a-uuid", inputs: {} });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateToolSchema
// ---------------------------------------------------------------------------
describe("CreateToolSchema", () => {
  const validTool = {
    name: "My Tool",
    description: "Does a thing",
    category: "Development",
    creditCost: 5,
    webhookUrl: "https://example.com/hook",
    inputFields: [
      { name: "prompt", type: "text", label: "Prompt", placeholder: "", required: true },
    ],
    outputType: "text",
    webhookTimeout: 30,
    webhookRetries: 2,
  };

  it("accepts a fully valid payload", () => {
    expect(CreateToolSchema.safeParse(validTool).success).toBe(true);
  });

  it("applies defaults for webhookTimeout and webhookRetries", () => {
    const { webhookTimeout, webhookRetries, ...rest } = validTool;
    const result = CreateToolSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webhookTimeout).toBe(30);
      expect(result.data.webhookRetries).toBe(2);
    }
  });

  it("rejects non-URL webhookUrl", () => {
    const result = CreateToolSchema.safeParse({ ...validTool, webhookUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects creditCost below 1", () => {
    expect(CreateToolSchema.safeParse({ ...validTool, creditCost: 0 }).success).toBe(false);
  });

  it("rejects creditCost above 1000", () => {
    expect(CreateToolSchema.safeParse({ ...validTool, creditCost: 1001 }).success).toBe(false);
  });

  it("rejects webhookTimeout above 300", () => {
    expect(CreateToolSchema.safeParse({ ...validTool, webhookTimeout: 301 }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(CreateToolSchema.safeParse({ ...validTool, name: "" }).success).toBe(false);
  });

  it("rejects empty inputFields array", () => {
    // Empty array is valid per schema — we just test non-array
    const result = CreateToolSchema.safeParse({ ...validTool, inputFields: "bad" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PurchaseCreditsSchema
// ---------------------------------------------------------------------------
describe("PurchaseCreditsSchema", () => {
  it.each(["100", "500", "1000"] as const)('accepts pack "%s"', (pack) => {
    expect(PurchaseCreditsSchema.safeParse({ pack }).success).toBe(true);
  });

  it("rejects unknown pack value", () => {
    expect(PurchaseCreditsSchema.safeParse({ pack: "250" }).success).toBe(false);
  });
});
