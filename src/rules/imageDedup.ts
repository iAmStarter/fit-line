/**
 * src/rules/imageDedup.ts — sha256 image dedup (Phase 3, anti-spam guard #1).
 *
 * Cost gate that runs BEFORE OCR: compute sha256(image bytes) locally, then look
 * the hash up system-wide in `submissions`. A byte-identical image that was ever
 * submitted (any user) → reject "รูปนี้เคยส่งแล้ว", OCR is never called
 * (OVERVIEW §6 fraud/DoS mitigation — shared/resent images).
 *
 * The hash is canonical hex of the 256-bit digest: each signed GAS byte is masked
 * to 0..255 and zero-padded to two hex digits, e.g. `[0, 1, -1, 2]` → `"0001ff02"`.
 * Deterministic → the same image always yields the same hash (dedup key).
 *
 * Scan home: the system-wide lookup lives in `sheetRepo.imageHashExists`
 * (single home for submissions scans); `isDuplicateImage` delegates to it so the
 * scan logic is not duplicated. Privacy: only the hash is stored, never the image.
 *
 * SCAFFOLD (Phase 3): signatures only — new bodies throw NotImplemented.
 */

import { imageHashExists } from '../sheet/sheetRepo';

/**
 * Compute the canonical sha256 hex of an image blob's bytes.
 *
 * Uses `Utilities.computeDigest(SHA_256, blob)` (GAS accepts a Blob directly and
 * serialises its bytes internally), then converts the signed byte[] to lowercase
 * hex via `(b & 0xff).toString(16).padStart(2, '0')`.
 *
 * @param image the image blob (from `getMessageContent`).
 * @returns the 64-char lowercase hex sha256 of the image bytes.
 */
export function sha256Hex(image: GoogleAppsScript.Base.Blob): string {
  // GAS digests a Blob directly (its bytes are serialised internally); the
  // @types overloads only list number[]/string, so cast the Blob through the
  // number[] overload. Deterministic → the same image always yields the same hex.
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    image as unknown as number[]
  );
  return digest.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
}

/**
 * Report whether an image with this hash was ever submitted (system-wide).
 *
 * Delegates to `sheetRepo.imageHashExists` (the single scan home) so an empty
 * sheet returns `false` (treated as not-duplicate, no crash) and the scan logic
 * is not duplicated here.
 *
 * @param imageHash canonical sha256 hex of the image (from `sha256Hex`).
 * @returns true iff a `submissions` row already carries this `imageHash`.
 */
export function isDuplicateImage(imageHash: string): boolean {
  return imageHashExists(imageHash);
}
