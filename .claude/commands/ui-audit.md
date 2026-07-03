---
description: Holistic UI audit — sweep the WHOLE product's UI against the ux-design cookbook (+ a11y / responsive / consistency), score it, and produce a prioritized findings report. On-demand or before a release. This is NOT the per-phase gate — the `ux-design` gate checks one screen at phase close (pass/block); this audit sweeps every screen and reports accumulated drift.
argument-hint: [optional scope — a route, or "all"]
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Purpose: a periodic, WHOLE-PRODUCT UI audit — distinct from the inline `ux-design`
gate. The gate validates ONE screen at phase close; this AUDIT sweeps EVERY screen,
scores the product, and surfaces drift that accumulated across changes. Run before a
release, after big UI work, or on request.

## PRE-FLIGHT
Read the rubric: `.claude/skills/ux-design/SKILL.md` (the cookbook) and
`references/wireframe-template.md` (the frame). The cookbook IS the checklist —
do not invent new criteria; audit against it.

## STEP 1 — INVENTORY
List every screen / route / major component to audit (from the router, the
wireframe baseline, or `$ARGUMENTS`). Audit shared components once.

## STEP 2 — SWEEP  (dispatch a worker per area to keep context lean)
Score each screen against the cookbook dimensions:
- design tokens · 8-pt spacing · type scale (no raw hex/px)
- iconography — a real SVG set, **NEVER emoji**
- accessibility (WCAG 2.1 AA): contrast ≥ 4.5:1, visible focus, keyboard reach,
  semantic HTML, labels / alt / aria, 44×44 targets, `prefers-reduced-motion`
- state matrix: default · hover · focus · active · disabled · loading · empty · error
- responsive breakpoints (no overflow / break)
- content & i18n (no hardcoded strings; growth-safe)
- consistency / wireframe conformance (no drift BETWEEN screens)
Run automated tools if the project has them (axe-core / Lighthouse / pa11y) and fold
their output in; otherwise do the manual cookbook sweep.

## STEP 3 — SCORE + FINDINGS
Rate each dimension PASS / WARN / FAIL. For every finding record:
- **severity**: BLOCKER (a11y / contrast / unusable) · MAJOR (drift / missing state)
  · MINOR (polish)
- **location**: screen + element
- **issue** + the cookbook rule it breaks
- **fix**: the concrete change

## STEP 4 — REPORT
Write `docs/ui-audit-<YYYY-MM-DD>.md`:
- coverage (screens audited) · a per-dimension scoreboard · the findings table sorted
  by severity · a prioritized fix list.
- Log BLOCKER / MAJOR findings to `docs/ISSUES.md`.
- **VERDICT: SHIP | FIX-FIRST** — a release must not ship with open BLOCKERs.

## STEP 5 — REMEDIATE
AUTO: fix MINOR / MAJOR that don't change the visual direction, re-audit them, log.
A new visual direction or a design-token change → confirm with the user first
(hard rule 9 — UI conforms to the frame; new direction is a human call).
Hand back the report + what was fixed vs parked.
