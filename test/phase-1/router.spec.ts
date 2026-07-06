/**
 * test/phase-1/router.spec.ts — phase-local: image-event routing + handler.
 *
 * REALIGNED for CR-1 / Phase 8 (auto-save). The confirm step is GONE: an image
 * that PASSES the rules is written to the sheet IMMEDIATELY and answered with the
 * SUCCESS card — no confirm card, no CacheService stash. Asserts BEHAVIOR from
 * PLAN Phase 8 acceptance (image path) via routeWebhook(rawBody) /
 * handleImageMessage(event):
 *   - image event + pipeline PASSES -> a `submissions` row is appended ONCE AND
 *     reply is a SUCCESS card ("บันทึกแล้ว"); NO confirm postback marker; NO
 *     CacheService stash (the confirm-flow cache is gone).
 *   - image event + pipeline REJECTS (a calorie-reject reason) -> reply is a
 *     REJECT card AND nothing is written. (main FORWARDS a pipeline reject → reject
 *     card; the calorie LOGIC itself is covered by the calorie/pipeline suites.)
 *   - OCR throws -> reply is a graceful error card ("อ่านรูปไม่สำเร็จ"); the handler
 *     does NOT throw out (doPost stays 200); nothing written.
 *   - non-image event (text/sticker) -> graceful (no throw).
 *
 * MOCK suite: external boundaries mocked are (a) LINE getContent/reply and (b) the
 * OCR recognizer. The write path (appendSubmission / ensureEmployee /
 * resolveEmployeeName / countSubmissions / recentDailyValues) runs REAL over
 * stateful GAS doubles (SpreadsheetApp / PropertiesService) — the real datastore
 * boundary. The script-lock wrapper is neutralised to a synchronous pass-through
 * so the write body runs inline. Phase-3 gates (rateLimit + imageDedup) and the
 * Phase-4 rule pipeline are mocked at their seams so THIS suite exercises only
 * main's image-path routing / auto-save / card choice; their own behaviour lives
 * in their own unit suites. mock/real flag: GAS services have no cheap Node
 * analogue → these stateful doubles ARE the real boundary. We never read impl
 * bodies — only public signatures.
 */

import { routeWebhook, handleImageMessage } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { ocrMock } from '../../src/ocr/ocrMock';
import * as lineClient from '../../src/line/lineClient';
import * as rateLimit from '../../src/rules/rateLimit';
import * as imageDedup from '../../src/rules/imageDedup';
import * as rulePipeline from '../../src/rules/rulePipeline';
import * as disputeGuard from '../../src/rules/disputeGuard';
import { CALORIE_THRESHOLD_KCAL } from '../../src/rules/calorieRule';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock ONLY the external boundaries (network + OCR seam). Business logic stays
// real. Auto-mocking ocrMock makes recognize a spy so a text event's "OCR was not
// called" precondition holds; the OCR-driving tests below re-configure it.
jest.mock('../../src/line/lineClient');
jest.mock('../../src/ocr/ocrMock');
// Phase 3 pre-OCR gate collaborators — mock so the pass-path preconditions hold
// (rate-limit ALLOWS, image is NOT a duplicate, sha256Hex returns a stable hex).
// Their own gate behaviour is asserted in test/phase-3/imageGate.spec.ts.
jest.mock('../../src/rules/rateLimit');
jest.mock('../../src/rules/imageDedup');
// Phase 4 rule PIPELINE — mock so the pass-path reaches the auto-save ({ok:true})
// and the reject-path forwards a first-fail reason. Ordering is covered in phase-4.
jest.mock('../../src/rules/rulePipeline');
// Phase 5 repeated-reject dispute counter — mock the seam to a no-op below-threshold
// so the reject card keeps its Phase-1 shape (cameraRoll only, no dispute affordance).
jest.mock('../../src/rules/disputeGuard');
// CR-1 / Phase 8: the auto-save write path is guarded by the script-lock wrapper
// (moved to the IMAGE path). Neutralise it to a synchronous pass-through so the
// write body runs inline; the lock/idempotency behaviour itself is asserted in
// test/phase-8/imageWriteIdempotency.spec.ts.
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
const mockedDisputeGuard = disputeGuard as jest.Mocked<typeof disputeGuard>;

/** The calorie reject reason (built from the source const, not copy-pasted). */
const CALORIE_REJECT_REASON = `แคลอรี่ต่ำกว่าเกณฑ์ ${CALORIE_THRESHOLD_KCAL}`;

/** A minimal fake image blob standing in for LINE getContent output. */
function fakeBlob(): any {
  return {
    getBytes: jest.fn((): number[] => [1, 2, 3, 4]),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
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

/** Install the SpreadsheetApp/Properties/Lock doubles for the auto-save path. */
function installEnv(): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER); // empty → placeholder name fallback
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
}

/** Install a stateful in-memory CacheService (used to PROVE no stash occurs). */
let cacheStore: Map<string, string>;
let putSpy: jest.Mock;
function installStatefulCache(): void {
  cacheStore = new Map<string, string>();
  putSpy = jest.fn((key: string, value: string): void => {
    cacheStore.set(key, value);
  });
  g.CacheService.getScriptCache.mockReturnValue({
    put: putSpy,
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

/** The single string payload that reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

/** Build a raw webhook body wrapping a single event. */
function bodyWith(event: LineWebhookEvent): string {
  return JSON.stringify({ destination: 'Uxyz', events: [event] });
}

const IMAGE_EVENT: LineWebhookEvent = {
  type: 'message',
  replyToken: 'reply-token-1',
  source: { userId: 'Uuser1' },
  message: { id: 'msg-100', type: 'image' },
};

beforeEach(() => {
  jest.clearAllMocks();
  installEnv();
  installStatefulCache();
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  // Pass-path gate defaults: rate-limit allows + image is not a duplicate.
  mockedRateLimit.rateLimitAllows.mockReturnValue(true);
  mockedImageDedup.sha256Hex.mockReturnValue('deadbeef'.repeat(8));
  mockedImageDedup.isDuplicateImage.mockReturnValue(false);
  // Pass-path pipeline default: all business rules pass → reach the auto-save.
  mockedPipeline.evaluateSubmissionRules.mockReturnValue({ ok: true });
  // Dispute-counter defaults: no-op below-threshold so the reject card keeps its
  // Phase-1 shape (no dispute affordance). Isolating this Phase-5 side-effect does
  // not weaken any assertion below.
  mockedDisputeGuard.bumpFailCount.mockReturnValue(1);
  mockedDisputeGuard.shouldOfferDispute.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleImageMessage — pass path (auto-save + success, NO confirm/stash)', () => {
  it('OCR active=200 -> writes a submissions row once and replies a SUCCESS card', () => {
    jest
      .spyOn(ocrMock, 'recognize')
      .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));

    handleImageMessage(IMAGE_EVENT);

    // fetched the image content for the event's message id
    expect(mockedLine.getMessageContent).toHaveBeenCalledWith('msg-100');
    // auto-save: a submissions row was appended exactly once
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    // reply is the SUCCESS card (save ack), NOT a confirm card
    const payload = lastReplyPayload();
    expect(payload).toContain('บันทึกแล้ว');
    expect(payload).not.toContain('action=confirm');
    // no confirm-flow stash: the CacheService is never written for a submission
    expect(putSpy).not.toHaveBeenCalled();
    expect(cacheStore.size).toBe(0);
  });
});

describe('handleImageMessage — reject path (no write, no stash)', () => {
  it('pipeline rejects (calorie reason) -> reply with a REJECT card and NO write', () => {
    // OCR succeeds; the PIPELINE returns a first-fail reject (calorie). main
    // FORWARDS the pipeline reject → reject card (the calorie logic lives in the
    // calorie/pipeline unit suites).
    jest
      .spyOn(ocrMock, 'recognize')
      .mockReturnValue(
        makeOcrMetrics({ activeCaloriesKcal: 100, totalCaloriesKcal: 140 })
      );
    mockedPipeline.evaluateSubmissionRules.mockReturnValue({
      ok: false,
      reason: CALORIE_REJECT_REASON,
    });

    handleImageMessage(IMAGE_EVENT);

    const payload = lastReplyPayload();
    // reject card: NOT a confirm, NOT a save ack, carries the reject error color
    expect(payload).not.toContain('action=confirm');
    expect(payload).not.toContain('บันทึกแล้ว');
    expect(payload.toLowerCase()).toContain('#d64545');
    // nothing written on the reject path
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });
});

describe('handleImageMessage — OCR error (graceful)', () => {
  it('OCR throws -> reply with an error card, no throw out, no write', () => {
    jest.spyOn(ocrMock, 'recognize').mockImplementation(() => {
      throw new Error('OCR timeout');
    });

    expect(() => handleImageMessage(IMAGE_EVENT)).not.toThrow();

    const payload = lastReplyPayload();
    expect(payload).toContain('อ่านรูปไม่สำเร็จ');
    expect(submissionsTab.appendRow).not.toHaveBeenCalled();
  });
});

describe('routeWebhook — image dispatch (auto-save)', () => {
  it('routes an image message to the image handler (writes + success reply)', () => {
    jest
      .spyOn(ocrMock, 'recognize')
      .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));

    routeWebhook(bodyWith(IMAGE_EVENT));

    expect(mockedLine.getMessageContent).toHaveBeenCalledWith('msg-100');
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    const payload = lastReplyPayload();
    expect(payload).toContain('บันทึกแล้ว');
    expect(payload).not.toContain('action=confirm');
  });
});

describe('routeWebhook — non-image events (graceful)', () => {
  it('does not throw on a text message event', () => {
    const textEvent: LineWebhookEvent = {
      type: 'message',
      replyToken: 'rt-text',
      source: { userId: 'Uuser1' },
      message: { id: 'msg-text', type: 'text' },
    };
    expect(() => routeWebhook(bodyWith(textEvent))).not.toThrow();
    // a text event must never trigger OCR
    expect(ocrMock.recognize).not.toHaveBeenCalled();
  });

  it('does not throw on a sticker message event', () => {
    const stickerEvent: LineWebhookEvent = {
      type: 'message',
      replyToken: 'rt-stk',
      source: { userId: 'Uuser1' },
      message: { id: 'msg-stk', type: 'sticker' },
    };
    expect(() => routeWebhook(bodyWith(stickerEvent))).not.toThrow();
  });

  it('does not throw on an empty events array', () => {
    expect(() =>
      routeWebhook(JSON.stringify({ destination: 'Uxyz', events: [] }))
    ).not.toThrow();
    expect(mockedLine.reply).not.toHaveBeenCalled();
  });
});
