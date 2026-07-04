/**
 * src/line/flex/confirm.ts — confirm-card Flex builder (pass path).
 *
 * Built when the calorie rule passes. Shows the OCR reading (activity type,
 * activity date, calories) with an info/confirm semantic style (`#2f6fed`) and
 * a status chip + CSS-glyph icon + label (WCAG: not colour alone). Includes a
 * postback "ยืนยัน" button whose `data` carries the cache id
 * (`action=confirm&id=<cacheId>`, compact, ≤300 chars).
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 *
 * Returns a LINE message object (`{ type: 'flex', altText, contents: bubble }`),
 * ready to drop into `reply(replyToken, [ ... ])`.
 *
 * SCAFFOLD (Phase 1): signature only — body throws NotImplemented.
 */

import type { OcrMetrics } from '../../types/ocrMetrics';

/** Info/confirm semantic color (OVERVIEW §4). */
const INFO_COLOR = '#2f6fed';
/** Light info tint for the status chip background. */
const INFO_TINT = '#e8f0ff';
/** Muted color for secondary metadata (date). */
const MUTED_COLOR = '#666666';

/** Calorie value chosen for display: prefer active, else total, else "-". */
function displayCalorie(m: OcrMetrics): string {
  const value =
    m.activeCaloriesKcal !== null ? m.activeCaloriesKcal : m.totalCaloriesKcal;
  return value !== null ? String(value) : '-';
}

/**
 * Build the confirm-card LINE message.
 * @param m       OCR reading to display (activity/date/calories).
 * @param cacheId short id of the stashed OCR result, embedded in postback data.
 * @returns a LINE flex message object with a confirm postback button.
 */
export function buildConfirmCard(m: OcrMetrics, cacheId: string): object {
  const activityType = m.activityType ?? '-';
  const activityDate = m.activityDateISO ?? '-';
  const calorie = displayCalorie(m);

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Status chip: label + CSS-glyph icon + semantic color (WCAG: not
        // colour alone). Glyph is a plain ASCII bullet, never an emoji.
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          paddingAll: '8px',
          cornerRadius: '4px',
          backgroundColor: INFO_TINT,
          contents: [
            {
              type: 'text',
              text: '[+]',
              color: INFO_COLOR,
              weight: 'bold',
              size: 'sm',
              flex: 0,
            },
            {
              type: 'text',
              text: 'ตรวจแล้ว',
              color: INFO_COLOR,
              weight: 'bold',
              size: 'sm',
            },
          ],
        },
        {
          type: 'text',
          text: `กิจกรรม: ${activityType}`,
          weight: 'bold',
          size: 'md',
          wrap: true,
        },
        {
          type: 'text',
          text: `วันที่: ${activityDate}`,
          size: 'sm',
          color: MUTED_COLOR,
        },
        {
          type: 'text',
          text: `แคลอรี่: ${calorie} kcal`,
          size: 'md',
          weight: 'bold',
          color: INFO_COLOR,
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: INFO_COLOR,
          action: {
            type: 'postback',
            label: 'ยืนยัน',
            data: `action=confirm&id=${cacheId}`,
          },
        },
      ],
    },
  };

  return {
    type: 'flex',
    altText: `ตรวจแล้ว: ${activityType} ${calorie} kcal`,
    contents: bubble,
  };
}
