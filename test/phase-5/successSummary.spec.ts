/**
 * test/phase-5/successSummary.spec.ts — phase-local unit: success card WITH the
 * Phase 5 summary section + native bar chart.
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `buildSuccessCard` summary
 * branch (the `counts !== undefined && dailyValues !== undefined` path throws
 * NotImplemented; the no-args branch stays Phase-2 GREEN, covered by
 * test/phase-2/successCard.spec.ts). Asserts BEHAVIOR from PLAN Phase 5 acceptance
 * (lines 122–123, 125–126) + OVERVIEW §4/§7:
 *   - buildSuccessCard(ctx, {week:3,month:5,total:10}, series) → the JSON contains
 *     "สัปดาห์นี้ 3", "เดือนนี้ 5", "รวม 10".
 *   - the bar chart is embedded (its 7 bar values appear in the JSON).
 *   - success green #1e9e57; NO emoji; NO external URL (native Flex boxes only).
 *   - empty user: counts {0,0,0} + all-zero series → baseline, no crash, shows 0s.
 *
 * Pure builder (StashedContext + counts + series → object). No external boundary
 * → the same assertions are the real suite (mock/real n/a). We never read the impl
 * body — only the public signature.
 */

import { buildSuccessCard } from '../../src/line/flex/success';
import { makeStashedContext } from '../support/stashFixture';
import { expectNoEmoji } from '../support/noEmoji';

const SERIES = [100, 150, 0, 200, 150, 0, 300];
const COUNTS = { week: 3, month: 5, total: 10 };

describe('buildSuccessCard — summary section (week / month / total)', () => {
  it('JSON contains "สัปดาห์นี้ 3", "เดือนนี้ 5", "รวม 10"', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES));
    expect(json).toContain('สัปดาห์นี้ 3');
    expect(json).toContain('เดือนนี้ 5');
    expect(json).toContain('รวม 10');
  });

  it('still shows the recorded confirmation "บันทึกแล้ว" and the calorie value', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES));
    expect(json).toContain('บันทึกแล้ว');
    expect(json).toContain('200');
  });
});

describe('buildSuccessCard — embeds the native bar chart', () => {
  it('the JSON carries the daily-series values (chart is present)', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES));
    // the distinctive chart values appear (chart section embedded)
    expect(json).toContain('300');
    expect(json).toContain('150');
  });
});

describe('buildSuccessCard — semantic + privacy (green, no URL, no emoji)', () => {
  it('uses the success green #1e9e57', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES));
    expect(json.toLowerCase()).toContain('#1e9e57');
  });

  it('contains NO external http/https/url substring (native Flex boxes only)', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES)).toLowerCase();
    expect(json).not.toContain('http');
    expect(json).not.toContain('url');
  });

  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const json = JSON.stringify(buildSuccessCard(ctx, COUNTS, SERIES));
    expectNoEmoji(json);
  });
});

describe('buildSuccessCard — empty user (zeros, baseline, no crash)', () => {
  it('counts {0,0,0} + all-zero series → shows the zero summary, no throw', () => {
    const ctx = makeStashedContext({}, { activeCaloriesKcal: 200 });
    const zeros = { week: 0, month: 0, total: 0 };
    const flat = [0, 0, 0, 0, 0, 0, 0];
    let json = '';
    expect(() => {
      json = JSON.stringify(buildSuccessCard(ctx, zeros, flat));
    }).not.toThrow();
    expect(json).toContain('สัปดาห์นี้ 0');
    expect(json).toContain('เดือนนี้ 0');
    expect(json).toContain('รวม 0');
  });
});
