/**
 * test/regression/signature.contract.spec.ts — CROSS-PHASE contract corpus.
 *
 * The LINE `X-Line-Signature` verify contract — the ENDPOINTS-surface coverage
 * for the `doPost` webhook. This suite is the growing regression corpus; it must
 * NOT depend on any phase-local fixture.
 *
 * REAL API suite flavour: the "external boundary" for signature verification is
 * the HMAC-SHA256 crypto primitive. Under GAS that is `Utilities`; under Jest we
 * make the harness delegate to Node's REAL `crypto` (real HMAC bytes, real
 * base64) — so this exercises the genuine algorithm, not a stub. The pinned
 * fixture is a real known-good (rawBody, channelSecret) -> signature pair
 * reproducing exactly what LINE computes.
 *
 * mock-vs-real is a FLAG (env FITWH_REAL_CRYPTO): both modes run the SAME
 * assertions. In "real" mode we override the GAS crypto with Node crypto (the
 * real primitive); in "mock" mode we inject a Node-backed fake via the DI arg.
 * Either way the algorithm under the seam is real HMAC-SHA256 — a broken
 * verifySignature impl fails.
 *
 * We never read the implementation body (stub throws NotImplemented) — only the
 * public signatures of verifySignature + doPost.
 */

import * as nodeCrypto from 'crypto';
import { verifySignature } from '../../src/line/signature';
import type { GasCrypto } from '../../src/adapters/gasCrypto';
import { doPost } from '../../src/main';
import { PROP_KEYS } from '../../src/config/props';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const USE_REAL_CRYPTO = process.env.FITWH_REAL_CRYPTO === '1';

/** LINE canonical signature: base64(HMAC-SHA256(rawBody, channelSecret)). */
function lineSignature(rawBody: string, channelSecret: string): string {
  return nodeCrypto
    .createHmac('sha256', channelSecret)
    .update(rawBody, 'utf8')
    .digest('base64');
}

/** GAS byte[] is signed (-128..127). */
function toSignedBytes(buf: Buffer): number[] {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

/** Node-backed fake GasCrypto for the DI seam (mock mode). */
function nodeBackedCrypto(): GasCrypto {
  return {
    hmacSha256: (value: string, key: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHmac('sha256', key).update(value, 'utf8').digest()
      ),
    sha256: (value: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHash('sha256').update(value, 'utf8').digest()
      ),
    base64Encode: (bytes: number[]): string =>
      Buffer.from(bytes.map((b) => b & 0xff)).toString('base64'),
  };
}

/** Point the GAS Utilities crypto at Node's real primitive (real mode). */
function installRealCryptoOnHarness(): void {
  g.Utilities.computeHmacSha256Signature.mockImplementation(
    (value: string, key: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHmac('sha256', key).update(value, 'utf8').digest()
      )
  );
  g.Utilities.base64Encode.mockImplementation(
    (data: number[] | string): string =>
      typeof data === 'string'
        ? Buffer.from(data, 'utf8').toString('base64')
        : Buffer.from(data.map((b) => b & 0xff)).toString('base64')
  );
}

/**
 * Resolve the crypto injection used by verifySignature calls. In "real" mode we
 * wire the harness globals and pass no DI arg (exercise the default GAS-backed
 * path); in "mock" mode we inject the Node-backed fake.
 */
function cryptoArg(): GasCrypto | undefined {
  if (USE_REAL_CRYPTO) {
    installRealCryptoOnHarness();
    return undefined;
  }
  return nodeBackedCrypto();
}

// ---- Pinned real LINE fixture (independent of any phase) ------------------
const CHANNEL_SECRET = 'contract_channel_secret_A1B2C3';
const RAW_BODY = JSON.stringify({
  destination: 'Uconformance01',
  events: [
    {
      type: 'message',
      replyToken: 'rt-1',
      source: { userId: 'Uuser1', type: 'user' },
      message: { id: '100000001', type: 'text', text: 'hi' },
    },
  ],
});
const KNOWN_GOOD_SIG = lineSignature(RAW_BODY, CHANNEL_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  if (USE_REAL_CRYPTO) installRealCryptoOnHarness();
});

describe(`X-Line-Signature verify contract [mode=${
  USE_REAL_CRYPTO ? 'real' : 'mock'
}]`, () => {
  it('accepts the known-good LINE signature for the exact raw body', () => {
    expect(
      verifySignature(RAW_BODY, KNOWN_GOOD_SIG, CHANNEL_SECRET, cryptoArg())
    ).toBe(true);
  });

  it('rejects a signature computed with the wrong channel secret', () => {
    const wrong = lineSignature(RAW_BODY, 'wrong_secret');
    expect(verifySignature(RAW_BODY, wrong, CHANNEL_SECRET, cryptoArg())).toBe(
      false
    );
  });

  it('rejects when the raw body differs by a single byte', () => {
    const tampered = RAW_BODY.replace('"text":"hi"', '"text":"hI"');
    expect(
      verifySignature(tampered, KNOWN_GOOD_SIG, CHANNEL_SECRET, cryptoArg())
    ).toBe(false);
  });

  it('rejects an equal-length signature that differs only in the last char (full-string compare)', () => {
    const last = KNOWN_GOOD_SIG.slice(-1);
    const flipped = last === 'A' ? 'B' : 'A';
    const almost = KNOWN_GOOD_SIG.slice(0, -1) + flipped;
    expect(almost).toHaveLength(KNOWN_GOOD_SIG.length);
    expect(verifySignature(RAW_BODY, almost, CHANNEL_SECRET, cryptoArg())).toBe(
      false
    );
  });

  it('rejects an empty signature and never throws', () => {
    expect(() =>
      verifySignature(RAW_BODY, '', CHANNEL_SECRET, cryptoArg())
    ).not.toThrow();
    expect(verifySignature(RAW_BODY, '', CHANNEL_SECRET, cryptoArg())).toBe(
      false
    );
  });
});

describe(`doPost webhook endpoint contract [mode=${
  USE_REAL_CRYPTO ? 'real' : 'mock'
}]`, () => {
  /** Wire Script Properties + real crypto so doPost can verify a live sig. */
  function wireDoPost(): void {
    g.PropertiesService.getScriptProperties.mockReturnValue({
      getProperty: jest.fn((key: string): string | null =>
        key === PROP_KEYS.LINE_CHANNEL_SECRET ? CHANNEL_SECRET : null
      ),
      setProperty: jest.fn(),
      getProperties: jest.fn(() => ({
        [PROP_KEYS.LINE_CHANNEL_SECRET]: CHANNEL_SECRET,
      })),
    });
    installRealCryptoOnHarness();
  }

  function makeEvent(rawBody: string, signature?: string): any {
    const e: any = {
      postData: { contents: rawBody, type: 'application/json' },
      parameter: {},
    };
    if (signature !== undefined) {
      e.headers = { 'x-line-signature': signature };
      e.parameter = { 'X-Line-Signature': signature };
    }
    return e;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    wireDoPost();
  });

  it('returns HTTP 200 (a TextOutput) for a validly-signed webhook body', () => {
    const out = doPost(makeEvent(RAW_BODY, KNOWN_GOOD_SIG));
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
    expect(out).toBeTruthy();
  });

  it('returns HTTP 200 for an INVALID signature (LINE always gets 200)', () => {
    const out = doPost(makeEvent(RAW_BODY, 'bad-signature'));
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
    expect(out).toBeTruthy();
  });

  it('does NOT emit any outbound call when the signature is invalid', () => {
    doPost(makeEvent(RAW_BODY, 'bad-signature'));
    expect(g.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('never throws out of doPost even on a malformed event', () => {
    expect(() => doPost({ parameter: {} } as any)).not.toThrow();
  });
});
