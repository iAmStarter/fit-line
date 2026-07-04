#!/usr/bin/env bash
# regression corpus runner (iStartSoftFlow — Feature 3 regression gate)
#   default : mock corpus  -> test/regression/**  (accumulated cross-phase contract tests)
#   --real  : real corpus  -> same specs with FITWH_REAL_CRYPTO=1 (real HMAC-SHA256 primitive)
# Every docs/ENDPOINTS.md surface MUST have >=1 spec under test/regression/.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--real" ]]; then
  echo "[regression] REAL corpus (FITWH_REAL_CRYPTO=1)"
  FITWH_REAL_CRYPTO=1 npx jest test/regression
else
  echo "[regression] MOCK corpus"
  npx jest test/regression
fi
