import {
  pgTable, pgEnum,
  uuid, text, integer, boolean, timestamp, jsonb, unique, index, primaryKey,
} from "drizzle-orm/pg-core";

export const toolStatusEnum = pgEnum("tool_status", ["draft", "pending_approval", "approved", "rejected", "archived"]);
export const toolVisibilityEnum = pgEnum("tool_visibility", ["private", "public"]);
export const executionModeEnum = pgEnum("execution_mode", ["sync", "async"]);
export const executionStatusEnum = pgEnum("execution_status", ["pending", "success", "failed", "timeout"]);

// ─── users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  isActive: boolean("is_active").notNull().default(true),
  stripeCustomerId: text("stripe_customer_id"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  mfaSecretEncrypted: text("mfa_secret_encrypted"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── user_roles ─────────────────────────────────────────
export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "moderator", "user"] }).notNull().default("user"),
  isOwner: boolean("is_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId)]);

// ─── credits ────────────────────────────────────────────
export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentCredits: integer("current_credits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId)]);

// ─── ai_tools ───────────────────────────────────────────
export const aiTools = pgTable("ai_tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  creditCost: integer("credit_cost").notNull().default(1),
  inputFields: jsonb("input_fields").notNull().default([]),
  iconUrl: text("icon_url"),
  webhookUrl: text("webhook_url"), // kept for migration; new rows use webhookUrlEncrypted
  webhookUrlEncrypted: text("webhook_url_encrypted"),
  authHeaderEncrypted: text("auth_header_encrypted"), // e.g. "Authorization: Bearer xyz"
  hasWebhook: boolean("has_webhook").notNull().default(false),
  outputType: text("output_type").default("smart"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  visibility: toolVisibilityEnum("visibility").notNull().default("private"),
  toolStatus: toolStatusEnum("tool_status").notNull().default("draft"),
  enabled: boolean("enabled").notNull().default(true),
  executionMode: executionModeEnum("execution_mode").notNull().default("sync"),
  signingSecretHash: text("signing_secret_hash"),
  rejectionReason: text("rejection_reason"),
  webhookTimeout: integer("webhook_timeout").notNull().default(30),
  webhookRetries: integer("webhook_retries").notNull().default(2),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── tool_usages ────────────────────────────────────────
export const toolUsages = pgTable("tool_usages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "cascade" }),
  inputData: jsonb("input_data").notNull().default({}),
  outputData: jsonb("output_data"),
  creditsUsed: integer("credits_used").notNull(),
  status: text("status", { enum: ["pending", "success", "failed", "refunded"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  ipAddress: text("ip_address"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("tool_usages_user_id_idx").on(t.userId),
  index("tool_usages_tool_id_idx").on(t.toolId),
]);

// ─── audit_logs ─────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── user_favorites ─────────────────────────────────────
export const userFavorites = pgTable("user_favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.toolId)]);

// ─── payments ───────────────────────────────────────────
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  amount: integer("amount").notNull(), // in cents
  status: text("status", { enum: ["pending", "completed", "failed", "refunded"] }).notNull().default("pending"),
  creditsGranted: integer("credits_granted").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── subscriptions ──────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status", { enum: ["inactive", "active", "past_due", "canceled", "trialing"] }).notNull().default("inactive"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId)]);

// ─── webhook_execution_log ──────────────────────────────
export const webhookExecutionLog = pgTable("webhook_execution_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  usageId: uuid("usage_id").notNull().references(() => toolUsages.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull().default(1),
  status: text("status", { enum: ["success", "failed", "timeout"] }).notNull(),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── organizations ──────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedCredits: integer("shared_credits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── org_members ────────────────────────────────────────
export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.orgId, t.userId)]);

// ─── tool_access ────────────────────────────────────────
export const toolAccess = pgTable("tool_access", {
  toolId: uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.toolId, t.userId] }),
  index("tool_access_user_id_idx").on(t.userId),
]);

// ─── executions ─────────────────────────────────────────
export const executions = pgTable("executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").notNull().references(() => aiTools.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: executionStatusEnum("status").notNull().default("pending"),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  error: text("error"),
  creditsDebited: integer("credits_debited").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("executions_tool_id_idx").on(t.toolId),
  index("executions_user_id_idx").on(t.userId),
]);

// ─── app_config ─────────────────────────────────────────
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── password_reset_tokens ──────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ─── email_verification_tokens ──────────────────────────
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ─── sessions ───────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenJti: text("token_jti").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
  index("sessions_jti_idx").on(t.tokenJti),
]);

// ─── mfa_backup_codes ───────────────────────────────────
export const mfaBackupCodes = pgTable("mfa_backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [
  index("mfa_backup_codes_user_id_idx").on(t.userId),
]);
