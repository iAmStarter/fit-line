# STATE

phase: 0 (done)
plan: APPROVED 2026-07-04 (owner approved proposal = plan sign-off; scope = Core P0+P1+P2+Integration + P3 stretch ทั้งหมด)
tdd: true
completed: §1–3 DONE — verifySignature + doPost + getProp skeleton (all 32/32 RED+GREEN TDD tests pass); toolchain stable (TypeScript/Jest/Rollup/clasp); test harness at test/setup.ts reused all phases; regression.sh runbook ready.
next: Phase 1 (image reception → OCR mock → doPost chains to flow)
blocker: none

## Locked decisions (carry — do not re-derive)
- sync + reply-token · AUTO mode · Thai docs · no emoji in any Flex/UI
- Secrets: Script Properties only (LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OCR_BASE_URL, OCR_TOKEN, SHEET_ID); never commit .clasprc.json
- Jest mocks GAS globals via DI harness (test/setup.ts) — reused all phases
- Test root: test/ (singular); subdirs test/regression/ + test/phase-<N>/; regression.sh at repo root
