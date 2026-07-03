# OVERVIEW — fit-webhook (LINE OA ↔ Fit-OCR consumer)

> โปรเจกต์นี้คือ **ฝั่ง consumer** — LINE Official Account webhook bot (Google Apps Script)
> ที่รับรูป screenshot การออกกำลังกายจากผู้ใช้ LINE → เรียก Fit-OCR API (โปรเจกต์แยก) →
> ตรวจกติกาธุรกิจ → บันทึก Google Sheet → ตอบกลับ Flex. **เราไม่ได้สร้าง OCR API**.

---

## 1. Purpose & success criteria

**Purpose:** ให้พนักงานส่ง screenshot การออกกำลังกายเข้า LINE OA แล้วระบบอ่านค่า (แคลอรี่ ฯลฯ)
อัตโนมัติ ตรวจเงื่อนไข แล้วบันทึกลงชีต — ลดงานคีย์มือ + คุมกติกาความถูกต้อง.

**Flow (confirm-based, 2 webhook events):**
1. รับรูป → verify signature → getContent → OCR (mock) → ตรวจ `activeCaloriesKcal ≥ 150` (fallback `totalCaloriesKcal`)
   - **ผ่าน** → stash ผล (CacheService, key=id สั้น) → ตอบ **confirm card** (กิจกรรม/วันที่/cal + ปุ่ม ยืนยัน/ส่งรูปใหม่)
   - **ไม่ผ่าน** → **reject card** (โชว์ค่าที่ OCR อ่านได้ + เหตุผล + ปุ่ม ส่งรูปใหม่/แจ้งแอดมิน) — ไม่บันทึก
2. กด **ยืนยัน** (postback) → อ่าน stash → เขียน Sheet → **success card**

**Slice roadmap:**
| Slice | ขอบเขต |
|---|---|
| **1 (v1 thin)** | trigger → รูป → OCR(mock) → cal≥150 → confirm/reject card → postback → Sheet → success card (นับง่ายๆ) |
| **2** | summary week/month/total + **bar chart (native Flex boxes)** บน success card + กติกา backdate≤1วัน + ไม่ซ้ำ(userId+activityDate) |
| **3 (stretch)** | employee identity mapping จริง · rich-menu trigger · advanced/line chart (ถ้าต้องเกิน Flex boxes) |

**Success criteria (v1):** ผู้ใช้ส่งรูป → ~10 วิ ได้ confirm card; กดยืนยัน → บันทึก Sheet + success card; ผิดเงื่อนไข → reject card เหตุผลชัด. Unit tests เขียว. Deploy GAS Web App ผูก **dev** LINE channel.

---

## 2. Project language

**th** (ศัพท์เทคนิคคง English). เอกสาร downstream + proposal.html ทั้งหมดตามภาษานี้.

---

## 3. Autonomy · Stack

**Autonomy mode:** **AUTO** (default). Dev loop: ทำตามแผน → decide + log + continue. Hard-stop เฉพาะ security / irreversible-or-outbound / spec ขัดกันเอง. Blocker → park + รายงานท้าย phase.

**Stack (declared):**
| ชั้น | เลือก |
|---|---|
| Language | TypeScript (strict) |
| Framework/Runtime | Google Apps Script (Web App, `doPost`) via **clasp** |
| Infra | GAS managed platform — self-managed wiring เล็กน้อย (clasp project, LINE webhook URL, Sheet, Script Properties) → มี **Phase 0** เบาๆ |
| Auth (inbound) | LINE webhook signature verify (`X-Line-Signature`, HMAC-SHA256 ด้วย channel secret) — **บังคับทุก request** |
| Auth (outbound) | Bearer token → Fit-OCR API · channel access token → LINE reply API (เก็บใน Script Properties) |
| Datastore | **Google Sheet** (trial) — 2 tab: `submissions`, `employees` |
| State (multi-turn) | **CacheService** — stash OCR result ระหว่าง image event → confirm postback (id สั้นใน postback data, TTL ~10 นาที) |
| Test runner | **Jest** (unit, mock GAS globals ผ่าน DI) |
| "E2E" runner | ไม่มี true browser E2E ที่สมจริงสำหรับ LINE+GAS → ใช้ **contract test vs mock OCR + LINE webhook payload replay** (ประกาศตรงๆ) |
| Planning source | เอกสารนี้ + Consumer Integration Brief |

---

## 4. Architecture · Conventions · Layout

**Pattern:** Feature-Based (แบบ pragmatic สำหรับ webhook เดียว).

**Folder layout:**
```
src/
  main.ts              # doPost entry — verify signature → route (message | postback)
  config/              # env keys จาก PropertiesService, constants
  line/                # lineClient (reply/getContent), signature verify, flex builders (confirm/reject/success)
  ocr/                 # ocrClient (call Fit-OCR), ocrMock (contract stub)
  rules/               # business rules (calorieRule ก่อน; backdate/dup ทีหลัง)
  state/               # cacheStore — stash/retrieve OCR result across events
  sheet/               # sheetRepo (submissions + employees)
  types/               # OcrMetrics (25-key contract), domain types
test/                  # Jest specs (mocked globals)
```

**Conventions (code-standards, TS idiom):** camelCase (var/func) · PascalCase (type/interface) · UPPER_SNAKE (const config keys) · ไฟล์ camelCase.ts · async/await ล้วน · ห้าม secret hard-code (Script Properties เท่านั้น).

**UI hard rule:** **ห้ามใช้ emoji ใน Flex/UI/product output ทุกกรณี** — ข้อความ + typography/spacing ล้วน. Flex cards ทุกใบ (confirm/reject/success/trigger) = ไม่มี emoji.

**Semantic color (UX/UI):** สื่อ state ด้วย **สี + text + icon (CSS glyph)** — success=เขียว #1e9e57 · error/reject=แดง #d64545 · info/confirm=น้ำเงิน #2f6fed. ใช้ **status chip + สีค่า + สีปุ่ม** ไม่ใช่แถบ stripe; ไม่พึ่งสีอย่างเดียว (WCAG: มี label+icon เสมอ).

---

## 5. Data model (เราออกแบบ — Sheet ยังไม่มี)

**Tab `submissions`:** `messageId` (dedup key) · `userId` · `name` · `activityType` · `activityDateISO` · `submittedAtISO` · `activeCaloriesKcal` · `totalCaloriesKcal` · `distanceKm` · `source` · `confidence` · `status` (recorded/rejected) · `rejectReason` · `imageHash`.

**Tab `employees`:** `userId` · `name` · `registeredAtISO`. (v1: ครั้งแรกที่ทักมา → register ด้วยชื่อ placeholder/ที่ผู้ใช้พิมพ์; mapping จริงทีหลัง.)

---

## 6. Business rules

| กติกา | v1? | พฤติกรรม |
|---|---|---|
| `activeCaloriesKcal ≥ 150` (fallback `totalCaloriesKcal`) | ✅ thin slice | < 150 → **reject + ตอบเงื่อนไข** |
| Backdate ≤ 1 วัน (รวม "ส่งนอกเวลางาน") | ภายหลัง | เก็บ **activityDate จาก OCR**; ถ้า activityDate เก่ากว่า today เกิน 1 วัน → reject + เหตุผล. ไม่มีข้อจำกัดช่วงเวลาในวัน |
| ไม่ซ้ำ (userId + activityDate) | ภายหลัง | ซ้ำ → reject + เหตุผล. dedup ระดับ event ใช้ `messageId` + LockService |

**Reject ทุกกรณี = ตอบกลับบอกเงื่อนไขที่ไม่ผ่าน** (ไม่เงียบ). reject card โชว์ **ค่าที่ OCR อ่านได้** + status chip แดง + โค้ช 1 บรรทัด — **ไม่มีปุ่มใน card**. "ส่งรูปใหม่" ทำเป็น **LINE quick reply (`cameraRoll`)** ไม่ใช่ปุ่มหลอก. **แจ้งแอดมิน (dispute)** เลื่อนไป **P2** — โผล่เฉพาะเมื่อ fail ซ้ำ ≥3 ครั้งบนกิจกรรมเดิม, 1 dispute/`messageId`. ไม่มีแก้ค่ามือ v1.

**กันสแปม/cost (P1):** sha256 hash รูปในเครื่อง **ก่อน**เรียก OCR → รูปซ้ำ = ไม่เรียก OCR ซ้ำ · rate-limit/user (CacheService เช่น 5/นาที) → เกิน = ตอบคูลดาวน์ ไม่เรียก OCR.

**กันซ้ำ/โกง (3 ชั้น):**
1. **imageHash** (`sha256` จาก API — หรือ hash เอง) เก็บทุกใบใน Sheet, dedup **ทั้งระบบ** → ส่งรูปเดิม/แชร์รูปกัน = reject "รูปนี้เคยส่งแล้ว" (**P1**)
2. rule **(employee+activityDate) unique** + **backdate≤1วัน** → อ้างวันซ้ำ/ย้อนวัน (**P2**)
3. **แก้รูปเปลี่ยนวันที่** (photo editor) — imageHash จับไม่ได้ (byte เปลี่ยน = hash ใหม่) → ต้อง **pHash (perceptual)** จับรูปคล้ายเดิมแต่วันต่าง → **flag admin ตรวจ (ไม่ auto-reject)**, **P3**, imperfect. เก็บ **hash เท่านั้น** ตอนรับ (ไม่เก็บรูป = privacy-safe)

---

## 7. External services & confirmed limits (จาก design research)

- **LINE Messaging API:** webhook อยากได้ `200` ใน ~2 วิ (เกิน → error-stat + อาจ redelivery) · **reply token ฟรีไม่จำกัด**, TTL ~1 นาที (>> OCR latency) · **push ฟรี 200/เดือน** (fallback เท่านั้น) · getContent ดาวน์โหลดทันที · verify signature ทุก request.
- **Google Apps Script:** UrlFetchApp `fetchTimeoutSeconds:10` ✅ ตั้งได้ · payload limit **50 MB** (รูป ~1.5 MB base64 → ~2 MB สบาย) · doPost exec limit · SpreadsheetApp มี daily quota + simultaneous-exec limit · LockService สำหรับ dedup.
- **Fit-OCR API (โปรเจกต์แยก):** `POST /v1/ocr`, Bearer, base64-JSON หรือ multipart, คืน 25-key JSON คงรูป. **URL + token ส่งให้ภายหลัง** (Phase 2/3 ฝั่งเขา). SLA p95 2–3 วิ. `GET /health` ไม่ต้อง auth.

**Image transport:** เลือก **multipart/form-data** (เล็กกว่า base64 ~25–30%, Blob auto-detect ใน GAS).

**Chart = native Flex boxes (P2):** bar chart ง่ายด้วยกล่อง Flex สีสูงต่ำ (height/backgroundColor) — **ไม่มี external service/privacy**. Advanced/line chart (ถ้าต้องเกิน Flex boxes) ค่อยชั่ง QuickChart/self-host ใน stretch.

---

## 8. Risks / open questions

1. **OCR URL+token ยังไม่มี** → build บน **mock** ของ 25-key contract; true E2E ติดจนกว่าจะ handover. (ไม่ block การเริ่ม)
2. **`activityDateISO` = null** → กติกา backdate validate ไม่ได้ → ต้องตัดสิน fallback (แนวโน้ม: reject + ขอรูปที่เห็นวันที่ชัด). **open — ตัดสินตอนถึง slice นั้น**
3. **Scale 1000+ (full rollout):** คอขวด = GAS concurrency + Sheet writes (ไม่ใช่ LINE — reply token ฟรี). → ตั้ง **migration checkpoint** (Cloud Run/Node + DB จริง เช่น Firestore/Supabase) หลัง trial. Trial-first จึงยังใช้ GAS+Sheet ได้.
4. **LINE webhook redelivery** → ต้องมั่นใจ dedup (`messageId`+LockService) idempotent.
5. **Employee identity จริง** — v1 placeholder-name; mapping จริง (HR source?) เป็นงานภายหลัง.
6. **Reply token / getContent TTL** เป๊ะไม่ publish → practice: ใช้/ดาวน์โหลดทันที (conservative). ทั้ง image-event และ postback-event ตอบด้วย reply-token (ฟรี).
7. **CacheService stash หมดอายุ** ก่อนกดยืนยัน (เช่นทิ้งไว้ >10 นาที) → postback หา stash ไม่เจอ → ตอบ 'หมดเวลา ส่งรูปใหม่'. ต้อง handle gracefully.
8. **แจ้งแอดมิน (dispute)** = manual review flow — v1 แค่ log dispute (ชีต/แจ้ง admin), ยังไม่มี auto-resolve. นิยาม channel แจ้ง admin ตอนถึง slice นั้น.
9. **Chart** — ใช้ **native Flex boxes** (P2) ไม่มี external/privacy. เกินกว่านั้น (line/advanced chart) = stretch, ค่อยชั่ง QuickChart/self-host.

---

## 9. Estimation config (สำหรับ /propose — optional; internal → ข้ามได้)

unit = **dev-day** · currency = **THB** · rate = _TBD_ · contingency = **15%** · payment milestones = ต่อ phase. `/propose` รันเฉพาะถ้าเป็นงาน quoted; internal ข้ามไป `/phase`.

---

_Source: Consumer Integration Brief + double grill (2026-07-04) + `docs/research/design-*.md`._
