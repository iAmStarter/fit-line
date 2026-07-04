# ENDPOINTS

> maintained โดย implementer หลังทุก phase. deployed URLs + surfaces.

## GAS Web App (consumer)
| surface | URL | note |
|---|---|---|
| doPost webhook | _(pending Phase 0 deploy)_ | LINE dev channel webhook target |

## External (consumed)
| service | endpoint | auth | status |
|---|---|---|---|
| Fit-OCR | `POST {OCR_BASE_URL}/v1/ocr` · `GET /health` | Bearer `OCR_TOKEN` | URL+token **ยังไม่มี** → mock จน Phase 6 |
| LINE Messaging API | reply / getContent / richmenu | channel access token | dev channel |
