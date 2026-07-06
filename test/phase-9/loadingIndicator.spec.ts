/**
 * Loading indicator (post-deploy enhancement) — the bot shows the LINE "..."
 * typing animation the moment it receives an image, so the user can see it is
 * working during the synchronous OCR wait. Cosmetic + best-effort: it must
 * NEVER throw or affect message processing.
 */
import { startLoading } from '../../src/line/lineClient';

jest.mock('../../src/config/props', () => ({
  getProp: jest.fn(() => 'test-access-token'),
  PROP_KEYS: { LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN' },
}));

describe('startLoading (LINE loading indicator)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    fetchSpy = jest.fn(() => ({ getResponseCode: () => 200 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).UrlFetchApp = { fetch: fetchSpy };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Logger = { log: jest.fn() };
  });

  it('POSTs to the loading endpoint with chatId + loadingSeconds + Bearer', () => {
    startLoading('U123', 30);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/chat/loading/start');
    expect(opts.method).toBe('post');
    expect(opts.headers.Authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(opts.payload)).toEqual({
      chatId: 'U123',
      loadingSeconds: 30,
    });
  });

  it('defaults loadingSeconds to a valid value (5–60, multiple of 5)', () => {
    startLoading('U1');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].payload);
    expect(body.loadingSeconds % 5).toBe(0);
    expect(body.loadingSeconds).toBeGreaterThanOrEqual(5);
    expect(body.loadingSeconds).toBeLessThanOrEqual(60);
  });

  it('never throws when the request fails (best-effort, cosmetic)', () => {
    fetchSpy.mockImplementation(() => {
      throw new Error('network down');
    });
    expect(() => startLoading('U1')).not.toThrow();
  });
});
