/**
 * src/line/richMenu.ts — LINE rich-menu setup (summary text trigger).
 *
 * Single full-canvas button: tap → sends message "สรุปออกกำลัง" (CR-2 text
 * trigger via `isSummaryTextTrigger`). Image: assets/richmenu-summary-800x540.png
 * (800×540, LINE-supported compact size).
 *
 * `registerRichMenu()` — owner-run one-shot: create → upload image → set default.
 */

import { getProp, PROP_KEYS } from '../config/props';
import { RICH_MENU_IMAGE_BASE64 } from './richMenuImageData';

/** Message sent when the user taps the rich menu (CR-2 keyword). */
export const RICH_MENU_SUMMARY_TEXT = 'สรุปออกกำลัง';

/** Rich-menu canvas (matches assets/richmenu-summary-800x540.png). */
export const MENU_WIDTH = 800;
export const MENU_HEIGHT = 540;

const RICH_MENU_CREATE = 'https://api.line.me/v2/bot/richmenu';
const RICH_MENU_LIST = 'https://api.line.me/v2/bot/richmenu/list';

/**
 * Build the LINE rich-menu JSON: one full-canvas message action.
 */
export function buildRichMenu(): object {
  return {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: 'fit-webhook-summary',
    chatBarText: 'สรุป',
    areas: [
      {
        bounds: { x: 0, y: 0, width: MENU_WIDTH, height: MENU_HEIGHT },
        action: {
          type: 'message',
          label: RICH_MENU_SUMMARY_TEXT,
          text: RICH_MENU_SUMMARY_TEXT,
        },
      },
    ],
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function assertOk(response: GoogleAppsScript.URL_Fetch.HTTPResponse, step: string): void {
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      `registerRichMenu: ${step} failed HTTP ${code}: ${response.getContentText()}`
    );
  }
}

/**
 * Owner-run: create menu, upload bundled PNG, set default for all users.
 * Deletes other rich menus after the new default is set.
 */
export function registerRichMenu(): string {
  const accessToken = getProp(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  const headers = authHeaders(accessToken);

  const createRes = UrlFetchApp.fetch(RICH_MENU_CREATE, {
    method: 'post',
    contentType: 'application/json',
    headers,
    payload: JSON.stringify(buildRichMenu()),
    muteHttpExceptions: true,
  });
  assertOk(createRes, 'create');
  const parsed = JSON.parse(createRes.getContentText()) as {
    richMenuId?: string;
  };
  const richMenuId = parsed.richMenuId;
  if (!richMenuId) {
    throw new Error('registerRichMenu: create response missing richMenuId');
  }

  const imageBytes = Utilities.base64Decode(RICH_MENU_IMAGE_BASE64);
  const uploadRes = UrlFetchApp.fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    {
      method: 'post',
      headers: {
        ...headers,
        'Content-Type': 'image/png',
      },
      payload: imageBytes,
      muteHttpExceptions: true,
    }
  );
  assertOk(uploadRes, 'upload image');

  const defaultRes = UrlFetchApp.fetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    { method: 'post', headers, muteHttpExceptions: true }
  );
  assertOk(defaultRes, 'set default');

  const listRes = UrlFetchApp.fetch(RICH_MENU_LIST, {
    method: 'get',
    headers,
    muteHttpExceptions: true,
  });
  assertOk(listRes, 'list');
  const list = JSON.parse(listRes.getContentText()) as {
    richmenus?: Array<{ richMenuId: string }>;
  };
  for (const old of list.richmenus ?? []) {
    if (old.richMenuId === richMenuId) continue;
    UrlFetchApp.fetch(`https://api.line.me/v2/bot/richmenu/${old.richMenuId}`, {
      method: 'delete',
      headers,
      muteHttpExceptions: true,
    });
  }

  Logger.log(`registerRichMenu done — richMenuId=${richMenuId}`);
  return richMenuId;
}
