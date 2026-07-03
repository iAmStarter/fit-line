# Design Research: Secrets Management in Google Apps Script

**Date:** 2026-07-03  
**Topic:** Storing and securing LINE channel tokens, OCR API credentials, and other secrets in GAS.

---

## Recommended Approach: PropertiesService + Script Properties

### Standard Recommendation

For API keys, Bearer tokens, and other application secrets, use **PropertiesService** with **Script Properties** scope.

**Setup (Manual in GAS Editor):**
1. Open Apps Script editor.
2. Click **Project Settings**.
3. Under **Script Properties**, add key-value pairs:
   ```
   LINE_CHANNEL_ACCESS_TOKEN   |  your-token-here
   OCR_BEARER_TOKEN            |  your-ocr-token-here
   LINE_CHANNEL_SECRET         |  your-channel-secret-here
   ```

**Retrieval in Code:**
```typescript
const props = PropertiesService.getScriptProperties();
const lineToken = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
const ocrToken = props.getProperty('OCR_BEARER_TOKEN');
const channelSecret = props.getProperty('LINE_CHANNEL_SECRET');

if (!lineToken || !ocrToken) {
  throw new Error('Missing required secrets in Script Properties');
}
```

### Access Control & Visibility

- **Visibility:** Script Properties are **not visible in the Apps Script code editor** (unlike hardcoded secrets), reducing risk of accidental exposure in screenshots, videos, or code reviews.
- **Access Scope:** Only the script (and users with edit access to the script) can read them.
- **No Audit Log:** PropertiesService does not provide audit trails (unlike Google Cloud Secret Manager).

### Programmatic Setup (Optional)

If you need to set secrets from a deployment script or CI/CD pipeline:
```typescript
function setSecrets() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', process.env.LINE_CHANNEL_ACCESS_TOKEN);
  props.setProperty('OCR_BEARER_TOKEN', process.env.OCR_BEARER_TOKEN);
}
```

**Note:** `process.env` is not available in GAS. Instead, pass secrets via a configuration file or GAS deployment API.

---

## Alternative: Google Cloud Secret Manager (For High-Security Use Cases)

If you require audit logging, versioning, or stricter IAM controls (e.g., separate teams managing different secrets), use **Google Cloud Secret Manager**.

**Why Use It:**
- Audit trail of all accesses.
- Secret versioning and rotation.
- Finer-grained IAM permissions.
- Centralized secret management across services.

**How to Access from GAS:**
Since every Apps Script project is backed by a Google Cloud project (or can be linked to one), you can call Secret Manager via UrlFetchApp:

```typescript
function getSecretFromManager(secretName: string): string {
  const projectId = 'your-gcp-project-id';
  const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretName}/versions/latest:access`;
  
  const options = {
    method: 'post' as const,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getIdentityToken(),
    },
    muteHttpExceptions: true,
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error(`Failed to fetch secret: ${response.getContentText()}`);
  }
  
  const payload = JSON.parse(response.getContentText());
  return Utilities.newBlob(payload.payload.data, 'application/octet-stream').getDataAsString();
}
```

**Downsides:**
- Additional GCP setup and IAM configuration.
- Latency overhead (external API call vs. local PropertiesService).
- Potential cost (if using many secret accesses).
- Complexity for a small V1 project.

**Recommendation for V1:** Use Secret Manager only if you have strict compliance requirements. PropertiesService is sufficient for most LINE bot projects.

**Source:** [Secure Secrets in Google Apps Script - DEV Community](https://dev.to/googleworkspace/secure-secrets-in-google-apps-script-1dhc)

---

## Major Pitfalls to Avoid

| Pitfall | Risk | Solution |
|---------|------|----------|
| Hardcoding tokens in Code.gs | Exposure in source control, screenshots, code reviews | Use PropertiesService exclusively |
| Committing .clasprc.json to Git | Exposes clasp credentials (refresh token) | Add to `.gitignore`; store in GitHub Secrets for CI/CD |
| Checking in appsscript.json with secrets | Config file may contain sensitive data | Keep appsscript.json in source control, secrets in PropertiesService |
| Plain-text HTTP for token retrieval | MITM attack risk | Always use HTTPS; verify SSL certificates (GAS defaults to HTTPS for UrlFetchApp) |
| Logging secrets in execution logs | Cloud Logging may capture sensitive data | Never log tokens; use error handling to swallow sensitive details |

---

## Security Best Practices for V1

1. **Use Script Properties:**
   - Store LINE_CHANNEL_ACCESS_TOKEN, OCR_BEARER_TOKEN, LINE_CHANNEL_SECRET.
   - Set manually in Project Settings (not in code).

2. **Helper Function for Safe Retrieval:**
   ```typescript
   function getSecret(key: string): string {
     const value = PropertiesService.getScriptProperties().getProperty(key);
     if (!value) {
       throw new Error(`Secret not configured: ${key}`);
     }
     return value;
   }
   ```

3. **No Logging of Tokens:**
   ```typescript
   // ❌ Bad
   Logger.log('Using token: ' + lineToken);
   
   // ✓ Good
   Logger.log('Calling LINE Messaging API');
   ```

4. **Rotate Secrets Regularly:**
   - Every 90 days (or as per your security policy).
   - Update in Project Settings; no code change needed.

5. **Separate Secrets by Environment:**
   - If you have dev/staging/prod Apps Script projects, use different script properties for each.
   - Store clasp credentials for each in GitHub Secrets as `CLASP_JSON_DEV`, `CLASP_JSON_STAGING`, `CLASP_JSON_PROD`.

6. **Use muteHttpExceptions for API Calls:**
   ```typescript
   const options = {
     headers: { Authorization: 'Bearer ' + lineToken },
     muteHttpExceptions: true, // Prevents logging of HTTP errors with sensitive headers
   };
   ```

---

## Deployment & CI/CD Secrets

If deploying via GitHub Actions + clasp:

**GitHub Secrets Setup:**
1. Go to repo Settings → Secrets and variables → Actions.
2. Add:
   - `CLASP_JSON_DEV` (or `CLASP_JSON_PROD`): The contents of `.clasp.json` for the target environment.
   - `CLASPRC_TOKEN`: The refresh token (from `.clasprc.json`).

**GitHub Actions Workflow:**
```yaml
- name: Deploy with clasp
  env:
    CLASP_JSON_DEV: ${{ secrets.CLASP_JSON_DEV }}
    CLASPRC_TOKEN: ${{ secrets.CLASPRC_TOKEN }}
  run: |
    echo "$CLASP_JSON_DEV" > .clasp.json
    echo '{"token":"'$CLASPRC_TOKEN'"}' > .clasprc.json
    npm run push
```

**Note:** Script Properties (LINE_CHANNEL_ACCESS_TOKEN, etc.) are set **after** deployment via the GAS Project Settings UI, not via clasp. Consider a second step to update them programmatically if needed (requires a separate GAS API call or manual step).

---

## Summary

| Secret Type | Storage | Visibility | Audit Trail | Recommended for V1 |
|-------------|---------|------------|--------------|--------------------|
| LINE Channel Token, OCR Bearer Token | PropertiesService | Hidden in editor | ❌ None | ✓ Yes |
| Clasp credentials (.clasprc.json) | GitHub Secrets | Hidden in GitHub | ✓ GitHub audit log | ✓ Yes (for CI/CD) |
| GCP Service Account Keys | Google Cloud Secret Manager | Hidden, IAM-controlled | ✓ Cloud Audit Logs | ❌ Only if high-security needs |
| Configuration (non-sensitive) | appsscript.json / PropertiesService | Visible in source | ❌ None | ✓ Yes (non-sensitive only) |

---

## Recommendations for V1

1. **Setup:** Use PropertiesService for LINE tokens + OCR credentials.
2. **CI/CD:** If using GitHub Actions + clasp, store clasp credentials in GitHub Secrets, not in the repo.
3. **Manual Secret Management:** Set LINE/OCR tokens manually in Project Settings (not automated).
4. **Rotation:** Plan quarterly token rotation (documented in runbook).
5. **No Secret Manager:** Skip Google Cloud Secret Manager for V1 (adds complexity; PropertiesService is sufficient).
6. **Logging:** Train the team to never log or log sensitive details; use error codes instead.
