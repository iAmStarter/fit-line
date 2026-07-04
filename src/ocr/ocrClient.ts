/**
 * src/ocr/ocrClient.ts — Fit-OCR API client (real implementation) + recognizer
 * selector.
 *
 * `OcrRecognizer` is the SINGLE contract both the mock (`ocrMock`) and the real
 * client (`ocrClient`) satisfy. Callers depend only on this interface and on
 * `getRecognizer()`, so swapping mock↔real is a config-only change (PLAN Phase 6):
 * the router calls `getRecognizer().recognize(blob)` and gets the real client
 * once `OCR_BASE_URL` + `OCR_TOKEN` are present in Script Properties, else the
 * mock.
 *
 * The real client POSTs the image as multipart/form-data to `{OCR_BASE_URL}/v1/ocr`
 * with a Bearer token from Script Properties, `fetchTimeoutSeconds:
 * OCR_FETCH_TIMEOUT_SEC` (30 s — covers the upstream 25 s timeout; see props.ts),
 * `muteHttpExceptions: true`, and parses the 25-key `OcrResult` response (research
 * docs/research/impl-phase-6-ocr-contract.md). The Bearer token is NEVER logged.
 *
 * SCAFFOLD (Phase 6): the real `recognize` body throws NotImplemented — the GREEN
 * step fills the fetch/parse/error-mapping logic. `getRecognizer()` selection
 * logic is implemented (config-only, no I/O secrets in a body).
 */

import { emptyOcrMetrics, type OcrMetrics } from '../types/ocrMetrics';
import {
  getPropOptional,
  PROP_KEYS,
  OCR_FETCH_TIMEOUT_SEC,
} from '../config/props';
import { ocrMock } from './ocrMock';

/**
 * Recognises the metrics in a workout screenshot. Implemented by both `ocrMock`
 * (dev stand-in) and the real `ocrClient` (Phase 6) against the identical
 * 25-key contract.
 */
export interface OcrRecognizer {
  /**
   * Extract metrics from an image blob.
   * @param image workout screenshot blob (from LINE `getContent`).
   * @returns the 25-key `OcrMetrics` reading.
   * @throws on network/timeout/auth error (caller handles → error card). The
   *   thrown message NEVER contains the Bearer token.
   */
  recognize(image: GoogleAppsScript.Base.Blob): OcrMetrics;
}

/** OCR endpoint path appended to `OCR_BASE_URL` for a recognise call. */
export const OCR_RECOGNIZE_PATH = '/v1/ocr';

/**
 * Real Fit-OCR client. Multipart POST to `{OCR_BASE_URL}${OCR_RECOGNIZE_PATH}`
 * with `Authorization: Bearer {OCR_TOKEN}`. On 200 → parse JSON and overlay it on
 * `emptyOcrMetrics` (missing key → null, defensive though the contract guarantees
 * all 25 present). On any non-200 (400/401/413/422/502/503) or a GAS timeout →
 * throw a clear Error whose message describes the failure but NEVER echoes the
 * token or Authorization header.
 */
export const ocrClient: OcrRecognizer = {
  recognize(image: GoogleAppsScript.Base.Blob): OcrMetrics {
    // Config reads. `getRecognizer()` only selects this client once BOTH
    // `OCR_BASE_URL` and `OCR_TOKEN` are present, so in production both are set;
    // the optional reads (fallback '') keep `recognize` total (no throw before
    // the request) for the swap-parity guard. The token is used ONLY to build the
    // Authorization header below — never logged, never in any thrown Error.
    const baseUrl = getPropOptional(PROP_KEYS.OCR_BASE_URL) ?? '';
    const token = getPropOptional(PROP_KEYS.OCR_TOKEN) ?? '';

    // Multipart POST: passing `payload: { image: blob }` makes GAS auto-set
    // Content-Type: multipart/form-data with the file attached as field `image`.
    // `muteHttpExceptions: true` so non-2xx is returned (inspected) rather than
    // thrown by GAS; `fetchTimeoutSeconds` covers the upstream 25 s worst case.
    // `fetchTimeoutSeconds` is a real GAS runtime option not declared in
    // `@types/google-apps-script`, so widen the option type to carry it.
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions & {
      fetchTimeoutSeconds: number;
    } = {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token },
      payload: { image },
      muteHttpExceptions: true,
      fetchTimeoutSeconds: OCR_FETCH_TIMEOUT_SEC,
    };
    const res = UrlFetchApp.fetch(baseUrl + OCR_RECOGNIZE_PATH, options);

    const code = res.getResponseCode();
    if (code !== 200) {
      // Map every non-200 (400/401/413/422/502/503/…) to a clear Error naming
      // the status. NEVER interpolate the token or Authorization header here.
      throw new Error('OCR request failed: HTTP ' + code);
    }

    // 200 → parse the 25-key OcrResult. Overlay the parsed body on a full empty
    // metrics shape so any MISSING key defaults to null (defensive; the contract
    // guarantees all 25, but we never throw on a valid 200).
    const parsed = JSON.parse(res.getContentText()) as Partial<OcrMetrics>;
    const source =
      typeof parsed.source === 'string' ? parsed.source : 'unknown';
    return { ...emptyOcrMetrics(source), ...parsed };
  },
};

/**
 * Select the active recognizer for the router.
 *
 * Returns the REAL `ocrClient` iff BOTH `OCR_BASE_URL` and `OCR_TOKEN` are
 * present (non-empty) in Script Properties; otherwise returns `ocrMock`. This is
 * the mock↔real swap point (PLAN Phase 6) — no caller changes, config drives it.
 *
 * `ocrMock` imports only the `OcrRecognizer` TYPE from this module (erased at
 * compile), so the static `import { ocrMock }` above creates no runtime cycle.
 *
 * @returns `ocrClient` when the OCR service is provisioned, else `ocrMock`.
 */
export function getRecognizer(): OcrRecognizer {
  const baseUrl = getPropOptional(PROP_KEYS.OCR_BASE_URL);
  const token = getPropOptional(PROP_KEYS.OCR_TOKEN);
  if (baseUrl && token) {
    return ocrClient;
  }
  // Not provisioned → dev/mock recognizer.
  return ocrMock;
}
