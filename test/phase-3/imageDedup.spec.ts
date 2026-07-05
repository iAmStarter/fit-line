/**
 * test/phase-3/imageDedup.spec.ts — phase-local unit: sha256 image dedup guard.
 *
 * RED-first (Phase 3, TDD). BLIND against the frozen `imageDedup` stubs
 * (`sha256Hex` throws NotImplemented; `isDuplicateImage` delegates to the
 * `sheetRepo.imageHashExists` stub which also throws). Asserts BEHAVIOR from PLAN
 * Phase 3 acceptance (line 88) + impl-phase-3 §1–2:
 *
 *   - sha256Hex(blob) is DETERMINISTIC: the same image bytes → the same hex, and
 *     it is a 64-char lowercase hex string (256-bit digest). (SHA-256 property.)
 *   - sha256Hex(bytesA) !== sha256Hex(bytesB) for different bytes.
 *   - isDuplicateImage(h) returns EXACTLY what sheetRepo.imageHashExists(h)
 *     returns (delegation — the scan lives in the single sheetRepo home).
 *
 * MOCK suite: the external boundary is (a) GAS Utilities.computeDigest (the crypto
 * primitive) and (b) sheetRepo.imageHashExists (the Sheet scan). We mock the
 * Utilities digest to a DETERMINISTIC byte-derivation of the blob's bytes so the
 * "same in → same out / different in → different out" contract is genuinely
 * exercised (not papered over by an inert constant). sheetRepo is auto-mocked so
 * the delegation is asserted on the spy. mock/real flag: Utilities/Sheet have no
 * cheap Node analogue → the deterministic digest double IS the real boundary; the
 * SAME assertions run. We never read the impl body — only the signatures.
 */

import { sha256Hex, isDuplicateImage } from '../../src/rules/imageDedup';
import * as sheetRepo from '../../src/sheet/sheetRepo';

// The delegation target is the external boundary — mock ONLY it.
jest.mock('../../src/sheet/sheetRepo');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedSheet = sheetRepo as jest.Mocked<typeof sheetRepo>;

/** A minimal fake image blob carrying a fixed byte payload for hashing. */
function fakeBlob(bytes: number[]): any {
  return {
    getBytes: jest.fn((): number[] => bytes),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/**
 * Install a DETERMINISTIC computeDigest double: it derives 32 pseudo-digest bytes
 * from the blob's bytes (a stable, content-sensitive transform) so identical
 * bytes yield an identical digest and different bytes yield a different digest —
 * exactly the SHA-256 property the code relies on, without a real crypto lib.
 */
function installDeterministicDigest(): void {
  g.Utilities.computeDigest = jest.fn((_algo: unknown, value: any): number[] => {
    // Real GAS computeDigest takes a byte[] (or string), NOT a Blob — sha256Hex
    // passes `blob.getBytes()`. Accept a raw byte[] (the real contract); still
    // tolerate a Blob for any legacy caller.
    const bytes: number[] = Array.isArray(value)
      ? value
      : value && typeof value.getBytes === 'function'
        ? value.getBytes()
        : [];
    // Fold the content into 32 bytes deterministically; sign like GAS (-128..127).
    const out: number[] = [];
    for (let i = 0; i < 32; i++) {
      let acc = i * 31 + 7;
      for (let j = 0; j < bytes.length; j++) {
        acc = (acc * 131 + bytes[j] * (j + 1) + i) & 0xff;
      }
      // Map 0..255 into signed GAS byte range (-128..127).
      out.push(acc > 127 ? acc - 256 : acc);
    }
    return out;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installDeterministicDigest();
});

describe('sha256Hex — deterministic canonical hex', () => {
  it('same image bytes → the same hex (deterministic)', () => {
    const a = sha256Hex(fakeBlob([1, 2, 3, 4]));
    const b = sha256Hex(fakeBlob([1, 2, 3, 4]));
    expect(a).toBe(b);
  });

  it('is a 64-char lowercase hex string (256-bit digest)', () => {
    const hex = sha256Hex(fakeBlob([10, 20, 30, 40, 50]));
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different image bytes → different hex', () => {
    const a = sha256Hex(fakeBlob([1, 2, 3, 4]));
    const b = sha256Hex(fakeBlob([9, 9, 9, 9]));
    expect(a).not.toBe(b);
  });
});

// RED-GATE note: `isDuplicateImage` is ALREADY implemented (a one-line delegate:
// `return imageHashExists(imageHash)`) — only `sha256Hex` (above) and the
// delegation TARGET `imageHashExists` are the Phase-3 stubs. So these two
// delegation-contract tests are GREEN on the current tree BY DESIGN: they pass
// because the shipped delegation works, over the MOCKED target — exactly what a
// delegation contract should assert. They are not green-by-coincidence (the mock
// return is asserted to flow through). The genuinely-RED imageDedup behavior is
// `sha256Hex` (3 tests above) + `imageHashExists` (tested in sheetRepo.dedup.spec).
describe('isDuplicateImage — delegates to sheetRepo.imageHashExists', () => {
  it('returns true when imageHashExists(h) is true', () => {
    mockedSheet.imageHashExists.mockReturnValue(true);
    expect(isDuplicateImage('H')).toBe(true);
    expect(mockedSheet.imageHashExists).toHaveBeenCalledWith('H');
  });

  it('returns false when imageHashExists(h) is false', () => {
    mockedSheet.imageHashExists.mockReturnValue(false);
    expect(isDuplicateImage('H')).toBe(false);
    expect(mockedSheet.imageHashExists).toHaveBeenCalledWith('H');
  });
});
