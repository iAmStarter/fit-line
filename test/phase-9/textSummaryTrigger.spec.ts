/**
 * test/phase-9/textSummaryTrigger.spec.ts — CR-2 text-trigger summary.
 *
 * Keyword `"สรุป"` (substring, trimmed) routes text messages to the same
 * on-demand summary card as rich-menu `action=summary`. Non-matching text is
 * ignored (no reply, no OCR).
 */

import { handleTextMessage, routeWebhook } from '../../src/main';
import type { LineWebhookEvent } from '../../src/main';
import { isSummaryTextTrigger } from '../../src/summary/textTrigger';
import * as lineClient from '../../src/line/lineClient';
import { ocrMock } from '../../src/ocr/ocrMock';

jest.mock('../../src/line/lineClient');

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const mockedLine = lineClient as jest.Mocked<typeof lineClient>;

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
}
function makeTab(header: unknown[], dataRows: unknown[][] = []): FakeTab {
  return { rows: [header, ...dataRows.map((r) => [...r])] };
}
function asSheet(tab: FakeTab): any {
  return {
    getDataRange: jest.fn(() => ({
      getValues: jest.fn((): unknown[][] => tab.rows),
    })),
    getLastRow: jest.fn((): number => tab.rows.length),
  };
}

function installEnv(existingSubmissions: unknown[][] = []): void {
  const submissionsTab = makeTab(SUBMISSIONS_HEADER, existingSubmissions);
  const employeesTab = makeTab(EMPLOYEES_HEADER);
  const rosterTab = makeTab(ROSTER_HEADER);
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
}

function textEvent(text: string, userId = 'U1'): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: 'rt-text',
    source: { userId },
    message: { id: 'msg-t1', type: 'text', text },
  };
}

function repliedJson(): string {
  expect(mockedLine.reply).toHaveBeenCalledTimes(1);
  return JSON.stringify(mockedLine.reply.mock.calls[0][1]);
}

beforeEach(() => {
  jest.clearAllMocks();
  installEnv([
    subRow({
      messageId: 'm1',
      userId: 'U1',
      activityDateISO: '2026-07-08',
      activeCaloriesKcal: 180,
      status: 'recorded',
    }),
  ]);
  g.Utilities.formatDate.mockImplementation(
    (_date: Date, timeZone: string, pattern: string): string => {
      if (pattern === 'yyyy-MM-dd' && timeZone === 'Asia/Bangkok') {
        return '2026-07-08';
      }
      return '2026-07-08';
    }
  );
  mockedLine.reply.mockImplementation(() => undefined);
});

describe('isSummaryTextTrigger — keyword rule', () => {
  it.each([
    'สรุปออกกำลัง',
    'สรุป',
    '  ขอสรุป  ',
    'สรุปของฉัน',
  ])('matches "%s"', (text) => {
    expect(isSummaryTextTrigger(text)).toBe(true);
  });

  it.each(['hello', 'ออกกำลัง', ''])('does not match "%s"', (text) => {
    expect(isSummaryTextTrigger(text)).toBe(false);
  });
});

describe('handleTextMessage — CR-2 summary trigger', () => {
  it('"สรุปออกกำลัง" → summary card (week/month/total, no save-ack)', () => {
    handleTextMessage(textEvent('สรุปออกกำลัง'));
    const json = repliedJson();
    expect(json).toContain('สัปดาห์นี้');
    expect(json).toContain('เดือนนี้');
    expect(json).toContain('รวม');
    expect(json).not.toContain('บันทึกแล้ว');
  });

  it('non-matching text → no reply', () => {
    handleTextMessage(textEvent('สวัสดี'));
    expect(mockedLine.reply).not.toHaveBeenCalled();
  });
});

describe('routeWebhook — text summary does not call OCR', () => {
  it('text "สรุป" routes to summary without OCR', () => {
    const spy = jest.spyOn(ocrMock, 'recognize');
    routeWebhook(
      JSON.stringify({
        destination: 'Ubot',
        events: [textEvent('สรุป')],
      })
    );
    expect(spy).not.toHaveBeenCalled();
    expect(mockedLine.reply).toHaveBeenCalled();
    spy.mockRestore();
  });
});
