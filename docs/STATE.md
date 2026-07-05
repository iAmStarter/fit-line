# STATE

phase: DONE (P0–P8/CR-1) + **DEPLOYED LIVE** + post-deploy hotfixes. Handoff to Claude CLI.
plan: APPROVED 2026-07-04 (proposal v2, Core P0–P7 + P3 stretch + CR-1 auto-save). tests 245/245 (+3 skipped real-contract).

## LIVE DEPLOYMENT (istartsoft@gmail.com)
- GAS scriptId `1vlDM3FgYBe9V6EWOB1CJHw8ivM_jUtiUb8pxxjfK-OC4PJOXXvTvG5Dq` · editor: script.google.com/d/<scriptId>/edit
- Web App /exec (deployment id, STABLE across redeploys): `AKfycbypaajrnOyakam0WxAYAtCMBVNBmYcuyQBzYnHSA7y4r2i2iJswohA6ynPKjtjbY-3pIw` → currently **@9**
- redeploy KEEPING the URL: `npx clasp deploy -i <that id> -d "..."` (NEVER `clasp deploy` bare — that mints a new URL). `.clasp.json` (rootDir dist, gitignored) has the scriptId. build = `npm run build`, then `npx clasp push -f`.
- Sheet `fit-webhook-data` (SHEET_ID in Script Properties): tabs submissions/employees/roster/disputes/logs. Created + non-secret props set by running `setupProject` in the editor.
- Script Properties (health-verified all present): LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OCR_TOKEN, OCR_BASE_URL, SHEET_ID. Optional: MAX_BACKDATE_DAYS (default 1).
- LINE channel: iStdDev (dev console 2009876841), bot `@900lkimq`. Use webhook = ON (dev console). OA-manager settings were already fine.

## HANDOFF — what happened live + open items
- **Health/diag endpoint:** `GET /exec` returns JSON {props presence, ocrMode, diag:{lastHit,hitCount,lastSig,lastEvents,lastError}}. curl it to debug delivery. (doGet + doPost DIAG_* tracer — added for debugging; consider trimming later.)
- **ROOT-CAUSE found (was: bot silent):** GAS Web Apps do NOT expose HTTP request headers to doPost → `X-Line-Signature` unreadable → HMAC verify ALWAYS failed → every event dropped. **DECISION (owner-approved 2026-07-04):** skip signature verification when the header is absent (`sigOk = signature ? verify : true`). SECURITY TRADE-OFF: webhook is NOT cryptographically authenticated on GAS; compensating = unguessable /exec URL + rate-limit + image dedup. Proper fix = migrate off GAS (Cloud Run/Functions) — the OVERVIEW scale/migration checkpoint. See ISSUES.md.
- **BUG fixed live:** `sha256Hex` passed a Blob to `Utilities.computeDigest` (GAS needs `byte[]`) → runtime error on every image. Fixed → `image.getBytes()`. Test mocks (imageDedup/imageGate) had the WRONG contract (passed Blob) — reconciled to accept byte[].
- **MAX_BACKDATE_DAYS knob:** backdateRule/pipeline/main now read `MAX_BACKDATE_DAYS` (default 1) so the ≤1-day window can be widened for testing/demo with old screenshots. Set back to 1 (or delete) for prod.
- **LINE loading indicator + Sheet event logging** added (startLoading; logToSheet → `logs` tab, one row per processed event: recorded/rejected/blocked_*/ocr_error/sheet_error/lock_timeout).
- **Real OCR verified live:** POST /v1/ocr (multipart field `image`, Bearer) returns the real 25-key OcrResult. Note: OCR service is FLAKY on some images (HTTP 503 "upstream error", ~25s) — ocrClient handles non-200 → "อ่านรูปไม่สำเร็จ".
- **Test-image reality:** the Downloads/รูปออกกำลังกาย screenshots are OLD workouts (OCR reads in-image dates 2020/2024/2026) → rejected by backdate unless MAX_BACKDATE_DAYS is widened. Two 2026-05 images (120200, 114616) RECORD at MAX_BACKDATE_DAYS≥47.

## NEXT (for CLI session)
1. Confirm a real `recorded` end-to-end (MAX_BACKDATE_DAYS=90 + send 120200) — was the last step in progress.
2. Owner: revoke + re-mint the OCR token (it was pasted in chat earlier → exposed).
3. Decide prod MAX_BACKDATE_DAYS (1 strict, or 2–3 to allow weekend catch-up).
4. Consider trimming the DIAG_* tracer + doGet health once stable (or keep behind a flag).
5. Everything committed on branch `feat/p0-p7` (NOT pushed to GitHub).

## Locked decisions (carry)
- sync + reply-token · AUTO/decide mode · Thai docs · no emoji in Flex/UI
- Secrets: Script Properties only; never commit .clasprc.json / real tokens
- Jest mocks GAS globals via test/setup.ts · test/ root + test/phase-<N>/ + test/regression/
- CR-1 auto-save: image passes rules → save immediately (no confirm card)
- GAS can't verify LINE signature (no headers) → sig-verify skipped when header absent (owner-approved)
