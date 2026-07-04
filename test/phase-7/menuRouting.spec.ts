/**
 * test/phase-7/menuRouting.spec.ts — phase-local integration: rich-menu postback
 * routing through handlePostback.
 *
 * RED-first (Phase 7 FINAL, TDD). Drives handlePostback over stateful GAS doubles
 * with ONLY the LINE reply seam mocked, exercising the REAL Phase-7 branches
 * (which call buildTriggerCard / buildSummaryCard / resolveEmployeeName / the
 * confirm write path — all throw NotImplemented now → RED, GREEN after FILL).
 * Asserts BEHAVIOR from PLAN Phase 7 acceptance (lines 160, 162):
 *
 *   - action=help    → reply is the TRIGGER card (how-to "วิธีส่งรูป" + cameraRoll).
 *   - action=summary → reply is a SUMMARY card built from THAT user's counts +
 *     7-day dailies (summary line "สัปดาห์นี้…เดือนนี้…รวม…" + bar chart) and,
 *     being stats-only, carries NO save-ack "บันทึกแล้ว".
 *   - action=zzz (unknown) → NO reply AND does NOT throw (doPost stays 200).
 *   - action=confirm&id=… (normal write) → routes to the CONFIRM path (a
 *     submissions row is written + the success card replied) and NEVER to the
 *     help/summary branch. The success card is the terminal ack "บันทึกแล้ว" AND
 *     (per Phase 5 acceptance, PLAN line 122) carries the running summary line
 *     "สัปดาห์นี้ N · เดือนนี้ N · รวม N" + bar chart. The distinguisher between
 *     the two cards is therefore "บันทึกแล้ว" (success-only), NOT the summary
 *     line (which BOTH cards render) — see buildSuccessCard.
 *
 * MOCK suite: external boundaries mocked are (a) LINE reply and (b) the GAS
 * SpreadsheetApp + CacheService + LockService doubles. The routing logic
 * (parse action → branch → build card) runs REAL, so a mis-route genuinely fails
 * here. mock/real flag: GAS services have no cheap Node analogue → these stateful
 * doubles ARE the real boundary; the SAME assertions run. We never read the impl
 * bodies — only public signatures.
 */

import { handlePostback } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { stashSubmission } from '../../src/state/cacheStore';
import * as lineClient from '../../src/line/lineClient';
import { makeStashedContext } from '../support/stashFixture';

// Mock ONLY the LINE reply network seam. Sheet + Cache + Lock are stateful GAS
// doubles below; the Phase-7 routing + card builders run REAL.
jest.mock('../../src/line/lineClient');

// Neutralise the Phase-3 write-path lock wrapper so the confirm branch runs its
// body synchronously (so the confirm test exercises the real write path).
jest.mock('../../src/state/lock', () => ({
  LOCK_WAIT_MS: 10000,
  withScriptLock: <T>(fn: () => T): T => fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;

/** The canonical 14-col submissions / 3-col employees / 2-col roster headers. */
const SUBMISSIONS_HEADER = [
  'messageId',
  'userId',
  'name',
  'activityType',
  'activityDateISO',
  'submittedAtISO',
  'activeCaloriesKcal',
  'totalCaloriesKcal',
  'distanceKm',
  'source',
  'confidence',
  'status',
  'rejectReason',
  'imageHash',
];
const EMPLOYEES_HEADER = ['userId', 'name', 'registeredAtISO'];
const ROSTER_HEADER = ['userId', 'name'];

function subRow(values: Partial<Record<string, unknown>>): unknown[] {
  return SUBMISSIONS_HEADER.map((name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : ''
  );
}

interface FakeTab {
  rows: unknown[][];
  appendRow: jest.Mock;
}
function makeTab(header: unknown[], dataRows: unknown[][] = []): FakeTab {
  const rows: unknown[][] = [header, ...dataRows.map((r) => [...r])];
  const appendRow = jest.fn((r: unknown[]): void => {
    rows.push([...r]);
  });
  return { rows, appendRow };
}
function asSheet(tab: FakeTab): any {
  return {
    appendRow: tab.appendRow,
    getDataRange: jest.fn(() => ({
      getValues: jest.fn((): unknown[][] => tab.rows),
    })),
    getLastRow: jest.fn((): number => tab.rows.length),
  };
}

let submissionsTab: FakeTab;

/** Install the stateful GAS doubles. `existingSubmissions` seeds the user's rows. */
function installEnv(existingSubmissions: unknown[][] = []): void {
  submissionsTab = makeTab(SUBMISSIONS_HEADER, existingSubmissions);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER); // empty roster → placeholder fallback
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'submissions') return asSheet(submissionsTab);
      if (tabName === 'employees') return asSheet(employeesTab);
      if (tabName === 'roster') return asSheet(rosterTab);
      return null;
    }),
  });
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null =>
      key === 'SHEET_ID' ? 'sheet-abc' : null
    ),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  });
  // Stateful CacheService so the confirm-branch stash/retrieve works.
  const store = new Map<string, string>();
  g.CacheService.getScriptCache.mockReturnValue({
    put: jest.fn((k: string, v: string): void => {
      store.set(k, v);
    }),
    get: jest.fn((k: string): string | null =>
      store.has(k) ? (store.get(k) as string) : null
    ),
    remove: jest.fn((k: string): void => {
      store.delete(k);
    }),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  });
  g.LockService.getScriptLock.mockReturnValue({
    waitLock: jest.fn(),
    tryLock: jest.fn((): boolean => true),
    releaseLock: jest.fn(),
  });
}

/** The messages array of the single reply(...) call, stringified. */
function repliedJson(): string {
  expect(mockedLine.reply).toHaveBeenCalledTimes(1);
  const messages = mockedLine.reply.mock.calls[0][1];
  return JSON.stringify(messages);
}

/** A postback event with a given `data` payload. */
function postbackEvent(data: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'postback',
    replyToken: 'rt-1',
    source: { userId },
    postback: { data },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  installEnv();
});

describe('handlePostback — action=help routes to the trigger card', () => {
  it('replies the how-to trigger card (contains "วิธีส่งรูป" + cameraRoll)', () => {
    handlePostback(postbackEvent('action=help'));
    const json = repliedJson();
    expect(json).toContain('วิธีส่งรูป');
    expect(json).toContain('cameraRoll');
  });
});

describe('handlePostback — action=summary routes to the summary card', () => {
  it("replies a summary card built from THAT user's counts + 7-day dailies", () => {
    // Seed two recorded rows for U1 today so counts/dailies are non-trivial.
    const todayISO = '2026-07-04';
    installEnv([
      subRow({
        messageId: 'm1',
        userId: 'U1',
        activityDateISO: todayISO,
        activeCaloriesKcal: 200,
        status: 'recorded',
      }),
      subRow({
        messageId: 'm2',
        userId: 'U1',
        activityDateISO: todayISO,
        activeCaloriesKcal: 150,
        status: 'recorded',
      }),
    ]);

    handlePostback(postbackEvent('action=summary', 'U1'));

    const json = repliedJson();
    // Summary line uses the success-card separator convention (week/month/total).
    expect(json).toContain('สัปดาห์นี้');
    expect(json).toContain('เดือนนี้');
    expect(json).toContain('รวม');
    // No external URL — the chart is native Flex boxes (privacy-safe).
    expect(json.toLowerCase()).not.toContain('http');
    // DISTINGUISHER: the summary card is stats-only — it is NOT the write-path
    // ack, so it must NOT carry the "บันทึกแล้ว" save-confirmation headline (that
    // belongs to the confirm success card alone). Phase 5: both cards render the
    // summary line, so "บันทึกแล้ว" — not the summary — is what tells them apart.
    expect(json).not.toContain('บันทึกแล้ว');
  });
});

describe('handlePostback — unknown action is ignored gracefully', () => {
  it('action=zzz → NO reply and does NOT throw (doPost stays 200)', () => {
    expect(() => handlePostback(postbackEvent('action=zzz'))).not.toThrow();
    expect(mockedLine.reply).not.toHaveBeenCalled();
  });
});

describe('handlePostback — a normal confirm postback stays on the write path', () => {
  it('action=confirm&id=… writes the submission + replies the success card (ack + running summary), NOT help', () => {
    // Seed two prior recorded rows for U1 this week so the running summary on the
    // success card is non-zero + computable (Phase 5: count is taken AFTER the
    // new row is inserted, so week/total render ≥ 3 once this confirm writes).
    const todayISO = '2026-07-04';
    installEnv([
      subRow({
        messageId: 'p1',
        userId: 'U1',
        activityDateISO: todayISO,
        activeCaloriesKcal: 200,
        status: 'recorded',
      }),
      subRow({
        messageId: 'p2',
        userId: 'U1',
        activityDateISO: todayISO,
        activeCaloriesKcal: 150,
        status: 'recorded',
      }),
    ]);

    const cacheId = stashSubmission(makeStashedContext({ userId: 'U1' }));

    handlePostback(postbackEvent(`action=confirm&id=${cacheId}`, 'U1'));

    // POSITIVE (write path reached): a submissions row is written exactly once.
    // (RED on stubs: the write path calls resolveEmployeeName → NotImplemented,
    // so no row/append + no success card; GREEN after FILL with the empty-roster
    // placeholder fallback.)
    expect(submissionsTab.appendRow).toHaveBeenCalledTimes(1);

    const json = repliedJson();
    // POSITIVE (terminal ack): the success card is the "บันทึกแล้ว" save-ack —
    // this is the marker UNIQUE to the confirm success card (the summary card
    // never renders it), so it is the correct card distinguisher.
    expect(json).toContain('บันทึกแล้ว');
    // POSITIVE (running summary, Phase 5 acceptance PLAN line 122): the success
    // card ALSO shows the running summary line "สัปดาห์นี้ N · เดือนนี้ N · รวม N".
    // Asserting its presence (not absence) restores the Phase-5 contract this
    // spec previously contradicted. RED on the CURRENT impl (plain success card
    // with no summary); GREEN once the write path passes counts+dailyValues to
    // buildSuccessCard.
    expect(json).toContain('สัปดาห์นี้');
    // NEGATIVE: a confirm must never be mis-routed to the help/trigger branch.
    expect(json).not.toContain('วิธีส่งรูป'); // not the trigger card
  });
});
