/**
 * Shared summary copy for success + on-demand summary cards.
 * Counts are DISTINCT activity days ("1 วัน = 1 ครั้ง", owner-approved 2026-07-05).
 */

import type { SubmissionCounts } from '../../types/ocrMetrics';
import { MUTED_COLOR } from './tokens';

/** Week / month / total line with explicit "วัน" unit. */
export function formatSummaryLine(counts: SubmissionCounts): string {
  return `สัปดาห์นี้ ${counts.week} วัน · เดือนนี้ ${counts.month} วัน · รวม ${counts.total} วัน`;
}

/** Empty-state coach when the user has no recorded days yet. */
export const SUMMARY_EMPTY_HINT =
  'ยังไม่มีบันทึก — ส่งรูปสรุปออกกำลังกายเพื่อเริ่มนับ';

/** Flex text node for the empty hint (muted, wrapped). */
export function summaryEmptyHintNode(): object {
  return {
    type: 'text',
    text: SUMMARY_EMPTY_HINT,
    size: 'sm',
    color: MUTED_COLOR,
    wrap: true,
  };
}
