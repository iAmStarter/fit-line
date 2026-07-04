/**
 * test/phase-0/signature.spec.ts — phase-local unit: verifySignature.
 *
 * RED-first (Phase 0, TDD). Asserts BEHAVIOR from PLAN Phase 0 acceptance +
 * qa focus ("full-string compare, no per-char early return; never throws"):
 *   - valid base64(HMAC-SHA256(body, secret)) == signature -> true
 *   - wrong sig -> false; missing/empty sig -> false; empty body+sig -> false
 *   - a 1-char-different sig of EQUAL length -> false (not prefix-early-return)
 *   - NEVER throws
 *
 * MOCK suite: we do NOT hit a real crypto boundary. We inject a fake
 * `GasCrypto` (the 4th DI arg) whose hmacSha256/base64Encode reproduce a
 * known-good LINE fixture computed with Node `crypto` inside the test. Because
 * the fixture is a real (body, secret) -> signature pair, a broken impl fails.
 *
 * We never read the implementation body (stub throws NotImplemented) — only the
 * public signature.
 */

import * as nodeCrypto from 'crypto';
import { verifySignature } from '../../src/line/signature';
import type { GasCrypto } from '../../src/adapters/gasCrypto';

/**
 * Compute LINE's canonical signature: base64(HMAC-SHA256(body, secret)).
 * Used to build the fixture AND to back the injected fake crypto so the
 * verify path exercises real bytes.
 */
function lineSignature(body: string, secret: string): string {
  return nodeCrypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

/** GAS byte[] is signed (-128..127). Convert an unsigned buffer to that. */
function toSignedBytes(buf: Buffer): number[] {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

/**
 * A fake GasCrypto backed by Node crypto — the injected DI seam for the MOCK
 * suite. hmacSha256 returns signed bytes; base64Encode re-encodes them.
 */
function fakeCrypto(): GasCrypto {
  return {
    hmacSha256: jest.fn((value: string, key: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHmac('sha256', key).update(value, 'utf8').digest()
      )
    ),
    sha256: jest.fn((value: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHash('sha256').update(value, 'utf8').digest()
      )
    ),
    base64Encode: jest.fn((bytes: number[]): string =>
      Buffer.from(bytes.map((b) => b & 0xff)).toString('base64')
    ),
  };
}

// A real, pinned LINE fixture: known (body, secret) -> known signature.
const SECRET = 'test_channel_secret_0123456789';
const BODY = JSON.stringify({
  destination: 'Uabcdef',
  events: [{ type: 'message', message: { id: 'm1', type: 'text' } }],
});
const VALID_SIG = lineSignature(BODY, SECRET);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('verifySignature — valid', () => {
  it('returns true when the signature is base64(HMAC-SHA256(body, secret))', () => {
    expect(verifySignature(BODY, VALID_SIG, SECRET, fakeCrypto())).toBe(true);
  });

  it('pins a real known-good pair (fixture computed with Node crypto)', () => {
    // Sanity: the fixture itself is a real HMAC (guards against a no-op impl
    // that returns true for anything).
    expect(VALID_SIG).toBe(lineSignature(BODY, SECRET));
    expect(verifySignature(BODY, VALID_SIG, SECRET, fakeCrypto())).toBe(true);
  });
});

describe('verifySignature — invalid / negative', () => {
  it('returns false when the signature is wrong (different value)', () => {
    const wrong = lineSignature(BODY, 'a_different_secret');
    expect(verifySignature(BODY, wrong, SECRET, fakeCrypto())).toBe(false);
  });

  it('returns false when the body was tampered (sig no longer matches)', () => {
    const tampered = BODY.replace('message', 'MESSAGE');
    expect(verifySignature(tampered, VALID_SIG, SECRET, fakeCrypto())).toBe(
      false
    );
  });

  it('returns false for a 1-char-different sig of EQUAL length (no prefix early-return)', () => {
    // Flip the LAST char of a valid, equal-length signature. A per-char impl
    // that early-returns on a matching prefix would wrongly accept; full-string
    // compare must reject.
    const last = VALID_SIG.slice(-1);
    const flipped = last === 'A' ? 'B' : 'A';
    const almost = VALID_SIG.slice(0, -1) + flipped;
    expect(almost).toHaveLength(VALID_SIG.length);
    expect(almost).not.toBe(VALID_SIG);
    expect(verifySignature(BODY, almost, SECRET, fakeCrypto())).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifySignature(BODY, '', SECRET, fakeCrypto())).toBe(false);
  });

  it('returns false for empty body + empty signature', () => {
    expect(verifySignature('', '', SECRET, fakeCrypto())).toBe(false);
  });
});

describe('verifySignature — robustness', () => {
  it('NEVER throws, even on garbage signature input', () => {
    expect(() =>
      verifySignature(BODY, '!!!not-base64!!!', SECRET, fakeCrypto())
    ).not.toThrow();
    expect(() => verifySignature('', '', '', fakeCrypto())).not.toThrow();
  });
});
