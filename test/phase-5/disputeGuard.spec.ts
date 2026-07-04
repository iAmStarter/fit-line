/**
 * test/phase-5/disputeGuard.spec.ts — phase-local unit: per-(user, activity)
 * reject fail-counter + dispute threshold.
 *
 * RED-first (Phase 5, TDD). BLIND against the frozen `bumpFailCount` /
 * `shouldOfferDispute` stubs (throw NotImplemented). Asserts BEHAVIOR from PLAN
 * Phase 5 acceptance (lines 124–125) + disputeGuard contract:
 *   - bumpFailCount('U','run') returns an increasing count 1, 2, 3, ...
 *   - shouldOfferDispute(2) === false; shouldOfferDispute(3) === true
 *     (threshold DISPUTE_FAIL_THRESHOLD = 3, offer when count >= 3).
 *   - counters are independent per user AND per activity type.
 *   - the cache key uses the `fc:` prefix (FAIL_COUNT_KEY_PREFIX).
 *   - activityType null → buckets under a stable 'unknown' bucket (no crash).
 *
 * MOCK suite: the ONLY external boundary is GAS CacheService — replaced by a
 * stateful in-memory double (the "real" local boundary; CacheService has no cheap
 * Node analogue). All counter logic runs unmocked. mock/real flag: the same
 * assertions run against the same double. We never read the impl body — only the
 * public signatures + exported constants.
 */

import {
  bumpFailCount,
  shouldOfferDispute,
  DISPUTE_FAIL_THRESHOLD,
  FAIL_COUNT_KEY_PREFIX,
} from '../../src/rules/disputeGuard';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** Stateful in-memory CacheService with per-key TTL ignored (single-tick tests). */
let cache: Map<string, string>;
let putSpy: jest.Mock;

function installStatefulCache(): void {
  cache = new Map<string, string>();
  putSpy = jest.fn((key: string, value: string): void => {
    cache.set(key, value);
  });
  g.CacheService.getScriptCache.mockReturnValue({
    put: putSpy,
    get: jest.fn((key: string): string | null =>
      cache.has(key) ? (cache.get(key) as string) : null
    ),
    remove: jest.fn((key: string): void => {
      cache.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
});

describe('shouldOfferDispute — threshold at DISPUTE_FAIL_THRESHOLD (=3)', () => {
  it('threshold constant is 3', () => {
    expect(DISPUTE_FAIL_THRESHOLD).toBe(3);
  });

  it('count 2 → false; count 3 → true; count 4 → true', () => {
    expect(shouldOfferDispute(2)).toBe(false);
    expect(shouldOfferDispute(3)).toBe(true);
    expect(shouldOfferDispute(4)).toBe(true);
  });

  it('count 0 and 1 → false', () => {
    expect(shouldOfferDispute(0)).toBe(false);
    expect(shouldOfferDispute(1)).toBe(false);
  });
});

describe('bumpFailCount — increasing count on repeated rejects', () => {
  it('returns 1, 2, 3 on successive calls for the same (user, activity)', () => {
    expect(bumpFailCount('U', 'run')).toBe(1);
    expect(bumpFailCount('U', 'run')).toBe(2);
    expect(bumpFailCount('U', 'run')).toBe(3);
  });

  it('reaches the dispute threshold on the 3rd reject', () => {
    bumpFailCount('U', 'run');
    bumpFailCount('U', 'run');
    const third = bumpFailCount('U', 'run');
    expect(shouldOfferDispute(third)).toBe(true);
  });
});

describe('bumpFailCount — independent counters', () => {
  it('a different user has its own counter', () => {
    bumpFailCount('U', 'run');
    bumpFailCount('U', 'run');
    // a different user starts fresh
    expect(bumpFailCount('V', 'run')).toBe(1);
    // U's counter is unaffected
    expect(bumpFailCount('U', 'run')).toBe(3);
  });

  it('a different activity type has its own counter for the same user', () => {
    bumpFailCount('U', 'run');
    bumpFailCount('U', 'run');
    // a different activity starts fresh
    expect(bumpFailCount('U', 'cycle')).toBe(1);
    // the 'run' counter is unaffected
    expect(bumpFailCount('U', 'run')).toBe(3);
  });
});

describe('bumpFailCount — cache key uses the fc: prefix', () => {
  it('put() is called with a key starting with FAIL_COUNT_KEY_PREFIX and the userId', () => {
    bumpFailCount('U', 'run');
    expect(putSpy).toHaveBeenCalled();
    const key = String(putSpy.mock.calls[0][0]);
    expect(key.startsWith(FAIL_COUNT_KEY_PREFIX)).toBe(true);
    expect(key).toContain('U');
    expect(key).toContain('run');
  });
});

describe('bumpFailCount — null activity buckets under "unknown"', () => {
  it('activityType null does not crash and accumulates like a normal bucket', () => {
    expect(bumpFailCount('U', null)).toBe(1);
    expect(bumpFailCount('U', null)).toBe(2);
    // the null bucket is stored under a stable 'unknown' key.
    const key = String(putSpy.mock.calls[putSpy.mock.calls.length - 1][0]);
    expect(key).toContain('unknown');
  });

  it('the null/unknown bucket is separate from a named activity bucket', () => {
    bumpFailCount('U', null);
    bumpFailCount('U', null);
    // a named activity for the same user starts fresh
    expect(bumpFailCount('U', 'run')).toBe(1);
  });
});
