/**
 * test/support/stashFixture.ts — shared StashedContext factory for Phase 2/3 tests.
 *
 * Phase 2 works on the confirm postback (write) path, which operates on the
 * `StashedContext` envelope ({ metrics, messageId, userId, imageHash }) — not
 * bare OcrMetrics. Phase 3 added `imageHash` (the sha256 hex computed at
 * image-time, carried to the postback so it lands in the submissions row). This
 * factory wraps the OCR fixture with sensible LINE lineage + a derived imageHash
 * so each dependent test overrides only what it exercises. TEST fixture only;
 * imports the type + the OCR factory, never a src implementation body.
 */

import type { StashedContext } from '../../src/state/cacheStore';
import { makeOcrMetrics } from './ocrFixture';
import type { OcrMetrics } from '../../src/types/ocrMetrics';

/**
 * Build a StashedContext envelope. Defaults: a passing "Running, 200 kcal
 * active" reading (from makeOcrMetrics) with messageId 'm1' + userId 'U1' and an
 * imageHash derived from the messageId (`hash_<messageId>`) so distinct messages
 * carry distinct hashes by default. Override `metrics` via `metricsOverrides`,
 * or the envelope (incl. `imageHash`) via `overrides`.
 */
export function makeStashedContext(
  overrides: Partial<StashedContext> = {},
  metricsOverrides: Partial<OcrMetrics> = {}
): StashedContext {
  const messageId = overrides.messageId ?? 'm1';
  return {
    metrics: makeOcrMetrics(metricsOverrides),
    messageId,
    userId: 'U1',
    imageHash: `hash_${messageId}`,
    ...overrides,
  };
}
