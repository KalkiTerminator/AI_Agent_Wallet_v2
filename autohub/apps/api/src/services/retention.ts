import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

export interface RetentionResult {
  sessions: number;
  toolUsages: number;
  executions: number;
  webhookExecutionLog: number;
  passwordResetTokens: number;
  emailVerificationTokens: number;
}

export async function runRetentionPurge(): Promise<RetentionResult> {
  const now = new Date();

  const [sessions, toolUsages, executions, webhookLog, resetTokens, verifyTokens] =
    await Promise.all([
      // Revoked sessions older than 90 days
      db.execute(sql`
        DELETE FROM sessions
        WHERE revoked_at IS NOT NULL
          AND revoked_at < ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)}
      `),
      // Soft-deleted tool_usages older than 2 years
      db.execute(sql`
        DELETE FROM tool_usages
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)}
      `),
      // Soft-deleted executions older than 2 years
      db.execute(sql`
        DELETE FROM executions
        WHERE deleted_at IS NOT NULL
          AND deleted_at < ${new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)}
      `),
      // webhook_execution_log older than 1 year
      db.execute(sql`
        DELETE FROM webhook_execution_log
        WHERE created_at < ${new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)}
      `),
      // Used or expired password_reset_tokens older than 30 days
      db.execute(sql`
        DELETE FROM password_reset_tokens
        WHERE (used_at IS NOT NULL OR expires_at < ${now})
          AND expires_at < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
      `),
      // Used or expired email_verification_tokens older than 30 days
      db.execute(sql`
        DELETE FROM email_verification_tokens
        WHERE (used_at IS NOT NULL OR expires_at < ${now})
          AND expires_at < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
      `),
    ]);

  return {
    sessions: (sessions as any).rowCount ?? 0,
    toolUsages: (toolUsages as any).rowCount ?? 0,
    executions: (executions as any).rowCount ?? 0,
    webhookExecutionLog: (webhookLog as any).rowCount ?? 0,
    passwordResetTokens: (resetTokens as any).rowCount ?? 0,
    emailVerificationTokens: (verifyTokens as any).rowCount ?? 0,
  };
}
