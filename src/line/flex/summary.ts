/**
 * src/line/flex/summary.ts — on-demand summary card (rich-menu "สรุปของฉัน", Phase 7).
 *
 * Replied when the user taps the rich-menu "สรุปของฉัน" button (postback
 * `action=summary`) or types a summary keyword (CR-2). Shows the user's own
 * recorded tally plus a native-Flex bar chart of their last-7-day calories.
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 */

import type { SubmissionCounts } from '../../types/ocrMetrics';
import { buildBarChart } from './chart';
import {
  formatSummaryLine,
  summaryEmptyHintNode,
} from './summaryLine';
import { INFO_COLOR, MUTED_COLOR } from './tokens';

/** Neutral report headline. */
const SUMMARY_TITLE = 'สรุปของฉัน';

/**
 * Build the on-demand summary card: a week/month/total line + a native-Flex bar
 * chart of the last-7-day per-day calories. Info/neutral style, emoji-free.
 *
 * @param counts      the user's recorded tallies (week / month / total days).
 * @param dailyValues last-7-day per-day summed calories (oldest → today).
 * @param todayISO    optional `yyyy-MM-dd` anchor for chart day-of-week labels.
 * @returns a LINE flex message object (summary line + native bar chart).
 */
export function buildSummaryCard(
  counts: SubmissionCounts,
  dailyValues: number[],
  todayISO?: string
): object {
  const summaryText = formatSummaryLine(counts);
  const bodyContents: object[] = [
    {
      type: 'text',
      text: SUMMARY_TITLE,
      size: 'md',
      weight: 'bold',
      color: INFO_COLOR,
    },
    {
      type: 'text',
      text: summaryText,
      size: 'sm',
      color: MUTED_COLOR,
      wrap: true,
    },
  ];
  if (counts.total === 0) {
    bodyContents.push(summaryEmptyHintNode());
  }
  bodyContents.push(buildBarChart(dailyValues, todayISO));

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: bodyContents,
    },
  };

  return {
    type: 'flex',
    altText: summaryText,
    contents: bubble,
  };
}
