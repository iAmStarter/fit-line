---
description: Bootstrap a new project. Runs design-research, double grill, and planning. Run once per project.
---

Caveman ULTRA mode.

Recommended: run from plan mode (Shift+Tab). Planning agents are read-only by
tool grant; plan mode adds a read-only gate on the main session too. Optional.

Goal: stand up a fresh project workspace with a well-grounded plan.

LANGUAGE: detect the user's language and run the WHOLE discovery in it. A Thai user
→ grill, summarise, and write OVERVIEW in **natural Thai** (keep tech terms in
English as a Thai team would). Record the project language in OVERVIEW so downstream
artifacts (PROPOSAL, the rendered proposal.html, docs) follow it. Be equally fluent
in English; just don't default to it when the user speaks Thai.

---

## Steps

### Round 1 — Initial grill

1. Run the `grill-me` skill to interrogate me. Goal: understand initial scope,
   known constraints, unknowns. Asking is encouraged here — planning is where human
   input is cheapest. Do not stop early. Do not write OVERVIEW.md yet.

Store the round-1 answers as working context — do NOT write OVERVIEW.md yet.

---

### Design research

2. Extract DESIGN TOPICS from the round-1 answers. These are things we need
   to verify before planning:
   - Each external service mentioned: what does it support at the relevant tier?
     Quotas, rate limits, known gaps?
   - Auth patterns: any constraints from the chosen auth provider for this scenario?
   - Any other architectural assumption in the round-1 answers worth verifying.

3. Dispatch `researcher` in DESIGN mode with the DESIGN TOPICS list.
   It returns a terse summary + file paths. Read the design-<slug>.md files
   only if needed.

---

### Round 2 — Research-informed re-grill

4. Run `grill-me` again — a second focused pass. Seed it with:
   - The round-1 answers (already established — do not re-ask these)
   - The design-research key findings and new questions raised

   The re-grill asks whatever it needs to build complete understanding — planning is
   interactive in both modes. Do not re-ask what round 1 already established clearly.

---

### Write OVERVIEW.md

5. Write docs/OVERVIEW.md from the COMBINED output of round-1 + design-research
   + round-2. Include:
   - Project purpose and success criteria
   - **Project language** (e.g. th / en / both) — downstream docs + proposal follow it
   - **Autonomy mode** for the dev loop (AUTO default / GUIDED) and the declared
     **stack** (framework, infra, auth, test + E2E runner, planning source)
   - **Architecture pattern** (default Feature-Based) + **code conventions / style
     guide** for the stack's language (`code-standards` skill) + the folder layout
   - **Estimation config** (for `/propose`): unit, rate card, currency, contingency,
     payment milestones
   - Scope and constraints (informed by research findings)
   - External services with confirmed capabilities/limits
   - Known risks / open questions (if any remain)

   OVERVIEW.md is written HERE — after the re-grill, not before.

---

### Foundations sign-off (confirm BEFORE planning)

5b. Before the `planner` runs, present the FOUNDATIONS for explicit human confirmation
— the whole plan is built on these, so lock them first. Show a concise summary and
STOP for sign-off (planning always asks, both modes):
- **Tech stack** — language · framework · infra · auth · datastore · test + E2E runner
- **Architecture** — the pattern (Feature-Based by default) + the folder layout
- **UX direction** — design system / tokens + the wireframe baseline (the frame)
- **Data & integrations** — core data model + external services + their limits
- **Conventions** — naming idiom (`code-standards`) + autonomy mode (AUTO / GUIDED)
- **Estimation config** — unit · rate card · currency · contingency (if quoting)
On any "change X" → revise OVERVIEW.md and re-confirm. Only a signed-off foundation
proceeds to the planner. (This is the planning confirmation gate.)

### Plan

6. Hand OVERVIEW.md + design-research findings to the `planner` subagent.
   PLAN.md MUST:
   - Start with Phase 0 (infra setup) only if infra is self-managed; with
     managed infra, Phase 0 is N/A and the plan starts at Phase 1.
   - End with a final code phase that contains the deploy task block.

7. Create docs/STATE.md:
```

# STATE

phase: 0 (pending)
plan: PENDING
completed: project bootstrapped — design research done, double grill done
blocker: none

```
8. Create docs/ISSUES.md with header `# Issues` and `## Archived` section.

9. Create empty docs/HISTORY.md.

10. Create docs/ENDPOINTS.md:
 ```
 # Endpoints — <project name>
 > Maintained by implementer. Updated each phase.
 > Base URL: (populated after deployment phase)
 ```

---

### PLAN-APPROVAL gate (hard rule 13 — always interactive, both modes)

11. The plan is the contract the whole AUTO dev loop builds against, so it ends with a
    human sign-off — the planning twin of the `/propose` commercial gate.

    - SHOW me PLAN.md (and note any open risks the planner flagged). **STOP for approval.**
    - On **approval**: record the sign-off in three places —
      1. stamp the PLAN.md header `> Approval: approved <YYYY-MM-DD> v1`;
      2. set `plan: approved <YYYY-MM-DD>` in docs/STATE.md;
      3. append `<YYYY-MM-DD> plan v1 approved` to docs/HISTORY.md (date-first, to
         match the other HISTORY lines).
      Only now may `/phase` / `/sprint` run.
    - On **rejection / change**: revise (re-run the `planner`, or `/replan`), bump the
      version, and re-show. The header stays `PENDING` until I approve.

    AUTO governs the development loop that runs AFTER this gate, never the gate itself.

Optional next step (client / quoted work only): run `/propose` to turn this
OVERVIEW + PLAN into a proposal + estimate for sign-off before building. Internal or
personal projects skip it and go straight to `/phase`.
