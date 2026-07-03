# Design Research: Image Transport — Base64 vs Multipart for OCR API

**Date:** 2026-07-03  
**Topic:** Comparing base64-encoded JSON and multipart/form-data for sending workout images from GAS to Fit-OCR API.

---

## Image Size Baseline

### Typical Workout Screenshot Size

**Assumption:** Workout screenshot from a fitness app (e.g., Apple Health, Garmin, Fitbit dashboard).
- **Resolution:** 1080 × 1920 px (typical smartphone screenshot).
- **Format:** PNG or JPEG.
- **Uncompressed Size:** ~1–3 MB (depending on compression).
  - PNG (lossless): ~2–3 MB.
  - JPEG (lossy, quality 80–90%): ~1–2 MB.

**For this research, assume 1.5 MB JPEG as typical.**

---

## Option 1: Base64-Encoded JSON

### Mechanics

**Process:**
1. Download image from LINE via `getContent` → binary blob.
2. Encode to Base64 string.
3. Wrap in JSON object: `{ "image": "data:image/jpeg;base64,..." }`.
4. POST as `Content-Type: application/json` to OCR API.

### Size Impact

**Base64 Overhead:** +33% (inherent to base64 encoding).
- 1.5 MB binary → 1.5 × 1.33 = **~2 MB base64 string**.
- JSON wrapper overhead: ~100 bytes.
- **Total payload: ~2 MB**.

**UrlFetchApp Limits:**
- POST payload limit: 50 MB.
- Response limit: 50 MB.
- **Verdict:** ✓ Well under limit.

### Pros & Cons

| Pros | Cons |
|------|------|
| Single JSON object; no multipart complexity | 33% size overhead |
| Easy to parse in JSON-first APIs | Larger bandwidth usage (cost if metered) |
| Natural for JavaScript/JSON-native stacks | Higher CPU for base64 en/decode |
| Works in all HTTP clients (Postman, curl, etc.) | Slower for large images (milliseconds, but measurable) |

### GAS Implementation

```typescript
const blob = UrlFetchApp.fetch(contentUrl, { headers: { Authorization: `Bearer ${lineToken}` } }).getBlob();
const base64Image = Utilities.base64Encode(blob.getBytes());
const payload = JSON.stringify({
  image: `data:image/jpeg;base64,${base64Image}`,
  metadata: { userId: 'U123', timestamp: Date.now() },
});

const response = UrlFetchApp.fetch(ocrApiUrl, {
  method: 'post',
  contentType: 'application/json',
  payload: payload,
  fetchTimeoutSeconds: 10,
});
```

---

## Option 2: Multipart/form-data

### Mechanics

**Process:**
1. Download image from LINE via `getContent` → binary blob.
2. Construct multipart/form-data request with blob + metadata fields.
3. POST with `Content-Type: multipart/form-data; boundary=...`.

### Size Impact

**No Encoding Overhead:** Binary data sent as-is, no base64 encoding.
- 1.5 MB binary → **1.5 MB binary** (multipart headers add ~1–2 KB).
- **Total payload: ~1.5 MB** (saves ~0.5 MB vs base64).

**Savings:** ~25–30% smaller than base64-in-JSON.

**UrlFetchApp Limits:**
- POST payload limit: 50 MB.
- **Verdict:** ✓ Well under limit.

### Pros & Cons

| Pros | Cons |
|------|------|
| No base64 overhead (~25% smaller) | Slightly more complex to construct |
| Lower CPU for en/decode | Multipart parsing on server (standard, but more work) |
| Industry standard for file uploads | Requires proper boundary construction |
| Better caching (binary-native) | Less convenient for manual testing (curl is more verbose) |

### GAS Implementation (Simple)

GAS handles multipart automatically when you pass a Blob:

```typescript
const blob = UrlFetchApp.fetch(contentUrl, { headers: { Authorization: `Bearer ${lineToken}` } }).getBlob();

const formData = {
  image: blob,  // GAS automatically encodes as multipart
  userId: 'U123',
  timestamp: String(Date.now()),
};

const response = UrlFetchApp.fetch(ocrApiUrl, {
  method: 'post',
  payload: formData,  // GAS sends as multipart/form-data
  fetchTimeoutSeconds: 10,
});
```

**GAS Behavior:** When you pass an object with a Blob property to `payload`, UrlFetchApp automatically:
- Detects the Blob.
- Switches `Content-Type` to `multipart/form-data`.
- Constructs proper boundaries and encoding.
- Sends the remaining object fields as form fields.

**Advanced Implementation (Manual Multipart):** If you need fine-grained control or the OCR API has strict multipart requirements, construct manually:

```typescript
const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
const imageBytes = blob.getBytes();

let body = `--${boundary}\r\n`;
body += `Content-Disposition: form-data; name="image"; filename="screenshot.jpg"\r\n`;
body += `Content-Type: image/jpeg\r\n\r\n`;
// Can't easily concatenate binary + string in GAS; use a library (FetchApp) or keep simple multipart.
```

**Recommendation:** Use the simple approach (pass Blob object to payload) — GAS handles it natively.

---

## Comparison

| Aspect | Base64-in-JSON | Multipart/form-data |
|--------|---|---|
| **Payload Size** | ~2 MB (1.5 × 1.33) | ~1.5 MB |
| **GAS Overhead** | ~Utilities.base64Encode (fast) | Automatic (very fast) |
| **Server Parsing** | Standard JSON parsing | Multipart parsing |
| **Bandwidth** (metered) | ~33% higher | Lower |
| **Implementation Complexity** | 1 line (JSON.stringify) | 1 line (pass Blob) |
| **Manual Testing (curl)** | Easy: `curl -X POST -d '{"image":"..."}' ...` | Verbose: `curl -F image=@screenshot.jpg ...` |
| **Compatibility** | Works everywhere | Works everywhere (standard) |
| **GAS Support** | ✓ Fully supported | ✓ Fully supported, automatic |

---

## Recommendation for Fit-OCR API Integration

**Decision Matrix:**

| If OCR API Prefers... | Choose... | Rationale |
|---|---|---|
| JSON payload (explicitly stated) | Base64-in-JSON | Explicit requirement overrides efficiency |
| Binary or multipart (explicitly stated) | Multipart | Explicit requirement overrides efficiency |
| No preference (open format) | **Multipart** | 25–30% smaller, simpler in GAS, standard for files |
| Unknown / spec unclear | **Multipart** (test both) | Multipart is safer default; fallback to base64 if server rejects |

**For V1:** Assume OCR API accepts both. Start with **multipart** (simpler, smaller, more efficient). If the real API requires base64, switching is trivial (2-line change).

---

## Performance Comparison

**Hypothetical 1.5 MB image, p95 latencies (estimates):**

| Phase | Base64-in-JSON | Multipart |
|-------|---|---|
| Download image (LINE getContent) | ~500 ms | ~500 ms |
| Encode to base64 / prepare payload | ~50 ms | ~5 ms |
| HTTP POST to OCR API | ~800 ms | ~600 ms (smaller body) |
| OCR processing | ~2000 ms | ~2000 ms |
| **Total** | **~3350 ms** | **~3105 ms** |

**Savings:** ~240 ms (~7% faster with multipart), assuming OCR server has similar processing time for both formats.

**Practical Impact:** Negligible for V1 (both well under 6-minute doPost limit). Not a deciding factor.

---

## Secrets in URL vs. Headers

Both options support Bearer token in HTTP headers (preferred) or query params (not recommended).

**Recommended (both options):**
```typescript
const options = {
  headers: {
    Authorization: `Bearer ${ocrBearerToken}`,
  },
  fetchTimeoutSeconds: 10,
};
UrlFetchApp.fetch(ocrApiUrl, options);
```

**Avoid:** Embedding token in URL query string (logged in server access logs, browser history, etc.).

---

## Recommendations for V1

1. **Primary Transport:** Multipart/form-data.
   - Simpler in GAS (Blob auto-detection).
   - 25–30% smaller payload.
   - Standard for file uploads.

2. **Implementation:**
   ```typescript
   const imageBlob = UrlFetchApp.fetch(contentUrl, {
     headers: { Authorization: `Bearer ${lineToken}` },
   }).getBlob();
   
   const response = UrlFetchApp.fetch(ocrApiUrl, {
     method: 'post',
     payload: { image: imageBlob, userId: 'U123' },
     headers: { Authorization: `Bearer ${ocrBearerToken}` },
     fetchTimeoutSeconds: 10,
   });
   ```

3. **Fallback:** If OCR API returns `415 Unsupported Media Type` or similar, switch to base64-in-JSON:
   ```typescript
   const base64 = Utilities.base64Encode(imageBlob.getBytes());
   const payload = JSON.stringify({ image: `data:image/jpeg;base64,${base64}` });
   ```

4. **Size Limits:** Both are well under the 50 MB UrlFetchApp limit; no architectural concern.

5. **Testing:** Use Postman or `curl -F` to test multipart against a mock OCR endpoint before deployment.

---

## Sources

- [Multipart-POST Request Using Google Apps Script · GitHub](https://gist.github.com/tanaikech/d595d30a592979bbf0c692d1193d260c)
- [Why You Should Avoid Base64 for Image Conversion in APIs | Medium](https://medium.com/@sandeepkella23/why-you-should-avoid-base64-for-image-conversion-in-apis-c8d77830bfd8)
- [Class UrlFetchApp | Apps Script | Google for Developers](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
