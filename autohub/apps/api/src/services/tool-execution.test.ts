import { describe, it, expect } from "vitest";
import { redactPhiFields } from "./tool-execution.js";

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
