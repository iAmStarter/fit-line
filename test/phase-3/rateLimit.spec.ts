/**
 * test/phase-3/rateLimit.spec.ts — phase-local unit: per-user rate-limit guard.
 *
 * RED-first (Phase 3, TDD). BLIND against the frozen `rateLimitAllows` stub
 * (throws NotImplemented). Asserts BEHAVIOR from PLAN Phase 3 acceptance (line 89
 * — "5 ผ่าน, 6 บล็อก") + impl-phase-3 §3:
 *
 *   - calls 1..5 for one user → all true (within limit); the 6th → false.
 *   - two different userIds are INDEPENDENT (one flooding does not block another).
 *   - the counter key is `rl:<userId>` and put() uses a 60s TTL (window).
 *   - a fresh window (counter expired/absent) counts from 1 again.
 *
 * MOCK suite: the external boundary is GAS CacheService. We install a STATEFUL
 * in-memory counter double (get/parseInt/+1/put over a Map) so the boundary
 * (5-pass / 6-block) is genuinely exercised — a broken increment, wrong key, or
 * missing TTL fails the assertion, it is not papered over by an inert stub.
 * mock/real flag: CacheService has no cheap Node analogue → this stateful counter
 * IS the real boundary; the SAME assertions run. We never read the impl body —
 * only the public signature + the exported RATE_LIMIT_* constants.
 */

import {
  rateLimitAllows,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SEC,
  RATE_LIMIT_KEY_PREFIX,
} from '../../src/rules/rateLimit';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** Records the (key, value, ttl) of every put() for the key/TTL assertions. */
interface PutCall {
  key: string;
  value: string;
  ttl?: number;
}
let putCalls: PutCall[];

/**
 * Install a stateful in-memory CacheService counter double: get(key) returns the
 * stored string or null, put(key,value,ttl) stores + records the call. This lets
 * rateLimitAllows genuinely increment the `rl:<userId>` counter across calls.
 */
function installStatefulCache(): Map<string, string> {
  const store = new Map<string, string>();
  putCalls = [];
  g.CacheService.getScriptCache.mockReturnValue({
    get: jest.fn((key: string): string | null =>
      store.has(key) ? (store.get(key) as string) : null
    ),
    put: jest.fn((key: string, value: string, ttl?: number): void => {
      putCalls.push({ key, value, ttl });
      store.set(key, value);
    }),
    remove: jest.fn((key: string): void => {
      store.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
});

describe('rateLimitAllows — boundary (5 pass, 6 block)', () => {
  it('the 1st..5th submission all pass (true)', () => {
    const results = [1, 2, 3, 4, 5].map(() => rateLimitAllows('U1'));
    expect(results).toEqual([true, true, true, true, true]);
    // sanity: the limit constant is 5 (the 5th passes).
    expect(RATE_LIMIT_MAX).toBe(5);
  });

  it('the 6th submission is blocked (false)', () => {
    for (let i = 0; i < 5; i++) rateLimitAllows('U1'); // 1..5 pass
    expect(rateLimitAllows('U1')).toBe(false); // 6th blocked
  });
});

describe('rateLimitAllows — per-user independence', () => {
  it('one user hitting the limit does not block another user', () => {
    for (let i = 0; i < 6; i++) rateLimitAllows('U1'); // U1 flooded (6th blocked)
    // U2 is fresh: its 1st..5th still pass.
    const u2 = [1, 2, 3, 4, 5].map(() => rateLimitAllows('U2'));
    expect(u2).toEqual([true, true, true, true, true]);
  });
});

describe('rateLimitAllows — key + TTL (window)', () => {
  it('increments the rl:<userId> counter with a 60s TTL', () => {
    rateLimitAllows('Uabc');
    const expectedKey = `${RATE_LIMIT_KEY_PREFIX}Uabc`;
    expect(RATE_LIMIT_KEY_PREFIX).toBe('rl:');
    expect(RATE_LIMIT_WINDOW_SEC).toBe(60);
    const put = putCalls.find((c) => c.key === expectedKey);
    expect(put).toBeDefined();
    expect(put?.ttl).toBe(RATE_LIMIT_WINDOW_SEC);
  });

  it('a fresh window (empty cache) counts the first call as allowed', () => {
    // No prior calls for this user → the very first is within the limit.
    expect(rateLimitAllows('Ufresh')).toBe(true);
  });
});
