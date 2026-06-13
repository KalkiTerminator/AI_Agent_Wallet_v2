-- Tool ratings + favorites index. Applied manually to prod (journal desynced past 0007).
CREATE TABLE IF NOT EXISTS "tool_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tool_id" uuid NOT NULL REFERENCES "ai_tools"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tool_ratings_user_id_tool_id_unique" UNIQUE ("user_id", "tool_id")
);
CREATE INDEX IF NOT EXISTS "tool_ratings_tool_id_idx" ON "tool_ratings" ("tool_id");
CREATE INDEX IF NOT EXISTS "user_favorites_user_id_idx" ON "user_favorites" ("user_id");
