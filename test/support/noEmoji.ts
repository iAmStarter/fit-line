/**
 * test/support/noEmoji.ts — shared emoji-detection helper for UI assertions.
 *
 * UI hard rule (OVERVIEW §4, methodology rule 9): NO emoji codepoints anywhere
 * in any Flex/UI/product output. Every card builder test asserts its stringified
 * JSON is emoji-free. This helper centralises a broad Unicode emoji-range check
 * so all phases share one detector rather than re-deriving ranges per suite.
 *
 * IMPLEMENTATION NOTE: the project's tsconfig targets `es5`, so the RegExp `u`
 * flag (needed for astral-plane classes) is unavailable at compile time
 * (TS1501). We therefore scan codepoints via `codePointAt` and compare against
 * explicit numeric ranges — no `u`-flagged regex — which compiles under es5 and
 * still covers astral-plane emoji correctly.
 *
 * NOT logic-under-test — a pure test utility. It never imports from `src/`.
 */

/** [start, end] inclusive codepoint ranges that count as emoji/pictograph. */
const EMOJI_RANGES: Array<[number, number]> = [
  [0x1f000, 0x1faff], // Mahjong/Domino + all pictograph planes through Symbols-Ext-A
  [0x2600, 0x27bf], // Misc symbols + Dingbats
  [0x2b00, 0x2bff], // Misc symbols and arrows (stars, etc.)
  [0x1f1e6, 0x1f1ff], // Regional indicator letters (flags)
  [0xfe00, 0xfe0f], // Variation selectors (emoji-style presentation)
  [0x2122, 0x2122], // Trademark
  [0x2139, 0x2139], // Information source
  [0x23e9, 0x23fa], // Media control emoji
  [0x24c2, 0x24c2], // Circled M
  [0x25aa, 0x25fe], // Geometric shapes used as emoji
];

const ZWJ = 0x200d; // zero-width joiner (emoji sequences)
const KEYCAP = 0x20e3; // combining enclosing keycap

/** True iff `cp` falls in any emoji range (or is a ZWJ / keycap combiner). */
function isEmojiCodepoint(cp: number): boolean {
  if (cp === ZWJ || cp === KEYCAP) return true;
  for (const [start, end] of EMOJI_RANGES) {
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

/**
 * Return the first emoji codepoint found (rendered as a string, for readable
 * failure messages), or `null` when the string is clean. Iterates by codepoint
 * so astral-plane characters (surrogate pairs) are handled as one unit.
 */
export function firstEmoji(value: string): string | null {
  for (let i = 0; i < value.length; ) {
    const cp = value.codePointAt(i);
    if (cp === undefined) break;
    if (isEmojiCodepoint(cp)) {
      return String.fromCodePoint(cp);
    }
    i += cp > 0xffff ? 2 : 1; // advance past a surrogate pair when needed
  }
  return null;
}

/**
 * @param value any string (usually `JSON.stringify(flexMessage)`).
 * @returns true iff at least one emoji codepoint is present.
 */
export function containsEmoji(value: string): boolean {
  return firstEmoji(value) !== null;
}

/**
 * Jest assertion helper: fails if `value` contains any emoji, naming the
 * offending codepoint. Use in every card-builder suite.
 */
export function expectNoEmoji(value: string): void {
  const found = firstEmoji(value);
  expect({ hasEmoji: found !== null, offending: found }).toEqual({
    hasEmoji: false,
    offending: null,
  });
}
