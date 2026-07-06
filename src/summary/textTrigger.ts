/**
 * CR-2 text-trigger: keyword rule for on-demand summary via LINE text messages.
 *
 * Substring match on trimmed text — covers "สรุปออกกำลัง", "สรุป", "ขอสรุป",
 * "สรุปของฉัน". False-positive rate is low for a fitness bot.
 */

/** True when the trimmed message should route to the summary card (CR-2). */
export function isSummaryTextTrigger(text: string): boolean {
  return text.trim().includes('สรุป');
}
