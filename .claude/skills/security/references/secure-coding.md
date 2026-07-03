# Secure coding (implement stage)

Concrete rules the implementer follows while writing code. Grouped by OWASP Top 10
2025 risk. Language-agnostic — apply the equivalent in your stack.

## Input & injection (A05)
- Parameterized queries / prepared statements — NEVER string-concatenate SQL.
- Output-encode for the sink (HTML, attribute, JS, URL, shell) to stop XSS.
- Allow-list validate every external input (type, length, range, format).
- No `eval` / dynamic template from user input (SSTI); no unsafe deserialization.
- Guard SSRF: validate/allow-list outbound URLs; block internal ranges.

## Access control (A01)
- Enforce authorization SERVER-SIDE on every route and every object access.
- Deny-by-default; check ownership (no IDOR — don't trust an id from the client).
- Never rely on hidden UI / client checks for security.

## Auth, sessions, tokens (A07)
- Hash passwords with argon2id / bcrypt (never plaintext / fast hashes).
- Secure session cookies: `HttpOnly`, `Secure`, `SameSite`; rotate on login;
  real server-side logout. Validate JWT signature + exp + aud; short-lived.
- Rate-limit / lock out credential endpoints; MFA where it matters.

## Crypto & secrets (A04)
- TLS for all transport. Use vetted libraries + current algorithms (AES-GCM,
  SHA-256+); no home-rolled crypto, no ECB, no MD5/SHA1 for security.
- Secrets ONLY from env / a secret manager — never in code, config-in-repo,
  prompts, or logs. Separate per environment; least privilege; rotate.

## Errors, logging, exceptions (A09, A10)
- Fail safe / closed; handle EVERY error path; never leak stack traces or
  internal detail to the client.
- Log security-relevant events (authn/authz failures, input rejections) WITHOUT
  secrets or PII. Make logs tamper-evident where it matters.

## Supply chain & integrity (A03, A08)
- Pin dependency versions; pull from trusted registries; keep an SBOM.
- Verify integrity of updates / CI artifacts; no insecure deserialization of
  untrusted data.

## Config (A02)
- No debug endpoints, default credentials, or verbose errors in prod.
- Set security headers (CSP, HSTS, X-Content-Type-Options); scope CORS tightly.

## Self-check before handing off
Map each touched area to its risk above; anything unmet → fix or flag to the
`security` cookbook gate. The blind security/abuse tests will assert these.

Reference: OWASP Top 10 2025, OWASP ASVS 5.0 (V2/V6/V7/V8/V11/V12/V14/V16),
OWASP Cheat Sheet Series.
