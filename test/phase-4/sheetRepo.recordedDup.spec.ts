/**
 * test/phase-4/sheetRepo.recordedDup.spec.ts — phase-local unit: recorded-dup scan.
 *
 * RED-first (Phase 4, TDD). BLIND against the frozen `hasRecordedSubmission` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 4 acceptance (line
 * 107) + impl notes (line 109 — "dedupDate lookup เฉพาะ status=recorded; rejected
 * ไม่นับ") against the 14-col submissions schema (OVERVIEW §5):
 *
 *   hasRecordedSubmission('U', '2026-07-04') →
 *     - TRUE  when a row has userId=U, activityDateISO=2026-07-04, status=recorded
 *     - FALSE when the matching (user+date) row is status=rejected (must not block)
 *     - FALSE when no row matches the user+date pair
 *     - FALSE on an empty (header-only) sheet (no crash)
 *   The scan matches on ALL THREE (userId AND activityDateISO AND status=recorded)
 *   and is BY HEADER NAME (survives a column reorder), not a positional guess.
 *
 * MOCK suite: the external boundary is GAS SpreadsheetApp. We install a STATEFUL
 * per-tab double whose `submissions` tab is a rows backing array (row 0 = header,
 * so header-name mapping is genuine). A broken 3-way match / status filter / off-
 * by-one scan fails the assertion — it is not papered over. mock/real flag: Sheet
 * has no cheap Node analogue → this in-memory Sheet IS the real boundary; the SAME
 * assertions run. We test the REAL sheetRepo function (not a mock of it), so this
 * suite is RED now (NotImplemented) and GREEN after FILL. We never read the impl
 * body — only the public signature.
 */

import { hasRecordedSubmission } from '../../src/sheet/sheetRepo';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** The canonical 14-col submissions header (OVERVIEW §5), row 0 of that tab. */
const SUBMISSIONS_HEADER = [
  'messageId',
  'userId',
  'name',
  'activityType',
  'activityDateISO',
  'submittedAtISO',
  'activeCaloriesKcal',
  'totalCaloriesKcal',
  'distanceKm',
  'source',
  'confidence',
  'status',
  'rejectReason',
  'imageHash',
];

/** Build a full 14-col data row keyed by a subset of header names. */
function row(values: Partial<Record<string, unknown>>): unknown[] {
  return SUBMISSIONS_HEADER.map((name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : ''
  );
}

/**
 * Install a stateful SpreadsheetApp double whose `submissions` tab returns
 * [header, ...dataRows] from getDataRange().getValues().
 */
function installSubmissions(dataRows: unknown[][]): void {
  const rows: unknown[][] = [SUBMISSIONS_HEADER, ...dataRows];
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((name: string): any => {
      if (name === 'submissions') {
        return {
          appendRow: jest.fn(),
          getDataRange: jest.fn(() => ({
            getValues: jest.fn((): unknown[][] => rows),
          })),
          getLastRow: jest.fn((): number => rows.length),
        };
      }
      return null;
    }),
  });
  // SHEET_ID lookup so getProp does not fail-fast.
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null =>
      key === 'SHEET_ID' ? 'sheet-abc' : null
    ),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  });
}

const USER = 'U';
const DATE = '2026-07-04';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hasRecordedSubmission — recorded (userId, activityDate) lookup', () => {
  it('true when a matching row is status=recorded', () => {
    installSubmissions([
      row({ userId: 'other', activityDateISO: DATE, status: 'recorded' }),
      row({ userId: USER, activityDateISO: DATE, status: 'recorded' }),
    ]);
    expect(hasRecordedSubmission(USER, DATE)).toBe(true);
  });

  it('false when the matching (user+date) row is status=rejected (rejected never blocks)', () => {
    installSubmissions([
      row({ userId: USER, activityDateISO: DATE, status: 'rejected' }),
    ]);
    expect(hasRecordedSubmission(USER, DATE)).toBe(false);
  });

  it('false when no row matches the user+date pair', () => {
    installSubmissions([
      // right user, wrong date
      row({ userId: USER, activityDateISO: '2026-07-01', status: 'recorded' }),
      // right date, wrong user
      row({ userId: 'other', activityDateISO: DATE, status: 'recorded' }),
    ]);
    expect(hasRecordedSubmission(USER, DATE)).toBe(false);
  });

  it('false on an empty (header-only) sheet — no crash', () => {
    installSubmissions([]);
    expect(hasRecordedSubmission(USER, DATE)).toBe(false);
  });
});
