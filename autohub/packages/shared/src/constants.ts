import type { FieldTypeOption, OutputTypeOption } from "./types.js";

export const TOOL_CATEGORIES = [
  "Text Processing",
  "Image Generation",
  "Language Processing",
  "Development",
  "Marketing",
  "Communication",
  "Sales",
] as const;

export const TOOL_CATEGORIES_WITH_ALL = ["All", ...TOOL_CATEGORIES] as const;

export const FIELD_TYPES: FieldTypeOption[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "file", label: "File Upload" },
];

export const OUTPUT_TYPES: OutputTypeOption[] = [
  { value: "smart", label: "Smart (Auto-detect)", category: "Auto" },
  { value: "text", label: "Plain Text (.txt)", category: "Text & Documents" },
  { value: "markdown", label: "Markdown (.md)", category: "Text & Documents" },
  { value: "json", label: "JSON", category: "Data Formats" },
  { value: "csv", label: "CSV", category: "Data Formats" },
  { value: "png", label: "PNG Image", category: "Images" },
  { value: "jpg", label: "JPEG Image", category: "Images" },
  { value: "html", label: "HTML", category: "Web & Code" },
  { value: "pdf", label: "PDF Document", category: "Text & Documents" },
];

// Credit tiers — no more UNLIMITED_CREDITS hack
export const CREDIT_TIERS = {
  FREE: { creditsOnSignup: 10, monthlyRefresh: 0 },
  PRO: { creditsOnSignup: 500, monthlyRefresh: 500 },
  ENTERPRISE: { creditsOnSignup: 0, monthlyRefresh: 0 }, // custom
} as const;

// Credit packs for purchase
export const CREDIT_PACKS = [
  { credits: 100, price: 9.99, label: "Starter" },
  { credits: 500, price: 39.99, label: "Growth" },
  { credits: 1000, price: 69.99, label: "Pro" },
] as const;

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  FREE: { name: "Free", price: 0, credits: 10 },
  PRO: { name: "Pro", price: 20, credits: 500 },
  ENTERPRISE: { name: "Enterprise", price: -1, credits: -1 },
} as const;

// Rate limits (requests per minute)
export const RATE_LIMITS = {
  TOOL_EXECUTE: 20,
  READS: 60,
  PAYMENT_ACTIONS: 5,
} as const;
