---
description: Promote resolved issues and research findings from this project to the shared istartsoft-flow-kb repo. Analyzes, proposes candidates for your review, then pushes approved entries.
---

Caveman ULTRA mode. You are the ORCHESTRATOR.

Purpose: share what this project learned with all future projects.
Only resolved issues and completed research qualify. Open issues do NOT.

---

## PRE-FLIGHT

1. Read `.claude/kb-config.json`.
   - Not found -> STOP. Tell me: "KB not configured. Create `.claude/kb-config.json`
     with `kb_path` + `kb_remote` pointing at the shared KB repo, then retry /store-wisdom."
   - Found -> extract `kb_path` and `kb_remote`.

2. Expand `kb_path` (resolve `~` to home directory).
   Verify the path exists and is a git repo (`git -C <path> status`).
   - Fails -> STOP. Tell me the path is broken and to fix `kb_path` in
     `.claude/kb-config.json`.

---

## STEP 1 — PULL LATEST KB

Run: `git -C <kb_path> pull --ff-only`

- Success -> continue.
- Conflict or diverged -> STOP. Tell me:
  "KB has a conflict. Resolve manually in <kb_path>, then retry /store-wisdom."
- Offline (no network) -> WARN me, ask: "KB pull failed (offline?). Continue
  with local KB copy, or abort?" Wait for answer.

---

## STEP 2 — ANALYZE LOCAL PROJECT

Scan this project for promotion candidates:

### From docs/ISSUES.md — resolved issues only
- Read all entries marked `- [x] resolved`.
- Exclude: entries with no root cause filled in, entries without a solution.
- For each qualifying entry, note: title, symptom, root cause, solution,
  failed attempts.

### From docs/research/ — completed research files
- Read docs/research/INDEX.md. For each entry:
  - Read the corresponding file.
  - A research entry qualifies if: it documents an external service behavior,
    API contract, SDK gotcha, architectural constraint, or cost finding that
    would be useful in a different project.
  - A research entry does NOT qualify if: it is a project-specific config
    finding, a one-off trace with no generalizable conclusion, or a debug
    trace (`debug-*.md`).
- Note: research entries get a `created:` timestamp (today's date if not
  already present in the file). Staleness is measured from this date.

### Cross-check against KB
- Read `<kb_path>/INDEX.md` (if it exists).
- For each candidate: does a matching slug already exist in the KB?
  - YES, fresh entry: skip (already in KB, not stale).
  - YES, stale entry (marked [STALE] in the snapshot): flag as REWRITE candidate.
  - NO: flag as NEW candidate.

---

## STEP 3 — PROPOSE CANDIDATES

Present candidates one at a time. For each:
```

[N of M] <type: NEW | REWRITE> — <slug>
Tags: <tag1, tag2, tag3>
Action: <“new entry” | “replaces stale entry from YYYY-MM-DD”>

## Preview:

## [<slug>]

## created: <YYYY-MM-DD>
tags: <tags>
symptom/context: <…>
root-cause / finding: <…>
fix / recommendation: <…>

[APPROVE / EDIT / SKIP]

```
- APPROVE: add to approved list.
- EDIT: ask me for the edit, apply it, re-show, wait for APPROVE or SKIP.
- SKIP: discard this candidate.

After all candidates: show me the summary:
```

Approved: <N> entries
Skipped: <M> entries
Domains to write: <list>
New domain folders to create: <list or “none”>
Proceed? [yes / abort]

```
Wait for "yes" before writing anything.

---

## STEP 4 — WRITE TO KB

For each approved entry:

1. Determine the domain file path: `<kb_path>/<domain>/<file>.md`
   - If the directory does not exist: create it.
   - If the file does not exist: create it with a `# <domain> — <file>` header.

2. REWRITE candidates: find the existing `## [<slug>]` block in the file and
   replace it entirely with the new entry.

3. NEW candidates: append the entry to the end of the domain file.

4. Update `<kb_path>/INDEX.md`:
   - For NEW entries: append a line:
     `YYYY-MM-DD | <domain>/<file> | <slug> | <one-sentence summary>`
   - For REWRITE entries: update the existing line in-place (new date, same slug).

5. If this is the first `/store-wisdom` run (no INDEX.md existed):
   Also create `<kb_path>/KB_GUIDE.md` with the entry format reference:

   ```markdown
   # istartsoft-flow-kb — guide

   This repo accumulates resolved issues and research findings from iStartSoftFlow projects.
   Populated by `/store-wisdom`. Read by the iStartSoftFlow `researcher` agent at session start.

   ## Entry format — issues
   ## [slug]
   created: YYYY-MM-DD
   tags: tag1, tag2
   symptom: what was observed
   root-cause: the real underlying cause
   fix: exact solution
   failed-attempts: what did not work

   ## Entry format — research
   ## [slug]
   created: YYYY-MM-DD
   tags: tag1, tag2
   symptom/context: what prompted the research
   finding: what was discovered
   recommendation: what to do

   ## INDEX.md format
   YYYY-MM-DD | domain/file | slug | one-sentence summary

   ## Staleness
   Research entries older than 6 months are flagged [STALE] at session load.
   Stale entries are re-researched locally and rewritten via /store-wisdom.
   Issue entries never go stale.
```

-----

## STEP 5 — COMMIT AND PUSH

Run from `<kb_path>`:

```bash
git add -A
git commit -m "store-wisdom: <N> entries from <project-name> (<YYYY-MM-DD>)"
git push
```

- Push success -> tell me:
  
  ```
  KB updated.
  - entries written: <N> (<list of slugs>)
  - domains touched: <list>
  - new domains created: <list or "none">
  - pushed to: <kb_remote>
  ```
- Push fails -> tell me the push failed, show the git error.
  The entries ARE written locally — tell me to push manually:
  `git -C <kb_path> push`

-----

## NOTES

- `/store-wisdom` never modifies docs/ISSUES.md or docs/research/ in this project.
  It reads them; it does not change them.
- If there are no qualifying candidates, tell me so and stop. Do not push an empty commit.
- The KB is append-only except for REWRITE of stale research entries.
  Issue entries are never deleted or overwritten — they are facts.
