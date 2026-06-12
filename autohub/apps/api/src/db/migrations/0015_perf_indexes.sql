-- Performance indexes. Applied manually to prod (journal desynced past 0007).
CREATE INDEX IF NOT EXISTS "tool_usages_user_created_idx" ON "tool_usages" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_tools_approval_status_idx" ON "ai_tools" ("approval_status");
CREATE INDEX IF NOT EXISTS "ai_tools_created_by_user_id_idx" ON "ai_tools" ("created_by_user_id");
