/**
 * test/support/stashFixture.ts — shared submission-context factory.
 *
 * The write path (Phase 2 `appendSubmission` / Phase 5 `buildSuccessCard`) and,
 * after CR-1 (Phase 8), the IMAGE path both operate on a submission-context
 * envelope `{ metrics, messageId, userId, imageHash }` — not bare OcrMetrics.
 *
 * CR-1 / Phase 8 note: the confirm-flow stash (`src/state/cacheStore.ts`) is being
 * deleted and the `StashedContext` type moved into `src/types/`. To keep this
 * fixture (and the unit suites that consume it — sheetRepo / successCard /
 * successSummary / identityMapping) independent of that move, the envelope shape
 * is declared STRUCTURALLY here (TypeScript structural typing: an object of this
 * shape satisfies the src signatures regardless of where the named type lives).
 * TEST fixture only; imports the OCR factory + the OcrMetrics type, never a src
 * implementation body.
 */

import { makeOcrMetrics } from './ocrFixture';
import type { OcrMetrics } from '../../src/types/ocrMetrics';

/**
 * Submission-context envelope: the OCR reading plus the LINE lineage
 * (`messageId`, `userId`) + `imageHash` that the `submissions` row + image-path
 * idempotency require. Structural mirror of the src `StashedContext` type.
 */
export interface SubmissionContext {
  metrics: OcrMetrics;
  messageId: string;
  userId: string;
  imageHash: string;
}

/**
 * Build a submission-context envelope. Defaults: a passing "Running, 200 kcal
 * active" reading (from makeOcrMetrics) with messageId 'm1' + userId 'U1' and an
 * imageHash derived from the messageId (`hash_<messageId>`) so distinct messages
 * carry distinct hashes by default. Override `metrics` via `metricsOverrides`,
 * or the envelope (incl. `imageHash`) via `overrides`.
 */
export function makeStashedContext(
  overrides: Partial<SubmissionContext> = {},
  metricsOverrides: Partial<OcrMetrics> = {}
): SubmissionContext {
  const messageId = overrides.messageId ?? 'm1';
  return {
    metrics: makeOcrMetrics(metricsOverrides),
    messageId,
    userId: 'U1',
    imageHash: `hash_${messageId}`,
    ...overrides,
  };
}
