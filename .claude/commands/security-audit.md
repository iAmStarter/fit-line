---
description: Holistic security audit — sweep the WHOLE product against the security cookbook (OWASP Top 10 / ASVS / WSTG / secrets / SCA / SAST / supply chain), score it, and produce a prioritized findings report. On-demand or before a release. NOT the per-phase gate — rule 11 checks one phase while coding; this audits the whole attack surface.
argument-hint: [optional scope]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Purpose: a whole-product SECURITY audit — the security counterpart of `/ui-audit`
and `/qa-audit`. The per-phase gate (rule 11) checks secrets/SCA/SAST + secure coding
on ONE phase; this audit sweeps the ENTIRE attack surface and the product's security
posture. Run before a release, after auth/data changes, or on request — and before
the pre-deploy pentest, not instead of it.

Security = "is it SAFE?" — a different axis from QA ("does it work?") and UI
("does it look right?"). Passing those never implies this.

## PRE-FLIGHT
Read the rubric: `.claude/skills/security/SKILL.md` (the Secure SDLC cookbook) and
its `references/` (OWASP Top 10 / ASVS / WSTG / ISO 27001 / SLSA). The cookbook IS the
checklist — audit against it; don't invent criteria.

## STEP 1 — INVENTORY (attack surface)
Map it from `docs/ENDPOINTS.md` + the code: entry points (routes, inputs, file
uploads, webhooks), trust boundaries, auth/session, data stores + PII, secrets,
third-party deps, and outbound calls.

## STEP 2 — SWEEP  (dispatch a worker to keep context lean)
- **OWASP Top 10** — broken access control, crypto failures, injection (SQLi/XSS/
  cmd), insecure design, misconfiguration, vulnerable components, auth failures,
  integrity failures, logging/monitoring gaps, SSRF.
- **AuthN / AuthZ** — every protected route enforces it; no IDOR; least privilege.
- **Secrets** — none in code/history/config/prompts (run gitleaks/trufflehog if present).
- **Dependencies (SCA)** — known CVEs (run `npm audit` / `pip-audit` / `osv-scanner`).
- **SAST** — run semgrep / CodeQL if present; review hotspots otherwise.
- **Input validation + output encoding** at every boundary; safe file handling.
- **Crypto** — strong algorithms, no hardcoded keys, secrets at rest/in transit.
- **Supply chain (SLSA)** — pinned deps, build integrity, no untrusted scripts.
- **Logging / monitoring** — security events logged; no sensitive data in logs.
- **Threat-model coverage** — were the design-stage abuse cases actually tested?

## STEP 3 — SCORE + FINDINGS
Rate each area PASS / WARN / FAIL. Per finding:
- **severity**: CRITICAL · HIGH · MEDIUM · LOW (map to CVSS where it helps)
- **location**: endpoint / file / dependency
- **issue** + the OWASP/ASVS reference it breaks + **fix**

## STEP 4 — REPORT
Write `docs/security-audit-<YYYY-MM-DD>.md`: attack-surface map · per-area scoreboard ·
findings sorted by severity · prioritized remediation. Log HIGH/CRITICAL to
`docs/ISSUES.md`.
**VERDICT: SHIP | FIX-FIRST** — never ship with an open HIGH or CRITICAL.

## STEP 5 — REMEDIATE
A security fix is security-sensitive (autonomy hard-stop): in AUTO, fix and re-audit
but SURFACE the change for human sign-off before it lands. Park what's blocked +
report. A clean `/security-audit` is a precondition for the pre-deploy pentest gate.
