# ENDPOINTS

> maintained โดย implementer หลังทุก phase. deployed URLs + surfaces.

## GAS Web App (consumer)
| surface | method | URL | auth | note |
|---|---|---|---|---|
| doPost webhook | POST | _(pending owner clasp deploy — GAS `/exec` URL)_ | LINE `X-Line-Signature` (HMAC-SHA256 verify) | Phase 0 skeleton: verifies signature → always returns HTTP 200 `OK` (TextOutput). Invalid/absent sig → 200 + log + ignore (no downstream). Routing arrives Phase 1. |

**Phase 0 note:** code surface is live (`doPost` verifies + returns 200); the deployed `/exec` URL + LINE webhook wiring are owner-only manual steps (clasp login + LINE console) — statement, not a blocker.

## External (consumed)
| service | endpoint | auth | status |
|---|---|---|---|
| Fit-OCR | `POST {OCR_BASE_URL}/v1/ocr` · `GET /health` | Bearer `OCR_TOKEN` | URL+token **ยังไม่มี** → mock จน Phase 6 |
| LINE Messaging API | reply / getContent / richmenu | channel access token | dev channel |
