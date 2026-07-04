/**
 * test/phase-4/rulePipeline.spec.ts — phase-local unit: post-OCR rule pipeline.
 *
 * RED-first (Phase 4, TDD). BLIND against the frozen `evaluateSubmissionRules`
 * stub (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 4 acceptance
 * (line 108, rule-order determinism) + rulePipeline contract (calorie → backdate
 * → dedupDate, FIRST fail wins, short-circuit):
 *
 *   - calorie FAIL (active=100,total=140) AND date too-old → CALORIE reason
 *     (calorie runs first — the earlier rule's reason wins, deterministic).
 *   - calorie ok (active=200) + backdate FAIL (date 2 days old) → backdate reason.
 *   - calorie ok + backdate ok + dedup FAIL (hasRecordedSubmission→true) → dedup.
 *   - all pass → { ok: true }.
 *
 * SUITE STYLE: drive the pipeline REAL (calorieRule + backdateRule + dedupDateRule
 * all run), mocking ONLY the Sheet boundary `hasRecordedSubmission` and passing a
 * fixed `todayISO`. This exercises the actual wiring/order, not a re-mock of each
 * sub-rule — a mis-ordered or non-short-circuiting pipeline genuinely fails here.
 * Reason strings come from the source CONSTS / threshold constant (never copy-
 * pasted). RED now (backdate/dedup/pipeline stubs throw NotImplemented); GREEN
 * after FILL. We never read impl bodies — only public signatures.
 */

import { evaluateSubmissionRules } from '../../src/rules/rulePipeline';
import {
  DATE_TOO_OLD_REASON,
} from '../../src/rules/backdateRule';
import { DUPLICATE_DATE_REASON } from '../../src/rules/dedupDateRule';
import { CALORIE_THRESHOLD_KCAL } from '../../src/rules/calorieRule';
import * as sheetRepo from '../../src/sheet/sheetRepo';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock ONLY the Sheet boundary the dedup rule delegates to; calorie + backdate +
// dedup DECISION logic all run REAL through the pipeline.
jest.mock('../../src/sheet/sheetRepo');

const mockedRepo = sheetRepo as jest.Mocked<typeof sheetRepo>;

/** Fixed reference "today" (date-only, Asia/Bangkok). */
const TODAY = '2026-07-04';
const USER = 'Uuser1';

/** The calorie reject reason, derived from the source threshold constant. */
const CALORIE_REJECT_REASON = `แคลอรี่ต่ำกว่าเกณฑ์ ${CALORIE_THRESHOLD_KCAL}`;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: not a recorded duplicate (dedup passes) unless a test overrides.
  mockedRepo.hasRecordedSubmission.mockReturnValue(false);
});

describe('evaluateSubmissionRules — order + short-circuit (first fail wins)', () => {
  it('calorie fail AND date too-old → CALORIE reason (calorie runs first)', () => {
    // active<150 AND date 2 days old: BOTH the calorie rule and the backdate rule
    // would fail — the pipeline must return the CALORIE reason (earlier rule).
    const m = makeOcrMetrics({
      activeCaloriesKcal: 100,
      totalCaloriesKcal: 140,
      activityDateISO: '2026-07-02',
    });

    expect(evaluateSubmissionRules(m, USER, TODAY)).toEqual({
      ok: false,
      reason: CALORIE_REJECT_REASON,
    });
    // short-circuit: the Sheet scan must NOT run once calories already failed.
    expect(mockedRepo.hasRecordedSubmission).not.toHaveBeenCalled();
  });

  it('calorie ok + backdate fail (2 days old) → backdate reason', () => {
    const m = makeOcrMetrics({
      activeCaloriesKcal: 200,
      activityDateISO: '2026-07-02',
    });

    expect(evaluateSubmissionRules(m, USER, TODAY)).toEqual({
      ok: false,
      reason: DATE_TOO_OLD_REASON,
    });
    // short-circuit: backdate failed before dedup → no Sheet scan.
    expect(mockedRepo.hasRecordedSubmission).not.toHaveBeenCalled();
  });

  it('calorie ok + backdate ok + dedup fail → dedup reason', () => {
    mockedRepo.hasRecordedSubmission.mockReturnValue(true);
    const m = makeOcrMetrics({
      activeCaloriesKcal: 200,
      activityDateISO: '2026-07-04',
    });

    expect(evaluateSubmissionRules(m, USER, TODAY)).toEqual({
      ok: false,
      reason: DUPLICATE_DATE_REASON,
    });
    expect(mockedRepo.hasRecordedSubmission).toHaveBeenCalledWith(
      USER,
      '2026-07-04'
    );
  });

  it('all rules pass → { ok: true }', () => {
    const m = makeOcrMetrics({
      activeCaloriesKcal: 200,
      activityDateISO: '2026-07-04',
    });

    expect(evaluateSubmissionRules(m, USER, TODAY)).toEqual({ ok: true });
  });
});
