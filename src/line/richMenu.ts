/**
 * src/line/richMenu.ts — LINE rich-menu setup + trigger definition (Phase 7).
 *
 * The rich menu is the always-on tab strip below the LINE chat input. This bot
 * ships a 2-button menu that lowers the barrier to use (OVERVIEW risk — UX
 * discoverability):
 *   - "วิธีส่งรูป"  → postback `action=help`    → replies the how-to trigger card.
 *   - "สรุปของฉัน"  → postback `action=summary` → replies the on-demand summary.
 *
 * Two seams:
 *   - `buildRichMenu()`   — the pure rich-menu JSON (areas + postback actions).
 *   - `registerRichMenu() ` — the OWNER-run, one-time network setup (create the
 *     menu, upload its image, set it as the default). This hits the LINE
 *     rich-menu API with the channel access token from Script Properties; it is
 *     STAGED/MANUAL (owner executes it once from the GAS editor), not part of the
 *     request path and not unit-tested for the network call.
 *
 * UI hard rule (OVERVIEW §4, rule 9): NO emoji codepoints anywhere in the JSON.
 * Security: the channel access token comes ONLY from Script Properties (never
 * hard-coded, never logged).
 *
 * SCAFFOLD (Phase 7): signatures only — bodies throw NotImplemented.
 */

import { getProp, PROP_KEYS } from '../config/props';

/** Postback `action` value for the "วิธีส่งรูป" button (routed by handlePostback). */
const HELP_ACTION_DATA = 'action=help';
/** Postback `action` value for the "สรุปของฉัน" button (routed by handlePostback). */
const SUMMARY_ACTION_DATA = 'action=summary';
/** Full-width rich-menu canvas (LINE "compact" template: 2500 x 843). */
const MENU_WIDTH = 2500;
const MENU_HEIGHT = 843;
/** LINE rich-menu create endpoint. */
const RICH_MENU_CREATE_ENDPOINT = 'https://api.line.me/v2/bot/richmenu';

/**
 * Build the LINE rich-menu definition JSON: a full-width bar split into two
 * tappable areas, each firing a postback the webhook routes.
 *   - left  area → `action=help`    ("วิธีส่งรูป").
 *   - right area → `action=summary` ("สรุปของฉัน").
 * No emoji. The returned object is the rich-menu request body (size / areas /
 * selected / name / chatBarText), ready to POST to the LINE rich-menu API.
 *
 * @returns the rich-menu definition object (postback actions, emoji-free).
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */
export function buildRichMenu(): object {
  // The canvas splits into two equal side-by-side tappable areas. Each fires a
  // postback the webhook routes (handlePostback → HELP_ACTION / SUMMARY_ACTION).
  const halfWidth = Math.floor(MENU_WIDTH / 2);
  return {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: false,
    name: 'fit-webhook-menu',
    chatBarText: 'เมนู',
    areas: [
      {
        // Left area → "วิธีส่งรูป".
        bounds: { x: 0, y: 0, width: halfWidth, height: MENU_HEIGHT },
        action: {
          type: 'postback',
          label: 'วิธีส่งรูป',
          data: HELP_ACTION_DATA,
          displayText: 'วิธีส่งรูป',
        },
      },
      {
        // Right area → "สรุปของฉัน".
        bounds: {
          x: halfWidth,
          y: 0,
          width: MENU_WIDTH - halfWidth,
          height: MENU_HEIGHT,
        },
        action: {
          type: 'postback',
          label: 'สรุปของฉัน',
          data: SUMMARY_ACTION_DATA,
          displayText: 'สรุปของฉัน',
        },
      },
    ],
  };
}

/**
 * OWNER-run one-time rich-menu setup: create the rich menu from
 * `buildRichMenu()`, upload its image, and set it as the account's default menu.
 *
 * Uses `UrlFetchApp` with the channel access token read from Script Properties
 * (`LINE_CHANNEL_ACCESS_TOKEN`); the token is never hard-coded or logged. This
 * is a STAGED/MANUAL step executed once from the GAS editor — it is NOT on the
 * request path and is NOT unit-tested for the network call.
 *
 * @returns the created `richMenuId` (from the LINE create-rich-menu response).
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented. The GREEN
 * step fills the create → upload-image → set-default sequence.
 */
export function registerRichMenu(): string {
  // OWNER-run one-time setup. The channel access token comes ONLY from Script
  // Properties (never hard-coded, never logged). After this creates the menu,
  // the owner uploads its image + sets it default from the LINE console (or a
  // follow-up call) — this seam creates the menu and returns its id.
  const accessToken = getProp(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  const response = UrlFetchApp.fetch(RICH_MENU_CREATE_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify(buildRichMenu()),
    muteHttpExceptions: true,
  });
  const parsed = JSON.parse(response.getContentText()) as {
    richMenuId?: string;
  };
  if (!parsed.richMenuId) {
    throw new Error(
      `registerRichMenu: LINE create failed (HTTP ${response.getResponseCode()})`
    );
  }
  return parsed.richMenuId;
}
