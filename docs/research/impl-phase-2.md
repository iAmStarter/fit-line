# IMPL Research — Phase 2: postback → Sheet write → success card

> [SUPERSEDED — see shipped artifacts in src/phase-2/ + test/phase-2/; STATE.md carries current surfaces]

**Date:** 2026-07-04  
**Phase:** 2 (write path)  
**Status:** SHIPPED — P2 complete

---

## Executive Summary

Phase 2 is the postback confirmation path: user presses **ยืนยัน** → retrieve OCR from stash → write submission row + register employee → success card. Key interface question resolved: **Phase 1 does NOT stash messageId** — it must be passed as postback context or generated fresh per the acceptance criteria. This doc provides exact API contracts and schema for the implementer.

---

## 1. Postback Event Shape & Parsing

**LINE webhook postback event:**

```typescript
{
  type: 'postback',
  replyToken: string,
  source: { userId: string, ... },
  postback: { data: string, ... }
}
```

**Postback `data` format (Phase 1 confirm card embeds this):**
- Format: `action=confirm&id=<shortId>` (compact, ≤300 chars per PLAN)
- `shortId`: the cache id returned by `stashOcr()` (7–10 chars, base-36 alphanumeric)

**Line.Source.userId:**
- String, user-specific LINE identifier
- Must be extracted as-is from `event.source.userId`
- Used for employee registration + dedup in later phases

**replyToken:**
- One-time reply token (same as image-event)
- TTL ~1 min (>> any processing latency); use immediately

---

## 2. Cache Retrieval & Stash Contract

**Current interface (Phase 1, `src/state/cacheStore.ts`):**

```typescript
export function stashOcr(result: OcrMetrics): string
export function retrieveOcr(id: string): OcrMetrics | null
export const OCR_STASH_TTL_SECONDS = 600
```

**What Phase 1 stashed:**
- `OcrMetrics` object (25-key, all fields from `src/types/ocrMetrics.ts`)
- **NOT including messageId** (identified only at image-event time; must be generated fresh in Phase 2 or fallback)
- Key prefix: `ocr:<id>` (scoped under CacheService)

**Phase 2 adds (blocking detail):**
- `deleteOcr(id: string): void` — must be added to cacheStore exports for idempotent consume (not yet exists)
- Behavior: `CacheService.getScriptCache().remove(key)` after successful Sheet write

**Cache miss:** `retrieveOcr(id)` returns `null` when entry missing or expired.

---

## 3. SpreadsheetApp API — Exact Contract

**Opening the sheet by ID:**

```typescript
const sheet = SpreadsheetApp.openById(SHEET_ID);
const submissionsTab = sheet.getSheetByName('submissions');
const employeesTab = sheet.getSheetByName('employees');
```

**Appending a row:**

```typescript
submissionsTab.appendRow([val0, val1, val2, ...]);  // appends to next available row
```

**Reading data (headers + rows):**

```typescript
const dataRange = submissionsTab.getDataRange();
const allValues = dataRange.getValues();  // 2D array: [ [row0], [row1], ... ]
// Row 0 = headers; row 1+ = data
const headers = allValues[0];  // [colName0, colName1, ...]
```

**Mapping by column name (Phase 2 requirement — "write by column name"):**

```typescript
function appendRowByColumns(sheet, headerRow, valuesByName) {
  const headerIndex = {};
  headerRow.forEach((name, idx) => {
    headerIndex[name] = idx;
  });
  const rowArray = new Array(headerRow.length).fill('');
  Object.entries(valuesByName).forEach(([name, value]) => {
    if (name in headerIndex) {
      rowArray[headerIndex[name]] = value;
    }
  });
  sheet.appendRow(rowArray);
}
```

**Null handling in cells:**
- Pass empty string `''` (not `null`, not `'null'`)
- Sheet will render as blank cell

---

## 4. Submissions Tab Schema (OVERVIEW §5)

**Column order (in execution order for appendRow):**

1. `messageId` (string, dedup key; **Phase 2 must generate or stash it from Phase 1**)
2. `userId` (string, from postback source.userId)
3. `name` (string, placeholder v1 — "ส่งรูป" or similar)
4. `activityType` (string | null, from OCR)
5. `activityDateISO` (string, ISO YYYY-MM-DD, from OCR)
6. `submittedAtISO` (string, now in ISO)
7. `activeCaloriesKcal` (number | null)
8. `totalCaloriesKcal` (number | null)
9. `distanceKm` (number | null)
10. `source` (string, from OCR — usually "mock" in Phase 2, "fitocr-api" later)
11. `confidence` (number 0–1, from OCR)
12. `status` (string, **phase 2 value: "recorded"**)
13. `rejectReason` (string | empty, **phase 2 value: empty**)
14. `imageHash` (string | empty, **phase 2 value: empty** — populated Phase 3)

**Total: 14 columns.**

**Acceptance criterion detail:**
> GIVEN cacheStore มี stash id `abc` (OCR active=200, activityDate=today) WHEN postback `action=confirm&id=abc` THEN row ใหม่ append ลง `submissions` มี `messageId`, `userId`, `activeCaloriesKcal=200`, `status=recorded`

---

## 5. messageId Interface Question (BLOCKING CLARIFICATION)

**Current state:**
- Phase 1 extracts `messageId = event.message?.id` but **does NOT stash it**
- messageId is only used to download image content immediately
- Postback events do NOT carry a message.id — only postback data

**Two options for Phase 2:**

**Option A (Recommended per PLAN):** Stash messageId alongside OcrMetrics
- Phase 1 change: `stashOcr(metrics, messageId)` or create composite object
- Phase 2 retrieves both from stash
- Pro: idempotent dedup possible (Phase 3); respects PLAN risk #4
- Con: Phase 1 refactor (minor)

**Option B:** Generate messageId fresh in Phase 2
- Use `Utilities.getUuid()` (GAS built-in)
- Con: loses original LINE messageId lineage (security: repudiation risk)

**Fact:** PLAN §6 line 97 says `dedup ระดับ event ใช้ messageId + LockService` (Phase 3), implying messageId must be durable across phases. **Option A is required by the PLAN.**

---

## 6. Employees Tab Schema (OVERVIEW §5)

**Column order:**

1. `userId` (string, from postback)
2. `name` (string, placeholder v1 "ส่งรูป" or user's LINE display name if available)
3. `registeredAtISO` (string, now in ISO)

**Total: 3 columns.**

**Upsert logic (Phase 2 Phase 2):**

```typescript
function ensureEmployee(sheet, userId, nameV1) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Scan rows 1+ (row 0 = header) for existing userId
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === userId) {
      // Already exists; do NOT append again
      return;
    }
  }
  
  // Not found; append new row
  const now = new Date().toISOString();
  sheet.appendRow([userId, nameV1, now]);
}
```

---

## 7. Timestamps: ISO Format in Google Apps Script

**Current date/time as ISO:**

```typescript
const now = new Date().toISOString();
// Returns: "2026-07-04T14:30:45.123Z" (UTC)
```

**GAS behavior:**
- `new Date()` produces a JavaScript Date (UTC-based)
- `.toISOString()` returns the RFC 3339 string (YYYY-MM-DDTHH:MM:SS.sssZ)
- Timezone context: submittedAt is an instant (OK as UTC); activityDate is date-only (no time), drawn from OCR

**Note:** PLAN Phase 4 validates activityDate against "today" (Asia/Bangkok time); Phase 2 just stores the ISO string from OCR as-is (validation deferred).

---

## 8. Idempotency & Stash Deletion

**Double-confirm guard (PLAN line 70):**

> postback ซ้ำ (กดยืนยัน 2 ครั้ง, id เดิม, stash ถูก consume/หมด) → ไม่เขียน row ซ้ำ (idempotent-ish: หลัง consume ลบ stash)

**Implementation:**

```typescript
export function handlePostback(event: LineWebhookEvent): void {
  const id = parsePostbackId(event.postback?.data);
  const metrics = retrieveOcr(id);
  
  if (metrics === null) {
    // Stash miss/expired
    reply(event.replyToken, [buildExpiredCard()]);
    return;
  }
  
  try {
    // Write submissions + employees
    sheetRepo.appendSubmission(/*...*/);
    sheetRepo.ensureEmployee(/*...*/);
    
    // DELETE stash AFTER successful write (guards double-confirm)
    deleteOcr(id);  // NEW function (add to cacheStore.ts)
    
    reply(event.replyToken, [buildSuccessCard(/*...*/)]); 
  } catch (err) {
    // Sheet write failed; do NOT delete stash (allow retry)
    reply(event.replyToken, [buildErrorCard('บันทึกไม่สำเร็จ ลองใหม่')]);
  }
}
```

**Key detail:** Stash is deleted ONLY after Sheet write succeeds. If the write throws, stash remains intact and a retry with the same id will attempt again (graceful fallback, no double-write).

---

## 9. Success Flex Card (no emoji, green #1e9e57)

**UI constraints (PLAN §4 + rule 9):**
- NO emoji codepoints anywhere in JSON
- Semantic success color: `#1e9e57` (green)
- Status chip: CSS glyph `[✓]` (ASCII, not emoji) + label + color
- Show: "บันทึกแล้ว" + calorie value (same as confirm card: prefer active, else total)
- No quick reply (different from reject card)

**Minimal structure:**

```typescript
export function buildSuccessCard(metrics: OcrMetrics): object {
  const calorie = metrics.activeCaloriesKcal ?? metrics.totalCaloriesKcal ?? '-';
  
  return {
    type: 'flex',
    altText: `บันทึกแล้ว: ${calorie} kcal`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            paddingAll: '8px',
            cornerRadius: '4px',
            backgroundColor: '#e5f7f0',  // light green tint
            contents: [
              {
                type: 'text',
                text: '[✓]',
                color: '#1e9e57',
                weight: 'bold',
                size: 'sm',
                flex: 0,
              },
              {
                type: 'text',
                text: 'บันทึกแล้ว',
                color: '#1e9e57',
                weight: 'bold',
                size: 'sm',
              },
            ],
          },
          {
            type: 'text',
            text: `แคลอรี่: ${calorie} kcal`,
            size: 'md',
            weight: 'bold',
            color: '#1e9e57',
          },
        ],
      },
    },
  };
}
```

---

## 10. Stash-Miss Error Card

**Condition:** `retrieveOcr(id)` returns `null`.

**Behavior (PLAN line 70):** reply "หมดเวลา ส่งรูปใหม่" + quick-reply cameraRoll.

```typescript
export function buildExpiredCard(): object {
  return {
    type: 'flex',
    altText: 'หมดเวลา ส่งรูปใหม่',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'หมดเวลา ส่งรูปใหม่',
            color: '#d64545',
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'cameraRoll', label: 'ส่งรูปใหม่' },
        },
      ],
    },
  };
}
```

---

## 11. Sheet-Write Error Card

**Condition:** `SpreadsheetApp.openById()` or `.appendRow()` throws.

**Behavior (PLAN line 71):** reply "บันทึกไม่สำเร็จ ลองใหม่" (no quick reply, no stash deletion).

```typescript
export function buildSheetErrorCard(): object {
  return {
    type: 'flex',
    altText: 'บันทึกไม่สำเร็จ ลองใหม่',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'บันทึกไม่สำเร็จ ลองใหม่',
            color: '#d64545',
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
  };
}
```

---

## 12. Postback Router Integration (src/main.ts)

**Current dispatch (lines 151–155):**

```typescript
if (event.type === 'postback') {
  // Phase 2 fills the postback branch; ignore gracefully for now.
  Logger.log('routeWebhook: postback event — handled in Phase 2.');
  return;
}
```

**Phase 2 must replace with:**

```typescript
if (event.type === 'postback') {
  handlePostback(event);
  return;
}
```

**Handler stub location:** `src/main.ts` (same file) or extracted to separate module (implementer chooses; recommend same file for Phase 2 simplicity).

---

## 13. Test Harness — SpreadsheetApp Mocks

**Current mocks (test/setup.ts, lines 80–96):**

```typescript
g.SpreadsheetApp = {
  openById: jest.fn(() => ({
    getSheetByName: jest.fn(() => ({
      appendRow: jest.fn(),
      getRange: jest.fn(() => ({
        getValues: jest.fn((): unknown[][] => []),
        setValues: jest.fn(),
        setValue: jest.fn(),
      })),
      getDataRange: jest.fn(() => ({
        getValues: jest.fn((): unknown[][] => []),
      })),
      getLastRow: jest.fn((): number => 0),
    })),
  })),
};
```

**Already sufficient for Phase 2:**
- `openById(sheetId)` → mock sheet object ✓
- `.getSheetByName(tabName)` → mock tab ✓
- `.appendRow(values)` → spy-able ✓
- `.getDataRange().getValues()` → 2D array mock ✓

**Test-author note:** Phase 2 tests can override `getDataRange().getValues()` to return a realistic header row + employee rows for the upsert test case:

```typescript
beforeEach(() => {
  const mockSheet = {
    getDataRange: jest.fn(() => ({
      getValues: jest.fn(() => [
        ['userId', 'name', 'registeredAtISO'],  // header
        ['U1', 'Alice', '2026-06-30T10:00:00Z'],
      ]),
    })),
    appendRow: jest.fn(),
  };
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName) => {
      if (tabName === 'employees') return mockSheet;
      // ... etc
    }),
  });
});
```

---

## 14. CacheService.remove() Mock

**Current cacheStore test (test/phase-1/cacheStore.spec.ts):**

Already installs a stateful mock with `.remove()` support (line 50–51):

```typescript
remove: jest.fn((key: string): void => {
  store.delete(key);
}),
```

**Phase 2 test-author action:** Reuse the same mock fixture; when testing `deleteOcr(id)`, assert that the key is gone:

```typescript
const id = stashOcr(makeOcrMetrics());
deleteOcr(id);
expect(retrieveOcr(id)).toBeNull();  // Verify key deleted
```

---

## 15. Configuration & Secrets

**SHEET_ID (Phase 0 set up):**
- Stored in Script Properties (key: `SHEET_ID`)
- Retrieved via `getProp(PROP_KEYS.SHEET_ID)`
- Must be valid GAS Sheet ID (accessible by the deployed script)

**Sheet tabs must exist:**
- `submissions` (headers as per §4)
- `employees` (headers as per §6)

**Error if tabs missing:**
- `.getSheetByName('submissions')` returns `null` if tab does not exist
- Phase 2 must validate at boot or handle `.appendRow()` error gracefully

---

## 16. Open Questions / Unknowns

1. **messageId stashing (BLOCKING):** See §5. Requires confirmation whether Phase 1 will be refactored to stash messageId or Phase 2 generates one. **RECOMMENDATION: Option A (stash messageId in Phase 1).**

2. **Employee name v1 placeholder:** Should be user's LINE display name if available from API, else a generic placeholder like "ส่งรูป" or "ผู้ใช้". **Decision: placeholder TBD at implementation.**

3. **Sheet tab error handling:** If a tab does not exist, what should happen? Log + skip or throw + fail doPost gracefully? **Current impl: error card reply, doPost = 200 (standard pattern).**

4. **Concurrent postback events:** LockService will be added Phase 3 for redelivery dedup. Phase 2 assumes no concurrency (or GAS queues them naturally). **Not blocking Phase 2; noted for Phase 3.**

---

## 17. Codebase Paths & Key Files

**Phase 1 surfaces (read-only):**
- `src/types/ocrMetrics.ts` — `OcrMetrics` interface (25-key)
- `src/state/cacheStore.ts` — `stashOcr()`, `retrieveOcr()` (Phase 2 adds `deleteOcr()`)
- `src/config/props.ts` — `getProp(PROP_KEYS.SHEET_ID)`
- `src/line/lineClient.ts` — `reply(replyToken, messages[])`
- `test/setup.ts` — GAS global mocks

**Phase 2 creates/edits:**
- `src/sheet/sheetRepo.ts` — `appendSubmission()`, `ensureEmployee()` (NEW)
- `src/line/flex/success.ts` — `buildSuccessCard()` (NEW)
- `src/main.ts` — add `handlePostback()` + wire router; refactor to import from sheetRepo
- `src/state/cacheStore.ts` — add `deleteOcr(id)` export
- `test/phase-2/*.spec.ts` — postback router, sheetRepo, success card (NEW)

---

## Summary for Implementer

| Fact | Value |
|------|-------|
| **Postback data format** | `action=confirm&id=<shortId>` (parse with regex or query-string lib) |
| **Stash retrieval** | `retrieveOcr(id): OcrMetrics \| null` |
| **Sheet schema** | submissions (14 cols), employees (3 cols); append-by-order |
| **Null values** | Pass `''` (empty string), not `null` |
| **Timestamps** | `new Date().toISOString()` for UTC ISO format |
| **Success card color** | `#1e9e57` (green); no emoji; chip + label |
| **Error: stash miss** | "หมดเวลา ส่งรูปใหม่" + cameraRoll quick-reply |
| **Error: Sheet write** | "บันทึกไม่สำเร็จ ลองใหม่" (no quick-reply, stash survives) |
| **Idempotency** | Delete stash AFTER successful write; on write error, stash persists for retry |
| **messageId** | **BLOCKING DECISION:** Phase 1 must stash it alongside OcrMetrics, or Phase 2 generates (Option A recommended) |
| **Test mocks ready** | SpreadsheetApp, CacheService with `.remove()` already in place |

---

## Revision History

- **2026-07-04:** Initial research doc; Phase 1 surfaces confirmed; messageId interface flagged as blocking decision.
