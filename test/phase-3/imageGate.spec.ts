/**
 * test/phase-3/imageGate.spec.ts — phase-local integration: image-path gates.
 *
 * Drives handleImageMessage through the REAL Phase-3 gates (rate-limit + sha256
 * dedup) — NOT mocked. Asserts BEHAVIOR from PLAN Phase 3 acceptance (lines 88–89)
 * + OVERVIEW §6, updated for CR-1 / Phase 8 (auto-save):
 *
 *   - RATE-LIMIT exceeded (drive the CacheService counter to the 6th call) →
 *     reply is a COOLDOWN block card ("ส่งบ่อยเกินไป รอสักครู่", red #d64545,
 *     cameraRoll) AND ocrMock.recognize is NOT called (cost gate, spy = 0).
 *   - DUPLICATE image (submissions carries the computed imageHash) → reply is a
 *     DUPLICATE block card ("รูปนี้เคยส่งแล้ว", red, cameraRoll) AND OCR NOT called.
 *   - BOTH gates pass (rate ok + not duplicate) → OCR IS called → the submission
 *     is AUTO-SAVED (appendRow once) and answered with the SUCCESS card ("บันทึกแล้ว",
 *     no confirm marker). BOUNDARY: the 5th send passes (OCR runs), the 6th is
 *     blocked (cooldown, OCR not called).
 *
 * MOCK suite: external boundaries mocked are (a) LINE getContent/reply and (b) the
 * OCR recognizer spy. The Phase-3 gate collaborators (rateLimit, imageDedup) run
 * REAL over stateful GAS doubles (CacheService counter + SpreadsheetApp scan +
 * Utilities digest) — a broken gate genuinely misbehaves here. The CR-1 auto-save
 * write path (append + employee upsert + count/daily → success card) also runs
 * REAL over the SpreadsheetApp double, with the script-lock wrapper neutralised to
 * a synchronous pass-through (its idempotency behaviour is asserted in
 * test/phase-8/imageWriteIdempotency.spec.ts). The Phase-4 rule PIPELINE is a
 * separate concern — mock it to PASS so the both-gates-pass cases reach the save.
 * mock/real flag: GAS services have no cheap Node analogue → these stateful doubles
 * ARE the real boundary; the SAME assertions run. We never read impl bodies.
 */

import { handleImageMessage } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { ocrMock } from '../../src/ocr/ocrMock';
import * as lineClient from '../../src/line/lineClient';
import * as rulePipeline from '../../src/rules/rulePipeline';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock the LINE network seam. The Phase-3 gates (rateLimit + imageDedup) run REAL
// against the stateful GAS doubles below (that IS what this suite tests). The
// Phase-4 rule PIPELINE is a separate concern here — mock it to PASS so the
// both-gates-pass cases reach OCR + auto-save; its ordering is covered in phase-4.
jest.mock('../../src/line/lineClient');
jest.mock('../../src/rules/rulePipeline');
// CR-1 / Phase 8: the auto-save write path is guarded by the script-lock wrapper
// on the IMAGE path. Neutralise it to a synchronous pass-through so the write body
// runs inline; the lock/idempotency behaviour is asserted in phase-8.
jest.mock('../../src/state/lock', () => ({
  LOCK_WAIT_MS: 10000,
  withScriptLock: <T>(fn: () => T): T => fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;
const mockedPipeline = rulePipeline as jest.Mocked<typeof rulePipeline>;

/** A fake image blob carrying fixed bytes (so sha256Hex is deterministic). */
function fakeBlob(bytes: number[] = [1, 2, 3, 4]): any {
  return {
    getBytes: jest.fn((): number[] => bytes),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/**
 * Install a DETERMINISTIC computeDigest double (content-sensitive 32-byte fold,
 * signed like GAS) so the REAL sha256Hex produces a stable hex per blob.
 */
function installDeterministicDigest(): void {
  g.Utilities.computeDigest = jest.fn((_algo: unknown, value: any): number[] => {
    const bytes: number[] =
      value && typeof value.getBytes === 'function' ? value.getBytes() : [];
    const out: number[] = [];
    for (let i = 0; i < 32; i++) {
      let acc = i * 31 + 7;
      for (let j = 0; j < bytes.length; j++) {
        acc = (acc * 131 + bytes[j] * (j + 1) + i) & 0xff;
      }
      out.push(acc > 127 ? acc - 256 : acc);
    }
    return out;
  });
}

/** Stateful in-memory CacheService counter + stash (real rate-limit boundary). */
function installStatefulCache(): void {
  const store = new Map<string, string>();
  g.CacheService.getScriptCache.mockReturnValue({
    get: jest.fn((key: string): string | null =>
      store.has(key) ? (store.get(key) as string) : null
    ),
    put: jest.fn((key: string, value: string): void => {
      store.set(key, value);
    }),
    remove: jest.fn((key: string): void => {
      store.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
}

/** The canonical 14-col submissions header (OVERVIEW §5). */
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
function row(values: Partial<Record<string, unknown>>): unknown[] {
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

/**
 * Install a stateful SpreadsheetApp double seeded with submissions `dataRows`
 * (the imageHash dedup scans it) + empty employees/roster tabs (so the auto-save
 * write path can upsert + resolve a placeholder name).
 */
function installSubmissions(dataRows: unknown[][] = []): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER, dataRows);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER);
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
}

/** Install a spy script-lock so the auto-save write path can acquire it. */
function installLock(): void {
  g.LockService.getScriptLock.mockReturnValue({
    waitLock: jest.fn(),
    tryLock: jest.fn((): boolean => true),
    releaseLock: jest.fn(),
  });
}

/** Compute the canonical hex the REAL sha256Hex would produce for `bytes`. */
function digestHexOf(bytes: number[]): string {
  const digest = g.Utilities.computeDigest('SHA_256', fakeBlob(bytes));
  return digest.map((b: number) => (b & 0xff).toString(16).padStart(2, '0')).join('');
}

/** The single string payload reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

const DUP_BYTES = [7, 7, 7, 7];

function imageEvent(userId = 'Uuser1', messageId = 'msg-100'): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: { userId },
    message: { id: messageId, type: 'image' },
  };
}

let ocrSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  installDeterministicDigest();
  installStatefulCache();
  installSubmissions(); // empty submissions by default (not a duplicate)
  installLock();
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  ocrSpy = jest
    .spyOn(ocrMock, 'recognize')
    .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));
  // Both-gates-pass cases run the auto-save path → the rule pipeline must PASS.
  mockedPipeline.evaluateSubmissionRules.mockReturnValue({ ok: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('imageGate — rate-limit exceeded (cooldown, no OCR)', () => {
  it('6th send from a user → cooldown block card, OCR NOT called', () => {
    // First five sends pass through to OCR; the 6th trips the rate limit. Use a
    // distinct messageId per send so the image-path idempotency guard does not
    // treat the repeat as a redelivery (that path is asserted in phase-8).
    for (let i = 0; i < 5; i++) handleImageMessage(imageEvent('Uflood', `m-${i}`));
    ocrSpy.mockClear();

    handleImageMessage(imageEvent('Uflood', 'm-5')); // 6th

    const payload = lastReplyPayload();
    expect(payload).toContain('ส่งบ่อยเกินไป รอสักครู่');
    expect(payload.toLowerCase()).toContain('#d64545');
    expect(payload).toContain('cameraRoll');
    // Cost gate: OCR must NOT run on the blocked 6th send.
    expect(ocrSpy).not.toHaveBeenCalled();
  });
});

describe('imageGate — duplicate image (dedup, no OCR)', () => {
  it('imageHash already in submissions → duplicate block card, OCR NOT called', () => {
    // Seed submissions with the hash the REAL sha256Hex will compute for DUP_BYTES.
    installSubmissions([row({ messageId: 'old', imageHash: digestHexOf(DUP_BYTES) })]);
    mockedLine.getMessageContent.mockReturnValue(fakeBlob(DUP_BYTES));

    handleImageMessage(imageEvent('Udup'));

    const payload = lastReplyPayload();
    expect(payload).toContain('รูปนี้เคยส่งแล้ว');
    expect(payload.toLowerCase()).toContain('#d64545');
    expect(payload).toContain('cameraRoll');
    expect(ocrSpy).not.toHaveBeenCalled();
  });
});

describe('imageGate — both gates pass (OCR runs → auto-save)', () => {
  it('rate ok + not duplicate → OCR called → auto-save + success card', () => {
    handleImageMessage(imageEvent('Uok'));

    expect(ocrSpy).toHaveBeenCalledTimes(1);
    // CR-1: a passing image is written immediately + answered with the success card.
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);
    const payload = lastReplyPayload();
    expect(payload).toContain('บันทึกแล้ว');
    expect(payload).not.toContain('action=confirm');
  });

  it('boundary: the 5th send passes (OCR runs), the 6th is blocked (no OCR)', () => {
    // 1st..5th: gates clear → OCR runs each time. Distinct bytes per send so each
    // is a genuinely new image (unique imageHash) — this isolates the rate-limit
    // boundary from the system-wide imageHash dedup gate, which (post CR-1
    // auto-save) would otherwise block a byte-identical resend after the 1st send
    // records its hash. Distinct messageIds also keep the image-path idempotency
    // guard from treating the repeats as redelivery (asserted in phase-8).
    for (let i = 0; i < 5; i++) {
      mockedLine.getMessageContent.mockReturnValueOnce(fakeBlob([i, i, i, i]));
      handleImageMessage(imageEvent('Uboundary', `b-${i}`));
    }
    expect(ocrSpy).toHaveBeenCalledTimes(5);

    ocrSpy.mockClear();
    handleImageMessage(imageEvent('Uboundary', 'b-5')); // 6th blocked by rate limit
    expect(ocrSpy).not.toHaveBeenCalled();
    expect(lastReplyPayload()).toContain('ส่งบ่อยเกินไป รอสักครู่');
  });
});
