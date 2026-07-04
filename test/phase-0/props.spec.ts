/**
 * test/phase-0/props.spec.ts — phase-local unit: Script Properties access.
 *
 * RED-first (Phase 0, TDD). Asserts BEHAVIOR from PLAN Phase 0 acceptance:
 *   - getProp: key present -> its string; missing/empty -> THROWS, message
 *     CONTAINS the key name (fail-fast at boot).
 *   - getPropOptional: missing -> default if given else undefined, never throws.
 *
 * We drive the harness by overriding
 * `PropertiesService.getScriptProperties().getProperty` per test. We never read
 * the implementation body (stub throws NotImplemented) — only its signature.
 */

import { getProp, getPropOptional, PROP_KEYS } from '../../src/config/props';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

/**
 * Install a fake Script Property store from a plain record. Absent keys return
 * `null` (GAS behaviour). Empty-string values are stored as-is so we can test
 * the empty -> throw branch.
 */
function stubProps(store: Record<string, string>): void {
  const getProperty = jest.fn((key: string): string | null =>
    Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
  );
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty,
    setProperty: jest.fn(),
    getProperties: jest.fn(() => ({ ...store })),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getProp (required — fail-fast)', () => {
  it('returns the stored string when the key is present', () => {
    stubProps({ [PROP_KEYS.LINE_CHANNEL_SECRET]: 'shhh-secret-123' });
    expect(getProp(PROP_KEYS.LINE_CHANNEL_SECRET)).toBe('shhh-secret-123');
  });

  it('returns the exact value for each of the five keys', () => {
    stubProps({
      LINE_CHANNEL_SECRET: 'sec',
      LINE_CHANNEL_ACCESS_TOKEN: 'tok',
      OCR_BASE_URL: 'https://ocr.example',
      OCR_TOKEN: 'ocr-tok',
      SHEET_ID: 'sheet-abc',
    });
    expect(getProp(PROP_KEYS.LINE_CHANNEL_SECRET)).toBe('sec');
    expect(getProp(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN)).toBe('tok');
    expect(getProp(PROP_KEYS.OCR_BASE_URL)).toBe('https://ocr.example');
    expect(getProp(PROP_KEYS.OCR_TOKEN)).toBe('ocr-tok');
    expect(getProp(PROP_KEYS.SHEET_ID)).toBe('sheet-abc');
  });

  it('THROWS with the key name in the message when the key is missing', () => {
    stubProps({}); // nothing set -> getProperty returns null
    expect(() => getProp(PROP_KEYS.SHEET_ID)).toThrow(/SHEET_ID/);
  });

  it('THROWS with the key name in the message when the value is empty string', () => {
    stubProps({ [PROP_KEYS.OCR_TOKEN]: '' });
    expect(() => getProp(PROP_KEYS.OCR_TOKEN)).toThrow(/OCR_TOKEN/);
  });

  it('names the specific missing key (not a generic message)', () => {
    stubProps({ [PROP_KEYS.LINE_CHANNEL_SECRET]: 'present' });
    let msg = '';
    try {
      getProp(PROP_KEYS.OCR_BASE_URL);
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toContain('OCR_BASE_URL');
    expect(msg).not.toContain('LINE_CHANNEL_SECRET');
  });
});

describe('getPropOptional (never throws)', () => {
  it('returns the stored string when present', () => {
    stubProps({ [PROP_KEYS.OCR_BASE_URL]: 'https://ocr.example' });
    expect(getPropOptional(PROP_KEYS.OCR_BASE_URL)).toBe('https://ocr.example');
  });

  it('returns undefined when the key is missing and no default given', () => {
    stubProps({});
    expect(getPropOptional(PROP_KEYS.OCR_TOKEN)).toBeUndefined();
  });

  it('returns the supplied default when the key is missing', () => {
    stubProps({});
    expect(getPropOptional(PROP_KEYS.OCR_BASE_URL, 'https://fallback')).toBe(
      'https://fallback'
    );
  });

  it('does NOT throw when the key is missing', () => {
    stubProps({});
    expect(() => getPropOptional(PROP_KEYS.SHEET_ID)).not.toThrow();
  });
});
