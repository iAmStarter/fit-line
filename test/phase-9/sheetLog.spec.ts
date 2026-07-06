/**
 * Sheet event log — one append-only row per processed event into the `logs`
 * tab, so the owner can see traffic/errors without the editor. Best-effort:
 * no-op without SHEET_ID / logs tab, and NEVER throws.
 */
jest.mock('../../src/config/props', () => ({
  getPropOptional: jest.fn(),
  PROP_KEYS: {},
}));

import { logToSheet } from '../../src/sheet/sheetLog';
import { getPropOptional } from '../../src/config/props';

describe('logToSheet', () => {
  let appendRow: jest.Mock;
  let getSheetByName: jest.Mock;

  beforeEach(() => {
    appendRow = jest.fn();
    getSheetByName = jest.fn(() => ({ appendRow }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).SpreadsheetApp = {
      openById: jest.fn(() => ({ getSheetByName })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Logger = { log: jest.fn() };
  });

  it('appends [ts, level, event, userId, messageId, detail] to the logs tab', () => {
    (getPropOptional as jest.Mock).mockReturnValue('SHEET_ID_123');
    logToSheet('info', 'recorded', 'U1', 'm1', 'cal=200');
    expect(getSheetByName).toHaveBeenCalledWith('logs');
    expect(appendRow).toHaveBeenCalledTimes(1);
    const row = appendRow.mock.calls[0][0];
    expect(typeof row[0]).toBe('string'); // ISO timestamp
    expect(row.slice(1)).toEqual(['info', 'recorded', 'U1', 'm1', 'cal=200']);
  });

  it('no-ops when SHEET_ID is unset', () => {
    (getPropOptional as jest.Mock).mockReturnValue(undefined);
    logToSheet('info', 'x');
    expect(appendRow).not.toHaveBeenCalled();
  });

  it('never throws on a Sheet error', () => {
    (getPropOptional as jest.Mock).mockReturnValue('SHEET_ID_123');
    getSheetByName.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => logToSheet('error', 'x', 'U', 'm', 'd')).not.toThrow();
  });
});
