/**
 * test/support/ocrFixture.ts — shared OcrMetrics factory for the unit suites.
 *
 * Produces a complete REAL 25-key `OcrMetrics` object (the owner-provided
 * `OcrResult` contract — docs/research/impl-phase-6-ocr-contract.md) with
 * sensible defaults so each test overrides only the fields it exercises (e.g.
 * `activeCaloriesKcal`). This is a TEST fixture, not logic-under-test; it imports
 * the type only (structural parity) and never a src implementation body.
 *
 * Phase 6 realigned this fixture from the Phase-1 invented names to the exact
 * 25-key contract. Defaults: the three always-present fields are set
 * (`imageHash`, `source`, `confidence`), `activeCaloriesKcal` = 200 and
 * `activityType`/`activityDateISO` populated so the default is a plausible
 * PASSING "Running, 200 kcal active" submission; every other reading is `null`.
 */

import type { OcrMetrics } from '../../src/types/ocrMetrics';

/**
 * Build a full REAL 25-key OcrMetrics reading. Defaults are a plausible passing
 * "Running, 200 kcal active" screenshot; pass a partial to override.
 */
export function makeOcrMetrics(
  overrides: Partial<OcrMetrics> = {}
): OcrMetrics {
  const base: OcrMetrics = {
    // --- always-present (never null) ---------------------------------------
    imageHash: 'sha256:' + '0'.repeat(64),
    source: 'strava',
    confidence: 0.9,
    // --- activity identity -------------------------------------------------
    activityType: 'run',
    activityDateISO: '2026-07-04',
    activityDateRaw: null,
    // --- time metadata -----------------------------------------------------
    startTimeLocal: null,
    endTimeLocal: null,
    elapsedTimeSec: null,
    movingTimeSec: null,
    // --- movement metrics --------------------------------------------------
    distanceKm: null,
    avgPaceSecPerKm: null,
    avgSpeedKph: null,
    elevationGainM: null,
    // --- calorie readings --------------------------------------------------
    activeCaloriesKcal: 200,
    totalCaloriesKcal: null,
    // --- heart-rate metrics ------------------------------------------------
    avgHeartRateBpm: null,
    maxHeartRateBpm: null,
    // --- cadence / steps / power ------------------------------------------
    avgCadenceSpm: null,
    avgCadenceRpm: null,
    steps: null,
    avgPowerWatts: null,
    // --- free / diagnostic slots ------------------------------------------
    additionalMetrics: null,
    warnings: null,
    rawOcrText: null,
  };
  return { ...base, ...overrides };
}
