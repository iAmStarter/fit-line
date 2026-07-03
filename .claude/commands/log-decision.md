---
description: Record an architectural decision in docs/DESIGN_LOG.md. Use only when the kit's structure changes.
argument-hint: [what changed]
---

Caveman ULTRA mode.

Append an architectural decision to docs/DESIGN_LOG.md. Change: $ARGUMENTS

WHEN this applies — the change is ARCHITECTURAL:
- new / removed / renamed agent, hook, or command
- changed workflow rule (escalation, phase gate, test layering)
- design decision where alternatives were weighed

WHEN it does NOT apply:
- code changes, features, phase progress -> HISTORY.md
- bugs + fixes -> ISSUES.md

Steps:
1. Read docs/DESIGN_LOG.md.
2. Append a dated line to `## 0. Changelog`, newest first.
3. If alternatives were weighed, ALSO append a full entry to §5:
```

### 5.x <decision title>

Options: <a, b, c>. **Chosen: <x>.** <why it won.>

```
4. If agent/hook/command/file added or removed, update the file inventory (§6).
5. NEVER rewrite or delete existing entries — append only.

Confirm back in 2-3 lines: what was logged and where.
