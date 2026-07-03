---
name: security
description: Secure SDLC cookbook — weaves security through the whole lifecycle: threat modeling at design, secure coding while building, SAST/SCA/secrets at build, DAST + pentest before deploy, and vulnerability management + security review after. Grounded in OWASP Top 10 (2025), OWASP ASVS 5.0 / WSTG, ISO/IEC 27001 & 25010, and SLSA. Use on any security-sensitive change (auth, authorization, secrets, crypto, input handling, file upload, external input), at design when threat-modeling a feature, and as the gate before a deploy phase closes. Keywords: security, secure sdlc, devsecops, threat model, STRIDE, auth, login, token, jwt, secret, password, crypto, encryption, injection, xss, sqli, ssrf, csrf, permission, authorization, vulnerability, CVE, dependency, SAST, DAST, SCA, pentest, deploy, audit, security review.
---

# security — Secure SDLC cookbook

Caveman ULTRA mode. Security is not a phase — it runs through the WHOLE lifecycle
(shift-left). It is a HARD gate (METHODOLOGY rule 11). A `BLOCK` verdict stops the phase.

Read on demand: `references/threat-modeling.md` (design stage),
`references/secure-coding.md` (implement stage), `references/pentest-checklist.md`
(deploy stage), `references/standards.md` (ISO 27001 / 25010 / SLSA mapping).

## Secure SDLC — security at every stage of the loop

| Loop stage | Security practice | Output / gate |
|------------|-------------------|----------------|
| **design-research / plan** | **Threat modeling** (STRIDE), abuse cases, pick the **ASVS level** (L1/L2/L3) | threats + security acceptance criteria in PLAN |
| **implement** | **Secure coding** — OWASP Top 10 rules, input validation, authz, crypto, secret handling | code that obeys `references/secure-coding.md` |
| **build (CLOSE, every phase)** | **SAST** + **SCA** (dependency CVEs) + **secrets scan** | no high/critical → else BLOCK |
| **test** | **DAST** + security/abuse test cases (test-author writes them blind) | no high/critical |
| **pre-deploy** | **Pentest gate** (OWASP WSTG run) + **security review** of the diff | zero open high/critical → else BLOCK |
| **operate** | **Vulnerability management** — SBOM + continuous CVE/SCA monitoring, re-research stale advisories | tracked; new criticals → new phase |

## Per-stage checklist

### Design — threat model first
- STRIDE the feature (Spoofing, Tampering, Repudiation, Info disclosure, DoS,
  Elevation). Mark trust boundaries + untrusted inputs. Write abuse cases as
  negative acceptance criteria. Set the ASVS target (default **L2**).
  → `references/threat-modeling.md`

### Implement — secure coding (OWASP Top 10 2025)
- A01 access control server-side, deny-by-default, no IDOR · A04 TLS + strong crypto,
  no secrets in code · A05 parameterized queries + output encoding + allow-list input
  · A07 safe auth/session/token · A09 log security events (no secrets) · A10 fail
  safe, handle every error path. → `references/secure-coding.md`

### Build — automated gates (run at every phase CLOSE)
- **Secrets scan** clean · **SCA** no unpatched critical/high CVE (emit SBOM) ·
  **SAST** no high/critical on changed code.

### Test — dynamic + abuse
- **DAST** on staging · security/abuse test cases asserted blind.

### Pre-deploy — pentest gate + review (A03 supply chain, SLSA L2+)
- Run the WSTG checklist; security-review the diff; sign artifacts (SLSA L2+).
  → `references/pentest-checklist.md`

### Operate — vulnerability management
- Keep an SBOM; monitor dependencies for new CVEs; a new critical → open a
  remediation phase. Promote findings to the shared KB (`/store-wisdom`).

## RETURN FORMAT

```
SECURE SDLC CHECK: <change / phase / deploy>
- stage: design | implement | build | test | pre-deploy | operate
- threat model (design): done | n/a — top risks: <STRIDE hits>
- secure coding: PASS | FAIL (<A0x gap>)
- build gates: SCA <clean/CVEs> · secrets <clean/found> · SAST <clean/findings>
- DAST/pentest (deploy): PASS | findings <high/critical count>
- ASVS target: L1 | L2 | L3 -> PASS | gaps: <chapters>
- VERDICT: PASS | BLOCK (phase cannot close)
```

Standards (current): OWASP Top 10 2025 · ASVS 5.0 · WSTG v4.2 · ISO/IEC 27001:2022 ·
ISO/IEC 25010:2023 · SLSA v1.1. Sourced from
`docs/research/design-security-standards-cookbook.md`.
