/**
 * src/rules/calorieRule.ts — v1 calorie business rule (pure function).
 *
 * PASS iff `activeCaloriesKcal >= 150`; when `activeCaloriesKcal` is null, fall
 * back to `totalCaloriesKcal >= 150`. When both are null the reading is
 * unusable → reject "อ่านค่าแคลอรี่ไม่ได้". Below-threshold → reject
 * "แคลอรี่ต่ำกว่าเกณฑ์ 150". (PLAN Phase 1 acceptance; OVERVIEW §6.)
 *
 * Pure: input `OcrMetrics` → `RuleResult`, no side effects (RED-first testable).
 *
 * SCAFFOLD (Phase 1): stub only — body throws NotImplemented.
 */

import type { OcrMetrics, RuleResult } from '../types/ocrMetrics';

/** Minimum calories (kcal) required for a submission to pass. */
export const CALORIE_THRESHOLD_KCAL = 150;

/**
 * Apply the v1 calorie rule to an OCR reading.
 * @param m OCR metrics (uses `activeCaloriesKcal`, fallback `totalCaloriesKcal`).
 * @returns `{ ok: true }` on pass; `{ ok: false, reason }` on reject.
 */
export function calorieRule(m: OcrMetrics): RuleResult {
  // Primary input: active calories. When present it DECIDES the outcome — a
  // high total must never silently rescue an active reading below threshold.
  if (m.activeCaloriesKcal !== null) {
    if (m.activeCaloriesKcal >= CALORIE_THRESHOLD_KCAL) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `แคลอรี่ต่ำกว่าเกณฑ์ ${CALORIE_THRESHOLD_KCAL}`,
    };
  }

  // Fallback: active is null → judge on total calories.
  if (m.totalCaloriesKcal !== null) {
    if (m.totalCaloriesKcal >= CALORIE_THRESHOLD_KCAL) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `แคลอรี่ต่ำกว่าเกณฑ์ ${CALORIE_THRESHOLD_KCAL}`,
    };
  }

  // Both readings null → OCR could not extract a usable calorie value.
  return { ok: false, reason: 'อ่านค่าแคลอรี่ไม่ได้' };
}
