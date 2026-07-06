/**
 * test/contract/ocr.contract.spec.ts — REAL Fit-OCR network contract (Phase 6).
 *
 * The REAL API suite: hits the live service at https://fit-ocr.istartsoft.dev over
 * Node `fetch` (NOT GAS `UrlFetchApp`, which does not exist under Node). This is
 * the Phase-6 gate — a green mock suite alone cannot close the phase; these real
 * assertions must pass with a valid token.
 *
 * ENV-GATED so normal CI stays offline/green: the suite RUNS only when
 * `process.env.OCR_TOKEN` is set (owner mints an `iss_live_…` key at
 * fit-ocr.web.app console); otherwise every case is `it.skip`ped. No token is
 * ever hardcoded — env only. Optional override: `OCR_BASE_URL` env for a staging
 * host; defaults to the production API host.
 *
 * Assertions when enabled (contract docs/research/impl-phase-6-ocr-contract.md):
 *   - GET  /health              → 200, body { status: 'ok' }  (public, no auth).
 *   - POST /v1/ocr  (no auth)   → 401  (unauthorized; identical for missing key).
 *   - POST /v1/ocr  (Bearer + invalid JSON body {}) → 400  (token ACCEPTED — the
 *     401 gate passed — but the body is rejected before any OCR/vision cost).
 *
 * The invalid-body case is deliberately CHEAP: a valid token + a `{}` body proves
 * auth works and the request is well-formed, without paying for a real vision
 * read (no image → 400 invalid request, never a 200 that costs a model call).
 */

const TOKEN = process.env.OCR_TOKEN;
const BASE_URL = process.env.OCR_BASE_URL ?? 'https://fit-ocr.istartsoft.dev';

// Gate: real network only when a token is present. Keeps offline CI green.
const describeReal = TOKEN ? describe : describe.skip;

// Real-network calls can be slow (upstream up to 25 s). Give ample headroom.
const NET_TIMEOUT_MS = 30_000;

describeReal('Fit-OCR REAL contract (env OCR_TOKEN required)', () => {
  it(
    'GET /health → 200 { status: "ok" } (public, no auth)',
    async () => {
      const res = await fetch(`${BASE_URL}/health`, { method: 'GET' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status?: string };
      expect(body.status).toBe('ok');
    },
    NET_TIMEOUT_MS
  );

  it(
    'POST /v1/ocr with NO auth → 401 unauthorized',
    async () => {
      const res = await fetch(`${BASE_URL}/v1/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    },
    NET_TIMEOUT_MS
  );

  it(
    'POST /v1/ocr with Bearer token + invalid JSON body {} → 400 (token accepted, no OCR cost)',
    async () => {
      const res = await fetch(`${BASE_URL}/v1/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({}),
      });
      // 400 = the token was accepted (past the 401 gate) and the empty body was
      // rejected as invalid request — no image was decoded, no vision cost.
      expect(res.status).toBe(400);
      // and definitely NOT a 401 — that would mean the token was rejected.
      expect(res.status).not.toBe(401);
    },
    NET_TIMEOUT_MS
  );
});
