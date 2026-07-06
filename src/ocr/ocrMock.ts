/**
 * src/ocr/ocrMock.ts — mock OCR recognizer (Phase 1–5 stand-in).
 *
 * Implements the SAME `OcrRecognizer` contract as the real `ocrClient`, so the
 * router builds against a stable interface and Phase 6 swaps mock→real with no
 * caller changes. Phase 1 tests drive this to return configurable 25-key
 * `OcrMetrics` (e.g. `activeCaloriesKcal=200`) exercising the calorie rule.
 *
 * SCAFFOLD (Phase 1): stub only — body throws NotImplemented. The test-author's
 * RED tests define the configurable-result behaviour that GREEN fills.
 */

import type { OcrRecognizer } from './ocrClient';
import type { OcrMetrics } from '../types/ocrMetrics';

/**
 * Mock recognizer used until the real OCR service is provisioned (Phase 6).
 * Same contract as `ocrClient`.
 */
export const ocrMock: OcrRecognizer = {
  recognize(image: GoogleAppsScript.Base.Blob): OcrMetrics {
    void image;
    // Deterministic default 25-key reading modelling a Strava run (research
    // §"OcrResult" example). Router/rule tests spy-override this return, so the
    // default only needs every contract key present with the correct runtime
    // type (parity guard: same shape as the real client). Calorie-rule inputs
    // (`activeCaloriesKcal=200`) keep the default a PASSING submission.
    return {
      imageHash:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      source: 'strava',
      confidence: 0.9,
      activityType: 'run',
      activityDateISO: '2026-07-04',
      activityDateRaw: null,
      startTimeLocal: null,
      endTimeLocal: null,
      elapsedTimeSec: null,
      movingTimeSec: null,
      distanceKm: null,
      avgPaceSecPerKm: null,
      avgSpeedKph: null,
      elevationGainM: null,
      activeCaloriesKcal: 200,
      totalCaloriesKcal: null,
      avgHeartRateBpm: null,
      maxHeartRateBpm: null,
      avgCadenceSpm: null,
      avgCadenceRpm: null,
      steps: null,
      avgPowerWatts: null,
      additionalMetrics: null,
      warnings: null,
      rawOcrText: null,
    };
  },
};
