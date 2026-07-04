/**
 * test/phase-3/postbackIdempotency.spec.ts — phase-local integration:
 * confirm-postback idempotency under LINE webhook redelivery.
 *
 * RED-first (Phase 3, TDD). Drives handlePostback through the REAL Phase-3 guards
 * (withScriptLock + submissionExistsByMessageId + isLockTimeout) — NOT mocked —
 * over stateful GAS doubles, so this suite is RED now (those stubs throw
 * NotImplemented) and GREEN after FILL. Asserts BEHAVIOR from PLAN Phase 3
 * acceptance (lines 90–91) + impl-phase-3 §4:
 *
 *   - NORMAL: submissionExistsByMessageId false → appendSubmission runs ONCE →
 *     replies a success card (green #1e9e57, "บันทึกแล้ว").
 *   - REDELIVERY race: a row with the same messageId already exists → the
 *     messageId dedup skips the write (appendSubmission NOT called again, still
 *     exactly one row) → yet still replies success (idempotent UX).
 *   - LOCK TIMEOUT: waitLock throws → replies "ระบบไม่ว่าง ลองใหม่" (NO cameraRoll —
 *     system-busy, an immediate resend does not help) → appendSubmission NOT
 *     called (no double-write) → does not throw out.
 *
 * MOCK suite: external boundaries mocked are (a) LINE reply and (b) the GAS
 * LockService + SpreadsheetApp + CacheService doubles. The Phase-3 guard logic
 * (lock wrap, messageId dedup, timeout classification) runs REAL — a broken guard
 * genuinely misbehaves here. mock/real flag: GAS services have no cheap Node
 * analogue → these stateful doubles ARE the real boundary; the SAME assertions
 * run. We never read the guard impl bodies.
 */

import { handlePostback } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { stashSubmission } from '../../src/state/cacheStore';
import * as lineClient from '../../src/line/lineClient';
import { makeStashedContext } from '../support/stashFixture';

// Mock ONLY the LINE reply network seam. LockService + Sheet + Cache are stateful
// GAS-global doubles below; the Phase-3 guards run REAL.
jest.mock('../../src/line/lineClient');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;

/** Stateful in-memory CacheService (real stash/retrieve/remove boundary). */
function installStatefulCache(): void {
  const store = new Map<string, string>();
  g.CacheService.getScriptCache.mockReturnValue({
    put: jest.fn((key: string, value: string): void => {
      store.set(key, value);
    }),
    get: jest.fn((key: string): string | null =>
      store.has(key) ? (store.get(key) as string) : null
    ),
    remove: jest.fn((key: string): void => {
      store.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
}

/** The canonical 14-col submissions / 3-col employees headers (OVERVIEW §5). */
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

function subRow(values: Partial<Record<string, unknown>>): unknown[] {
  return SUBMISSIONS_HEADER.map((name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : ''
  );
}

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

let submissionsTab: FakeTab;
let employeesTab: FakeTab;

/** Install the SpreadsheetApp double; `existingSubmissions` seeds the messageId scan. */
function installSheet(existingSubmissions: unknown[][] = []): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER, existingSubmissions);
  employeesTab = makeTab(EMPLOYEES_HEADER);
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

/** Install a spy script-lock; `throwOnWait` simulates a waitLock timeout. */
let waitLock: jest.Mock;
let releaseLock: jest.Mock;
function installLock(throwOnWait = false): void {
  waitLock = jest.fn((_ms?: number): void => {
    if (throwOnWait) throw new Error('Could not acquire lock: timeout');
  });
  releaseLock = jest.fn();
  g.LockService.getScriptLock.mockReturnValue({
    waitLock,
    tryLock: jest.fn((): boolean => true),
    releaseLock,
  });
}

function confirmEvent(id: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'postback',
    replyToken: 'reply-token-pb',
    source: { userId },
    postback: { data: `action=confirm&id=${id}` },
  };
}

function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
  installSheet();
  installLock();
  mockedLine.reply.mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('postbackIdempotency — normal write (once + success)', () => {
  it('no existing messageId → appendSubmission once → success card', () => {
    const id = stashSubmission(
      makeStashedContext(
        { messageId: 'm-normal', userId: 'U1' },
        { activeCaloriesKcal: 200 }
      )
    );

    handlePostback(confirmEvent(id, 'U1'));

    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).toContain('บันทึกแล้ว');
  });
});

describe('postbackIdempotency — redelivery race (dedup, no double-write)', () => {
  it('messageId already recorded → no new append (1 row) → still success', () => {
    // Seed submissions with a row already carrying this messageId (redelivery).
    installSheet([subRow({ messageId: 'm-dup', userId: 'U1', status: 'recorded' })]);
    const id = stashSubmission(
      makeStashedContext(
        { messageId: 'm-dup', userId: 'U1' },
        { activeCaloriesKcal: 200 }
      )
    );

    handlePostback(confirmEvent(id, 'U1'));

    // messageId dedup → the write is skipped (no SECOND row appended).
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
    expect(submissionsTab.rows.length).toBe(2); // header + the pre-seeded row only
    // Idempotent UX: still replies a success card.
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).toContain('บันทึกแล้ว');
  });
});

describe('postbackIdempotency — lock timeout (graceful, no write)', () => {
  it('waitLock throws → "ระบบไม่ว่าง ลองใหม่", no cameraRoll, no append', () => {
    installLock(true); // waitLock times out
    const id = stashSubmission(
      makeStashedContext(
        { messageId: 'm-lock', userId: 'U1' },
        { activeCaloriesKcal: 200 }
      )
    );

    expect(() => handlePostback(confirmEvent(id, 'U1'))).not.toThrow();

    const payload = lastReplyPayload();
    expect(payload).toContain('ระบบไม่ว่าง ลองใหม่');
    // System-busy notice — NOT a user retry, so no cameraRoll quick reply.
    expect(payload).not.toContain('cameraRoll');
    // No double-write risk: nothing appended when the lock could not be held.
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });
});
