/**
 * test/phase-5/sheetRepo.summary.spec.ts — phase-local: submission aggregate
 * queries (countSubmissions + recentDailyValues).
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `countSubmissions` /
 * `recentDailyValues` stubs (throw NotImplemented). Asserts BEHAVIOR from PLAN
 * Phase 5 acceptance (lines 122–123, 125) + sheetRepo contract:
 *
 *   countSubmissions('U','2026-07-08')  (todayISO = a Wednesday):
 *     - week  = RECORDED rows whose activityDate ∈ Mon..today of that week
 *               (Mon 2026-07-06, 07, 08). rejected rows excluded.
 *     - month = RECORDED rows sharing yyyy-MM = '2026-07'.
 *     - total = ALL recorded rows for the user (any date). rejected excluded.
 *     - empty sheet → {0,0,0}.
 *
 *   recentDailyValues('U','2026-07-08'):
 *     - length 7 (default), index 0 = oldest (today-6 = 2026-07-02),
 *       last = today (2026-07-08).
 *     - each entry = SUM over that user's recorded rows on that date of
 *       activeCaloriesKcal (fallback totalCaloriesKcal, null → 0).
 *     - a day with no rows contributes 0.
 *
 * MOCK suite: the ONLY external boundary is the GAS SpreadsheetApp datastore —
 * replaced by a stateful in-memory double (the "real" local boundary; a Sheet has
 * no cheap Node analogue). All aggregate logic runs unmocked. mock/real flag: the
 * SAME assertions run against the SAME double. We never read the impl body — only
 * the public signatures.
 */

import {
  countSubmissions,
  recentDailyValues,
} from '../../src/sheet/sheetRepo';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const TODAY = '2026-07-08'; // a Wednesday; week Mon..today = 07-06 / 07-07 / 07-08

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

/** A submissions row spec (only the columns the aggregates read matter). */
interface RowSpec {
  userId: string;
  activityDateISO: string;
  status: string;
  activeCaloriesKcal?: number | null;
  totalCaloriesKcal?: number | null;
}

/** Build a full-width submissions row from a sparse spec (header-name mapped). */
function row(spec: RowSpec): unknown[] {
  const byName: Record<string, unknown> = {
    messageId: `m-${Math.random().toString(36).slice(2, 8)}`,
    userId: spec.userId,
    name: 'x',
    activityType: 'Running',
    activityDateISO: spec.activityDateISO,
    submittedAtISO: `${spec.activityDateISO}T08:00:00Z`,
    activeCaloriesKcal:
      spec.activeCaloriesKcal === undefined ? 200 : spec.activeCaloriesKcal,
    totalCaloriesKcal:
      spec.totalCaloriesKcal === undefined ? 260 : spec.totalCaloriesKcal,
    distanceKm: 5,
    source: 'mock',
    confidence: 0.9,
    status: spec.status,
    rejectReason: '',
    imageHash: '',
  };
  return SUBMISSIONS_HEADER.map((h) => byName[h]);
}

/** Install a stateful SpreadsheetApp double seeded with the given submissions rows. */
function installSheet(dataRows: unknown[][]): void {
  const rows: unknown[][] = [SUBMISSIONS_HEADER, ...dataRows];
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') {
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

describe('countSubmissions — week / month / total (recorded only)', () => {
  it('counts recorded rows into week (Mon..today), month (yyyy-MM), total', () => {
    installSheet([
      // this week (Mon..Wed 2026-07-06..08) — recorded
      row({ userId: 'U', activityDateISO: '2026-07-06', status: 'recorded' }),
      row({ userId: 'U', activityDateISO: '2026-07-07', status: 'recorded' }),
      row({ userId: 'U', activityDateISO: '2026-07-08', status: 'recorded' }),
      // same month, earlier week — counts to month + total, NOT week
      row({ userId: 'U', activityDateISO: '2026-07-01', status: 'recorded' }),
      row({ userId: 'U', activityDateISO: '2026-07-03', status: 'recorded' }),
      // previous month — counts to total only
      row({ userId: 'U', activityDateISO: '2026-06-20', status: 'recorded' }),
    ]);

    const counts = countSubmissions('U', TODAY);
    expect(counts.week).toBe(3);
    expect(counts.month).toBe(5);
    expect(counts.total).toBe(6);
  });

  it('excludes REJECTED rows from every bucket', () => {
    installSheet([
      row({ userId: 'U', activityDateISO: '2026-07-08', status: 'recorded' }),
      row({ userId: 'U', activityDateISO: '2026-07-07', status: 'rejected' }),
      row({ userId: 'U', activityDateISO: '2026-06-15', status: 'rejected' }),
    ]);

    const counts = countSubmissions('U', TODAY);
    expect(counts.week).toBe(1);
    expect(counts.month).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('counts ONLY the requested user (no leak from other users)', () => {
    installSheet([
      row({ userId: 'U', activityDateISO: '2026-07-08', status: 'recorded' }),
      row({ userId: 'V', activityDateISO: '2026-07-08', status: 'recorded' }),
      row({ userId: 'V', activityDateISO: '2026-07-07', status: 'recorded' }),
    ]);

    const counts = countSubmissions('U', TODAY);
    expect(counts.week).toBe(1);
    expect(counts.month).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('excludes days BEFORE Monday of the current week from the week bucket', () => {
    installSheet([
      // 2026-07-05 is the Sunday of the PREVIOUS week (week Mon = 07-06).
      row({ userId: 'U', activityDateISO: '2026-07-05', status: 'recorded' }),
      row({ userId: 'U', activityDateISO: '2026-07-06', status: 'recorded' }),
    ]);

    const counts = countSubmissions('U', TODAY);
    expect(counts.week).toBe(1); // only 07-06 (Monday) is in-week
    expect(counts.month).toBe(2);
    expect(counts.total).toBe(2);
  });

  it('empty (header-only) sheet → {0,0,0}', () => {
    installSheet([]);
    const counts = countSubmissions('U', TODAY);
    expect(counts).toEqual({ week: 0, month: 0, total: 0 });
  });
});

describe('recentDailyValues — 7-day per-day summed calories (oldest → today)', () => {
  it('returns length 7 with index 0 = oldest (today-6) and last = today', () => {
    installSheet([
      // today (2026-07-08): two recorded rows → summed
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: 200,
      }),
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: 100,
      }),
      // oldest in-window day (today-6 = 2026-07-02)
      row({
        userId: 'U',
        activityDateISO: '2026-07-02',
        status: 'recorded',
        activeCaloriesKcal: 150,
      }),
    ]);

    const values = recentDailyValues('U', TODAY);
    expect(values).toHaveLength(7);
    // index 0 = 2026-07-02 (oldest) → 150
    expect(values[0]).toBe(150);
    // last index = today 2026-07-08 → 200 + 100 = 300
    expect(values[6]).toBe(300);
  });

  it('a day with no recorded rows contributes 0', () => {
    installSheet([
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: 200,
      }),
    ]);
    const values = recentDailyValues('U', TODAY);
    // 2026-07-02..07 have no rows → 0; only today has a value.
    expect(values.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(values[6]).toBe(200);
  });

  it('falls back to total when active is null, and null→0', () => {
    installSheet([
      // active null → fall back to total 170 on today
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: null,
        totalCaloriesKcal: 170,
      }),
      // both null → contributes 0 (also today, summed alongside the 170)
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: null,
        totalCaloriesKcal: null,
      }),
    ]);
    const values = recentDailyValues('U', TODAY);
    expect(values[6]).toBe(170);
  });

  it('excludes rejected rows and other users from the daily sums', () => {
    installSheet([
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'rejected',
        activeCaloriesKcal: 999,
      }),
      row({
        userId: 'V',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: 888,
      }),
      row({
        userId: 'U',
        activityDateISO: '2026-07-08',
        status: 'recorded',
        activeCaloriesKcal: 120,
      }),
    ]);
    const values = recentDailyValues('U', TODAY);
    expect(values[6]).toBe(120); // rejected 999 + other-user 888 excluded
  });

  it('empty sheet → all-zero array of length 7 (no crash)', () => {
    installSheet([]);
    const values = recentDailyValues('U', TODAY);
    expect(values).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
