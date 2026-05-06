# Incident Response Policy

**Version:** 2026-05-01 | **SOC 2:** CC7.3

## Detection
Sentry alerts on all unhandled exceptions and P1 error rate spikes.
BetterStack alerts on log anomalies (rate limit floods, auth failures).

## Severity & SLA
| Severity | Definition | Response SLA | Resolution SLA |
|---|---|---|---|
| P1 | Data breach, service down | 1 hour | 4 hours |
| P2 | Significant degradation | 4 hours | 24 hours |
| P3 | Minor issue, workaround available | 24 hours | 72 hours |

## Process
1. Detect via Sentry / BetterStack alert
2. Assign incident commander (on-call engineer)
3. Isolate affected service (Railway service stop if needed)
4. Investigate using audit logs (`GET /api/admin/compliance/audit-log`)
5. Remediate and deploy fix (Railway auto-deploy on push)
6. Write postmortem within 48 hours of resolution
7. Log postmortem as `system.incident_postmortem` audit event

## HIPAA Breach Notification
If incident involves PHI: notify affected users and HHS within 60 days.
