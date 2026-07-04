/**
 * test/phase-8/autoSave.spec.ts — headline CR-1 acceptance: auto-save on rules-pass.
 *
 * RED-first (Phase 8 / CR-1). This is the headline acceptance for the change
 * (PLAN Phase 8, line 182 + CHANGES.md CR-1): the user-confirm step is removed —
 * an image that PASSES all rules is written to the `submissions` sheet IMMEDIATELY
 * (status=recorded, name from resolveEmployeeName, imageHash set) and answered with
 * the SUCCESS card carrying the running summary ("บันทึกแล้ว" + "สัปดาห์นี้…"). There
 * is NO confirm card and NO `action=confirm` postback in the flow.
 *
 * RED against the CURRENT (confirm-based) impl: today a passing image replies a
 * CONFIRM card + stashes — it does NOT append a submissions row (the write still
 * lives on the confirm postback path) — so the "appendRow once / status=recorded /
 * บันทึกแล้ว" assertions FAIL now and GREEN once the write moves onto the image
 * path.
 *
 * MOCK suite: external boundaries mocked are (a) LINE getContent/reply + (b) the
 * OCR recognizer spy. The write path (appendSubmission / ensureEmployee /
 * resolveEmployeeName / countSubmissions / recentDailyValues → buildSuccessCard)
 * runs REAL over stateful GAS doubles (SpreadsheetApp / PropertiesService), with
 * the script-lock wrapper neutralised to a synchronous pass-through (its
 * idempotency behaviour is asserted in imageWriteIdempotency.spec.ts). The pre-OCR
 * gates + rule pipeline are mocked to PASS so the run reaches the auto-save.
 * mock/real flag: GAS services have no cheap Node analogue → these stateful doubles
 * ARE the real boundary; the SAME assertions run. We never read impl bodies — only
 * public signatures.
 */

import { handleImageMessage } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { ocrMock } from '../../src/ocr/ocrMock';
import * as lineClient from '../../src/line/lineClient';
import * as rateLimit from '../../src/rules/rateLimit';
import * as imageDedup from '../../src/rules/imageDedup';
import * as rulePipeline from '../../src/rules/rulePipeline';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock LINE + OCR seams. Pre-OCR gates + rule pipeline PASS so the run reaches the
// auto-save; the write path runs REAL over the stateful GAS doubles below.
jest.mock('../../src/line/lineClient');
jest.mock('../../src/rules/rateLimit');
jest.mock('../../src/rules/imageDedup');
jest.mock('../../src/rules/rulePipeline');
// Neutralise the script-lock wrapper so the auto-save write body runs inline; the
// lock/idempotency behaviour is asserted in imageWriteIdempotency.spec.ts.
jest.mock('../../src/state/lock', () => ({
  LOCK_WAIT_MS: 10000,
  withScriptLock: <T>(fn: () => T): T => fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;
const mockedRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;
const mockedImageDedup = imageDedup as jest.Mocked<typeof imageDedup>;
const mockedPipeline = rulePipeline as jest.Mocked<typeof rulePipeline>;

const IMAGE_HASH = 'abc123'.repeat(2) + 'ff'.repeat(26); // 64-hex-like marker
const ROSTER_NAME = 'สมชาย';

/** A minimal fake image blob standing in for LINE getContent output. */
function fakeBlob(): any {
  return {
    getBytes: jest.fn((): number[] => [1, 2, 3, 4]),
    getContentType: jest.fn((): string => 'image/jpeg'),
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
let employeesTab: FakeTab;

/** Install the GAS doubles; a roster row maps U1 → ROSTER_NAME (proves the name
 * on the written row comes from resolveEmployeeName, not the bare placeholder). */
function installEnv(existingSubmissions: unknown[][] = []): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER, existingSubmissions);
  employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER, [['U1', ROSTER_NAME]]);
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((name: string): any => {
      if (name === 'submissions') return asSheet(submissionsTab);
      if (name === 'employees') return asSheet(employeesTab);
      if (name === 'roster') return asSheet(rosterTab);
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
  g.LockService.getScriptLock.mockReturnValue({
    waitLock: jest.fn(),
    tryLock: jest.fn((): boolean => true),
    releaseLock: jest.fn(),
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

/** The single string payload reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

function imageEvent(messageId = 'msg-100', userId = 'U1'): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: { userId },
    message: { id: messageId, type: 'image' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  installEnv();
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  // Pre-OCR gates PASS; sha256Hex yields the imageHash marker asserted on the row.
  mockedRateLimit.rateLimitAllows.mockReturnValue(true);
  mockedImageDedup.sha256Hex.mockReturnValue(IMAGE_HASH);
  mockedImageDedup.isDuplicateImage.mockReturnValue(false);
  // Rule pipeline PASSES → reach the auto-save.
  mockedPipeline.evaluateSubmissionRules.mockReturnValue({ ok: true });
  jest
    .spyOn(ocrMock, 'recognize')
    .mockReturnValue(
      makeOcrMetrics({ activeCaloriesKcal: 200, activityDateISO: '2026-07-04' })
    );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autoSave — passing image writes immediately (no confirm)', () => {
  it('appends a recorded submissions row (name=resolveEmployeeName, imageHash set)', () => {
    handleImageMessage(imageEvent('msg-100', 'U1'));

    const cell = appendedSubmission();
    expect(cell.messageId).toBe('msg-100');
    expect(cell.userId).toBe('U1');
    expect(cell.activeCaloriesKcal).toBe(200);
    expect(cell.status).toBe('recorded');
    // name comes from resolveEmployeeName (roster maps U1 → ROSTER_NAME), NOT the
    // bare placeholder — proving the write path resolves the identity.
    expect(cell.name).toBe(ROSTER_NAME);
    // imageHash computed at image-time is carried into the row.
    expect(cell.imageHash).toBe(IMAGE_HASH);
  });

  it('replies a SUCCESS card with the running summary — NO confirm card', () => {
    handleImageMessage(imageEvent('msg-100', 'U1'));

    const payload = lastReplyPayload();
    // Success ack + running summary line (counts computed AFTER the auto-insert).
    expect(payload).toContain('บันทึกแล้ว');
    expect(payload).toContain('สัปดาห์นี้');
    // Success (green) style, and explicitly NOT a confirm card.
    expect(payload.toLowerCase()).toContain('#1e9e57');
    expect(payload).not.toContain('action=confirm');
  });

  it('registers a new employee on first auto-save (userId not yet in employees)', () => {
    handleImageMessage(imageEvent('msg-100', 'U1'));

    expect(employeesTab.appendRow).toHaveBeenCalled();
    const row = employeesTab.appendRow.mock.calls[0][0] as unknown[];
    expect(row[0]).toBe('U1');
  });

  it('the running summary counts the just-inserted row (week ≥ 1)', () => {
    // No prior rows; after this single auto-save the running week count is ≥ 1.
    handleImageMessage(imageEvent('msg-100', 'U1'));
    const payload = lastReplyPayload();
    // "สัปดาห์นี้ 1" — the count is taken after the new row is inserted.
    expect(payload).toContain('สัปดาห์นี้ 1');
  });
});

describe('autoSave — write failure is graceful', () => {
  it('a Sheet-write throw → "บันทึกไม่สำเร็จ ลองใหม่", no crash', () => {
    submissionsTab.appendRow.mockImplementation((): never => {
      throw new Error('Sheet write failed');
    });

    expect(() => handleImageMessage(imageEvent('msg-100', 'U1'))).not.toThrow();

    const payload = lastReplyPayload();
    expect(payload).toContain('บันทึกไม่สำเร็จ ลองใหม่');
  });
});
