# FEATURE: <feature name>

> Status: draft
> Approval: PENDING            <!-- APPROVED <name> <YYYY-MM-DD> arms the lane -->
> Automation: none             <!-- none | push | push+pr — what the run may do outbound -->

<!--
The ONE human input of the feature lane. Fill it in, flip Approval to
APPROVED, then run:  /feature docs/features/<slug>/FEATURE.md
(or headless: node scripts/feature-docker.js docs/features/<slug>/FEATURE.md)
Everything below Approval is the spec the agents build and test against —
write WHAT and WHY; the lane decides HOW and logs it.
-->

## What & why

<2–5 sentences: the capability, who uses it, why now. Plain language.>

## Scope

- <bullet the concrete behaviours in scope — each becomes acceptance criteria>
- <keep it to ONE feature; a second feature = a second doc>

## Out of scope

- <name what this doc deliberately does NOT cover — the scope-creep fence.
   The lane HARD-STOPS to /change-request if the plan needs anything here>

## Constraints & contracts

- <APIs / schemas / integrations it must respect or extend, if known>
- <performance, compliance, or platform constraints, if any>

## Acceptance criteria

<!-- The lane's adversarial doc-review will ATTACK this list and fold in the
     negative/abuse cases it finds. Start with the positives you care about. -->
- <given/when/then or checklist form — every line must be testable>

## Done when

- Every acceptance criterion has a passing test (blind TDD).
- Every scenario in the generated TEST-PLAN.md passes UAT.
