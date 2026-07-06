/**
 * test/phase-5/imageRejectDispute.spec.ts — phase-local integration: the
 * image-reject DISPUTE AUTO-OFFER (repeated-reject escalation).
 *
 * RED-first (Phase 5, TDD). Closes the deferred PLAN Phase 5 acceptance (line
 * 124): "GIVEN userId fail กิจกรรมเดิมครบ 3 ครั้ง WHEN reject ครั้งที่ 3 THEN reject
 * card มี affordance 'แจ้งแอดมิน'". The mechanism pieces are already green
 * (`buildRejectCard({disputeMessageId})`, `disputeGuard.bumpFailCount` /
 * `shouldOfferDispute`, the `action=dispute` postback branch); this suite drives
 * the INTEGRATION that no other test covers — `handleImageMessage`'s reject path
 * bumping the per-(user, activity) counter and, at the threshold, attaching the
 * dispute quick reply to the reject card. See docs/ISSUES.md 2026-07-04 Phase-5
 * deferral: the wiring is absent, so the 3rd reject does NOT yet carry the
 * affordance → this suite is RED now, GREEN after the implementer wires it.
 *
 * NOT MOCKED (the behaviour under test): the REAL `disputeGuard` counter and a
 * REAL stateful `CacheService` double backing it (`fc:<user>:<activity>` key), the
 * REAL post-OCR rule pipeline (a calorie reject on active=100/total=140 — the
 * pipeline short-circuits on calories, so no Sheet lookup is reached), and the
 * REAL `buildRejectCard`.
 *
 * MOCKED (external boundary + pre-OCR gates that are not under test here): the
 * LINE network seam (`getMessageContent` / `reply` spy), and the Phase-3 gates
 * (`rateLimit` ALLOWS, `imageDedup` NOT a duplicate) so the image path reaches
 * OCR. `ocrMock.recognize` is spied to return a fixed calorie-failing reading with
 * a fixed activityType. mock/real flag: GAS CacheService has no cheap Node
 * analogue → the stateful double IS the real counter boundary; the SAME assertions
 * run. We never read the impl bodies — only public signatures.
 */

import { handleImageMessage } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { ocrMock } from '../../src/ocr/ocrMock';
import * as lineClient from '../../src/line/lineClient';
import * as rateLimit from '../../src/rules/rateLimit';
import * as imageDedup from '../../src/rules/imageDedup';
import { makeOcrMetrics } from '../support/ocrFixture';

// Mock ONLY the external boundary (LINE network) + the pre-OCR gates that are not
// under test here (so the image path reaches OCR). disputeGuard + rulePipeline +
// buildRejectCard + CacheService counter all run REAL.
jest.mock('../../src/line/lineClient');
jest.mock('../../src/ocr/ocrMock');
jest.mock('../../src/rules/rateLimit');
jest.mock('../../src/rules/imageDedup');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;
const mockedRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;
const mockedImageDedup = imageDedup as jest.Mocked<typeof imageDedup>;

/** A calorie-failing reading: active < 150 → pipeline rejects on calories (first
 *  rule, short-circuits before any Sheet-backed rule). `activityType` is the
 *  disputeGuard bucket key. */
const RUN_USER = 'Urunner';

/** A minimal fake image blob standing in for LINE getContent output. */
function fakeBlob(): any {
  return {
    getBytes: jest.fn((): number[] => [1, 2, 3, 4]),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/** Install a stateful in-memory CacheService so the REAL fail-counter persists
 *  across calls (get → +1 → put on the `fc:<user>:<activity>` key). */
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

/** The string payload reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

/** An image event for a (user, messageId), fixed replyToken. */
function imageEvent(
  messageId: string,
  userId = RUN_USER
): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: `rt-${messageId}`,
    source: { userId },
    message: { id: messageId, type: 'image' },
  };
}

/** Drive one reject for the given (user, activity, messageId): OCR returns a
 *  calorie-failing reading with the given activityType, then handle the image. */
function rejectOnce(
  messageId: string,
  activityType: string,
  userId = RUN_USER
): void {
  jest.spyOn(ocrMock, 'recognize').mockReturnValue(
    makeOcrMetrics({
      activeCaloriesKcal: 100,
      totalCaloriesKcal: 140,
      activityType,
    })
  );
  handleImageMessage(imageEvent(messageId, userId));
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  // Gates pass so the image path reaches OCR + the reject builder.
  mockedRateLimit.rateLimitAllows.mockReturnValue(true);
  mockedImageDedup.sha256Hex.mockImplementation(
    (): string => 'ab'.repeat(32)
  );
  mockedImageDedup.isDuplicateImage.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleImageMessage — dispute auto-offer at the 3rd same-activity reject', () => {
  it('the 1st reject for (user, run) carries NO dispute affordance', () => {
    rejectOnce('m1', 'run');
    const payload = lastReplyPayload();
    // still a reject card (error color), but no auto-offer yet
    expect(payload.toLowerCase()).toContain('#d64545');
    expect(payload).not.toContain('action=dispute');
  });

  it('the 2nd reject for (user, run) still carries NO dispute affordance', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    const payload = lastReplyPayload();
    expect(payload.toLowerCase()).toContain('#d64545');
    expect(payload).not.toContain('action=dispute');
  });

  it('the 3rd reject for (user, run) DOES carry the dispute quick reply keyed to its messageId', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    rejectOnce('m3', 'run');
    const payload = lastReplyPayload();
    // the auto-offer appears at DISPUTE_FAIL_THRESHOLD (3) for the SAME activity
    expect(payload).toContain('action=dispute');
    // keyed to the 3rd message's id (the one that tripped the threshold)
    expect(payload).toContain('mid=m3');
  });

  it('the 3rd reject still carries the cameraRoll quick reply ALONGSIDE the dispute one', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    rejectOnce('m3', 'run');
    const payload = lastReplyPayload();
    expect(payload).toContain('cameraRoll');
    expect(payload).toContain('action=dispute');
  });

  it('the dispute affordance is a message-level quick reply, NOT an in-card button', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    rejectOnce('m3', 'run');
    const calls = mockedLine.reply.mock.calls;
    const [, messages] = calls[calls.length - 1];
    const card = (messages as Record<string, unknown>[])[0];
    // dispute postback lives under the envelope quickReply, never in card body
    const quickReply = card.quickReply as
      | { items?: Record<string, unknown>[] }
      | undefined;
    const items = quickReply?.items ?? [];
    const hasDispute = items.some((it) => {
      const action = (it?.action ?? {}) as Record<string, unknown>;
      return (
        action.type === 'postback' &&
        typeof action.data === 'string' &&
        (action.data as string).includes('action=dispute')
      );
    });
    expect(hasDispute).toBe(true);
    // and the card body carries no interactive postback/button node
    expect(JSON.stringify(card.contents)).not.toContain('action=dispute');
  });
});

describe('handleImageMessage — per-activity counter is independent', () => {
  it('a 3rd reject on run offers dispute, but two run + one ride does NOT (ride counter separate)', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    // a DIFFERENT activity for the same user — its own counter, still at 1
    rejectOnce('m3', 'ride');
    const payload = lastReplyPayload();
    // ride is only its 1st fail → no auto-offer, and it must NOT inherit run's 2
    expect(payload).not.toContain('action=dispute');
  });

  it('the run counter is unaffected by the ride reject: run reaches 3 on its own 3rd', () => {
    rejectOnce('m1', 'run');
    rejectOnce('m2', 'run');
    rejectOnce('mR', 'ride'); // unrelated activity in between
    rejectOnce('m3', 'run'); // run's 3rd → threshold
    const payload = lastReplyPayload();
    expect(payload).toContain('action=dispute');
    expect(payload).toContain('mid=m3');
  });
});

describe('handleImageMessage — per-user counter is independent', () => {
  it('a different user does NOT inherit another user run streak', () => {
    rejectOnce('m1', 'run', 'Ualice');
    rejectOnce('m2', 'run', 'Ualice');
    // a different user's 1st run reject — independent counter
    rejectOnce('m3', 'run', 'Ubob');
    const payload = lastReplyPayload();
    expect(payload).not.toContain('action=dispute');
  });
});
