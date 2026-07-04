/**
 * test/regression/ocrMock.contract.spec.ts — CROSS-PHASE contract corpus.
 *
 * The OcrMetrics REAL 25-key contract — the parity guard that makes the Phase 6
 * mock->real swap transparent (OVERVIEW §7, PLAN Phase 6). This suite is part of
 * the growing regression corpus; it must NOT depend on any phase-local fixture,
 * so it imports the recognizers + type directly and builds its own blob.
 *
 * Asserts:
 *   - ocrMock.recognize(blob) returns an object with ALL 25 OcrMetrics keys
 *     present (own-property check per key) with the right runtime typeof.
 *   - The three always-present provenance/quality fields (imageHash, source,
 *     confidence) are non-null.
 *   - ocrMock and ocrClient satisfy the SAME OcrRecognizer interface (structural
 *     parity guard: both expose a callable `recognize` producing the same shape).
 *
 * The 25-key roster below is derived from the REAL (Phase-6-realigned) OcrMetrics
 * interface signature (src/types/ocrMetrics.ts) — a signature read, not a logic
 * read. If the real client (Phase 6) or the mock drifts from this shape, this
 * suite fails.
 *
 * MOCK-vs-REAL: the mock IS the boundary under test here (the real OCR service
 * is not provisioned until Phase 6); the real-OCR network shape contract lands in
 * test/contract/ocr.contract.spec.ts and reuses this same 25-key roster. We never
 * read impl bodies — only the public recognize() signature.
 */

import { ocrMock } from '../../src/ocr/ocrMock';
import { ocrClient } from '../../src/ocr/ocrClient';
import type { OcrRecognizer } from '../../src/ocr/ocrClient';
import type { OcrMetrics } from '../../src/types/ocrMetrics';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The 25 keys of the REAL OcrMetrics contract with their expected runtime typeof
 * when non-null. `nullable` keys may be null; the three provenance/quality fields
 * (imageHash, source, confidence) are always non-null.
 */
type Kind = 'number' | 'string' | 'array' | 'object';
interface KeySpec {
  key: keyof OcrMetrics;
  kind: Kind;
  nullable: boolean;
}
const CONTRACT_KEYS: KeySpec[] = [
  // always-present (never null)
  { key: 'imageHash', kind: 'string', nullable: false },
  { key: 'source', kind: 'string', nullable: false },
  { key: 'confidence', kind: 'number', nullable: false },
  // activity identity
  { key: 'activityType', kind: 'string', nullable: true },
  { key: 'activityDateISO', kind: 'string', nullable: true },
  { key: 'activityDateRaw', kind: 'string', nullable: true },
  // time metadata
  { key: 'startTimeLocal', kind: 'string', nullable: true },
  { key: 'endTimeLocal', kind: 'string', nullable: true },
  { key: 'elapsedTimeSec', kind: 'number', nullable: true },
  { key: 'movingTimeSec', kind: 'number', nullable: true },
  // movement metrics
  { key: 'distanceKm', kind: 'number', nullable: true },
  { key: 'avgPaceSecPerKm', kind: 'number', nullable: true },
  { key: 'avgSpeedKph', kind: 'number', nullable: true },
  { key: 'elevationGainM', kind: 'number', nullable: true },
  // calorie readings
  { key: 'activeCaloriesKcal', kind: 'number', nullable: true },
  { key: 'totalCaloriesKcal', kind: 'number', nullable: true },
  // heart-rate metrics
  { key: 'avgHeartRateBpm', kind: 'number', nullable: true },
  { key: 'maxHeartRateBpm', kind: 'number', nullable: true },
  // cadence / steps / power
  { key: 'avgCadenceSpm', kind: 'number', nullable: true },
  { key: 'avgCadenceRpm', kind: 'number', nullable: true },
  { key: 'steps', kind: 'number', nullable: true },
  { key: 'avgPowerWatts', kind: 'number', nullable: true },
  // free / diagnostic slots
  { key: 'additionalMetrics', kind: 'object', nullable: true },
  { key: 'warnings', kind: 'array', nullable: true },
  { key: 'rawOcrText', kind: 'string', nullable: true },
];

/** A minimal fake image blob (the mock ignores content but takes a Blob). */
function fakeBlob(): any {
  return {
    getBytes: jest.fn((): number[] => [1, 2, 3, 4]),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/** Assert a value matches the declared kind (when non-null). */
function matchesKind(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case 'number':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      // free map: a non-null, non-array object.
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
  }
}

describe('ocrMock.recognize returns the full REAL 25-key OcrMetrics', () => {
  it('returns an object', () => {
    const result = ocrMock.recognize(fakeBlob());
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  it('has exactly the 25 contract keys present (no more, no fewer)', () => {
    // Roster sanity + behaviour in one: the roster is 25 unique keys AND the
    // recognizer output is precisely that key set. Fails on the stub (throws).
    expect(CONTRACT_KEYS).toHaveLength(25);
    expect(new Set(CONTRACT_KEYS.map((k) => k.key)).size).toBe(25);
    const result = ocrMock.recognize(fakeBlob()) as unknown as Record<
      string,
      unknown
    >;
    for (const { key } of CONTRACT_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
    }
    expect(Object.keys(result).sort()).toEqual(
      CONTRACT_KEYS.map((k) => String(k.key)).sort()
    );
  });

  it('each key has the correct runtime type (or null where nullable)', () => {
    const result = ocrMock.recognize(fakeBlob()) as unknown as Record<
      string,
      unknown
    >;
    for (const { key, kind, nullable } of CONTRACT_KEYS) {
      const value = result[key as string];
      if (value === null) {
        expect(nullable).toBe(true);
      } else {
        expect(matchesKind(value, kind)).toBe(true);
      }
    }
  });

  it('always-present provenance fields are non-null: imageHash, source, confidence', () => {
    const result = ocrMock.recognize(fakeBlob()) as unknown as Record<
      string,
      unknown
    >;
    expect(typeof result.imageHash).toBe('string');
    expect(result.imageHash).not.toBeNull();
    expect(typeof result.source).toBe('string');
    expect(result.source).not.toBeNull();
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).not.toBeNull();
  });
});

describe('ocrMock / ocrClient interface parity (Phase 6 swap guard)', () => {
  it('mock and real produce the identical OcrMetrics key set (structural parity)', () => {
    // The Phase-6 swap guard: mock and real must emit the SAME 25-key shape so
    // swapping implementations needs no caller change. Both are exercised, so
    // this fails RED on the NotImplemented stub of ocrClient (and on any future
    // shape drift).
    const mock: OcrRecognizer = ocrMock;
    const real: OcrRecognizer = ocrClient;
    const mockKeys = Object.keys(
      mock.recognize(fakeBlob()) as unknown as Record<string, unknown>
    ).sort();
    const realKeys = Object.keys(
      real.recognize(fakeBlob()) as unknown as Record<string, unknown>
    ).sort();
    expect(mockKeys).toEqual(realKeys);
    expect(mockKeys).toHaveLength(25);
  });
});
