/**
 * src/adapters/gasCrypto.ts — thin wrapper over GAS Utilities crypto/encoding.
 *
 * DI seam (research §2.1): pure-logic modules depend on this interface, not on
 * the `Utilities` global directly, so they stay unit-testable. The default
 * implementation delegates to `Utilities`; tests inject a fake.
 *
 * Phase 0: signatures only — bodies throw NotImplemented.
 */

/**
 * Crypto/encoding operations backed by GAS `Utilities`.
 * Byte arrays follow the GAS convention: signed bytes (-128..127).
 */
export interface GasCrypto {
  /** HMAC-SHA256(value, key) -> signed byte[]. */
  hmacSha256(value: string, key: string): number[];
  /** SHA-256 digest of a UTF-8 string -> signed byte[]. */
  sha256(value: string): number[];
  /** base64-encode a byte array. */
  base64Encode(bytes: number[]): string;
}

/** Real implementation delegating to the GAS `Utilities` global. */
export function createGasCrypto(): GasCrypto {
  return {
    hmacSha256: (value: string, key: string): number[] =>
      Utilities.computeHmacSha256Signature(value, key),
    sha256: (value: string): number[] =>
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value),
    base64Encode: (bytes: number[]): string => Utilities.base64Encode(bytes),
  };
}
