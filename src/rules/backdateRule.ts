/**
 * src/rules/backdateRule.ts — v2 backdate business rule (pure function).
 *
 * A submission's activity date may be at most ONE day old (Asia/Bangkok,
 * date-only). Concretely, comparing the date-only portion of `activityDateISO`
 * against `todayISO` (both `yyyy-MM-dd`):
 *   - `activityDateISO` null        -> reject "อ่านวันที่จากรูปไม่ได้ …"
 *   - older than yesterday (< -1d)  -> reject "วันที่กิจกรรมเก่าเกินกำหนด …"
 *   - in the future  (> today)      -> reject "วันที่กิจกรรมไม่ถูกต้อง"
 *   - today or yesterday            -> pass
 * (PLAN Phase 4 acceptance; OVERVIEW §6 — fraud/backdate guard.)
 *
 * PURE by construction: `todayISO` is passed IN by the caller (computed via
 * `Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')` in main), so
 * this rule never calls `new Date()` and stays deterministic + RED-first testable.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */

import type { OcrMetrics, RuleResult } from '../types/ocrMetrics';

/** Reject reason: OCR could not read the activity date from the screenshot. */
export const DATE_UNREADABLE_REASON =
  'อ่านวันที่จากรูปไม่ได้ ส่งรูปที่เห็นวันที่ชัด';
/** Reject reason: the activity date is older than the ≤ 1-day backdate window. */
export const DATE_TOO_OLD_REASON =
  'วันที่กิจกรรมเก่าเกินกำหนด (ย้อนหลังได้ ≤ 1 วัน)';
/** Reject reason: the activity date is in the future (invalid). */
export const DATE_FUTURE_REASON = 'วันที่กิจกรรมไม่ถูกต้อง';

/**
 * Whole-day difference between two `yyyy-MM-dd` date-only strings.
 *
 * Returns `dateISO - todayISO` in days: `0` when equal, `-1` for yesterday,
 * positive for a future date. Date-only (no time/timezone component) — both
 * arguments are already normalised to Asia/Bangkok calendar dates by the caller.
 *
 * @param dateISO  the date-only portion (`yyyy-MM-dd`) to measure.
 * @param todayISO today's date-only string (`yyyy-MM-dd`), the reference point.
 * @returns whole days from `todayISO` to `dateISO` (signed).
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */
export function dayDiff(dateISO: string, todayISO: string): number {
  // Parse each `yyyy-MM-dd` as a date-only UTC midpoint so the subtraction is a
  // pure calendar-day difference — no local timezone / DST drift (both inputs
  // are already Asia/Bangkok calendar dates).
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const toUtcDays = (iso: string): number => {
    const [y, mo, d] = iso.split('-').map((part) => Number(part));
    return Date.UTC(y, mo - 1, d) / MS_PER_DAY;
  };
  return toUtcDays(dateISO) - toUtcDays(todayISO);
}

/**
 * Apply the backdate rule to an OCR reading.
 * @param m        OCR metrics (uses `activityDateISO`, date-only portion).
 * @param todayISO today's date in `yyyy-MM-dd` (Asia/Bangkok), passed by caller.
 * @returns `{ ok: true }` when today/yesterday; `{ ok: false, reason }` otherwise.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */
export function backdateRule(
  m: OcrMetrics,
  todayISO: string,
  maxBackdateDays = 1
): RuleResult {
  // OCR could not read a date → reject (no silent pass): the caller cannot record
  // an unverifiable activity date (PLAN Phase 4 / OVERVIEW risk #2).
  if (m.activityDateISO === null || m.activityDateISO === '') {
    return { ok: false, reason: DATE_UNREADABLE_REASON };
  }

  // Take the date-only portion (drop any time component) before comparing.
  const dateOnly = m.activityDateISO.split('T')[0];
  const d = dayDiff(dateOnly, todayISO);

  if (d > 0) {
    // Activity claimed in the future → invalid.
    return { ok: false, reason: DATE_FUTURE_REASON };
  }
  if (d < -maxBackdateDays) {
    // Older than the allowed backdate window (default 1 day; widened via the
    // MAX_BACKDATE_DAYS Script Property for testing/demo with old screenshots).
    return { ok: false, reason: DATE_TOO_OLD_REASON };
  }
  // Within [-maxBackdateDays, 0] → passes.
  return { ok: true };
}
