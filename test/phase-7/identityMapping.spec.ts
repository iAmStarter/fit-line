/**
 * test/phase-7/identityMapping.spec.ts — phase-local: the mapped-name write path.
 *
 * RED-first (Phase 7 FINAL, TDD). BLIND against the frozen `resolveEmployeeName`
 * stub (throws NotImplemented) that `appendSubmission` now calls to fill the
 * `name` cell. Asserts BEHAVIOR from PLAN Phase 7 acceptance (line 159 — "ใช้
 * สมชาย ไม่ใช่ placeholder"):
 *
 *   - WITH roster (U1 → สมชาย): appendSubmission(ctx{userId:'U1'}) writes a
 *     submissions row whose `name` cell === 'สมชาย' (the mapped path, NOT the
 *     placeholder).
 *   - WITHOUT a roster entry for the sender: the `name` cell === the placeholder
 *     (the negative case — unrostered user still records, degraded to placeholder).
 *
 * MOCK suite: the external boundary is GAS SpreadsheetApp. A STATEFUL per-tab
 * double routes `submissions` (14-col, header row 0 so the mapping is genuine) +
 * `roster` (2-col) by name; appendRow pushes onto the tab's backing array. A
 * broken name mapping / wrong column fails the assertion — not papered over.
 * "real" == this in-memory Sheet boundary (Sheet has no cheap Node analogue); the
 * SAME assertions run. We never read the impl body — only the public signature.
 */

import {
  appendSubmission,
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

/** The 2-col roster header (userId · name), row 0 of the `roster` tab. */
const ROSTER_HEADER = ['userId', 'name'];

interface FakeTab {
  rows: unknown[][];
  appendRow: jest.Mock;
}

function makeTab(header: unknown[], dataRows: unknown[][] = []): FakeTab {
  const rows: unknown[][] = [header, ...dataRows.map((r) => [...r])];
  const appendRow = jest.fn((row: unknown[]): void => {
    rows.push([...row]);
  });
  return { rows, appendRow };
}

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
let rosterTab: FakeTab;

/** Install a stateful SpreadsheetApp double; seed the roster with `rosterRows`. */
function installSheet(rosterRows: unknown[][]): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  rosterTab = makeTab(ROSTER_HEADER, rosterRows);
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') return asSheet(submissionsTab);
      if (tabName === 'roster') return asSheet(rosterTab);
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
});

describe('appendSubmission — records the mapped roster name (Phase 7)', () => {
  it("rostered U1 → the submissions `name` cell is 'สมชาย' (NOT placeholder)", () => {
    installSheet([['U1', 'สมชาย']]);
    const ctx = makeStashedContext({ userId: 'U1' });

    appendSubmission(ctx);

    const cell = appendedSubmission();
    expect(cell.name).toBe('สมชาย');
    expect(cell.name).not.toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });
});

describe('appendSubmission — unrostered sender degrades to the placeholder', () => {
  it('no roster entry for the sender → the `name` cell === PLACEHOLDER', () => {
    installSheet([['U1', 'สมชาย']]); // roster has U1, but sender is U2
    const ctx = makeStashedContext({ userId: 'U2' });

    appendSubmission(ctx);

    const cell = appendedSubmission();
    expect(cell.name).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });

  it('an empty roster → every sender records the placeholder (negative case)', () => {
    installSheet([]); // header-only roster
    const ctx = makeStashedContext({ userId: 'U1' });

    appendSubmission(ctx);

    expect(appendedSubmission().name).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });
});
