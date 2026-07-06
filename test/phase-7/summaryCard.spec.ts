/**
 * test/phase-7/summaryCard.spec.ts — phase-local unit: on-demand summary card.
 *
 * RED-first (Phase 7 FINAL, TDD). BLIND against the frozen `buildSummaryCard`
 * stub (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 7 acceptance
 * (line 160 — "สรุปของฉัน → summary card") + OVERVIEW §4/§7/rule 9. The summary
 * line follows the SAME separator convention as the success card
 * (`สัปดาห์นี้ N · เดือนนี้ N · รวม N`, src/line/flex/success.ts):
 *
 *   - buildSummaryCard({week:3,month:5,total:10}, series) → JSON contains
 *     "สัปดาห์นี้ 3", "เดือนนี้ 5", "รวม 10".
 *   - the native bar chart is embedded (its distinctive series values appear).
 *   - NO external image URL (native Flex boxes only — privacy-safe, OVERVIEW §7).
 *   - the whole JSON is emoji-free (noEmoji helper).
 *   - empty user (zeros + all-zero series) → renders the zero summary, no crash.
 *
 * Pure builder (counts + series → object). No external boundary → the same
 * assertions are the real suite (mock/real n/a). We never read the impl body —
 * only the public signature.
 */

import { buildSummaryCard } from '../../src/line/flex/summary';
import { expectNoEmoji } from '../support/noEmoji';

const SERIES = [100, 150, 0, 200, 150, 0, 300];
const COUNTS = { week: 3, month: 5, total: 10 };

describe('buildSummaryCard — summary line (week / month / total)', () => {
  it('JSON contains "สัปดาห์นี้ 3", "เดือนนี้ 5", "รวม 10"', () => {
    const json = JSON.stringify(buildSummaryCard(COUNTS, SERIES));
    expect(json).toContain('สัปดาห์นี้ 3');
    expect(json).toContain('เดือนนี้ 5');
    expect(json).toContain('รวม 10');
  });
});

describe('buildSummaryCard — embeds the native bar chart', () => {
  it('the JSON carries the distinctive daily-series values (chart present)', () => {
    const json = JSON.stringify(buildSummaryCard(COUNTS, SERIES));
    expect(json).toContain('300');
    expect(json).toContain('200');
  });
});

describe('buildSummaryCard — privacy + no emoji (native Flex only)', () => {
  it('contains NO external http/https/url substring (native Flex boxes only)', () => {
    const json = JSON.stringify(buildSummaryCard(COUNTS, SERIES)).toLowerCase();
    expect(json).not.toContain('http');
    expect(json).not.toContain('url');
  });

  it('contains NO emoji codepoint anywhere in the JSON', () => {
    expectNoEmoji(JSON.stringify(buildSummaryCard(COUNTS, SERIES)));
  });
});

describe('buildSummaryCard — empty user (zeros, baseline, no crash)', () => {
  it('counts {0,0,0} + all-zero series → the zero summary, no throw', () => {
    const zeros = { week: 0, month: 0, total: 0 };
    const flat = [0, 0, 0, 0, 0, 0, 0];
    let json = '';
    expect(() => {
      json = JSON.stringify(buildSummaryCard(zeros, flat));
    }).not.toThrow();
    expect(json).toContain('สัปดาห์นี้ 0');
    expect(json).toContain('เดือนนี้ 0');
    expect(json).toContain('รวม 0');
  });
});
