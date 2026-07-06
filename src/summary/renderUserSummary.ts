/**
 * Shared summary render — used by rich-menu postback and CR-2 text trigger.
 */

import { countSubmissions, recentDailyValues } from '../sheet/sheetRepo';
import { buildSummaryCard } from '../line/flex/summary';

/** Today's date-only string in Asia/Bangkok (`yyyy-MM-dd`). */
export function bangkokTodayISO(): string {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}

/**
 * Build the on-demand summary Flex message for a user (week/month/total + chart).
 * @param userId LINE user id whose recorded submissions are tallied.
 */
export function renderUserSummaryCard(userId: string): object {
  const todayISO = bangkokTodayISO();
  const counts = countSubmissions(userId, todayISO);
  const daily = recentDailyValues(userId, todayISO);
  return buildSummaryCard(counts, daily, todayISO);
}
