# Proposal — fit-webhook (LINE OA ↔ Fit-OCR consumer)   (v1, 2026-07-04)

> Issuer: **iStartSoft** · Client: internal · Currency: **THB** · Rate: **฿8,000/day (placeholder — ปรับได้)** · Contingency: **15%**
> โปรเจกต์ = ฝั่ง consumer (LINE OA webhook bot, Google Apps Script). ไม่รวมการสร้าง Fit-OCR API.

## Scope

**In-scope:**
- LINE webhook (verify signature ทุก request) · รับรูป workout · getContent
- เรียก Fit-OCR API (mock จนกว่าจะได้ URL+token จริง) · parse 25-key contract
- Confirm flow: confirm / reject / success Flex cards (**text ล้วน ไม่มี emoji**)
- CacheService stash ผล OCR ข้าม event · postback → บันทึก Google Sheet
- กติกา: `activeCaloriesKcal ≥ 150` (v1) · backdate ≤ 1 วัน + ไม่ซ้ำ (P2)
- Summary count week/month/total (P2) · unit + contract tests · deploy GAS Web App (dev channel)

**Out-of-scope:** Fit-OCR API เอง · LINE OA account/paid message tier · ระบบ HR identity จริง · LIFF/แก้ค่ามือ · native app · full-scale (1000+) infra migration (Cloud Run/DB = SOW แยก) · chart (เว้นอนุมัติ P3)

## Phases

| Phase | ขอบเขต | Complexity | Effort | Cost (@฿8k, +15%) |
|---|---|---|---|---|
| **P0 Bootstrap** | clasp+TS+Jest+Rollup · Script Properties · GAS Web App deploy · signature-verify scaffold · wire dev webhook | S | 1–2d | ฿9.2k–18.4k |
| **P1 v1 confirm flow** | router(message\|postback) · getContent · **sha256 dedup + rate-limit guard** · ocrClient+mock · cal≥150 · Cache stash · Flex confirm/reject/success/trigger (semantic color, quick-reply cameraRoll) · sheetRepo+register · postback→save · tests · deploy | L | 4–6d | ฿36.8k–55.2k |
| **P2 rules + summary** | backdate≤1d (+null handling) · no-dup (LockService) · summary week/month/total · **bar chart (native Flex boxes)** · expanded reject · admin-dispute log | M | 3–4d | ฿27.6k–36.8k |
| **Integration/handover** | swap mock→real OCR URL+token · real E2E · public exposure | S | 1–2d | ฿9.2k–18.4k |
| **P3 stretch** (optional) | real identity mapping · rich-menu trigger · advanced/line chart (ถ้าต้องเกิน Flex boxes) | M | 2–4d | ฿18.4k–36.8k |

## Total

- **Core (P0+P1+P2+Integration):** 9–14 ideal-days → **฿83k–129k** (incl. 15% contingency)
- **+ P3 stretch (optional):** +2–4d → **+฿18k–37k**

## Timeline

Core ~**2–3.5 สัปดาห์** (dependency order, ส่วนใหญ่ sequential; test authoring parallel ใน phase). Integration ขึ้นกับ OCR team ส่ง URL+token (their Phase 2/3).

## Assumptions

- LINE **dev** channel (token+secret) จัดให้แล้ว
- Google account + Sheet access จัดให้ (เราออกแบบ schema)
- **Fit-OCR URL+token ส่งโดย OCR team** — block real E2E; build บน mock จนกว่าจะได้
- GAS+Sheet รับ trial scale ได้; migration ที่ 1000+ = งานแยก
- Sync + reply-token (ไม่ใช้ paid push) · employee identity = placeholder v1 · ไม่มี LIFF/แก้มือ · copy ไทย ไม่ต้องมี design asset เพิ่ม

## Exclusions

Fit-OCR API · LINE fees/paid tier · HR identity integration · LIFF/native · non-workout image semantics เกินกว่า generic reject · full-scale infra migration

## Payment

**30 / 40 / 30** — kickoff / v1 confirm-flow accepted / P2+handover done.

## Sign-off

approved by: **Theerasak Duangkaew (owner)**  date: **2026-07-04**  version: v1
scope approved: **Core (P0+P1+P2+Integration) + P3 stretch** — ทั้งหมด
