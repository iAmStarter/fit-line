/**
 * test/phase-4/dedupDateRule.spec.ts — phase-local unit: no-duplicate-date rule.
 *
 * RED-first (Phase 4, TDD). BLIND against the frozen `dedupDateRule` stub (throws
 * NotImplemented). Asserts BEHAVIOR from PLAN Phase 4 acceptance (line 107) +
 * OVERVIEW §6 (duplicate-date fraud guard):
 *
 *   - hasRecordedSubmission → true  → reject DUPLICATE_DATE_REASON
 *   - hasRecordedSubmission → false → { ok: true }
 *   - activityDateISO null          → { ok: true } (skip; backdateRule already
 *     rejects null earlier in the pipeline) AND hasRecordedSubmission is NEVER
 *     called for a null date (no pointless Sheet scan).
 *
 * MOCK suite: the rule's ONLY collaborator/boundary is the Sheet scan
 * `sheetRepo.hasRecordedSubmission`. We mock THAT function so this unit isolates
 * the rule's decision from the Sheet scan (whose own behaviour is covered by
 * sheetRepo.recordedDup.spec.ts). We import the reason CONST from source (never
 * copy-paste the Thai string). We test the REAL rule (not a mock of it), so this
 * suite is RED now (NotImplemented) and GREEN after FILL. We never read the impl
 * body — only the public signatures.
 */

import {
  dedupDateRule,
  DUPLICATE_DATE_REASON,
} from '../../src/rules/dedupDateRule';
import * as sheetRepo from '../../src/sheet/sheetRepo';

// Mock ONLY the external boundary: the submissions Sheet scan. The rule's own
// decision logic runs REAL.
jest.mock('../../src/sheet/sheetRepo');

const mockedRepo = sheetRepo as jest.Mocked<typeof sheetRepo>;

const USER = 'Uuser1';
const DATE = '2026-07-04';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dedupDateRule — recorded (userId, activityDate) duplicate guard', () => {
  it('recorded duplicate exists → reject DUPLICATE_DATE_REASON', () => {
    mockedRepo.hasRecordedSubmission.mockReturnValue(true);

    expect(dedupDateRule(USER, DATE)).toEqual({
      ok: false,
      reason: DUPLICATE_DATE_REASON,
    });
    expect(mockedRepo.hasRecordedSubmission).toHaveBeenCalledWith(USER, DATE);
  });

  it('no recorded duplicate → ok', () => {
    mockedRepo.hasRecordedSubmission.mockReturnValue(false);

    expect(dedupDateRule(USER, DATE)).toEqual({ ok: true });
    expect(mockedRepo.hasRecordedSubmission).toHaveBeenCalledWith(USER, DATE);
  });

  it('null activityDate → ok (skip) AND does NOT scan the Sheet', () => {
    // backdateRule rejects null earlier; dedup must not do a pointless scan.
    expect(dedupDateRule(USER, null)).toEqual({ ok: true });
    expect(mockedRepo.hasRecordedSubmission).not.toHaveBeenCalled();
  });
});
