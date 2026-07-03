---
description: The Scrum sprint layer — group PLAN phases into time-/scope-boxed sprints and run the full ceremony set (planning → standups → review/demo → retrospective → close) with burndown + velocity. AUTO-facilitated: the orchestrator runs every ceremony itself and drives the sprint end-to-end without stopping, pausing only at the real hard-stops. The layer between PLAN (backlog) and PHASE (build loop).
argument-hint: [run|plan|standup|review|retro|close|status] [sprint number · "dry-run"]
---

Caveman ULTRA mode. You are the ORCHESTRATOR / SCRUM MASTER. You FACILITATE the
ceremonies and ROUTE build work to subagents — you do NOT implement or debug yourself.

Subcommand: $ARGUMENTS  (default: `status`)

DRY-RUN: if `$ARGUMENTS` contains `dry-run`/`--dry-run`, do the full analysis but
EXECUTE NOTHING — print the ACTION PLAN (which phases the sprint would commit,
ceremonies it would run, points/capacity) and STOP. No sprint file is written, no
phase runs. (METHODOLOGY → Dry-run.)

Hierarchy: **PLAN (product backlog) → SPRINT (committed slice of phases) → PHASE
(the build loop)**. A sprint groups consecutive PLAN phases behind ONE sprint goal
and ships ONE deployable increment. Phases still run via `/phase` exactly as before
— the sprint layer wraps them with planning, standups, a review, and a retro.

**AUTONOMY (read first).** Sprint planning only SLICES the already-approved
`docs/PLAN.md` — the requirements gate already happened at `/overview` plan approval —
so the ceremonies are AUTO-safe and the orchestrator runs them WITHOUT stopping.
- **AUTO (default):** `/sprint run` drives the whole sprint hands-off — plan → loop
  `/phase` → standup tick after each phase → review → retro → close → roll forward →
  start the next sprint. Decisions (points, scope-fit, accept/carry) are made from the
  PLAN + velocity, logged, and the run continues. Pause ONLY for a methodology
  hard-stop (deploy/irreversible/outbound, security-sensitive change, contradictory
  spec, or debug budget spent with no independent slice left).
- **GUIDED:** each ceremony presents its result and waits for you before the next.
The PLAN-approval, commercial (`/propose`, `/change-request`), and release
(`/release`, `/uat`, prod promote) gates are SEPARATE and stay interactive in both
modes — the sprint layer never auto-passes them.

Artifacts: `docs/sprints/sprint-<n>.md` (one per sprint — goal, committed phases,
burndown, standups, review, retro) and `docs/sprints/VELOCITY.md` (the rolling
velocity table). Create `docs/sprints/` if absent. STATE.md carries the active sprint.

=====================================================================
## ROUTER

- `run`     → §RUN  (AUTO end-to-end driver — the default way to use this)
- `plan`    → §1 PLANNING
- `standup` → §2 STANDUP
- `review`  → §3 REVIEW
- `retro`   → §4 RETRO
- `close`   → §5 CLOSE
- `status`  → §STATUS  (default when no subcommand)

=====================================================================
## §1 — SPRINT PLANNING  (ceremony)

Pre: `docs/PLAN.md` exists AND its `> Approval:` header reads `approved …` (the
PLAN-APPROVAL gate, hard rule 13). Still `PENDING` / missing → STOP, route to the
`/overview` plan-approval gate. A sprint only SLICES an already-signed-off plan.

a. **Estimate (one-time, lazy).** Every pending PLAN phase needs a points estimate
   (Fibonacci `1 2 3 5 8`, relative effort from the phase `slice` + `acceptance`
   size; a phase that feels `>8` is too big — note it for `/replan` to split). If the
   planner already wrote `[N pts]` tags, reuse them; otherwise assign now and write
   them back into PLAN.md next to each phase header.

b. **Capacity.** Read `docs/sprints/VELOCITY.md`.
   - Have history → capacity = rolling-average completed velocity (last ≤3 sprints).
   - First sprint (no history) → capacity = `flow-config.json` `sprint.defaultCapacity`
     (fallback 8 pts).

c. **Commit.** Walk the PLAN in dependency order, pull pending phases into this sprint
   until the next phase would exceed capacity. Don't split a phase across a sprint
   boundary; respect dependencies (never commit a phase whose dependency is in a later
   sprint). Keep one coherent theme → that becomes the **sprint goal** (one line: the
   user-visible increment this sprint ships). Optionally mark 1 phase `stretch`.

d. **Write** `docs/sprints/sprint-<n>.md` from the template below; set
   `status: active`; seed the burndown tick 0 = total committed points. Group the
   committed phases under a `## Sprint <n>` header in PLAN.md if not already grouped.
   Update STATE.md: `sprint: <n> (active)`.

AUTO: auto-commit the computed backlog, log the goal + points + capacity, continue.
GUIDED: present goal + committed phases + points, wait for confirm.

=====================================================================
## §2 — STANDUP  (auto-tick — fires once per phase close inside an active sprint)

The AI dev loop has no calendar days, so the "daily" standup is rebound to a
**per-phase-close tick** — the natural cadence of progress. After each `/phase` CLOSE
while a sprint is active (the `/phase` command fires this; `/sprint run` fires it
inline; or run `/sprint standup` by hand):

1. Append a standup line to the active sprint doc:
   `- tick <k> (Phase <p> <done|blocked>): done <what>; next <phase/none>; blockers <none|ref>`
2. Update the **burndown**: append a row `tick <k> | Phase <p> <state> | <remaining pts>`
   where remaining = committed points minus points of phases now `done`. Re-render the
   ASCII sparkline.
3. Surface blockers immediately if any (a blocked phase is the standup's whole point).
   AUTO: the blocker is already parked per the circuit breaker — just record it here
   and keep the burndown honest. GUIDED: relay it.

Keep it ONE line per tick. No prose. The burndown is the signal.

=====================================================================
## §3 — SPRINT REVIEW / DEMO  (ceremony — at sprint boundary)

Run when every committed phase is `done` or `blocked` (sprint timebox reached).

a. **Demo.** Summarise the shipped increment: for each accepted phase, the
   user-visible behaviour now working (pull from the phase `slice` + `docs/ENDPOINTS.md`).
   This is the "done = demoable" check — a phase that can't be demoed isn't done.

b. **Boundary audits.** Run the whole-product audits ONCE for the increment (cheaper
   here than per-phase, broader than the inline gates):
   `/ui-audit` (if UI shipped) · `/qa-audit` · `/security-audit`. Fold the scores in.
   Open BLOCKER/HIGH/CRITICAL → route to FIX (`debugger`/`implementer`), re-audit.
   (Security findings remain an autonomy hard-stop.)

c. **Accept / carry.** Mark each phase `accepted` (demoed + audits clean) or
   `carried` (not done / failed audit → rolls to the next sprint at §5).

d. Write the `## Review` block into the sprint doc (demo bullets, audit scores,
   accepted vs carried).

=====================================================================
## §4 — RETROSPECTIVE  (ceremony — after review)

Inspect-and-adapt on the PROCESS, not the product. Write the `## Retro` block:

- **went well** — what to keep (2–4 bullets).
- **didn't** — friction, repeated debugging, churned tests, estimate misses.
- **actions** — each a CONCRETE, routed change, not a wish. Route every action to a
  durable home so it actually happens:
  - a recurring bug/root-cause pattern → it's already in `docs/ISSUES.md`; note the ref.
  - a workflow/structure change → `/log-decision` (`docs/DESIGN_LOG.md`).
  - an ops/incident lesson → `/runbook`.
  - a plan correction (re-estimate, split, reorder) → `/replan`.
  - a durable, cross-project lesson → flag for `/store-wisdom`.
- **estimate accuracy** — committed vs completed points; note phases that blew their
  estimate so the next sprint's poker is calibrated.

AUTO: auto-apply the routed actions (log/replan) and continue. GUIDED: list actions,
confirm before applying.

=====================================================================
## §5 — SPRINT CLOSE

a. **Velocity.** completed = sum of `accepted` phase points. Append a row to
   `docs/sprints/VELOCITY.md`:
   `| <n> | <committed> | <completed> | <goal met? yes/no> |` and recompute the rolling
   average (last ≤3 sprints).
b. **Carry forward.** Each `carried`/`blocked` phase stays pending in PLAN.md — the
   next `/sprint plan` re-commits it first (carried work has priority). Don't lose it.
c. Set the sprint doc `status: done`; stamp the close date. HISTORY line:
   `sprint <n> closed — <completed>/<committed> pts, goal <met|missed> (<date>)`.
d. Update STATE.md: clear the active sprint (or set the next one if `/sprint run`
   continues).

=====================================================================
## §RUN — AUTO END-TO-END DRIVER  (the headline: "do all the process automatically")

`/sprint run [n]` drives one full sprint — or, if you keep going, every remaining
sprint until the PLAN is exhausted — with NO human stop except a hard-stop:

```
loop while pending phases remain in PLAN.md:
  1. §1 PLANNING            → commit the next sprint from PLAN + velocity
  2. for each committed phase, in dependency order:
       run /phase <p>       → the full build loop (its own gates + circuit breaker)
       §2 STANDUP tick      → append standup + update burndown
       phase BLOCKED (circuit breaker parked it) → record, keep going to the next
         INDEPENDENT phase; if none remain, end the sprint early (timebox)
  3. §3 REVIEW              → demo + boundary audits (fix blockers, re-audit)
  4. §4 RETRO               → routed actions, applied
  5. §5 CLOSE              → velocity + carry-forward + HISTORY
  6. /synthesize → suggest /clear  (token reset at the sprint boundary, like a phase)
  AUTO: start the next sprint automatically.  GUIDED: stop, report, wait.
HARD-STOP at any point: deploy/irreversible/outbound action, security-sensitive
change, contradictory spec, or debug budget spent with no independent slice left →
pause, surface the consolidated report, hand to the human.
```

When the last PLAN phase is `accepted`, the build is sprint-complete → recommend
`/release` (the pre-production pipeline) as the next step. Do NOT auto-promote to prod
— that is a separate, human-signed hard-stop.

=====================================================================
## §STATUS

Read STATE.md + the active `docs/sprints/sprint-<n>.md` + VELOCITY.md and print:
sprint number + goal, status, the burndown sparkline, committed vs done points,
the current/next phase, any open blockers, and rolling velocity. One screen. No edits.

=====================================================================
## SPRINT DOC TEMPLATE  (`docs/sprints/sprint-<n>.md`)

```
# Sprint <n> — <short name>
goal: <one line — the user-visible increment this sprint ships>
status: active            # planning | active | review | done
capacity: <cap> pts  (basis: velocity avg | default)

## Committed
- Phase <p>: <name>  [<pts> pts]  [status: pending|done|blocked|accepted|carried]
- ...
## Stretch
- Phase <q>: <name>  [<pts> pts]   # optional, pulled in only if capacity frees up

## Burndown
tick | event                  | remaining pts
0    | sprint start           | <total>
1    | Phase <p> done         | <rem>
...
<ascii sparkline of remaining pts, e.g.  8 ▆▅▃▂ 0>

## Standups
- tick 1 (Phase <p> done): done <what>; next Phase <q>; blockers none
- ...

## Review (<date>)
- demo: <increment shipped — user-visible behaviour now working>
- audits: ui <score|n/a> · qa <score> · security <score> · code <clean|issues>
- accepted: <phases>   carried: <phases or —>

## Retro (<date>)
- went well: ...
- didn't: ...
- actions: <each routed → ISSUES | DESIGN_LOG | RUNBOOK | replan | store-wisdom>
- estimates: committed <c> pts / completed <d> pts — <misses noted>
```

## VELOCITY TEMPLATE  (`docs/sprints/VELOCITY.md`)

```
# Velocity
| sprint | committed | completed | goal met? |
|--------|-----------|-----------|-----------|
| 1      | <c>       | <d>       | yes/no    |

rolling avg (last ≤3): <v> pts/sprint
```
