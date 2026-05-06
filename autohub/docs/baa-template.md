# HIPAA Business Associate Agreement

**Between:** AutoHub (Service Provider) and [CUSTOMER NAME] (Covered Entity)
**Effective Date:** [DATE]

## 1. Definitions
"PHI" means Protected Health Information as defined under 45 CFR §160.103.
"BAA" means this Business Associate Agreement.

## 2. Permitted Uses of PHI
AutoHub may use PHI only to provide the services described in the Master Service Agreement and as required by law.

## 3. Safeguards
AutoHub implements the following safeguards:
- **In transit:** TLS 1.2+ on all API and web endpoints
- **At rest:** AES-256 encryption on Railway managed PostgreSQL
- **Application-level:** AES-256-GCM encryption for sensitive fields (webhook URLs, auth headers)
- **PHI fields:** Tool input fields marked `isPhi: true` are stripped before database persistence
- **Access control:** RBAC with MFA required for admin roles; session revocation within 1 hour of termination

## 4. Breach Notification
AutoHub will notify the Covered Entity of a Breach of Unsecured PHI within 60 days of discovery, per 45 CFR §164.410.

## 5. Sub-Processors Handling PHI
- Railway (database hosting) — SOC 2 Type II certified
- Vercel (web serving — no PHI stored) — SOC 2 Type II certified

## 6. Term and Termination
This BAA is coterminous with the Master Service Agreement. On termination, AutoHub will destroy or return PHI within 30 days.

## 7. Signatures

| AutoHub | [CUSTOMER NAME] |
|---|---|
| Signature: _______________ | Signature: _______________ |
| Name: _______________ | Name: _______________ |
| Title: _______________ | Title: _______________ |
| Date: _______________ | Date: _______________ |
