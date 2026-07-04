/**
 * test/phase-1/router.spec.ts — phase-local: image-event routing + handler.
 *
 * RED-first (Phase 1, TDD). Asserts BEHAVIOR from PLAN Phase 1 acceptance
 * (image read path) via routeWebhook(rawBody) / handleImageMessage(event):
 *   - image event + pipeline PASSES -> reply called with a CONFIRM card AND the
 *     OCR result is stashed in CacheService (a put occurred).
 *   - image event + pipeline REJECTS (a calorie-reject reason) -> reply called
 *     with a REJECT card AND NO stash occurred. (Phase 4: the confirm path now
 *     runs the rule PIPELINE, not calorieRule directly; this test verifies main
 *     FORWARDS a pipeline reject → reject card. The calorie LOGIC itself is
 *     covered by the calorie/pipeline unit suites, not here.)
 *   - OCR throws -> reply called with a graceful error card ("อ่านรูปไม่สำเร็จ");
 *     the handler does NOT throw out (doPost stays 200).
 *   - non-image event (text/sticker) -> graceful (no throw).
 *
 * MOCK suite: the external boundaries are (a) LINE getContent/reply and (b) the
 * OCR recognizer. We mock ONLY those seams:
 *   - `jest.mock('../../src/line/lineClient')` doubles getMessageContent (returns
 *     a fake blob) + reply (spy).
 *   - `jest.spyOn(ocrMock, 'recognize')` drives the OCR return / throw.
 *   - CacheService is a stateful in-memory double (real stash boundary).
 * Phase-3 gates (rateLimit + imageDedup) and the Phase-4 rule pipeline are mocked
 * at their module seams so THIS suite exercises only main's read-path routing /
 * card choice; their own behaviour is asserted in their own unit suites. The
 * confirm-vs-reject distinction is asserted on the payload passed to reply
 * (compact postback `action=confirm` marker vs the reject cameraRoll / error
 * color) — behaviour, not internal wiring. We never read impl bodies.
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

// Mock ONLY the external boundaries (network + OCR seam). Business logic
// stays real. Auto-mocking ocrMock makes recognize a spy so a text event's
// "OCR was not called" precondition holds; the OCR-driving tests below
// still re-configure it via jest.spyOn(ocrMock, 'recognize').
jest.mock('../../src/line/lineClient');
jest.mock('../../src/ocr/ocrMock');
// Phase 3 introduced pre-OCR gate collaborators that handleImageMessage now
// routes through (rate-limit + image dedup). These Phase-1 tests are NOT testing
// those gates — mock them so the pass-path preconditions hold regardless of gate
// impl (which is filled in Phase 3): rate-limit ALLOWS, image is NOT a duplicate,
// sha256Hex returns a stable dummy hex. Every original Phase-1 assertion is kept.
jest.mock('../../src/rules/rateLimit');
jest.mock('../../src/rules/imageDedup');
// Phase 4 wired the post-OCR rule PIPELINE (calorie → backdate → dedup) into the
// confirm path. These Phase-1 tests are NOT testing rule logic — mock the pipeline
// so the pass-path reaches stash+confirm ({ok:true}) and the reject-path forwards
// a first-fail reason to the reject card. The pipeline's own ordering/short-circuit
// is covered by test/phase-4/rulePipeline.spec.ts.
jest.mock('../../src/rules/rulePipeline');
// Phase 5 wired a repeated-reject dispute counter (disputeGuard) into the reject
// path — `bumpFailCount` persists a `fc:<user>:<activity>` counter via
// CacheService.put and `shouldOfferDispute` decides the auto-offer. These Phase-1
// tests are NOT testing that counter; its own behaviour is asserted in the
// disputeGuard / imageRejectDispute suites. Mock the seam so the counter is a
// no-op here: `bumpFailCount` does NOT touch CacheService (preserving the frozen
// "a reject writes NOTHING to cache" contract — putSpy not called, cacheStore
// empty) and returns a below-threshold count so `shouldOfferDispute` is false and
// the reject card keeps its Phase-1 shape (cameraRoll only, no dispute affordance).
// Every original Phase-1 assertion is kept unchanged.
jest.mock('../../src/rules/disputeGuard');

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

/** Install a stateful in-memory CacheService so a real stash can be observed. */
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
  installStatefulCache();
  mockedLine.getMessageContent.mockReturnValue(fakeBlob());
  mockedLine.reply.mockImplementation(() => undefined);
  // Pass-path gate defaults: rate-limit allows + image is not a duplicate.
  mockedRateLimit.rateLimitAllows.mockReturnValue(true);
  mockedImageDedup.sha256Hex.mockReturnValue('deadbeef'.repeat(8));
  mockedImageDedup.isDuplicateImage.mockReturnValue(false);
  // Pass-path pipeline default: all business rules pass → reach stash+confirm.
  mockedPipeline.evaluateSubmissionRules.mockReturnValue({ ok: true });
  // Dispute-counter defaults: `bumpFailCount` is a no-op that does NOT write the
  // `fc:` cache key (keeping the frozen "reject writes nothing to cache" contract)
  // and returns a below-threshold count so `shouldOfferDispute` stays false → the
  // reject card keeps its Phase-1 shape (no dispute affordance). Isolating this
  // Phase-5 side-effect does not weaken any Phase-1 assertion below.
  mockedDisputeGuard.bumpFailCount.mockReturnValue(1);
  mockedDisputeGuard.shouldOfferDispute.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleImageMessage — pass path (confirm + stash)', () => {
  it('OCR active=200 -> reply with a CONFIRM card and OCR stashed', () => {
    jest
      .spyOn(ocrMock, 'recognize')
      .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));

    handleImageMessage(IMAGE_EVENT);

    // fetched the image content for the event's message id
    expect(mockedLine.getMessageContent).toHaveBeenCalledWith('msg-100');
    // replied with a confirm card (compact confirm postback marker present)
    const payload = lastReplyPayload();
    expect(payload).toContain('action=confirm');
    // OCR result was stashed (a cache put occurred)
    expect(putSpy).toHaveBeenCalled();
    expect(cacheStore.size).toBeGreaterThan(0);
  });
});

describe('handleImageMessage — reject path (no stash)', () => {
  it('pipeline rejects (calorie reason) -> reply with a REJECT card and NO stash', () => {
    // OCR succeeds; the PIPELINE returns a first-fail reject (calorie). This test
    // verifies main FORWARDS the pipeline reject → reject card (the calorie logic
    // itself lives in the calorie/pipeline unit suites).
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
    // reject card: NOT a confirm, carries the reject error color / cameraRoll
    expect(payload).not.toContain('action=confirm');
    expect(payload.toLowerCase()).toContain('#d64545');
    // no stash on the reject path
    expect(putSpy).not.toHaveBeenCalled();
    expect(cacheStore.size).toBe(0);
  });
});

describe('handleImageMessage — OCR error (graceful)', () => {
  it('OCR throws -> reply with an error card, no throw out, no stash', () => {
    jest.spyOn(ocrMock, 'recognize').mockImplementation(() => {
      throw new Error('OCR timeout');
    });

    expect(() => handleImageMessage(IMAGE_EVENT)).not.toThrow();

    const payload = lastReplyPayload();
    expect(payload).toContain('อ่านรูปไม่สำเร็จ');
    expect(putSpy).not.toHaveBeenCalled();
  });
});

describe('routeWebhook — image dispatch', () => {
  it('routes an image message to the image handler (confirm reply)', () => {
    jest
      .spyOn(ocrMock, 'recognize')
      .mockReturnValue(makeOcrMetrics({ activeCaloriesKcal: 200 }));

    routeWebhook(bodyWith(IMAGE_EVENT));

    expect(mockedLine.getMessageContent).toHaveBeenCalledWith('msg-100');
    expect(lastReplyPayload()).toContain('action=confirm');
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
