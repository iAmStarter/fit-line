/**
 * src/line/flex/summary.ts — on-demand summary card (rich-menu "สรุปของฉัน", Phase 7).
 *
 * Replied when the user taps the rich-menu "สรุปของฉัน" button (postback
 * `action=summary`). Shows the user's own recorded tally ("สัปดาห์นี้ N ·
 * เดือนนี้ N · รวม N") plus a native-Flex bar chart of their last-7-day calories
 * (`buildBarChart`). Unlike the success card (which fires after a write), this
 * card is a pull — the user asks for their standing at any time.
 *
 * Info/neutral semantic style (this is a report, not a success/failure event).
 * It shares the bar-chart helper with `success.ts` but is its own builder so the
 * two cards can diverge (a summary has no recorded-calorie headline). NO external
 * image URL — the chart is native Flex boxes (privacy-safe, OVERVIEW §7).
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 *
 * Returns a LINE message object (`{ type: 'flex', altText, contents: bubble }`),
 * ready to drop into `reply(replyToken, [ ... ])`.
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */

import type { SubmissionCounts } from '../../types/ocrMetrics';
import { buildBarChart } from './chart';

/** Info/neutral semantic color (this is a report, not a success/failure event). */
const INFO_COLOR = '#3b6ea5';
/** Muted color for secondary metadata. */
const MUTED_COLOR = '#666666';
/** Neutral report headline. */
const SUMMARY_TITLE = 'สรุปของฉัน';

/**
 * Build the on-demand summary card: a week/month/total line + a native-Flex bar
 * chart of the last-7-day per-day calories. Info/neutral style, emoji-free, no
 * external URL.
 *
 * @param counts      the user's recorded tallies (week / month / total).
 * @param dailyValues last-7-day per-day summed calories (oldest → today).
 * @returns a LINE flex message object (summary line + native bar chart).
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */
export function buildSummaryCard(
  counts: SubmissionCounts,
  dailyValues: number[]
): object {
  // Summary line uses the SAME separator convention as the success card
  // (src/line/flex/success.ts): "สัปดาห์นี้ N · เดือนนี้ N · รวม N".
  const summaryText = `สัปดาห์นี้ ${counts.week} · เดือนนี้ ${counts.month} · รวม ${counts.total}`;

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
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
        // Native-Flex bar chart of the last-7-day calories (no external image
        // URL — privacy-safe, OVERVIEW §7). Shared with the success card.
        buildBarChart(dailyValues),
      ],
    },
  };

  return {
    type: 'flex',
    altText: summaryText,
    contents: bubble,
  };
}
