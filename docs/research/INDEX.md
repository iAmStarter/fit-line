# Research Index

## Design Phase Research (fit-webhook DESIGN)

| Date | File | Finding | Path |
|------|------|---------|------|
| 2026-07-03 | design-line-messaging-api | LINE webhook waits 2s; reply token TTL unknown (safety margin ~10s assumed); getContent 2MB limit; Flex bubbles fit; Push API quota 200–30k/month by plan. **RISK:** Webhook must return 200 immediately or mark as timeout; getContent availability window unknown. | `/Users/istd/fit-webhook/docs/research/design-line-messaging-api.md` |
| 2026-07-03 | design-gas-runtime-constraints | doPost 6min limit (not exceeded by v1); UrlFetchApp timeout **IS configurable** (~10s safe); POST payload **50MB limit** (base64 1.5MB image ~2MB, well under limit); LockService timeout user-defined; SpreadsheetApp 50k/day quota (consumer); **NO HARD BLOCKERS** for v1. | `/Users/istd/fit-webhook/docs/research/design-gas-runtime-constraints.md` |
| 2026-07-03 | design-gas-dev-test-deploy | clasp + TypeScript + Rollup mature and stable; Jest + dependency injection for unit tests (no single E2E framework; use contract tests + manual staged testing); GitHub Actions + clasp for CI/CD straightforward. | `/Users/istd/fit-webhook/docs/research/design-gas-dev-test-deploy.md` |
| 2026-07-03 | design-gas-secrets-management | Use PropertiesService (Script Properties) for LINE/OCR tokens; do NOT hardcode or commit `.clasprc.json`; no Secret Manager needed for v1. Rotation quarterly. | `/Users/istd/fit-webhook/docs/research/design-gas-secrets-management.md` |
| 2026-07-03 | design-image-transport | Multipart/form-data preferred (25–30% smaller, simpler in GAS); base64-in-JSON fallback. Both under 50MB UrlFetchApp limit. Recommend multipart. | `/Users/istd/fit-webhook/docs/research/design-image-transport.md` |

## IMPL Phase Research (fit-webhook IMPLEMENTATION)

| Date | File | Finding | Path |
|------|------|---------|------|
| 2026-07-04 | impl-phase-0-toolchain | Concrete Phase 0 scaffolding specs: Rollup v4 IIFE → single .js; TypeScript 5.x target=es5; Jest + DI mocks (test/setup.ts harness provided); Utilities.computeHmacSha256Signature → base64Encode path exact; PropertiesService.getProperty fail-fast pattern; appsscript.json manifest (V8, ANYONE_ANONYMOUS, 3 required scopes); .clasp.json/.claspignore/.gitignore rules; ContentService HTTP 200 response skeleton. **All concrete, zero blockers.** | `/Users/istd/fit-webhook/docs/research/impl-phase-0-toolchain.md` |

## Key Constraints & Risks Identified

### CRITICAL: Webhook Architecture Mismatch

**Brief Assumption:** "Synchronous processing (OCR + Sheet write) inside doPost."

**Reality:** LINE webhook timeout is **2 seconds**. OCR latency is 2–10s. **This violates the 2-second constraint.**

**Mitigation:** Return HTTP 200 immediately; queue processing asynchronously (separate function, Cloud Tasks, or time-based trigger). Reply via Push API after processing.

### CORRECTED: UrlFetchApp Timeout

**Brief Assumption:** "Set fetch timeout ~10s."

**Reality:** ✓ Supported via `fetchTimeoutSeconds: 10`. **No issue.**

### CORRECTED: UrlFetchApp Payload Size

**Brief Assumption:** "Base64 image in JSON payload; does GAS allow ~11MB POST?"

**Reality:** UrlFetchApp POST limit is **50 MB**. A 1.5 MB JPEG → ~2 MB base64 → well under. **No issue.**

### Unknowns (Not Confirmed)

- **Reply token exact TTL:** Likely ~10–60 seconds; use immediately.
- **getContent availability window:** Unknown; assume not guaranteed beyond 24–48 hours. Download immediately upon webhook receipt.
- **getContent specific rate limit:** General limit 1k/min; specific limit unknown.

---

## Grill-Me Input for Planning Phase

The following should be confirmed with the team before plan approval:

1. **Webhook Async Decision:** Accept that webhook must return 200 immediately and queue OCR + reply asynchronously?
   - If no: Architecture is infeasible; reject brief.
   - If yes: Decide queue mechanism (Apps Script bound trigger, Cloud Tasks, manual step).

2. **Async Queue Mechanism:** Which approach for queuing?
   - **Option A:** Apps Script time-based trigger (polls every 1–5 min; simple, free, eventual consistency).
   - **Option B:** Cloud Tasks (managed, reliable, but adds GCP cost).
   - **Option C:** Manual step (user clicks button to replay; lowest automation).

3. **Reply Channel:** Use reply token (immediate, single-use) or Push API (guaranteed)?
   - **Recommendation:** Reply token primary; Push API fallback after ~30s if needed.

4. **Error Handling:** What happens if OCR fails, image expires, or lock times out?
   - Log to Sheet or send admin alert?
   - Retry automatically or require manual intervention?

5. **Testing:** Contract tests (mocked OCR + Jest) sufficient for v1, or require staged E2E?
   - Recommendation: Contract tests + staged manual testing (real LINE account, test Sheet).

6. **Secrets Rotation:** Quarterly rotation acceptable, or need more frequent (monthly)?
   - Recommendation: Quarterly (90-day policy standard).

---

## Next Steps (for Plan Phase)

1. **Confirm webhook async architecture** (GATING).
2. **Define queue mechanism** (GATING).
3. **Decide reply strategy** (reply token vs. Push API).
4. **Draft error handling runbook** (Sheet logging, retry policy, admin alerts).
5. **Plan contract test suite** (mocked OCR, test payloads, verification steps).
6. **Bootstrap clasp + TypeScript project** (local dev, CI/CD pipeline).
