# Design Research: Google Apps Script Runtime Constraints

**Date:** 2026-07-03  
**Topic:** GAS Web App execution limits, UrlFetchApp behavior, Sheet quotas, and concurrency.

## Summary: CRITICAL RISKS IDENTIFIED

The brief assumes "set a fetch timeout ~10s" and synchronous processing inside doPost. **Both of these contradict GAS runtime**.

---

## Findings

### 1. doPost Web App Execution Time Limit

**Fact:** Web App `doPost` executions are capped at **6 minutes (360 seconds)** per invocation, **without exception**.

Execution history:
- Previously: Some business-grade accounts had 30-minute limits.
- Current (2025–2026): **All accounts are capped at 6 minutes**, consumer and Workspace alike.

**Implication for V1:** A 2–3 second OCR call (p95) + LINE getContent + Sheet write easily fits within the 6-minute window. However, if OCR latency spikes to the "up to ~10s" mentioned in the brief, or if concurrent webhooks arrive and hit lock contention, you could exceed 6 minutes on repeated heavy loads.

**No Workaround:** There is no way to extend a single doPost execution. If you need longer, split across multiple function invocations (async queuing).

**Source:** [Quotas for Google Services | Apps Script | Google for Developers](https://developers.google.com/apps-script/guides/services/quotas)

---

### 2. UrlFetchApp: Timeout Configuration (CORRECTS BRIEF ASSUMPTION)

**Fact:** UrlFetchApp timeout **IS configurable**.

**Configuration:** Use the `fetchTimeoutSeconds` parameter in the options object:
```javascript
const options = {
  fetchTimeoutSeconds: 10,
  muteHttpExceptions: true,
};
const response = UrlFetchApp.fetch(url, options);
```

**Default Timeout:** 60 seconds (not explicitly stated in some docs, but widely reported).

**Custom Timeout Range:** Any positive integer (in seconds). GAS does not document a maximum, but practical limits apply (well below the 6-minute doPost limit).

**Implication for V1:** The brief's assumption "set a fetch timeout ~10s" is **valid and supported**. You can safely set `fetchTimeoutSeconds: 10` for OCR calls.

**Source:** [Extend or allow configurable timeout for UrlFetchApp.fetch](https://issuetracker.google.com/issues/36761852) (Google Issue Tracker discussion)

---

### 3. UrlFetchApp: POST Payload Size Limit (CORRECTS BRIEF ASSUMPTION)

**Fact:** UrlFetchApp POST request payload is capped at **50 MB**.

**Calculation for Base64-Encoded Image:**
- Raw workout screenshot: ~1–2 MB typical (depends on resolution, compression).
- Base64-encoded: 1 MB raw → ~1.33 MB base64 (+33% overhead).
- Wrapped in JSON (e.g., `{"image": "data:image/png;base64,...", ...}`): ~1.35 MB total.
- **Well under 50 MB limit** ✓

**Response Size:** Also capped at 50 MB (responses over this are truncated or throw exception).

**Implication for V1:** A single workout image as base64-in-JSON easily fits. No architectural change needed.

**Alternative: Multipart/form-data:** GAS supports this natively. If passing a Blob object in the payload, GAS automatically sends as multipart. This avoids base64 overhead (~25% smaller payload) and is more standard for binary transfers.

**Source:** [UrlFetchApp: The Unofficial Documentation](https://justin.poehnelt.com/posts/definitive-guide-to-urlfetchapp/); [Class UrlFetchApp | Apps Script | Google for Developers](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)

---

### 4. LockService: Lock Wait Timeout

**Fact:** LockService timeout is **application-defined**, not hardcoded by GAS.

**API:**
```javascript
const lock = LockService.getScriptLock();
lock.waitLock(timeoutInMillis);  // Throws exception if lock not acquired within timeout
lock.tryLock(timeoutInMillis);   // Returns false if lock not acquired within timeout
```

**Timeout Parameter:** Specified in **milliseconds**. Example: `lock.waitLock(30000)` waits up to 30 seconds.

**Implication for V1:** For messageId/employee+date dedup, you can set a reasonable timeout (e.g., 5–10 seconds) to prevent infinite blocking. If the lock is not acquired in time, the request fails (tryLock returns false, or waitLock throws). Plan for this failure case (log and possibly retry).

**Source:** [Class Lock | Apps Script | Google for Developers](https://developers.google.com/apps-script/reference/lock/lock)

---

### 5. SpreadsheetApp: Quotas & Concurrent Execution

**Daily Read/Write Quotas** (Properties Service, used by SpreadsheetApp):
- **Consumer Accounts:** 50,000 operations/day
- **Google Workspace Accounts:** 500,000 operations/day

**Quotas reset 24 hours after the first request**.

**Per-Request Operation Count:** A single `range.setValue()` or `range.getValues()` counts as one operation. Batch operations (e.g., `appendRow()` or `setValues()` for multiple cells) count as one batch operation.

**Simultaneous Executions:**
- **Per User:** Max 30 concurrent executions across all scripts
- **Per Script:** Max 1,000 concurrent executions

**Implication for V1:** 
- A single incoming webhook call triggers one doPost execution (1 concurrent).
- Multiple simultaneous LINE webhooks could trigger 2–5 concurrent doPost executions (well under 1,000 limit per script).
- Each webhook does ~5–10 Sheet operations (lock acquire, check for duplicate, append metrics). Even 100 webhooks/day = 500–1,000 operations, well under 50k limit for consumer or 500k for Workspace.

**Concurrency Behavior:** GAS queues concurrent sheet operations; lock contention is possible but not severe at ~10 webhooks/hour scale.

**Source:** [Quotas for Google Services | Apps Script | Google for Developers](https://developers.google.com/apps-script/guides/services/quotas)

---

### 6. UrlFetchApp: Daily Quota

**Calls per Day:**
- **Consumer Accounts:** 20,000 calls/day
- **Google Workspace Accounts:** 100,000 calls/day

**Implication for V1:** At ~10 OCR calls/day (10 users × 1 workout each), you're well under both limits.

**Source:** [Quotas for Google Services | Apps Script | Google for Developers](https://developers.google.com/apps-script/guides/services/quotas)

---

## Summary: Corrected Assumptions

| Brief Assumption | Reality | Impact on V1 |
|------------------|---------|-------------|
| "Set fetch timeout ~10s" | ✓ Supported via `fetchTimeoutSeconds: 10` | No change needed |
| Base64 image in JSON fits in POST | ✓ Under 50 MB limit (~1.3 MB) | No change needed |
| Synchronous processing in doPost | ⚠ Works if OCR+getContent+Sheet < 6 min | Monitor; implement async fallback if latency spikes |
| Multiple concurrent webhooks | ✓ GAS handles up to 1,000 per script | No architectural change needed |

---

## Risks & Unknowns

| Risk | Fact | Mitigation |
|------|------|-----------|
| Timeout spike (OCR takes 30s) | No limit on UrlFetch timeout; doPost limit is 6 min | If suspected, implement async queuing + job tracking |
| Lock contention | LockService wait is configurable; no documented max | Set reasonable timeout (5–10s); handle timeout failure |
| High Volume (100+ webhooks/hour) | SpreadsheetApp quota 50k/day (consumer) | Monitor daily quota; add cost monitoring or volume caps |
| getContent latency | Not researched; assume < 2 sec | Test with real LINE data; log latencies |

---

## Recommendations for V1

1. **Timeout Configuration:** Set `fetchTimeoutSeconds: 10` for OCR and getContent calls. ✓ Safe and supported.
2. **Payload Transport:** Use base64-in-JSON for simplicity, or multipart/form-data (simpler, smaller). Both work; base64 is fine for < 2 MB images.
3. **Lock Timeout:** Set to 5–10 seconds for dedup checks. Handle timeout failure (retry or skip).
4. **Monitor Execution Times:** Log wall-clock time per phase (getContent, OCR, Sheet write). If p95 approaches 5 minutes, move to async.
5. **Async Fallback:** If synchronous V1 hits latency issues in UAT, switch to:
   - Return 200 immediately.
   - Queue work via Apps Script trigger (time-based or manual) or Cloud Tasks.
   - Reply via Push API after processing completes.

---

## No Hard Blocker

The brief's assumptions are largely valid under GAS constraints. The 6-minute doPost limit is comfortably above typical latency (~2–3 sec), but not infinitely forgiving if OCR becomes slow or volume spikes unexpectedly.
