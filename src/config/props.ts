/**
 * src/config/props.ts — Script Properties access (fail-fast config).
 *
 * All secrets/config live in GAS Script Properties (never hard-coded, never
 * committed). `getProp` throws with the key name if a required value is
 * missing so misconfiguration fails loudly at boot rather than silently.
 *
 * Phase 0: stubs only — bodies throw NotImplemented. Phase-later fills logic.
 */

/**
 * The five Script Property keys this bot requires.
 * UPPER_SNAKE constant keys (code-standards: config-key idiom).
 */
export const PROP_KEYS = {
  LINE_CHANNEL_SECRET: 'LINE_CHANNEL_SECRET',
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
  OCR_BASE_URL: 'OCR_BASE_URL',
  OCR_TOKEN: 'OCR_TOKEN',
  SHEET_ID: 'SHEET_ID',
} as const;

/** Union of the valid property key names. */
export type PropKey = (typeof PROP_KEYS)[keyof typeof PROP_KEYS];

/**
 * `UrlFetchApp.fetch` timeout (seconds) for the Fit-OCR `/v1/ocr` call — the ONE
 * knob for OCR latency tolerance.
 *
 * DECISION (Phase 6, 10→30): OVERVIEW originally locked `fetchTimeoutSeconds:10`
 * (SLA p95 2–3 s), but the upstream vision model can take up to 25 s before the
 * API itself returns 503. A 10 s GAS timeout would abort BEFORE the API on a
 * worst-case read; 30 s covers the full upstream 25 s while staying well within
 * the LINE reply-token TTL (~60 s). See research
 * docs/research/impl-phase-6-ocr-contract.md §"fetchTimeoutSeconds DECISION".
 */
export const OCR_FETCH_TIMEOUT_SEC = 30;

/**
 * Read a required Script Property.
 * @throws Error naming the missing key (fail-fast) when absent/empty.
 */
export function getProp(key: PropKey): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`Missing required Script Property: ${key}`);
  }
  return value;
}

/**
 * Read an optional Script Property, returning `undefined` (or a supplied
 * default) when absent. Does not throw on missing keys.
 */
export function getPropOptional(
  key: PropKey,
  defaultValue?: string
): string | undefined {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ?? defaultValue;
}

/**
 * Read an optional Script Property by arbitrary key name (non-required props such
 * as `MAX_BACKDATE_DAYS`, `DIAG_ENABLED`).
 */
export function getOptionalScriptProp(
  key: string,
  defaultValue?: string
): string | undefined {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ?? defaultValue;
}
