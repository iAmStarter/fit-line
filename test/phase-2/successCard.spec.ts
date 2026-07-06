/**
 * test/phase-2/successCard.spec.ts — phase-local unit: success Flex builder.
 *
 * RED-first (Phase 2, TDD). BLIND against the frozen `buildSuccessCard` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 2 acceptance +
 * OVERVIEW §4 UI rules:
 *   - returns a LINE flex message object (type 'flex' with a bubble in contents).
 *   - stringified JSON contains "บันทึกแล้ว" (the recorded confirmation) and the
 *     calorie value "200".
 *   - uses the success semantic green `#1e9e57`.
 *   - NO emoji codepoint anywhere in the JSON (rule 9 — reuse noEmoji).
 *   - fallback: active=null,total=170 → shows 170 (prefer active, else total).
 *
 * Pure builder (StashedContext → object). No external boundary → the same
 * assertions are the real suite (mock/real n/a). We never read the impl body —
 * only the public signature.
 */

import { buildSuccessCard } from '../../src/line/flex/success';
import { makeStashedContext } from '../support/stashFixture';
import { expectNoEmoji } from '../support/noEmoji';

describe('buildSuccessCard — LINE flex message shape', () => {
  it('returns a flex message object (type flex + a bubble in contents)', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const card = buildSuccessCard(ctx) as Record<string, unknown>;
    expect(card).toBeTruthy();
    expect(card.type).toBe('flex');
    const contents = card.contents as Record<string, unknown> | undefined;
    expect(contents).toBeDefined();
    expect(contents?.type).toBe('bubble');
  });
});

describe('buildSuccessCard — recorded confirmation + calorie', () => {
  it('JSON contains "บันทึกแล้ว" and the calorie value 200', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx));
    expect(json).toContain('บันทึกแล้ว');
    expect(json).toContain('200');
  });
});

describe('buildSuccessCard — calorie fallback (active null → total)', () => {
  it('active=null,total=170 → card shows 170', () => {
    const ctx = makeStashedContext(
      {},
      { activeCaloriesKcal: null, totalCaloriesKcal: 170 }
    );
    const json = JSON.stringify(buildSuccessCard(ctx));
    expect(json).toContain('170');
  });
});

describe('buildSuccessCard — semantic color (success green)', () => {
  it('uses the success green #1e9e57 somewhere in the card', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx));
    expect(json.toLowerCase()).toContain('#1e9e57');
  });
});

describe('buildSuccessCard — UI hard rule (rule 9)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx));
    expectNoEmoji(json);
  });
});
