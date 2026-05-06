# Data Retention Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.5

## Retention Periods

| Data class | Retention | Action |
|---|---|---|
| `audit_logs` | 7 years | Never deleted |
| `sessions` (revoked) | 90 days | Hard delete |
| `tool_usages` (soft-deleted) | 2 years | Hard delete |
| `executions` (soft-deleted) | 2 years | Hard delete |
| `webhook_execution_log` | 1 year | Hard delete |
| `password_reset_tokens` (used/expired) | 30 days | Hard delete |
| `email_verification_tokens` (used/expired) | 30 days | Hard delete |

## Automated Purge
Implemented in `apps/api/src/services/retention.ts`. Runs nightly at 02:00 UTC via Railway Cron Job.
Every run writes a `system.retention_purge` audit event with per-table row counts.
Evidence queryable via `GET /api/admin/compliance/retention-runs`.

## Exceptions
`audit_logs` are never purged — they are the evidentiary record itself.
