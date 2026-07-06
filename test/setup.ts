/**
 * test/setup.ts — GAS-global mock harness (shared by ALL phases).
 *
 * Google Apps Script service singletons (Utilities, PropertiesService,
 * UrlFetchApp, CacheService, SpreadsheetApp, LockService, ContentService)
 * do not exist under Node/Jest. This file installs jest.fn()-backed doubles
 * on globalThis so unit code can call them. Each suite overrides the
 * relevant mock in a beforeEach; the defaults here are inert/no-op.
 *
 * Loaded via jest.config.cjs `setupFilesAfterEnv`. Do NOT put logic-under-test
 * here — only the fake GAS surface.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// The GAS service singletons are already declared (as their real types) by
// `@types/google-apps-script`. We overwrite them with jest.fn()-backed doubles
// at runtime; each assignment is cast to `any` so the fake surface need not
// satisfy the full GAS type — tests interact via `(globalThis as any).X`.
const g = globalThis as any;

/**
 * Real-ish `Utilities.formatDate` for the Asia/Bangkok (+07:00, no DST) zone.
 * The image-path handler (Phase 4) computes `todayISO` via
 * `Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')` before it
 * runs the backdate rule, so this must exist and be correct. We support the two
 * patterns the code uses (`yyyy-MM-dd` and full `yyyy-MM-dd'T'HH:mm:ss`), shifting
 * the instant into the Bangkok wall clock. Any other zone/pattern → best-effort.
 */
function formatDateFake(date: Date, timeZone: string, pattern: string): string {
  // Bangkok is a fixed +07:00 offset (no DST). Shift the UTC instant by +7h and
  // read the resulting UTC fields as the Bangkok wall-clock fields.
  const offsetMs = timeZone === 'Asia/Bangkok' ? 7 * 60 * 60 * 1000 : 0;
  const shifted = new Date(date.getTime() + offsetMs);
  const yyyy = String(shifted.getUTCFullYear()).padStart(4, '0');
  const MM = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const HH = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
  return pattern
    .replace(/yyyy/g, yyyy)
    .replace(/MM/g, MM)
    .replace(/dd/g, dd)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss);
}

// --- Utilities (crypto + encoding) ---------------------------------------
// Real GAS: computeHmacSha256Signature(value, key) -> byte[] (signed, -128..127)
//           base64Encode(byte[] | string) -> string
//           computeDigest(algo, value) -> byte[]  (used Phase 3 for sha256)
//           formatDate(date, timeZone, pattern) -> string  (Phase 4 todayISO)
g.Utilities = {
  computeHmacSha256Signature: jest.fn(
    (_value: string, _key: string): number[] => [0, 1, 2, 3]
  ),
  computeDigest: jest.fn((_algo: unknown, _value: unknown): number[] => [
    0, 1, 2, 3,
  ]),
  base64Encode: jest.fn((data: number[] | string): string => {
    if (typeof data === 'string') {
      return Buffer.from(data, 'utf8').toString('base64');
    }
    // GAS byte[] is signed; normalise to 0..255 for Buffer.
    return Buffer.from(data.map((b) => b & 0xff)).toString('base64');
  }),
  base64Decode: jest.fn((encoded: string): number[] =>
    Array.from(Buffer.from(encoded, 'base64'))
  ),
  formatDate: jest.fn(
    (date: Date, timeZone: string, pattern: string): string =>
      formatDateFake(date, timeZone, pattern)
  ),
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
};

// --- PropertiesService (Script Properties) --------------------------------
g.PropertiesService = {
  getScriptProperties: jest.fn(() => ({
    getProperty: jest.fn((_key: string): string | null => null),
    setProperty: jest.fn(),
    getProperties: jest.fn((): Record<string, string> => ({})),
  })),
};

// --- UrlFetchApp (outbound HTTP: OCR + LINE reply/getContent) --------------
g.UrlFetchApp = {
  fetch: jest.fn((_url: string, _options?: unknown) => ({
    getContentText: jest.fn((): string => '{}'),
    getResponseCode: jest.fn((): number => 200),
    getBlob: jest.fn(() => ({
      getBytes: jest.fn((): number[] => []),
      getContentType: jest.fn((): string => 'image/jpeg'),
    })),
    getAllHeaders: jest.fn((): Record<string, string> => ({})),
  })),
};

// --- CacheService (multi-turn stash + rate-limit) -------------------------
g.CacheService = {
  getScriptCache: jest.fn(() => ({
    get: jest.fn((_key: string): string | null => null),
    put: jest.fn(),
    remove: jest.fn(),
    getAll: jest.fn((): Record<string, string> => ({})),
    putAll: jest.fn(),
  })),
};

// --- SpreadsheetApp (Sheet datastore) -------------------------------------
g.SpreadsheetApp = {
  openById: jest.fn(() => ({
    getSheetByName: jest.fn(() => ({
      appendRow: jest.fn(),
      getRange: jest.fn(() => ({
        getValues: jest.fn((): unknown[][] => []),
        setValues: jest.fn(),
        setValue: jest.fn(),
      })),
      getDataRange: jest.fn(() => ({
        getValues: jest.fn((): unknown[][] => []),
      })),
      getLastRow: jest.fn((): number => 0),
    })),
  })),
};

// --- LockService (idempotency / dedup under redelivery) -------------------
g.LockService = {
  getScriptLock: jest.fn(() => ({
    waitLock: jest.fn(),
    tryLock: jest.fn((): boolean => true),
    releaseLock: jest.fn(),
  })),
};

// --- ContentService (HTTP response for doPost) ----------------------------
g.ContentService = {
  createTextOutput: jest.fn((text?: string) => {
    const out: Record<string, unknown> = {
      _text: text ?? '',
      setMimeType: jest.fn(function (this: unknown) {
        return this;
      }),
      getContent: jest.fn((): string => text ?? ''),
    };
    return out;
  }),
  MimeType: { TEXT: 'TEXT', JSON: 'JSON' },
};

// --- Logger ---------------------------------------------------------------
g.Logger = {
  log: jest.fn(),
};

export {};
