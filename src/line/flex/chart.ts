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
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */

/**
 * Build a native-Flex bar chart (a horizontal box of vertical bar boxes) from a
 * series of daily values. Index 0 is the oldest day, the last index is today.
 * Each bar's pixel height is proportional to its value normalised against the
 * series maximum; a value of 0 (or an all-zero series) renders at a minimum
 * baseline height so the day is still visible. Each bar carries a numeric value
 * label. NO external image URL is emitted (Flex boxes only, privacy-safe).
 *
 * @param dailyValues per-day values (oldest → today), e.g. summed calories.
 * @returns a Flex box object embeddable in a bubble body (no message envelope).
 */
/** Semantic bar colour (a calm green — matches the success theme). */
const BAR_COLOR = '#1e9e57';
/** Minimum bar height in px so a 0-value day is still visible (not collapsed). */
const MIN_BAR_PX = 6;
/** Maximum bar height in px (the series max maps to this). */
const MAX_BAR_PX = 60;

export function buildBarChart(dailyValues: number[]): object {
  const max = Math.max(0, ...dailyValues);

  // A vertical bar = a spacer box (grows to push the bar down) + the coloured
  // bar box (its `height` encodes the value) + a numeric value label beneath.
  // Height is proportional to value against the series max; 0 (or an all-zero
  // series) renders at MIN_BAR_PX so the day stays visible.
  const bars = dailyValues.map((value) => {
    const px =
      max <= 0
        ? MIN_BAR_PX
        : MIN_BAR_PX + Math.round((value / max) * (MAX_BAR_PX - MIN_BAR_PX));
    return {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        // The coloured bar — the ONLY node carrying an explicit `height`.
        {
          type: 'box',
          layout: 'vertical',
          height: `${px}px`,
          backgroundColor: BAR_COLOR,
          cornerRadius: '2px',
          contents: [],
        },
        // Numeric value label (WCAG: not colour alone).
        {
          type: 'text',
          text: String(value),
          size: 'xxs',
          align: 'center',
          color: '#666666',
        },
      ],
    };
  });

  // A horizontal row of the 7 bars. The container carries NO `height` so only
  // the bar boxes are counted as bars.
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'xs',
    contents: bars,
  };
}
