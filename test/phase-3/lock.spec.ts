/**
 * test/phase-3/lock.spec.ts — phase-local unit: script-lock critical section.
 *
 * RED-first (Phase 3, TDD). BLIND against the frozen `withScriptLock` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 3 acceptance (line
 * 90–91 — LockService dedup + timeout graceful) + impl-phase-3 §4:
 *
 *   - withScriptLock(fn) acquires LockService.getScriptLock().waitLock(10000),
 *     runs fn, RETURNS fn's value, and releaseLock() is called.
 *   - releaseLock() runs even when fn THROWS (finally) — no held-across-throw lock.
 *   - a custom waitMs is passed through to waitLock.
 *   - waitLock throwing (timeout) → withScriptLock THROWS the SAME timeout error
 *     (propagates so the caller replies the lock-timeout card). fn is NOT run and
 *     nothing is released spuriously (the lock was never acquired).
 *
 * RED-GATE guard: the timeout-propagation test asserts the SPECIFIC waitLock
 * timeout message AND that waitLock was actually invoked — so the bare
 * NotImplemented stub-throw (which throws BEFORE ever touching the lock) FAILS
 * this test rather than passing it by coincidence. It only goes green once
 * withScriptLock genuinely acquires the lock and lets the timeout propagate.
 *
 * MOCK suite: the external boundary is GAS LockService. We install a spy lock
 * whose waitLock/releaseLock we observe (and can make waitLock throw). mock/real
 * flag: LockService has no cheap Node analogue → this spy lock IS the real
 * boundary; the SAME assertions run. We never read the impl body — only the
 * public signature + LOCK_WAIT_MS.
 */

import { withScriptLock, LOCK_WAIT_MS } from '../../src/state/lock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** Distinct sentinel so a NotImplemented stub-throw can never match it. */
const TIMEOUT_MSG = 'lock-wait-timeout-sentinel';

let waitLock: jest.Mock;
let releaseLock: jest.Mock;

/** Install a spy script-lock; `throwOnWait` makes waitLock simulate a timeout. */
function installLock(throwOnWait = false): void {
  waitLock = jest.fn((_ms?: number): void => {
    if (throwOnWait) throw new Error(TIMEOUT_MSG);
  });
  releaseLock = jest.fn();
  g.LockService.getScriptLock.mockReturnValue({
    waitLock,
    tryLock: jest.fn((): boolean => true),
    releaseLock,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installLock();
});

describe('withScriptLock — acquire, run, release', () => {
  it('waitLock(10000) → runs fn → returns fn value → releaseLock', () => {
    const fn = jest.fn((): string => 'result');

    const out = withScriptLock(fn);

    expect(LOCK_WAIT_MS).toBe(10000);
    expect(waitLock).toHaveBeenCalledWith(LOCK_WAIT_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toBe('result');
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('passes a custom waitMs through to waitLock', () => {
    withScriptLock(() => undefined, 3000);
    expect(waitLock).toHaveBeenCalledWith(3000);
  });

  it('releases the lock even when fn throws (finally)', () => {
    const boom = (): never => {
      throw new Error('inside critical section');
    };

    expect(() => withScriptLock(boom)).toThrow('inside critical section');
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});

describe('withScriptLock — waitLock timeout propagates', () => {
  it('waitLock throwing → withScriptLock throws the SAME timeout error, fn NOT run', () => {
    installLock(true); // waitLock throws the sentinel timeout
    const fn = jest.fn();

    // Must propagate the ACTUAL waitLock error — not a NotImplemented stub-throw.
    expect(() => withScriptLock(fn)).toThrow(TIMEOUT_MSG);
    // The stub throws before ever calling the lock; the real impl must have tried.
    expect(waitLock).toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    // Lock was never acquired → releaseLock must not run spuriously.
    expect(releaseLock).not.toHaveBeenCalled();
  });
});
