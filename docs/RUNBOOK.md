# RUNBOOK — fit-webhook deploy + operations

The code is complete + green (253/253 jest, build OK). The steps below are **owner-only** (Google OAuth via clasp, LINE console, real device) — they cannot be automated from CI/Claude. Do them in order.

## 0. Prereqs
- Node installed; `npm ci` in the repo.
- `npm test` green, `npm run build` produces `dist/` (already verified).
- A Google account (the account the GAS Web App runs as) and the LINE **dev** channel.

## 1. Google Sheet (datastore)
Create one Google Sheet, then add these 4 tabs with EXACT header rows (col order matters — repo writes by header name):
- **submissions**: `messageId · userId · name · activityType · activityDateISO · submittedAtISO · activeCaloriesKcal · totalCaloriesKcal · distanceKm · source · confidence · status · rejectReason · imageHash`
- **employees**: `userId · name · registeredAtISO`
- **roster**: `userId · name`  (identity mapping source — populate with real names; misses fall back to `(ยังไม่ระบุชื่อ)`)
- **disputes**: `messageId · userId · activityType · reason · disputedAtISO`
Copy the Sheet ID from its URL → this is `SHEET_ID`.

## 2. clasp project
```
npx clasp login                 # owner Google OAuth (never commit .clasprc.json)
npx clasp create --type webapp  # OR: copy scriptId into .clasp.json (from .clasp.json.example)
```
`.clasp.json` (git-ignored) holds `scriptId`. `.clasp.json.example` is the template.

## 3. Script Properties (secrets — set in the Apps Script editor → Project Settings → Script Properties)
| key | value |
|---|---|
| `LINE_CHANNEL_SECRET` | from LINE dev console (channel secret) |
| `LINE_CHANNEL_ACCESS_TOKEN` | from LINE dev console (long-lived access token) |
| `OCR_BASE_URL` | `https://fit-ocr.istartsoft.dev` |
| `OCR_TOKEN` | `iss_live_…` from fit-ocr.web.app console → API keys |
| `SHEET_ID` | the Sheet ID from step 1 |
Secrets live ONLY here — never in code/git. (`getRecognizer()` auto-uses the real OCR once OCR_BASE_URL+OCR_TOKEN are present; without them it stays on the mock.)

> SECURITY: the OCR token was shared in chat during the build — **revoke it and mint a fresh one** in the fit-ocr console, then set that fresh value here.

## 4. Deploy the Web App
```
npm run build
npx clasp push
npx clasp deploy            # Web App: execute as ME, who has access = ANYONE
```
Copy the deployment **`/exec` URL** (the webhook endpoint).

## 5. Wire the LINE webhook
LINE dev console → Messaging API → Webhook URL = the `/exec` URL → **Verify** → **Use webhook = ON**. Disable auto-reply/greeting if you want the bot to own replies.

## 6. (optional) Rich-menu
From the Apps Script editor, run `registerRichMenu()` ONCE to create + upload + set the default rich-menu (needs a menu image; see src/line/richMenu.ts). Buttons: "วิธีส่งรูป" (help) · "สรุปของฉัน" (summary).

## 7. Smoke test (real device — the real gate)
1. Send a workout screenshot from LINE → expect a **confirm card** in < ~10s (activity/date/calories + ยืนยัน).
2. Tap **ยืนยัน** → a new row appears in `submissions` (status=recorded) + a **success card** with the week/month/total summary + bar chart.
3. Send a low-calorie image (< 150) → **reject card** with reason + cameraRoll quick-reply (no button).
4. Re-send the SAME image → "รูปนี้เคยส่งแล้ว" (dedup, OCR not called).
5. Flood > 5 images/min → "ส่งบ่อยเกินไป รอสักครู่" (rate-limit).
6. Rich-menu → "สรุปของฉัน" → summary card (no "บันทึกแล้ว").

## 8. Ops
- **Rotate OCR token**: revoke in fit-ocr console, mint new, update `OCR_TOKEN` Script Property.
- **Rollback**: `clasp deployments` → redeploy a previous version, or re-`clasp push` a known-good commit + redeploy.
- **Health of OCR**: `GET https://fit-ocr.istartsoft.dev/health` → `{"status":"ok"}` (no auth).
- **Trial→scale checkpoint** (OVERVIEW risk #3): GAS concurrency + Sheet write quota are the bottleneck at 1000+ users → migrate to Cloud Run/Node + a real DB (Firestore/Supabase) after trial. Reply-token stays free.
- **SCA note** (ISSUES.md): `uuid` HIGH is dev-only via `@google/clasp`, not in the deployed bundle — optional clasp 2→3 upgrade (breaking) at owner's discretion.
