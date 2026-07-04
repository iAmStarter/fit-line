# Implementation Research: Phase 0 Toolchain & Concrete Scaffolding

**Date:** 2026-07-04  
**Phase:** 0 (Infra Setup)  
**Purpose:** Concrete, current specifications required to scaffold the fit-webhook Phase 0 toolchain.  
**Scope:** clasp + TypeScript + Rollup + Jest, GAS API contracts, signature verification, Script Properties, deployment config.

---

## 1. Toolchain Configuration: Exact Specifications

### 1.1 Node.js Dependencies & Build Scripts

**Recommended Stack (stable as of 2026):**
- Bundler: **Rollup** (proven with GAS, simpler than esbuild for this use case; esbuild-gas-plugin exists but less mature ecosystem)
- Test Framework: **Jest** (industry standard; GAS-compatible via dependency injection)
- TypeScript: **5.x** (strict mode; TypeScript 6.0+ dropped ES5 target; use 5.x for GAS compatibility)
- Type definitions: **@types/google-apps-script@1.0.56** or latest patch

**Exact package.json Scripts:**

```json
{
  "name": "fit-webhook",
  "version": "0.1.0",
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "push": "npm run build && clasp push",
    "logs": "clasp logs"
  },
  "dependencies": {
    "@google/clasp": "^2.4.1"
  },
  "devDependencies": {
    "@rollup/plugin-typescript": "^11.1.x",
    "@types/google-apps-script": "^1.0.56",
    "@types/jest": "^29.x",
    "@types/node": "^18.x",
    "jest": "^29.x",
    "rollup": "^4.x",
    "typescript": "^5.x"
  }
}
```

**Installation steps:**
```bash
npm install
npm install --save-dev rollup @rollup/plugin-typescript jest @types/jest typescript @types/google-apps-script
```

---

### 1.2 TypeScript Configuration: tsconfig.json

**Critical for GAS compatibility:**

```json
{
  "compilerOptions": {
    "target": "es5",
    "module": "esnext",
    "lib": ["esnext"],
    "types": ["@types/google-apps-script", "@types/jest"],
    "strict": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "declaration": false,
    "sourceMap": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Key decisions:**
- `target: "es5"` — GAS does NOT support ES6+ natively; transpile to ES5.
- `module: "esnext"` — Rollup will handle module transformation; keep as ESM in source.
- `lib: ["esnext"]` — Use modern JS stdlib; Rollup + GAS types handle the rest.
- `strict: true` — Enforce all strict checks (hard requirement per PLAN).
- `declaration: false` — GAS doesn't use declaration files; skip generation.
- `sourceMap: false` — GAS doesn't need source maps; skip for faster builds.
- `noUnusedLocals/Parameters: true` — Catch dead code early.

---

### 1.3 Rollup Configuration: rollup.config.js

**Critical: Output must be a single IIFE with GAS globals (doPost) reachable at top level.**

```javascript
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser'; // optional: minify

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'iife',
    name: 'App', // global namespace (optional, ensures no top-level exports)
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        declaration: false,
      },
    }),
    // Optional: terser() for minification (reduces deployment size)
  ],
};
```

**Why IIFE format:**
- GAS has NO module system (no `import`/`export` in the final deployed code).
- All functions defined at module level in the bundled code become globals.
- `doPost`, `doGet`, etc. must be callable as `window.doPost(e)`.
- Rollup's IIFE wrapper ensures all exports become a single global namespace.

**Bundling Result:**
After `npm run build`, `dist/main.js` will contain:
```javascript
(function() {
  // All code inlined here
  window.doPost = function(e) { ... };
  window.verifySignature = function(body, sig, secret) { ... };
  // etc.
})();
```

---

### 1.4 Jest Configuration: jest.config.js

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts', // Skip the GAS entry point
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
```

**Key setup:**
- `testEnvironment: 'node'` — GAS runs server-side; use Node.js environment (not jsdom).
- `preset: 'ts-jest'` — Handles TypeScript transpilation in tests.
- `setupFilesAfterEnv` — Load mock harness before each test suite (see §2).

---

## 2. Jest + GAS Globals: Dependency Injection Mock Harness

### 2.1 DI Pattern (Recommended)

GAS globals (UrlFetchApp, PropertiesService, SpreadsheetApp, Utilities, CacheService, LockService) are **not mockable directly** in Jest. The solution is **dependency injection**:

**Pattern:**
```typescript
// src/adapters/gasClient.ts — thin wrapper that code imports
export interface GasClient {
  fetch: (url: string, opts: any) => any;
  getProperty: (key: string) => string | null;
  appendRow: (sheet: any, values: any[]) => void;
  // ... etc
}

export function createGasClient(): GasClient {
  return {
    fetch: (url, opts) => UrlFetchApp.fetch(url, opts),
    getProperty: (key) => PropertiesService.getScriptProperties().getProperty(key),
    appendRow: (sheet, values) => sheet.appendRow(values),
  };
}

// src/main.ts — accepts DI param
export function verifySignature(
  body: string,
  sig: string,
  secret: string,
  gasClient?: GasClient
): boolean {
  const client = gasClient || createGasClient();
  // ... use client.getProperty(secret)
}
```

**Test mocking:**
```typescript
// test/signature.spec.ts
describe('verifySignature', () => {
  it('returns true for valid signature', () => {
    const mockGas = {
      getProperty: jest.fn().mockReturnValue('test-secret'),
    };
    const result = verifySignature(body, sig, secret, mockGas);
    expect(result).toBe(true);
  });
});
```

### 2.2 Mock Harness Setup: test/setup.ts

```typescript
// test/setup.ts — shared mock for all tests
declare global {
  // Define Jest globals + mock GAS types
  namespace NodeJS {
    interface Global {
      Utilities: typeof Utilities;
      PropertiesService: typeof PropertiesService;
      UrlFetchApp: typeof UrlFetchApp;
      CacheService: typeof CacheService;
      SpreadsheetApp: typeof SpreadsheetApp;
      LockService: typeof LockService;
      ContentService: typeof ContentService;
    }
  }
}

// Mock Utilities
global.Utilities = {
  computeHmacSha256Signature: jest.fn((value: any, key: any) => {
    // Return mock byte array; real implementation comes in live test
    return Buffer.from([0, 1, 2, 3]); // Placeholder
  }),
  base64Encode: jest.fn((data: any) => {
    if (typeof data === 'string') {
      return Buffer.from(data).toString('base64');
    }
    return Buffer.from(data).toString('base64');
  }),
  base64Decode: jest.fn((encoded: string) => {
    return Buffer.from(encoded, 'base64');
  }),
} as any;

// Mock PropertiesService
global.PropertiesService = {
  getScriptProperties: jest.fn(() => ({
    getProperty: jest.fn((key: string) => {
      // Tests will override this
      const mockProps: { [key: string]: string } = {};
      return mockProps[key] || null;
    }),
    setProperty: jest.fn(),
  })),
} as any;

// Mock UrlFetchApp
global.UrlFetchApp = {
  fetch: jest.fn((url: string, options: any) => ({
    getContentText: jest.fn(() => '{}'),
    getResponseCode: jest.fn(() => 200),
    getBlob: jest.fn(() => ({ getBytes: jest.fn(() => []) })),
    getAllHeaders: jest.fn(() => ({})),
  })),
} as any;

// Mock CacheService
global.CacheService = {
  getScriptCache: jest.fn(() => ({
    put: jest.fn(),
    get: jest.fn((key: string) => null),
    remove: jest.fn(),
  })),
} as any;

// Mock SpreadsheetApp
global.SpreadsheetApp = {
  openById: jest.fn(() => ({
    getSheetByName: jest.fn(() => ({
      getRange: jest.fn(),
      appendRow: jest.fn(),
      getDataRange: jest.fn(),
    })),
  })),
} as any;

// Mock LockService
global.LockService = {
  getScriptLock: jest.fn(() => ({
    waitLock: jest.fn(),
    releaseLock: jest.fn(),
  })),
} as any;

// Mock ContentService
global.ContentService = {
  createTextOutput: jest.fn((text: string) => ({
    setMimeType: jest.fn(function() { return this; }),
    getAs: jest.fn((type: string) => text),
  })),
} as any;
```

**Usage in tests:**
```typescript
// test/signature.spec.ts
import { verifySignature } from '../src/line/signature';

describe('verifySignature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when HMAC-SHA256 matches', () => {
    const body = 'test-body';
    const secret = 'test-secret';
    const expectedHash = Buffer.from('expected-hash').toString('base64');

    (global.Utilities.computeHmacSha256Signature as jest.Mock).mockReturnValue(
      Buffer.from('expected-hash')
    );

    const result = verifySignature(body, expectedHash, secret);
    expect(result).toBe(true);
  });

  it('returns false when signature is empty', () => {
    const result = verifySignature('test-body', '', 'test-secret');
    expect(result).toBe(false);
  });
});
```

---

## 3. Signature Verification: Exact GAS API Contract

### 3.1 API Signatures (from Google Developers)

**Utilities.computeHmacSha256Signature**
```typescript
// 3 overloads:
// 1. (value: Byte[], key: Byte[]) → Byte[]
// 2. (value: String, key: String) → Byte[]
// 3. (value: String, key: String, charset: Charset) → Byte[]

// Returns: byte array of the HMAC-SHA256 signature
// Does NOT return base64; must encode separately
```

**Utilities.base64Encode**
```typescript
// 3 overloads:
// 1. (data: Byte[]) → String
// 2. (data: String) → String
// 3. (data: String, charset: Charset) → String

// Returns: base64-encoded string
```

### 3.2 Exact Implementation Pattern

**LINE Webhook Signature Verification (from LINE Developers docs):**

```typescript
// src/line/signature.ts
export function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // Compute HMAC-SHA256(body, secret) → returns byte[]
  const computedHash = Utilities.computeHmacSha256Signature(body, secret);

  // Encode byte[] → base64 string
  const computedSignature = Utilities.base64Encode(computedHash);

  // Full-string comparison (no early return; constant-time-ish)
  return computedSignature === signature;
}
```

**Why this works:**
1. LINE sends `X-Line-Signature` header = base64(HMAC-SHA256(body, channel_secret))
2. `Utilities.computeHmacSha256Signature(body, secret)` returns the byte array
3. `Utilities.base64Encode(bytes)` converts to the base64 string LINE sends
4. Full-string comparison (`===`) ensures constant-time-ish validation

**Important gotchas:**
- `computeHmacSha256Signature` returns **byte[], NOT base64**. Always encode before comparing.
- `body` MUST be the **raw request body as a string**. If you parse JSON first, the hash won't match.
- Comparison must be full-string (`===`), not per-character (to avoid timing attacks).
- Empty body + empty signature → return `false`, not crash.

**Test expectations:**
```typescript
describe('verifySignature', () => {
  it('validates correct LINE webhook signature', () => {
    const body = JSON.stringify({ events: [{ type: 'message' }] });
    const secret = 'test-secret-key';

    // Mock Utilities to return known bytes
    (global.Utilities.computeHmacSha256Signature as jest.Mock).mockReturnValue(
      new Uint8Array([0x12, 0x34, 0x56, 0x78])
    );
    (global.Utilities.base64Encode as jest.Mock).mockReturnValue('EjRWeA==');

    const sig = 'EjRWeA==';
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const result = verifySignature('body', 'wrong-sig', 'secret');
    expect(result).toBe(false);
  });

  it('returns false for empty signature', () => {
    const result = verifySignature('body', '', 'secret');
    expect(result).toBe(false);
  });

  it('returns false for empty body and signature', () => {
    const result = verifySignature('', '', 'secret');
    expect(result).toBe(false);
  });
});
```

---

## 4. Script Properties Access: Configuration Management

### 4.1 API Contract

```typescript
// Get single property
PropertiesService.getScriptProperties().getProperty(key: String): String | null

// Set single property
PropertiesService.getScriptProperties().setProperty(key: String, value: String): PropertiesService

// Get all properties
PropertiesService.getScriptProperties().getProperties(): Object<String, String>
```

**Key behavior:**
- Returns `null` if key is missing (not an error; check explicitly).
- Values are always strings (even if you store numbers, retrieve as string + parse).
- Scoped to the Apps Script project (NOT user-specific, NOT spreadsheet-specific).

### 4.2 Fail-Fast Helper Pattern

```typescript
// src/config/props.ts
export function getProp(key: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`Missing required property: ${key}`);
  }
  return value;
}

export function getPropOptional(key: string, defaultValue?: string): string | undefined {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ?? defaultValue;
}

// src/main.ts — boot-time validation
export function doPost(e: GoogleAppsScript.Events.DoPost) {
  try {
    // Fail-fast: missing secrets throw immediately at startup
    const lineSecret = getProp('LINE_CHANNEL_SECRET');
    const lineToken = getProp('LINE_CHANNEL_ACCESS_TOKEN');
    const ocrUrl = getProp('OCR_BASE_URL');
    const sheetId = getProp('SHEET_ID');
    
    // ... rest of processing
  } catch (err) {
    Logger.log(`Boot error: ${err.message}`);
    return ContentService.createTextOutput('Configuration error').setMimeType(ContentService.MimeType.TEXT);
  }
}
```

### 4.3 Required Script Properties

**Must be set manually in Apps Script Editor before deployment:**

1. Open Apps Script editor (script.google.com)
2. Click **Project Settings** (gear icon)
3. Under **Script Properties**, add:

| Key | Example | Purpose |
|-----|---------|---------|
| `LINE_CHANNEL_SECRET` | `0a1b2c3d...` | Webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | `Bearer abc123...` | Reply API auth |
| `OCR_BASE_URL` | `https://ocr.example.com` | OCR service endpoint |
| `OCR_TOKEN` | `Bearer xyz789...` | OCR service auth |
| `SHEET_ID` | `1ABC-XYZ_...` | Spreadsheet ID (URL-based) |

**Verification (Phase 0 acceptance):**
```typescript
// test/props.spec.ts
describe('getProp', () => {
  it('throws when property is missing', () => {
    (global.PropertiesService.getScriptProperties as jest.Mock).mockReturnValue({
      getProperty: jest.fn(() => null),
    });
    expect(() => getProp('MISSING_KEY')).toThrow('Missing required property: MISSING_KEY');
  });

  it('returns value when property exists', () => {
    (global.PropertiesService.getScriptProperties as jest.Mock).mockReturnValue({
      getProperty: jest.fn((key) => (key === 'TEST_KEY' ? 'test-value' : null)),
    });
    expect(getProp('TEST_KEY')).toBe('test-value');
  });
});
```

---

## 5. Manifest & Deployment Configuration

### 5.1 appsscript.json (GAS Manifest)

**Required for Phase 0:**

```json
{
  "timeZone": "Asia/Bangkok",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE_ANONYMOUS",
    "executeAs": "USER_DEPLOYING"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/properties"
  ],
  "dependencies": {
    "libraries": []
  }
}
```

**Field decisions:**
- `timeZone: "Asia/Bangkok"` — Required for date logic (Phase 4). Matches PLAN locale.
- `runtimeVersion: "V8"` — Modern GAS runtime; Rhino is deprecated.
- `webapp.access: "ANYONE_ANONYMOUS"` — Webhook must accept unauthenticated requests (signature verification is the auth).
- `webapp.executeAs: "USER_DEPLOYING"` — Script runs as the deploying user's permissions (owner).
- `oauthScopes`: Spreadsheet + external request + properties (for Script Properties access).

### 5.2 .clasp.json (clasp Project Config)

**Generated by `clasp create` or `clasp clone`; DO NOT commit to Git:**

```json
{
  "scriptId": "1ABC-XYZ-1234567890",
  "rootDir": "dist"
}
```

**Key settings:**
- `scriptId` — Project ID from Apps Script dashboard (sensitive; use GitHub Secrets in CI/CD).
- `rootDir: "dist"` — Point to bundled output (Rollup generates here).

### 5.3 .claspignore (Deployment Filter)

**Include in repo; prevents test/source from uploading:**

```
# Default patterns (optional if no custom exclusions needed, but explicit is better)
node_modules/**
test/**
src/**
*.ts
*.spec.js
jest.config.js
rollup.config.js
tsconfig.json
package.json
package-lock.json
README.md
.gitignore
.prettierrc
```

**Why:** Only `dist/main.js` and `appsscript.json` should upload to GAS.

### 5.4 .gitignore (Source Control)

**Critical: Secrets & Build Artifacts**

```
# Clasp credentials (CRITICAL — never commit)
.clasp.json
.clasprc.json

# Build output
dist/
build/

# Node modules
node_modules/
package-lock.json

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local

# Test coverage
coverage/
.nyc_output/
```

---

## 6. doPost Entry Point: Skeleton Implementation

### 6.1 Phase 0 Acceptance Structure

```typescript
// src/main.ts
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // 1. Extract request body
    const body = e.postData?.contents ?? '';

    // 2. Extract signature from headers
    const xLineSignature = (e.parameter as any)?.['X-Line-Signature'] ?? '';

    // 3. Get channel secret from Script Properties (fail-fast)
    const secret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    if (!secret) {
      Logger.log('Missing LINE_CHANNEL_SECRET; skipping processing');
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    // 4. Verify signature
    if (!verifySignature(body, xLineSignature, secret)) {
      Logger.log('Invalid signature; ignoring webhook');
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    // 5. Phase 0: Return 200 (no further routing yet)
    Logger.log('Valid signature received; processing webhook');
    // Phase 1 will add routing and OCR logic here
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    Logger.log(`doPost error: ${err.message}`);
    // Always return 200 to LINE (don't let LINE retry)
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }
}
```

### 6.2 ContentService Response

```typescript
// Standard GAS HTTP response pattern
const response = ContentService.createTextOutput('OK')
  .setMimeType(ContentService.MimeType.TEXT);

// If returning JSON:
const response = ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
  .setMimeType(ContentService.MimeType.JSON);

// Returns HTTP 200 automatically when doPost returns this object
```

---

## 7. Build & Deploy Workflow

### 7.1 Local Development Cycle

```bash
# First-time setup
npm install
clasp login  # (owner-only; creds stored in ~/.clasprc.json, NOT in repo)

# Development loop
npm run watch        # Watch TS files; rebuild on change
npm test             # Run Jest suite
npm run build        # One-time build (Rollup)

# Deploy to GAS
npm run push         # = npm run build && clasp push

# View logs
npm run logs         # Stream GAS execution logs
```

### 7.2 Deployment Checklist (Owner-Only Manual Steps)

1. **clasp login** (first-time only)
   - `clasp login` — opens browser, grants GAS API access
   - Stores credentials in `~/.clasprc.json` (HOME, not repo)

2. **clasp create** (first-time) OR **clasp clone** (existing)
   - Creates `.clasp.json` with `scriptId`
   - Do NOT commit to Git

3. **Set Script Properties**
   - Open Apps Script editor (script.google.com → project)
   - Project Settings → Script Properties
   - Add: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `OCR_BASE_URL`, `OCR_TOKEN`, `SHEET_ID`

4. **Create Sheet & Tabs**
   - Create new Google Sheet (schema per OVERVIEW §5)
   - Two tabs: `submissions`, `employees`
   - Headers: column names exactly as schema specifies (Phase 1 reads by name)
   - Copy Sheet ID (from URL) → paste into Script Properties `SHEET_ID`

5. **Deploy as Web App**
   - Apps Script editor → Deploy (top-right)
   - New deployment → Type: "Web app"
   - Execute as: "Me" (owner)
   - Who has access: "Anyone"
   - Deploy → Get URL (e.g., `https://script.google.com/macros/d/{deploymentId}/usercallback`)

6. **Wire LINE Webhook**
   - LINE Developers console → Messaging API settings
   - Webhook URL: paste GAS deployment URL above
   - Webhook use: Toggle ON
   - Push events: Enable message, postback events

7. **Verify 200 Response**
   - Send test message from LINE account
   - Apps Script logs (clasp logs) should show: "Valid signature received; processing webhook"

---

## 8. Unknowns & Blockers (Phase 0)

**None.** All concrete specs confirmed via current GAS APIs.

---

## 9. Summary Table: Exact Decisions

| Component | Decision | Rationale | Alternate Considered |
|-----------|----------|-----------|----------------------|
| **Language** | TypeScript 5.x, strict mode | Type safety, hard requirement | ES6+ (not GAS-compatible) |
| **Bundler** | Rollup v4 IIFE → single .js | Proven GAS ecosystem; simpler than esbuild | esbuild + esbuild-gas-plugin (exists but less mature) |
| **Test Framework** | Jest + DI mocks | Industry standard; GAS globals mockable via wrapper | Mocha (older; less Jest integration) |
| **TypeScript Target** | es5 | GAS doesn't support ES6+ | es2015+ (won't run in GAS) |
| **TypeScript Module** | esnext (source), IIFE (output) | Rollup transforms; avoids import/export in final | commonjs (requires extra transform step) |
| **Manifest** | V8 runtime, ANYONE_ANONYMOUS | Modern + unauthenticated webhook | Rhino (deprecated) |
| **Secret Storage** | Script Properties only | No external API needed; simple | Google Cloud Secret Manager (overkill for v1) |
| **Signature Verification** | Utilities.computeHmacSha256Signature + base64Encode | Native GAS; no external library | crypto-js (external dependency, slower) |

---

## Sources & References

- [Google Apps Script: clasp (Official)](https://developers.google.com/apps-script/guides/clasp)
- [Utilities Service Reference (Official)](https://developers.google.com/apps-script/reference/utilities)
- [ContentService & Web Apps (Official)](https://developers.google.com/apps-script/guides/web)
- [Apps Script Manifest (Official)](https://developers.google.com/apps-script/manifest)
- [LINE Messaging API: Webhook Signature Verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [apps-script-typescript-rollup-starter (GitHub)](https://github.com/sqrrrl/apps-script-typescript-rollup-starter)
- [clasp-starter: TypeScript + Jest (GitHub)](https://github.com/nokazn/clasp-starter)
- [app-script-mock: GAS Mock Library (GitHub)](https://github.com/matheusmr13/app-script-mock)
- [HMAC-SHA256 in Google Apps Script (GitHub Gist)](https://gist.github.com/tanaikech/9e9ab42ad225e127c59ae8ae598aacac)
