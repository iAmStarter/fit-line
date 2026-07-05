/**
 * src/rules/rulePipeline.ts — post-OCR business-rule pipeline (Phase 4).
 *
 * Runs the confirm-path rules in a DETERMINISTIC, short-circuiting order and
 * returns the FIRST failing `RuleResult` (else `{ ok: true }`):
 *
 *   1. calorieRule   (Phase 1 — pure)              — reading is worth recording
 *   2. backdateRule  (Phase 4 — pure, needs today) — activity date ≤ 1 day old
 *   3. dedupDateRule (Phase 4 — Sheet-backed)      — no recorded duplicate/date
 *
 * Short-circuit at the first failure guarantees a stable reject reason (e.g. a
 * low-calorie AND too-old reading rejects on calories, the earlier rule) — PLAN
 * Phase 4 rule-order determinism. `todayISO` is passed IN (computed by main via
 * `Utilities.formatDate`) so the pure rules never touch `new Date()`.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */

import type { OcrMetrics, RuleResult } from '../types/ocrMetrics';
import { calorieRule } from './calorieRule';
import { backdateRule } from './backdateRule';
import { dedupDateRule } from './dedupDateRule';

/**
 * Evaluate the full post-OCR rule pipeline for a submission.
 * @param m        OCR metrics (calorie + activity-date inputs).
 * @param userId   LINE user id of the sender (dedup key).
 * @param todayISO today's date in `yyyy-MM-dd` (Asia/Bangkok), for the backdate rule.
 * @returns the first failing `RuleResult`, or `{ ok: true }` if all rules pass.
 *
 * SCAFFOLD (Phase 4): stub only — body throws NotImplemented.
 */
export function evaluateSubmissionRules(
  m: OcrMetrics,
  userId: string,
  todayISO: string,
  maxBackdateDays = 1
): RuleResult {
  // 1. Calorie rule (pure) — short-circuit on the first failing rule so the
  //    reject reason is deterministic (earlier rule wins).
  const calorie = calorieRule(m);
  if (!calorie.ok) {
    return calorie;
  }
  // 2. Backdate rule (pure) — activity date within the backdate window
  //    (default 1 day; widened via MAX_BACKDATE_DAYS for testing/demo).
  const backdate = backdateRule(m, todayISO, maxBackdateDays);
  if (!backdate.ok) {
    return backdate;
  }
  // 3. Dedup rule (Sheet-backed) — reached ONLY when calorie + backdate pass, so
  //    the submissions scan never runs on an earlier failure.
  return dedupDateRule(userId, m.activityDateISO);
}
