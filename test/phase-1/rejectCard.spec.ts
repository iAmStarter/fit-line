/**
 * test/phase-1/rejectCard.spec.ts — phase-local unit: reject Flex builder.
 *
 * RED-first (Phase 1, TDD). Asserts BEHAVIOR from PLAN Phase 1 acceptance +
 * OVERVIEW §6 (reject card = NO button, cameraRoll quick reply):
 *   - JSON shows the OCR active value + the reason coach text.
 *   - uses the error semantic color `#d64545`.
 *   - carries a message-level quick reply with a `cameraRoll` action.
 *   - NO postback/message BUTTON inside the card body (no fake affordance).
 *   - NO emoji codepoint anywhere in the JSON (rule 9).
 *
 * Pure builder (OcrMetrics + reason -> object). No external boundary → the same
 * assertions are the real suite (mock/real n/a). We never read the impl body
 * (stub throws NotImplemented) — only the public signature.
 */

import { buildRejectCard } from '../../src/line/flex/reject';
import { makeOcrMetrics } from '../support/ocrFixture';
import { expectNoEmoji } from '../support/noEmoji';

const REASON = 'แคลอรี่ต่ำกว่าเกณฑ์ 150';
const M = makeOcrMetrics({
  activeCaloriesKcal: 100,
  totalCaloriesKcal: 140,
  activityType: 'Running',
});

/** Deep-collect every object node in the tree that has a `type` field. */
function collectTyped(node: unknown, out: Record<string, unknown>[] = []): Record<
  string,
  unknown
>[] {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const el of node) collectTyped(el, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.type === 'string') out.push(obj);
  for (const key of Object.keys(obj)) collectTyped(obj[key], out);
  return out;
}

/** The Flex bubble body (card contents) — excludes the message-level quickReply. */
function cardBody(card: Record<string, unknown>): unknown {
  return card.contents;
}

describe('buildRejectCard — LINE flex message shape', () => {
  it('returns a flex message object with a bubble in contents', () => {
    const card = buildRejectCard(M, REASON) as Record<string, unknown>;
    expect(card).toBeTruthy();
    expect(card.type).toBe('flex');
    const contents = card.contents as Record<string, unknown> | undefined;
    expect(contents?.type).toBe('bubble');
  });
});

describe('buildRejectCard — displays OCR value + reason', () => {
  it('JSON contains the OCR active calorie value 100', () => {
    const json = JSON.stringify(buildRejectCard(M, REASON));
    expect(json).toContain('100');
  });

  it('JSON contains the reason coach text', () => {
    const json = JSON.stringify(buildRejectCard(M, REASON));
    expect(json).toContain(REASON);
  });
});

describe('buildRejectCard — error semantic color', () => {
  it('uses the error color #d64545 somewhere in the card', () => {
    const json = JSON.stringify(buildRejectCard(M, REASON));
    expect(json.toLowerCase()).toContain('#d64545');
  });
});

describe('buildRejectCard — cameraRoll quick reply (message-level)', () => {
  it('carries a quick reply action of type cameraRoll', () => {
    const card = buildRejectCard(M, REASON) as Record<string, unknown>;
    const quickReply = card.quickReply as Record<string, unknown> | undefined;
    expect(quickReply).toBeDefined();
    const items = (quickReply?.items ?? []) as Record<string, unknown>[];
    const hasCameraRoll = items.some((item) => {
      const action = (item?.action ?? {}) as Record<string, unknown>;
      return action.type === 'cameraRoll';
    });
    expect(hasCameraRoll).toBe(true);
  });
});

describe('buildRejectCard — NO button inside the card body', () => {
  it('the bubble body contains no button and no interactive action', () => {
    const card = buildRejectCard(M, REASON) as Record<string, unknown>;
    const typedInBody = collectTyped(cardBody(card));
    const hasButton = typedInBody.some((n) => n.type === 'button');
    const hasInteractiveAction = typedInBody.some(
      (n) => n.type === 'postback' || n.type === 'message'
    );
    expect(hasButton).toBe(false);
    expect(hasInteractiveAction).toBe(false);
  });
});

describe('buildRejectCard — UI hard rule (rule 9)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const json = JSON.stringify(buildRejectCard(M, REASON));
    expectNoEmoji(json);
  });
});
