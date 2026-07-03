---
description: Compress handoff docs, dedup the issue log, prune snapshots. Run before /clear.
---

Caveman ULTRA mode.

Trigger: end of a phase, or any time STATE.md / ISSUES.md feel bloated.

Dispatch the `synthesizer` subagent.

For a normal phase: it rewrites STATE.md, dedups ISSUES.md, prunes snapshots,
appends to HISTORY.md.

For the FINAL phase (no further pending phases): also pass the signal
"FINAL PHASE" so the synthesizer runs the extended pass — updating OVERVIEW.md
and README.md to reflect the completed project state.

To determine if this is the final phase: read docs/PLAN.md. If no phases remain
with status "pending" after the current one, it is the final phase.

When synthesizer returns "safe to /clear: yes", tell me:
- before/after line counts
- whether the final-pass ran
- that I can now run /clear (or proceed to the endpoint summary if final phase)

If it returns anything unsafe, show me what and stop.
