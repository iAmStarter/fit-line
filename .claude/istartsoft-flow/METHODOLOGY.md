# iStartSoftFlow — portable agent methodology (single source of truth)

> **The iStartSoft execution loop.** Namespaced under `.claude/istartsoft-flow/`
> so it coexists with a repo's own agent-instruction files (`CLAUDE.md`,
> `AGENTS.md`, `GEMINI.md`, …) — it does NOT replace them. The kit is
> **stack-agnostic and tool-agnostic**: it pins a *process*, not a *stack*.
> Declare your stack (language, framework, infra, auth, test + E2E runner,
> planning source) once in `docs/OVERVIEW.md`; every rule below references *your
> declared stack* and hardcodes none. If infra is **managed** (a PaaS + a managed
> datastore), Phase 0 (infra) is N/A and phases begin at the first vertical slice;
> otherwise Phase 0 provisions infra first. Planning source of truth stays in your
> PRD / architecture / stories (e.g. BMAD / iSSM); iStartSoftFlow is the execution
> loop layered on top.

<!-- ISTARTSOFTFLOW-AGENTS-SENTINEL-v2.0 -->
> **SENTINEL.** The HTML comment above (`ISTARTSOFTFLOW-AGENTS-SENTINEL-v2.0`) is a
> load-bearing marker. The installer (`create-issflow`) and tooling grep for it to
> confirm this file resolved on disk and was not clobbered. Do not remove or rename it.

> **What this file is.** The complete, tool-agnostic methodology for the iStartSoftFlow
> workflow: the loop, the roles, the procedures, the rituals, and the hard rules.
> This is the ONE place every rule lives. Claude Code, and any tool that reads the
> open `AGENTS.md` standard, get the full methodology from here.

> **Anti-drift invariant (load-bearing).** Every rule lives in exactly ONE place:
> this file. `CLAUDE.md` restates NO rule — it only maps roles to Claude-native
> files and says "native mechanism X performs ritual Y automatically." A rule and
> its automation may never contradict. Duplication between files is an
> architectural defect, not a convenience.

Caveman ULTRA mode always on. Apply the `karpathy-guidelines` skill (engineering
discipline) on every coding and debugging task. Apply the `ux-design` skill (the UX
cookbook + wireframe baseline) on every UI-facing task. Apply the `security` skill
(the Secure SDLC cookbook) at design (threat model), while coding (secure coding),
and before any deploy. Apply the `code-standards` skill (naming per the language's
own idiom + the declared architecture) on every coding task.

-----

## The loop

`design-research -> grill (×2) -> plan -> implement -> test -> deploy`, one
VERTICAL SLICE per phase. Implement AND test a phase before the next. The last
phase always includes deployment.

A phase runs in one of two orders, chosen at RESEARCH time by the TDD
APPLICABILITY check (see Procedures → `phase`):

- **TDD phase** (`TDD_PHASE=true`):
  `RESEARCH -> SCAFFOLD -> RED -> GREEN -> TEST(e2e) -> FIX -> CLOSE`
- **Non-TDD phase** (pure infra / config / doc — `TDD_PHASE=false`):
  `RESEARCH -> IMPLEMENT -> TEST -> FIX -> CLOSE`

`TDD_PHASE` = "the phase adds or changes a public callable surface (an endpoint,
exported function/class, CLI command, or message contract) that is assertable
from the acceptance spec." Size is NOT the criterion. On ambiguity, default
`TDD_PHASE=true` AND state the classification + reason so a human can override to
non-TDD before SCAFFOLD fires.

-----

## Sprint layer (the Scrum wrapper — optional)

Between the PLAN (the product backlog) and the PHASE (the build loop) sits an
optional **sprint layer** (`/sprint`): consecutive PLAN phases are grouped behind ONE
sprint goal and ship ONE deployable increment, wrapped in the full Scrum ceremony set.
The hierarchy is **PLAN (backlog) → SPRINT (committed slice) → PHASE (loop)**. Phases
run unchanged inside a sprint; the layer only adds cadence + inspect-and-adapt around them.

Scrum maps onto the kit with no new vocabulary to learn:

| Scrum | iStartSoftFlow |
|-------|----------------|
| Product Backlog | `docs/PLAN.md` (all phases) |
| Sprint Backlog | `docs/sprints/sprint-<n>.md` (committed phases + goal) |
| Scrum Master / Dev Team | the orchestrator (facilitates) / the subagent fleet (builds) |
| Sprint Planning | `/sprint plan` — slice the approved PLAN into a capacity-bounded sprint |
| Daily Scrum | `/sprint standup` — rebound to a **per-phase-close tick** (the AI loop has no calendar days) |
| Sprint Review / demo | `/sprint review` — demo the increment + run the boundary audits |
| Retrospective | `/sprint retro` — routed, concrete process actions |
| Increment · Burndown · Velocity | the deployable slice · remaining-points table · completed pts/sprint |

**AUTO-facilitated.** Sprint planning only SLICES an ALREADY-APPROVED plan (the
requirements gate happened at `/overview` plan approval), so the ceremonies are
AUTO-safe: `/sprint run` drives a whole sprint — or every remaining sprint — hands-off
(plan → loop `/phase` → standup tick → review → retro → close → next sprint), pausing
only at a methodology hard-stop. The PLAN-approval, commercial, and release gates are
SEPARATE and stay interactive (see Autonomy). The layer is opt-in: skip it and drive
phases directly off the PLAN exactly as before.

-----

## Project lifecycle (real-world delivery)

The loop above is the BUILD engine. Around it runs a full client-delivery lifecycle
— every stage produces an artifact and is logged, so a project has a complete trail
from idea to closeout:

1. **Discover** — idea → requirements, captured by `/overview` (the double-grill).
2. **PRD** — crystallised requirements in `docs/PRD.md` (or your BMAD/iSSM stories).
3. **Stack & architecture** — decided in `/overview` design-research → `OVERVIEW.md`.
4. **Plan** — `/overview`'s `planner` → `docs/PLAN.md` (the vertical-slice phases),
   then the **PLAN-APPROVAL gate** (rule 13): build cannot start until a human signs the
   plan off and the approval is recorded. The plan exists before the proposal, because
   the proposal estimates *these* phases.
5. **Proposal & estimate (OPTIONAL — depends on the job)** — for client / quoted
   work, `/propose` reads OVERVIEW + PLAN → `docs/PROPOSAL.md` + a rendered
   `docs/proposal.html`: scope, phase breakdown, effort + cost estimate, timeline,
   assumptions, with a **client sign-off gate** before build. Internal / personal
   projects skip straight from plan to build.
6. **Build** — the loop, one phase at a time (`/phase`, AUTO dev loop). Each phase's
   tests (unit + integration + e2e) are automated and MUST pass before the next phase.
   Optionally wrap the phases in the **sprint layer** (`/sprint`): group them into
   capacity-bounded sprints, each shipping one demoable increment with planning →
   standups → review → retro. `/sprint run` drives this end-to-end (see Sprint layer).
7. **Change mid-flight** — `/change-request`: impact analysis + re-estimate + a logged
   change order (`docs/CHANGES.md`) + sign-off, then `/replan`. Scope and cost never
   change silently.
8. **Release** — `/release`: full regression (functional/integration/e2e) → auto
   audits (UI / QA / security / code) → smoke → **manual UAT** (`/uat`, scenario sheet
   + captured results) → defect loop → **sign-off** (`docs/SIGNOFF-…`) → promote to
   production (a human-signed hard-stop).
9. **Go-live & support** — after-go-live hypercare; new scope routes through
   `/change-request`. The project is live; the loop continues.
10. **Closeout** — `/synthesize` → a project summary: what was built, key decisions,
    every change order, and the final cost vs the original estimate.

**Logging is continuous and total.** Every stage writes to a durable artifact:
requirements (PRD / OVERVIEW), commercial (PROPOSAL / CHANGES), execution
(PLAN / HISTORY), decisions (DESIGN_LOG), errors (ISSUES), research (research/).
Nothing important lives only in chat — it is on disk, so the project can always be
reconstructed and summarised.

**Approval gates are always interactive** (both modes): the **PLAN-APPROVAL** gate
(rule 13), the proposal sign-off, and every change-order approval pause for the human.
AUTO governs the *dev loop between* those gates, never the plan or the money decisions.

-----

## Feature lane (hands-off delivery — `/feature`)

The lifecycle above is the GREENFIELD lane (a whole project). The **feature lane**
is the BROWNFIELD lane: one APPROVED Feature doc in → a tested + hardened +
documented feature branch out, near-100% hands-off. Humans remain at exactly three
points: **approve the doc** (entry) · **UAT** (`/uat` against the generated
TEST-PLAN) · **merge**. Production deploy is never in this lane (`/release` owns it).

Pipeline (canonical body in `.claude/commands/feature.md`):
spec completion → adversarial doc-review → mini-plan → contract surface probe →
build loop (the `/phase` machinery, feature-scoped) → review & harden → manual
test plan → docs + token stamp + summary → memory queue → delivery.

Three layers make "hands-off" real — each uses the mechanism suited to its job:

1. **Judgment → the orchestrator + subagents.** `/feature` routes the pipeline
   through the standard roles under AUTO; the circuit breaker, rules 11/12, and
   blind TDD apply unchanged.
2. **Must-happen-every-time → a lifecycle hook.** `docs/features/<slug>/GATES.md`
   is the run's gate checklist; the `Stop` hook (`.claude/hooks/feature-gate.js`)
   BLOCKS session end while the feature is `(active)` in STATE with unchecked
   gates — and it verifies ARTIFACTS, not ticks: a checked `test-plan` /
   `mini-plan` / `contract-probe` / `token-stamp` / `summary` / `memory-queued`
   gate whose deliverable is missing on disk blocks too (also re-checked in the
   `(done)` state). A prompt can be ignored; the hook cannot. Rule 13 gets the
   same treatment: the `PreToolUse` plan gate (`.claude/hooks/plan-gate.js`)
   denies source Edit/Write while `docs/PLAN.md` reads `> Approval: PENDING`
   (docs/kit paths stay writable; an active feature lane is exempt — its doc
   approval is its own scoped gate). Hosts without lifecycle hooks run these as
   model-run rituals.
3. **No-human-at-the-keyboard → a headless runner.** `ISSFLOW_HEADLESS=1` tells the
   lane no human is present: every hard-stop degrades to a `BLOCKED.md` report +
   clean exit — never a guess. Two shipped runners (`create-issflow --ci|--docker`,
   sources in `.claude/templates/automation/`):
   - **GitHub Actions** — label an issue `feature:approved` (or dispatch with a doc
     path); the workflow runs the lane on an ephemeral runner.
   - **Docker** — `node scripts/feature-docker.js <FEATURE.md>` builds
     `Dockerfile.issflow` and runs the lane in an unprivileged container with the
     repo mounted; the container is the sandbox that makes a skip-permissions run
     acceptable. Works for any host that ships a headless CLI. The runner image
     MUST contain Node ≥ 18 — the lifecycle hooks are `node .claude/hooks/*.js`,
     and without node they die silently (no session context, no feature gate).
     The shipped image is Node-based and the wrapper preflights `node` before
     every run, including bring-your-own images (`ISSFLOW_IMAGE=<name>`).
     `--worktree` isolates a run in its own `git worktree` + branch, so 2–3
     features build in parallel without touching your checkout or each other
     (path-identical mounts: Linux/macOS).

**Approval semantics (rule-13 scoped).** The doc header
`> Approval: APPROVED <name> <date>` is the human sign-off, scoped to that doc
only; the mini-plan inherits it while it stays inside the doc's stated scope —
scope creep hard-stops to `/change-request`. The `> Automation: none|push|push+pr`
header pre-authorizes outbound git actions for THAT run (hard-stop 1 satisfied by
recorded consent). Merge and prod deploy can never be pre-authorized.

-----

## BMAD integration (planning front-end)

iStartSoftFlow is the EXECUTION loop; **BMAD-METHOD** is an optional PLANNING
front-end. They compose — BMAD plans, iStartSoftFlow builds — with no duplication:

| BMAD (plan) | feeds → | iStartSoftFlow (execute) |
|-------------|---------|--------------------------|
| Analyst / PM / Architect / PO agents | → | `/overview` grill + `researcher` + `planner` |
| PRD + Architecture | → | `docs/OVERVIEW.md` (+ `docs/PRD.md`) |
| sharded epics / story files | → | `docs/PLAN.md` phases (1 story ≈ 1 phase) |
| epics / sprint grouping | → | the **sprint layer** (`/sprint`) — phases grouped behind one sprint goal |
| SM "story with embedded context" | → | the phase **context package** (rationale + architecture + impl notes + qa focus + sharp acceptance) |
| Dev → QA | → | `implementer` → `test-author` + the phase gates (TDD · UX · security · code-standards) |

Principles (lean, no bloat):
- **Don't duplicate agents.** BMAD's planning roles map onto our grill + planner +
  researcher — we ship no copies of them. The **iSSM MCP** already holds the BMAD
  artifacts (PRD / architecture / stories) and feeds `/overview`.
- **Adopt the signature pattern — context-engineered phases.** Each `PLAN.md` phase
  is a self-contained story: it embeds the rationale, the architecture it touches,
  implementation constraints, and QA focus, so the implementer / test-author need no
  extra digging (see `planner`). This is BMAD's biggest win and it's cheap to adopt.
- **Scale-adaptive.** Small change → `/quick` (BMAD "lightweight"); a real slice →
  `/phase` (BMAD "heavyweight"). Pick the smaller that fits.
- **Optional sharding for big plans.** A large `PLAN.md` may be split into
  `docs/plan/<epic>.md` shards so a phase loads only its slice — finer-grained token
  economy on top of the per-phase reset. Opt-in.

BMAD-METHOD is MIT and installed separately (`npx bmad-method install`); use it for
the planning phase when a project needs that rigor, then drive delivery here.

-----

## Roles (fresh-context workers)

Each role is a fresh-context worker mapped to a named Claude Code subagent in
`.claude/agents/*.md`. A worker dumps its noise to a file and returns only a
terse summary + path. Workers cannot address the user — only the orchestrator
can. Escalation is at most two hops.

- **researcher** — two modes. DESIGN: domain/constraint research before planning
  (service limits, API contracts, architectural constraints, cost surprises).
  IMPL: per-phase codebase + service investigation. Checks the shared KB snapshot
  first (step 0). Writes findings to `docs/research/`; returns terse summary + path.
- **planner** — research → vertical-slice `docs/PLAN.md`. Phase 0 (infra) leads
  when there is infra to provision; with managed infra it is N/A and the plan
  begins at the first slice. The last phase always contains the deploy task.
- **implementer** — builds ONE phase. Two MODES for TDD phases (SCAFFOLD: stubs
  only; FILL: logic to green) plus a legacy full-build mode for non-TDD phases.
  Writes code, never tests. Maintains `docs/ENDPOINTS.md` each phase.
- **test-author** — writes tests BLIND (never reads implementation logic). On TDD
  phases it is dispatched BEFORE logic exists (RED-first), so blindness is
  structural, not honor-system. Writes a MOCK suite + a REAL API suite.
- **e2e-runner** — writes/runs functional browser E2E (your declared E2E runner,
  e.g. Playwright) BLIND. Reads the acceptance spec, `docs/OVERVIEW.md` (stack),
  `docs/ENDPOINTS.md`, and the E2E runner config — never the implementation. Writes
  a trace to `docs/research/e2e-<phase-slug>.md`; returns a terse summary.
- **debugger** — debugs in an ISOLATED context. Writes a trace to
  `docs/research/debug-<slug>.md`; returns a summary.
- **synthesizer** — compresses `docs/STATE.md` / `docs/ISSUES.md`, prunes
  snapshots. On the final phase, also updates `README.md` + `docs/OVERVIEW.md`.

The orchestrator ROUTES. It does not implement or debug.

-----

## Procedures (the slash-command set)

Named procedures, each with a canonical body in `.claude/commands/<name>.md`.

**Lane routing — which entry point for which job:**

| The job | Lane |
|---------|------|
| Brand-new project (no OVERVIEW yet) | `/overview` → `/phase` (optionally `/sprint`) |
| New FEATURE on an existing product | `/feature` (scaffold the doc with `/feature new`) |
| Small, obvious, non-phase change (a fix, a rename, a copy tweak) | `/quick` |
| Scope change to already-approved work | `/change-request` |
| Whole-product quality sweep / pre-release | `/ui-audit` · `/qa-audit` · `/security-audit` · `/release` |

On ambiguity between `/quick` and `/feature`: does it add or change a public
surface or need its own acceptance criteria? -> `/feature`. Otherwise `/quick`.

- **overview** — bootstrap a project: design-research → grill r1 → design-research
  → re-grill r2 → `OVERVIEW.md` → planner → `PLAN.md`.
- **feature [new <name> | from-story <key> | doc]** — the brownfield feature lane:
  one APPROVED Feature doc → spec completion → adversarial doc-review → mini-plan
  → contract probe → build loop → review & harden → manual test plan →
  docs/stamps/memory → delivery. `new` scaffolds the doc from
  `.claude/templates/FEATURE-template.md`; `from-story` transforms a BMAD/iSSM
  story into a PENDING doc (approval stays human). Gate checklist in
  `docs/features/<slug>/GATES.md`, enforced by the `Stop` hook with artifact
  verification. Headless-capable (CI / Docker, `ISSFLOW_HEADLESS=1`). See "Feature lane".
- **propose** — turn approved requirements + stack into `PROPOSAL.md` (scope, phase
  breakdown, effort + cost estimate, assumptions) with a client sign-off gate.
- **change-request** — a mid-project scope change: impact analysis + re-estimate +
  a logged change order (`CHANGES.md`) + sign-off, then `replan`.
- **phase [n]** — run one phase end-to-end with the circuit breaker. Chooses the
  TDD or non-TDD order at RESEARCH. CLOSE runs the regression guard + ENDPOINTS
  coverage gate. When a sprint is active, CLOSE also fires a `/sprint standup` tick.
- **sprint [run|plan|standup|review|retro|close|status] [n]** — the Scrum wrapper
  around the build loop: slice the approved PLAN into a capacity-bounded sprint, run
  the ceremonies (planning → standups → review/demo + boundary audits → retro → close)
  with burndown + velocity. `/sprint run` drives a whole sprint (or every remaining
  one) AUTO end-to-end. Opt-in; phases run unchanged inside it.
- **quick [change]** — small, obvious, non-phase change; no agent chain. Stays
  non-TDD. Runs the mock regression corpus after the change.
- **ui-audit** — whole-product UI audit against the `ux-design` cookbook (a11y /
  responsive / consistency); scored findings report. Periodic / pre-release. Distinct
  from the per-phase ux-design gate (one screen) — this sweeps every screen.
- **qa-audit** — whole-product FUNCTIONAL QA audit (coverage gaps, regression health,
  flaky tests, critical-flow e2e, edge/error handling); scored report. The QA
  counterpart of `ui-audit`. Distinct from the per-phase real-suite gate.
- **security-audit** — whole-product SECURITY audit against the `security` cookbook
  (OWASP/ASVS/WSTG/secrets/SCA/SAST/supply-chain); scored report. On-demand; a
  precondition for the pre-deploy pentest. Distinct from the per-phase rule-11 gate.
- **release** — the pre-production pipeline (run after all build phases): full
  regression → auto audits → smoke → UAT handoff → defect loop → sign-off → promote
  to production → go-live support. The automated SDLC backbone.
- **uat** — manual UAT cycle: generate an all-case scenario sheet for human testers,
  capture their results, drive the defect loop to 100% pass. Used inside `release`.
- **unstuck** — deep re-research after a circuit breaker (auto-run once in AUTO on
  first stuck; human-triggered in GUIDED).
- **synthesize** — compress STATE.md, dedup ISSUES.md, prune snapshots. Run
  before a context reset.
- **replan** — revise `PLAN.md` (add/cut/split/merge/reorder pending phases) and
  reconcile the regression corpus in step. Reshaping unbuilt scope reverts the plan
  to `PENDING` and re-runs the PLAN-APPROVAL gate (rule 13).
- **runbook** — capture an operational / incident scenario in `docs/RUNBOOK.md` so
  prod-debug knowledge isn't re-derived under pressure.
- **log-issue** — append an error to `ISSUES.md` with root cause + failed attempts.
- **log-decision** — record an architectural change in `docs/DESIGN_LOG.md`.
- **store-wisdom** — promote resolved issues + research to the shared KB.

-----

## Rituals (model-run fallback for hooks)

Where the host tool can run lifecycle hooks (Claude Code), these rituals are
AUTOMATED by hook scripts and must NOT be run by hand. Where the tool cannot
inject context, the model performs them itself.

### SESSION-OPEN (start / clear / compact-resume)

At the start of every session, before any other work, surface:
1. git state (branch, uncommitted count, last 3 commits).
2. `docs/STATE.md` — the current position. READ THIS FIRST. If a sprint is active,
   surface its goal + burndown from `docs/sprints/sprint-<n>.md`.
3. open items in `docs/ISSUES.md`.
4. `docs/research/INDEX.md` (research map) + infra/auth status.
5. shared KB: pull latest + load `docs/.kb-snapshot.md` if `.claude/kb-config.json`
   exists.
6. a one-line reminder of the hard rules below.

### SPRINT-STANDUP (auto — at phase close inside an active sprint)

When a sprint is active, every `/phase` CLOSE fires one standup tick: append a
one-line entry to the active `docs/sprints/sprint-<n>.md` (done / next / blockers)
and update the burndown (remaining points + the sparkline). The "daily" Scrum is
rebound to per-phase-close because the AI dev loop has no calendar days — the phase
boundary is the real unit of progress. Blockers surface immediately. See `/sprint`.

### COMPRESS (before a context compaction)

Snapshot the live position to `docs/.snapshots/` so a post-compact session can
recover: current phase, next action, open blocker.

### Token economy (always)

The cheapest token is the one never loaded. The kit is built to minimise context:

- **Phase boundary is the primary reset.** `/synthesize -> /clear` ends every
  phase so the next one starts with a small, fresh context instead of carrying
  the whole history forward. The **sprint boundary** (`/sprint close`) is a second,
  coarser reset — synthesize + clear there too before the next sprint plans.
- **Lazy, not always-on.** This methodology + the skills load on demand; only the
  SessionStart hook output is paid every session, and it injects just the live
  STATE + *open* issues (resolved ones stay on disk for grep, not re-paid in tokens).
- **Subagents isolate the noise.** Research, debugging, log/test output run in a
  worker's own context and return a terse summary — the orchestrator never pays
  for the raw dump.
- **Soft context budget.** The phase boundary should keep you well under the model
  window. If a single phase grows past ~50% of the window (≈ 200k on a 1M-context
  model), treat it as a signal the slice is too big: `/synthesize -> /clear` or
  split the phase. Don't coast to auto-compact. This is guidance, not a hard gate —
  the number scales with the host model's window, it is not fixed at 200k.

-----

## Autonomy

The kit runs in one of two modes, declared in `docs/OVERVIEW.md` (default: **AUTO**):

**Planning always asks; development doesn't.** Asking is cheap and decisive while
*planning* — so `/overview` (the double-grill) and the **PLAN-APPROVAL gate** (rule 13,
a recorded sign-off) stay interactive in both modes. AUTO governs only the **development loop** (implement → test → debug →
close): there, interruptions are expensive, so it follows the plan instead of asking.

- **AUTO (default) — during DEVELOPMENT, follow the plan, don't interrupt.** Once a
  plan exists, the dev loop prefers DECIDING over asking. Resolve any in-process
  choice from (1) the PLAN/OVERVIEW/spec, (2) the codebase, (3) a sensible default +
  the worker's recommendation — then RECORD it (`docs/DESIGN_LOG.md` or STATE) and
  CONTINUE. Do not stop mid-build to ask.
- **GUIDED — ask at each fork in dev too.** The original behaviour: the development
  loop also surfaces choices and waits. Use when exploring an unfamiliar codebase.

**Decision protocol (AUTO, dev loop).** Incomplete acceptance spec → fill the gap
with the most reasonable interpretation, log it as an Assumption, continue.
Ambiguous TDD classification → apply the default (`TDD_PHASE=true`), log the reason,
continue. A worker that would have asked the user instead writes its question + its
own best answer to STATE and proceeds on that answer. (If the gap is in the PLAN
itself — not just an implementation detail — that's a planning question: surface it.)

**Batched escalation (AUTO).** Blockers never halt the whole run. On first stuck,
auto-run `/unstuck` (deep re-research) — capped at ONCE per phase, since it is
token-expensive. Still stuck → park the blocked slice (mark `BLOCKED` in PLAN), move
to the next independent slice, and surface ONE consolidated report of all parked
blockers + logged assumptions at the phase boundary / end of run. The human reviews
THERE (the `/re` checkpoint), not mid-flow.

**Hard stops (BOTH modes — these always pause for a human).** Autonomy is for
*development*, not for risk. Stop and get sign-off ONLY for:
1. Irreversible or outbound actions — deploy to prod, data deletion/migration,
   `git push`, publish, spending money, sending external messages.
2. Security-sensitive changes — auth, secrets, permissions, data exposure.
3. A spec that is internally CONTRADICTORY (merely incomplete is NOT a stop — fill
   + log instead).
4. The debug budget is spent AND no independent slice remains to make progress.

AUTO removes *questions*, not *discipline*: tests, the phase gate, issue logging,
and the regression corpus all still run. The point is an efficient, end-to-end
development run that follows the spec and logs every problem so it never recurs.

-----

## Dry-run (preview — change nothing)

Pass `dry-run` (or `--dry-run`) to ANY command and it does the full analysis but
EXECUTES NOTHING: it prints the ACTION PLAN — files it would create/change · agents
it would dispatch · tests/gates it would run · the deploy target · cost / scope /
risk impact — then STOPS. Nothing is written, run, committed, or deployed. A safe
preview to see the blast radius first. Most useful before side-effecting commands:
`/phase` · `/release` · `/change-request` · `/sprint` · `/propose` · `/quick`.
Mirrors the installer's `--dry-run`. (In a dry-run, even AUTO never acts — it only reports.)

-----

## Hard rules (1–13)

1. Before debugging ANY error: grep `docs/ISSUES.md` AND `docs/research/INDEX.md`.
   The SESSION-OPEN ritual surfaces ISSUES.md — there is no excuse to miss it.
   Before debugging an auth/infra error, check the infra + auth status surfaced
   at SESSION-OPEN first.
2. Debug attempt cap = 3: WARN at attempt 2. At 3, stop the in-place attempts (no
   4th). GUIDED → ask the user. AUTO → log the issue (root cause + failed
   attempts), park the slice, and continue per the batched-escalation protocol.
   The cap protects efficiency (no flailing / token burn) in both modes.
3. Every resolved error -> logged to `docs/ISSUES.md` with root cause + failed
   attempts.
4. End of phase -> synthesize -> context reset -> next phase.
5. **PHASE GATE** = the current-phase REAL API suite passes AND (frontend phase)
   the E2E suite passes AND the accumulated mock regression corpus stays green AND
   every `docs/ENDPOINTS.md` entry has at least one test in `tests/regression/`.
   The final phase additionally runs the full REAL regression corpus. A green
   mock suite alone can never close a phase.
6. Tests are written by `test-author`, which never sees the implementation logic
   (unbiased). On TDD phases the suite is written before the logic (RED-first).
   `STACK NOT READY` / `FLAKE` do not spend the debug budget. Only `LOGIC FAIL`
   reaches the debugger.
7. E2E auth = a dedicated test account driven by a PROGRAMMATIC session
   (an API login or a saved/reused auth state), never by scripting a
   third-party OAuth/login UI.
8. Architectural change (new/removed agent, hook, command, or a changed workflow
   rule)? -> run `log-decision` before closing.
9. **UI conforms to the frame.** ALL web / UI work applies the `ux-design` skill and
   is verified EVERY time — no exception. Each change is validated against the
   cookbook (design tokens, spacing, a11y/WCAG AA, **icons = a real SVG set, NEVER
   emoji**, component + state inventory, breakpoints) AND stays inside the wireframe
   baseline. Drift outside the frame is a defect, not a creative liberty. New visual
   direction (something the wireframe doesn't cover) is confirmed with the user
   before building. A frontend phase cannot CLOSE until the UX cookbook check passes.
10. **No-rationalization (scoped).** Do not downgrade a TDD phase to non-TDD to
    dodge the RED gate, and do not route phase-worthy work through `quick` to
    dodge it. (Scoped deliberately to these two seams; this is not a broad
    "never make excuses" rule.)
11. **Secure SDLC (security at every stage).** Security runs through the whole loop
    via the `security` skill, not just at the end:
    - **design** — threat-model any phase that touches a trust boundary (STRIDE);
      set the ASVS level; write abuse cases as negative acceptance criteria.
    - **implement** — follow the secure-coding rules (OWASP Top 10 2025).
    - **build (every phase CLOSE)** — secrets scan + SCA (dependency CVEs) + SAST
      must be clean; open HIGH/CRITICAL BLOCKS the close.
    - **pre-deploy** — run the pentest checklist (WSTG) + a security review of the
      diff; sign artifacts (SLSA L2+).
    - **operate** — vulnerability management: keep an SBOM, monitor for new CVEs.
    Deploying to prod with open high/critical findings is a hard-stop (human
    sign-off — see Autonomy). Grounded in OWASP / ASVS / WSTG / ISO 27001 / ISO 25010.
12. **Code-standards gate.** Every coding phase: the formatter + linter are clean
    (the language's standard tool), names follow the language's OWN idiom, and the
    code conforms to the declared architecture (Feature-Based by default) — checked
    at CLOSE. Lint/format errors or idiom violations BLOCK the close. (`code-standards`.)
13. **PLAN-APPROVAL gate.** No phase / sprint / build work starts until `docs/PLAN.md`
    carries a human approval. `/overview` ends by presenting the plan and STOPPING for
    sign-off; on approval the gate is RECORDED in three places — the PLAN.md
    `> Approval:` header (`approved <date> v<n>`), `plan:` in `docs/STATE.md`, and a
    `plan v<n> approved` line in `docs/HISTORY.md`. `/phase` and `/sprint` REFUSE to
    start while that header still reads `PENDING`. Interactive in BOTH modes: AUTO
    governs the dev loop that runs AFTER approval, never the approval itself — it is
    the planning twin of the commercial sign-off gate (`/propose`). A `/replan` that
    adds or reshapes UNBUILT scope reverts the affected plan to `PENDING` and
    re-surfaces it for confirmation before those phases run.

-----

## Quality model (orthogonal axes — each audited)

Quality is checked on independent axes. Passing one NEVER implies another. Each has a
STANDARD, an inline GATE (per phase), and — for the user-facing ones — a holistic
AUDIT (whole product, pre-release):

| Axis | Question | Standard | Inline gate (per phase) | Whole-product audit |
|------|----------|----------|-------------------------|---------------------|
| **Functional / QA** | does it WORK? | blind TDD, RED-first (rules 5–6) | real suite green + regression corpus | full REAL corpus (final phase) · `/qa-audit` |
| **UI / UX** | is it usable + on-brand? | `ux-design` cookbook | the ux-design check (rule 9) | `/ui-audit` |
| **Security** | is it safe? | `security` cookbook (OWASP/ASVS/ISO) | secrets/SCA/SAST + secure coding (rule 11) | `/security-audit` · pentest + review before deploy |
| **Code** | is it consistent? | `code-standards` (naming/architecture) | lint/format + idiom (rule 12) | — |

**QA is the test discipline**, not a single agent: `test-author` (blind tests) +
`e2e-runner` (functional E2E) + the phase gate + the regression corpus + `debugger`.
UI audit checks *presentation*; QA checks *behaviour* — a button can pass one and
fail the other.

-----

## Shared KB (optional)

If `.claude/kb-config.json` exists, the SESSION-OPEN ritual pulls the KB and loads
a snapshot to `docs/.kb-snapshot.md`. The researcher checks the snapshot (step 0)
before any web search. Run `store-wisdom` to promote resolved issues + research to
the KB. The kit works normally without a KB.

-----

## File contract

- `docs/PRD.md` — crystallised product requirements (or your BMAD/iSSM stories).
- `docs/PROPOSAL.md` — scope + phase breakdown + effort/cost estimate + assumptions
  + sign-off. Versioned; the commercial baseline (source of truth).
- `docs/proposal.html` — the client-facing proposal, rendered from PROPOSAL.md via
  `.claude/templates/proposal.html`, in the project language; print-ready (PDF).
- `.claude/templates/` — client-facing document templates (proposal.html, …) the
  commands render into `docs/`.
- `docs/CHANGES.md` — change-order log (append-only): each scope change with its
  impact, effort/cost delta, new total, and approval status. The commercial audit trail.
- `docs/UAT-<date>.md` — UAT scenario sheet (all cases) + captured tester results
  (PASS/FAIL + notes). Drives the release defect loop.
- `docs/SIGNOFF-<date>.md` — release sign-off: scope delivered, test/audit/UAT
  summary, known limitations, approver — the gate to promote to production.
- `docs/ui-audit-<date>.md` · `docs/qa-audit-<date>.md` · `docs/security-audit-<date>.md`
  — scored whole-product audit reports (from the `*-audit` commands).
- `docs/features/<slug>/` — one dir per feature-lane run: `FEATURE.md` (the doc:
  approval header, acceptance criteria, assumptions, token stamp, summary),
  `PLAN.md` (mini-plan), `CONTRACTS.md` (probed public surfaces), `TEST-PLAN.md`
  (the UAT scenario sheet), `GATES.md` (the Stop-hook-enforced checklist),
  `BLOCKED.md` (headless blocker reports).
- `docs/WISDOM-QUEUE.md` — auto-appended wisdom candidates from feature runs;
  `/store-wisdom` reads it before pushing to the shared KB (push stays human).
- `.claude/templates/automation/` — headless-runner sources (GitHub Action ·
  Dockerfile · docker wrapper), materialized by `create-issflow --ci` /
  `--docker` as `.github/workflows/issflow-feature.yml` · `Dockerfile.issflow` ·
  `scripts/feature-docker.js`.
- `.claude/templates/FEATURE-template.md` — the Feature-doc form `/feature new`
  scaffolds (Approval/Automation headers + spec sections).
- `docs/STATE.md` — current position. Small. Rewritten, not appended.
- `docs/ISSUES.md` — error log. Deduped by synthesizer.
- `docs/PLAN.md` — the phase plan (the product backlog). Carries an `> Approval:`
  header — `PENDING` until the rule-13 PLAN-APPROVAL gate stamps `approved <date> v<n>`;
  no phase runs while it reads `PENDING`. The last phase has the deploy task. Phases may
  carry a `[N pts]` estimate and be grouped under `## Sprint` headers when the sprint
  layer is used.
- `docs/sprints/sprint-<n>.md` — one per sprint (sprint layer): goal, committed phases
  + points, burndown, standup log, review (demo + audit scores), retro. Maintained by
  `/sprint`.
- `docs/sprints/VELOCITY.md` — rolling velocity table (committed vs completed pts per
  sprint). Drives the next sprint's capacity.
- `docs/HISTORY.md` — one line per finished phase (and per closed sprint).
- `docs/DESIGN_LOG.md` — kit architectural rationale (§5.x decision log).
- `docs/OVERVIEW.md` — project scope. Written after the double-grill in `overview`.
  E2E target.
- `docs/ENDPOINTS.md` — API/service endpoint catalogue. Maintained by implementer
  each phase. Drives the CLOSE coverage gate.
- `docs/RUNBOOK.md` — operational / incident runbook (grep-able): per-scenario
  symptoms, diagnosis, and recovery steps. Maintained by `/runbook`.
- `docs/research/` — full research + debug files. `INDEX.md` is the searchable map.
  `design-<slug>.md` (design research), `<slug>.md` (impl research),
  `debug-<slug>.md` (debugger traces), `e2e-<slug>.md` (e2e-runner traces).
- `docs/.snapshots/` — pre-compact recovery markers (auto-pruned, gitignored).
  Holds no secrets.
- your E2E stack — runner config + any ephemeral test services (e.g. `e2e/`,
  `playwright.config.ts`, `scripts/e2e-stack.sh`, `docker-compose.test.yml`).
  Names are conventions; use whatever your declared stack ships.
- `tests/phase-<n>/` — phase-local test suites.
- `tests/regression/` — cross-phase contract tests (the regression corpus). Run by
  `scripts/regression.sh` (default mock; `--real` runs the real corpus).
- `.claude/skills/ux-design/` — the UX cookbook + wireframe baseline (read on
  demand for any UI work).
- `.claude/skills/security/` — the Secure SDLC cookbook + threat-modeling /
  secure-coding / pentest / standards references (read on demand for security work).
- `.claude/skills/code-standards/` — naming-per-language + architecture cookbook
  (read on demand for any coding / scaffolding / structure decision).
- `.claude/kb-config.json` — shared KB path + remote (optional).
- `docs/.kb-snapshot.md` — KB INDEX loaded this session (auto-generated, gitignored).

-----

## Capability matrix (which host gets what)

The kit is single-source (`.claude/` + this file). `create-issflow --tool=<host>`
writes the right adapter; unsupported features degrade to model-run rituals, never
silently vanish. The portable assets (agents, commands, skills, methodology) are
the same everywhere — only the *wiring* differs.

| Host | Entry file | Commands | Subagents | Lifecycle hooks | Shared KB |
|------|-----------|----------|-----------|-----------------|-----------|
| **Claude Code** (reference) | `CLAUDE.md` (`@AGENTS.md`) + `.claude/` | `.claude/commands/` | native | SessionStart · PreToolUse (context watchdog + rule-13 plan gate) · PreCompact · SubagentStop · Stop (feature gate) | yes |
| **Codex CLI** | `AGENTS.md` (native) | `.claude/commands/` (read as prompts) | read as reference | model-run | yes |
| **Cursor** | `.cursor/rules/` + `AGENTS.md` | `.cursor/commands/` | reads `.claude/agents/` | `.cursor/hooks.json` (sessionStart · subagentStop) | yes |
| **Gemini CLI** | `GEMINI.md` + `AGENTS.md` | `.claude/commands/` (read as prompts) | read as reference | model-run | yes |
| **Aider** | `.aider.conf.yml` → `AGENTS.md` | read as reference | model-run | model-run | yes |
| **Any AGENTS.md host** | `AGENTS.md` | read as reference | model-run | model-run | yes |

"model-run" = the host can't automate the ritual, so the model performs it by hand
(SESSION-OPEN at the top of each session; the COMPRESS snapshot before a reset).
