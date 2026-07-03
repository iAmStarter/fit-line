# Design Research: Google Apps Script Dev + Test + Deploy Workflow

**Date:** 2026-07-03  
**Topic:** clasp CLI, local development, unit testing, and E2E testing for LINE webhook bots.

---

## 1. clasp: Local Development & TypeScript

### Overview

**Clasp** (Command Line Apps Script Projects) enables local development with Git integration and TypeScript support.

**TypeScript Support:**
- Clasp no longer transpiles TypeScript natively.
- Workflow: Write TypeScript locally → use a bundler (Rollup, esbuild, Webpack, etc.) → transpile to JS → `clasp push` to GAS.
- **Recommended Setup:** `npm run build && clasp push` (build script runs bundler, then clasp pushes output).

### Git Workflow

**Credentials Handling:**
- Clasp stores auth in `.clasprc.json` (refresh token).
- **MUST add `.clasprc.json` and `.clasp.json` to `.gitignore`** — these contain secrets and should never be committed.

**CI/CD with Clasp:**
- Store credentials as GitHub Secrets or environment variables (e.g., `CLASP_TOKEN`).
- For multiple environments (dev/staging/prod), create separate Apps Script projects and store their `.clasp.json` configurations as separate secrets.

**Git Hooks (optional automation):**
- Use pre-push hooks to auto-sync: `git hook: clasp push` ensures every GitHub push also syncs to GAS.

### Project Structure

```
.
├── src/
│   ├── main.ts        (entry point, contains doPost)
│   ├── ocr.ts         (OCR integration)
│   ├── sheets.ts      (Sheet operations)
│   └── types.ts       (TypeScript types)
├── appsscript.json    (GAS manifest, must be in root or configured rootDir)
├── .claspignore        (optional: exclude files from clasp push)
├── .clasp.json         (generated; DO NOT COMMIT)
├── .clasprc.json       (generated; DO NOT COMMIT)
├── tsconfig.json       (TypeScript config)
├── package.json        (dependencies, build scripts)
└── dist/               (bundled output, generated)
```

**Default Behavior:** Clasp only pushes `.js`, `.ts`, `.html`, and `appsscript.json`. Use `.claspignore` to control what gets synced.

### Maturity & Stability

Clasp is officially maintained by Google and widely used in production. TypeScript + bundler setup is common and stable (2024–2026 tooling is mature).

**Source:** [Use the command-line interface with clasp | Apps Script | Google for Developers](https://developers.google.com/apps-script/guides/clasp); [clasp GitHub](https://github.com/google/clasp)

---

## 2. Unit Testing with Jest & Mocking

### Mocking Strategy: Dependency Injection

Since GAS globals (UrlFetchApp, SpreadsheetApp, LockService) cannot be mocked directly in Jest, the standard approach is **dependency injection**:

**Pattern:**
```typescript
// Production code
export function fetchOCR(url: string, payload: string) {
  return UrlFetchApp.fetch(url, { payload });
}

// Testable refactor
export function processOCR(url: string, payload: string, fetcher = UrlFetchApp.fetch) {
  return fetcher(url, { payload });
}

// Test code (Jest)
describe('processOCR', () => {
  it('calls fetcher with correct payload', () => {
    const mockFetcher = jest.fn().mockReturnValue({
      getContentText: () => JSON.stringify({ calories: 150 }),
    });
    processOCR('http://ocr-api', '...', mockFetcher);
    expect(mockFetcher).toHaveBeenCalledWith('http://ocr-api', expect.objectContaining({ payload: '...' }));
  });
});
```

**Key Principle:** Extract GAS service calls into thin layers; inject mocks at test boundaries.

### Testing Libraries & Mocks

**Recommended Approach:** Jest + custom mocks or third-party libraries.

**Option 1: Manual Jest Mocks (Recommended for Simplicity)**
- Create a `__mocks__/gas.ts` file that exports fake UrlFetchApp, SpreadsheetApp, etc.
- Jest automatically replaces real GAS globals with mocks.

**Option 2: Third-Party Mock Libraries**
- `app-script-mock` (GitHub: [matheusmr13/app-script-mock](https://github.com/matheusmr13/app-script-mock)) — provides pre-built mock objects for GAS services.
- `GasT` (GitHub: [huan/gast](https://github.com/huan/gast)) — TAP-based testing framework specifically for GAS.

**Option 3: Vitest**
- Faster alternative to Jest with similar API; growing popularity in GAS projects.

### Testing Coverage Recommendation for V1

Focus on **unit tests** for business logic, not full integration:
1. **OCR response parsing:** Mock OCR API response, verify metric extraction.
2. **Calorie rule:** Test "activeCaloriesKcal ≥ 150" decision with various inputs.
3. **Sheet dedup logic:** Mock LockService, test messageId/employee+date uniqueness.
4. **Flex message formatting:** Test JSON structure against LINE limits.

**Do NOT unit test:**
- UrlFetchApp.fetch or SpreadsheetApp directly (mock instead).
- LINE Messaging API integration (use integration tests or manual testing in UAT).

**Estimated Unit Test Coverage:** 60–70% (focus on business logic, not GAS glue).

**Source:** [Writing Unit Test Cases for Google Apps Script: Mocking APIs](https://trycatchdebug.net/news/1439989/google-apps-script-unit-testing-with-api-mocking); [Medium: Unit Testing in Google Apps Script](https://medium.com/geekculture/taking-away-the-pain-from-unit-testing-in-google-apps-script-98f2feee281d)

---

## 3. E2E Testing: Webhook + LINE Bot

### Feasibility Assessment

**True Browser/Functional E2E:** NOT practical for a GAS webhook bot.
- GAS Web App is serverless; no traditional HTTP server to launch.
- LINE webhook delivery is asynchronous; difficult to intercept and verify in real time.
- No native browser driver or Selenium integration available.

**Practical Substitutes (Recommended):**

**Option 1: Contract Test (Recommended for V1)**
- Mock OCR API with a contract (fixed input → fixed output).
- Replay LINE webhook payloads against the GAS endpoint (local or deployed).
- Verify Sheet writes and Flex replies match expectations.
- Tools: Postman, Insomnia, or custom Node.js test harness.

**Setup:**
```javascript
// test/e2e.test.js (Node.js, run separately)
const doPost = require('../dist/main'); // Load transpiled GAS code
const mockWebhookEvent = {
  events: [{
    type: 'message',
    message: { type: 'image', id: '123', contentProvider: { type: 'line' } },
    replyToken: 'test-token',
    userId: 'U123',
  }],
};
const response = doPost({ postData: { contents: JSON.stringify(mockWebhookEvent) } });
expect(response.getAs('text')).toContain('200');
```

**Option 2: Staged Integration Testing**
- Deploy to a test Apps Script project with a test LINE bot.
- Send real LINE images from a test account.
- Verify Sheet writes and replies manually or via Cloud Logging.
- Repeat for edge cases (duplicate messageId, low calorie, invalid image).

**Option 3: Manual Webhook Replay (Simplest for V1)**
- Capture real LINE webhook payloads (from Cloud Logging or network inspection).
- Replay them via `curl` or Postman against the deployed endpoint.
- Verify Sheet and reply output.

### Recommended Approach for V1

**Phase 1 (Dev):** Contract tests with mocked OCR (Jest + manual test payloads).  
**Phase 2 (UAT):** Staged integration testing (real LINE test account + test Sheet).  
**Phase 3 (Monitor):** Cloud Logging + manual spot-checks.

**No True E2E Framework:** Accept that full E2E automation is impractical; focus on contract tests and staged manual testing.

**Source:** [Mastering Webhook E2E Test: A Dev's Guide - DEV Community](https://dev.to/ash_dubai/mastering-webhook-e2e-test-3d96); [GitHub: UnitTestingAppForGAS](https://github.com/mark05e/UnitTestingAppForGAS)

---

## 4. Build & Deploy Pipeline

### Local Development Cycle

```bash
# Install dependencies
npm install

# Watch & rebuild on save
npm run watch

# Run tests
npm run test

# Build once
npm run build

# Push to GAS (requires clasp auth)
clasp push

# View logs
clasp logs
```

### Typical package.json Scripts

```json
{
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w",
    "test": "jest",
    "test:watch": "jest --watch",
    "push": "npm run build && clasp push",
    "logs": "clasp logs"
  }
}
```

### CI/CD Pipeline (GitHub Actions Example)

```yaml
name: Deploy to Apps Script
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run build
      - run: npx clasp push
        env:
          CLASPRC: ${{ secrets.CLASPRC_JSON }}
```

---

## Summary for V1

| Aspect | Recommendation | Maturity |
|--------|-----------------|----------|
| Local Dev | clasp + TypeScript + Rollup | ✓ Stable, widely used |
| Git Integration | clasp + .gitignore secrets | ✓ Standard practice |
| Unit Tests | Jest + dependency injection + manual mocks | ✓ Proven pattern |
| E2E Tests | Contract tests (mocked OCR) + staged manual testing | ⚠ No single framework; compose manually |
| CI/CD | GitHub Actions + clasp push | ✓ Straightforward |

---

## Unknowns

- **GAS service mock library maturity:** `app-script-mock` and `GasT` exist but have smaller communities than jest-mock-extended. Recommend trying one early and falling back to manual mocks if needed.
- **Vitest adoption in GAS:** Vitest is faster but newer; Jest is more proven with GAS codebases.

---

## Recommendations for V1

1. **Setup:** clasp + TypeScript + Rollup (or esbuild).
2. **Testing:** Jest with dependency injection. Start with unit tests for OCR parsing and calorie rule; add contract tests for webhook flow.
3. **E2E:** No full automation; rely on staged manual testing (test LINE account) + Cloud Logging.
4. **CI/CD:** GitHub Actions + clasp push (simple, sufficient for small team).
5. **Secrets:** Store clasp credentials in GitHub Secrets; never commit `.clasprc.json`.
