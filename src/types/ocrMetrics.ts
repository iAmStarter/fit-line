/**
 * src/types/ocrMetrics.ts — OCR result contract + shared domain types.
 *
 * `OcrMetrics` is the REAL 25-key `OcrResult` JSON the Fit-OCR API returns
 * (`POST /v1/ocr`; research docs/research/impl-phase-6-ocr-contract.md §"OcrResult
 * — the 25-key contract"). It is the SINGLE contract that both `ocrMock` and the
 * real `ocrClient` produce, so the mock↔real swap (Phase 6) is a pure
 * implementation change with no caller edits.
 *
 * Field typing rules (per the real contract):
 *   - Three fields are ALWAYS present (never null): `imageHash`, `source`,
 *     `confidence`.
 *   - Every other reading is `T | null` — absent data is `null`, never omitted.
 *   - Metric + ISO units throughout (seconds, km, kph, kcal, bpm, spm/rpm).
 *
 * Phase 6 realigned the shape from the Phase-1 invented names to the exact
 * owner-provided 25-key `OcrResult`. Business-logic fields
 * (`activeCaloriesKcal`, `totalCaloriesKcal`, `activityType`, `activityDateISO`,
 * `distanceKm`, `source`, `confidence`) were already correct and are unchanged,
 * so `calorieRule` / backdate / dedupDate / flex cards / `sheetRepo` compile
 * untouched.
 */

/**
 * The REAL 25-key `OcrResult` contract. Produced by `ocrMock` (dev stand-in) and
 * the real `ocrClient` (Phase 6) — identical shape, so swapping implementations
 * is transparent to every caller.
 *
 * Key order mirrors the contract table (research §"OcrResult"). `imageHash`,
 * `source`, `confidence` are always present; all others may be `null`.
 */
export interface OcrMetrics {
  // --- Provenance / quality (ALWAYS present, never null) -------------------
  /** `sha256:<64-hex>` of the raw image bytes — the server dedup key. */
  imageHash: string;
  /** App slug, e.g. "strava", "apple_fitness"; "unknown" if undetectable. */
  source: string;
  /** Overall OCR confidence score in [0, 1]. */
  confidence: number;

  // --- Activity identity (card + Phase 4 backdate/dedup) -------------------
  /** Activity type label, e.g. "run", "ride". */
  activityType: string | null;
  /** Activity date, ISO-8601 best-effort (year may be uncertain). */
  activityDateISO: string | null;
  /** Date exactly as shown pre-normalization (e.g. Thai Buddhist-era). */
  activityDateRaw: string | null;

  // --- Time metadata read from the screenshot ------------------------------
  /** Activity start time, local (as shown on the screenshot). */
  startTimeLocal: string | null;
  /** Activity end time, local (as shown on the screenshot). */
  endTimeLocal: string | null;
  /** Elapsed (wall-clock) time in seconds. */
  elapsedTimeSec: number | null;
  /** Moving time in seconds (Strava/Garmin only). */
  movingTimeSec: number | null;

  // --- Movement metrics ----------------------------------------------------
  /** Distance covered (km). */
  distanceKm: number | null;
  /** Average pace (seconds per km). */
  avgPaceSecPerKm: number | null;
  /** Average speed (km/h). */
  avgSpeedKph: number | null;
  /** Elevation gained (metres; may be negative). */
  elevationGainM: number | null;

  // --- Calorie readings (calorie-rule inputs) ------------------------------
  /** Active calories burned (kcal). Primary calorie-rule input. */
  activeCaloriesKcal: number | null;
  /** Total calories burned (kcal; Apple & Fitbit only). Fallback input. */
  totalCaloriesKcal: number | null;

  // --- Heart-rate metrics --------------------------------------------------
  /** Average heart rate (bpm). */
  avgHeartRateBpm: number | null;
  /** Maximum heart rate (bpm). */
  maxHeartRateBpm: number | null;

  // --- Cadence / steps / power --------------------------------------------
  /** Average cadence, steps per minute (running). */
  avgCadenceSpm: number | null;
  /** Average cadence, revolutions per minute (cycling). */
  avgCadenceRpm: number | null;
  /** Step count. */
  steps: number | null;
  /** Average power output (watts). */
  avgPowerWatts: number | null;

  // --- Free / diagnostic slots --------------------------------------------
  /** Free variable-key map (the only variable-key field). */
  additionalMetrics: Record<string, string | number> | null;
  /** Per-field warnings the OCR emitted, e.g. low-confidence flags. */
  warnings: string[] | null;
  /** Raw OCR text block, for audit/debug only (never surfaced in cards). */
  rawOcrText: string | null;
}

/**
 * Per-user submission tallies shown on the success card summary (Phase 5).
 * All counts are RECORDED-only. `week` = Monday→Sunday of the current week
 * (Asia/Bangkok); `month` = the current `yyyy-MM`; `total` = all recorded rows
 * for the user.
 */
export interface SubmissionCounts {
  /** Recorded submissions this week (Mon→Sun, Asia/Bangkok). */
  week: number;
  /** Recorded submissions this calendar month (current `yyyy-MM`). */
  month: number;
  /** All recorded submissions for the user, all time. */
  total: number;
}

/**
 * Result of a pure business rule (calorie / backdate / dedup, …).
 * `ok` = passed; on failure `reason` carries the human-facing coach line.
 */
export interface RuleResult {
  /** True iff the rule passed. */
  ok: boolean;
  /** Human-facing reason shown on the reject card when `ok` is false. */
  reason?: string;
}

/**
 * Build an empty 25-key `OcrMetrics`: every nullable reading `null`, the three
 * always-present fields defaulted (`imageHash` empty, `source` = param,
 * `confidence` = 0). This is the single canonical key-set constructor so
 * `ocrMock` and the real `ocrClient` cannot drift apart (Phase 6 swap parity).
 * The real client overlays parsed values on top of this shape; a missing field
 * from the API therefore stays `null` (graceful, no throw).
 *
 * @param source provenance label written to the always-present `source` field.
 */
export function emptyOcrMetrics(source: string): OcrMetrics {
  return {
    imageHash: '',
    source,
    confidence: 0,
    activityType: null,
    activityDateISO: null,
    activityDateRaw: null,
    startTimeLocal: null,
    endTimeLocal: null,
    elapsedTimeSec: null,
    movingTimeSec: null,
    distanceKm: null,
    avgPaceSecPerKm: null,
    avgSpeedKph: null,
    elevationGainM: null,
    activeCaloriesKcal: null,
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
}
