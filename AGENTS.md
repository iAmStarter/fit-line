# AGENTS.md — iStartSoftFlow

This repo runs the **iStartSoftFlow** agentic dev workflow. The complete,
tool-agnostic methodology — the loop, roles, procedures, rituals, and hard
rules — lives in ONE file. Read it before acting:

> **`.claude/istartsoft-flow/METHODOLOGY.md`** ← single source of truth.

Do not restate its rules elsewhere; this file only indexes it (anti-drift invariant).

## The loop

design-research → grill ×2 → plan → implement → test → deploy — one VERTICAL
SLICE per phase. Phase 0 (infra) leads only when infra is self-managed.

## Roles — `.claude/agents/`

planner · researcher · implementer · test-author · debugger · e2e-runner · synthesizer

## Procedures — `.claude/commands/` (run as `/name`)

/overview · /feature · /propose · /phase · /sprint · /ui-audit · /qa-audit · /security-audit ·
/release · /uat · /change-request · /replan · /quick · /synthesize · /runbook · /store-wisdom ·
/log-issue · /log-decision · /unstuck

## Skills — `.claude/skills/` (loaded on demand)

caveman · grill-me · karpathy-guidelines · ux-design · security (Secure SDLC) · code-standards

## Autonomy

Planning (`/overview` grill + plan approval) always asks — that input is cheap.
**AUTO (default)** governs the DEV loop: follow the plan, decide + log + continue,
do NOT stop to ask. Hard-stops only: security · irreversible/outbound actions · a
contradictory spec. Blockers are parked + reported at the phase boundary, not
mid-flow. **GUIDED** asks at each fork in dev too. Declare the mode in
`docs/OVERVIEW.md`. See METHODOLOGY → Autonomy.

## Hard-rule index (full text in METHODOLOGY.md)

1 grep ISSUES + research before debugging · 2 debug cap = 3 (AUTO: park + continue) ·
3 log every fix · 4 synthesize + context-reset per phase · 5 phase gate = real suite
green · 6 blind tests (RED-first) · 7 programmatic E2E auth · 8 log-decision on arch
change · 9 UI conforms to the `ux-design` cookbook + wireframe frame · 10 no-rationalization ·
11 Secure SDLC: threat-model → secure coding → SAST/SCA/secrets each phase → pentest
gate + security review before deploy (`security` skill) · 12 code-standards gate:
lint/format clean + naming per language idiom + declared architecture (`code-standards`) ·
13 PLAN-APPROVAL gate: no phase/sprint starts until `docs/PLAN.md` is human-approved.

## Your stack

Declare your stack (language, framework, infra, auth, test + E2E runner,
planning source) once in `docs/OVERVIEW.md`. Every rule references *your declared
stack* and hardcodes none.
