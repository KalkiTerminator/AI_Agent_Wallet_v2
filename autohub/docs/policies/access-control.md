# Access Control Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.1, CC6.2

## RBAC Hierarchy
Roles: `user (0) < moderator (1) < admin (2)`. Defined in `apps/api/src/middleware/rbac.ts`.

## Admin Provisioning
Admin accounts are provisioned exclusively via `scripts/promote-admin.ts` with direct DB access.
No self-service admin promotion. Every promotion is recorded in `audit_logs` with `action = "admin.user.role_changed"`.

## MFA Requirement
Admin and moderator roles require TOTP MFA enabled before any privileged request is processed.
Enforced in `apps/api/src/middleware/auth.ts` — requests from privileged roles without `mfaEnabled = true` in JWT receive HTTP 403.

## Session Management
JWT TTL: 1 day. Sessions tracked in `sessions` table by `jti`. Revoked sessions return HTTP 401.
Users can revoke all sessions via `DELETE /api/auth/sessions`. Admins can revoke any user's sessions.

## Access Review
Quarterly: admin reviews `GET /api/admin/compliance/users` output, verifies no stale admin accounts.
Evidence stored as audit log entry `action = "admin.access_review"` (manual trigger).
