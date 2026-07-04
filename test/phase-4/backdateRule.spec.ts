/**
 * test/phase-4/backdateRule.spec.ts — phase-local unit: backdate ≤ 1-day rule.
 *
 * RED-first (Phase 4, TDD). BLIND against the frozen `backdateRule` stubs
 * (`dayDiff` + `backdateRule` both throw NotImplemented). Asserts BEHAVIOR from
 * PLAN Phase 4 acceptance (lines 104–108) + OVERVIEW §6 (backdate fraud guard):
 *
 *   With todayISO fixed at '2026-07-04' (date-only, Asia/Bangkok):
 *     - activityDateISO 2026-07-04 (today)        → { ok: true }
 *     - activityDateISO 2026-07-03 (yesterday)    → { ok: true }  (≤ 1 day back)
 *     - activityDateISO 2026-07-02 (2 days back)  → reject DATE_TOO_OLD_REASON
 *     - activityDateISO 2026-07-05 (future)       → reject DATE_FUTURE_REASON
 *     - activityDateISO null                      → reject DATE_UNREADABLE_REASON
 *   dayDiff sanity: today→0, tomorrow→+1, yesterday→-1 (signed dateISO - todayISO).
 *
 * PURE unit: `backdateRule` takes `todayISO` IN (no `new Date()`), so it is fully
 * deterministic — no GAS boundary is exercised here. We import the reason CONSTS
 * from the source (never copy-paste the Thai strings) so a reason-text change
 * lands in one place. We test the REAL function (not a mock), so this suite is RED
 * now (NotImplemented) and GREEN after FILL. We never read the impl body.
 */

import {
  backdateRule,
  dayDiff,
  DATE_UNREADABLE_REASON,
  DATE_TOO_OLD_REASON,
  DATE_FUTURE_REASON,
} from '../../src/rules/backdateRule';
import { makeOcrMetrics } from '../support/ocrFixture';

/** Fixed reference "today" (date-only, Asia/Bangkok) for every case below. */
const TODAY = '2026-07-04';

/** Build an OcrMetrics reading whose only relevant field is activityDateISO. */
function reading(activityDateISO: string | null) {
  return makeOcrMetrics({ activityDateISO });
}

describe('dayDiff — signed whole-day difference (dateISO - todayISO)', () => {
  it('same day → 0', () => {
    expect(dayDiff('2026-07-04', TODAY)).toBe(0);
  });

  it('tomorrow → +1', () => {
    expect(dayDiff('2026-07-05', TODAY)).toBe(1);
  });

  it('yesterday → -1', () => {
    expect(dayDiff('2026-07-03', TODAY)).toBe(-1);
  });
});

describe('backdateRule — ≤ 1-day backdate window', () => {
  it('today (2026-07-04) → ok', () => {
    expect(backdateRule(reading('2026-07-04'), TODAY)).toEqual({ ok: true });
  });

  it('yesterday (2026-07-03) → ok (within ≤ 1 day back)', () => {
    expect(backdateRule(reading('2026-07-03'), TODAY)).toEqual({ ok: true });
  });

  it('two days old (2026-07-02) → reject DATE_TOO_OLD_REASON', () => {
    expect(backdateRule(reading('2026-07-02'), TODAY)).toEqual({
      ok: false,
      reason: DATE_TOO_OLD_REASON,
    });
  });

  it('future (2026-07-05) → reject DATE_FUTURE_REASON', () => {
    expect(backdateRule(reading('2026-07-05'), TODAY)).toEqual({
      ok: false,
      reason: DATE_FUTURE_REASON,
    });
  });

  it('null activityDate → reject DATE_UNREADABLE_REASON (no silent pass)', () => {
    expect(backdateRule(reading(null), TODAY)).toEqual({
      ok: false,
      reason: DATE_UNREADABLE_REASON,
    });
  });
});
