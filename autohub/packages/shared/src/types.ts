// ─── AI Tool ────────────────────────────────────────────
export interface AITool {
  id: string;
  name: string;
  description: string;
  category: string;
  creditCost: number;
  inputFields: InputField[];
  iconUrl: string | null;
  webhookUrl?: string | null;
  hasWebhook?: boolean;
  outputType?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  isActive?: boolean;
  createdAt?: string;
  webhookTimeout?: number;
  webhookRetries?: number;
  createdByUserId?: string | null;
  visibility?: ToolVisibility;
  toolStatus?: ToolStatus;
  enabled?: boolean;
  executionMode?: ExecutionMode;
}

// ─── Tool Enums ─────────────────────────────────────────
export type ToolStatus = "draft" | "pending_approval" | "approved" | "rejected" | "archived";
export type ToolVisibility = "private" | "public";
export type ExecutionMode = "sync" | "async";
export type ExecutionStatus = "pending" | "success" | "failed" | "timeout";

export interface InputField {
  id?: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  accept?: string;
}

// ─── User ───────────────────────────────────────────────
export type AppRole = "admin" | "moderator" | "user";

export interface UserWithRole {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  role: AppRole;
  isOwner: boolean;
  isActive: boolean;
}

// ─── Usage & Analytics ──────────────────────────────────
export type ToolUsageStatus = "pending" | "success" | "failed" | "refunded";

export interface UsageData {
  date: string;
  credits: number;
  count: number;
}

/** A single row from the tool_usages table as returned by GET /api/tools/usage */
export interface ToolUsageRow {
  id: string;
  userId: string;
  toolId: string;
  inputData: unknown;
  outputData: unknown | null;
  creditsUsed: number;
  status: ToolUsageStatus;
  errorMessage: string | null;
  ipAddress: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ToolUsageStat {
  toolName: string;
  totalCredits: number;
  usageCount: number;
}

export type TimeFilter = "day" | "week" | "month" | "year";

// ─── Subscription ───────────────────────────────────────
export interface SubscriptionStatus {
  subscribed: boolean;
  productId?: string;
  subscriptionEnd?: string;
  cancelAtPeriodEnd?: boolean;
  status?: string;
}

// ─── Credits ─────────────────────────────────────────────
export interface CreditBalance {
  currentCredits: number;
  userId: string;
}

// ─── Payments ────────────────────────────────────────────
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface Payment {
  id: string;
  userId: string;
  stripeSessionId: string;
  amount: number;
  status: PaymentStatus;
  creditsGranted: number;
  createdAt: string;
}

// ─── Organization ────────────────────────────────────────
export type OrgMemberRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  sharedCredits: number;
  createdAt: string;
}

export interface OrgMember {
  orgId: string;
  userId: string;
  role: OrgMemberRole;
}

// ─── API Responses ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Tool Execution ─────────────────────────────────────
export interface ToolExecutionRequest {
  toolId: string;
  inputs: Record<string, unknown>;
}

export interface ToolExecutionResult {
  usageId: string;
  status: ToolUsageStatus;
  output?: unknown;
  creditsDeducted: number;
}

// ─── Field/Output Type Options ──────────────────────────
export interface FieldTypeOption {
  value: string;
  label: string;
}

export interface OutputTypeOption {
  value: string;
  label: string;
  category: string;
}

// ─── Execution ───────────────────────────────────────────
export interface Execution {
  id: string;
  toolId: string;
  userId: string;
  status: ExecutionStatus;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: string | null;
  creditsDebited: number;
  startedAt: string;
  completedAt?: string | null;
}

// ─── Tool Access ─────────────────────────────────────────
export interface ToolAccess {
  toolId: string;
  userId: string;
  grantedBy?: string | null;
  grantedAt: string;
}
