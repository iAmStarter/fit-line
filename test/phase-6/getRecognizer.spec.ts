/**
 * test/phase-6/getRecognizer.spec.ts — Phase 6: mock↔real swap selector.
 *
 * `getRecognizer()` is the config-only swap point (PLAN Phase 6, OVERVIEW §7): it
 * returns the REAL `ocrClient` iff BOTH `OCR_BASE_URL` and `OCR_TOKEN` are present
 * (non-empty) in Script Properties, otherwise the dev `ocrMock`. The router calls
 * it so provisioning the OCR service (setting the two props) flips mock→real with
 * no caller change.
 *
 * External boundary mocked: the PropertiesService double (getProperty per key).
 * This selector is pure config logic (no network) — the SELECTION behaviour may
 * already be implemented on the stub (getRecognizer is not the NotImplemented
 * body), so some cases here can pass on stubs. That is EXPECTED for the selector
 * and is flagged in the report; the RED gate for Phase 6 is `ocrClient.recognize`
 * + the contract suite, not this pure selector.
 */

import { getRecognizer, ocrClient } from '../../src/ocr/ocrClient';
import { ocrMock } from '../../src/ocr/ocrMock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const BASE_URL = 'https://fit-ocr.example.test';
const TOKEN = 'iss_live_tok_abc123';

/** Install a PropertiesService double returning the given prop map. */
function installProps(props: Record<string, string | null>): void {
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null => props[key] ?? null),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRecognizer — real when provisioned, mock otherwise', () => {
  it('returns the REAL ocrClient when both OCR_BASE_URL and OCR_TOKEN are set', () => {
    installProps({ OCR_BASE_URL: BASE_URL, OCR_TOKEN: TOKEN });
    expect(getRecognizer()).toBe(ocrClient);
  });

  it('returns ocrMock when OCR_TOKEN is absent', () => {
    installProps({ OCR_BASE_URL: BASE_URL, OCR_TOKEN: null });
    expect(getRecognizer()).toBe(ocrMock);
  });

  it('returns ocrMock when OCR_BASE_URL is absent', () => {
    installProps({ OCR_BASE_URL: null, OCR_TOKEN: TOKEN });
    expect(getRecognizer()).toBe(ocrMock);
  });

  it('returns ocrMock when BOTH props are absent', () => {
    installProps({ OCR_BASE_URL: null, OCR_TOKEN: null });
    expect(getRecognizer()).toBe(ocrMock);
  });

  it('returns ocrMock when a prop is present but empty (not "non-empty")', () => {
    installProps({ OCR_BASE_URL: BASE_URL, OCR_TOKEN: '' });
    expect(getRecognizer()).toBe(ocrMock);
  });
});
