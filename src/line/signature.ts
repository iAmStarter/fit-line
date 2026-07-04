/**
 * src/line/signature.ts — LINE webhook signature verification (inbound auth).
 *
 * TRUST BOUNDARY (PLAN Phase 0 security): every inbound webhook MUST pass
 * signature verification. LINE sends `X-Line-Signature` =
 * base64(HMAC-SHA256(rawBody, channelSecret)). We recompute and full-string
 * compare (no per-char early return — timing-attack conscious).
 *
 * `body` MUST be the RAW request body string (hashing parsed JSON will not
 * match). Missing/empty signature -> false (never throw).
 *
 * Phase 0: signature-only stub — body throws NotImplemented.
 */

import { createGasCrypto, type GasCrypto } from '../adapters/gasCrypto';

/**
 * Verify a LINE webhook signature.
 *
 * @param body           raw request body (string, unparsed)
 * @param signature      value of the `X-Line-Signature` header (base64)
 * @param channelSecret  LINE channel secret
 * @param crypto         optional DI seam (defaults to real GAS crypto)
 * @returns              true iff the recomputed signature matches; false on
 *                       mismatch, empty signature, or empty body — never throws
 */
export function verifySignature(
  body: string,
  signature: string,
  channelSecret: string,
  crypto: GasCrypto = createGasCrypto()
): boolean {
  // Fail closed on absent inputs — never throw.
  if (!signature || !body || !channelSecret) {
    return false;
  }

  try {
    const computed = crypto.base64Encode(
      crypto.hmacSha256(body, channelSecret)
    );
    // Full-string compare: `===` inspects the whole value (no per-char early
    // return), keeping the check timing-attack conscious. A 1-char-different
    // equal-length signature must fail here.
    return computed === signature;
  } catch {
    return false;
  }
}
