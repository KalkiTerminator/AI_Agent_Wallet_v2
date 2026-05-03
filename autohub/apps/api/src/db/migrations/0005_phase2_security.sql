-- users: email verification + MFA + soft delete
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamptz;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamptz;--> statement-breakpoint

-- soft delete on other tables
ALTER TABLE "ai_tools"    ADD COLUMN "deleted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "executions"  ADD COLUMN "deleted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "tool_usages" ADD COLUMN "deleted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "payments"    ADD COLUMN "deleted_at" timestamptz;--> statement-breakpoint

-- email verification tokens
CREATE TABLE "email_verification_tokens" (
  "token_hash" text PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "used_at"    timestamptz
);--> statement-breakpoint

-- sessions (for jti revocation)
CREATE TABLE "sessions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_jti"  text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  "user_agent" text,
  "ip"         text
);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");--> statement-breakpoint
CREATE INDEX "sessions_jti_idx" ON "sessions"("token_jti");--> statement-breakpoint

-- MFA backup codes
CREATE TABLE "mfa_backup_codes" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at"   timestamptz
);--> statement-breakpoint
CREATE INDEX "mfa_backup_codes_user_id_idx" ON "mfa_backup_codes"("user_id");
