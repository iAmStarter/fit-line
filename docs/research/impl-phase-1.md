# Implementation Research: Phase 1 (Image → OCR(mock) → Calorie Rule → Confirm/Reject Card)

> [SUPERSEDED — see shipped artifacts in src/phase-1/ + test/phase-1/; STATE.md carries current surfaces]

**Date:** 2026-07-04  
**Mode:** IMPL (per-phase implementation)  
**Scope:** Gather facts the implementer + test-author need for Phase 1; no guessing.

---

## 1. LINE getContent (Download Image)

**Endpoint:**
```
GET https://api-data.line.me/v2/bot/message/{messageId}/content
```

**Authentication:**
- Header: `Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}`

**UrlFetchApp Call Signature (GAS):**
```typescript
const response = UrlFetchApp.fetch(
  `https://api-data.line.me/v2/bot/message/${messageId}/content`,
  {
    method: 'get',
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
    },
    fetchTimeoutSeconds: 10,
  }
);
const imageBlob = response.getBlob();
const bytes: number[] = imageBlob.getBytes(); // signed byte[] (-128..127)
```

**Returns:**
- `response.getBlob()` — Blob object (with MIME type auto-detected as `image/jpeg` etc.)
- Blob has `.getBytes()` method → signed byte array (GAS convention)

**Size Limit:**
- Max 2 MB per request (researched constraint).

**Availability Window:**
- Not officially documented; assume 24–48 hours.
- **Phase 1 action:** Download immediately upon webhook receipt (don't queue).

**Rate Limit:**
- General webhook rate: ~1000 req/min; getContent specific limit not documented.

---

## 2. LINE Reply API (Send Flex Message)

**Endpoint:**
```
POST https://api.line.me/v2/bot/message/reply
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}
```

**Request Body Schema:**
```json
{
  "replyToken": "...",
  "messages": [
    {
      "type": "flex",
      "altText": "Fallback text if Flex unsupported",
      "contents": {
        "type": "bubble",
        "body": { ... }
      }
    }
  ]
}
```

**Reply Token Properties:**
- Single-use (can call once per token).
- Validity: Official docs do NOT specify TTL; community suggests ~10 sec; Phase 1 uses it immediately.
- TTL sufficient for synchronous doPost → reply path (within 10 sec).

**Flex Bubble Minimum Schema:**
```json
{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      { "type": "text", "text": "..." }
    ]
  }
}
```

**Optional Blocks:**
- `header` (optional)
- `hero` (optional, image)
- `body` (required, box containing components)
- `footer` (optional)

**Bubble Size Limit:**
- Max 10 KB JSON per bubble.
- Phase 1 confirm/reject cards easily fit (<1 KB).

**UrlFetchApp Call (Phase 1):**
```typescript
const options = {
  method: 'post',
  contentType: 'application/json',
  headers: {
    Authorization: `Bearer ${lineAccessToken}`,
  },
  payload: JSON.stringify({
    replyToken: replyToken,
    messages: [
      {
        type: 'flex',
        altText: 'Confirm or Reject',
        contents: {
          type: 'bubble',
          body: { /* flex box contents */ }
        }
      }
    ]
  }),
  fetchTimeoutSeconds: 10,
};
const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', options);
```

---

## 3. Flex Message — Confirm/Reject Card Shapes

### Confirm Card (Pass Case)
**Purpose:** User sees OCR result + button to confirm + option to send new photo.

**JSON Structure Example:**
```json
{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "Recorded",
            "color": "#2f6fed",
            "weight": "bold",
            "size": "sm"
          }
        ],
        "paddingAll": "8px",
        "cornerRadius": "4px",
        "backgroundColor": "#e8f0ff"
      },
      {
        "type": "spacer",
        "size": "md"
      },
      {
        "type": "text",
        "text": "Activity: Running",
        "weight": "bold",
        "size": "md"
      },
      {
        "type": "text",
        "text": "Date: 2026-07-04",
        "size": "sm",
        "color": "#999999"
      },
      {
        "type": "text",
        "text": "Calories: 200 kcal",
        "size": "md",
        "weight": "bold",
        "color": "#2f6fed"
      },
      {
        "type": "spacer",
        "size": "lg"
      },
      {
        "type": "button",
        "action": {
          "type": "postback",
          "label": "Confirm",
          "data": "action=confirm&id=abc123"
        },
        "style": "primary",
        "color": "#2f6fed"
      }
    ]
  }
}
```

**Key Fields:**
- Status chip: box with semantic color `#2f6fed` (info/confirm blue) + label "Recorded".
- Text fields: activity, date, calories (no emoji).
- Postback button: `data` field compact (see postback below).
- Fallback quick-reply: "Send new photo" as quick reply cameraRoll (not in Flex).

### Reject Card (Fail Case)
**Purpose:** Show why rejected; no buttons in card; offer quick-reply to send new photo.

**JSON Structure Example:**
```json
{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "Rejected",
            "color": "#ffffff",
            "weight": "bold",
            "size": "sm"
          }
        ],
        "paddingAll": "8px",
        "cornerRadius": "4px",
        "backgroundColor": "#d64545"
      },
      {
        "type": "spacer",
        "size": "md"
      },
      {
        "type": "text",
        "text": "Calories: 100 kcal",
        "size": "md"
      },
      {
        "type": "text",
        "text": "Reason: Calories below 150 kcal threshold",
        "size": "sm",
        "color": "#d64545",
        "wrap": true
      }
    ]
  }
}
```

**Key Fields:**
- Status chip: semantic error color `#d64545` (red) + label "Rejected".
- OCR values displayed (activeCaloriesKcal, totalCaloriesKcal).
- Reject reason (1 line, no buttons).
- **NO button in card** (ht button ยังไม่มี — quick-reply handles "send new photo").

**With Message-Level Quick Reply:**
```json
{
  "type": "flex",
  "altText": "Rejected",
  "contents": { /* bubble above */ },
  "quickReply": {
    "items": [
      {
        "type": "action",
        "action": {
          "type": "cameraRoll",
          "label": "Send new photo"
        }
      }
    ]
  }
}
```

---

## 4. Postback Action Data Format

**Postback Action Structure (inside Flex button):**
```json
{
  "type": "postback",
  "label": "Confirm",
  "data": "action=confirm&id=abc123"
}
```

**Data Field:**
- **Maximum Length:** 300 characters (LINE limit).
- **Format (Phase 1):** Query string format (`key=value&key2=value2`).
- **Phase 1 Compact Format:** `action=confirm&id=<shortId>` (~30 chars, well under limit).

**Example Postback Webhook Event (received by doPost when user taps button):**
```json
{
  "type": "postback",
  "replyToken": "...",
  "source": { "userId": "U..." },
  "timestamp": 1234567890000,
  "postbackData": {
    "data": "action=confirm&id=abc123"
  }
}
```

**Parsing (Phase 2):**
```typescript
const data = postbackData.data; // "action=confirm&id=abc123"
const params = new URLSearchParams(data);
const action = params.get('action'); // "confirm"
const id = params.get('id'); // "abc123"
```

---

## 5. CacheService (Multi-Turn State Stash)

**API:**
```typescript
const cache = CacheService.getScriptCache();
cache.put(key, value, ttlSeconds);
const value = cache.get(key); // null if expired/missing
cache.remove(key);
```

**Constraints (Researched — Phase 0):**
- **Value must be string** (no objects; use `JSON.stringify`).
- **Max TTL:** 600 seconds (10 minutes).
- **Key scope:** Script level (not user-specific).

**Phase 1 Usage:**
```typescript
// After OCR success + calorie rule pass:
const shortId = generateShortId(); // e.g., "abc123" (6 chars)
const ocrResult = { activeCaloriesKcal: 200, totalCaloriesKcal: 250, ... };
cache.put(`ocr:${shortId}`, JSON.stringify(ocrResult), 600); // 10 min TTL

// Stashed in postback data:
// "action=confirm&id=abc123"

// Phase 2 retrieves it:
const cached = cache.get(`ocr:abc123`);
const ocrResult = cached ? JSON.parse(cached) : null;
```

---

## 6. OcrMetrics 25-Key Contract (Phase 1 Knowledge)

**Source:** PLAN.md §5 + research design docs (OVERVIEW §5 + design-line-messaging-api.md).

**What Phase 1 Needs to Know:**
- OVERVIEW §5 lists the key fields that go into Sheet `submissions` tab:
  - `messageId` (LINE event ID — dedup key)
  - `userId` (LINE user ID)
  - `name` (placeholder/employee name)
  - `activityType` (e.g., "Running", from OCR)
  - `activityDateISO` (e.g., "2026-07-04", from OCR)
  - `submittedAtISO` (server timestamp when received)
  - `activeCaloriesKcal` (OCR result)
  - `totalCaloriesKcal` (OCR result, fallback for rule)
  - `distanceKm` (OCR result)
  - `source` (e.g., "fitocr-api", from OCR)
  - `confidence` (OCR confidence score, from OCR)
  - `status` (recorded/rejected)
  - `rejectReason` (if rejected)
  - `imageHash` (sha256 hex, Phase 3+)

**Phase 1 Specifics:**
- ocrMock returns a **25-key JSON** object (matching ocrClient contract).
- Phase 1 rule uses: `activeCaloriesKcal`, `totalCaloriesKcal`, `activityType`, `activityDateISO`.
- Phase 1 does NOT write to Sheet (that's Phase 2); only caches OCR result.
- Phase 1 rule: `activeCaloriesKcal ≥ 150` OR (fallback) `totalCaloriesKcal ≥ 150`.

**Full Interface (to implement ocrMock against):**
```typescript
export interface OcrMetrics {
  activeCaloriesKcal: number | null;
  totalCaloriesKcal: number | null;
  activityType: string | null;
  activityDateISO: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  source: string;
  confidence: number;
  // ... 17 more fields (not listed here; Phase 6 real OCR contract defines all 25)
}
```

---

## 7. Test Harness (test/setup.ts Existing State)

**Already Mocked (Phase 0 complete):**
- `Utilities` (crypto, encoding) ✓
- `PropertiesService` ✓
- `UrlFetchApp` (basic) ✓
- `CacheService` (stubbed) ✓
- `SpreadsheetApp` (stubbed) ✓
- `LockService` (stubbed) ✓
- `ContentService` ✓
- `Logger` ✓

**What Phase 1 Must Add/Enhance:**
1. **UrlFetchApp.fetch** — getContent call returns Blob with `.getBlob()` method.
   - Already stubbed to return `{ getBlob: () => ({ getBytes: () => [] }) }`.
   - Phase 1 tests override the stub to return real image bytes or mock bytes as needed.

2. **CacheService.getScriptCache()** — put/get with TTL.
   - Already stubbed; override `put(key, value, ttlSec)` and `get(key)`.
   - Test harness should track `ttlSec` to simulate expiry (optional, but helpful for timeout tests).

**Example Test Override (Phase 1):**
```typescript
beforeEach(() => {
  const mockCache = new Map<string, { value: string; expiresAt: number }>();
  const now = Date.now();

  (globalThis as any).CacheService.getScriptCache = jest.fn(() => ({
    put: jest.fn((key: string, value: string, ttlSec: number) => {
      mockCache.set(key, { value, expiresAt: now + ttlSec * 1000 });
    }),
    get: jest.fn((key: string): string | null => {
      const entry = mockCache.get(key);
      if (!entry) return null;
      if (entry.expiresAt < now) {
        mockCache.delete(key);
        return null;
      }
      return entry.value;
    }),
    remove: jest.fn((key: string) => {
      mockCache.delete(key);
    }),
  }));
});
```

---

## 8. doPost Router Hook (Current Code Structure)

**Current doPost (src/main.ts):**
- Verifies signature → valid? Log + continue. Invalid? Log + ignore.
- **Phase 0 skeleton:** Logs "routing arrives Phase 1" after valid signature.
- **Never throws:** Always returns `ContentService.createTextOutput('OK')`.

**Phase 1 Hookup (rough outline):**
```typescript
if (verifySignature(body, signature, channelSecret)) {
  const event = JSON.parse(body);
  
  // Route based on event.events[0].type
  if (event.events?.[0]?.type === 'message' && event.events[0].message?.type === 'image') {
    // Phase 1: image handler
    handleImageMessage(event);
  } else if (event.events?.[0]?.type === 'postback') {
    // Phase 2: postback handler
    handlePostback(event);
  } else {
    // Phase 1: other message types (text, sticker) → graceful ignore
    Logger.log('Unsupported event type; ignoring.');
  }
}
```

**Phase 1 Handler Skeleton:**
```typescript
function handleImageMessage(event: LineWebhookEvent): void {
  const message = event.events[0].message;
  const replyToken = event.events[0].replyToken;
  const messageId = message.id;
  const userId = event.events[0].source.userId;

  try {
    // 1. getContent from LINE
    const imageBlob = getContent(messageId);
    
    // 2. Call ocrMock
    const ocrResult = await ocrMock.recognize(imageBlob);
    
    // 3. Apply calorie rule
    const { pass, reason } = calorieRule(ocrResult);
    
    if (pass) {
      // 4a. Cache + confirm card
      const shortId = generateShortId();
      cache.put(`ocr:${shortId}`, JSON.stringify(ocrResult), 600);
      replyConfirmCard(replyToken, ocrResult, shortId);
    } else {
      // 4b. Reject card (no cache)
      replyRejectCard(replyToken, ocrResult, reason);
    }
  } catch (err) {
    Logger.log(`Image handler error: ${err}`);
    replyErrorCard(replyToken, 'Failed to process image');
  }
}
```

---

## 9. Known Unknowns / Blockers for Phase 1

| Item | Status | Impact |
|---|---|---|
| **OcrMock 25-key interface** | CONFIRMED (OVERVIEW §5) | Phase 1 implements mock; shape locked. No blocker. |
| **LINE reply token TTL exact** | NOT DOCUMENTED | Phase 1 uses token immediately (safe). No blocker. |
| **getContent availability window** | NOT DOCUMENTED | Phase 1 calls immediately (safe). No blocker. |
| **Postback data 300-char limit** | CONFIRMED | Compact format `action=confirm&id=abc123` fits. No blocker. |
| **Flex bubble size limit** | CONFIRMED (10 KB) | Phase 1 cards << 1 KB. No blocker. |
| **CacheService TTL max 600s** | CONFIRMED | 10 min sufficient for image→postback flow. No blocker. |
| **Signature verify path** | CONFIRMED (Phase 0) | Already wired. No blocker. |
| **UrlFetchApp blob bytes** | CONFIRMED (signed -128..127) | gasCrypto + test harness handle it. No blocker. |

---

## 10. Acceptance Tests (Phase 1 RED-first)

**Per PLAN §43–59 (acceptance criteria):**

### Test 1: Image → Pass Calorie Rule → Confirm Card
```
GIVEN ocrMock returns activeCaloriesKcal=200
WHEN processImageMessage(event)
THEN:
  - replyToken called with Flex message type:flex
  - Flex bubble contains "Recorded" (info blue #2f6fed)
  - Text field "Calories: 200 kcal"
  - Button "Confirm" with postback data="action=confirm&id=<id>"
  - CacheService.put called with ttl=600
  - Cache entry matches ocrMock output (JSON stringified)
```

### Test 2: Image → Fail Calorie Rule (activeCaloriesKcal=100, totalCaloriesKcal=140) → Reject Card
```
GIVEN ocrMock returns activeCaloriesKcal=100, totalCaloriesKcal=140
WHEN processImageMessage(event)
THEN:
  - replyToken called with Flex message type:flex
  - Flex bubble contains "Rejected" (error red #d64545)
  - Text shows "Calories: 100 kcal" + reason "Calories below 150 kcal threshold"
  - Flex contains quickReply.items[0].action.type="cameraRoll"
  - NO button in card (button count = 0)
  - CacheService.put NOT called (no cache stash on reject)
```

### Test 3: Fallback activeCaloriesKcal=null, totalCaloriesKcal=160 → Pass
```
GIVEN activeCaloriesKcal=null, totalCaloriesKcal=160
WHEN processImageMessage(event)
THEN rule passes (total ≥ 150); confirm card sent; cache stashed.
```

### Test 4: OCR Error / Timeout → Error Card (graceful)
```
GIVEN ocrMock.recognize throws Error("OCR timeout")
WHEN processImageMessage(event)
THEN:
  - doPost returns 200 (never crashes)
  - Error card sent (generic "Failed to read image")
  - CacheService.put NOT called
  - doPost completes without throw
```

### Test 5: Unsupported Message Type (text, sticker) → Graceful Ignore
```
GIVEN event.message.type="text"
WHEN processImageMessage(event) called (or router called)
THEN:
  - No replyToken call (or generic trigger message)
  - doPost returns 200
  - CacheService untouched
```

---

## 11. Implementation Sequence (Phase 1)

1. **Define types** (`src/types/ocrMetrics.ts`) — OcrMetrics interface (25-key, nullable fields).
2. **Implement ocrMock** (`src/ocr/ocrMock.ts`) — stub returning OcrMetrics with default/test data.
3. **Implement calorieRule** (`src/rules/calorieRule.ts`) — pure function (OcrMetrics) → { pass, reason }.
4. **Implement cacheStore** (`src/state/cacheStore.ts`) — wrapper around CacheService (put/get, key naming).
5. **Implement Flex builders** (`src/line/flex/confirm.ts`, `reject.ts`) — functions returning Flex bubble JSON (no emoji).
6. **Implement lineClient** (`src/line/lineClient.ts`) — getContent, reply methods.
7. **Update router** (`src/main.ts`) — hook image event handler (call step 1–6).
8. **Write tests** (RED-first) — mocked CacheService, UrlFetchApp, Flex JSON assertions.
9. **Deploy Phase 0 scaffold** (if not already) + verify doPost returns 200.

---

## Sources

- [LINE Messaging API Reference](https://developers.line.biz/en/reference/messaging-api/)
- [Send Flex Messages | LINE Developers](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [Use Quick Replies | LINE Developers](https://developers.line.biz/en/docs/messaging-api/using-quick-reply/)
- [Flex Message Elements | LINE Developers](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)
- [Send Messages | LINE Developers](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [Actions | LINE Developers](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Multipart-POST Request Using Google Apps Script](https://gist.github.com/tanaikech/d595d30a592979bbf0c692d1193d260c)
- [Class UrlFetchApp | Google Apps Script](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
