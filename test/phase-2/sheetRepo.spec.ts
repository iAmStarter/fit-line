/**
 * test/phase-2/sheetRepo.spec.ts — phase-local: submissions + employees writes.
 *
 * RED-first (Phase 2, TDD). BLIND against the frozen `sheetRepo` stubs
 * (appendSubmission / ensureEmployee / PLACEHOLDER_EMPLOYEE_NAME all throw
 * NotImplemented). Asserts BEHAVIOR from PLAN Phase 2 acceptance + OVERVIEW §5
 * data model (14-col submissions / 3-col employees):
 *
 *   - appendSubmission(ctx) → a row is appended to the `submissions` tab whose
 *     header-mapped cells carry: messageId, userId, activeCaloriesKcal=200,
 *     status='recorded', name=PLACEHOLDER_EMPLOYEE_NAME, rejectReason='',
 *     imageHash=ctx.imageHash (Phase 3 threads the sha256 hex through the ctx —
 *     no longer a hardcoded ''). (write-by-header-name, OVERVIEW §5.)
 *   - null OCR readings (distanceKm=null) → EMPTY cell '' (never the string
 *     'null'). (PLAN impl notes — "map ค่า null OCR → cell ว่าง".)
 *   - ensureEmployee(userId,name): userId absent → appends [userId,name,<iso>] to
 *     `employees`; userId already present → NO append (row count unchanged).
 *     (PLAN Phase 2 — register once, no duplicate.)
 *
 * MOCK suite: the external boundary is GAS SpreadsheetApp. We install a STATEFUL
 * per-tab double on the harness: each tab has a `rows` backing array (row 0 =
 * header, so schema mapping is genuine) + an appendRow spy that pushes onto it.
 * A broken column mapping / missing status / wrong dedup fails the assertion — it
 * is not papered over. "real" == this in-memory Sheet boundary (Sheet has no
 * cheap Node analogue); the SAME assertions run. We never read the impl body.
 */

import {
  appendSubmission,
  ensureEmployee,
  PLACEHOLDER_EMPLOYEE_NAME,
} from '../../src/sheet/sheetRepo';
import { makeStashedContext } from '../support/stashFixture';

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

/** The canonical 3-col employees header (OVERVIEW §5), row 0 of that tab. */
const EMPLOYEES_HEADER = ['userId', 'name', 'registeredAtISO'];

/** A stateful in-memory tab: rows backing array + an appendRow spy. */
interface FakeTab {
  rows: unknown[][];
  appendRow: jest.Mock;
}

/** Build a fake tab seeded with a header row (+ optional data rows). */
function makeTab(header: unknown[], dataRows: unknown[][] = []): FakeTab {
  const rows: unknown[][] = [header, ...dataRows.map((r) => [...r])];
  const appendRow = jest.fn((row: unknown[]): void => {
    rows.push([...row]);
  });
  return { rows, appendRow };
}

/** Wrap a FakeTab as a GAS Sheet double (appendRow + getDataRange().getValues()). */
function asSheet(tab: FakeTab): any {
  return {
    appendRow: tab.appendRow,
    getDataRange: jest.fn(() => ({
      getValues: jest.fn((): unknown[][] => tab.rows),
    })),
    getLastRow: jest.fn((): number => tab.rows.length),
  };
}

let submissionsTab: FakeTab;
let employeesTab: FakeTab;

/**
 * Install a stateful SpreadsheetApp double routing by tab name. Seed employees
 * with `existingUserIds` so the upsert dedup path is genuinely exercised.
 */
function installSheet(existingUserIds: string[] = []): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  employeesTab = makeTab(
    EMPLOYEES_HEADER,
    existingUserIds.map((u) => [u, 'seeded', '2026-06-30T00:00:00Z'])
  );
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') return asSheet(submissionsTab);
      if (tabName === 'employees') return asSheet(employeesTab);
      return null;
    }),
  });
  // SHEET_ID lookup: hand the repo a value so getProp doesn't fail-fast.
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null =>
      key === 'SHEET_ID' ? 'sheet-abc' : null
    ),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  });
}

/** Map the single appended submissions row by the 14-col header names. */
function appendedSubmission(): Record<string, unknown> {
  expect(submissionsTab.appendRow).toHaveBeenCalled();
  const row = submissionsTab.appendRow.mock.calls[0][0] as unknown[];
  expect(row.length).toBe(SUBMISSIONS_HEADER.length);
  const mapped: Record<string, unknown> = {};
  SUBMISSIONS_HEADER.forEach((name, idx) => {
    mapped[name] = row[idx];
  });
  return mapped;
}

beforeEach(() => {
  jest.clearAllMocks();
  installSheet();
});

describe('appendSubmission — writes the 14-col submissions row by header name', () => {
  it('maps ctx → header-mapped cells (messageId, userId, active=200, recorded)', () => {
    const ctx = makeStashedContext(
      { messageId: 'm1', userId: 'U1' },
      { activeCaloriesKcal: 200, activityDateISO: '2026-07-04' }
    );

    appendSubmission(ctx);

    const cell = appendedSubmission();
    expect(cell.messageId).toBe('m1');
    expect(cell.userId).toBe('U1');
    expect(cell.activeCaloriesKcal).toBe(200);
    expect(cell.activityDateISO).toBe('2026-07-04');
    expect(cell.status).toBe('recorded');
    expect(cell.name).toBe(PLACEHOLDER_EMPLOYEE_NAME);
    expect(cell.rejectReason).toBe('');
    // imageHash now sources from ctx.imageHash (Phase 3), not a hardcoded ''.
    expect(cell.imageHash).toBe('hash_m1');
  });

  it('appends exactly one row to the submissions tab', () => {
    appendSubmission(makeStashedContext());
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    // header (1) + the appended row (1)
    expect(submissionsTab.rows.length).toBe(2);
  });
});

describe('appendSubmission — null OCR readings become empty cells', () => {
  it('distanceKm=null → cell is empty string, NOT the string "null"', () => {
    const ctx = makeStashedContext(
      {},
      { distanceKm: null, activeCaloriesKcal: 200 }
    );

    appendSubmission(ctx);

    const cell = appendedSubmission();
    expect(cell.distanceKm).toBe('');
    expect(cell.distanceKm).not.toBe('null');
    expect(cell.distanceKm).not.toBeNull();
  });
});

describe('ensureEmployee — register once (no duplicate)', () => {
  it('appends [userId, name, <iso>] when the userId is absent', () => {
    installSheet([]); // employees tab: header only, no U2

    ensureEmployee('U2', 'n');

    expect(employeesTab.appendRow).toHaveBeenCalledTimes(1);
    const row = employeesTab.appendRow.mock.calls[0][0] as unknown[];
    expect(row.length).toBe(EMPLOYEES_HEADER.length);
    expect(row[0]).toBe('U2');
    expect(row[1]).toBe('n');
    // registeredAtISO is an ISO-ish timestamp string (not empty)
    expect(typeof row[2]).toBe('string');
    expect((row[2] as string).length).toBeGreaterThan(0);
  });

  it('does NOT append when the userId already exists (row count unchanged)', () => {
    installSheet(['U2']); // employees tab already carries U2

    ensureEmployee('U2', 'n');

    expect(employeesTab.appendRow).not.toHaveBeenCalled();
    // still header + the one seeded row
    expect(employeesTab.rows.length).toBe(2);
  });
});
