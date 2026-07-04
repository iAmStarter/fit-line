/**
 * test/phase-7/triggerCard.spec.ts — phase-local unit: how-to trigger card.
 *
 * RED-first (Phase 7 FINAL, TDD). BLIND against the frozen `buildTriggerCard`
 * stub (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 7 acceptance
 * (line 160 — "trigger card (วิธีใช้ + quick-reply cameraRoll)") + OVERVIEW
 * §4/rule 9 (no emoji):
 *
 *   - buildTriggerCard() → a LINE flex message ({ type:'flex', altText, contents }).
 *   - the how-to text "วิธีส่งรูป" is present.
 *   - a `cameraRoll` quick reply is present (the user can pick a photo from the card).
 *   - the whole JSON is emoji-free (noEmoji helper).
 *
 * Pure builder (no args → object). No external boundary → the same assertions are
 * the real suite (mock/real n/a). We never read the impl body — only the public
 * signature.
 */

import { buildTriggerCard } from '../../src/line/flex/trigger';
import { expectNoEmoji } from '../support/noEmoji';

describe('buildTriggerCard — LINE flex message envelope', () => {
  it('returns a { type:"flex", altText, contents } message', () => {
    const card = buildTriggerCard() as Record<string, unknown>;
    expect(card.type).toBe('flex');
    expect(typeof card.altText).toBe('string');
    expect(card.contents).toBeDefined();
  });
});

describe('buildTriggerCard — how-to guidance + cameraRoll quick reply', () => {
  it('contains the how-to text "วิธีส่งรูป"', () => {
    const json = JSON.stringify(buildTriggerCard());
    expect(json).toContain('วิธีส่งรูป');
  });

  it('offers a cameraRoll quick reply (pick a photo from the card)', () => {
    const json = JSON.stringify(buildTriggerCard());
    expect(json).toContain('cameraRoll');
  });
});

describe('buildTriggerCard — no emoji (UI hard rule)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    expectNoEmoji(JSON.stringify(buildTriggerCard()));
  });
});
