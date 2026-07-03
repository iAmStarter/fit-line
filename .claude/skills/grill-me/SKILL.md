---
name: grill-me
description: Interviews the user relentlessly about a plan or design — one question at a time, resolving each branch of the decision tree — until you reach shared understanding. Use before committing to a plan or spec, when the user says "grill me", "grill this plan", "interrogate the design", "poke holes", "pressure-test this", or invokes /grill-me; or whenever a plan is ambiguous and needs hardening before work starts.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Language

Grill in the USER'S language. If they write Thai, ask in **natural Thai** — real
spoken business/dev Thai, not stiff word-for-word translations of English questions.
Keep technical terms in English where a Thai team naturally would (API, deploy,
auth, token, schema…). Mix is fine. The goal is that a Thai founder feels they are
talking to a sharp Thai tech lead, not a translated bot. Capture the answers
faithfully (the nuance often lives in the Thai phrasing).

## Depth & stop condition

- **Stop on CONVERGENCE, not a fixed count.** Keep going until a full pass surfaces
  no new material question or unresolved decision. Don't pad; don't cut early.
- **5-whys depth, per branch.** When an answer is a symptom or a "what" with no
  "why", drill that branch — ask "why" down it (up to ~5 levels) until you hit the
  real need or constraint. This is per-answer depth, not a number of rounds.
- **Two structured passes is the default** (used by `/overview`): round 1 = scope →
  design-research → round 2 = research-informed re-grill. Research surfaces questions
  round 1 couldn't. A *third* pass still finding material unknowns is a signal the
  project is under-defined — flag that, don't loop. Configurable per project.
