/**
 * src/main.ts — GAS Web App entry point.
 *
 * `doPost` is the single inbound surface. It MUST be reachable as a top-level
 * global in the deployed bundle (Rollup outro hoists it — see rollup.config.mjs).
 *
 * Phase 0 contract (PLAN acceptance):
 *   - verify LINE signature; invalid/absent -> still return HTTP 200 but do NOT
 *     process further (LINE must always receive 200; log + ignore).
 *   - valid signature -> return HTTP 200 (routing arrives Phase 1+).
 *   - never throw out of doPost; always return a ContentService 200.
 *
 * Phase 0: skeleton stub — body throws NotImplemented. Routing/OCR/Sheet logic
 * is added in later phases; the signature verification wiring is filled next.
 */

import { verifySignature } from './line/signature';
import { getProp, PROP_KEYS } from './config/props';
import { getMessageContent, reply } from './line/lineClient';
import { getRecognizer } from './ocr/ocrClient';
import { evaluateSubmissionRules } from './rules/rulePipeline';
import { buildRejectCard, buildBlockNoticeCard } from './line/flex/reject';
import { buildSuccessCard } from './line/flex/success';
import { buildTriggerCard } from './line/flex/trigger';
import { buildSummaryCard } from './line/flex/summary';
import {
  appendSubmission,
  ensureEmployee,
  submissionExistsByMessageId,
  countSubmissions,
  recentDailyValues,
  logDispute,
  resolveEmployeeName,
} from './sheet/sheetRepo';
import { rateLimitAllows } from './rules/rateLimit';
import { sha256Hex, isDuplicateImage } from './rules/imageDedup';
import { bumpFailCount, shouldOfferDispute } from './rules/disputeGuard';
import { withScriptLock } from './state/lock';

/** User-facing coach line when OCR fails/times out (PLAN Phase 1 line 53). */
const OCR_ERROR_TEXT = 'อ่านรูปไม่สำเร็จ ลองใหม่';
/** User-facing line when the Sheet write fails (PLAN Phase 2). */
const SHEET_ERROR_TEXT = 'บันทึกไม่สำเร็จ ลองใหม่';
/** User-facing line when the per-user rate-limit is exceeded (PLAN Phase 3). */
const COOLDOWN_TEXT = 'ส่งบ่อยเกินไป รอสักครู่';
/** User-facing line when the image was already submitted system-wide (Phase 3). */
const DUPLICATE_IMAGE_TEXT = 'รูปนี้เคยส่งแล้ว';
/** User-facing line when the script lock times out on the write path (Phase 3). */
const LOCK_TIMEOUT_TEXT = 'ระบบไม่ว่าง ลองใหม่';
/** Error/reject semantic color reused for the OCR-error card. */
const ERROR_COLOR = '#d64545';
/** User-facing ack shown after a dispute is logged (Phase 5). */
const DISPUTE_ACK_TEXT = 'ส่งเรื่องให้แอดมินตรวจสอบแล้ว';
/** Postback `action` value for the dispute quick-reply (Phase 5). */
const DISPUTE_ACTION = 'dispute';
/** Postback `action` value for the rich-menu "วิธีส่งรูป" button (Phase 7). */
const HELP_ACTION = 'help';
/** Postback `action` value for the rich-menu "สรุปของฉัน" button (Phase 7). */
const SUMMARY_ACTION = 'summary';

/**
 * Minimal shape of a single LINE webhook event this bot consumes. Only the
 * fields the router + Phase 1 image handler read are typed; the real LINE
 * payload has more. `message` is present on `message` events, `postback` on
 * `postback` events. (Phase 2 fills the postback branch.)
 */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { id: string; type: string };
  postback?: { data: string };
}

/** LINE webhook request body: an array of events under `events`. */
export interface LineWebhookBody {
  events?: LineWebhookEvent[];
}

/** LINE's signature header, case-insensitively. GAS may expose it either on
 * `e.headers` (lowercased) or `e.parameter` (original casing). We tolerate
 * both plus mixed casing rather than assuming one accessor. */
function readSignatureHeader(e: GoogleAppsScript.Events.DoPost): string {
  const HEADER = 'x-line-signature';
  const sources: Array<Record<string, unknown> | undefined> = [
    (e as unknown as { headers?: Record<string, unknown> }).headers,
    e?.parameter as unknown as Record<string, unknown> | undefined,
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (key.toLowerCase() === HEADER) {
        const value = source[key];
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }
  }
  return '';
}

/**
 * LINE webhook handler. Always returns 200 to LINE.
 * @param e GAS POST event (raw body in `e.postData.contents`).
 */
export function doPost(
  e: GoogleAppsScript.Events.DoPost
): GoogleAppsScript.Content.TextOutput {
  try {
    const body = e?.postData?.contents ?? '';
    const signature = readSignatureHeader(e);
    const channelSecret = getProp(PROP_KEYS.LINE_CHANNEL_SECRET);

    if (verifySignature(body, signature, channelSecret)) {
      // Signature verified — route each event. Never throw out of here; any
      // handler failure is logged inside the handler so LINE still gets 200.
      routeWebhook(body);
    } else {
      // LINE must always receive 200; log + ignore an unverified request so no
      // outbound call (reply/OCR) is ever triggered by a spoofed webhook.
      Logger.log('Invalid or absent webhook signature; ignoring request.');
    }
  } catch (err) {
    // doPost must never throw out — LINE always gets a 200 TextOutput.
    Logger.log(`doPost error: ${err instanceof Error ? err.message : err}`);
  }
  return ContentService.createTextOutput('OK').setMimeType(
    ContentService.MimeType.TEXT
  );
}

/**
 * Parse the raw webhook body and dispatch each event to its handler.
 *
 * Dispatch map:
 *   - `message` + `message.type === 'image'` -> `handleImageMessage` (Phase 1)
 *   - `postback`                             -> `handlePostback` (Phase 2)
 *   - anything else (text/sticker/...)       -> graceful ignore (log only)
 *
 * Handler errors are swallowed here so one bad event never fails doPost's 200.
 *
 * SCAFFOLD (Phase 1): body throws NotImplemented (GREEN fills dispatch).
 * @param rawBody raw request body string (already signature-verified).
 */
export function routeWebhook(rawBody: string): void {
  let parsed: LineWebhookBody;
  try {
    parsed = JSON.parse(rawBody) as LineWebhookBody;
  } catch (err) {
    Logger.log(`routeWebhook: unparseable body — ${err}`);
    return;
  }

  const events = parsed.events ?? [];
  for (const event of events) {
    // Never let one bad event fail the whole batch (doPost stays 200).
    try {
      dispatchEvent(event);
    } catch (err) {
      Logger.log(
        `routeWebhook: handler error — ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }
}

/**
 * Route a single event to its handler.
 *   - `message`(image) -> handleImageMessage (Phase 1)
 *   - `postback`       -> handlePostback (Phase 2)
 *   - anything else    -> graceful ignore (log only)
 */
function dispatchEvent(event: LineWebhookEvent): void {
  if (event.type === 'message' && event.message?.type === 'image') {
    handleImageMessage(event);
    return;
  }
  if (event.type === 'postback') {
    handlePostback(event);
    return;
  }
  // Text, sticker, follow, etc. — graceful ignore (no OCR, no reply).
  Logger.log(`routeWebhook: ignoring event type "${event.type}".`);
}

/** Build the graceful OCR-error flex card (shown when OCR throws/times out). */
function buildErrorCard(): object {
  return {
    type: 'flex',
    altText: OCR_ERROR_TEXT,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: OCR_ERROR_TEXT,
            color: ERROR_COLOR,
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'cameraRoll', label: 'ส่งรูปใหม่' },
        },
      ],
    },
  };
}

/**
 * Phase 1 image-event handler: getContent -> OCR(mock) -> calorieRule ->
 * (pass) stash + confirm card | (fail) reject card -> reply. On OCR error,
 * replies a graceful error card. Never throws out (caller keeps doPost at 200).
 *
 * SCAFFOLD (Phase 1): body throws NotImplemented (GREEN fills the flow).
 * @param event a single `message`(image) webhook event.
 */
export function handleImageMessage(event: LineWebhookEvent): void {
  const replyToken = event.replyToken;
  const messageId = event.message?.id;
  if (!replyToken || !messageId) {
    Logger.log(
      'handleImageMessage: missing replyToken or messageId; ignoring.'
    );
    return;
  }

  const userId = event.source?.userId ?? '';

  try {
    // 1. Download the image immediately (availability window not guaranteed).
    const blob = getMessageContent(messageId);

    // GATE 1 — per-user rate-limit (cheapest: O(1) CacheService counter). Over
    // limit → cooldown notice, do NOT compute the hash or call OCR (Phase 3).
    if (!rateLimitAllows(userId)) {
      reply(replyToken, [
        buildBlockNoticeCard(COOLDOWN_TEXT, { cameraRoll: true }),
      ]);
      return;
    }

    // GATE 2 — system-wide sha256 image dedup (O(n) Sheet scan, still < OCR).
    // Compute the hash BEFORE OCR (the cost gate); a byte-identical resend →
    // duplicate notice, do NOT call OCR (Phase 3).
    const imageHash = sha256Hex(blob);
    if (isDuplicateImage(imageHash)) {
      reply(replyToken, [
        buildBlockNoticeCard(DUPLICATE_IMAGE_TEXT, { cameraRoll: true }),
      ]);
      return;
    }

    // Gates cleared → recognise metrics. `getRecognizer()` returns the REAL
    // `ocrClient` when OCR_BASE_URL + OCR_TOKEN are set in Script Properties,
    // else the dev `ocrMock` (Phase 6 mock↔real swap; caller unchanged). A
    // recognize() throw (OCR/network/timeout/auth) is caught below → error card.
    const metrics = getRecognizer().recognize(blob);

    // Today (date-only, Asia/Bangkok) is computed HERE and passed INTO the pure
    // pipeline so the rules never call `new Date()` (deterministic + testable).
    const todayISO = Utilities.formatDate(
      new Date(),
      'Asia/Bangkok',
      'yyyy-MM-dd'
    );
    // Apply the full post-OCR rule pipeline: calorie → backdate → dedupDate,
    // short-circuiting at the first failing rule (Phase 4).
    const result = evaluateSubmissionRules(metrics, userId, todayISO);

    if (result.ok) {
      // CR-1 / Phase 8 (auto-save): rules passed → persist IMMEDIATELY, no user
      // confirm. Build the submission context (OCR + LINE lineage + imageHash),
      // then serialise the check-then-write under the script-wide lock so a LINE
      // webhook redelivery of the SAME messageId cannot create a duplicate row
      // (idempotency moved onto the image path, OVERVIEW risk #4). A waitLock
      // timeout throws out of withScriptLock → lock-timeout notice (no double
      // write); a Sheet-write throw → sheet-error notice. In both cases nothing
      // partial is left behind. On success, counts/dailyValues are read AFTER the
      // append so this submission is reflected in the running summary (Phase 5).
      const ctx = { metrics, messageId, userId, imageHash };
      try {
        withScriptLock(() => {
          if (!submissionExistsByMessageId(messageId)) {
            appendSubmission(ctx);
            // Register the sender under their resolved roster name (falls back to
            // the placeholder when unrostered) — the same name the row records.
            ensureEmployee(userId, resolveEmployeeName(userId));
          }
        });
        const counts = countSubmissions(userId, todayISO);
        const daily = recentDailyValues(userId, todayISO);
        reply(replyToken, [buildSuccessCard(ctx, counts, daily)]);
      } catch (writeErr) {
        // Lock timeout → "ระบบไม่ว่าง ลองใหม่" (system-busy, no cameraRoll — an
        // immediate resend does not help); a Sheet-write failure → "บันทึกไม่สำเร็จ
        // ลองใหม่". doPost still returns 200.
        Logger.log(
          `handleImageMessage auto-save error: ${
            writeErr instanceof Error ? writeErr.message : writeErr
          }`
        );
        reply(replyToken, [
          isLockTimeout(writeErr)
            ? buildBlockNoticeCard(LOCK_TIMEOUT_TEXT)
            : buildSheetErrorCard(),
        ]);
      }
    } else {
      // Fail → reply a reject card. Bump the per-(user, activity) reject-streak
      // counter (disputeGuard, keyed `fc:<userId>:<activityType||unknown>`) and,
      // once it reaches DISPUTE_FAIL_THRESHOLD, attach the "แจ้งแอดมิน" dispute
      // quick reply keyed to THIS messageId (Phase 5 auto-offer). The bump happens
      // ONLY on post-OCR rule rejects — the pre-OCR block paths (rate-limit /
      // duplicate) return above without touching this counter. `run` and `ride`
      // accumulate independently because the counter key includes activityType.
      const failCount = bumpFailCount(userId, metrics.activityType);
      const disputeMessageId = shouldOfferDispute(failCount)
        ? messageId
        : undefined;
      reply(replyToken, [
        buildRejectCard(metrics, result.reason ?? 'ไม่ผ่านเงื่อนไข', {
          disputeMessageId,
        }),
      ]);
    }
  } catch (err) {
    // OCR/network error → graceful error card. Never throw out (doPost = 200).
    Logger.log(
      `handleImageMessage error: ${err instanceof Error ? err.message : err}`
    );
    try {
      reply(replyToken, [buildErrorCard()]);
    } catch (replyErr) {
      Logger.log(`handleImageMessage: error-card reply failed — ${replyErr}`);
    }
  }
}

/**
 * Extract a named field from a compact postback `data` payload
 * (`k1=v1&k2=v2&...`). Used to read `action` and `mid` off the dispute
 * quick-reply (`action=dispute&mid=<messageId>`).
 * @param data the raw `event.postback.data` string.
 * @param key  the field name to read.
 * @returns the field value, or `null` when absent/empty.
 */
function parsePostbackField(
  data: string | undefined,
  key: string
): string | null {
  if (!data) {
    return null;
  }
  for (const pair of data.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq) === key) {
      const value = pair.slice(eq + 1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Build the dispute-ack card: a neutral, emoji-free notice shown after a dispute
 * is logged (Phase 5). Reuses the info/confirm semantic — the report reached the
 * admin, nothing failed. No button, no quick reply.
 *
 * SCAFFOLD (Phase 5): stub only — body throws NotImplemented.
 */
function buildDisputeAckCard(): object {
  // Neutral info style (blue-grey) — nothing failed; the report reached the
  // admin. A CSS-glyph mark ([i]) + label carries the meaning (WCAG: not colour
  // alone). No button, no quick reply, no emoji.
  const INFO_COLOR = '#3b6ea5';
  return {
    type: 'flex',
    altText: DISPUTE_ACK_TEXT,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: '[i]',
                color: INFO_COLOR,
                weight: 'bold',
                size: 'sm',
                flex: 0,
              },
              {
                type: 'text',
                text: DISPUTE_ACK_TEXT,
                color: INFO_COLOR,
                weight: 'bold',
                size: 'sm',
                wrap: true,
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Build the Sheet-write-error card: shown when the datastore write throws.
 * Error style, no quick reply, no stash deletion (the stash survives for a
 * retry) (PLAN Phase 2). No emoji.
 *
 * SCAFFOLD (Phase 2): stub only — body throws NotImplemented.
 */
function buildSheetErrorCard(): object {
  return {
    type: 'flex',
    altText: SHEET_ERROR_TEXT,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: SHEET_ERROR_TEXT,
            color: ERROR_COLOR,
            weight: 'bold',
            wrap: true,
          },
        ],
      },
    },
  };
}

/**
 * Postback-event handler (CR-1 / Phase 8: no confirm write path).
 *
 * Routes the three live postback actions and gracefully ignores everything else:
 *   - `action=dispute&mid=<messageId>` → log ONE dispute (idempotent) + ack (P5).
 *   - `action=help`                    → how-to trigger card (P7 rich-menu).
 *   - `action=summary`                 → the user's on-demand summary card (P7).
 *   - anything else, incl. a LEGACY `action=confirm&id=…` from an old confirm
 *     card still in a chat → graceful IGNORE (no reply, no write, no throw).
 *
 * The confirm write path is GONE: passing images now auto-save on the image path
 * (`handleImageMessage`). Never throws out (caller keeps doPost at 200).
 * @param event a single `postback` webhook event.
 */
export function handlePostback(event: LineWebhookEvent): void {
  const replyToken = event.replyToken;
  if (!replyToken) {
    Logger.log('handlePostback: missing replyToken; ignoring.');
    return;
  }

  // Phase 5 dispute branch: a "แจ้งแอดมิน" quick-reply tap arrives as
  // `action=dispute&mid=<messageId>`. Log ONE dispute for that messageId
  // (idempotent via disputeExistsByMessageId) and reply a neutral ack. The
  // activity type is not carried on the dispute postback → pass '' (fine).
  if (parsePostbackField(event.postback?.data, 'action') === DISPUTE_ACTION) {
    const mid = parsePostbackField(event.postback?.data, 'mid');
    const userId = event.source?.userId ?? '';
    if (mid !== null) {
      try {
        logDispute(mid, userId, '', 'user-dispute');
      } catch (err) {
        Logger.log(
          `handlePostback: logDispute failed — ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    } else {
      Logger.log('handlePostback: dispute postback missing mid; ignoring.');
    }
    try {
      reply(replyToken, [buildDisputeAckCard()]);
    } catch (replyErr) {
      Logger.log(`handlePostback: dispute-ack reply failed — ${replyErr}`);
    }
    return;
  }

  // Phase 7 rich-menu branches. `action=help` → how-to trigger card;
  // `action=summary` → the user's on-demand summary (week/month/total + 7-day
  // bar chart). Both are pulls with no stash — they never touch the confirm
  // write path. Any handler failure is logged so doPost still returns 200.
  const action = parsePostbackField(event.postback?.data, 'action');
  if (action === HELP_ACTION) {
    try {
      reply(replyToken, [buildTriggerCard()]);
    } catch (replyErr) {
      Logger.log(`handlePostback: help-card reply failed — ${replyErr}`);
    }
    return;
  }
  if (action === SUMMARY_ACTION) {
    const userId = event.source?.userId ?? '';
    try {
      const todayISO = Utilities.formatDate(
        new Date(),
        'Asia/Bangkok',
        'yyyy-MM-dd'
      );
      const counts = countSubmissions(userId, todayISO);
      const daily = recentDailyValues(userId, todayISO);
      reply(replyToken, [buildSummaryCard(counts, daily)]);
    } catch (err) {
      Logger.log(
        `handlePostback: summary failed — ${
          err instanceof Error ? err.message : err
        }`
      );
    }
    return;
  }
  // Any other postback — an unknown rich-menu tap OR a LEGACY `action=confirm`
  // from an old confirm card still sitting in a user's chat — is ignored
  // GRACEFULLY: no reply, no write, no throw (CR-1 / Phase 8 removed the confirm
  // write path; passing images now auto-save on the image path). doPost still
  // returns 200 (PLAN Phase 8 acceptance edge/negative).
  Logger.log(`handlePostback: ignoring unrouted action "${action ?? ''}".`);
}

/**
 * Heuristic: was the thrown error a `LockService.waitLock` timeout (vs a Sheet
 * write failure)? GAS surfaces a lock timeout as an Error whose message mentions
 * the lock/timeout; we branch the notice card on it (lock-timeout vs sheet-error).
 *
 * SCAFFOLD (Phase 3): stub only — body throws NotImplemented.
 */
function isLockTimeout(err: unknown): boolean {
  const message = (
    err instanceof Error ? err.message : String(err ?? '')
  ).toLowerCase();
  // GAS surfaces a waitLock timeout as an Error whose message mentions the lock
  // and/or a timeout (e.g. "Could not acquire lock: timeout"). A Sheet-write
  // failure carries neither → sheet-error card instead.
  return message.includes('lock') || message.includes('timeout');
}
