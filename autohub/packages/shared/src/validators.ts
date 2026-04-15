import { z } from "zod";

export const ToolExecutionSchema = z.object({
  toolId: z.string().uuid(),
  inputs: z.record(z.unknown()),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Name is required").optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const ResetPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

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
    })
  ),
  outputType: z.string().optional(),
  webhookTimeout: z.number().int().min(1).max(300).default(30),
  webhookRetries: z.number().int().min(0).max(5).default(2),
});

export const PurchaseCreditsSchema = z.object({
  pack: z.enum(["100", "500", "1000"]),
});

export const CreateOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

export const InviteOrgMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});
