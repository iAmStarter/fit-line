/**
 * src/line/lineClient.ts — LINE Messaging API client (getContent + reply).
 *
 * Outbound calls to LINE, authenticated with the channel access token from
 * Script Properties (never hard-coded). Both use `UrlFetchApp` with
 * `fetchTimeoutSeconds: 10` (research impl-phase-1 §1–2).
 *
 *   - `getMessageContent` GETs the image blob from
 *     `api-data.line.me/v2/bot/message/{id}/content` — download immediately
 *     (availability window not guaranteed).
 *   - `reply` POSTs to `api.line.me/v2/bot/message/reply` with the one-time
 *     reply token and a `messages` array (Flex bubble ± quick reply).
 *
 * SCAFFOLD (Phase 1): signatures only — bodies throw NotImplemented.
 */

import { getProp, PROP_KEYS } from '../config/props';

/** LINE content-download host (binary blobs are served from api-data). */
const LINE_CONTENT_BASE = 'https://api-data.line.me/v2/bot/message';
/** LINE reply endpoint. */
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
/** UrlFetchApp timeout — fits well under the LINE reply-token window. */
const FETCH_TIMEOUT_SECONDS = 10;

/**
 * Download an image message's binary content from LINE.
 * @param messageId LINE message id from the webhook event.
 * @returns the image blob (call immediately; do not queue).
 * @throws on network/timeout error (caller handles → error card).
 */
export function getMessageContent(
  messageId: string
): GoogleAppsScript.Base.Blob {
  const accessToken = getProp(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  const response = UrlFetchApp.fetch(
    `${LINE_CONTENT_BASE}/${messageId}/content`,
    {
      method: 'get',
      headers: { Authorization: `Bearer ${accessToken}` },
      muteHttpExceptions: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchTimeoutSeconds: FETCH_TIMEOUT_SECONDS,
    } as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
  );
  return response.getBlob();
}

/**
 * Reply to a LINE event with one or more messages (Flex bubbles, quick reply).
 * @param replyToken one-time reply token from the webhook event.
 * @param messages   LINE message objects (as built by the flex builders).
 * @throws on network/timeout error (caller handles → logged, doPost still 200).
 */
export function reply(replyToken: string, messages: object[]): void {
  const accessToken = getProp(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify({ replyToken, messages }),
    muteHttpExceptions: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchTimeoutSeconds: FETCH_TIMEOUT_SECONDS,
  } as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions);
}
