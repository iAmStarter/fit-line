/**
 * test/phase-5/rejectDispute.spec.ts — phase-local unit: reject card WITH the
 * Phase 5 dispute affordance (repeated-reject escalation).
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `buildRejectCard` dispute
 * branch (the `opts.disputeMessageId !== undefined` path throws NotImplemented;
 * the no-opts branch stays Phase-1 GREEN, covered by
 * test/phase-1/rejectCard.spec.ts). Asserts BEHAVIOR from PLAN Phase 5 acceptance
 * (line 124) + OVERVIEW §6 (dispute = quick reply, NOT an in-card button):
 *   - buildRejectCard(m,'reason',{disputeMessageId:'m1'}) carries a MESSAGE-LEVEL
 *     quick-reply postback with data `action=dispute&mid=m1`.
 *   - the cameraRoll quick-reply is STILL present alongside it.
 *   - NO button / interactive action inside the card body (no fake affordance).
 *   - NO emoji anywhere.
 *   - buildRejectCard(m,'reason') (no opts) → NO dispute affordance (no
 *     `action=dispute` anywhere) — the Phase-1 shape is unchanged.
 *
 * Pure builder (OcrMetrics + reason + opts → object). No external boundary → the
 * same assertions are the real suite (mock/real n/a). We never read the impl body
 * — only the public signature.
 */

import { buildRejectCard } from '../../src/line/flex/reject';
import { makeOcrMetrics } from '../support/ocrFixture';
import { expectNoEmoji } from '../support/noEmoji';

const REASON = 'อ่านค่าแคลอรี่ไม่ได้';
const M = makeOcrMetrics({
  activeCaloriesKcal: 100,
  totalCaloriesKcal: 140,
  activityType: 'Running',
});

/** Deep-collect every object node in the tree that has a `type` field. */
function collectTyped(
  node: unknown,
  out: Record<string, unknown>[] = []
): Record<string, unknown>[] {
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

/** Message-level quick-reply items (the envelope, NOT the card body). */
function quickReplyItems(card: Record<string, unknown>): Record<string, unknown>[] {
  const quickReply = card.quickReply as Record<string, unknown> | undefined;
  return (quickReply?.items ?? []) as Record<string, unknown>[];
}

describe('buildRejectCard — dispute affordance (message-level quick reply)', () => {
  it('carries a postback quick-reply with data action=dispute&mid=m1', () => {
    const card = buildRejectCard(M, REASON, {
      disputeMessageId: 'm1',
    }) as Record<string, unknown>;
    const items = quickReplyItems(card);
    const hasDispute = items.some((item) => {
      const action = (item?.action ?? {}) as Record<string, unknown>;
      return (
        action.type === 'postback' &&
        typeof action.data === 'string' &&
        (action.data as string).includes('action=dispute') &&
        (action.data as string).includes('mid=m1')
      );
    });
    expect(hasDispute).toBe(true);
  });

  it('still carries the cameraRoll quick-reply alongside the dispute one', () => {
    const card = buildRejectCard(M, REASON, {
      disputeMessageId: 'm1',
    }) as Record<string, unknown>;
    const items = quickReplyItems(card);
    const hasCameraRoll = items.some((item) => {
      const action = (item?.action ?? {}) as Record<string, unknown>;
      return action.type === 'cameraRoll';
    });
    expect(hasCameraRoll).toBe(true);
  });

  it('does NOT put a button / interactive action inside the card body', () => {
    const card = buildRejectCard(M, REASON, {
      disputeMessageId: 'm1',
    }) as Record<string, unknown>;
    const typedInBody = collectTyped(card.contents);
    const hasButton = typedInBody.some((n) => n.type === 'button');
    const hasInteractive = typedInBody.some(
      (n) => n.type === 'postback' || n.type === 'message'
    );
    expect(hasButton).toBe(false);
    expect(hasInteractive).toBe(false);
  });

  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const json = JSON.stringify(
      buildRejectCard(M, REASON, { disputeMessageId: 'm1' })
    );
    expectNoEmoji(json);
  });
});

describe('buildRejectCard — no opts → NO dispute affordance (Phase-1 shape)', () => {
  it('the JSON contains no action=dispute when no disputeMessageId is given', () => {
    const json = JSON.stringify(buildRejectCard(M, REASON));
    expect(json).not.toContain('action=dispute');
  });

  it('still carries a cameraRoll quick-reply (unchanged Phase-1 reject)', () => {
    const card = buildRejectCard(M, REASON) as Record<string, unknown>;
    const items = quickReplyItems(card);
    const hasCameraRoll = items.some((item) => {
      const action = (item?.action ?? {}) as Record<string, unknown>;
      return action.type === 'cameraRoll';
    });
    expect(hasCameraRoll).toBe(true);
  });
});
