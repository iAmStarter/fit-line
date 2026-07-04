/**
 * src/line/flex/success.ts — success-card Flex builder (write-path confirm).
 *
 * Built after a confirmed submission is written to the `submissions` sheet
 * (Phase 2 postback path). Shows "บันทึกแล้ว" + the recorded calorie value with a
 * success semantic style (`#1e9e57`) and a status chip + CSS-glyph icon + label
 * (WCAG: not colour alone). No quick reply, no button (terminal card).
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 *
 * Returns a LINE message object (`{ type: 'flex', altText, contents: bubble }`),
 * ready to drop into `reply(replyToken, [ ... ])`.
 *
 * SCAFFOLD (Phase 2): signature only — body throws NotImplemented.
 */

import type { StashedContext, SubmissionCounts } from '../../types/ocrMetrics';
import { buildBarChart } from './chart';

/** Success semantic color (OVERVIEW §4). */
const SUCCESS_COLOR = '#1e9e57';
/** Light green tint for the status-chip background. */
const SUCCESS_TINT = '#e5f7f0';
/** Recorded-confirmation headline text. */
const RECORDED_TEXT = 'บันทึกแล้ว';

/** Calorie value chosen for display: prefer active, else total, else "-". */
function displayCalorie(ctx: StashedContext): string {
  const m = ctx.metrics;
  const value =
    m.activeCaloriesKcal !== null ? m.activeCaloriesKcal : m.totalCaloriesKcal;
  return value !== null ? String(value) : '-';
}

/**
 * The "บันทึกแล้ว" status chip: label + CSS-glyph icon + success color (WCAG:
 * not colour alone). Glyph is a plain ASCII mark, never an emoji.
 */
function statusChip(): object {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    paddingAll: '8px',
    cornerRadius: '4px',
    backgroundColor: SUCCESS_TINT,
    contents: [
      {
        type: 'text',
        text: '[v]',
        color: SUCCESS_COLOR,
        weight: 'bold',
        size: 'sm',
        flex: 0,
      },
      {
        type: 'text',
        text: RECORDED_TEXT,
        color: SUCCESS_COLOR,
        weight: 'bold',
        size: 'sm',
      },
    ],
  };
}

/**
 * Build the success-card LINE message shown after a submission is recorded.
 *
 * When `counts` and `dailyValues` are BOTH provided (Phase 5 write path), the
 * card additionally appends a summary section ("สัปดาห์นี้ N · เดือนนี้ N ·
 * รวม N") and a native-Flex bar chart (`buildBarChart(dailyValues)`) below the
 * recorded-calorie line. When they are absent, the card renders exactly as in
 * Phase 2 (no summary, no chart) — the optional params keep every existing
 * caller/test back-compatible. Green success style (`#1e9e57`), no emoji.
 *
 * @param ctx         the stashed submission context just written to the sheet.
 * @param counts      optional per-user recorded tallies (week/month/total).
 * @param dailyValues optional last-7-day per-day summed calories (oldest→today).
 * @returns a LINE flex message object (green success style, no emoji).
 *
 * SCAFFOLD (Phase 5): the summary+chart branch throws NotImplemented; the
 * back-compat (no counts/dailyValues) branch keeps the Phase 2 behavior.
 */
export function buildSuccessCard(
  ctx: StashedContext,
  counts?: SubmissionCounts,
  dailyValues?: number[]
): object {
  const calorie = displayCalorie(ctx);

  if (counts !== undefined && dailyValues !== undefined) {
    // Phase 5: append a summary section (week / month / total) + a native-Flex
    // bar chart below the recorded-calorie line. Green success style, no emoji,
    // no external URL (the chart is native Flex boxes).
    const summaryText = `สัปดาห์นี้ ${counts.week} · เดือนนี้ ${counts.month} · รวม ${counts.total}`;
    const bubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          statusChip(),
          {
            type: 'text',
            text: `แคลอรี่: ${calorie} kcal`,
            size: 'md',
            weight: 'bold',
            color: SUCCESS_COLOR,
          },
          {
            type: 'text',
            text: summaryText,
            size: 'sm',
            color: '#666666',
            wrap: true,
          },
          buildBarChart(dailyValues),
        ],
      },
    };

    return {
      type: 'flex',
      altText: `${RECORDED_TEXT}: ${calorie} kcal`,
      contents: bubble,
    };
  }

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        statusChip(),
        {
          type: 'text',
          text: `แคลอรี่: ${calorie} kcal`,
          size: 'md',
          weight: 'bold',
          color: SUCCESS_COLOR,
        },
      ],
    },
  };

  return {
    type: 'flex',
    altText: `${RECORDED_TEXT}: ${calorie} kcal`,
    contents: bubble,
  };
}
