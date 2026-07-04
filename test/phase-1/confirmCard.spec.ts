/**
 * test/phase-1/confirmCard.spec.ts — phase-local unit: confirm Flex builder.
 *
 * RED-first (Phase 1, TDD). Asserts BEHAVIOR from PLAN Phase 1 acceptance +
 * OVERVIEW §4/§6 UI rules:
 *   - returns a LINE flex message object (type 'flex' with a bubble in contents).
 *   - stringified JSON contains the calorie value (200), activityType,
 *     activityDate from the OcrMetrics.
 *   - carries a POSTBACK action whose data === `action=confirm&id=<cacheId>`.
 *   - uses the info/confirm semantic color `#2f6fed`.
 *   - NO emoji codepoint anywhere in the JSON (rule 9).
 *
 * Pure builder (OcrMetrics + cacheId -> object). No external boundary → the
 * same assertions are the real suite (mock/real n/a). We never read the impl
 * body (stub throws NotImplemented) — only the public signature.
 */

import { buildConfirmCard } from '../../src/line/flex/confirm';
import { makeOcrMetrics } from '../support/ocrFixture';
import { expectNoEmoji } from '../support/noEmoji';

const CACHE_ID = 'aB3xZ9';
const M = makeOcrMetrics({
  activeCaloriesKcal: 200,
  activityType: 'Running',
  activityDateISO: '2026-07-04',
});

/**
 * Deep-scan a Flex object tree for any `action` object whose `type` is
 * 'postback'. Returns the first match or null.
 */
function findPostbackAction(node: unknown): Record<string, unknown> | null {
  if (node === null || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'postback' && typeof obj.data === 'string') {
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const found = findPostbackAction(obj[key]);
    if (found) return found;
  }
  return null;
}

describe('buildConfirmCard — LINE flex message shape', () => {
  it('returns a flex message object (type flex + a bubble in contents)', () => {
    const card = buildConfirmCard(M, CACHE_ID) as Record<string, unknown>;
    expect(card).toBeTruthy();
    expect(card.type).toBe('flex');
    const contents = card.contents as Record<string, unknown> | undefined;
    expect(contents).toBeDefined();
    expect(contents?.type).toBe('bubble');
  });
});

describe('buildConfirmCard — displays the OCR reading', () => {
  it('JSON contains the calorie value 200', () => {
    const json = JSON.stringify(buildConfirmCard(M, CACHE_ID));
    expect(json).toContain('200');
  });

  it('JSON contains the activityType and activityDate', () => {
    const json = JSON.stringify(buildConfirmCard(M, CACHE_ID));
    expect(json).toContain('Running');
    expect(json).toContain('2026-07-04');
  });
});

describe('buildConfirmCard — confirm postback action', () => {
  it('has a postback action with data action=confirm&id=<cacheId>', () => {
    const card = buildConfirmCard(M, CACHE_ID);
    const action = findPostbackAction(card);
    expect(action).not.toBeNull();
    expect(action?.data).toBe(`action=confirm&id=${CACHE_ID}`);
  });
});

describe('buildConfirmCard — semantic color (info/confirm)', () => {
  it('uses the info color #2f6fed somewhere in the card', () => {
    const json = JSON.stringify(buildConfirmCard(M, CACHE_ID));
    expect(json.toLowerCase()).toContain('#2f6fed');
  });
});

describe('buildConfirmCard — UI hard rule (rule 9)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const json = JSON.stringify(buildConfirmCard(M, CACHE_ID));
    expectNoEmoji(json);
  });
});
