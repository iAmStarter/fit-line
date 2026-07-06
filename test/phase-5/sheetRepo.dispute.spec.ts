/**
 * test/phase-5/sheetRepo.dispute.spec.ts — phase-local: dispute-log persistence
 * (logDispute + disputeExistsByMessageId), idempotent per messageId.
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `logDispute` /
 * `disputeExistsByMessageId` stubs (throw NotImplemented). Asserts BEHAVIOR from
 * PLAN Phase 5 acceptance (line 124) + sheetRepo contract:
 *   - logDispute('m1','U','run','user-dispute') appends ONE row to `disputes`.
 *   - disputeExistsByMessageId('m1') → true afterward.
 *   - a SECOND logDispute('m1',...) → NO second row (idempotent per messageId).
 *   - disputeExistsByMessageId('zzz') → false for an un-logged message.
 *   - a missing / empty `disputes` tab → false (no crash).
 *
 * MOCK suite: the ONLY external boundary is the GAS SpreadsheetApp datastore — a
 * stateful in-memory double INCLUDING a `disputes` tab (the "real" local boundary;
 * a Sheet has no cheap Node analogue). The idempotency + append logic runs
 * unmocked. mock/real flag: the SAME assertions run against the SAME double. We
 * never read the impl body — only the public signatures.
 */

import {
  logDispute,
  disputeExistsByMessageId,
} from '../../src/sheet/sheetRepo';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** A stateful in-memory tab: rows backing array + an appendRow spy. */
interface FakeTab {
  rows: unknown[][];
  appendRow: jest.Mock;
}
function makeTab(header: unknown[], dataRows: unknown[][] = []): FakeTab {
  const rows: unknown[][] = [header, ...dataRows.map((r) => [...r])];
  const appendRow = jest.fn((r: unknown[]): void => {
    rows.push([...r]);
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

const DISPUTES_HEADER = [
  'messageId',
  'userId',
  'activityType',
  'reason',
  'disputedAtISO',
];

let disputesTab: FakeTab | null;

/**
 * Install the SpreadsheetApp double.
 * @param withDisputesTab when false, `disputes` resolves to null (missing tab).
 * @param seed pre-existing dispute rows.
 */
function installSheet(
  opts: { withDisputesTab?: boolean; seed?: unknown[][] } = {}
): void {
  const { withDisputesTab = true, seed = [] } = opts;
  disputesTab = withDisputesTab ? makeTab(DISPUTES_HEADER, seed) : null;
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'disputes') {
        return disputesTab ? asSheet(disputesTab) : null;
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
  installSheet();
});

describe('logDispute — appends one dispute row', () => {
  it('appends a disputes row carrying the messageId, userId, activity, reason', () => {
    logDispute('m1', 'U', 'run', 'user-dispute');

    expect(disputesTab?.appendRow).toHaveBeenCalledTimes(1);
    const row = disputesTab?.appendRow.mock.calls[0][0] as unknown[];
    const mapped: Record<string, unknown> = {};
    DISPUTES_HEADER.forEach((name, idx) => (mapped[name] = row[idx]));
    expect(mapped.messageId).toBe('m1');
    expect(mapped.userId).toBe('U');
    expect(mapped.activityType).toBe('run');
    expect(mapped.reason).toBe('user-dispute');
  });
});

describe('disputeExistsByMessageId — reflects logged messages', () => {
  it('is false before, true after logging m1', () => {
    expect(disputeExistsByMessageId('m1')).toBe(false);
    logDispute('m1', 'U', 'run', 'user-dispute');
    expect(disputeExistsByMessageId('m1')).toBe(true);
  });

  it('is false for a message that was never disputed', () => {
    logDispute('m1', 'U', 'run', 'user-dispute');
    expect(disputeExistsByMessageId('zzz')).toBe(false);
  });
});

describe('logDispute — idempotent per messageId (no double-log)', () => {
  it('a second logDispute for the same messageId does NOT append a second row', () => {
    logDispute('m1', 'U', 'run', 'user-dispute');
    logDispute('m1', 'U', 'run', 'user-dispute'); // repeat tap

    expect(disputesTab?.appendRow).toHaveBeenCalledTimes(1);
  });

  it('a DIFFERENT messageId does append its own row', () => {
    logDispute('m1', 'U', 'run', 'user-dispute');
    logDispute('m2', 'U', 'run', 'user-dispute');
    expect(disputesTab?.appendRow).toHaveBeenCalledTimes(2);
    expect(disputeExistsByMessageId('m2')).toBe(true);
  });
});

describe('logDispute — null activityType (empty cell, no crash)', () => {
  it('accepts a null activityType and still logs the row', () => {
    expect(() => logDispute('m3', 'U', null, 'user-dispute')).not.toThrow();
    expect(disputeExistsByMessageId('m3')).toBe(true);
  });
});

describe('dispute log — missing / empty disputes tab (no crash)', () => {
  it('disputeExistsByMessageId → false when the disputes tab is missing', () => {
    installSheet({ withDisputesTab: false });
    expect(disputeExistsByMessageId('m1')).toBe(false);
  });

  it('disputeExistsByMessageId → false on an empty (header-only) disputes tab', () => {
    installSheet({ seed: [] });
    expect(disputeExistsByMessageId('m1')).toBe(false);
  });
});
