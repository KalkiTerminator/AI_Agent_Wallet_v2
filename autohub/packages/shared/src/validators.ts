import { z } from "zod";

export const ToolExecutionSchema = z.object({
  toolId: z.string().uuid(),
  inputs: z.record(z.unknown()),
});

// Common passwords that are easy to guess — block them at registration
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789", "12345678", "1234567890",
  "qwerty123", "qwertyuiop", "iloveyou", "admin1234", "welcome1", "monkey123",
  "dragon123", "master123", "letmein1", "sunshine1", "princess1", "football1",
  "shadow123", "michael1", "superman1", "baseball1", "jordan123", "harley123",
  "ranger123", "daniel123", "passw0rd", "p@ssword", "p@ssw0rd", "changeme",
  "trustno1", "abc123456", "123abc456", "password!", "hello123!", "welcome!",
]);

function isStrongPassword(password: string): true | string {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "Password is too common";

  // Require at least 3 of 4 character classes
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (classCount < 3) {
    return "Password must contain at least 3 of: lowercase, uppercase, number, special character";
  }
  return true;
}

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().superRefine((val, ctx) => {
    const result = isStrongPassword(val);
    if (result !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result });
    }
  }),
  fullName: z.string().min(1, "Name is required").optional(),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
}).strict();

export const ResetPasswordSchema = z.object({
  email: z.string().email(),
}).strict();

export const ResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
}).strict();

export const CreateToolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.string().min(1),
  creditCost: z.number().int().min(1).max(1000),
  webhookUrl: z.string().url(),
  inputFields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      label: z.string().min(1),
      placeholder: z.string().default(""),
      required: z.boolean().default(false),
      options: z.array(z.string()).optional(),
    }).strict()
  ),
  outputType: z.string().optional(),
  webhookTimeout: z.number().int().min(1).max(300).default(30),
  webhookRetries: z.number().int().min(0).max(5).default(2),
}).strict();

export const PurchaseCreditsSchema = z.object({
  pack: z.enum(["100", "500", "1000"]),
}).strict();

export const CreateOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

export const InviteOrgMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});
