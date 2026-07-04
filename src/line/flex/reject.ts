/**
 * src/line/flex/reject.ts — reject-card Flex builder (fail path).
 *
 * Built when a rule fails or OCR is unusable. Shows the OCR values the system
 * read + a one-line coach reason with an error semantic style (`#d64545`) and a
 * status chip + CSS-glyph icon + label (WCAG: not colour alone).
 *
 * HARD constraints (OVERVIEW §6, rule 9):
 *   - NO button inside the card (no fake affordance).
 *   - "ส่งรูปใหม่" is a message-level LINE quick reply `cameraRoll`, attached to
 *     the returned message object, NOT a Flex button.
 *   - NO emoji codepoints anywhere in the JSON.
 *
 * Returns a LINE message object
 * (`{ type: 'flex', altText, contents: bubble, quickReply: {...cameraRoll} }`).
 *
 * SCAFFOLD (Phase 1): signature only — body throws NotImplemented.
 */

import type { OcrMetrics } from '../../types/ocrMetrics';

/** Error/reject semantic color (OVERVIEW §4). */
const ERROR_COLOR = '#d64545';
/** Muted color for secondary metadata. */
const MUTED_COLOR = '#666666';

/** Render a nullable number for display, blank OCR reading → "-". */
function displayNumber(value: number | null): string {
  return value !== null ? String(value) : '-';
}

/**
 * Build the reject-card LINE message (with cameraRoll quick reply, no button).
 *
 * The card body carries NO interactive affordance (no button, no postback/
 * message action) — "ส่งรูปใหม่" is a message-level `cameraRoll` quick reply
 * attached to the envelope, not a fake in-card button (OVERVIEW §6).
 *
 * Phase 5 dispute affordance: when `opts.disputeMessageId` is set (the user has
 * repeatedly failed the same activity, `disputeGuard` threshold reached), a
 * SECOND quick-reply item is added ALONGSIDE `cameraRoll` — a postback labelled
 * "แจ้งแอดมิน" with data `action=dispute&mid=<id>`. It is a message-level quick
 * reply, NOT an in-card button (the no-button rule still holds). When absent,
 * the card renders exactly as in Phase 1 (cameraRoll only) — the optional param
 * keeps every existing caller/test back-compatible.
 *
 * @param m      OCR reading to display (shows what the system read).
 * @param reason human-facing coach line explaining the rejection.
 * @param opts   optional flags; `disputeMessageId` adds the dispute quick reply.
 * @returns a LINE flex message object carrying a `cameraRoll` quick reply (plus a
 *   dispute quick reply when `opts.disputeMessageId` is set).
 *
 * SCAFFOLD (Phase 5): the dispute-affordance branch throws NotImplemented; the
 * back-compat (no `opts.disputeMessageId`) branch keeps the Phase 1 behavior.
 */
export function buildRejectCard(
  m: OcrMetrics,
  reason: string,
  opts?: { disputeMessageId?: string }
): object {
  const activityType = m.activityType ?? '-';
  const active = displayNumber(m.activeCaloriesKcal);
  const total = displayNumber(m.totalCaloriesKcal);

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Status chip: label + CSS-glyph icon + error color (WCAG: not colour
        // alone). Glyph is a plain ASCII mark, never an emoji.
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          paddingAll: '8px',
          cornerRadius: '4px',
          backgroundColor: ERROR_COLOR,
          contents: [
            {
              type: 'text',
              text: '[x]',
              color: '#ffffff',
              weight: 'bold',
              size: 'sm',
              flex: 0,
            },
            {
              type: 'text',
              text: 'ไม่ผ่าน',
              color: '#ffffff',
              weight: 'bold',
              size: 'sm',
            },
          ],
        },
        {
          type: 'text',
          text: `กิจกรรม: ${activityType}`,
          size: 'sm',
          color: MUTED_COLOR,
          wrap: true,
        },
        {
          type: 'text',
          text: `แคลอรี่ (active): ${active} kcal`,
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `แคลอรี่ (total): ${total} kcal`,
          size: 'sm',
          color: MUTED_COLOR,
        },
        {
          type: 'text',
          text: reason,
          size: 'sm',
          color: ERROR_COLOR,
          wrap: true,
        },
      ],
    },
  };

  // Message-level quick-reply items (the envelope, NOT the card body — the
  // no-button rule holds). Always: cameraRoll ("ส่งรูปใหม่"). Phase 5: when the
  // dispute threshold is reached, ALSO a "แจ้งแอดมิน" postback keyed to the
  // failing messageId (`action=dispute&mid=<id>`).
  const items: object[] = [
    {
      type: 'action',
      action: {
        type: 'cameraRoll',
        label: 'ส่งรูปใหม่',
      },
    },
  ];
  if (opts?.disputeMessageId !== undefined) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: 'แจ้งแอดมิน',
        data: `action=dispute&mid=${opts.disputeMessageId}`,
        displayText: 'แจ้งแอดมิน',
      },
    });
  }

  return {
    type: 'flex',
    altText: `ไม่ผ่าน: ${reason}`,
    contents: bubble,
    quickReply: { items },
  };
}

/**
 * Build a pre-OCR block-notice card (Phase 3 anti-spam guards).
 *
 * Unlike `buildRejectCard`, this card shows NO OCR values — it is emitted at the
 * cost gate BEFORE OCR runs (duplicate-image / cooldown / lock-timeout), where no
 * metrics exist. Error semantic style (`#d64545`), a status chip (label +
 * CSS-glyph icon + colour, WCAG: not colour alone), a one-line coach reason, and
 * NO button inside the card (no fake affordance). NO emoji anywhere.
 *
 * The `cameraRoll` quick reply is opt-in via `opts.cameraRoll`: enabled for
 * user-retryable blocks (duplicate image, cooldown), disabled for the
 * system-busy lock-timeout where an immediate resend does not help.
 *
 * @param reason human-facing coach line explaining the block.
 * @param opts   optional flags; `cameraRoll` attaches a `cameraRoll` quick reply.
 * @returns a LINE flex message object (with an optional `cameraRoll` quick reply).
 */
export function buildBlockNoticeCard(
  reason: string,
  opts?: { cameraRoll?: boolean }
): object {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Status chip: label + CSS-glyph icon + error color (WCAG: not colour
        // alone). Glyph is a plain ASCII mark, never an emoji.
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          paddingAll: '8px',
          cornerRadius: '4px',
          backgroundColor: ERROR_COLOR,
          contents: [
            {
              type: 'text',
              text: '[!]',
              color: '#ffffff',
              weight: 'bold',
              size: 'sm',
              flex: 0,
            },
            {
              type: 'text',
              text: 'ไม่ผ่าน',
              color: '#ffffff',
              weight: 'bold',
              size: 'sm',
            },
          ],
        },
        {
          type: 'text',
          text: reason,
          size: 'md',
          color: ERROR_COLOR,
          weight: 'bold',
          wrap: true,
        },
      ],
    },
  };

  const message: Record<string, unknown> = {
    type: 'flex',
    altText: reason,
    contents: bubble,
  };

  if (opts?.cameraRoll) {
    message.quickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'cameraRoll',
            label: 'ส่งรูปใหม่',
          },
        },
      ],
    };
  }

  return message;
}
