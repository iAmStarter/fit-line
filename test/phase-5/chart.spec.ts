/**
 * test/phase-5/chart.spec.ts — phase-local unit: native-Flex bar-chart builder.
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `buildBarChart` stub (throws
 * NotImplemented). Asserts BEHAVIOR from PLAN Phase 5 acceptance (lines 123, 126)
 * + OVERVIEW §7 (chart = native Flex boxes, NO external service = privacy-safe):
 *   - buildBarChart([100,150,0,200,150,0,300]) → 7 vertical bar boxes.
 *   - the max value (300) bar has the greatest height; the 0 bar the min baseline.
 *   - each bar carries its numeric value label (WCAG: not colour alone).
 *   - the stringified JSON contains NO `http` / `https` / `url` substring — the
 *     chart is native Flex boxes only, it never leaves LINE's render (privacy).
 *   - NO emoji codepoint anywhere in the JSON (rule 9 — reuse noEmoji).
 *   - buildBarChart([0,0,0,0,0,0,0]) → all-baseline, no crash.
 *
 * Pure builder (number[] → Flex box object). No external boundary → the same
 * assertions are the real suite (mock/real n/a). We never read the impl body
 * (stub throws NotImplemented) — only the public signature.
 */

import { buildBarChart } from '../../src/line/flex/chart';
import { expectNoEmoji } from '../support/noEmoji';

const SERIES = [100, 150, 0, 200, 150, 0, 300];

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

/**
 * A "bar" is a box carrying an explicit `height`. We treat every box node with a
 * `height` field as a bar candidate; there must be exactly one per series entry.
 * Parse the numeric-ish height so we can compare relative sizes (px or %).
 */
function barHeights(chart: object): number[] {
  const boxes = collectTyped(chart).filter(
    (n) => n.type === 'box' && n.height !== undefined
  );
  return boxes.map((b) => {
    const raw = b.height;
    const num =
      typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : 0;
  });
}

describe('buildBarChart — 7 native bar boxes', () => {
  it('renders exactly 7 bar boxes (one per daily value)', () => {
    const chart = buildBarChart(SERIES);
    const heights = barHeights(chart);
    expect(heights).toHaveLength(7);
  });
});

describe('buildBarChart — height is proportional to value', () => {
  it('the max value (300) bar is the tallest; the 0-value bar the shortest', () => {
    const heights = barHeights(buildBarChart(SERIES));
    // index 6 = value 300 (max) → greatest height; index 2 = value 0 → min.
    const maxHeight = Math.max(...heights);
    const minHeight = Math.min(...heights);
    expect(heights[6]).toBe(maxHeight);
    expect(heights[2]).toBe(minHeight);
    // sanity: they actually differ (the bar sizing is not flat/degenerate).
    expect(maxHeight).toBeGreaterThan(minHeight);
  });

  it('the 0-value bar still has a positive baseline height (visible, not collapsed)', () => {
    const heights = barHeights(buildBarChart(SERIES));
    expect(heights[2]).toBeGreaterThan(0);
  });
});

describe('buildBarChart — value labels (WCAG: not colour alone)', () => {
  it('the JSON carries each series value as a label', () => {
    const json = JSON.stringify(buildBarChart(SERIES));
    for (const v of [100, 150, 200, 300]) {
      expect(json).toContain(String(v));
    }
    // the zero day is labelled too.
    expect(json).toContain('0');
  });
});

describe('buildBarChart — privacy: native boxes, NO external URL', () => {
  it('the stringified JSON contains NO http/https/url substring', () => {
    const json = JSON.stringify(buildBarChart(SERIES)).toLowerCase();
    expect(json).not.toContain('http');
    expect(json).not.toContain('https');
    expect(json).not.toContain('url');
  });
});

describe('buildBarChart — UI hard rule (rule 9)', () => {
  it('contains NO emoji codepoint anywhere in the JSON', () => {
    const json = JSON.stringify(buildBarChart(SERIES));
    expectNoEmoji(json);
  });
});

describe('buildBarChart — all-zero series (baseline, no crash)', () => {
  it('buildBarChart([0,0,0,0,0,0,0]) → 7 baseline bars, no throw', () => {
    const chart = buildBarChart([0, 0, 0, 0, 0, 0, 0]);
    const heights = barHeights(chart);
    expect(heights).toHaveLength(7);
    // every bar at the same (positive) baseline; none collapsed.
    for (const h of heights) {
      expect(h).toBeGreaterThan(0);
    }
    // still no external URL on the empty path.
    const json = JSON.stringify(chart).toLowerCase();
    expect(json).not.toContain('http');
    expect(json).not.toContain('url');
  });
});
