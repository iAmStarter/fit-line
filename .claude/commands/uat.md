---
description: Manual UAT cycle — generate an all-case test-scenario document for human testers, hand it off, capture their pasted results, and drive the defect loop until every scenario passes. Used inside /release; the human-in-the-loop acceptance gate.
argument-hint: [optional: feature scope, or "failed" to re-issue only failures]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

UAT is a HUMAN gate: real testers run the product and report results. Your job is to
make that easy — produce a clear scenario sheet, capture results, and loop on defects.

## STEP 1 — BUILD SCENARIOS
From `docs/OVERVIEW.md` (flows) + `docs/PLAN.md` (acceptance) + `docs/ENDPOINTS.md`,
write `docs/UAT-<date>.md` covering ALL cases a tester should run:
```
## UAT — <project>   (<date>, build <ref>)
| # | scenario | preconditions | steps | expected | Result (PASS/FAIL) | Notes |
|---|----------|---------------|-------|----------|--------------------|-------|
| 1 | …        | …             | …     | …        |                    |       |
```
Cover: every happy path, every acceptance criterion, edge / negative cases, each user
role, and each critical flow. Group by feature, number them, leave Result + Notes
blank for the tester. Keep steps concrete enough to follow without you.

## STEP 2 — HAND OFF
Show me the scenario sheet, ready to run. Tell me to execute it (or pass it to QA /
the client), then **paste the results back** here. WAIT — do not assume results.

## STEP 3 — CAPTURE RESULTS
Take the pasted results, fill PASS/FAIL + notes into `docs/UAT-<date>.md`, and
summarise: **X / Y passed**, list the failures with their scenario IDs.

## STEP 4 — DEFECT LOOP
For each FAIL: log to `docs/ISSUES.md` (repro = the scenario steps), fix
(`implementer` / `debugger`, debug cap 3), re-run the automated tests for that area,
then re-issue **only the failed scenarios** to me for re-test. Loop until 100% PASS.
On all-green, hand back to `/release` for sign-off.
