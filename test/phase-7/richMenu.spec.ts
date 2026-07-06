/**
 * test/phase-7/richMenu.spec.ts — rich-menu definition JSON (summary message action).
 */

import {
  buildRichMenu,
  registerRichMenu,
  RICH_MENU_SUMMARY_TEXT,
  MENU_WIDTH,
  MENU_HEIGHT,
} from '../../src/line/richMenu';
import { expectNoEmoji } from '../support/noEmoji';

/* eslint-disable @typescript-eslint/no-explicit-any */

function areasOf(menu: any): any[] {
  expect(Array.isArray(menu.areas)).toBe(true);
  return menu.areas as any[];
}

describe('buildRichMenu — single summary message action', () => {
  it('uses 800×540 canvas (matches image asset)', () => {
    const menu = buildRichMenu() as any;
    expect(menu.size).toEqual({ width: MENU_WIDTH, height: MENU_HEIGHT });
  });

  it('defines one full-canvas message action', () => {
    const menu = buildRichMenu() as any;
    const areas = areasOf(menu);
    expect(areas).toHaveLength(1);
    expect(areas[0].action.type).toBe('message');
    expect(areas[0].action.text).toBe(RICH_MENU_SUMMARY_TEXT);
    expect(areas[0].bounds).toEqual({
      x: 0,
      y: 0,
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    });
  });

  it('sends "สรุปออกกำลัง" when tapped', () => {
    const json = JSON.stringify(buildRichMenu());
    expect(json).toContain('สรุปออกกำลัง');
    expect(json).toContain('"type":"message"');
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
