#!/usr/bin/env node
/**
 * Create + upload + set-default a LINE rich menu (owner/CI one-shot).
 *
 * Usage:
 *   LINE_CHANNEL_ACCESS_TOKEN=<token> node scripts/register-richmenu.mjs
 *
 * Reads assets/richmenu-summary-800x540.png and POSTs to LINE Messaging API.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMAGE_PATH = join(ROOT, 'assets', 'richmenu-summary-800x540.png');
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const MENU_WIDTH = 800;
const MENU_HEIGHT = 540;
const SUMMARY_TEXT = 'สรุปออกกำลัง';

const menuBody = {
  size: { width: MENU_WIDTH, height: MENU_HEIGHT },
  selected: true,
  name: 'fit-webhook-summary',
  chatBarText: 'สรุป',
  areas: [
    {
      bounds: { x: 0, y: 0, width: MENU_WIDTH, height: MENU_HEIGHT },
      action: {
        type: 'message',
        label: SUMMARY_TEXT,
        text: SUMMARY_TEXT,
      },
    },
  ],
};

async function lineFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `LINE API ${res.status} ${url}: ${JSON.stringify(json)}`
    );
  }
  return json;
}

async function main() {
  if (!TOKEN) {
    console.error(
      'Set LINE_CHANNEL_ACCESS_TOKEN (from GAS Script Properties / LINE console).'
    );
    process.exit(1);
  }

  const imageBytes = readFileSync(IMAGE_PATH);
  console.log(`Image: ${IMAGE_PATH} (${imageBytes.length} bytes)`);

  // List existing menus (unlink default first if needed)
  const list = await lineFetch('https://api.line.me/v2/bot/richmenu/list');
  console.log(`Existing rich menus: ${list.richmenus?.length ?? 0}`);

  const created = await lineFetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(menuBody),
  });
  const richMenuId = created.richMenuId;
  console.log(`Created richMenuId=${richMenuId}`);

  const uploadRes = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'image/png',
      },
      body: imageBytes,
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload failed ${uploadRes.status}: ${err}`);
  }
  console.log('Uploaded image');

  await lineFetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    { method: 'POST' }
  );
  console.log('Set as default for all users');

  // Remove old menus to avoid clutter (keep the new one)
  for (const old of list.richmenus ?? []) {
    if (old.richMenuId === richMenuId) continue;
    try {
      await lineFetch(`https://api.line.me/v2/bot/richmenu/${old.richMenuId}`, {
        method: 'DELETE',
      });
      console.log(`Deleted old menu ${old.richMenuId} (${old.name})`);
    } catch (e) {
      console.warn(`Could not delete ${old.richMenuId}:`, e.message);
    }
  }

  console.log('Done. Tap the rich menu in LINE — should send:', SUMMARY_TEXT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
