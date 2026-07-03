# Threat modeling (design stage)

Do this when a phase touches a trust boundary: new input, auth/authz, data store,
external service, file upload, money, or PII. Output = abuse cases written as
NEGATIVE acceptance criteria in PLAN, so `test-author` can assert them blind.

## 1. Sketch the data flow
- Components, data stores, external services, and the **trust boundaries** between
  them. Mark every place untrusted data crosses a boundary (the attack surface).

## 2. STRIDE each element
| Threat | Question | Mitigation direction |
|--------|----------|----------------------|
| **S**poofing | Can someone pretend to be another identity? | strong auth, MFA, signed tokens |
| **T**ampering | Can data be altered in transit/at rest? | TLS, integrity checks, input validation |
| **R**epudiation | Can an actor deny an action? | security logging, audit trail (no secrets) |
| **I**nfo disclosure | Can data leak? | authz, encryption, least data, safe errors |
| **D**enial of service | Can it be exhausted? | rate limits, quotas, timeouts |
| **E**levation of privilege | Can a user gain more rights? | deny-by-default authz, no IDOR |

## 3. Set the assurance level (OWASP ASVS)
- **L1** baseline · **L2** default for most apps · **L3** finance/health/critical.
- Record the target in OVERVIEW; the build/test gates verify to that level.

## 4. Write abuse cases as negative acceptance criteria
For each credible threat, add a criterion the tests must enforce, e.g.:
- GIVEN a user A token WHEN requesting user B's resource THEN 403 (no IDOR).
- GIVEN a login endpoint WHEN 10 bad attempts THEN lockout / rate-limit.
- GIVEN an upload WHEN a non-allowed type/size THEN rejected, not stored.

## 5. Feed it forward
- Threats → secure-coding focus (`references/secure-coding.md`).
- Abuse cases → the phase's acceptance criteria (planner) → blind tests.
- Residual risks → logged; high ones → their own slice.

Reference: OWASP Top 10 2025 (A06 Insecure Design), Microsoft STRIDE, OWASP ASVS 5.0.
