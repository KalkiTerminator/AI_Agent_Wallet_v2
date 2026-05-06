# Change Management Policy

**Version:** 2026-05-01 | **SOC 2:** CC8.1

## Code Changes
All changes require a GitHub Pull Request. No direct commits to `main`.
PR must pass CI (TypeScript type-check + Vitest tests) before merge.

## Deployment
Railway auto-deploys on push to `main` (API service).
Vercel auto-deploys on push to `main` (web service).
No manual `railway up` in production.

## Database Migrations
Migrations run automatically at deploy time via `drizzle-kit migrate`.
Railway internal hostname (`postgres.railway.internal`) used in production.
Production migrations are irreversible — always test against staging first.

## Emergency Changes
Hot-fixes follow the same PR process. Incident commander may approve with single reviewer.
All emergency deploys logged as `system.emergency_deploy` audit event.

## No Direct DB Access
Production DB is accessible only via Railway private networking.
Public proxy (`caboose.proxy.rlwy.net`) used for migrations only; credentials rotated quarterly.
