/**
 * test/phase-8/imageWriteIdempotency.spec.ts — phase-local integration:
 * image-path auto-save idempotency under LINE webhook redelivery.
 *
 * RED-first (Phase 8 / CR-1). Was test/phase-3/postbackIdempotency.spec.ts: CR-1
 * moved the write (and therefore the messageId + LockService idempotency) OFF the
 * confirm postback and ONTO the image path — a redelivered image now writes
 * directly, so the lock/dedup that guarded the postback write now guards
 * handleImageMessage. Drives the REAL image-path guards (withScriptLock +
 * submissionExistsByMessageId + the lock-timeout classifier) — NOT mocked — over
 * stateful GAS doubles. RED now (current impl still writes on the CONFIRM path, so
 * a passing image does NOT append here) → GREEN once the write path moves onto the
 * image handler. Asserts BEHAVIOR from PLAN Phase 8 acceptance (lines 183, 185):
 *
 *   - NORMAL: submissionExistsByMessageId false → appendSubmission runs ONCE →
 *     replies a success card (green #1e9e57, "บันทึกแล้ว").
 *   - REDELIVERY: the SAME messageId sent twice → the messageId dedup skips the
 *     second write (appendSubmission runs exactly once, one row) → still success.
 *   - LOCK TIMEOUT: waitLock throws → replies "ระบบไม่ว่าง ลองใหม่" (NO cameraRoll —
 *     system-busy, an immediate resend does not help) → appendSubmission NOT
 *     called (no double-write) → does not throw out.
 *
 * MOCK suite: external boundaries mocked are (a) LINE getContent/reply + (b) the
 * OCR recognizer spy, plus (c) the GAS LockService + SpreadsheetApp + CacheService
 * doubles. The pre-OCR gates (rateLimit / imageDedup) + rule pipeline are mocked to
 * PASS so the run reaches the auto-save; the image-path guard logic (lock wrap,
 * messageId dedup, timeout classification) runs REAL — a broken guard genuinely
 * misbehaves here. mock/real flag: GAS services have no cheap Node analogue → these
 * stateful doubles ARE the real boundary; the SAME assertions run. We never read
 * the guard impl bodies — only public signatures.
 */

import { handleImageMessage } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { ocrMock } from '../../src/ocr/ocrMock';
import * as lineClient from '../../src/line/lineClient';
import * as rateLimit from '../../src/rules/rateLimit';
import * as imageDedup from '../../src/rules/imageDedup';
import * as rulePipeline from '../../src/rules/rulePipeline';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock LINE + OCR seams. The pre-OCR gates (rateLimit / imageDedup) and the rule
// pipeline are mocked to PASS so the run reaches the auto-save write; the write-
// path guards (LockService + submissionExistsByMessageId) run REAL against the
// stateful GAS doubles below — that IS what this suite tests.
jest.mock('../../src/line/lineClient');
jest.mock('../../src/rules/rateLimit');
jest.mock('../../src/rules/imageDedup');
jest.mock('../../src/rules/rulePipeline');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;
const mockedRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;
const mockedImageDedup = imageDedup as jest.Mocked<typeof imageDedup>;
const mockedPipeline = rulePipeline as jest.Mocked<typeof rulePipeline>;

/** A minimal fake image blob standing in for LINE getContent output. */
function fakeBlob(): any {
  return {
    getBytes: jest.fn((): number[] => [1, 2, 3, 4]),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/** Stateful in-memory CacheService (counters/stash boundary). */
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

/** The canonical 14-col submissions / 3-col employees / 2-col roster headers. */
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
const ROSTER_HEADER = ['userId', 'name'];

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

/** Install the SpreadsheetApp double + empty employees/roster tabs. */
function installSheet(): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER);
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') return asSheet(submissionsTab);
      if (tabName === 'employees') return asSheet(employeesTab);
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

/** An image message event (default messageId 'msg-1'). */
function imageEvent(messageId = 'msg-1', userId = 'U1'): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: { userId },
    message: { id: messageId, type: 'image' },
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
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  // Pre-OCR gates PASS so the run reaches the write-path guards under test.
  mockedRateLimit.rateLimitAllows.mockReturnValue(true);
  mockedImageDedup.sha256Hex.mockReturnValue('deadbeef'.repeat(8));
  mockedImageDedup.isDuplicateImage.mockReturnValue(false);
  mockedPipeline.evaluateSubmissionRules.mockReturnValue({ ok: true });
  jest
    .spyOn(ocrMock, 'recognize')
    .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('imageWriteIdempotency — normal auto-save (once + success)', () => {
  it('no existing messageId → appendSubmission once → success card', () => {
    handleImageMessage(imageEvent('m-normal', 'U1'));

    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).toContain('บันทึกแล้ว');
  });
});

describe('imageWriteIdempotency — redelivery (dedup, no double-write)', () => {
  it('the SAME messageId sent twice → exactly ONE submissions row', () => {
    // First delivery writes the row; the real submissions scan then sees the
    // messageId, so the redelivery's messageId dedup skips the second write.
    handleImageMessage(imageEvent('m-dup', 'U1'));
    handleImageMessage(imageEvent('m-dup', 'U1')); // redelivery of the same event

    // Exactly one append across both deliveries.
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    // header + the single written row only.
    expect(submissionsTab.rows.length).toBe(2);
    // Idempotent UX: still replies a success card.
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).toContain('บันทึกแล้ว');
  });
});

describe('imageWriteIdempotency — lock timeout (graceful, no write)', () => {
  it('waitLock throws → "ระบบไม่ว่าง ลองใหม่", no cameraRoll, no append', () => {
    installLock(true); // waitLock times out

    expect(() => handleImageMessage(imageEvent('m-lock', 'U1'))).not.toThrow();

    const payload = lastReplyPayload();
    expect(payload).toContain('ระบบไม่ว่าง ลองใหม่');
    // System-busy notice — NOT a user retry, so no cameraRoll quick reply.
    expect(payload).not.toContain('cameraRoll');
    // No double-write risk: nothing appended when the lock could not be held.
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });
});
