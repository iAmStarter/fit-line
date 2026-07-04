/**
 * test/phase-3/sheetRepo.dedup.spec.ts — phase-local unit: dedup lookups.
 *
 * RED-first (Phase 3, TDD). BLIND against the frozen `sheetRepo` stubs
 * (`imageHashExists` + `submissionExistsByMessageId` both throw NotImplemented).
 * Asserts BEHAVIOR from PLAN Phase 3 acceptance (lines 88, 90–91) + impl-phase-3
 * §2/§4 against the 14-col submissions schema (OVERVIEW §5):
 *
 *   - imageHashExists('H') → true when a submissions row carries imageHash='H';
 *     false when no row matches; false on an empty (header-only) sheet (no crash).
 *   - submissionExistsByMessageId('m') → the SAME row-scan on the messageId column.
 *   - the lookup is BY HEADER NAME (works even if column order shifts), not a
 *     hardcoded positional guess.
 *
 * MOCK suite: the external boundary is GAS SpreadsheetApp. We install a STATEFUL
 * per-tab double whose `submissions` tab is a rows backing array (row 0 = header,
 * so header-name mapping is genuine). A broken column resolution / off-by-one
 * scan fails the assertion — it is not papered over. mock/real flag: Sheet has no
 * cheap Node analogue → this in-memory Sheet IS the real boundary; the SAME
 * assertions run. We test the REAL sheetRepo functions (not a mock of them), so
 * this suite is RED now (NotImplemented) and GREEN after FILL. We never read the
 * impl body — only the public signatures.
 */

import {
  imageHashExists,
  submissionExistsByMessageId,
} from '../../src/sheet/sheetRepo';

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('imageHashExists — system-wide imageHash lookup', () => {
  it('true when a submissions row carries imageHash=H', () => {
    installSubmissions([
      row({ messageId: 'm1', imageHash: 'other' }),
      row({ messageId: 'm2', imageHash: 'H' }),
    ]);
    expect(imageHashExists('H')).toBe(true);
  });

  it('false when no row carries the hash', () => {
    installSubmissions([
      row({ messageId: 'm1', imageHash: 'other' }),
      row({ messageId: 'm2', imageHash: 'another' }),
    ]);
    expect(imageHashExists('H')).toBe(false);
  });

  it('false on an empty (header-only) sheet — no crash', () => {
    installSubmissions([]);
    expect(imageHashExists('H')).toBe(false);
  });
});

describe('submissionExistsByMessageId — messageId redelivery lookup', () => {
  it('true when a submissions row carries the messageId', () => {
    installSubmissions([
      row({ messageId: 'm1', imageHash: 'h1' }),
      row({ messageId: 'target-msg', imageHash: 'h2' }),
    ]);
    expect(submissionExistsByMessageId('target-msg')).toBe(true);
  });

  it('false when no row carries the messageId', () => {
    installSubmissions([row({ messageId: 'm1' }), row({ messageId: 'm2' })]);
    expect(submissionExistsByMessageId('target-msg')).toBe(false);
  });

  it('false on an empty (header-only) sheet — no crash', () => {
    installSubmissions([]);
    expect(submissionExistsByMessageId('target-msg')).toBe(false);
  });
});
