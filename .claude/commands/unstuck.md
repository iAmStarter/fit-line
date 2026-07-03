---
description: Forced re-research after a circuit breaker. Stops flailing, re-routes to deep research with full memory of dead ends.
---

Caveman ULTRA mode.

Trigger: I chose "re-research" at a circuit breaker (see /phase step 5).

Steps:

1. WRITE IT DOWN. Append to docs/ISSUES.md as OPEN:
```

### <error title>

- [ ] open - stuck after 3 attempts
- symptom: <…>
- failed attempts: <hypothesis 1>, <2>, <3>

```
Reference the existing debug-<slug>.md.

2. RESET FRAME. The 3 failed hypotheses are probably all wrong. Discard them.

3. DEEP RESEARCH. Dispatch `researcher` in IMPL mode WIDE:
- Read existing debug-<slug>.md and ISSUES.md failed-attempts FIRST.
- Re-read the actual error from scratch.
- Check real external service contract / docs.
- Look one layer below: config? env? version? data shape?
- Return fresh HYPOTHESIS backed by NEW evidence.

4. RE-PLAN if needed. Research shows phase design was wrong -> dispatch planner.

5. RESUME. Hand fresh hypothesis to `debugger`. It reads the prior debug file
(already knows what's ruled out). Budget = 3, NEW hypotheses only.

6. This counts as the path chosen at the first breaker. If STUCK again ->
/phase step 5 SECOND STUCK. Do not loop further.

Report each step.
