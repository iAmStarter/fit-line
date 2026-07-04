/**
 * test/phase-1/calorieRule.spec.ts — phase-local unit: v1 calorie rule.
 *
 * RED-first (Phase 1, TDD). Asserts BEHAVIOR from PLAN Phase 1 acceptance +
 * OVERVIEW §6:
 *   - PASS iff activeCaloriesKcal >= 150 (boundary 150 passes, 149 fails).
 *   - active null -> fall back to totalCaloriesKcal >= 150.
 *   - active present takes PRECEDENCE over total (active<150 fails even if
 *     total<150 too; we do not silently rescue with total when active exists).
 *   - both null -> reject with reason "อ่านค่าแคลอรี่ไม่ได้".
 *   - below-threshold reason references the threshold "150".
 *
 * The threshold constant is asserted THROUGH behaviour (boundary at the
 * constant's value passes; one below fails) so no assertion is green on the
 * bare stub — every test drives calorieRule().
 *
 * calorieRule is a PURE function (OcrMetrics -> RuleResult) — no GAS globals,
 * no mock boundary. The mock/real distinction is n/a for a pure rule: the same
 * assertions ARE the real suite. We never read the impl body (stub throws
 * NotImplemented) — only the public signature.
 */

import { calorieRule, CALORIE_THRESHOLD_KCAL } from '../../src/rules/calorieRule';
import { makeOcrMetrics } from '../support/ocrFixture';

describe('calorieRule — threshold boundary is driven by the constant', () => {
  it('passes exactly at CALORIE_THRESHOLD_KCAL and fails one below', () => {
    // Behaviour assertion tied to the constant: guards both the value (150)
    // AND that the rule uses an inclusive >= boundary. Fails on the stub.
    const atThreshold = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: CALORIE_THRESHOLD_KCAL })
    );
    const belowThreshold = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: CALORIE_THRESHOLD_KCAL - 1 })
    );
    expect(CALORIE_THRESHOLD_KCAL).toBe(150);
    expect(atThreshold.ok).toBe(true);
    expect(belowThreshold.ok).toBe(false);
  });
});

describe('calorieRule — active calories (primary input)', () => {
  it('active=200 -> ok:true', () => {
    const r = calorieRule(makeOcrMetrics({ activeCaloriesKcal: 200 }));
    expect(r.ok).toBe(true);
  });

  it('active=150 -> ok:true (boundary is inclusive)', () => {
    const r = calorieRule(makeOcrMetrics({ activeCaloriesKcal: 150 }));
    expect(r.ok).toBe(true);
  });

  it('active=149 -> ok:false, reason references the 150 threshold', () => {
    const r = calorieRule(makeOcrMetrics({ activeCaloriesKcal: 149 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBeDefined();
    expect(r.reason).toContain('150');
  });
});

describe('calorieRule — fallback to total when active is null', () => {
  it('active=null, total=160 -> ok:true (uses total)', () => {
    const r = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: null, totalCaloriesKcal: 160 })
    );
    expect(r.ok).toBe(true);
  });

  it('active=null, total=140 -> ok:false (total below threshold)', () => {
    const r = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: null, totalCaloriesKcal: 140 })
    );
    expect(r.ok).toBe(false);
  });
});

describe('calorieRule — active takes precedence over total', () => {
  it('active=100, total=140 -> ok:false (both fail; active decides)', () => {
    const r = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: 100, totalCaloriesKcal: 140 })
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('150');
  });

  it('active=100, total=999 -> ok:false (active present & below; do NOT rescue with total)', () => {
    // Precedence guard: when active exists and is below threshold, the rule
    // fails; a high total must NOT silently pass it.
    const r = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: 100, totalCaloriesKcal: 999 })
    );
    expect(r.ok).toBe(false);
  });
});

describe('calorieRule — both calorie readings null (unusable OCR)', () => {
  it('active=null, total=null -> ok:false, reason "อ่านค่าแคลอรี่ไม่ได้"', () => {
    const r = calorieRule(
      makeOcrMetrics({ activeCaloriesKcal: null, totalCaloriesKcal: null })
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('อ่านค่าแคลอรี่ไม่ได้');
  });
});
