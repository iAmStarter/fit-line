/**
 * src/rules/disputeGuard.ts — repeated-reject dispute affordance (Phase 5).
 *
 * When a user's post-OCR rule rejects pile up on the SAME activity type, the
 * reject card should offer a manual "แจ้งแอดมิน" (dispute) path so a genuine
 * false-reject can be escalated for human review (OVERVIEW §6 / risk #8). This
 * module tracks the per-(user, activity) fail count and decides when the
 * threshold is reached.
 *
 * Backing store: a `CacheService` counter under `fc:<userId>:<activityType>`,
 * mirroring `rateLimit.ts` — GAS has no atomic increment, so the pattern is
 * get → parseInt → +1 → put(ttl). GAS is single-threaded per script, so
 * same-user requests queue (no race at trial scale). A quiet period expires the
 * counter (sliding TTL) so an old streak does not linger forever.
 *
 * Threshold (PLAN Phase 5 line 124): at the 3rd consecutive reject on the same
 * activity, the dispute affordance appears — i.e. offer when count ≥ 3.
 *
 * SCAFFOLD (Phase 5): signatures only — bodies throw NotImplemented.
 */

/** Fail count at/above which the reject card offers a dispute affordance. */
export const DISPUTE_FAIL_THRESHOLD = 3;

/** Cache-key prefix for the per-(user, activity) reject fail counter. */
export const FAIL_COUNT_KEY_PREFIX = 'fc:';

/** Rolling window for the fail counter, in seconds (CacheService TTL). */
export const FAIL_COUNT_WINDOW_SEC = 3600;

/**
 * Record one post-OCR rule reject for a (userId, activityType) pair and return
 * the new post-increment count.
 *
 * Increments the `fc:<userId>:<activityType>` counter (get → parseInt → +1 →
 * put with a `FAIL_COUNT_WINDOW_SEC` TTL). A null `activityType` (OCR could not
 * read the activity) buckets under the literal `'unknown'` so those rejects
 * still accumulate rather than being dropped.
 *
 * @param userId       LINE user id of the sender.
 * @param activityType the rejected activity type (null → bucketed as 'unknown').
 * @returns the new fail count after this reject.
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function bumpFailCount(
  userId: string,
  activityType: string | null
): number {
  const cache = CacheService.getScriptCache();
  const bucket = activityType ?? 'unknown';
  const key = `${FAIL_COUNT_KEY_PREFIX}${userId}:${bucket}`;
  const current = parseInt(cache.get(key) ?? '', 10) || 0;
  const next = current + 1;
  cache.put(key, String(next), FAIL_COUNT_WINDOW_SEC);
  return next;
}

/**
 * Report whether a given fail count has reached the dispute threshold.
 * @param count the current fail count (from `bumpFailCount`).
 * @returns true iff `count >= DISPUTE_FAIL_THRESHOLD`.
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function shouldOfferDispute(count: number): boolean {
  return count >= DISPUTE_FAIL_THRESHOLD;
}
