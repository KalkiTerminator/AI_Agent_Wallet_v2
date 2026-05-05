-- consent_logs (append-only, never update/delete)
CREATE TABLE "consent_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "consent_type" text NOT NULL CHECK (consent_type IN ('terms','privacy','marketing','data_processing')),
  "consent_version" text NOT NULL,
  "granted" boolean NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "consent_logs_user_id_idx" ON "consent_logs" ("user_id");

-- data_subject_requests (DSAR queue)
CREATE TABLE "data_subject_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "request_type" text NOT NULL CHECK (request_type IN ('access','erasure','portability','rectification')),
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','rejected')),
  "request_notes" text,
  "resolution_notes" text,
  "due_date" timestamp with time zone NOT NULL,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "dsar_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "dsar_resolved_by_fk"
  FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
CREATE INDEX "dsar_status_due_idx" ON "data_subject_requests" ("status", "due_date");

-- webhook_domains (domain registry for tool creators)
CREATE TABLE "webhook_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "domain" text NOT NULL UNIQUE,
  "owner_user_id" uuid NOT NULL,
  "verification_token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "webhook_domains" ADD CONSTRAINT "webhook_domains_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "webhook_domains_owner_idx" ON "webhook_domains" ("owner_user_id");

-- Extend tool_usages.status CHECK constraint to include 'sandbox'
ALTER TABLE "tool_usages" DROP CONSTRAINT IF EXISTS "tool_usages_status_check";
ALTER TABLE "tool_usages" ADD CONSTRAINT "tool_usages_status_check"
  CHECK (status IN ('pending','success','failed','refunded','sandbox'));

-- Extend executions status enum (this IS a pgEnum)
ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'sandbox';
