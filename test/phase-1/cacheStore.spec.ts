/**
 * test/phase-1/cacheStore.spec.ts — phase-local unit: submission stash round-trip.
 *
 * RED-first (Phase 1, TDD). RE-ALIGNED for the approved Phase-2 stash-interface
 * rename (envelope): `stashOcr`/`retrieveOcr` (bare OcrMetrics) → `stashSubmission`/
 * `retrieveSubmission` (StashedContext envelope) + new `removeSubmission`. The
 * cacheStore widening is WORKING impl (not a Phase-2 stub), so this suite must
 * stay GREEN — same behaviour, wider value. Test intent is unchanged:
 *   - stashSubmission(ctx) returns a NON-EMPTY short id.
 *   - retrieveSubmission(sameId) deep-equals the SAME StashedContext envelope.
 *   - retrieveSubmission('missing') -> null (cache miss / expired entry).
 *   - removeSubmission(id) then retrieveSubmission(id) -> null (consume).
 *   - TTL constant is 600s (CacheService max) and stash uses it.
 *
 * MOCK suite: the external boundary is GAS CacheService. We install a STATEFUL
 * in-memory double on the harness (put/get/remove over a Map) so the round-trip
 * is genuine — a broken stash/retrieve (wrong key, no JSON, dropped write) fails
 * the assertion, it is not papered over by an inert stub. The mock/real flag:
 * CacheService has no cheap real analogue under Node, so "real" == the stateful
 * in-memory boundary that faithfully models put/get/TTL/remove; the SAME
 * assertions run. We never read the impl body — only signatures.
 */

import {
  stashSubmission,
  retrieveSubmission,
  removeSubmission,
  OCR_STASH_TTL_SECONDS,
} from '../../src/state/cacheStore';
import type { StashedContext } from '../../src/state/cacheStore';
import { makeOcrMetrics } from '../support/ocrFixture';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/** Records the TTL passed to the most recent put(), for the TTL assertion. */
let lastPutTtl: number | undefined;

/**
 * Install a stateful in-memory CacheService double: put(key,val,ttl) stores,
 * get(key) returns the stored string or null, remove(key) deletes. This models
 * a real script cache closely enough that stash/retrieve/remove must actually work.
 */
function installStatefulCache(): Map<string, string> {
  const store = new Map<string, string>();
  lastPutTtl = undefined;
  g.CacheService.getScriptCache.mockReturnValue({
    put: jest.fn((key: string, value: string, ttl?: number): void => {
      lastPutTtl = ttl;
      store.set(key, value);
    }),
    get: jest.fn((key: string): string | null =>
      store.has(key) ? (store.get(key) as string) : null
    ),
    remove: jest.fn((key: string): void => {
      store.delete(key);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
  return store;
}

/** Build a StashedContext envelope from an OcrMetrics fixture + LINE lineage. */
function makeCtx(overrides: Partial<StashedContext> = {}): StashedContext {
  return {
    metrics: makeOcrMetrics(),
    messageId: 'm1',
    userId: 'U1',
    imageHash: 'hash_m1',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  installStatefulCache();
});

describe('cacheStore — stashSubmission returns a usable short id', () => {
  it('returns a non-empty string id', () => {
    const id = stashSubmission(
      makeCtx({ metrics: makeOcrMetrics({ activeCaloriesKcal: 200 }) })
    );
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('gives distinct ids to two separate stashes', () => {
    const a = stashSubmission(
      makeCtx({ metrics: makeOcrMetrics({ activityType: 'Running' }) })
    );
    const b = stashSubmission(
      makeCtx({ metrics: makeOcrMetrics({ activityType: 'Cycling' }) })
    );
    expect(a).not.toBe(b);
  });

  it('puts with the 600s TTL (constant asserted through the stash call)', () => {
    stashSubmission(makeCtx());
    expect(OCR_STASH_TTL_SECONDS).toBe(600);
    expect(lastPutTtl).toBe(OCR_STASH_TTL_SECONDS);
  });
});

describe('cacheStore — round-trip stash -> retrieve (envelope)', () => {
  it('retrieveSubmission(sameId) returns the SAME StashedContext envelope', () => {
    const original = makeCtx({
      metrics: makeOcrMetrics({
        activeCaloriesKcal: 200,
        activityType: 'Running',
        activityDateISO: '2026-07-04',
        warnings: ['low-confidence-distance'],
      }),
      messageId: 'm1',
      userId: 'U1',
      imageHash: 'abc123def456',
    });
    const id = stashSubmission(original);
    const got = retrieveSubmission(id);
    expect(got).not.toBeNull();
    expect(got).toEqual(original);
    // envelope lineage survives the round-trip (not just the metrics)
    expect(got?.messageId).toBe('m1');
    expect(got?.userId).toBe('U1');
    expect(got?.imageHash).toBe('abc123def456');
    expect(got?.metrics.activeCaloriesKcal).toBe(200);
  });

  it('preserves nulls and nested arrays through the JSON round-trip', () => {
    const original = makeCtx({
      metrics: makeOcrMetrics({
        activeCaloriesKcal: null,
        totalCaloriesKcal: 160,
        warnings: null,
      }),
    });
    const id = stashSubmission(original);
    expect(retrieveSubmission(id)).toEqual(original);
  });
});

describe('cacheStore — cache miss / expired', () => {
  it("retrieveSubmission('missing') returns null", () => {
    expect(retrieveSubmission('missing')).toBeNull();
  });

  it('returns null for an id that was never stashed', () => {
    stashSubmission(makeCtx());
    expect(retrieveSubmission('some-other-id-never-used')).toBeNull();
  });
});

describe('cacheStore — removeSubmission consumes the stash', () => {
  it('removeSubmission(id) then retrieveSubmission(id) returns null', () => {
    const id = stashSubmission(makeCtx());
    // sanity: present before removal
    expect(retrieveSubmission(id)).not.toBeNull();
    removeSubmission(id);
    expect(retrieveSubmission(id)).toBeNull();
  });
});
