---
description: Run one phase end-to-end. TDD phases run SCAFFOLD -> RED -> GREEN; non-TDD phases run IMPLEMENT -> TEST. Both with the debug circuit breaker and the regression guard at CLOSE.
argument-hint: [phase number · "dry-run" to preview what the phase would do]
---


Caveman ULTRA mode. You are the ORCHESTRATOR. Route work to subagents —
you do NOT implement or debug yourself.

Note: subagents cannot talk to the user. Only YOU can.

Target phase: $ARGUMENTS  (default: the phase marked pending in docs/PLAN.md)

---

## DRY-RUN CHECK (first — before PRE-FLIGHT)

If `$ARGUMENTS` contains `dry-run` or `--dry-run`: do the full analysis but EXECUTE
NOTHING. Print the ACTION PLAN — files you'd create/change · agents you'd dispatch ·
tests/gates you'd run · deploy target · cost/scope/risk impact — then STOP. Write,
run, commit, deploy nothing. (METHODOLOGY → Dry-run.)

---

## 0. PRE-FLIGHT

a. PLAN-APPROVAL CHECK (hard rule 13): Read the docs/PLAN.md `> Approval:` header.
   Still `PENDING` (or no header) -> STOP. The plan is not signed off; no phase may
   start. Route me to the `/overview` PLAN-APPROVAL gate (or `/replan` then re-approve).
   Approved -> continue.

b. INFRA CHECK (phases > 0): Read the declared infra in docs/OVERVIEW.md.
   - Managed infra -> confirm it is reachable; no provisioning step is needed.
   - Self-managed infra -> confirm Phase 0 (infra) ran and is healthy.
   Surface infra + auth status before any work. Blocked infra -> STOP.

c. PHASE STATE CHECK: Read docs/STATE.md and docs/PLAN.md.
   - No phase in progress, requested is next pending -> START at step 1.
   - Same phase in-progress -> RESUME from STATE.md "next action".
   - Different phase in-progress -> STOP. Tell me which phase is open.
   - Out of dependency order -> AUTO: ignore the request and run the next pending
     phase in PLAN order. GUIDED: STOP, warn, proceed only if I confirm.
   - Phase not in PLAN.md -> STOP. Suggest /overview or /replan.

d. FINAL PHASE CHECK: Read docs/PLAN.md. Is this the last phase (no further
   pending phases after this one)? Record this as IS_FINAL_PHASE=true/false.


---

## 1. RESEARCH + TDD APPLICABILITY

Dispatch `researcher` in IMPL mode scoped to this phase.
Returns terse summary + path. Read the file only if needed.
Unknowns block the phase -> re-dispatch narrowed. No guessing.

SECURE SDLC (design): if this phase touches a TRUST BOUNDARY (auth, untrusted input,
data store, money, PII), threat-model it now (`security` skill) and fold the abuse
cases into the acceptance criteria as negative cases BEFORE SCAFFOLD.

Then classify the phase:

  `TDD_PHASE` = the phase adds or changes a PUBLIC CALLABLE SURFACE (endpoint,
  exported function/class, CLI command, message contract) assertable from the
  acceptance spec. Size is NOT the criterion.

- Clear public surface -> `TDD_PHASE=true` -> run the TDD path (§2 → §3a → §3b).
- Pure infra/config/doc, no public surface -> `TDD_PHASE=false` -> run the
  non-TDD path (§2N → §3N).
- AMBIGUOUS -> default `TDD_PHASE=true`. AUTO: log the classification + reason to
  STATE and proceed. GUIDED: surface it so I can override to non-TDD BEFORE SCAFFOLD
  fires. (Hard rule 10: never downgrade a TDD phase just to dodge the RED gate.)

=====================================================================
## TDD PATH  (TDD_PHASE=true)
=====================================================================

## 2. SCAFFOLD

Dispatch `implementer` in SCAFFOLD mode: interface stubs only (signatures +
types; bodies raise NotImplementedError / return 501); NO logic, NO tests.
Returns the stub files + the interface surface.

## 3a. RED

Dispatch `test-author` to write the REAL API suite (+ mock) BLIND against the
stubs + acceptance. Place contract/ENDPOINTS tests in `tests/regression/`,
phase-local tests in `tests/phase-<n>/`. Run the suite.

RED GATE = every acceptance test COLLECTS cleanly AND FAILS (assertion /
NotImplemented).
- Any test PASSES on stubs -> spec trivial or test wrong. AUTO: re-dispatch
  test-author to tighten it (within budget) + log the cause; GUIDED: STOP, show me.
- Collection / import / syntax error -> stub mismatch; re-dispatch SCAFFOLD to
  fix SIGNATURES (not logic); re-run.
- UNDERSPEC -> AUTO: sharpen the acceptance spec yourself from the BMAD/iSSM story,
  log the interpretation as an Assumption, continue. GUIDED: STOP; ask me to sharpen it.

## 3b. GREEN

Dispatch `implementer` in FILL mode with the phase spec + research + the test
file paths (it MAY read the tests — frozen before logic, no overfit — but must
NOT edit them). Fill to green. Budget 3, WARN@2, STUCK@3.

## 3c. TEST (e2e) — FRONTEND phases only

If this phase ships UI: dispatch `e2e-runner` (BLIND) to write + run browser E2E
for the slice using the declared E2E runner (it brings the test stack up/down
itself). Then run the `ux-design` cookbook + wireframe check on the new UI
(hard rule 9): the UI must match the wireframe frame and pass the cookbook
(tokens, a11y/WCAG AA, states, breakpoints). A `ux-design` BLOCK is a GATE FAIL.
Non-frontend phase -> skip §3c.

PHASE GATE (rule 5) -> go to §4/§5/§6 (see GATE below).

=====================================================================
## NON-TDD PATH  (TDD_PHASE=false)
=====================================================================

## 2N. IMPLEMENT

Dispatch `implementer` (legacy mode) with phase spec + research summary.
Returns STUCK -> go to ESCALATE.
If IS_FINAL_PHASE: phase spec includes the deploy task; confirm the return
includes "deployed URL" before proceeding.

## 3N. TEST (blind)

Dispatch `test-author`. It writes MOCK + REAL API suites from the acceptance
spec — never reads the logic. (e2e-runner only if frontend.)

=====================================================================

## GATE (both paths)

PHASE GATE = current-phase REAL API suite passes AND (if frontend) E2E passes AND
(if frontend) the `ux-design` cookbook + wireframe check passes AND the
accumulated mock regression corpus stays green AND every docs/ENDPOINTS.md
entry has a regression test (checked at CLOSE).
- GATE PASS -> go to CLOSE.
- GATE FAIL (LOGIC FAIL) -> go to FIX.

---

## 4. FIX

Dispatch `debugger` (isolated context) on the specific failure.
- FIXED -> re-run TEST (and the regression corpus).
- WARN (2 attempts failed) -> relay immediately, then let debugger finish attempt 3.
- STUCK -> go to ESCALATE.

---

## 5. ESCALATE — circuit breaker (mode-aware; see METHODOLOGY → Autonomy)

**AUTO (default) — do NOT stop the run:**
  FIRST STUCK: auto-run `/unstuck` (deep re-research) — CAP: at most ONCE per phase
  (it is token-expensive); re-dispatch `debugger` with the findings, budget 3.
  STILL STUCK (or already spent this phase's unstuck): log the issue (root cause +
  every failed hypothesis) to ISSUES.md,
  mark the slice `BLOCKED` in PLAN, and move to the next INDEPENDENT slice/phase.
  Add it to the batched end-of-run report. HARD-STOP (pause for me) ONLY if no
  independent work remains, or the blocker is on the hard-stop list
  (security / irreversible / contradictory spec).

**GUIDED:**
  FIRST STUCK: STOP. Present the problem, 3 failed hypotheses, the debugger's
  recommendation, the debug file path. Wait. Options:
    (a) "re-research" -> /unstuck   (b) hint -> re-dispatch debugger, budget 3
    (c) "skip" / "re-slice" -> mark blocked, dispatch planner
  SECOND STUCK: STOP completely. Full summary. Hand control to me.

---

## 6. CLOSE

REGRESSION GATE (before closing — Feature 3):
- Run `scripts/regression.sh` (mock corpus). A failure BLOCKS close -> route to FIX.
- ENDPOINTS COVERAGE: every `docs/ENDPOINTS.md` entry MUST have >=1 test in
  `tests/regression/`. Zero coverage -> FAIL HARD; do not close.
- IF IS_FINAL_PHASE: additionally run `scripts/regression.sh --real` (full real
  corpus). A failure blocks close.

CODE-STANDARDS GATE (rule 12): the formatter + linter are clean (the language's
standard tool); names follow the language's own idiom; the code conforms to the
declared architecture (Feature-Based by default). Lint/format errors or idiom
violations BLOCK the close -> route to FIX. (`code-standards` skill.)

SECURITY GATE (rule 11 — Secure SDLC build stage):
- Security-touching OR deploy phase -> run the `security` cookbook. Build gates:
  secrets scan + SCA (dependency CVEs) + SAST must be clean.
- IS_FINAL_PHASE / deploy -> also run the pentest checklist (WSTG) + a security
  review of the diff; sign artifacts (SLSA L2+).
- Open HIGH/CRITICAL findings BLOCK the close -> route to FIX. Deploying to prod
  with open high/critical findings is a hard-stop (human sign-off).

Mark phase `done` in docs/PLAN.md.

SPRINT STANDUP (if a sprint is active — STATE.md shows `sprint: <n> (active)`):
fire the `/sprint standup` tick — append the one-line standup to
docs/sprints/sprint-<n>.md and update the burndown (rule: SPRINT-STANDUP ritual).
If all the sprint's committed phases are now done/blocked, recommend `/sprint review`
(or, under `/sprint run`, the driver proceeds to review automatically).

ARCHITECTURE SELF-CHECK: did this phase add/remove/rename an agent, hook, or
command, or change a workflow rule? YES -> run `/log-decision`. NO -> state why not.

IF IS_FINAL_PHASE — FINAL CLOSE sequence:

  a. Run `/synthesize` — pass the signal that this is the final phase so the
     synthesizer runs the extended pass (OVERVIEW.md + README.md update).

  b. Read docs/ENDPOINTS.md. Surface a "READY TO USE" summary to me:
     ```
     ✅ PROJECT COMPLETE


     ## Endpoints
     <paste the full docs/ENDPOINTS.md table>

     ## Quick start
     - Base URL: <URL>
     - Auth: <Bearer token / API key / none — from ENDPOINTS.md>
     - Health check: GET <base URL>/health

     ## Docs
     - Full endpoint catalogue: docs/ENDPOINTS.md
     - Project history: docs/HISTORY.md
     ```
  Tell me the project is complete and ready to use.

ELSE (not final phase):

  Run `/synthesize`.
  Tell me phase done + the next phase. Recommend `/clear` then `/phase` next.

---

## STATE CHECKPOINTING

After each step, update docs/STATE.md:
```

phase: <n> (in progress)
plan: approved <date>          ← carry forward; never drop the rule-13 sign-off record
tdd: <true|false>
completed: <steps done so far>
next: <exact next step>
blocker: <none or open issue>

```
Keep STATE.md small — overwrite, do not append. Preserve the `plan:` line on every
overwrite (the PLAN-APPROVAL record, hard rule 13); do not blank it.
