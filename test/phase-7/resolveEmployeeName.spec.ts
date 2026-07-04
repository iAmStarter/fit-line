/**
 * test/phase-7/resolveEmployeeName.spec.ts — phase-local unit: roster identity map.
 *
 * RED-first (Phase 7 FINAL, TDD). BLIND against the frozen `resolveEmployeeName`
 * stub (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 7 acceptance
 * (line 159) + the stub's documented graceful-fallback contract (never throws):
 *
 *   - roster (userId='U1' → name='สมชาย')  → resolveEmployeeName('U1') === 'สมชาย'.
 *   - userId not in roster ('Uxxx')          → PLACEHOLDER_EMPLOYEE_NAME.
 *   - empty / header-only roster              → PLACEHOLDER_EMPLOYEE_NAME.
 *   - missing `roster` tab (getSheetByName→null) → PLACEHOLDER_EMPLOYEE_NAME.
 *   - a rostered-but-EMPTY name                → PLACEHOLDER_EMPLOYEE_NAME.
 *   - NEVER throws in any of the above.
 *
 * MOCK suite: the external boundary is GAS SpreadsheetApp. We install a STATEFUL
 * per-tab double routing by name; the `roster` tab carries a genuine header row
 * (row 0) + data rows so the by-header-name lookup is genuinely exercised (a
 * wrong column index / no fallback fails the assertion, it is not papered over).
 * "real" == this in-memory Sheet boundary (Sheet has no cheap Node analogue); the
 * SAME assertions run. We never read the impl body — only the public signature.
 */

import {
  resolveEmployeeName,
  PLACEHOLDER_EMPLOYEE_NAME,
} from '../../src/sheet/sheetRepo';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** The 2-col roster header (userId · name), row 0 of the `roster` tab. */
const ROSTER_HEADER = ['userId', 'name'];

/** Wrap a rows backing array as a GAS Sheet double (getDataRange().getValues()). */
function asSheet(rows: unknown[][]): any {
  return {
    getDataRange: jest.fn(() => ({
      getValues: jest.fn((): unknown[][] => rows),
    })),
    getLastRow: jest.fn((): number => rows.length),
    appendRow: jest.fn(),
  };
}

/**
 * Install a SpreadsheetApp double whose `roster` tab is built from `rosterRows`
 * (data rows only; the header is prepended here). `hasRosterTab=false` simulates
 * a MISSING `roster` tab (getSheetByName returns null for it).
 */
function installRoster(
  rosterRows: unknown[][],
  hasRosterTab = true
): void {
  const rows: unknown[][] = [ROSTER_HEADER, ...rosterRows.map((r) => [...r])];
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'roster') return hasRosterTab ? asSheet(rows) : null;
      // Other tabs (submissions/employees) are irrelevant here.
      return null;
    }),
  });
  // SHEET_ID lookup so getProp doesn't fail-fast.
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

describe('resolveEmployeeName — happy path (rostered user → real name)', () => {
  it("roster (U1 → 'สมชาย') resolves 'U1' to 'สมชาย'", () => {
    installRoster([['U1', 'สมชาย']]);
    expect(resolveEmployeeName('U1')).toBe('สมชาย');
  });

  it('resolves BY HEADER NAME even if the roster columns are reordered', () => {
    // name column first, userId second — the lookup must still match by header.
    g.SpreadsheetApp.openById.mockReturnValue({
      getSheetByName: jest.fn((tabName: string): any =>
        tabName === 'roster'
          ? asSheet([
              ['name', 'userId'],
              ['สมชาย', 'U1'],
            ])
          : null
      ),
    });
    g.PropertiesService.getScriptProperties.mockReturnValue({
      getProperty: jest.fn((key: string): string | null =>
        key === 'SHEET_ID' ? 'sheet-abc' : null
      ),
      setProperty: jest.fn(),
      getProperties: jest.fn((): Record<string, string> => ({})),
    });
    expect(resolveEmployeeName('U1')).toBe('สมชาย');
  });
});

describe('resolveEmployeeName — miss cases fall back to the placeholder', () => {
  it('a userId not present in the roster → PLACEHOLDER_EMPLOYEE_NAME', () => {
    installRoster([['U1', 'สมชาย']]);
    expect(resolveEmployeeName('Uxxx')).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });

  it('an empty (header-only) roster → PLACEHOLDER_EMPLOYEE_NAME', () => {
    installRoster([]);
    expect(resolveEmployeeName('U1')).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });

  it('a missing `roster` tab → PLACEHOLDER_EMPLOYEE_NAME (no crash)', () => {
    installRoster([], /* hasRosterTab */ false);
    expect(resolveEmployeeName('U1')).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });

  it('a rostered user whose name cell is EMPTY → PLACEHOLDER_EMPLOYEE_NAME', () => {
    installRoster([['U1', '']]);
    expect(resolveEmployeeName('U1')).toBe(PLACEHOLDER_EMPLOYEE_NAME);
  });
});

describe('resolveEmployeeName — never throws on any degraded roster', () => {
  it('does NOT throw for miss / empty / missing-tab', () => {
    installRoster([['U1', 'สมชาย']]);
    expect(() => resolveEmployeeName('Uxxx')).not.toThrow();
    installRoster([]);
    expect(() => resolveEmployeeName('U1')).not.toThrow();
    installRoster([], false);
    expect(() => resolveEmployeeName('U1')).not.toThrow();
  });
});
