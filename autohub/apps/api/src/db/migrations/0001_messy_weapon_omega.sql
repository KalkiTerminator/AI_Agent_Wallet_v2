CREATE TYPE "public"."execution_mode" AS ENUM('sync', 'async');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'success', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tool_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error" text,
	"credits_debited" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_access" (
	"tool_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_access_tool_id_user_id_unique" UNIQUE("tool_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "visibility" "tool_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "tool_status" "tool_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "execution_mode" "execution_mode" DEFAULT 'sync' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "signing_secret_hash" text;--> statement-breakpoint
ALTER TABLE "ai_tools" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_tool_id_ai_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."ai_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_access" ADD CONSTRAINT "tool_access_tool_id_ai_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."ai_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_access" ADD CONSTRAINT "tool_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_access" ADD CONSTRAINT "tool_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executions_tool_id_idx" ON "executions" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "executions_user_id_idx" ON "executions" USING btree ("user_id");