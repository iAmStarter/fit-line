/**
 * src/line/flex/trigger.ts — how-to trigger card (rich-menu "วิธีส่งรูป", Phase 7).
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 */

import { INFO_COLOR, MUTED_COLOR } from './tokens';

const TITLE_TEXT = 'วิธีส่งรูป';

/**
 * Build the how-to trigger card: instructions on submitting a workout screenshot
 * + a `cameraRoll` quick reply. Info/neutral style, emoji-free.
 */
export function buildTriggerCard(): object {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'text',
          text: TITLE_TEXT,
          size: 'md',
          weight: 'bold',
          color: INFO_COLOR,
        },
        {
          type: 'text',
          text: '1. เปิดแอปออกกำลังกาย แล้วแคปหน้าจอสรุปผล',
          size: 'sm',
          color: MUTED_COLOR,
          wrap: true,
        },
        {
          type: 'text',
          text: '2. ส่งรูปที่แคปเข้ามาในแชตนี้',
          size: 'sm',
          color: MUTED_COLOR,
          wrap: true,
        },
        {
          type: 'text',
          text: '3. รอระบบอ่านค่า — ผ่านเงื่อนไขแล้วบันทึกอัตโนมัติ',
          size: 'sm',
          color: MUTED_COLOR,
          wrap: true,
        },
      ],
    },
  };

  return {
    type: 'flex',
    altText: TITLE_TEXT,
    contents: bubble,
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'cameraRoll',
            label: 'ส่งรูป',
          },
        },
      ],
    },
  };
}
