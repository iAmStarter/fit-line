/**
 * test/phase-0/doPost.spec.ts — phase-local unit: doPost webhook entry.
 *
 * RED-first (Phase 0, TDD). Asserts BEHAVIOR from PLAN Phase 0 acceptance:
 *   - valid-signature body -> returns a ContentService TextOutput (HTTP 200):
 *     assert createTextOutput was called AND a truthy output is returned.
 *   - invalid/absent signature -> STILL returns 200 (LINE must always get 200)
 *     but downstream is NOT processed (log + ignore).
 *   - doPost NEVER throws out (wrap-and-return), even on malformed `e`.
 *
 * MOCK suite: the external boundary here is (a) Script Properties (channel
 * secret) and (b) GAS Utilities crypto — both driven via the harness so we
 * feed a REAL matching signature. We build a fake `e` with
 * `e.postData.contents = rawBody`. We do not read the doPost body (stub throws
 * NotImplemented) — only its public signature.
 */

import * as nodeCrypto from 'crypto';
import { doPost } from '../../src/main';
import { PROP_KEYS } from '../../src/config/props';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const SECRET = 'do_post_channel_secret_xyz';

/** LINE canonical signature over the raw body. */
function lineSignature(body: string, secret: string): string {
  return nodeCrypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

/** GAS byte[] is signed (-128..127). */
function toSignedBytes(buf: Buffer): number[] {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

/**
 * Wire the harness so doPost's real dependencies resolve:
 *  - PropertiesService returns the channel secret for LINE_CHANNEL_SECRET
 *  - Utilities.computeHmacSha256Signature / base64Encode delegate to Node
 *    crypto so a real matching signature verifies (whether doPost uses the
 *    default GAS-backed crypto or getProp under the hood).
 */
function wireHarness(secret: string): void {
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null =>
      key === PROP_KEYS.LINE_CHANNEL_SECRET ? secret : null
    ),
    setProperty: jest.fn(),
    getProperties: jest.fn(() => ({ [PROP_KEYS.LINE_CHANNEL_SECRET]: secret })),
  });

  g.Utilities.computeHmacSha256Signature.mockImplementation(
    (value: string, key: string): number[] =>
      toSignedBytes(
        nodeCrypto.createHmac('sha256', key).update(value, 'utf8').digest()
      )
  );
  g.Utilities.base64Encode.mockImplementation(
    (data: number[] | string): string => {
      if (typeof data === 'string') {
        return Buffer.from(data, 'utf8').toString('base64');
      }
      return Buffer.from(data.map((b) => b & 0xff)).toString('base64');
    }
  );
}

/** Build a fake GAS DoPost event with the raw body + optional signature header. */
function makeEvent(rawBody: string, signature?: string): any {
  const e: any = {
    postData: { contents: rawBody, type: 'application/json' },
    parameter: {},
    contextPath: '',
    queryString: '',
  };
  if (signature !== undefined) {
    // LINE delivers the sig via header; GAS exposes it here for the handler.
    e.headers = { 'x-line-signature': signature };
    e.parameter = { 'X-Line-Signature': signature };
  }
  return e;
}

const BODY = JSON.stringify({
  destination: 'Uxyz',
  events: [{ type: 'message', message: { id: 'm-1', type: 'text' } }],
});

beforeEach(() => {
  jest.clearAllMocks();
  wireHarness(SECRET);
});

describe('doPost — valid signature (HTTP 200 + processed)', () => {
  it('returns a truthy TextOutput via ContentService.createTextOutput', () => {
    const e = makeEvent(BODY, lineSignature(BODY, SECRET));
    const out = doPost(e);
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
    expect(out).toBeTruthy();
  });
});

describe('doPost — invalid / absent signature (STILL HTTP 200, NOT processed)', () => {
  it('returns 200 for an invalid signature', () => {
    const e = makeEvent(BODY, 'totally-wrong-signature');
    const out = doPost(e);
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
    expect(out).toBeTruthy();
  });

  it('returns 200 when the signature header is entirely absent', () => {
    const e = makeEvent(BODY); // no signature
    const out = doPost(e);
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
    expect(out).toBeTruthy();
  });

  it('does NOT process downstream on invalid signature (no outbound reply fetch)', () => {
    // Phase 0 skeleton does no routing, but the negative contract is: an
    // unverified request must not trigger any outbound LINE/OCR call.
    const e = makeEvent(BODY, 'totally-wrong-signature');
    doPost(e);
    expect(g.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });
});

describe('doPost — never throws out (wrap-and-return)', () => {
  it('returns 200 even when postData is missing (malformed event)', () => {
    const e: any = { parameter: {} }; // no postData at all
    expect(() => doPost(e)).not.toThrow();
    const out = doPost(e);
    expect(out).toBeTruthy();
    expect(g.ContentService.createTextOutput).toHaveBeenCalled();
  });

  it('returns 200 even when the body is empty', () => {
    const e = makeEvent('', '');
    expect(() => doPost(e)).not.toThrow();
    expect(doPost(e)).toBeTruthy();
  });
});
