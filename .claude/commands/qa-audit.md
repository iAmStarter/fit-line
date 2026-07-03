---
description: Holistic QA audit — sweep the WHOLE product's functional quality (test-coverage gaps, regression health, flaky tests, critical-flow e2e, error/edge handling), score it, and produce a prioritized findings report. On-demand or before a release. NOT the per-phase gate — the phase gate runs one phase's real suite; this audits the entire test estate + behaviour.
argument-hint: [optional scope]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Purpose: a whole-product FUNCTIONAL QA audit — the QA counterpart of `/ui-audit`.
The per-phase gate (rule 5) proves ONE phase's real suite is green; this audit checks
the health + coverage of the ENTIRE test estate and the product's behaviour, end to
end. Run before a release, after big changes, or on request.

QA = "does it WORK right?" — a DIFFERENT axis from UI audit ("does it LOOK / meet
standards right?"). Passing one never implies the other.

## PRE-FLIGHT
Read `docs/ENDPOINTS.md` (the surface), `docs/PLAN.md` (acceptance specs), and the
`tests/` + `e2e/` suites. The acceptance criteria + ENDPOINTS are the rubric.

## STEP 1 — INVENTORY
List the public surface (endpoints, exported functions, CLI, message contracts) and
the critical user flows (from OVERVIEW). These are what MUST be covered.

## STEP 2 — SWEEP  (dispatch a worker to keep context lean)
- **Coverage** — every ENDPOINTS entry + acceptance criterion has a real-API
  regression test? List gaps. Untested branches / error paths?
- **Critical flows** — does e2e cover the must-work journeys (auth, the core slice,
  payments / data)?
- **Regression health** — run the full REAL corpus (`scripts/regression.sh --real`).
  Any reds?
- **Flakiness** — tests that pass only on rerun (timing) — flag; don't hide.
- **Negative / edge** — are abuse cases + edge inputs asserted, not just the happy path?
- **Contract drift** — do the mock suites still match the real API?
- **Test integrity** — tests written BLIND from the spec (no overfit)? None edited to pass?

## STEP 3 — SCORE + FINDINGS
Rate each dimension PASS / WARN / FAIL. Per finding:
- **severity**: BLOCKER (red real test · uncovered critical flow) · MAJOR (coverage
  gap · flaky) · MINOR (polish)
- **location**: suite + case (or the uncovered surface)
- **issue** + **fix**: the concrete change

## STEP 4 — REPORT
Write `docs/qa-audit-<YYYY-MM-DD>.md`: coverage map · per-dimension scoreboard ·
findings sorted by severity · prioritized fix list. Log BLOCKER / MAJOR to
`docs/ISSUES.md`.
**VERDICT: SHIP | FIX-FIRST** — never ship with a red real test or an uncovered
critical flow.

## STEP 5 — REMEDIATE
AUTO: dispatch `test-author` (BLIND) to fill coverage gaps, `debugger` for reds
(budget 3), then re-run. Park what's blocked + report. Tests are written by
`test-author` for impartiality — never weaken a test to make it pass.
