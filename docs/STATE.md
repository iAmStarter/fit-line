# STATE

phase: 7 (done) — PROJECT COMPLETE (P0–P7). Remaining = owner deploy steps only (docs/RUNBOOK.md).
plan: APPROVED 2026-07-04 (owner approved proposal = plan sign-off; scope = Core P0+P1+P2+Integration + P3 stretch ทั้งหมด)
tdd: true
completed: P0(32) P1 P2 P3 P4 done. P4 = rule pipeline evaluateSubmissionRules(m,userId,todayISO) = calorie→backdate(≤1d date-only Asia/Bangkok)→dedupDate(recorded-only), short-circuit first-fail; hasRecordedSubmission. FULL suite 137/137; regression 14/14; tsc/eslint/prettier/build clean; SAST+secrets clean.
next: OWNER DEPLOY (docs/RUNBOOK.md) — create Sheet (4 tabs) · clasp login+push+deploy · Script Properties (incl fresh OCR_TOKEN) · LINE webhook wiring · registerRichMenu() · real-device smoke. All code done + verified.
blocker: none.
suite: 253/253 jest + 3 live-contract (env-gated). tsc/eslint/prettier/build clean.
decisions logged: docs/DESIGN_LOG.md (D1–D8: sync+reply-token, StashedContext, lock idempotency, local-sha256 dedup, timeout 10→30, getRecognizer swap, advanced-chart-skip, success-vs-summary distinguisher).
SECURITY: OCR token was shared in chat during build → owner MUST revoke + re-mint before/at deploy (noted RUNBOOK + reminded user).

## OCR real contract (P6) — CAPTURED 2026-07-04 → docs/research/impl-phase-6-ocr-contract.md
- **Base URL `https://fit-ocr.istartsoft.dev`** (NOT web.app — that's console/key-minting). Auth `Authorization: Bearer iss_live_…` (OCR_TOKEN). `POST /v1/ocr` multipart field `image` (or JSON base64). `GET /health`→200 `{"status":"ok"}` no auth.
- 25-key `OcrResult` (all always-present, null-not-omitted). Errors 400/401/413/422(conf<0.4)/502/503; upstream timeout 25s. ≤8MiB, ≥1KiB.
- **P6 KEY WORK:** realign our `OcrMetrics` (invented names: durationMinutes/avgPaceMinPerKm/avgSpeedKmh/cadence/vo2Max/deviceApp/rawText/schemaVersion…) → real 25-key. Business-logic fields already MATCH (activeCaloriesKcal/totalCaloriesKcal/activityType/activityDateISO/distanceKm/source/confidence) so rules/cards/sheet unaffected. Decide fetchTimeoutSeconds 10→30 (upstream 25s). Keep local sha256 for dedup (== API imageHash minus `sha256:` prefix). Full detail in the research doc.

## Deploy/infra note (owner-only — parked till P6/P7)
- clasp create/login/push/deploy = owner Google OAuth (cannot self-do). Real Sheet write + LINE webhook wiring + OCR real URL land at P6 (OCR) / P7 (deploy).
- Owner to provide at deploy: SHEET_ID (not secret), scriptId (not secret) → Script Properties + .clasp.json. LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / OCR_TOKEN = secrets, owner sets in Script Properties directly (never in chat/commit).

## Run mode (this session)
- `/phase` "1 to end phase non stop" → orchestrator drives P1→P7 sequentially, AUTO, no /clear between phases (user override).
- Synthesize: light STATE/PLAN/HISTORY checkpoint each phase; full `/synthesize` at SPRINT boundaries (Sprint 1 = P1+P2 ← running now; Sprint 2 = P3+P4+P5; Sprint 3 = P6+P7) + extended final pass at P7.

## Current code surfaces (for downstream — do not re-derive)
- types: `OcrMetrics` (25-key), `RuleResult`, `emptyOcrMetrics(source)` · `StashedContext{metrics,messageId,userId,imageHash}` (imageHash added P3).
- P3 anti-spam: `rules/imageDedup.ts` `sha256Hex(blob)`+`isDuplicateImage(hash)` · `rules/rateLimit.ts` `rateLimitAllows(userId)` (5/60s, key `rl:`) · `state/lock.ts` `withScriptLock(fn,waitMs=10000)` · `sheetRepo.imageHashExists(h)`+`submissionExistsByMessageId(mid)` · `flex/reject.ts` `buildBlockNoticeCard(reason,{cameraRoll})` (red, no OCR values). Image path gates BEFORE OCR: rate-limit→sha256 dedup→OCR. Postback write wrapped in withScriptLock + messageId idempotency.
- ocr: `OcrRecognizer` iface · `ocrMock` (full 25-key) · `ocrClient` (real, unprovisioned till P6 = SWAP POINT).
- rules: `calorieRule(m)`, `CALORIE_THRESHOLD_KCAL=150`. (P3 adds imageDedup/rateLimit/lock BEFORE OCR; P4 adds backdate/dedupDate AFTER OCR in pipeline.)
- state: `stashSubmission(ctx)->id`, `retrieveSubmission(id)`, `removeSubmission(id)`, TTL 600s, prefix `ocr:`.
- line: `getMessageContent(msgId)`, `reply(replyToken,msgs)` · flex `buildConfirmCard(m,cacheId)` (#2f6fed, postback `action=confirm&id=`) · `buildRejectCard(m,reason)` (#d64545, cameraRoll, no buttons) · `buildSuccessCard(ctx)` (#1e9e57, "บันทึกแล้ว").
- sheet: `appendSubmission(ctx,status='recorded')` (14-col by header, null→''), `ensureEmployee(userId,name)` (register-once), `PLACEHOLDER_EMPLOYEE_NAME='(ยังไม่ระบุชื่อ)'`. (P3 adds imageHash lookup; P4 adds userId+activityDate lookup.)
- main: `routeWebhook(rawBody)`, `handleImageMessage(event)` (stashes {metrics,messageId,userId}), `handlePostback(event)`, `doPost(e)`. Never throws; doPost always 200.
- submissions schema (14-col order): messageId·userId·name·activityType·activityDateISO·submittedAtISO·activeCaloriesKcal·totalCaloriesKcal·distanceKm·source·confidence·status·rejectReason·imageHash. employees: userId·name·registeredAtISO.

## Open items / triage
- SCA HIGH uuid@8.3.2 (via @google/clasp devDep, unreachable in deployed GAS bundle) → ISSUES.md ACCEPTED-RISK / DEFERRED-P6.

## Locked decisions (carry — do not re-derive)
- sync + reply-token · AUTO mode · Thai docs · no emoji in any Flex/UI
- Secrets: Script Properties only; never commit .clasprc.json
- Jest mocks GAS globals via DI harness (test/setup.ts) — reused all phases
- Test root: test/ (singular); subdirs test/regression/ + test/phase-<N>/; regression.sh at repo root
- Stash carries messageId+userId (StashedContext) — image-event lineage for P3 dedup
