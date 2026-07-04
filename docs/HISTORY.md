# HISTORY

| date | event |
|---|---|
| 2026-07-03 | bootstrap — grill ×2 + 5 design-research (OVERVIEW.md approved) |
| 2026-07-04 | PROPOSAL.md + semantic HTML mockup; pushed to GitHub Pages |
| 2026-07-04 | plan sign-off (owner approved scope: Core P0–P2 + P3 stretch ทั้งหมด) |
| 2026-07-04 | **P0 done** — signature verify, doPost, clasp toolchain; 32/32 jest green |
| 2026-07-04 | **P1 done** — image→OCR(mock)→calorieRule→confirm/reject Flex; 73/73 jest; SCA uuid triaged ACCEPTED-RISK-P6 |
| 2026-07-04 | **P2 done — Sprint 1 COMPLETE** — postback→Sheet write→success card; stash consumed after write; StashedContext{metrics,messageId,userId}; 92/92 jest; 40% proposal complete |
| 2026-07-04 | **P3 done** — anti-spam: sha256 image dedup (system-wide, pre-OCR cost gate) + per-user rate-limit (5/60s CacheService) + messageId LockService idempotency (redelivery→1 row). imageHash threaded stash→row. 118/118 jest; tsc/eslint/prettier/build clean |
| 2026-07-04 | **P4 done** — business rules pipeline calorie→backdate(≤1d, date-only Asia/Bangkok)→dedupDate(userId+activityDate, recorded-only), short-circuit first-fail. 137/137 jest; clean. |
| 2026-07-04 | **P5 done — Sprint 2 COMPLETE** — success summary (week/month/total) + native Flex bar chart (no external URL) + dispute: fail-counter ≥3 auto-offers "แจ้งแอดมิน" quick-reply on reject → `disputes` tab 1/messageId idempotent. (FILL cut by session limit @155/189, resumed to 197/197.) tsc/eslint/prettier/build clean. |
| 2026-07-04 | **OCR real contract captured** — owner gave https://fit-ocr.web.app/docs; real base `https://fit-ocr.istartsoft.dev`, Bearer iss_live_, POST /v1/ocr multipart `image`, 25-key OcrResult, GET /health→{status:ok}. Verified live (health 200, token 400-not-401). → docs/research/impl-phase-6-ocr-contract.md. |
| 2026-07-04 | **P6 done** — realigned OcrMetrics→real 25-key; real `ocrClient.recognize` (multipart Bearer, fetchTimeoutSeconds 10→30 to cover upstream 25s, defensive parse, no token leak); `getRecognizer()` config swap (real when OCR props set, else mock). Contract test PASSED vs LIVE api (health/401/400). 222/222 + 3 real-contract green. Security review PASS (token not logged/committed, TLS, no HIGH in deployed surface). |
| 2026-07-04 | **CR-1 done (Phase 8)** — auto-save: removed the confirm step; a passing image writes immediately (write + messageId/Lock idempotency moved onto the image path) → success card with summary. Deleted `confirm.ts` + `cacheStore.ts` (stash) + confirm postback branch; legacy `action=confirm` → graceful ignore. PROPOSAL→v2 (+฿13.8–23k). 239/239 jest; clean. |
| 2026-07-04 | **P7 done — PROJECT COMPLETE (P0–P7)** — identity roster mapping (`resolveEmployeeName`, fallback placeholder) · rich-menu (buildRichMenu + registerRichMenu owner-run + help/summary postback routing) · trigger + on-demand summary cards · advanced chart DECISION-GATE→skipped (stay native Flex, privacy). Fixed a P7-test-vs-P5 conflict: success card keeps its running summary (P5), cards distinguished by 'บันทึกแล้ว'. **253/253 jest + 3 live-contract; tsc/eslint/prettier/build clean.** Deploy = owner clasp steps (RUNBOOK.md). |
