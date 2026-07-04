# IMPL Research: Phase 3 — Anti-spam Guards (sha256 image dedup + per-user rate-limit)

> [SUPERSEDED — see shipped artifacts in src/phase-3/ + test/phase-3/; STATE.md carries current surfaces]

> **Phase 3 slice:** Before calling OCR → compute sha256(image bytes) locally → if hash exists in `submissions` (system-wide) → reject "รูปนี้เคยส่งแล้ว", do NOT call OCR. Also per-user rate-limit (CacheService counter, 5/60s) → over limit → cooldown reply. Plus messageId+LockService dedup to guard against LINE webhook redelivery duplicates.
>
> **Gate:** Phase 3 is a prerequisite for Phase 6 (real OCR swap) because it gates OCR cost + abuse.

---

## 1. SHA-256 of Image Blob in GAS

**Requirement:** Compute sha256(image bytes) locally BEFORE calling OCR. Hash is used to:
- Dedup images system-wide (Phase 3 reject path).
- Store in submissions row for audit/dedup tracking (imageHash column, currently written as '').

### 1.1 GAS Utilities API for SHA-256

**Exact call (confirmed from GAS docs):**

```typescript
// Input: image Blob (returned by getMessageContent)
const blob: GoogleAppsScript.Base.Blob = getMessageContent(messageId);
// Compute SHA-256 digest of the blob's bytes
const digestBytes: number[] = Utilities.computeDigest(
  Utilities.DigestAlgorithm.SHA_256,
  blob  // GAS auto-accepts Blob; Utilities serializes to bytes internally
);
// Convert signed byte[] (-128..127) to hex string (0..255 per byte)
const hexHash: string = digestBytes
  .map(b => (b & 0xff).toString(16).padStart(2, '0'))
  .join('');
```

**Key facts:**
- `Utilities.computeDigest(algo, value)` accepts Blob directly (GAS handles serialization).
- Returns signed byte[] (-128..127 range per GAS convention).
- Must mask to 0xff and format as 2-digit hex (canonical form for storage + lookup).
- Example: `[0, 1, -1, 2]` → `"0001ff02"`.

**Test harness note:** `test/setup.ts` already mocks `Utilities.computeDigest` (line 30–32), returning `[0, 1, 2, 3]` by default. Tests override this to spy on calls or return deterministic hashes.

### 1.2 Existing Crypto Adapter Reuse

**Current state (src/adapters/gasCrypto.ts):**
- `GasCrypto` interface has `hmacSha256(value, key)` and `sha256(value: string)` — the latter takes a **string**, not a Blob.
- Phase 0 added this adapter for signature verification (HMAC).
- **Decision:** Do NOT extend gasCrypto for Blob hashing. Reason:
  - The adapter is designed for string-input crypto (signatures).
  - Blob hashing is a one-off, used only in Phase 3.
  - Adding Blob as a union type (`string | Blob`) over-complicates the DI seam.
  - Simpler: inline the Blob→hex conversion in the imageDedup rule.

**Recommendation:** Create a **new helper function** in `src/rules/imageDedup.ts` (see §2 below):

```typescript
function blobToSha256Hex(blob: GoogleAppsScript.Base.Blob): string {
  const digestBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    blob
  );
  return digestBytes
    .map(b => (b & 0xff).toString(16).padStart(2, '0'))
    .join('');
}
```

This is pure, testable (mock Utilities in the test), and keeps gasCrypto focused.

---

## 2. ImageHash Lookup in Submissions Sheet

**Requirement:** Check if the computed hash exists in any row's `imageHash` column → reject if found.

### 2.1 Current Schema & Column Indexing

**Submissions schema (14 cols, OVERVIEW §5 + STATE current surfaces):**
```
0: messageId
1: userId
2: name
3: activityType
4: activityDateISO
5: submittedAtISO
6: activeCaloriesKcal
7: totalCaloriesKcal
8: distanceKm
9: source
10: confidence
11: status
12: rejectReason
13: imageHash  (last column, currently written as '')
```

### 2.2 Implementation Pattern (from sheetRepo.ts)

**Current pattern:** `readRows(tab)` returns 2D array; header is row 0. Lookup by column name:

```typescript
function imageHashExists(hashHex: string): boolean {
  const rows = readRows(SUBMISSIONS_TAB);
  // Skip header (index 0), find imageHash column index
  const header = rows[0] ?? [];
  const imageHashColIndex = header.indexOf('imageHash');
  if (imageHashColIndex === -1) {
    // Column not found (broken schema) — treat as "not found" (no reject)
    Logger.log('WARNING: imageHash column not found in submissions schema');
    return false;
  }
  // Scan data rows (skip header)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][imageHashColIndex] === hashHex) {
      return true; // Hash found — image was already submitted
    }
  }
  return false; // Not found
}
```

**Edge case:** Empty sheet → `rows.length === 1` (header only) → loop skipped → returns `false` (no crash).

### 2.3 Threading imageHash into appendSubmission

**Current code (src/sheet/sheetRepo.ts, line 99–120):**
- `appendSubmission(ctx, status)` writes imageHash as `''` (empty string).
- Phase 3 must **thread the hash into the context** and write it.

**Two design options:**

**Option A (Recommended):** Compute hash at image-time, stash in StashedContext, write at postback.
- Pro: Hash is part of the OCR lineage; consistent with messageId/userId pattern.
- Con: Stash size grows slightly.

**Option B:** Compute hash in postback path before writing.
- Pro: Simpler stash (no new field).
- Con: Breaks the "compute hash before OCR for cost gating" requirement — hash would be computed AFTER dedup check (wrong order).

**Recommendation: Option A.** Modify `StashedContext` (cacheStore.ts):

```typescript
export interface StashedContext {
  metrics: OcrMetrics;
  messageId: string;
  userId: string;
  imageHash: string;  // ← NEW: sha256 hex of the image blob
}
```

Then in `handleImageMessage` (main.ts):

```typescript
const blob = getMessageContent(messageId);
const imageHash = blobToSha256Hex(blob);

// Before OCR + rules, check dedup + rate-limit
if (imageHashExists(imageHash)) {
  reply(replyToken, [buildDuplicateImageCard()]);
  return;
}
// ... rate-limit check ...

// Now call OCR
const metrics = ocrMock.recognize(blob);
// ... rules ...

// Stash includes the hash
const cacheId = stashSubmission({
  metrics,
  messageId,
  userId: event.source?.userId ?? '',
  imageHash,  // ← threaded in
});
```

Then in `appendSubmission` (sheetRepo.ts):

```typescript
export function appendSubmission(ctx: StashedContext, status: string = STATUS_RECORDED): void {
  const m = ctx.metrics;
  appendRowByHeader(SUBMISSIONS_TAB, {
    // ... existing fields ...
    imageHash: ctx.imageHash,  // ← NOW populated (not empty string)
  });
}
```

**Impact on existing code:**
- `stashSubmission` call site in main.ts: add `imageHash` field.
- `StashedContext` type definition: add `imageHash: string`.
- `appendSubmission` call site: no change (flows through ctx).
- Test fixtures: `makeOcrMetrics` or test StashedContext builders must include imageHash.

---

## 3. Per-User Rate-Limit (CacheService Counter)

**Requirement:** Limit images from a single user to 5 per 60 seconds. Excess → cooldown reply, no OCR.

### 3.1 GAS CacheService Pattern (No Atomic Increment)

**Key constraint:** CacheService.getScriptCache() has **no atomic increment**. Pattern:

```typescript
const cache = CacheService.getScriptCache();
const key = `rl:${userId}`;
const currentStr = cache.get(key);
const current = currentStr ? parseInt(currentStr, 10) : 0;
const next = current + 1;
cache.put(key, String(next), 60);  // TTL 60 seconds
return next;
```

**Race condition note:** GAS runs single-threaded per script; simultaneous requests from the same user are queued, not concurrent. Race is **acceptable at trial scale**. If needed, wrap in LockService (see §4).

### 3.2 Boundary Condition

**Requirement (PLAN Phase 3 line 89):** "5/นาที" limit means:
- Request 1–5: pass.
- Request 6+: blocked (cooldown).

**Implementation:**

```typescript
function getRateLimitCounter(userId: string): number {
  const cache = CacheService.getScriptCache();
  const key = `rl:${userId}`;
  const currentStr = cache.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;
  const next = current + 1;
  cache.put(key, String(next), 60);
  return next;
}

function isRateLimited(userId: string): boolean {
  const count = getRateLimitCounter(userId);
  return count > 5;  // 6th request onwards
}
```

**Test boundary (from PLAN line 89):**
- 5th call: count returns 5 → `5 > 5` = false → pass.
- 6th call: count returns 6 → `6 > 5` = true → reject cooldown.

### 3.3 CacheService.put TTL

**Confirmed (from design-gas-runtime-constraints):** CacheService TTL max is **600 seconds (10 minutes)**. 60s is well within limit. No issue.

---

## 4. LockService for messageId Dedup (Redelivery Guard)

**Requirement:** Prevent double-write on LINE webhook redelivery (PLAN Phase 3 line 90).

### 4.1 GAS LockService API

**Exact pattern:**

```typescript
const lock = LockService.getScriptLock();
try {
  lock.waitLock(10000);  // Wait up to 10 seconds
  // Critical section: check + write
  const existingMessageId = checkSubmissionExists(messageId);
  if (existingMessageId) {
    Logger.log(`Duplicate messageId ${messageId}; skipping write`);
    return;  // Idempotent: already written
  }
  appendSubmission(ctx);
} finally {
  lock.releaseLock();
}
```

**Key facts:**
- `getScriptLock()` returns a script-wide lock (per GAS project, not per user).
- `waitLock(ms)` blocks until acquired; **throws** if timeout exceeded (10s recommended per research).
- `tryLock(ms)` returns boolean (non-blocking alternative).
- `releaseLock()` must be in `finally` to avoid deadlock.

**Timeout handling (PLAN Phase 3 line 91):**

```typescript
try {
  lock.waitLock(10000);  // 10 second wait
  // ... check + write ...
} catch (lockErr) {
  // Timeout → cannot acquire lock → reply graceful error
  Logger.log(`LockService timeout: ${lockErr}`);
  reply(replyToken, [buildLockTimeoutCard()]);
  return;  // Do NOT proceed to write (risk double-write)
}
```

### 4.2 messageId Dedup Check (Placement)

**Where to check:** The lock guards the **Sheet write path only** (postback handler, `handlePostback` in main.ts).

**Why not in image path:** The image path (imageHash dedup + rate-limit) already gates OCR; the cost is blocked. The lock is needed at the write boundary to prevent LINE redelivery from creating duplicate rows.

**Placement in handlePostback:**

```typescript
export function handlePostback(event: LineWebhookEvent): void {
  const replyToken = event.replyToken;
  if (!replyToken) {
    Logger.log('handlePostback: missing replyToken; ignoring.');
    return;
  }

  const id = parsePostbackId(event.postback?.data);
  const ctx = id !== null ? retrieveSubmission(id) : null;

  if (id === null || ctx === null) {
    try {
      reply(replyToken, [buildStashMissCard()]);
    } catch (replyErr) {
      Logger.log(`handlePostback: stash-miss reply failed — ${replyErr}`);
    }
    return;
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    // Check: has this messageId already been recorded?
    if (submissionExistsByMessageId(ctx.messageId)) {
      Logger.log(`Duplicate messageId ${ctx.messageId}; idempotent skip.`);
      removeSubmission(id);  // Consume stash (same as success path)
      reply(replyToken, [buildSuccessCard(ctx)]);  // Echo success (idempotent)
      return;
    }
    // New: write
    appendSubmission(ctx);
    ensureEmployee(ctx.userId, PLACEHOLDER_EMPLOYEE_NAME);
    removeSubmission(id);
    reply(replyToken, [buildSuccessCard(ctx)]);
  } catch (lockErr) {
    Logger.log(`handlePostback lock error: ${lockErr}`);
    try {
      reply(replyToken, [buildLockTimeoutCard()]);
    } catch (replyErr) {
      Logger.log(`handlePostback: lock-error reply failed — ${replyErr}`);
    }
    // Do NOT remove stash (allow manual retry)
  } catch (err) {
    // Sheet write error (pre-lock or post-lock)
    Logger.log(`handlePostback error: ${err instanceof Error ? err.message : err}`);
    try {
      reply(replyToken, [buildSheetErrorCard()]);
    } catch (replyErr) {
      Logger.log(`handlePostback: error-card reply failed — ${replyErr}`);
    }
  } finally {
    lock.releaseLock();
  }
}
```

### 4.3 messageId Lookup Function

**New helper in sheetRepo.ts:**

```typescript
/**
 * Check if a submission with the given messageId already exists.
 * Used for idempotency under LINE webhook redelivery (Phase 3).
 * @param messageId the LINE message id to check.
 * @returns true iff a row with this messageId is already in submissions.
 */
export function submissionExistsByMessageId(messageId: string): boolean {
  const rows = readRows(SUBMISSIONS_TAB);
  const header = rows[0] ?? [];
  const messageIdColIndex = header.indexOf('messageId');
  if (messageIdColIndex === -1) {
    throw new Error('messageId column not found in submissions schema');
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][messageIdColIndex] === messageId) {
      return true;
    }
  }
  return false;
}
```

**Test harness:** `test/setup.ts` already mocks LockService (line 99–104). Tests override `.getScriptLock()` mock to control waitLock behavior (instant success, or throw to simulate timeout).

---

## 5. New Reject Cards (Phase 3)

**Three new reject reasons (from PLAN Phase 3):**

1. **Duplicate image:** "รูปนี้เคยส่งแล้ว" — hash dedup fail. Red chip, no buttons, cameraRoll quick reply, no emoji.
2. **Rate-limit cooldown:** "ส่งบ่อยเกินไป รอสักครู่" — rate-limit exceeded. Red chip, no buttons, cameraRoll quick reply, no emoji.
3. **Lock timeout:** "ระบบไม่ว่าง ลองใหม่" — LockService timeout. Red chip, no buttons, no quick reply (system error, not user retry). No emoji.

**Pattern (reuse existing reject-card builder):**

```typescript
function buildDuplicateImageCard(): object {
  return {
    type: 'flex',
    altText: 'รูปนี้เคยส่งแล้ว',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รูปนี้เคยส่งแล้ว',
            color: '#d64545',
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
    quickReply: {
      items: [
        { type: 'action', action: { type: 'cameraRoll', label: 'ส่งรูปใหม่' } },
      ],
    },
  };
}

function buildCooldownCard(): object {
  return {
    type: 'flex',
    altText: 'ส่งบ่อยเกินไป รอสักครู่',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ส่งบ่อยเกินไป รอสักครู่',
            color: '#d64545',
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
    quickReply: {
      items: [
        { type: 'action', action: { type: 'cameraRoll', label: 'ส่งรูปใหม่' } },
      ],
    },
  };
}

function buildLockTimeoutCard(): object {
  return {
    type: 'flex',
    altText: 'ระบบไม่ว่าง ลองใหม่',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ระบบไม่ว่าง ลองใหม่',
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

All three use semantic red `#d64545`, no emoji, and follow the Phase 1 reject-card pattern.

---

## 6. Ordering in Image Path (Cost Gate)

**Phase 3 slice (PLAN line 83):** "Before calling OCR → hash compute → dedup lookup → rate-limit check."

**Correct order (cheapest/most-blocking first):**

```typescript
export function handleImageMessage(event: LineWebhookEvent): void {
  // ... extract replyToken, messageId, userId ...

  try {
    const blob = getMessageContent(messageId);

    // GATE 1: Rate-limit (cheapest — in-memory counter)
    if (isRateLimited(event.source?.userId ?? '')) {
      reply(replyToken, [buildCooldownCard()]);
      return;  // Do NOT compute hash or call OCR
    }

    // GATE 2: Image dedup (O(n) scan of submissions, but < OCR cost)
    const imageHash = blobToSha256Hex(blob);
    if (imageHashExists(imageHash)) {
      reply(replyToken, [buildDuplicateImageCard()]);
      return;  // Do NOT call OCR
    }

    // GATE CLEARED: Call OCR (most expensive, only if both gates pass)
    const metrics = ocrMock.recognize(blob);
    const result = calorieRule(metrics);

    if (result.ok) {
      const cacheId = stashSubmission({
        metrics,
        messageId,
        userId: event.source?.userId ?? '',
        imageHash,
      });
      reply(replyToken, [buildConfirmCard(metrics, cacheId)]);
    } else {
      reply(replyToken, [buildRejectCard(metrics, result.reason ?? 'ไม่ผ่านเงื่อนไข')]);
    }
  } catch (err) {
    // ... error handling ...
  }
}
```

**Rationale:**
- Rate-limit first: O(1) CacheService get + put (fastest).
- Hash dedup next: O(n) Sheet scan (slower, but < OCR).
- OCR last: 2–10s (most expensive).

---

## 7. Test Harness Updates

### 7.1 Utilities.computeDigest Mock (Already Present)

**Current (test/setup.ts, line 30–32):**
```typescript
computeDigest: jest.fn((_algo: unknown, _value: unknown): number[] => [0, 1, 2, 3]),
```

**Usage in tests:**
```typescript
jest.spyOn(global as any, 'Utilities').computeDigest.mockReturnValueOnce([...deterministic bytes...]);
```

### 7.2 LockService Mock (Already Present)

**Current (test/setup.ts, line 99–104):**
```typescript
g.LockService = {
  getScriptLock: jest.fn(() => ({
    waitLock: jest.fn(),
    tryLock: jest.fn((): boolean => true),
    releaseLock: jest.fn(),
  })),
};
```

**Usage in tests:**
```typescript
// Simulate timeout
(global as any).LockService.getScriptLock.mockReturnValueOnce({
  waitLock: jest.fn(() => { throw new Error('Timeout'); }),
  releaseLock: jest.fn(),
});
```

### 7.3 CacheService Rate-Limit Mock

**Current (test/setup.ts, line 70–78):** Already a stateful double in phase-1 tests (cacheStore.spec.ts). Rate-limit counter uses the same interface.

**Test pattern (from cacheStore.spec.ts):**

```typescript
function installStatefulCache(): Map<string, string> {
  const store = new Map<string, string>();
  (global as any).CacheService.getScriptCache.mockReturnValue({
    get: jest.fn((key: string): string | null => store.get(key) ?? null),
    put: jest.fn((key: string, value: string, ttl?: number): void => {
      store.set(key, value);
    }),
    remove: jest.fn((key: string): void => {
      store.delete(key);
    }),
  });
  return store;
}
```

### 7.4 SpreadsheetApp Image Hash Lookup Mock

**Phase 3 adds imageHashExists lookup (reads submissions tab).** `test/setup.ts` already mocks SpreadsheetApp (line 81–96). Tests install a stateful double:

```typescript
function installSubmissionsData(rows: unknown[][]): void {
  (global as any).SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((name: string) => {
      if (name === 'submissions') {
        return {
          getDataRange: jest.fn(() => ({
            getValues: jest.fn((): unknown[][] => rows),
          })),
          appendRow: jest.fn(),
        };
      }
      return null;
    }),
  });
}
```

Test data includes header + rows with imageHash column populated.

---

## 8. Unknowns & Edge Cases

### 8.1 Deterministic Hash (No Unknown)

**Fact:** SHA-256 is deterministic. The same image blob always produces the same hash. No unknown.

### 8.2 Hash Format Canonicalization (No Unknown)

**Fact:** Hex string conversion (`b & 0xff` → 2-digit lowercase hex) is deterministic. Confirmed in test harness (Utilities.base64Encode helper line 37–39 shows the pattern). No unknown.

### 8.3 Stash Size Impact (Low Risk)

**Adding imageHash to StashedContext:** Hash is ~64 chars (256-bit → 32 bytes → 64 hex chars). CacheService has no published string-size limit; trial scale (< 100 concurrent stashes) → no issue. Edge case: edge case if stash TTL is very short and hash lookup is slow, could theoretically stale-miss a recently-deduplicated image. Mitigation: if observed in Phase 6, cache the hash lookup result separately.

### 8.4 LockService Contention (Low Risk)

**GAS single-threaded per script:** Redeliveries from the same user within the 10-second lock window queue, not contend. No race. Trial scale → acceptable.

### 8.5 Rate-Limit Boundary Test (No Unknown)

**PLAN specifies (line 89):** "5 ผ่าน, 6 บล็อก" — exact. Implementation `count > 5` matches. Test: 5th call returns 5 (pass), 6th returns 6 (blocked). Confirmed via boundary table in acceptance criteria.

---

## 9. Summary of Concrete Facts

| Topic | Fact | Source |
|-------|------|--------|
| SHA-256 of Blob | `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob)` returns signed byte[]; convert to hex via `(b & 0xff).toString(16).padStart(2, '0')` | GAS Utilities API, test/setup.ts line 30–32 |
| imageHash column | 14th col (index 13) in submissions tab, currently written as ''; must be threaded from imageHash property in StashedContext | OVERVIEW §5, sheetRepo.ts line 99–120 |
| imageHash threading | Compute hash in image path, stash in StashedContext, write in postback path; breaks imageHash-before-OCR cost gate if deferred | Phase 3 requirement (PLAN line 83) |
| Rate-limit pattern | No atomic increment; get/parseInt/+1/put with 60s TTL; boundary 5 pass / 6 block | CacheService API, PLAN Phase 3 line 89 |
| LockService | `getScriptLock().waitLock(10000)` in try; throw → timeout; releaseLock() in finally; check messageId before write | GAS LockService API, PLAN Phase 3 line 90 |
| Reject cards | 3 new cards (duplicate-image, cooldown, lock-timeout); all red #d64545, no buttons, no emoji; dedup + cooldown have cameraRoll quick reply | PLAN Phase 3 lines 83–94 |
| Test harness | Utilities.computeDigest already mocked; LockService already mocked; CacheService stateful double from Phase 1; SpreadsheetApp mock needs imageHash column in test data | test/setup.ts + test/phase-1/cacheStore.spec.ts |
| messageId dedup placement | Lock + check in postback handler (handlePostback), not image path; image path gates OCR cost only | PLAN Phase 3 line 90, architecture principle |
| Ordering in image path | rate-limit (O(1)) → hash dedup (O(n) sheet) → OCR (2–10s); all cheaper gates first | PLAN Phase 3 line 83, cost-gate principle |

---

## 10. Interface Questions for Grill-Me

1. **imageHash stash threading:** Confirm Option A (compute at image-time, stash, write at postback) is the intended design? This breaks the phase boundary (Phase 1 stash vs Phase 3 imageHash), but keeps the cost gate clean.

2. **Lock scope:** The lock is **script-wide** (per GAS project, not per user). Is this acceptable, or should rate-limit + dedup checks be under lock too? (Current recommendation: no, only the Sheet write needs lock; image path gates are per-request.)

3. **Idempotent success reply on messageId match:** When a redelivery finds an existing messageId (already written), should the postback reply a success card (idempotent) or a different message (e.g., "already recorded")? Recommendation: success card (idempotent UX).

4. **Rate-limit reset on TTL expiry:** Counter TTL is 60s. If a user submits 5 images in 30s, then waits 35s, the counter expires and they can submit 5 more (cool). Is this the intended behavior (sliding window per user)? Or should it be a fixed calendar minute? Recommendation: sliding window (current) is simpler and fairer.

5. **Hash collision risk:** SHA-256 is 2^256 space, so collision on trial scale is ~0. But if Phase 6 real OCR ever processes the same image differently (e.g., compression), hash would match but metrics differ. Should we also store a secondary check (e.g., metrics hash)? Recommendation: out-of-scope for Phase 3 (accept imageHash dedup as byte-perfect); Phase 7 may add perceptual hash.

---

## 11. Files to Create / Modify

| File | Change | Purpose |
|------|--------|---------|
| `src/rules/imageDedup.ts` | **NEW** | imageHashExists + blobToSha256Hex helpers |
| `src/rules/rateLimit.ts` | **NEW** | getRateLimitCounter + isRateLimited helpers |
| `src/state/lock.ts` | **NEW** (optional) | LockService wrapper if DI seam desired; else inline in main.ts |
| `src/state/cacheStore.ts` | MODIFY | StashedContext: add `imageHash: string` field |
| `src/sheet/sheetRepo.ts` | MODIFY | appendSubmission: write ctx.imageHash; add submissionExistsByMessageId + imageHashExists |
| `src/main.ts` | MODIFY | handleImageMessage: add rate-limit + imageDedup gates before OCR; thread imageHash into stash; handlePostback: add LockService + messageId dedup check |
| `src/line/flex/*.ts` | MODIFY | Add buildDuplicateImageCard, buildCooldownCard, buildLockTimeoutCard |
| `test/phase-3/*.spec.ts` | **NEW** | Unit tests (RED-first): imageDedup, rateLimit, lock, handleImageMessage, handlePostback with dedup |
| `test/setup.ts` | MODIFY (optional) | Already has mocks; may add helpers for stateful CacheService/SpreadsheetApp if not already present |

---

## 12. Implementation Order (for DEV)

1. **Create imageDedup.ts + rateLimit.ts** (pure logic, testable in isolation).
2. **Modify StashedContext** to add imageHash field.
3. **Update sheetRepo.ts** to read imageHash column + write it from context.
4. **Update handleImageMessage** to compute hash, check dedup, check rate-limit, thread into stash.
5. **Update handlePostback** to wrap write in LockService + messageId check.
6. **Add reject card builders** (duplicate-image, cooldown, lock-timeout).
7. **Write RED tests** for each module (imageDedup, rateLimit, lock, router).
8. **Refactor to GREEN** (implement logic to pass tests).
9. **Regression suite** (P1+P2 must stay green).

---

_End of impl-phase-3 research._
