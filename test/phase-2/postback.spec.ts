/**
 * test/phase-2/postback.spec.ts — legacy confirm-postback graceful ignore.
 *
 * REALIGNED for CR-1 / Phase 8 (auto-save). The confirm STEP is removed: passing
 * images now write immediately (that write-path coverage moved to the image-path
 * suites — router / imageGate / phase-8 autoSave + imageWriteIdempotency). The
 * `action=confirm` branch in handlePostback is DELETED. What remains to assert
 * here is the backward-compat guarantee from PLAN Phase 8 acceptance
 * (edge/negative): a LEGACY / stray `action=confirm&id=…` postback (e.g. a user
 * tapping an old confirm card still in their chat) is IGNORED GRACEFULLY — no
 * reply, no throw, no Sheet write — so doPost still returns 200.
 *
 * MOCK suite: external boundaries mocked are (a) LINE reply (network seam) and
 * (b) the GAS SpreadsheetApp datastore (stateful in-memory double — the local
 * boundary). The routing logic runs unmocked, so a stray-confirm mis-route (e.g.
 * an accidental write or reply) genuinely fails here. mock/real flag: GAS services
 * have no cheap Node analogue → the double IS the real boundary; the SAME
 * assertions run. We never read impl bodies — only public signatures.
 */

import { handlePostback } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import * as lineClient from '../../src/line/lineClient';

// Mock the LINE reply boundary (network seam). Sheet stays real (stateful double).
jest.mock('../../src/line/lineClient');
// Neutralise the script-lock wrapper (a stray confirm must never reach a write,
// but keep the wrapper harmless if any branch touches it).
jest.mock('../../src/state/lock', () => ({
  LOCK_WAIT_MS: 10000,
  withScriptLock: <T>(fn: () => T): T => fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;

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
const EMPLOYEES_HEADER = ['userId', 'name', 'registeredAtISO'];

interface FakeTab {
  rows: unknown[][];
  appendRow: jest.Mock;
}
function makeTab(header: unknown[]): FakeTab {
  const rows: unknown[][] = [header];
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

let submissionsTab: FakeTab;

function installSheet(): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') return asSheet(submissionsTab);
      if (tabName === 'employees') return asSheet(employeesTab);
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
  const store = new Map<string, string>();
  g.CacheService.getScriptCache.mockReturnValue({
    put: jest.fn((k: string, v: string): void => {
      store.set(k, v);
    }),
    get: jest.fn((k: string): string | null =>
      store.has(k) ? (store.get(k) as string) : null
    ),
    remove: jest.fn((k: string): void => {
      store.delete(k);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
}

/** Build a legacy confirm postback event carrying `action=confirm&id=<id>`. */
function confirmEvent(id: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'postback',
    replyToken: 'reply-token-pb',
    source: { userId },
    postback: { data: `action=confirm&id=${id}` },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  installSheet();
  mockedLine.reply.mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handlePostback — legacy action=confirm is ignored gracefully', () => {
  it('a stray action=confirm&id=… → NO reply, NO write, does NOT throw', () => {
    expect(() => handlePostback(confirmEvent('legacy-id-abc'))).not.toThrow();

    // Confirm branch is gone: no card is sent back for a legacy confirm tap.
    expect(mockedLine.reply).not.toHaveBeenCalled();
    // And nothing is written (the auto-save happens on the image path, not here).
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });

  it('an unknown id in a legacy confirm is still a silent, safe no-op', () => {
    expect(() => handlePostback(confirmEvent('never-existed'))).not.toThrow();
    expect(mockedLine.reply).not.toHaveBeenCalled();
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });
});
