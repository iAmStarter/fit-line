# fit-webhook — LINE OA → Fit-OCR → Google Sheet

**Status:** Production — deployed via clasp to Google Apps Script (Web App)

## What is this?

A LINE Official Account webhook consumer (Google Apps Script + TypeScript) that:
- Receives fitness activity screenshots from users via LINE
- Calls Fit-OCR API to extract metrics (calories, activity type, date, distance, etc.)
- Validates against business rules (calorie ≥150 kcal, no backdate >1 day, no duplicate user+date)
- Records approved entries to a Google Sheet
- Replies with confirm/reject/success Flex cards and dispute tracking

**Core flow (confirm-based, 2 webhook events):**
1. Image event → verify LINE signature → download image → OCR → apply rules → send **confirm card** (if pass) or **reject card** (if fail)
2. User taps confirm → postback event → write Sheet → send **success card** with weekly/monthly summary + native bar chart

## Features

| Feature | Status | Notes |
|---------|--------|-------|
| Signature verify (LINE) | ✅ P0 | HMAC-SHA256, every request |
| OCR (real Fit-OCR API) | ✅ P6 | `https://fit-ocr.istartsoft.dev`, Bearer auth, multipart upload, 25-key response, 30s timeout |
| Calorie rule (≥150 kcal) | ✅ P1 | Fallback to `totalCaloriesKcal` if `activeCaloriesKcal` null |
| Confirm/reject Flex cards | ✅ P1–P2 | No emoji; semantic color (green/red/blue) + chip + text |
| Backdate rule (≤1 day) | ✅ P4 | Asia/Bangkok timezone, date-only (no time constraint) |
| Dedup (userId + activityDate) | ✅ P4 | Reject if same user + date already recorded |
| Anti-spam guards | ✅ P3 | SHA256 image hash (system-wide), per-user rate-limit (5/60s), messageId+LockService redelivery guard |
| Success summary | ✅ P5 | Week/month/total calories + bar chart (native Flex boxes, no external service) |
| Dispute log | ✅ P5 | Auto-offer "แจ้งแอดมิน" after 3 rejects on same activity, log to Sheet |
| Identity roster | ✅ P3 | Auto-register users on first message, manual edit by admin for HR mapping |
| Google Sheet integration | ✅ P2 | 2 tabs: `submissions` (records) + `employees` (roster) + `disputes` (P5) |
| Contract test (live) | ✅ P6 | 3 tests vs real Fit-OCR (health, 401, 400) |

## Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict mode) |
| Runtime | Google Apps Script (Web App, `doPost` entry) |
| Build/Deploy | clasp (`@google/clasp`) + tsc + Rollup |
| Test | Jest (unit, mocked GAS globals via DI) |
| Infra | GAS-managed (no external compute); Google Sheet (state); CacheService (stash) |
| Auth (inbound) | LINE signature verify (HMAC-SHA256) |
| Auth (outbound) | Bearer token (Fit-OCR), channel access token (LINE reply) |
| Datastore | Google Sheet (trial-phase) |
| UI | Flex cards (LINE Messaging API) |

## How to run

### Prerequisites
- Node.js 18+ (for tsc, Jest, clasp)
- Google Apps Script project (via [script.google.com](https://script.google.com))
- clasp linked (`clasp login` + `.clasp.json` configured)
- LINE Official Account with channel credentials (Channel ID, Access Token, Channel Secret)
- Fit-OCR token (Bearer `iss_live_…`, from fit-ocr.web.app)

### Local development

```bash
# Install dependencies
npm install

# Run tests (Jest)
npm test

# Build TypeScript + bundle
npm run build

# Deploy to GAS Web App (requires .clasp.json + clasp login)
npm run deploy
# or: clasp push
```

### Configuration (Google Apps Script Project Properties)

Set these in the Apps Script Editor (Project Settings → Script Properties):

```
LINE_CHANNEL_SECRET     = <your-channel-secret>
LINE_CHANNEL_ACCESS_TOKEN = <your-access-token>
LINE_WEBHOOK_URL        = https://script.google.com/macros/d/<DEPLOYMENT_ID>/usercontent/doPost
OCR_BASE_URL            = https://fit-ocr.istartsoft.dev
OCR_TOKEN               = iss_live_<your-token>
SHEET_ID                = <your-google-sheet-id>
```

**Do NOT commit these to git.** They are read at runtime from Script Properties.

### Manual test / webhook replay

See [docs/ENDPOINTS.md](docs/ENDPOINTS.md) for payload schemas and example curl commands.

For live testing, use LINE's [webhook test tool](https://developers.line.biz/en/services/line-bot-sdk/webhook-test-tool/) or replay a captured event JSON locally with Jest contract tests (see `test/`).

## Architecture highlights

- **Feature-based layout** (`src/line/`, `src/ocr/`, `src/rules/`, `src/sheet/`, etc.)
- **Config-driven recognizer** (`getRecognizer()` swaps real vs mock OCR based on Script Properties)
- **DI for GAS globals** (mock in Jest; inject real at runtime)
- **Short-circuit rule pipeline** (calorie → backdate → dedup; first fail rejects)
- **Stash-based confirm flow** (OCR result cached 10 min, consumed on postback)
- **No external UI dependencies** — Flex cards only, no external JavaScript/CSS, no emoji

## Testing

```bash
# Run all unit tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode (auto-rerun on file change)
npm test -- --watch

# Run only live-contract tests (requires OCR_TOKEN + OCR_BASE_URL in .env.test)
npm test -- --testPathPattern=live-contract
```

Current coverage: **253/253 tests green** (all phases P0–P7).

## Deployment

Owned by project owner (via clasp to GAS Web App). Once deployed:
1. Set the Apps Script Web App URL as the LINE webhook URL (Project Settings in [console.line.biz](https://console.line.biz))
2. Frame the Sheet ID in `SHEET_ID` property
3. Verify via LINE test tool (send a test image → confirm card should appear in chat)

For redeployment: `npm run build && npm run deploy` (or `clasp push`).

## Docs

- **[docs/OVERVIEW.md](docs/OVERVIEW.md)** — full requirements, architecture, data model, risks
- **[docs/ENDPOINTS.md](docs/ENDPOINTS.md)** — webhook payload schemas, error codes, examples
- **[docs/HISTORY.md](docs/HISTORY.md)** — phase completion timeline
- **[docs/research/impl-phase-6-ocr-contract.md](docs/research/impl-phase-6-ocr-contract.md)** — live Fit-OCR API reference (base URL, auth, endpoints, 25-key response schema)

## Known limitations / future work

- **pHash (perceptual image dedup)** — currently only SHA256 (byte-level); perceptual hashing for edited photos flagged as P3+ (imperfect). If needed later, evaluate algorithms + privacy trade-offs.
- **Scale beyond trial** — GAS concurrency + Sheet write limits suggest migration to Cloud Run + real DB (Firestore/Supabase) once rollout exceeds ~1000 users/day. Not blocking MVP.
- **Employee identity mapping** — v1 uses auto-register on first message. Real HR/roster integration (e.g., LDAP, Workday export) deferred to ops phase.

## Security

- ✅ LINE signature verification (every inbound request)
- ✅ Bearer token auth to Fit-OCR (never logged/committed)
- ✅ No image bytes stored (only sha256 hash + metadata in Sheet)
- ✅ TLS-only outbound (Fit-OCR, LINE APIs)
- ✅ SAST/SCA gated (SonarQube + npm audit; uuid risk triaged as ACCEPTED-RISK-P6)

See [docs/HISTORY.md](docs/HISTORY.md) § P6 for security review sign-off.

---

**Deployed:** 2026-07-04 (all phases P0–P7 complete)  
**Maintainer:** Theerasak Duangkaew
