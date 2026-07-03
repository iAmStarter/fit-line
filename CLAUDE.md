# CLAUDE.md — iStartSoftFlow (Claude Code entry)

@AGENTS.md

The import above is the single source of truth — it points to
`.claude/istartsoft-flow/METHODOLOGY.md` (read on demand). Do NOT restate any
rule here; this file only wires Claude-native mechanisms (anti-drift invariant).

## Claude-native wiring (automatic — see `.claude/settings.json`)

- **SessionStart** hook injects git state + `docs/STATE.md` + open `docs/ISSUES.md`
  + the rule summary each session — read those first.
- **PreCompact** + **SubagentStop** hooks run their rituals automatically.
- Commands in `.claude/commands/` run as `/name`; agents in `.claude/agents/` are
  native subagents.
