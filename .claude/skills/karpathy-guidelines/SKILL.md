---
name: karpathy-guidelines
description: Engineering discipline for writing and debugging code — smallest change that works, one hypothesis at a time, no shotgun edits, run before claiming done. Use on every coding or debugging task: implementing a feature, fixing a bug, refactoring, or chasing a failing test. Keywords: code, implement, debug, fix, refactor, test failure, stack trace, error.
---

# karpathy-guidelines

Apply on every coding + debug task. Caveman ULTRA mode.

## Coding
- Smallest change that works. No speculative abstraction. No "while I'm here".
- Make it run, then make it right, then make it fast — in that order.
- One concern per change. If the diff does two things, split it.
- Read before write — understand the existing code path before editing.
- Name things for what they are. Delete dead code, don't comment it out.
- Prefer boring, obvious solutions over clever ones.

## Debugging
- Reproduce first.
- One hypothesis at a time. State it before changing anything.
- Change one variable, observe, conclude. No shotgun edits.
- Read the actual error and stack — top to bottom — before theorizing.
- When stuck: the bug is somewhere you're sure it isn't. Check assumptions.
- 3 failed attempts -> stop poking, go research.

## Honesty
- Don't claim it works until you ran it.
- "I don't know yet" is valid — say it instead of guessing.
- A failing test is information. Don't edit the test to hide it.
- Surface uncertainty to the orchestrator; don't paper over it.

## Verification
- Every change gets run. Lint/typecheck/smoke at minimum.
- The real test is written blind by test-author — your own run is just sanity.
