ALTER TABLE "tool_access" DROP CONSTRAINT "tool_access_tool_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "tool_access" ADD CONSTRAINT "tool_access_tool_id_user_id_pk" PRIMARY KEY("tool_id","user_id");--> statement-breakpoint
CREATE INDEX "tool_access_user_id_idx" ON "tool_access" USING btree ("user_id");