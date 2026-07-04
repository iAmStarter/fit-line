/**
 * src/state/lock.ts — script-wide critical-section wrapper (Phase 3).
 *
 * Guards the Sheet write path against LINE webhook redelivery: LINE may deliver
 * the same event twice (its ~2s timeout heuristic vs our post-OCR reply), so the
 * confirm postback's check-then-write must be serialised. `messageId` is the
 * idempotency key checked inside the section (see `handlePostback`).
 *
 * Scope: `LockService.getScriptLock()` — a single script-wide lock (per GAS
 * project, not per user). GAS is single-threaded per script, so redeliveries
 * queue on the lock rather than contend.
 *
 * Timeout behaviour: `waitLock(waitMs)` THROWS when it cannot acquire within the
 * budget. `withScriptLock` lets that throw propagate so the caller can catch it
 * and reply the lock-timeout card ("ระบบไม่ว่าง ลองใหม่") — it must NOT swallow
 * the timeout into a silent proceed (that would risk a double-write). The lock is
 * released in `finally` so it is never held across a throw.
 *
 * SCAFFOLD (Phase 3): signature only — body throws NotImplemented.
 */

/** Default wait budget for acquiring the script lock, in milliseconds. */
export const LOCK_WAIT_MS = 10000;

/**
 * Run `fn` while holding the script-wide lock; release it in `finally`.
 *
 * Acquires `LockService.getScriptLock()`, `waitLock(waitMs ?? LOCK_WAIT_MS)`,
 * runs `fn`, and releases the lock in a `finally`. If `waitLock` times out it
 * throws — that throw is allowed to propagate (caller catches → lock-timeout
 * card); the lock is not acquired in that case so nothing is released spuriously.
 *
 * @typeParam T return type of the guarded function.
 * @param fn     the critical section to run under the lock.
 * @param waitMs optional acquire budget (ms); defaults to `LOCK_WAIT_MS` (10000).
 * @returns whatever `fn` returns.
 * @throws if the lock cannot be acquired within `waitMs` (waitLock timeout).
 */
export function withScriptLock<T>(
  fn: () => T,
  waitMs: number = LOCK_WAIT_MS
): T {
  const lock = LockService.getScriptLock();
  // waitLock throws on timeout BEFORE the lock is held — let it propagate so the
  // caller replies the lock-timeout card; nothing is released (never acquired).
  lock.waitLock(waitMs);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
