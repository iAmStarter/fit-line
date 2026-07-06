/**
 * src/sheet/sheetRepo.ts — Google Sheet datastore (submissions + employees).
 *
 * The trial datastore is a single Google Sheet (SHEET_ID in Script Properties)
 * with two tabs: `submissions` (14-col, OVERVIEW §5) and `employees` (3-col).
 * Phase 2 writes the confirm path:
 *   - `appendSubmission` maps a `StashedContext` → a `submissions` row.
 *   - `ensureEmployee` upserts the sender into `employees` (register once).
 *
 * Rows are written by HEADER-NAME mapping (read the header row, index columns by
 * name) so the write stays correct even if the column order changes — never
 * positional-by-guess. A null OCR reading is written as an empty cell (`''`),
 * never the string "null".
 *
 * Security (PLAN §Phase 2 STRIDE — data-store write): we write only server-side
 * values (from the stash + `now`), never a column value taken from the postback
 * payload — the user cannot steer what is recorded.
 *
 * SCAFFOLD (Phase 2): signatures only — bodies throw NotImplemented. Helper
 * seams (`getSheet`, `readRows`, `appendRowByHeader`) are declared so the GREEN
 * step fills logic without reshaping the public surface.
 */

import { getProp, PROP_KEYS } from '../config/props';
import type { StashedContext, SubmissionCounts } from '../types/ocrMetrics';

/** `submissions` tab name. */
const SUBMISSIONS_TAB = 'submissions';
/** `employees` tab name. */
const EMPLOYEES_TAB = 'employees';
/** `disputes` tab name (Phase 5 — admin dispute log). */
const DISPUTES_TAB = 'disputes';

/**
 * `roster` tab name (Phase 7 — real identity mapping). A 2-column tab
 * (`userId · name`) mapping a LINE user id to their real employee name so a
 * recorded submission carries the person's name instead of the placeholder
 * (OVERVIEW risk #5). Names are PII → they live in the Sheet only, never logged.
 */
export const ROSTER_TAB = 'roster';

/** Default status written for a freshly-recorded submission (PLAN Phase 2). */
const STATUS_RECORDED = 'recorded';

/**
 * Placeholder employee name used until real identity mapping lands (Phase 7).
 * v1 registers every new sender under this name (OVERVIEW §5 / risk #5).
 */
export const PLACEHOLDER_EMPLOYEE_NAME = '(ยังไม่ระบุชื่อ)';

/**
 * Resolve a LINE user id to a real employee name via the `roster` tab (Phase 7
 * identity mapping — replaces the bare placeholder, OVERVIEW risk #5).
 *
 * Looks up `userId` in the `roster` tab's `userId` column (resolved BY HEADER
 * NAME so a column reorder cannot break the match) and returns the matching
 * `name`. Every non-happy case degrades gracefully to `PLACEHOLDER_EMPLOYEE_NAME`
 * (never throws): a missing `roster` tab, an empty/header-only tab, a missing
 * column, a `userId` not present, or a matched-but-empty `name`. This keeps the
 * write path resilient when the roster is not yet populated (roster empty → every
 * submission records the placeholder — the acceptance's negative case).
 *
 * @param userId LINE user id to resolve to a real name.
 * @returns the mapped employee name, or `PLACEHOLDER_EMPLOYEE_NAME` on any miss.
 *
 * SCAFFOLD (Phase 7): signature only — body throws NotImplemented.
 */
export function resolveEmployeeName(userId: string): string {
  // A missing `roster` tab, an unset SHEET_ID, or ANY read failure must degrade
  // to the placeholder (never throw) so the write path stays resilient while the
  // roster is unpopulated (acceptance: roster empty → placeholder, no crash).
  const sheet = getSheetOrNull(ROSTER_TAB);
  if (!sheet) {
    return PLACEHOLDER_EMPLOYEE_NAME;
  }
  const rows = sheet.getDataRange().getValues();
  const header = rows[0] ?? [];
  // Resolve BOTH columns BY HEADER NAME so a column reorder cannot break the
  // match (never a positional guess). A missing column → placeholder.
  const userIdCol = header.indexOf('userId');
  const nameCol = header.indexOf('name');
  if (userIdCol === -1 || nameCol === -1) {
    return PLACEHOLDER_EMPLOYEE_NAME;
  }
  // Skip the header (index 0). A hit requires a matching userId AND a non-empty
  // name cell — a rostered-but-empty name degrades to the placeholder.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][userIdCol] !== userId) continue;
    const name = rows[i][nameCol];
    if (name !== '' && name !== null && name !== undefined) {
      return String(name);
    }
    return PLACEHOLDER_EMPLOYEE_NAME;
  }
  return PLACEHOLDER_EMPLOYEE_NAME;
}

/**
 * Open a tab of the configured spreadsheet by name.
 * @param tab tab (sheet) name, e.g. "submissions" / "employees".
 * @returns the tab as a GAS Sheet handle.
 * @throws if SHEET_ID is unset or the tab does not exist.
 */
function getSheet(tab: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sheetId = getProp(PROP_KEYS.SHEET_ID);
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheetByName(tab);
  if (!sheet) {
    throw new Error(`Sheet tab not found: ${tab}`);
  }
  return sheet;
}

/**
 * Read every value row of a tab (including the header row at index 0).
 * @param tab tab name to read.
 * @returns 2D array of cell values; row 0 is the header row.
 */
function readRows(tab: string): unknown[][] {
  return getSheet(tab).getDataRange().getValues();
}

/**
 * Report whether any data row of `tab` carries a non-empty `needle` under the
 * `columnName` column (resolved by HEADER NAME, so it stays correct if the
 * column order shifts). An empty/header-only sheet, a missing column, or an
 * empty `needle` → `false` (treated as no-match, no crash).
 *
 * @param tab        tab name to scan.
 * @param columnName header name of the column to match on.
 * @param needle     value to look for (empty needle → never matches).
 * @returns true iff a data row has a non-empty cell equal to `needle`.
 */
function columnHasValue(
  tab: string,
  columnName: string,
  needle: string
): boolean {
  if (needle === '') {
    return false;
  }
  const rows = readRows(tab);
  const header = rows[0] ?? [];
  const columnIndex = header.indexOf(columnName);
  if (columnIndex === -1) {
    return false;
  }
  // Skip the header (index 0); a non-empty cell equal to `needle` is a hit.
  for (let i = 1; i < rows.length; i++) {
    const cell = rows[i][columnIndex];
    if (cell !== '' && cell !== null && cell !== undefined && cell === needle) {
      return true;
    }
  }
  return false;
}

/**
 * Append a row to a tab, placing each named value under its header column.
 * Columns absent from `valuesByName` are written as empty cells (`''`).
 * @param tab          tab name to append to.
 * @param valuesByName map of header-name → cell value (null → empty cell).
 */
function appendRowByHeader(
  tab: string,
  valuesByName: Record<string, unknown>
): void {
  const sheet = getSheet(tab);
  const header = sheet.getDataRange().getValues()[0] ?? [];
  const row: unknown[] = header.map((columnName) => {
    const value = valuesByName[String(columnName)];
    // A missing/null reading becomes an empty cell ('') — never `null`, never
    // the string "null" (PLAN Phase 2 impl notes).
    return value === undefined || value === null ? '' : value;
  });
  sheet.appendRow(row);
}

/**
 * Append a confirmed submission as a row in the `submissions` tab.
 *
 * Maps `StashedContext` → the 14-column schema (OVERVIEW §5) by header name:
 * `messageId`, `userId`, `name` (resolved from the `roster` mapping, Phase 7 —
 * placeholder when the user isn't rostered), `activityType`, `activityDateISO`,
 * `submittedAtISO` (now), `activeCaloriesKcal`, `totalCaloriesKcal`, `distanceKm`,
 * `source`, `confidence`, `status` (recorded), `rejectReason` (empty),
 * `imageHash` (empty — populated Phase 3). Null OCR readings become empty cells.
 *
 * @param ctx    stashed submission context (OCR reading + LINE lineage).
 * @param status submission status; defaults to "recorded".
 */
export function appendSubmission(
  ctx: StashedContext,
  status: string = STATUS_RECORDED
): void {
  const m = ctx.metrics;
  appendRowByHeader(SUBMISSIONS_TAB, {
    messageId: ctx.messageId,
    userId: ctx.userId,
    // Phase 7: source the recorded name from the `roster` mapping (falls back to
    // PLACEHOLDER_EMPLOYEE_NAME when the user isn't in the roster) — never the
    // bare placeholder const, so a mapped user is recorded under their real name.
    name: resolveEmployeeName(ctx.userId),
    activityType: m.activityType,
    activityDateISO: m.activityDateISO,
    submittedAtISO: new Date().toISOString(),
    activeCaloriesKcal: m.activeCaloriesKcal,
    totalCaloriesKcal: m.totalCaloriesKcal,
    distanceKm: m.distanceKm,
    source: m.source,
    confidence: m.confidence,
    status,
    rejectReason: '',
    // Phase 3: the sha256 hex computed at image-time, carried through the stash.
    imageHash: ctx.imageHash,
  });
}

/**
 * Report whether a submission with the given `messageId` already exists.
 *
 * The idempotency check for LINE webhook redelivery (Phase 3): before the confirm
 * postback writes, the caller checks this under the script lock so a re-delivered
 * event does not create a duplicate row (OVERVIEW risk #4).
 *
 * Scans the `messageId` column (indexed by header name); an empty sheet
 * (header-only) → `false`.
 *
 * @param messageId the LINE message id to look up.
 * @returns true iff a `submissions` row already carries this `messageId`.
 *
 * SCAFFOLD (Phase 3): signature only — body throws NotImplemented.
 */
export function submissionExistsByMessageId(messageId: string): boolean {
  return columnHasValue(SUBMISSIONS_TAB, 'messageId', messageId);
}

/**
 * Report whether a submission with the given image hash already exists
 * (system-wide, any user).
 *
 * The single home for the image-dedup scan (Phase 3): `imageDedup.isDuplicateImage`
 * delegates here so the submissions scan logic is not duplicated. Scans the
 * `imageHash` column (indexed by header name); an empty sheet (header-only) →
 * `false` (treated as not-duplicate, no crash).
 *
 * @param imageHash canonical sha256 hex of the image (from `sha256Hex`).
 * @returns true iff a `submissions` row already carries this `imageHash`.
 *
 * SCAFFOLD (Phase 3): signature only — body throws NotImplemented.
 */
export function imageHashExists(imageHash: string): boolean {
  return columnHasValue(SUBMISSIONS_TAB, 'imageHash', imageHash);
}

/**
 * Report whether a RECORDED submission already exists for a (userId, activityDate)
 * pair — the no-duplicate business rule's Sheet lookup (Phase 4).
 *
 * Scans `submissions` (columns resolved by HEADER NAME so it survives a column
 * reorder) for a data row where ALL of: `userId` matches, `activityDateISO`
 * matches, AND `status === 'recorded'`. Only recorded rows count — a prior
 * REJECTED row for the same date must NOT block a later valid submission
 * (PLAN Phase 4 impl notes). An empty/header-only sheet or a missing column →
 * `false` (treated as no-match, no crash). `dedupDateRule` delegates here so the
 * submissions scan logic lives in one place.
 *
 * @param userId          LINE user id to match.
 * @param activityDateISO activity date (`yyyy-MM-dd`) to match.
 * @returns true iff a recorded `submissions` row exists for that user + date.
 *
 * SCAFFOLD (Phase 4): signature only — body throws NotImplemented.
 */
export function hasRecordedSubmission(
  userId: string,
  activityDateISO: string
): boolean {
  const rows = readRows(SUBMISSIONS_TAB);
  const header = rows[0] ?? [];
  // Resolve every needed column BY HEADER NAME so a column reorder cannot break
  // the match (never a positional guess).
  const userIdCol = header.indexOf('userId');
  const dateCol = header.indexOf('activityDateISO');
  const statusCol = header.indexOf('status');
  // A missing column → no reliable match possible → treat as no-match (no crash).
  if (userIdCol === -1 || dateCol === -1 || statusCol === -1) {
    return false;
  }
  // Skip the header (index 0). A hit requires ALL THREE: userId, activity date
  // (date-only), and status === 'recorded' — a REJECTED row must never block.
  for (let i = 1; i < rows.length; i++) {
    const rowUserId = rows[i][userIdCol];
    const rowDate = rows[i][dateCol];
    const rowStatus = rows[i][statusCol];
    const rowDateOnly = String(rowDate).split('T')[0];
    if (
      rowUserId === userId &&
      rowDateOnly === activityDateISO &&
      rowStatus === STATUS_RECORDED
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Register the sender in the `employees` tab if not already present (upsert).
 *
 * Scans `employees` for `userId`; appends `{ userId, name, registeredAtISO=now }`
 * only when absent, so a returning user is never duplicated (PLAN Phase 2).
 *
 * @param userId LINE user id (from the stashed context).
 * @param name   display name to register (v1: placeholder).
 */
export function ensureEmployee(userId: string, name: string): void {
  const rows = readRows(EMPLOYEES_TAB);
  // Skip the header row (index 0); userId is column 0 (OVERVIEW §5).
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      // Already registered — do not append a duplicate.
      return;
    }
  }
  getSheet(EMPLOYEES_TAB).appendRow([userId, name, new Date().toISOString()]);
}

/**
 * Tally a user's RECORDED submissions into week / month / total buckets (Phase 5
 * success-card summary).
 *
 * Buckets by `activityDateISO` (date-only, Asia/Bangkok), counting only rows
 * whose `status === 'recorded'`:
 *   - `week`  = rows whose activity date falls in Monday→Sunday of the week that
 *     contains `todayISO`.
 *   - `month` = rows whose activity date shares the same `yyyy-MM` as `todayISO`.
 *   - `total` = all recorded rows for the user, all time.
 *
 * Columns are resolved BY HEADER NAME (survives a column reorder). An
 * empty/header-only sheet or a missing column → all-zero counts (no crash). The
 * caller passes `todayISO` (computed once via `Utilities.formatDate(...,
 * 'Asia/Bangkok', 'yyyy-MM-dd')`) so this function needs no clock of its own.
 *
 * @param userId   LINE user id to tally.
 * @param todayISO today's date (`yyyy-MM-dd`, Asia/Bangkok) anchoring the windows.
 * @returns week / month / total counts of DISTINCT recorded activity days for the
 *          user (multiple workouts on one day count once — "1 วัน = 1 ครั้ง").
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function countSubmissions(
  userId: string,
  todayISO: string
): SubmissionCounts {
  const rows = readRows(SUBMISSIONS_TAB);
  const header = rows[0] ?? [];
  const userIdCol = header.indexOf('userId');
  const dateCol = header.indexOf('activityDateISO');
  const statusCol = header.indexOf('status');
  const empty: SubmissionCounts = { week: 0, month: 0, total: 0 };
  if (userIdCol === -1 || dateCol === -1 || statusCol === -1) {
    return empty;
  }

  const monday = mondayOfWeek(todayISO); // yyyy-MM-dd of this week's Monday
  const monthPrefix = todayISO.slice(0, 7); // yyyy-MM

  // Count DISTINCT activity DAYS per bucket, not rows: two workouts on the same
  // day count once ("1 วัน = 1 ครั้ง", owner-approved 2026-07-05). Duplicate rows
  // are still stored (calories preserved for the chart); only the tally collapses.
  const weekDays = new Set<string>();
  const monthDays = new Set<string>();
  const totalDays = new Set<string>();
  // Skip the header (index 0). Count RECORDED rows for THIS user only.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][userIdCol] !== userId) continue;
    if (rows[i][statusCol] !== STATUS_RECORDED) continue;
    const date = dateOnly(rows[i][dateCol]);
    totalDays.add(date);
    if (date.slice(0, 7) === monthPrefix) {
      monthDays.add(date);
    }
    // In-week = Monday(this week) <= date <= today (date-only string compare is
    // valid for yyyy-MM-dd).
    if (date >= monday && date <= todayISO) {
      weekDays.add(date);
    }
  }
  return { week: weekDays.size, month: monthDays.size, total: totalDays.size };
}

/**
 * Return a user's per-day summed calories for the last `days` activity dates
 * (default 7), oldest → newest (index 0 = oldest, last index = today), for the
 * native-Flex bar chart (Phase 5).
 *
 * For each date in `[todayISO - (days-1) .. todayISO]` (date-only, Asia/Bangkok),
 * the value is the sum over that user's RECORDED rows on that date of
 * `activeCaloriesKcal` (fallback `totalCaloriesKcal`, null → 0). A day with no
 * rows contributes 0. The returned array always has exactly `days` entries.
 * Columns are resolved BY HEADER NAME; an empty/header-only sheet or a missing
 * column → an all-zero array of length `days` (no crash).
 *
 * @param userId   LINE user id to aggregate.
 * @param todayISO today's date (`yyyy-MM-dd`, Asia/Bangkok) — the last bucket.
 * @param days     number of trailing days to return (default 7).
 * @returns an array of `days` per-day summed-calorie values, oldest → today.
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function recentDailyValues(
  userId: string,
  todayISO: string,
  days: number = 7
): number[] {
  // The window of dates, oldest → today (index 0 = today-(days-1), last = today).
  const windowDates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    windowDates.push(addDays(todayISO, -offset));
  }
  const dateIndex: Record<string, number> = {};
  windowDates.forEach((d, idx) => (dateIndex[d] = idx));

  const values = new Array<number>(days).fill(0);
  const rows = readRows(SUBMISSIONS_TAB);
  const header = rows[0] ?? [];
  const userIdCol = header.indexOf('userId');
  const dateCol = header.indexOf('activityDateISO');
  const statusCol = header.indexOf('status');
  const activeCol = header.indexOf('activeCaloriesKcal');
  const totalCol = header.indexOf('totalCaloriesKcal');
  if (userIdCol === -1 || dateCol === -1 || statusCol === -1) {
    return values;
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][userIdCol] !== userId) continue;
    if (rows[i][statusCol] !== STATUS_RECORDED) continue;
    const date = dateOnly(rows[i][dateCol]);
    const idx = dateIndex[date];
    if (idx === undefined) continue; // outside the trailing window
    const active = activeCol === -1 ? null : rows[i][activeCol];
    const totalKcal = totalCol === -1 ? null : rows[i][totalCol];
    values[idx] += calorieValue(active, totalKcal);
  }
  return values;
}

/** Coerce a cell to a number, treating '', null, undefined, NaN as absent. */
function numOrNull(cell: unknown): number | null {
  if (cell === '' || cell === null || cell === undefined) return null;
  const n = typeof cell === 'number' ? cell : Number(cell);
  return Number.isFinite(n) ? n : null;
}

/** Per-row calorie contribution: active ?? total ?? 0 (nulls → 0). */
function calorieValue(active: unknown, totalKcal: unknown): number {
  const a = numOrNull(active);
  if (a !== null) return a;
  const t = numOrNull(totalKcal);
  return t !== null ? t : 0;
}

/**
 * Date-only (`yyyy-MM-dd`) of a cell that may be an ISO string OR a JS `Date`.
 *
 * Google Sheets auto-coerces a written `"yyyy-MM-dd"` string into a date value,
 * so `getValues()` hands it back as a `Date` (not a string). `String(date)` is
 * `"Sat Jul 04 2026 …"` — no `'T'` — which used to leak through `.split('T')[0]`
 * and never match a `yyyy-MM-dd` window, silently zeroing week/month counts and
 * the chart while `total` (unconditional) stayed correct. Format any `Date` in
 * Asia/Bangkok (the sheet's timezone) to recover the intended calendar day.
 */
function dateOnly(cell: unknown): string {
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return String(cell).split('T')[0];
}

/**
 * Monday (`yyyy-MM-dd`) of the ISO-week containing `todayISO`. Monday=0 index:
 * JS getUTCDay() gives Sun=0..Sat=6; shift so Monday becomes 0.
 */
function mondayOfWeek(todayISO: string): string {
  const [y, m, d] = todayISO.split('-').map((s) => parseInt(s, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0..Sat=6
  const mondayOffset = (dow + 6) % 7; // days since Monday (Mon→0, Sun→6)
  return addDays(todayISO, -mondayOffset);
}

/** Add `delta` days to a `yyyy-MM-dd` date, returning `yyyy-MM-dd` (UTC-safe). */
function addDays(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map((s) => parseInt(s, 10));
  const t = Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000;
  const dt = new Date(t);
  const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
  const MM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}`;
}

/**
 * Report whether a dispute log entry already exists for a given `messageId`
 * (Phase 5 idempotency — 1 dispute per messageId).
 *
 * Scans the `disputes` tab's `messageId` column (indexed by header name). A
 * missing `disputes` tab, an empty/header-only sheet, or a missing column →
 * `false` (treated as not-yet-logged, no crash) so the first dispute can still
 * be appended.
 *
 * @param messageId the LINE message id to look up in the dispute log.
 * @returns true iff a `disputes` row already carries this `messageId`.
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function disputeExistsByMessageId(messageId: string): boolean {
  if (messageId === '') {
    return false;
  }
  // A missing `disputes` tab (getSheetByName → null) must be treated as
  // not-yet-logged, not a crash — so the first dispute can still be appended.
  const sheet = getSheetOrNull(DISPUTES_TAB);
  if (!sheet) {
    return false;
  }
  const rows = sheet.getDataRange().getValues();
  const header = rows[0] ?? [];
  const columnIndex = header.indexOf('messageId');
  if (columnIndex === -1) {
    return false;
  }
  // Skip the header (index 0); a non-empty cell equal to `messageId` is a hit.
  for (let i = 1; i < rows.length; i++) {
    const cell = rows[i][columnIndex];
    if (
      cell !== '' &&
      cell !== null &&
      cell !== undefined &&
      cell === messageId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Append a dispute log entry to the `disputes` tab — idempotent per `messageId`.
 *
 * Writes a row `{ messageId, userId, activityType, reason, disputedAtISO=now }`
 * ONLY when `disputeExistsByMessageId(messageId)` is false, so a repeated dispute
 * tap on the same message never double-logs (PLAN Phase 5 line 124). A null
 * `activityType` (not available at dispute time) is written as an empty cell.
 *
 * @param messageId    LINE message id the dispute concerns (idempotency key).
 * @param userId       LINE user id raising the dispute.
 * @param activityType rejected activity type, if known (null → empty cell).
 * @param reason       short reason/source tag for the dispute log.
 *
 * SCAFFOLD (Phase 5): signature only — body throws NotImplemented.
 */
export function logDispute(
  messageId: string,
  userId: string,
  activityType: string | null,
  reason: string
): void {
  // Idempotent per messageId: a repeated dispute tap on the same message must
  // never double-log.
  if (disputeExistsByMessageId(messageId)) {
    return;
  }
  appendRowByHeader(DISPUTES_TAB, {
    messageId,
    userId,
    // A null activityType (unknown at dispute time) → empty cell, never "null".
    activityType,
    reason,
    disputedAtISO: new Date().toISOString(),
  });
}

/**
 * Open a tab by name, returning `null` (not throwing) when SHEET_ID is unset or
 * the tab does not exist. Used for the optional `disputes` tab where a missing
 * tab must be a graceful no-match rather than a crash.
 */
function getSheetOrNull(
  tab: string
): GoogleAppsScript.Spreadsheet.Sheet | null {
  const sheetId = getProp(PROP_KEYS.SHEET_ID);
  if (!sheetId) {
    return null;
  }
  return SpreadsheetApp.openById(sheetId).getSheetByName(tab);
}
