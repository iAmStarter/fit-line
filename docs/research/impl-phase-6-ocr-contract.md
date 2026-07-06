# Phase 6 research — REAL Fit-OCR API contract (owner-provided 2026-07-04)

Source: https://fit-ocr.web.app/docs (rendered via browser; SPA — fetch/openapi.json is rewritten to index.html, so read from the rendered page). Captured verbatim below.

## Base + auth
- **Base URL: `https://fit-ocr.istartsoft.dev`** (HTTPS only). NOTE: `fit-ocr.web.app` = console/marketing + key minting; the API host is `istartsoft.dev`. → `OCR_BASE_URL = https://fit-ocr.istartsoft.dev`.
- **Auth:** every `/v1/*` request needs `Authorization: Bearer <token>`. Token is opaque, looks like `iss_live_…`. → `OCR_TOKEN` (Script Property). Owner mints it at fit-ocr.web.app → Console → API keys (shown once). Hashed at rest.
- Missing/invalid/revoked key → identical **401 `{"error":"unauthorized"}`** (no oracle).

## POST /v1/ocr
Two transports:
- **JSON:** `Content-Type: application/json`, body `{ "image": "<base64>", "mimeType": "image/png" }` (both required, non-empty).
- **multipart:** `Content-Type: multipart/form-data`, attach file as field **`image`** (mime read from the file). ← **our chosen transport** (OVERVIEW §7).
- GAS: `UrlFetchApp.fetch(url, { method:'post', headers:{Authorization:'Bearer '+token}, payload:{ image: blob } })` → GAS auto-sets multipart/form-data with field `image`.

**Constraints:** mimes `image/png image/jpeg image/webp image/heic image/heif`; body ≤ **8 MiB** (else 413); decoded image ≥ **1 KiB** (else 400); reading with **confidence < 0.4 → 422** (never a low-quality 200).

**Status codes:** 200 OcrResult · 400 `{"error":"invalid request"}` · 401 `{"error":"unauthorized"}` · 413 `{"error":"image too large"}` · 422 `{"error":"could not read image"}` · 502 `{"error":"upstream error"}` (vision model error) · 503 `{"error":"upstream error"}` (upstream **timeout 25 s** or unavailable). Every error body = generic `{"error":…}`.

## GET /health
Public, **no auth**, dependency-free. → **200 `{ "status": "ok" }`** (fixed body).

## Rate limits
No `X-RateLimit-*`, no 429 on `/v1/ocr` today. Only console key-minting is rate-limited. (Per-plan quota arrives with paid plans.)

## OcrResult — the 25-key contract (REAL — replaces our invented mock shape)
Every key ALWAYS present; absent data is `null`, never omitted. Metric + ISO throughout.

| # | field | type | note |
|---|---|---|---|
| 1 | `imageHash` | string | `sha256:<64-hex>` of raw bytes — server dedup key. Always present. |
| 2 | `source` | string | app slug e.g. `strava`,`apple_fitness`; `unknown` if undetectable. Always present. |
| 3 | `confidence` | number | [0,1]. Always present. |
| 4 | `activityType` | string \| null | `run`,`ride`… |
| 5 | `activityDateISO` | string \| null | ISO 8601, best-effort (year may be uncertain) |
| 6 | `activityDateRaw` | string \| null | date as shown (e.g. Thai BE) pre-normalization |
| 7 | `startTimeLocal` | string \| null | |
| 8 | `endTimeLocal` | string \| null | |
| 9 | `elapsedTimeSec` | number \| null | |
| 10 | `movingTimeSec` | number \| null | Strava/Garmin only |
| 11 | `distanceKm` | number \| null | |
| 12 | `avgPaceSecPerKm` | number \| null | |
| 13 | `avgSpeedKph` | number \| null | |
| 14 | `elevationGainM` | number \| null | may be negative |
| 15 | `activeCaloriesKcal` | number \| null | |
| 16 | `totalCaloriesKcal` | number \| null | Apple & Fitbit only |
| 17 | `avgHeartRateBpm` | number \| null | |
| 18 | `maxHeartRateBpm` | number \| null | |
| 19 | `avgCadenceSpm` | number \| null | running |
| 20 | `avgCadenceRpm` | number \| null | cycling |
| 21 | `steps` | number \| null | |
| 22 | `avgPowerWatts` | number \| null | |
| 23 | `additionalMetrics` | object \| null | free map string→string\|number (only variable-key field) |
| 24 | `warnings` | string[] \| null | |
| 25 | `rawOcrText` | string \| null | debug only |

## RECONCILIATION vs our current mock `OcrMetrics` (CRITICAL for P6)
- Our P1 `OcrMetrics` invented names that DON'T exist in the real contract: `durationMinutes, avgPaceMinPerKm, avgSpeedKmh, startTimeISO, endTimeISO, cadence, vo2Max, deviceApp, language, unitSystem, rawText, schemaVersion`. → **Rename/realign `OcrMetrics` to the exact 25-key `OcrResult` above at P6.**
- GOOD: every field our BUSINESS LOGIC reads already MATCHES the real contract exactly — `activeCaloriesKcal, totalCaloriesKcal, activityType, activityDateISO, distanceKm, source, confidence`. So `calorieRule`, `backdateRule`, `dedupDateRule`, flex cards, and the `submissions` mapping keep working after the rename. Impact is contained to unused fields + the `ocrMock` fixture + `emptyOcrMetrics` + tests asserting the key set.
- **imageHash:** the API returns `imageHash` = `sha256:<hex>` of raw bytes. Our P3 `sha256Hex(blob)` computes the SAME sha256 of the SAME bytes (bare 64-hex, no prefix) BEFORE calling OCR (cost gate — must be pre-OCR to skip dup). → value is identical modulo the `sha256:` prefix; keep the LOCAL pre-OCR hash for the dedup pipeline (consistent end-to-end); the API `imageHash` is redundant for us (optionally store it, but dedup stays on local hash).
- **fetchTimeoutSeconds DECISION (flag for P6):** OVERVIEW locked `fetchTimeoutSeconds:10` (SLA p95 2–3 s). But upstream timeout is **25 s** (503). p99/worst-case could exceed 10 s → GAS aborts before the API. RECOMMEND raising to ~**30 s** to cover the upstream 25 s (LINE reply-token TTL ~60 s still comfortably covers it). Owner/decision at P6 — it's a latency/behaviour change. Either way: GAS timeout + 502/503 → error card "อ่านรูปไม่สำเร็จ ลองใหม่".

## Phase 6 ocrClient tasks (derived)
1. Realign `OcrMetrics` → 25-key `OcrResult`; update `ocrMock`/`emptyOcrMetrics` + key-set tests.
2. `ocrClient.recognize(blob)`: multipart POST to `{OCR_BASE_URL}/v1/ocr`, `Authorization: Bearer {OCR_TOKEN}`, field `image`, `fetchTimeoutSeconds` (10→30 decision), `muteHttpExceptions:true`; parse 200→OcrResult; map 400/401/413/422/502/503 + GAS-timeout → thrown/handled error → caller replies error card. Missing key in response → null (defensive), though contract guarantees all-present.
3. Contract test (`test/contract/ocr.contract.spec.ts`, real service): `GET /health`→200 `{status:'ok'}`; `POST /v1/ocr` with a sample image + real token → 25-key OcrResult shape. **hits real service — owner token required.**
4. Wiring flag mock↔real (router uses `ocrMock` today; swap to `ocrClient`).
5. Owner steps: mint `iss_live_` key at fit-ocr.web.app console → set `OCR_TOKEN` + `OCR_BASE_URL=https://fit-ocr.istartsoft.dev` in Script Properties.
