/**
 * src/line/flex/trigger.ts — how-to trigger card (rich-menu "วิธีส่งรูป", Phase 7).
 *
 * Replied when the user taps the rich-menu "วิธีส่งรูป" button (postback
 * `action=help`). A short, plain how-to ("วิธีส่งรูป...") explaining how to submit
 * a workout screenshot, plus a `cameraRoll` quick reply so the user can pick a
 * photo straight from the card. Neutral/info semantic style — nothing failed,
 * this is guidance.
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 *
 * Returns a LINE message object (`{ type: 'flex', altText, contents: bubble }`),
 * ready to drop into `reply(replyToken, [ ... ])`.
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */

/**
 * Build the how-to trigger card: instructions on submitting a workout screenshot
 * + a `cameraRoll` quick reply. Info/neutral style, emoji-free.
 *
 * @returns a LINE flex message object (how-to text + cameraRoll quick reply).
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */
export function buildTriggerCard(): object {
  // Info/neutral semantic style — nothing failed, this is guidance.
  const INFO_COLOR = '#3b6ea5';
  const MUTED_COLOR = '#666666';
  const TITLE_TEXT = 'วิธีส่งรูป';

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
          text: '3. รอระบบอ่านค่า แล้วกดยืนยันเพื่อบันทึก',
          size: 'sm',
          color: MUTED_COLOR,
          wrap: true,
        },
      ],
    },
  };

  // A message-level `cameraRoll` quick reply so the user can pick a photo
  // straight from the card (OVERVIEW §6 — quick reply, not an in-card button).
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
