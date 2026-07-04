/**
 * src/main.ts — GAS Web App entry point.
 *
 * `doPost` is the single inbound surface. It MUST be reachable as a top-level
 * global in the deployed bundle (Rollup outro hoists it — see rollup.config.mjs).
 *
 * Phase 0 contract (PLAN acceptance):
 *   - verify LINE signature; invalid/absent -> still return HTTP 200 but do NOT
 *     process further (LINE must always receive 200; log + ignore).
 *   - valid signature -> return HTTP 200 (routing arrives Phase 1+).
 *   - never throw out of doPost; always return a ContentService 200.
 *
 * Phase 0: skeleton stub — body throws NotImplemented. Routing/OCR/Sheet logic
 * is added in later phases; the signature verification wiring is filled next.
 */

import { verifySignature } from './line/signature';
import { getProp, PROP_KEYS } from './config/props';

/** LINE's signature header, case-insensitively. GAS may expose it either on
 * `e.headers` (lowercased) or `e.parameter` (original casing). We tolerate
 * both plus mixed casing rather than assuming one accessor. */
function readSignatureHeader(e: GoogleAppsScript.Events.DoPost): string {
  const HEADER = 'x-line-signature';
  const sources: Array<Record<string, unknown> | undefined> = [
    (e as unknown as { headers?: Record<string, unknown> }).headers,
    e?.parameter as unknown as Record<string, unknown> | undefined,
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (key.toLowerCase() === HEADER) {
        const value = source[key];
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }
  }
  return '';
}

/**
 * LINE webhook handler. Always returns 200 to LINE.
 * @param e GAS POST event (raw body in `e.postData.contents`).
 */
export function doPost(
  e: GoogleAppsScript.Events.DoPost
): GoogleAppsScript.Content.TextOutput {
  try {
    const body = e?.postData?.contents ?? '';
    const signature = readSignatureHeader(e);
    const channelSecret = getProp(PROP_KEYS.LINE_CHANNEL_SECRET);

    if (verifySignature(body, signature, channelSecret)) {
      // Phase 0 skeleton: signature verified. Routing (message | postback),
      // OCR, and Sheet writes arrive in later phases. Nothing downstream yet.
      Logger.log(
        'Valid webhook signature; downstream routing arrives Phase 1.'
      );
    } else {
      // LINE must always receive 200; log + ignore an unverified request so no
      // outbound call (reply/OCR) is ever triggered by a spoofed webhook.
      Logger.log('Invalid or absent webhook signature; ignoring request.');
    }
  } catch (err) {
    // doPost must never throw out — LINE always gets a 200 TextOutput.
    Logger.log(`doPost error: ${err instanceof Error ? err.message : err}`);
  }
  return ContentService.createTextOutput('OK').setMimeType(
    ContentService.MimeType.TEXT
  );
}
