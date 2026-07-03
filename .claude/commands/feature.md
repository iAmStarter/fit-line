---
description: Feature lane — one APPROVED Feature doc in, a tested + hardened + documented feature branch out. Near-100% hands-off; humans remain at doc approval, UAT, and merge. Runs interactive or headless (CI / Docker).
argument-hint: [path to Feature doc, e.g. docs/features/<slug>/FEATURE.md · "dry-run"]
---

Caveman ULTRA mode. You are the ORCHESTRATOR. Route work to subagents —
you do NOT implement or debug yourself. Subagents cannot talk to the user; only YOU can.

Target doc: $ARGUMENTS  (default: the single `docs/features/*/FEATURE.md` whose
`> Status:` reads `approved, pending` — zero or multiple candidates -> STOP and list them.)

---

## ENTRY MODES (before the pipeline)

- **`/feature new <name>`** — scaffold only. Copy
  `.claude/templates/FEATURE-template.md` to `docs/features/<kebab-name>/FEATURE.md`,
  fill `<feature name>`, then STOP: the human writes the spec and flips
  `> Approval:` to APPROVED. Never auto-approve; never continue into the pipeline.
- **`/feature from-story <key>`** — planning-stack bridge. If a story MCP is
  connected (e.g. iSSM `load_story`), load the story and transform it into the
  template's sections (story intent -> What & why, ACs -> Acceptance criteria,
  the rest mapped or left as explicit gaps). Write it as `Approval: PENDING` and
  STOP for human review + approval — a story is planning input, not a sign-off.
  No story MCP connected -> say so and fall back to `/feature new`.
- **`/feature <path>`** (or bare `/feature`) — run the pipeline below.

HEADLESS DETECT: env `ISSFLOW_HEADLESS=1` (set by the CI workflow / Docker runner)
means NO human is available this run. Every hard-stop below then degrades to:
write the blocker to `docs/features/<slug>/BLOCKED.md` + mark the gate `parked`
+ EXIT cleanly with a report. Never guess through a hard-stop.

---

## DRY-RUN CHECK (first)

`$ARGUMENTS` contains `dry-run` -> full analysis, EXECUTE NOTHING. Print the
ACTION PLAN (files · agents · tests/gates · branch · delivery target) then STOP.

---

## 0. INTAKE + PRE-FLIGHT

a. BROWNFIELD CHECK: `docs/OVERVIEW.md` must exist — the feature lane extends an
   EXISTING product. Missing -> STOP; route to `/overview` (greenfield lane).

b. APPROVAL GATE (the ONE human gate at entry): the Feature doc must carry a header
   ```
   > Approval: APPROVED <name> <date>
   > Automation: <none | push | push+pr>
   ```
   Missing/PENDING -> HARD-STOP: a human approves the DOC, not the run (need a doc?
   `/feature new <name>` scaffolds `.claude/templates/FEATURE-template.md`). Doc approval
   is the rule-13 sign-off *scoped to this doc only* — the mini-plan it produces
   inherits approval as long as it stays inside the doc's stated scope.

c. WORKSPACE: slug = kebab-case of the doc's title. Ensure
   `docs/features/<slug>/FEATURE.md` (move the doc there if given elsewhere).
   Write `docs/features/<slug>/GATES.md` — the gate checklist, all unchecked:
   ```
   # GATES — <slug>
   - [ ] spec-complete
   - [ ] adversarial-doc-review
   - [ ] mini-plan
   - [ ] contract-probe
   - [ ] build-green
   - [ ] review-harden
   - [ ] regression-green
   - [ ] test-plan
   - [ ] docs-updated
   - [ ] token-stamp
   - [ ] summary
   - [ ] memory-queued
   ```
   The `Stop` hook (`feature-gate.js`) BLOCKS session end while any gate is
   unchecked — check each box the moment its step truly passes, never earlier.
   Aborting legitimately: set `feature: <slug> (parked — <reason>)` in STATE.md.

d. STATE + BRANCH: `docs/STATE.md` gets `feature: <slug> (active)`. Work on
   branch `feature/<slug>` (create from the default branch if needed). Never the
   default branch.

---

## 1. PREPARATION & SPEC COMPLETION

Dispatch `researcher` (IMPL mode) scoped to the doc: which modules/files the
feature touches, which dependencies + versions are involved, what the doc leaves
unstated. Fill every gap with the most reasonable interpretation and log each one
under `## Assumptions` in FEATURE.md (AUTO decision protocol — decide + log +
continue). Check gate `spec-complete`.

## 2. ADVERSARIAL DOC-REVIEW (before planning)

Dispatch TWO reviewers in parallel, each told to ATTACK the doc, not summarize it:
- correctness lens: contradictions, missing edge cases, undefined behaviour,
  hidden scope, unstated integrations.
- security lens: does the feature cross a TRUST BOUNDARY (auth, untrusted input,
  data store, money, PII)? If yes, threat-model it now (`security` skill) and fold
  abuse cases into the acceptance criteria as negative cases.

Merge findings into FEATURE.md `## Acceptance criteria` (positive + negative).
Internally CONTRADICTORY spec -> HARD-STOP (methodology hard-stop 3). Merely
incomplete -> fill + log. Check gate `adversarial-doc-review`.

## 3. MINI-PLAN

Dispatch `planner` scoped to the doc -> `docs/features/<slug>/PLAN.md`: 1–3
VERTICAL slices, each with acceptance spec + `[N pts]`. The main `docs/PLAN.md`
is NOT touched — the feature lane is self-contained. If the plan cannot fit the
doc's stated scope (planner needs work the doc never mentions) -> HARD-STOP:
that is scope creep; route to `/change-request`. Check gate `mini-plan`.

## 4. CONTRACT SURFACE PROBE

Before any test is written: enumerate every public surface the feature ADDS or
CHANGES — endpoints, exported functions/classes, CLI commands, events, schemas.
Diff against `docs/ENDPOINTS.md` + the existing types. Write
`docs/features/<slug>/CONTRACTS.md`: exact signatures, request/response shapes,
error shapes. A changed EXISTING contract is a breaking change -> list every
caller + the migration in CONTRACTS.md. This file is what test-author asserts
against. Check gate `contract-probe`.

## 5. BUILD LOOP (per slice — the /phase machinery, feature-scoped)

For each slice in `docs/features/<slug>/PLAN.md`, in order:
- TDD APPLICABILITY per the methodology (default `TDD_PHASE=true`, log the call).
- TDD slice: SCAFFOLD (implementer, stubs from CONTRACTS.md) -> RED (`test-author`,
  BLIND — reads FEATURE.md acceptance criteria + CONTRACTS.md only, never the
  implementation) -> GREEN (`implementer`) -> e2e (`e2e-runner`) when the slice has
  a user-facing flow. Non-TDD slice: IMPLEMENT -> TEST.
- Debug circuit breaker: WARN at 2, cap 3, `/unstuck` once per slice; still stuck
  -> park the slice (BLOCKED in the feature PLAN) + continue to the next
  independent slice. Blockers batch-report at the end, never mid-flow.
- Rule 11 (secure coding + SAST/SCA/secrets) and rule 12 (lint/format/naming/
  architecture) apply per slice as in `/phase`.
- `implementer` updates `docs/ENDPOINTS.md` as surfaces land.

All slices done + full feature suite green -> check gate `build-green`.

## 6. REVIEW & HARDEN (adversarial + self-review)

- Dispatch TWO reviewers against the full feature diff: correctness lens +
  security lens. CONFIRMED findings -> fix loop, capped at 2 rounds; leftovers
  are logged in ISSUES.md, severity-tagged; any HIGH leftover -> HARD-STOP.
- Self-review: reread the diff against FEATURE.md acceptance criteria — every
  criterion maps to a test; every assumption still holds.
- Run the regression corpus (`scripts/regression.sh`) + the full real suite.
  Green -> check gates `review-harden` + `regression-green`.

## 7. MANUAL TEST PLAN

Write `docs/features/<slug>/TEST-PLAN.md` — an all-case scenario sheet a human
tester can run without reading code: happy paths, negative cases, edge cases,
per-scenario steps + expected results, in the project language (OVERVIEW). Same
format `/uat` consumes, so the sheet plugs straight into the UAT cycle.
Check gate `test-plan`.

## 8. DOCS + STAMPS + MEMORY

a. Documentation update: `docs/ENDPOINTS.md` final pass; README/docs deltas the
   feature makes stale. Check gate `docs-updated`.
b. Token stamp — append to FEATURE.md:
   ```
   ## Token stamp
   context: ~<pct>% of window · subagents: <n> · slices: <n> · debug rounds: <n>
   ```
   Check gate `token-stamp`.
c. Summary — append to FEATURE.md `## Summary`: what shipped, assumptions made,
   parked blockers, contract changes. One line to `docs/HISTORY.md`.
   Check gate `summary`.
d. Memory update — append wisdom candidates (resolved issues, reusable findings)
   to `docs/WISDOM-QUEUE.md`. The QUEUE is local + automatic; pushing to the
   shared KB stays human (`/store-wisdom` reads the queue). Check gate `memory-queued`.

Then: STATE.md -> `feature: <slug> (done)`.

## 9. DELIVERY

Commit the feature branch (clear message per slice or one squashed commit).
Then by the doc's `> Automation:` header:
- `none` (default) -> STOP here. Show the human: branch name, summary, TEST-PLAN
  path. Push is theirs (methodology hard-stop 1).
- `push` -> push `feature/<slug>` (`git push -u origin feature/<slug>`). No PR.
- `push+pr` -> push + open a PR to the default branch. PR body = FEATURE.md
  Summary + link to TEST-PLAN.md. NEVER merge. NEVER deploy. Merge and prod
  stay human, always.

Final report (interactive: to the user · headless: as the run's closing output):
gates table · parked blockers · assumptions · branch/PR · "next: run /uat with
docs/features/<slug>/TEST-PLAN.md".

---

## What stays human (by design — do not automate these away)

1. Writing + APPROVING the Feature doc (entry gate).
2. Any hard-stop: contradictory spec · scope creep · HIGH security finding.
3. UAT against TEST-PLAN.md, and the merge.
4. Production deploy — never in this lane; that is `/release`.
