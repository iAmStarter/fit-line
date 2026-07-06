# DESIGN LOG — fit-webhook

Architecture/design decisions taken during the build (hard rule 8). Newest last.

## D1 · Sync + reply-token (not async queue) — P0/OVERVIEW
doPost processes synchronously and answers with the LINE **reply token** (free, TTL ~60s >> OCR p95 2–3s). No async trigger, no push (push = 200/mo fallback only). Redelivery handled by messageId+LockService idempotency (D3).

## D2 · StashedContext envelope — P2/P3
Cross-event state (image → confirm postback) stashed in CacheService as `StashedContext { metrics, messageId, userId, imageHash }` (not bare OcrMetrics). messageId carried because postback events lack `message.id` and it is the `submissions` dedup key + Phase-3 lock key. imageHash added P3 (computed pre-OCR, written at postback).

## D3 · messageId + script-wide LockService idempotency — P3
Redelivery / concurrent double-confirm serialized by `getScriptLock().waitLock(10s)`; inside the lock, `submissionExistsByMessageId` skips a duplicate write → exactly 1 row. GAS `getUserLock` = script owner (not the LINE user), so script-wide lock is correct.

## D4 · Local sha256 dedup as pre-OCR cost gate — P3, reconciled P6
Image dedup computes `sha256Hex(blob)` LOCALLY before calling OCR (must gate before spending the OCR call). The real API also returns `imageHash = sha256:<hex>` of the same bytes → identical value modulo the `sha256:` prefix, so the local hash stays the single dedup key end-to-end; the API field is redundant for us.

## D5 · fetchTimeoutSeconds 10 → 30 — P6 (overrides OVERVIEW §7 lock)
OVERVIEW §7 originally locked `fetchTimeoutSeconds:10` (OCR SLA p95 2–3s). The real API documents an upstream timeout of **25s** (503). Raised to **30s** so GAS does not abort before the API on a slow read; LINE reply-token TTL (~60s) still covers it. Timeout / 5xx → error card "อ่านรูปไม่สำเร็จ ลองใหม่".

## D6 · getRecognizer() config swap (mock ↔ real OCR) — P6
Router calls `getRecognizer().recognize(blob)`. Returns the real `ocrClient` iff BOTH `OCR_BASE_URL` + `OCR_TOKEN` are set in Script Properties, else `ocrMock`. Swap is config-only (no code change); mock↔real share the `OcrRecognizer` interface + the 25-key `OcrMetrics`.

## D7 · Advanced chart DECISION-GATE → SKIP external — P7
PLAN P7 allowed an advanced/line chart via an external service (QuickChart/self-host) IF native Flex boxes were insufficient. **Decision: stay with native Flex-box bar chart** (`buildBarChart`). Rationale: an external chart service means sending user activity data off-platform (privacy/PDPA); the native Flex bar chart is sufficient for week/7-day visualization. No external chart code added. (Revisit only if a richer chart becomes a hard requirement — would need a privacy review + log-decision.)

## D8 · Success card keeps its running summary; cards distinguished by 'บันทึกแล้ว' — P7
A P7 rich-menu routing test initially distinguished the confirm success card from the on-demand summary card by asserting the success card had NO summary line — which contradicted the Phase-5 acceptance (success card SHOWS week/month/total). Resolved by distinguishing on the terminal ack text **'บันทึกแล้ว'** (only the confirm success card has it); both cards may carry the summary. Success card = ack + summary + chart; summary rich-menu card = summary + chart, no ack.
