/**
 * test/phase-2/postback.spec.ts — phase-local: confirm postback (write) path.
 *
 * RED-first (Phase 2, TDD). BLIND against the frozen `handlePostback` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 2 acceptance +
 * OVERVIEW §5/risk #7 by driving the WHOLE write path through genuine boundaries
 * (stateful CacheService + SpreadsheetApp doubles) and mocking ONLY the LINE
 * reply seam:
 *
 *   - HAPPY: stashSubmission(ctx active=200, today) → handlePostback(confirm&id)
 *     → a submissions row is appended (messageId, userId, active=200,
 *     status=recorded) AND reply is a SUCCESS card (green #1e9e57) AND the stash
 *     is consumed (retrieveSubmission(id) → null afterward).
 *   - employees: new userId → an employees row added; existing → no duplicate.
 *   - STASH MISS: id never stashed / expired → reply "หมดเวลา ส่งรูปใหม่" (cameraRoll
 *     quick-reply); appendSubmission NOT called (submissions untouched).
 *   - DOUBLE-CONFIRM: same id twice → only ONE submissions append (first consumes
 *     the stash → second sees a miss → "หมดเวลา", no 2nd row).
 *   - WRITE-THROW: SpreadsheetApp write throws → reply "บันทึกไม่สำเร็จ ลองใหม่";
 *     does NOT throw out; stash NOT removed (retrieveSubmission still returns ctx).
 *
 * MOCK suite: external boundaries are (a) LINE reply (mocked seam) and (b) the
 * GAS CacheService + SpreadsheetApp datastores (stateful in-memory doubles — the
 * "real" local boundary; Sheet/Cache have no cheap Node analogue). All real logic
 * (parse, retrieve, write, consume, card choice) runs unmocked, so the assertions
 * catch genuine mis-behaviour. We never read impl bodies — only signatures.
 */

import { handlePostback } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { stashSubmission, retrieveSubmission } from '../../src/state/cacheStore';
import * as lineClient from '../../src/line/lineClient';
import * as sheetRepo from '../../src/sheet/sheetRepo';
import { makeStashedContext } from '../support/stashFixture';

// Mock the LINE reply boundary (network seam). Cache + Sheet stay real (stateful
// doubles below); business logic is unmocked.
jest.mock('../../src/line/lineClient');

// Phase 3 wrapped handlePostback's check-then-write in withScriptLock + a
// submissionExistsByMessageId redelivery guard. These Phase-2 tests are NOT
// testing those gates — neutralise them so the ORIGINAL Phase-2 write path is
// exercised regardless of the (Phase-3) gate impl:
//   - withScriptLock runs its fn synchronously (pass-through, no real lock).
//   - submissionExistsByMessageId returns false (never a redelivery) → the
//     normal write branch appends the row.
// appendSubmission / ensureEmployee stay REAL (requireActual) so the row write +
// employee upsert are genuinely exercised through the stateful Sheet double.
jest.mock('../../src/state/lock', () => ({
  LOCK_WAIT_MS: 10000,
  withScriptLock: <T>(fn: () => T): T => fn(),
}));
jest.mock('../../src/sheet/sheetRepo', () => {
  const actual = jest.requireActual('../../src/sheet/sheetRepo');
  return {
    ...actual,
    submissionExistsByMessageId: jest.fn((): boolean => false),
  };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;
const mockedDedup = sheetRepo.submissionExistsByMessageId as jest.MockedFunction<
  typeof sheetRepo.submissionExistsByMessageId
>;

/** Stateful in-memory CacheService (real stash/retrieve/remove boundary). */
let cacheStore: Map<string, string>;
function installStatefulCache(): void {
  cacheStore = new Map<string, string>();
  g.CacheService.getScriptCache.mockReturnValue({
    put: jest.fn((key: string, value: string): void => {
      cacheStore.set(key, value);
    }),
    get: jest.fn((key: string): string | null =>
      cacheStore.has(key) ? (cacheStore.get(key) as string) : null
    ),
    remove: jest.fn((key: string): void => {
      cacheStore.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
}

/** A stateful in-memory tab: rows backing array + an appendRow spy. */
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

let submissionsTab: FakeTab;
let employeesTab: FakeTab;

/** Install the SpreadsheetApp double. `throwOnWrite` makes appendRow throw. */
function installSheet(
  opts: { existingUserIds?: string[]; throwOnWrite?: boolean } = {}
): void {
  const { existingUserIds = [], throwOnWrite = false } = opts;
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  employeesTab = makeTab(
    EMPLOYEES_HEADER,
    existingUserIds.map((u) => [u, 'seeded', '2026-06-30T00:00:00Z'])
  );
  if (throwOnWrite) {
    submissionsTab.appendRow.mockImplementation((): never => {
      throw new Error('Sheet write failed');
    });
  }
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
}

/** Build a confirm postback event carrying `action=confirm&id=<id>`. */
function confirmEvent(id: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'postback',
    replyToken: 'reply-token-pb',
    source: { userId },
    postback: { data: `action=confirm&id=${id}` },
  };
}

/** The single string payload reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

/** Map the single appended submissions row by header name. */
function appendedSubmission(): Record<string, unknown> {
  expect(submissionsTab.appendRow).toHaveBeenCalled();
  const row = submissionsTab.appendRow.mock.calls[0][0] as unknown[];
  const mapped: Record<string, unknown> = {};
  SUBMISSIONS_HEADER.forEach((name, idx) => {
    mapped[name] = row[idx];
  });
  return mapped;
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
  installSheet();
  mockedLine.reply.mockImplementation(() => undefined);
  // Redelivery guard: not a duplicate messageId → normal write branch.
  mockedDedup.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handlePostback — happy path (write + success + consume)', () => {
  it('appends a submissions row and replies a green success card', () => {
    const id = stashSubmission(
      makeStashedContext(
        { messageId: 'm1', userId: 'U1' },
        { activeCaloriesKcal: 200, activityDateISO: '2026-07-04' }
      )
    );

    handlePostback(confirmEvent(id, 'U1'));

    // submissions row written with server-side values from the stash
    const cell = appendedSubmission();
    expect(cell.messageId).toBe('m1');
    expect(cell.userId).toBe('U1');
    expect(cell.activeCaloriesKcal).toBe(200);
    expect(cell.status).toBe('recorded');

    // reply is a success card (green)
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).toContain('บันทึกแล้ว');
  });

  it('consumes the stash after a successful write (retrieve → null)', () => {
    const id = stashSubmission(
      makeStashedContext({}, { activeCaloriesKcal: 200 })
    );
    expect(retrieveSubmission(id)).not.toBeNull(); // sanity: present

    handlePostback(confirmEvent(id));

    expect(retrieveSubmission(id)).toBeNull();
  });
});

describe('handlePostback — employee registration (register once)', () => {
  it('adds an employees row for a new userId', () => {
    installSheet({ existingUserIds: [] }); // no U9 yet
    const id = stashSubmission(
      makeStashedContext(
        { userId: 'U9' },
        { activeCaloriesKcal: 200 }
      )
    );

    handlePostback(confirmEvent(id, 'U9'));

    expect(employeesTab.appendRow).toHaveBeenCalled();
    const row = employeesTab.appendRow.mock.calls[0][0] as unknown[];
    expect(row[0]).toBe('U9');
  });

  it('does NOT duplicate an existing userId in employees', () => {
    installSheet({ existingUserIds: ['U1'] }); // U1 already registered
    const id = stashSubmission(
      makeStashedContext(
        { userId: 'U1' },
        { activeCaloriesKcal: 200 }
      )
    );

    handlePostback(confirmEvent(id, 'U1'));

    expect(employeesTab.appendRow).not.toHaveBeenCalled();
  });
});

describe('handlePostback — stash miss (expired / unknown id)', () => {
  it('replies "หมดเวลา ส่งรูปใหม่" and does NOT write a submission', () => {
    // an id that was never stashed
    handlePostback(confirmEvent('never-stashed-id'));

    const payload = lastReplyPayload();
    expect(payload).toContain('หมดเวลา ส่งรูปใหม่');
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });

  it('the stash-miss card carries a cameraRoll quick-reply', () => {
    handlePostback(confirmEvent('never-stashed-id'));
    const payload = lastReplyPayload();
    expect(payload).toContain('cameraRoll');
  });
});

describe('handlePostback — double-confirm (idempotent-ish)', () => {
  it('the same id twice → only ONE submissions append', () => {
    const id = stashSubmission(
      makeStashedContext({}, { activeCaloriesKcal: 200 })
    );

    handlePostback(confirmEvent(id)); // first: writes + consumes stash
    handlePostback(confirmEvent(id)); // second: stash gone → miss, no write

    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    // second reply is the stash-miss card, not another success
    const payload = lastReplyPayload();
    expect(payload).toContain('หมดเวลา ส่งรูปใหม่');
  });
});

// NOTE (Phase 3 re-align): the Sheet-write-throw case moved to
// test/phase-3/postbackIdempotency.spec.ts. Phase 3 split handlePostback's error
// branch on a NEW internal classifier `isLockTimeout(err)` (lock-timeout card vs
// sheet-error card) — un-exported, so it cannot be mocked here, and it is a
// Phase-3 stub (throws NotImplemented) until FILL. The sheet-error assertion is
// error-classification behavior that only becomes valid once that classifier
// exists, so it lives with its lock-timeout sibling in the Phase-3 RED suite (it
// is RED now, GREEN after FILL). Keeping it here would either be green-on-stubs-
// impossible (it throws NotImplemented through the un-mockable classifier) or
// require weakening the assertion — neither is allowed. The happy / employee /
// stash-miss / double-confirm Phase-2 behaviors above stay GREEN.
