/**
 * test/phase-5/disputeFlow.spec.ts — phase-local integration: the dispute
 * postback branch of handlePostback (action=dispute&mid=<id>).
 *
 * RED-first (Phase 5, TDD). Drives handlePostback through the REAL Phase-5 dispute
 * branch — the un-exported `buildDisputeAckCard` (throws NotImplemented) and the
 * real `logDispute` / `disputeExistsByMessageId` over a stateful SpreadsheetApp
 * double (incl. a `disputes` tab). Mocks ONLY the LINE reply network seam. So this
 * suite is RED now (those stubs throw NotImplemented) and GREEN after FILL.
 * Asserts BEHAVIOR from PLAN Phase 5 acceptance (line 124) + OVERVIEW §6/risk #8:
 *
 *   - a postback `action=dispute&mid=m1` → exactly ONE disputes row is appended
 *     AND handlePostback replies an ack card (emoji-free).
 *   - a REPEAT dispute for mid=m1 → still exactly ONE row (idempotent per
 *     messageId) AND still replies an ack.
 *
 * MOCK suite: external boundaries mocked are (a) LINE reply and (b) the GAS
 * SpreadsheetApp + LockService + CacheService doubles. The dispute-branch routing,
 * the logDispute idempotency, and the ack-card build run REAL — a broken branch
 * genuinely misbehaves here. mock/real flag: GAS services have no cheap Node
 * analogue → these stateful doubles ARE the real boundary; the SAME assertions
 * run. We never read the impl bodies — only signatures.
 */

import { handlePostback } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import * as lineClient from '../../src/line/lineClient';
import { expectNoEmoji } from '../support/noEmoji';

// Mock ONLY the LINE reply network seam. Sheet + Lock + Cache are stateful GAS
// doubles below; the dispute branch runs REAL.
jest.mock('../../src/line/lineClient');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;

/** A stateful in-memory tab: rows backing array + an appendRow spy. */
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

const DISPUTES_HEADER = [
  'messageId',
  'userId',
  'activityType',
  'reason',
  'disputedAtISO',
];

let disputesTab: FakeTab;

function installSheet(): void {
  disputesTab = makeTab(DISPUTES_HEADER);
  g.SpreadsheetApp.openById.mockReturnValue({
    getSheetByName: jest.fn((tabName: string): any => {
      if (tabName === 'disputes') return asSheet(disputesTab);
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
}

/** Stateful in-memory CacheService (inert here; the dispute branch skips it). */
function installStatefulCache(): void {
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
}

/** A dispute postback event carrying `action=dispute&mid=<mid>`. */
function disputeEvent(mid: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'postback',
    replyToken: 'reply-token-dispute',
    source: { userId },
    postback: { data: `action=dispute&mid=${mid}` },
  };
}

/** The single string payload reply() was last called with (stringified). */
function lastReplyPayload(): string {
  expect(mockedLine.reply).toHaveBeenCalled();
  const calls = mockedLine.reply.mock.calls;
  const [, messages] = calls[calls.length - 1];
  return JSON.stringify(messages);
}

beforeEach(() => {
  jest.clearAllMocks();
  installSheet();
  installStatefulCache();
  mockedLine.reply.mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handlePostback — dispute branch (log once + ack)', () => {
  it('a dispute postback appends exactly ONE disputes row and replies an ack', () => {
    expect(() => handlePostback(disputeEvent('m1'))).not.toThrow();

    expect(disputesTab.appendRow).toHaveBeenCalledTimes(1);
    const row = disputesTab.appendRow.mock.calls[0][0] as unknown[];
    expect(row[0]).toBe('m1'); // messageId column
    expect(row[1]).toBe('U1'); // userId column

    // an ack was replied, emoji-free
    const payload = lastReplyPayload();
    expectNoEmoji(payload);
  });

  it('replies an ack card (a flex message object)', () => {
    handlePostback(disputeEvent('m1'));
    const calls = mockedLine.reply.mock.calls;
    const [, messages] = calls[calls.length - 1];
    const arr = messages as Record<string, unknown>[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr[0]?.type).toBe('flex');
  });
});

describe('handlePostback — dispute branch (idempotent per messageId)', () => {
  it('a repeated dispute for mid=m1 → still ONE row, still replies an ack', () => {
    handlePostback(disputeEvent('m1')); // first: logs + acks
    handlePostback(disputeEvent('m1')); // repeat: no second log, still acks

    expect(disputesTab.appendRow).toHaveBeenCalledTimes(1);
    // still replied on the repeat (ack), emoji-free
    const payload = lastReplyPayload();
    expectNoEmoji(payload);
  });

  it('a dispute on a DIFFERENT messageId appends its own row', () => {
    handlePostback(disputeEvent('m1'));
    handlePostback(disputeEvent('m2'));
    expect(disputesTab.appendRow).toHaveBeenCalledTimes(2);
  });
});
