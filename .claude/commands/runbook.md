---
description: Capture an operational/incident scenario in docs/RUNBOOK.md — one grep-able markdown so prod-debug knowledge isn't re-derived under pressure.
argument-hint: [scenario, or "from the incident we just solved"]
---

Caveman ULTRA mode.

Distill an operational scenario into docs/RUNBOOK.md. Scenario: $ARGUMENTS

This is the runbook pattern Anthropic's Security + Data-Infra teams converged on
independently: consolidate stack traces, dashboard signals, and the exact
remediation commands into ONE searchable file so the next incident is a lookup,
not a re-investigation.

If $ARGUMENTS says "from the incident we just solved" (or similar), distill the
debugging session in context — symptom, the REAL root cause, the commands that
fixed it — instead of asking the user to re-type it.

Append an entry to docs/RUNBOOK.md (create the file if missing). Canonical format:
```

### <scenario title — searchable, literal symptom keywords>

- trigger: <what you observe first — alert, error string, dashboard signal>
- diagnose: <steps/commands to confirm the real root cause>
- remediate: <the exact commands/actions that fix it>
- verify: <how to confirm recovery — what "healthy" looks like>
- refs: <dashboard URLs, docs, related docs/ISSUES.md titles>

```
Rules:
- title carries literal symptom keywords -> grep finds it mid-incident.
- remediate must be runnable as-is; no "investigate further".
- mark any step that is irreversible / PROD-writing with ⚠ so it's never run blind.
- cross-link the matching docs/ISSUES.md entry instead of duplicating root-cause prose.
- newest scenario at the TOP.

Confirm the entry back in 2 lines.
