/**
 * src/rules/rateLimit.ts — per-user rate-limit (Phase 3, anti-spam guard #2).
 *
 * Caps how many images a single user may submit inside a rolling window, gating
 * OCR cost + flood abuse (OVERVIEW §6 DoS mitigation). Runs BEFORE the hash
 * compute + OCR in the image path (cheapest gate first).
 *
 * Backing store: a `CacheService` counter under `rl:<userId>`. GAS has no atomic
 * increment, so the pattern is get → parseInt → +1 → put(ttl). GAS is
 * single-threaded per script, so same-user requests queue (no race at trial
 * scale). The window is a sliding TTL: after `RATE_LIMIT_WINDOW_SEC` of quiet the
 * counter expires and the user starts fresh.
 *
 * Boundary (PLAN Phase 3 line 89): the 1st..5th submission pass; the 6th blocks.
 * i.e. allow while the post-increment count is ≤ `RATE_LIMIT_MAX`.
 *
 * SCAFFOLD (Phase 3): signature only — body throws NotImplemented.
 */

/** Max image submissions allowed per user inside the window (5th passes). */
export const RATE_LIMIT_MAX = 5;

/** Rolling window for the rate-limit counter, in seconds (CacheService TTL). */
export const RATE_LIMIT_WINDOW_SEC = 60;

/** Cache-key prefix for the per-user rate-limit counter. */
export const RATE_LIMIT_KEY_PREFIX = 'rl:';

/**
 * Record one submission for a user and report whether it is allowed.
 *
 * Increments the `rl:<userId>` counter (get → parseInt → +1 → put with a
 * `RATE_LIMIT_WINDOW_SEC` TTL) and returns true iff the post-increment count is
 * ≤ `RATE_LIMIT_MAX` (so the 5th submission passes, the 6th is blocked).
 *
 * @param userId LINE user id of the sender.
 * @returns true if this submission is within the limit; false if it exceeds it.
 */
export function rateLimitAllows(userId: string): boolean {
  const cache = CacheService.getScriptCache();
  const key = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  const current = parseInt(cache.get(key) ?? '', 10) || 0;
  const next = current + 1;
  cache.put(key, String(next), RATE_LIMIT_WINDOW_SEC);
  return next <= RATE_LIMIT_MAX;
}
