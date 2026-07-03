---
description: Pre-production release pipeline — after all build phases, run the full automated gauntlet (full regression: functional / integration / e2e · all audits: UI / QA / security / code · smoke test), then hand off to manual UAT, drive the defect loop to green, produce a sign-off document, and promote to production. The automated SDLC backbone; production deploy is a human-signed hard-stop.
argument-hint: [optional: target env · "dry-run" to preview the pipeline without running it]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Run this AFTER every build `/phase` is done (the candidate is on staging/preview).
AUTO runs all AUTOMATED stages without stopping; it STOPS only at the human gates —
UAT execution, sign-off, and the production promote (security/irreversible hard-stops).
Record progress in STATE.md so a resumed session continues mid-pipeline.

DRY-RUN: if `$ARGUMENTS` contains `dry-run`/`--dry-run`, do the full analysis but
EXECUTE NOTHING — print the ACTION PLAN (stages, audits, deploy target, risk impact)
and STOP. Nothing is run, signed, or promoted. (METHODOLOGY → Dry-run.)

## STAGE 1 — FULL REGRESSION (auto)
Run the whole REAL corpus end-to-end: **functional + integration + e2e**
(`scripts/regression.sh --real`, then the declared E2E runner via `e2e-runner`).
Any red → `debugger` (cap 3) → fix → re-run. Must be 100% green to proceed.

## STAGE 2 — AUTO AUDITS (auto)
Run every whole-product audit and fold results together:
- `/ui-audit` · `/qa-audit` · `/security-audit`
- **code cleaning**: lint + format (the language's standard tool) must be clean
- **code optimization**: a pass for dead code, obvious N+1 / perf, bundle bloat
Collect every BLOCKER / HIGH / CRITICAL. Open blocker → fix → re-audit. (Security
fixes surface for sign-off — security is an autonomy hard-stop.)

## STAGE 3 — SMOKE TEST (auto)
Deploy the candidate to staging/preview; run the **smoke suite**: app boots, health
endpoint 200, the critical happy paths load, no console/server errors. Fail → STOP, fix.

## STAGE 4 — UAT HANDOFF (human)
Dispatch `/uat`: generate the all-case scenario document, hand it to the testers, and
WAIT. Capture their pasted results into `docs/UAT-<date>.md`. (UAT is a human gate.)

## STAGE 5 — UAT DEFECT LOOP
For each issue/bug reported: log to `docs/ISSUES.md` (repro from the scenario), fix
(`implementer`/`debugger`), re-run STAGE 1–3 for the touched area, then resubmit ONLY
the failed scenarios via `/uat`. Loop until ALL scenarios PASS.

## STAGE 6 — SIGN-OFF (human)
Produce `docs/SIGNOFF-<date>.md`: scope delivered · test + audit results summary · UAT
pass confirmation · known limitations · the approver/date line. **STOP for human
sign-off** — a release gate, always interactive in both modes.

## STAGE 7 — PROMOTE TO PRODUCTION (hard-stop)
On a SIGNED sign-off only: deploy to production, smoke-test prod (health 200), update
`docs/ENDPOINTS.md` base URL, tag the release. HISTORY line: `released v<n> (<date>)`.

## STAGE 8 — GO-LIVE & SUPPORT
Enter after-go-live support (hypercare): watch for incidents, keep the issue log live.
New scope → `/change-request` (impact + re-price + sign-off). The project is live; the
loop continues through change requests.
