---
description: Turn approved requirements + tech stack into a client proposal — scope, phase breakdown, effort + cost estimate, timeline, assumptions, and a sign-off gate. Run after /overview, before building.
argument-hint: [optional: rate / budget / constraints · "dry-run" to preview]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Purpose: produce `docs/PROPOSAL.md` — WHAT we build, in what phases, how long, how
much, and on what assumptions — for the client to approve BEFORE any build starts.
A proposal is a commercial gate: always interactive (both AUTO and GUIDED).

DRY-RUN: if `$ARGUMENTS` contains `dry-run`/`--dry-run`, do the full analysis but
EXECUTE NOTHING — print the ACTION PLAN (scope, phase breakdown, rough estimate)
and STOP. No PROPOSAL.md / proposal.html is written. (METHODOLOGY → Dry-run.)

## PRE-FLIGHT
Read `docs/OVERVIEW.md` (scope, stack, success criteria) and `docs/PRD.md` if
present (else the PRD in your BMAD/iSSM). No OVERVIEW -> run `/overview` first.

PLAN-APPROVAL CHECK (hard rule 13): the proposal prices the *approved* phases, so
the plan is signed off first (lifecycle: plan → proposal). If `docs/PLAN.md` exists
and its `> Approval:` header still reads `PENDING` (or is missing), STOP and route me
to the `/overview` PLAN-APPROVAL gate before quoting — pricing an unapproved plan
re-prices on every revision.

## STEP 1 — SCOPE
List the deliverables (features / epics) from OVERVIEW / PRD. Mark each
**in-scope** or **out-of-scope** explicitly — naming out-of-scope items now is what
prevents silent scope creep (and grounds change-order re-pricing later).

## STEP 2 — PHASE BREAKDOWN
Derive the vertical-slice phases (or read `docs/PLAN.md` if it exists). Size each:
- complexity: **S | M | L | XL**
- effort: an ideal-days RANGE (e.g. 2–3d), + story points if your team uses them
- risk / unknowns: what could move the estimate

## STEP 3 — ESTIMATE (flexible, transparent — no false precision)
Read the **estimation config** from OVERVIEW (or ask once — a commercial/planning
input, allowed). Everything is configurable; use sensible defaults if unset:
- **unit:** ideal-days (default) | story-points | both.
- **rate card:** a single blended rate, OR per-role rates (e.g. senior / mid /
  junior). Cost = Σ(effort per role × that role's rate).
- **currency:** as declared (THB default for a Thai project).
- **contingency:** a % buffer for unknowns (default 10–15%).
- **payment milestones:** by-phase, or a split (e.g. 30/40/30), or none.
- **language:** the rendered doc's language (default = the project language).
Compute cost per phase, then a **Total as a RANGE (low–high)** incl. contingency —
show the math. **Timeline:** phases in dependency order → calendar estimate (note parallelism).

## STEP 4 — ASSUMPTIONS & EXCLUSIONS
List every assumption the estimate rests on (infra provided, third-party/licence
costs excluded, content/design provided, etc.). These are the baseline that
change-orders re-price against.

## STEP 5 — WRITE + RENDER
1. Write `docs/PROPOSAL.md` — the SOURCE OF TRUTH (versioned v1 + date). This is
   what `CHANGES.md` re-prices against. Template:
```
# Proposal — <project>   (v1, <date>)
## Scope        — in-scope: … | out-of-scope: …
## Phases       — table: phase | complexity | effort (range) | cost
## Total        — <low>–<high> (incl. <buffer>% contingency)
## Timeline     — <estimate>, dependency order
## Assumptions  — …
## Exclusions   — …
## Payment      — milestones (if any)
## Sign-off     — approved by: ___  date: ___  version: v1
```
2. RENDER a client-facing `docs/proposal.html` from `.claude/templates/proposal.html`:
   copy it, replace every `{{PLACEHOLDER}}`, and fill the CONTENT in the declared
   language (the section labels are already bilingual TH / EN). It must fit ONE A4
   page — be terse (≈ 3–6 phase rows, ≈ 4 assumptions, short scope items); trim before
   it spills to a second page. Fill `{{COMPANY}}` / `{{COMPANY_TAGLINE}}` / `{{LOGO}}`
   from the ISSUING company's brand declared in OVERVIEW (or ask once) — white-label,
   never hardcode the kit's name. Print-ready (Ctrl/Cmd-P → A4 → Save as PDF). Keep
   PROPOSAL.md (source) and proposal.html (deliverable) in sync.

## STEP 6 — SIGN-OFF GATE
Show me the proposal. **STOP for approval** (commercial gate — always interactive).
On approval: record the approved version + date in PROPOSAL.md and STATE.md, and
append a HISTORY line `proposal v<n> approved (<total>)`. Building starts only after
sign-off. On rejection: revise per feedback and re-show.
