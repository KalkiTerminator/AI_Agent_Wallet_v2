# Vendor Management Policy

**Version:** 2026-05-01 | **SOC 2:** CC9.2

## Sub-Processors

| Vendor | Data handled | Purpose | SOC 2? |
|---|---|---|---|
| Railway | User PII, tool data, payments data | API hosting + PostgreSQL + Redis | Yes (SOC 2 Type II) |
| Vercel | Web traffic, session tokens | Next.js web hosting | Yes (SOC 2 Type II) |
| Stripe | Payment card data, billing info | Payment processing | Yes (PCI DSS Level 1) |
| Resend | User email addresses | Transactional email | Yes |
| BetterStack | Structured logs (PII-redacted) | Log aggregation | Yes |
| Sentry | Error traces (PII-redacted) | Error tracking | Yes (SOC 2 Type II) |

## Review Cadence
Annual vendor review. Any new sub-processor requires approval and DPA before use.
