# Encryption at Rest Policy

**Version:** 2026-05-01 | **SOC 2:** CC6.7 | **HIPAA:** §164.312(a)(2)(iv)

## Database
Railway managed PostgreSQL uses AES-256 encryption at rest (Railway infrastructure guarantee).
Reference: https://docs.railway.app/reference/security

## Application-Level Encryption
Webhook URLs and auth headers are encrypted with AES-256-GCM before storing in the database.
Implementation: `apps/api/src/services/crypto.ts` using Node.js `crypto` module.
Key material sourced from `ENCRYPTION_KEY` environment variable via `EnvKeyProvider`.

## Key Rotation
`KeyProvider` interface defined in `apps/api/src/services/crypto.ts` supports hot-swap to `KMSKeyProvider`.
Rotation procedure: update `ENCRYPTION_KEY` in Railway, re-encrypt existing rows via migration script.
Current rotation cadence: annually or on suspected compromise.

## In Transit
TLS 1.2+ enforced by Railway (API) and Vercel (web). No plain HTTP endpoints in production.
