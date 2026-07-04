/**
 * test/phase-7/richMenu.spec.ts — phase-local unit: rich-menu definition JSON.
 *
 * RED-first (Phase 7 FINAL, TDD). BLIND against the frozen `buildRichMenu` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 7 acceptance (line
 * 160) + OVERVIEW §4/rule 9 (no emoji):
 *
 *   - buildRichMenu() returns exactly TWO tappable `areas`.
 *   - one area fires a postback whose `data` contains `action=help` labelled
 *     "วิธีส่งรูป".
 *   - the other fires `action=summary` labelled "สรุปของฉัน".
 *   - the whole JSON is emoji-free (noEmoji helper).
 *
 * We do NOT unit-test `registerRichMenu()` — it is an OWNER-run one-time network
 * setup (staged/manual), not the request path. We optionally assert it is a
 * function so the export surface is pinned.
 *
 * Pure builder (no args → object). No external boundary → the same assertions
 * are the real suite (mock/real n/a). We never read the impl body — only the
 * public signature.
 */

import { buildRichMenu, registerRichMenu } from '../../src/line/richMenu';
import { expectNoEmoji } from '../support/noEmoji';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Collect the `areas` array from the rich-menu definition (typed loosely). */
function areasOf(menu: any): any[] {
  expect(Array.isArray(menu.areas)).toBe(true);
  return menu.areas as any[];
}

describe('buildRichMenu — two tappable areas (help + summary)', () => {
  it('defines exactly 2 areas', () => {
    const menu = buildRichMenu() as any;
    expect(areasOf(menu)).toHaveLength(2);
  });

  it('each area carries a tappable postback action', () => {
    const menu = buildRichMenu() as any;
    for (const area of areasOf(menu)) {
      expect(area.action).toBeDefined();
      expect(area.action.type).toBe('postback');
      expect(typeof area.action.data).toBe('string');
    }
  });
});

describe('buildRichMenu — routes action=help and action=summary', () => {
  it('one area postback data contains "action=help"', () => {
    const json = JSON.stringify(buildRichMenu());
    expect(json).toContain('action=help');
  });

  it('one area postback data contains "action=summary"', () => {
    const json = JSON.stringify(buildRichMenu());
    expect(json).toContain('action=summary');
  });

  it('the two areas fire DISTINCT actions (help vs summary)', () => {
    const menu = buildRichMenu() as any;
    const datas = areasOf(menu).map((a) => String(a.action.data));
    const help = datas.find((d) => d.includes('action=help'));
    const summary = datas.find((d) => d.includes('action=summary'));
    expect(help).toBeDefined();
    expect(summary).toBeDefined();
    expect(help).not.toBe(summary);
  });
});

describe('buildRichMenu — button labels', () => {
  it('carries the "วิธีส่งรูป" and "สรุปของฉัน" labels', () => {
    const json = JSON.stringify(buildRichMenu());
    expect(json).toContain('วิธีส่งรูป');
    expect(json).toContain('สรุปของฉัน');
  });
});

describe('buildRichMenu — no emoji (UI hard rule)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    expectNoEmoji(JSON.stringify(buildRichMenu()));
  });
});

describe('registerRichMenu — owner-run network setup (surface only)', () => {
  it('is exported as a function (network call NOT unit-tested)', () => {
    expect(typeof registerRichMenu).toBe('function');
  });
});
