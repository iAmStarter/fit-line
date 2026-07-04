/**
 * test/phase-6/ocrClient.spec.ts — Phase 6 RED suite: real Fit-OCR client.
 *
 * RED-first (Phase 6, TDD). Drives `ocrClient.recognize(blob)` — the REAL client
 * whose body throws NotImplemented until GREEN — through the owner-provided
 * contract (docs/research/impl-phase-6-ocr-contract.md). External boundary mocked
 * is ONLY the network seam: GAS `UrlFetchApp.fetch`, plus the two Script
 * Properties (`OCR_BASE_URL`, `OCR_TOKEN`) via the PropertiesService double. Every
 * assertion below is a BEHAVIOUR from the contract, so this suite is RED now and
 * GREEN once the fetch/parse/error-map logic lands. We NEVER read the impl body.
 *
 * MOCK vs REAL: this is the MOCK suite — `UrlFetchApp` is a jest double (no
 * network). The SAME network-shape assertions run for real in
 * test/contract/ocr.contract.spec.ts against https://fit-ocr.istartsoft.dev when
 * `process.env.OCR_TOKEN` is set (that suite is the Phase-6 gate).
 *
 * Acceptance (contract §"POST /v1/ocr" + §"OcrResult 25-key"):
 *   - 200 + a real 25-key OcrResult JSON body → parsed OcrMetrics (numbers stay
 *     numbers, strings stay strings, imageHash a string).
 *   - request shape: POST `{BASE}/v1/ocr`, `Authorization: Bearer <token>`,
 *     multipart field `image`, fetchTimeoutSeconds = 30, muteHttpExceptions true.
 *   - 400 / 401 / 422 / 502 / 503 → throw; the thrown message NEVER contains the
 *     token string (no secret leak).
 *   - missing keys in a 200 body → defaulted to null (defensive); never throw on
 *     a 200.
 */

import { ocrClient, OCR_RECOGNIZE_PATH } from '../../src/ocr/ocrClient';
import { OCR_FETCH_TIMEOUT_SEC } from '../../src/config/props';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

const BASE_URL = 'https://fit-ocr.example.test';
const TOKEN = 'iss_live_SUPERSECRET_tok_abc123';

/** A minimal fake image blob (recognize forwards it to UrlFetchApp payload). */
function fakeBlob(bytes: number[] = [1, 2, 3, 4]): any {
  return {
    getBytes: jest.fn((): number[] => bytes),
    getContentType: jest.fn((): string => 'image/jpeg'),
  };
}

/** A full real 25-key OcrResult JSON body (contract §"OcrResult"). */
function fullOcrResultBody(): Record<string, unknown> {
  return {
    imageHash: 'sha256:' + 'a'.repeat(64),
    source: 'strava',
    confidence: 0.92,
    activityType: 'run',
    activityDateISO: '2026-07-04',
    activityDateRaw: '04 ก.ค. 2569',
    startTimeLocal: '06:10',
    endTimeLocal: '06:42',
    elapsedTimeSec: 1920,
    movingTimeSec: 1880,
    distanceKm: 5.2,
    avgPaceSecPerKm: 361,
    avgSpeedKph: 9.8,
    elevationGainM: 40,
    activeCaloriesKcal: 200,
    totalCaloriesKcal: 260,
    avgHeartRateBpm: 148,
    maxHeartRateBpm: 172,
    avgCadenceSpm: 168,
    avgCadenceRpm: null,
    steps: 6100,
    avgPowerWatts: 240,
    additionalMetrics: { trainingLoad: 42, effort: 'moderate' },
    warnings: ['low-confidence-distance'],
    rawOcrText: 'Running 5.2 km 200 kcal',
  };
}

/**
 * Install the two Script Properties (`OCR_BASE_URL`, `OCR_TOKEN`) the client
 * reads, and a UrlFetchApp.fetch double that returns the given HTTP status +
 * body. Returns the jest.fn for the fetch so the test can inspect the request.
 */
function installOcr(
  status: number,
  body: string
): jest.Mock {
  g.PropertiesService.getScriptProperties.mockReturnValue({
    getProperty: jest.fn((key: string): string | null => {
      if (key === 'OCR_BASE_URL') return BASE_URL;
      if (key === 'OCR_TOKEN') return TOKEN;
      return null;
    }),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  });

  const fetchFn = jest.fn((_url: string, _opts?: unknown) => ({
    getResponseCode: jest.fn((): number => status),
    getContentText: jest.fn((): string => body),
    getAllHeaders: jest.fn((): Record<string, string> => ({})),
    getBlob: jest.fn(),
  }));
  g.UrlFetchApp.fetch = fetchFn;
  return fetchFn;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ocrClient.recognize — 200 happy path (parse 25-key OcrResult)', () => {
  it('returns an OcrMetrics with every contract value parsed (numbers as number)', () => {
    installOcr(200, JSON.stringify(fullOcrResultBody()));

    const m = ocrClient.recognize(fakeBlob());

    expect(m.imageHash).toBe('sha256:' + 'a'.repeat(64));
    expect(typeof m.imageHash).toBe('string');
    expect(m.source).toBe('strava');
    expect(m.confidence).toBe(0.92);
    expect(typeof m.confidence).toBe('number');
    expect(m.activityType).toBe('run');
    expect(m.activityDateISO).toBe('2026-07-04');
    expect(m.activityDateRaw).toBe('04 ก.ค. 2569');
    expect(m.startTimeLocal).toBe('06:10');
    expect(m.endTimeLocal).toBe('06:42');
    expect(m.elapsedTimeSec).toBe(1920);
    expect(m.movingTimeSec).toBe(1880);
    expect(m.distanceKm).toBe(5.2);
    expect(m.avgPaceSecPerKm).toBe(361);
    expect(m.avgSpeedKph).toBe(9.8);
    expect(m.elevationGainM).toBe(40);
    expect(m.activeCaloriesKcal).toBe(200);
    expect(m.totalCaloriesKcal).toBe(260);
    expect(m.avgHeartRateBpm).toBe(148);
    expect(m.maxHeartRateBpm).toBe(172);
    expect(m.avgCadenceSpm).toBe(168);
    expect(m.avgCadenceRpm).toBeNull();
    expect(m.steps).toBe(6100);
    expect(m.avgPowerWatts).toBe(240);
    expect(m.additionalMetrics).toEqual({ trainingLoad: 42, effort: 'moderate' });
    expect(m.warnings).toEqual(['low-confidence-distance']);
    expect(m.rawOcrText).toBe('Running 5.2 km 200 kcal');
  });

  it('numeric readings are actual numbers, not strings', () => {
    installOcr(200, JSON.stringify(fullOcrResultBody()));
    const m = ocrClient.recognize(fakeBlob());
    expect(typeof m.distanceKm).toBe('number');
    expect(typeof m.activeCaloriesKcal).toBe('number');
    expect(typeof m.avgHeartRateBpm).toBe('number');
  });
});

describe('ocrClient.recognize — request shape (auth, url, transport, timeout)', () => {
  it('POSTs to {BASE}/v1/ocr with Bearer token, multipart image field, 30s timeout', () => {
    const fetchFn = installOcr(200, JSON.stringify(fullOcrResultBody()));

    ocrClient.recognize(fakeBlob());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0] as [string, any];

    expect(url).toBe(BASE_URL + OCR_RECOGNIZE_PATH);
    expect(url).toBe(BASE_URL + '/v1/ocr');
    expect(String(opts.method).toLowerCase()).toBe('post');
    expect(opts.headers.Authorization).toBe('Bearer ' + TOKEN);
    // multipart field is `image` (GAS auto-sets multipart/form-data from a blob).
    expect(opts.payload).toBeDefined();
    expect(opts.payload.image).toBeDefined();
    expect(opts.fetchTimeoutSeconds).toBe(30);
    expect(opts.fetchTimeoutSeconds).toBe(OCR_FETCH_TIMEOUT_SEC);
    // must mute HTTP exceptions so non-2xx is inspected, not thrown by GAS.
    expect(opts.muteHttpExceptions).toBe(true);
  });
});

describe('ocrClient.recognize — error status codes throw (no token leak)', () => {
  const ERROR_CASES: Array<{ code: number; body: string }> = [
    { code: 400, body: '{"error":"invalid request"}' },
    { code: 401, body: '{"error":"unauthorized"}' },
    { code: 422, body: '{"error":"could not read image"}' },
    { code: 502, body: '{"error":"upstream error"}' },
    { code: 503, body: '{"error":"upstream error"}' },
  ];

  for (const { code, body } of ERROR_CASES) {
    it(`HTTP ${code} → throws AFTER the request was made (real error-map, not the stub)`, () => {
      const fetchFn = installOcr(code, body);
      expect(() => ocrClient.recognize(fakeBlob())).toThrow();
      // RED-honest: the bare NotImplemented stub throws BEFORE calling fetch, so
      // this asserts the client actually POSTed then mapped the non-200 to a
      // throw — it fails on the stub (fetch not called) and passes on GREEN.
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it(`HTTP ${code} → thrown Error references the status code, not the placeholder`, () => {
      installOcr(code, body);
      let caught: unknown;
      try {
        ocrClient.recognize(fakeBlob());
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      const msg = (caught as Error).message;
      // the mapped error must name the HTTP status; the bare stub throws the
      // literal "NotImplemented", so this is RED on the stub, GREEN on the map.
      expect(msg).toContain(String(code));
      expect(msg).not.toBe('NotImplemented');
    });

    it(`HTTP ${code} → thrown message never contains the token`, () => {
      installOcr(code, body);
      let caught: unknown;
      try {
        ocrClient.recognize(fakeBlob());
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      const msg = (caught as Error).message;
      expect(msg).not.toContain(TOKEN);
      expect(msg.toLowerCase()).not.toContain('bearer');
    });
  }
});

describe('ocrClient.recognize — defensive parse (missing keys → null, never throw on 200)', () => {
  it('a 200 body missing most keys defaults the absent readings to null', () => {
    // Only the three always-present fields sent; every other reading absent.
    const sparse = JSON.stringify({
      imageHash: 'sha256:' + 'b'.repeat(64),
      source: 'unknown',
      confidence: 0.55,
    });
    installOcr(200, sparse);

    let m: ReturnType<typeof ocrClient.recognize> | undefined;
    expect(() => {
      m = ocrClient.recognize(fakeBlob());
    }).not.toThrow();

    expect(m!.imageHash).toBe('sha256:' + 'b'.repeat(64));
    expect(m!.source).toBe('unknown');
    expect(m!.confidence).toBe(0.55);
    // absent readings → null (defensive default), not undefined.
    expect(m!.activeCaloriesKcal).toBeNull();
    expect(m!.distanceKm).toBeNull();
    expect(m!.activityType).toBeNull();
    expect(m!.warnings).toBeNull();
    expect(m!.additionalMetrics).toBeNull();
    expect(m!.rawOcrText).toBeNull();
  });

  it('never throws on a 200 even with an otherwise-empty JSON object', () => {
    installOcr(200, '{}');
    expect(() => ocrClient.recognize(fakeBlob())).not.toThrow();
  });
});
