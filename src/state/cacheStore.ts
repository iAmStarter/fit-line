/**
 * src/state/cacheStore.ts — multi-turn submission stash (CacheService).
 *
 * Between the image event (Phase 1) and the confirm postback (Phase 2) the OCR
 * reading plus its LINE lineage must survive. We stash a `StashedContext`
 * envelope in `CacheService` under a short id embedded in the postback `data`
 * (`action=confirm&id=<shortId>`). TTL ~10 min (600s, CacheService max).
 * Expired/missing → `retrieveSubmission` returns null → postback replies
 * "หมดเวลา ส่งรูปใหม่" (OVERVIEW risk #7).
 *
 * Why an envelope (not bare `OcrMetrics`): the `submissions` row needs
 * `messageId` (dedup key, OVERVIEW §5) and `userId`, and Phase 3 needs
 * `messageId` for messageId+Lock dedup under LINE redelivery. Neither rides on
 * the postback event, so both are captured at image-event time and carried in
 * the stash. `stashSubmission` returns the id; `retrieveSubmission` reads it
 * back; `removeSubmission` consumes it after a successful Sheet write (idempotent
 * double-confirm guard, Phase 2).
 *
 * Value is JSON-stringified (`CacheService` stores strings only).
 */

import type { OcrMetrics } from '../types/ocrMetrics';

/**
 * Context envelope stashed across the image event → confirm postback boundary.
 * Carries the OCR reading plus the LINE lineage (`messageId`, `userId`) that the
 * `submissions` row + Phase 3 dedup require but that the postback event lacks.
 */
export interface StashedContext {
  /** The OCR reading to persist across events. */
  metrics: OcrMetrics;
  /** LINE message id of the source image event (submissions dedup key). */
  messageId: string;
  /** LINE user id of the sender (submissions + employees registration). */
  userId: string;
  /**
   * Canonical sha256 hex of the source image bytes (Phase 3). Computed at
   * image-time (the cost gate, before OCR) and carried to the postback so it is
   * written into the `submissions` row for system-wide image dedup.
   */
  imageHash: string;
}

/** Cache TTL for a stashed submission context (seconds). CacheService max is 600. */
export const OCR_STASH_TTL_SECONDS = 600;

/** Cache-key prefix for stashed submission contexts. */
export const OCR_STASH_KEY_PREFIX = 'ocr:';

/** Monotonic counter so two stashes in the same millisecond stay distinct. */
let stashCounter = 0;

/**
 * Generate a short, collision-resistant id for a stash entry. Compact enough to
 * ride inside the postback `data` (`action=confirm&id=<shortId>`, ≤300 chars).
 * Combines two base-36 random chunks with a monotonic counter so repeated calls
 * in the same tick never collide.
 */
function generateShortId(): string {
  stashCounter = (stashCounter + 1) % 0xffffff;
  const rand = Math.random().toString(36).slice(2, 8);
  const seq = stashCounter.toString(36);
  return `${rand}${seq}`;
}

/**
 * Stash a submission context and return a short id to embed in postback data.
 * @param ctx OCR reading + LINE lineage to persist across events.
 * @returns a short id (used as `id=<shortId>` in postback data).
 */
export function stashSubmission(ctx: StashedContext): string {
  const id = generateShortId();
  const json = JSON.stringify(ctx);
  CacheService.getScriptCache().put(
    `${OCR_STASH_KEY_PREFIX}${id}`,
    json,
    OCR_STASH_TTL_SECONDS
  );
  return id;
}

/**
 * Retrieve a stashed submission context by its short id.
 * @param id short id previously returned by `stashSubmission`.
 * @returns the stashed context, or `null` when the entry is missing/expired.
 */
export function retrieveSubmission(id: string): StashedContext | null {
  const json = CacheService.getScriptCache().get(
    `${OCR_STASH_KEY_PREFIX}${id}`
  );
  if (json === null) {
    return null;
  }
  return JSON.parse(json) as StashedContext;
}

/**
 * Remove a stashed submission context by its short id.
 *
 * Called after a successful Sheet write (Phase 2) to consume the stash so a
 * repeated confirm postback with the same id finds nothing → no double-write
 * (idempotent-ish double-confirm guard, PLAN Phase 2).
 * @param id short id previously returned by `stashSubmission`.
 */
export function removeSubmission(id: string): void {
  CacheService.getScriptCache().remove(`${OCR_STASH_KEY_PREFIX}${id}`);
}
