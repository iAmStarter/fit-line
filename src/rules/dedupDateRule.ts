/**
 * src/rules/dedupDateRule.ts — v2 no-duplicate business rule (Sheet-backed).
 *
 * A user may record at most ONE submission per activity date. If a RECORDED
 * submission with the same `userId` + `activityDateISO` already exists in the
 * `submissions` tab, reject "วันนี้บันทึกไปแล้ว"; otherwise pass. Only
 * status=`recorded` rows count — rejected rows never block a later attempt
 * (PLAN Phase 4 acceptance; OVERVIEW §6 — duplicate-date fraud guard).
 *
 * The Sheet scan is delegated to `sheetRepo.hasRecordedSubmission` (single home
 * for the submissions scan). A null `activityDateISO` here is treated as a pass
 * (skip): the backdate rule runs FIRST in the pipeline and already rejects null,
 * so dedup never needs to decide the null case.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */

import type { RuleResult } from '../types/ocrMetrics';
import { hasRecordedSubmission } from '../sheet/sheetRepo';

/** Reject reason: this user already has a recorded submission for that activity date. */
export const DUPLICATE_DATE_REASON = 'บันทึกวันที่นี้ไปแล้ว';

/**
 * Apply the no-duplicate rule for a (userId, activityDate) pair.
 * @param userId          LINE user id of the sender.
 * @param activityDateISO activity date (`yyyy-MM-dd`) from OCR, or null.
 * @returns `{ ok: false, reason }` when a recorded duplicate exists; else `{ ok: true }`.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */
export function dedupDateRule(
  userId: string,
  activityDateISO: string | null
): RuleResult {
  // Null/empty date → pass WITHOUT scanning: backdateRule runs first and already
  // rejects an unreadable date, so a pointless Sheet scan is avoided here.
  if (activityDateISO === null || activityDateISO === '') {
    return { ok: true };
  }
  // Take the date-only portion (drop any time component) for the lookup key.
  const dateOnly = activityDateISO.split('T')[0];
  if (hasRecordedSubmission(userId, dateOnly)) {
    return { ok: false, reason: DUPLICATE_DATE_REASON };
  }
  return { ok: true };
}
