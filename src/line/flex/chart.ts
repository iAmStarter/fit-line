/**
 * src/line/flex/chart.ts — native-Flex bar-chart builder (Phase 5 summary).
 *
 * Renders a small 7-bar chart of a user's recent daily calorie totals using
 * ONLY Flex boxes — a horizontal box holding 7 vertical bar boxes, each bar's
 * height proportional to its value, a value label beneath each bar. There is NO
 * external image URL anywhere in the returned JSON (privacy-safe, OVERVIEW §7 /
 * risk #9): the chart never leaves the LINE render. Value 0 renders at a minimum
 * baseline height so a zero day is still visible, not collapsed.
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON;
 * bars carry a semantic colour + a numeric label (not colour alone, WCAG).
 *
 * The returned value is a Flex BOX object (not a full message envelope) so the
 * success card can drop it into its bubble body alongside the summary section.
 */

import { CHART_BAR_COLOR, MUTED_COLOR } from './tokens';

/** Minimum bar height in px so a 0-value day is still visible (not collapsed). */
const MIN_BAR_PX = 6;
/** Maximum bar height in px (the series max maps to this). */
const MAX_BAR_PX = 60;

/** Thai day-of-week abbreviations (JS getUTCDay: Sun=0 … Sat=6). */
const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

/** Add `delta` days to a `yyyy-MM-dd` date, returning `yyyy-MM-dd` (UTC-safe). */
function addDays(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map((s) => parseInt(s, 10));
  const t = Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000;
  const dt = new Date(t);
  const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
  const MM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}`;
}

/** Day-of-week label for a `yyyy-MM-dd` calendar date. */
function thaiDowLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map((s) => parseInt(s, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return THAI_DOW[dow];
}

/**
 * Build a native-Flex bar chart (a horizontal box of vertical bar boxes) from a
 * series of daily values. Index 0 is the oldest day, the last index is today.
 * Each bar's pixel height is proportional to its value normalised against the
 * series maximum; a value of 0 (or an all-zero series) renders at a minimum
 * baseline height so the day is still visible. Each bar carries a numeric value
 * label. When `todayISO` is provided, a Thai day-of-week label is shown under
 * each value (oldest → today). NO external image URL is emitted.
 *
 * @param dailyValues per-day values (oldest → today), e.g. summed calories.
 * @param todayISO    optional anchor date (`yyyy-MM-dd`) for day-of-week labels.
 * @returns a Flex box object embeddable in a bubble body (no message envelope).
 */
export function buildBarChart(
  dailyValues: number[],
  todayISO?: string
): object {
  const max = Math.max(0, ...dailyValues);
  const days = todayISO
    ? dailyValues.map((_, i) =>
        addDays(todayISO, i - (dailyValues.length - 1))
      )
    : [];

  const bars = dailyValues.map((value, i) => {
    const px =
      max <= 0
        ? MIN_BAR_PX
        : MIN_BAR_PX + Math.round((value / max) * (MAX_BAR_PX - MIN_BAR_PX));
    const columnContents: object[] = [
      // Spacer grows to fill — pushes the coloured bar to a shared baseline so
      // taller values extend UP, not down from the top (LINE vertical layout
      // stacks top→bottom; without this, bars "hang" from the ceiling).
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        contents: [],
      },
      {
        type: 'box',
        layout: 'vertical',
        height: `${px}px`,
        backgroundColor: CHART_BAR_COLOR,
        cornerRadius: '2px',
        contents: [],
      },
      {
        type: 'text',
        text: String(value),
        size: 'xxs',
        align: 'center',
        color: MUTED_COLOR,
      },
    ];
    if (days[i] !== undefined) {
      columnContents.push({
        type: 'text',
        text: thaiDowLabel(days[i]),
        size: 'xxs',
        align: 'center',
        color: MUTED_COLOR,
      });
    }
    return {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: columnContents,
    };
  });

  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'xs',
    contents: bars,
  };
}
