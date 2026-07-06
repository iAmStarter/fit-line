/**
 * src/sheet/sheetLog.ts — lightweight append-only event log into a `logs` tab
 * of the backing Sheet, so the owner can see traffic + errors without opening
 * the Apps Script editor / Stackdriver.
 *
 * ONE row per processed event (received outcome / error), NOT per micro-step —
 * keeps the Sheet-write overhead to one extra append. Best-effort + cosmetic:
 * it must NEVER throw and never affect message processing (callers log AFTER
 * replying so it does not add latency to the user's reply). No secrets / no
 * image bytes are logged — only userId, messageId, and a short detail string.
 */
import { getPropOptional } from '../config/props';

/** Tab that holds the event log (created by setupProject). */
export const LOG_TAB = 'logs';

export type LogLevel = 'info' | 'error';

/**
 * Append one log row: [timestampISO, level, event, userId, messageId, detail].
 * Silently no-ops when SHEET_ID is unset or the `logs` tab is missing, and
 * swallows any error (a logging failure must never break the webhook).
 */
export function logToSheet(
  level: LogLevel,
  event: string,
  userId?: string,
  messageId?: string,
  detail?: string
): void {
  try {
    const sheetId = getPropOptional('SHEET_ID');
    if (!sheetId) return;
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(LOG_TAB);
    if (!sheet) return;
    sheet.appendRow([
      new Date().toISOString(),
      level,
      event,
      userId ?? '',
      messageId ?? '',
      detail ?? '',
    ]);
  } catch (err) {
    Logger.log(
      'logToSheet failed (non-fatal): ' +
        (err instanceof Error ? err.message : String(err))
    );
  }
}
