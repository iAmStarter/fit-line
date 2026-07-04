# Plan: fit-webhook (LINE OA ↔ Fit-OCR consumer)
<!-- infra: self-managed (Phase 0 below) — clasp / GAS Web App / Script Properties / Sheet -->
> Approval: **APPROVED** by owner (Theerasak Duangkaew) 2026-07-04 — full scope P0–P7 incl. P3 stretch. (hard rule 13 — PLAN-APPROVAL gate cleared)

Scope (owner-approved 2026-07-04): **Core (P0+P1+P2+Integration) + P3 stretch — ทั้งหมด**.
Autonomy: **AUTO**. Docs language: **th** (ศัพท์เทคนิคคง English). UI hard rule: **ไม่มี emoji ทุก Flex/UI output**.

## Reading notes for implementer + test-author (embedded — no extra digging)

- **สถาปัตยกรรมยึด (locked, OVERVIEW §3/§7 + STATE):** `doPost` **synchronous** → verify signature → route → (image path) getContent → OCR → rule → reply ด้วย **reply token** (ฟรีทุก scale, TTL ~1 นาที >> OCR latency). ไม่ใช้ async queue, ไม่ใช้ push (push = fallback 200/เดือน เท่านั้น). `UrlFetchApp` ตั้ง `fetchTimeoutSeconds: 10`.
  - **RISK ที่ต้องจับตา (ไม่ block):** research เดิม (`docs/research/INDEX.md`) ตั้งข้อสังเกต LINE webhook อยากได้ 200 ใน ~2 วิ แต่ OCR 2–10 วิ. **การตัดสินที่ locked แล้ว:** ตอบด้วย reply token ภายใน TTL (~1 นาที) หลัง OCR เสร็จ; ถ้า p95 OCR ทำให้ doPost ยาว → LINE อาจ mark timeout/redelivery → **จึงต้อง dedup ที่ `messageId`+LockService ให้ idempotent (Phase 3)**. ถ้าจริงพบ redelivery รุนแรงตอน Integration → escalate เป็น decision (async trigger) ที่ phase นั้น.
- **OCR contract:** `POST /v1/ocr`, Bearer token, **multipart/form-data** (Blob auto-detect GAS), คืน **25-key JSON** คงรูป (`OcrMetrics`). URL+token **ยังไม่มี** → P1/P2 build บน **`ocrMock`** ที่ implement interface เดียวกับ `ocrClient`. `GET /health` ไม่ต้อง auth.
- **Datastore:** Google Sheet 2 tab `submissions` / `employees` (schema OVERVIEW §5). เราออกแบบ schema; Sheet ยังไม่มี → Phase 0 สร้าง.
- **State:** `CacheService` stash OCR result ข้าม event; key = id สั้นใส่ใน postback `data`; TTL ~10 นาที. หมดอายุ → postback ตอบ "หมดเวลา ส่งรูปใหม่".
- **Secrets:** Script Properties เท่านั้น (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `OCR_BASE_URL`, `OCR_TOKEN`, `SHEET_ID`). ห้าม hard-code / commit `.clasprc.json`.
- **UI/UX:** text ล้วน + semantic color (success `#1e9e57` · error/reject `#d64545` · info/confirm `#2f6fed`) สื่อด้วย **chip + สีค่า + สีปุ่ม + CSS glyph icon + label** (WCAG — ไม่พึ่งสีเดี่ยว, ไม่มี stripe). Reject card = **ไม่มีปุ่ม** + โค้ช 1 บรรทัด + LINE **quick reply `cameraRoll`**.
- **Test discipline (hard rules):** RED-first blind tests (rule 6) · phase gate = suite เขียวจริง (rule 5) · Secure SDLC ต่อ phase (rule 11) · code-standards gate lint/format + TS idiom (rule 12) · log ทุก fix/decision (rule 3/8). "E2E" = **contract test vs mock OCR + LINE webhook payload replay** (ไม่มี true browser E2E สำหรับ LINE+GAS).

---

## Phase 0: infra setup  [3 pts]  [status: done]

- slice: repo ที่ build+test+deploy ได้จริง — `clasp push` ขึ้น GAS Web App, `doPost` skeleton ตอบ 200, signature-verify scaffold พร้อม, Sheet 2 tab สร้าง, Script Properties ตั้งครบ, dev webhook wired.
- rationale: ไม่มี toolchain + deploy path + secrets + datastore skeleton → ทุก phase ถัดไปเขียนไม่ได้. Infra self-managed (clasp/GAS) → Phase 0 นำ.
- architecture: toolchain (clasp+TS+Jest+Rollup, research `design-gas-dev-test-deploy`) · `src/main.ts` entry · `src/config/` (PropertiesService keys) · `src/line/signature.ts` · Sheet schema (OVERVIEW §5) · secrets (research `design-gas-secrets-management`).
- changes: `package.json` · `tsconfig.json` (strict) · `rollup.config` · `jest.config` · `.clasp.json` (+`.claspignore`, ห้าม commit `.clasprc.json`) · `src/main.ts` · `src/config/props.ts` · `src/line/signature.ts` · `test/signature.spec.ts` · `.gitignore` · Sheet tabs `submissions`/`employees` (header rows ตาม schema).
- acceptance (sharp, testable):
  - GIVEN request ที่มี `X-Line-Signature` = valid HMAC-SHA256(body, channelSecret) WHEN `verifySignature(body, sig, secret)` THEN คืน `true`.
  - edge/negative: signature ผิด/หาย/ว่าง → คืน `false` (ไม่ throw). body ว่าง + sig ว่าง → `false`.
  - GIVEN `doPost` ถูกเรียกด้วย body ที่ signature valid WHEN ประมวลผล THEN คืน `ContentService` HTTP 200 (skeleton ไม่ route จริงก็ได้ใน Phase 0).
  - edge/negative: signature invalid → `doPost` คืน 200 (LINE ต้องได้ 200 เสมอ) แต่ **ไม่** ประมวลผลต่อ (log + ignore).
  - GIVEN `getProp('LINE_CHANNEL_SECRET')` เมื่อ key มีใน Script Properties THEN คืนค่า string; เมื่อ key หาย THEN throw error ชื่อ key ชัด (fail-fast ตอน boot).
- impl notes: verify signature = `Utilities.computeHmacSha256Signature` → base64 เทียบ. DI mock GAS globals ใน Jest (Utilities/PropertiesService/UrlFetchApp/CacheService/SpreadsheetApp/LockService) — ตั้ง test harness ตรงนี้ให้ทุก phase ใช้ต่อ. `clasp` deploy = Web App exec-as-me, access anyone. Sheet header ต้องตรง schema เป๊ะ (repo phase ถัดไปเขียน by column name).
- qa focus: signature verify ต้องเป็น **constant-time-ish** เทียบ (อย่างน้อยเทียบ full string ไม่ early-return per-char); key-missing fail-fast; base64 encoding ถูก (LINE ส่ง base64).
- security: **TRUST BOUNDARY — inbound auth.** ASVS **L2**. STRIDE: *Spoofing* (ปลอม webhook) → signature verify บังคับทุก request คือ mitigation หลัก; *Tampering* → verify คุ้ม body integrity; *Repudiation* → log messageId; *Info disclosure* → secrets ใน Script Properties เท่านั้น. Abuse case → acceptance negative (invalid sig ไม่ประมวลผล).
- external: LINE Messaging API (dev channel — webhook wiring). ยังไม่แตะ OCR.
- TDD: **YES** (signature verify + props เป็น pure logic → RED-first). Deploy/wiring = manual verify step (owner-only clasp login + LINE console).

---

## Sprint 1: v1 confirm flow  [goal: ผู้ใช้ส่งรูป → ได้ confirm/reject card → กดยืนยัน → บันทึก Sheet → success card]

## Phase 1: image → OCR(mock) → calorie rule → confirm/reject card  [5 pts]  [status: pending]

- slice: (read path) user ส่งรูป → verify → getContent → OCR(mock) → rule `activeCaloriesKcal ≥ 150` (fallback `totalCaloriesKcal`) → **ผ่าน** ตอบ **confirm card** (กิจกรรม/วันที่/cal + ปุ่ม ยืนยัน/ส่งรูปใหม่) + stash ผลลง Cache; **ไม่ผ่าน** ตอบ **reject card** (โชว์ค่า OCR + เหตุผล + quick-reply cameraRoll). ยังไม่เขียน Sheet.
- rationale: หัวใจ v1 — พิสูจน์ flow รับรูป→อ่านค่า→ตอบ ด้วย mock OCR โดยไม่ต้องรอ OCR จริง. ส่ง demo แรกที่ user เห็นผล.
- architecture: `src/main.ts` router (event `message`(image)) · `src/line/lineClient.ts` (getContent, reply) · `src/ocr/ocrMock.ts` + `src/ocr/ocrClient.ts` (interface เดียวกัน) · `src/types/ocrMetrics.ts` (25-key) · `src/rules/calorieRule.ts` · `src/state/cacheStore.ts` · `src/line/flex/confirm.ts` + `flex/reject.ts`.
- changes: router message-branch · getContent (multipart-ready blob) · ocrMock คืน 25-key ครบ · calorieRule · cacheStore stash (id สั้น + TTL) · Flex builders confirm/reject (semantic color, ไม่มี emoji, reject มี quick-reply cameraRoll ไม่มีปุ่ม).
- acceptance (sharp, testable):
  - GIVEN webhook payload image-message + ocrMock คืน `activeCaloriesKcal=200` WHEN ประมวลผล THEN reply เป็น **confirm** Flex ที่มี text แคลอรี่ = `200`, activityType, activityDate จาก OCR, **ปุ่มยืนยัน** postback มี `data` ที่บรรจุ cache-id; และ cacheStore มี entry คีย์ตาม id นั้น (ค่า = OCR result).
  - GIVEN ocrMock `activeCaloriesKcal=100, totalCaloriesKcal=140` WHEN ประมวลผล THEN reply เป็น **reject** Flex (status chip แดง) โชว์ค่า `active=100`, เหตุผล "แคลอรี่ต่ำกว่าเกณฑ์ 150", **ไม่มีปุ่ม** ใน card, มี **quick reply `cameraRoll`**; และ cacheStore **ไม่มี** entry.
  - fallback: `activeCaloriesKcal=null, totalCaloriesKcal=160` → ผ่าน (ใช้ total). `active=null, total=null` → reject เหตุผล "อ่านค่าแคลอรี่ไม่ได้".
  - edge/negative: OCR โยน error/timeout → reply card แจ้ง "อ่านรูปไม่สำเร็จ ลองใหม่" (ไม่ crash, doPost ยังคืน 200). event ที่ไม่ใช่ image (text/sticker) → ตอบ trigger/แนะนำ (หรือ ignore graceful) ไม่ throw.
  - **UI assertion (rule 9):** Flex JSON ทุกใบ **ไม่มี emoji codepoint**; confirm ใช้สี info `#2f6fed`, reject ใช้ error `#d64545`; มี label+icon-glyph ควบสี.
- impl notes: `getContent` ดาวน์โหลด **ทันที** (availability window ไม่การันตี). reply token ใช้ทันที. ocrMock ต้อง match interface ของ ocrClient เป๊ะ เพื่อ swap ไร้รอย (Phase 6). postback data = compact string (`action=confirm&id=<shortId>`), เลี่ยง data ยาวเกิน limit. calorieRule เป็น pure function (input OcrMetrics → {ok, reason}).
- qa focus: fallback active→total logic (null handling) · cacheStore stash เกิดเฉพาะ path ผ่าน · reject ไม่มีปุ่มจริง (ห้ามปุ่มหลอก) · emoji-free assertion · OCR error ไม่ทำ doPost พัง.
- security: **TRUST BOUNDARY — untrusted image + external OCR call.** ASVS L2. STRIDE: *Tampering/Info-disclosure* → ไม่เก็บรูป (เก็บ hash เท่านั้น, hash มา Phase 3); OCR token Bearer จาก Script Properties; *DoS* → rate-limit/dedup มา Phase 3 (park เป็น follow-up ที่นี่, mock ยังไม่มี cost). abuse case: payload ที่ไม่มี image content → graceful ignore (negative case ข้างบน).
- external: **mock only** (ocrMock). OCR จริงยัง block (URL+token ไม่มี) → true E2E เลื่อน Phase 6.
- TDD: **YES** — RED-first: calorieRule (pure) · router branch · flex builders (assert JSON shape + emoji-free) · cacheStore (mocked CacheService).

## Phase 2: postback ยืนยัน → เขียน Sheet → success card + employee register  [5 pts]  [status: pending]

- slice: (write path) user กด **ยืนยัน** (postback) → อ่าน stash จาก Cache → เขียน row ลง `submissions` (status=recorded) → ถ้า user ใหม่ register ลง `employees` → ตอบ **success card**. ครบ round-trip v1 thin slice.
- rationale: ปิด loop v1 — จากอ่านค่า (Phase 1) สู่ persist จริง + ตอบยืนยัน. นี่คือ milestone จ่ายเงินก้อน 40% (proposal).
- architecture: `src/main.ts` router (event `postback`) · `src/state/cacheStore.ts` (retrieve) · `src/sheet/sheetRepo.ts` (append submission + upsert employee) · `src/line/flex/success.ts`.
- changes: router postback-branch (parse `action=confirm&id`) · retrieve stash · sheetRepo.appendSubmission (map OcrMetrics→row schema OVERVIEW §5) · sheetRepo.ensureEmployee (register ครั้งแรก, ชื่อ placeholder/ที่พิมพ์) · success Flex (semantic green, ไม่มี emoji).
- acceptance (sharp, testable):
  - GIVEN cacheStore มี stash id `abc` (OCR active=200, activityDate=today) WHEN postback `action=confirm&id=abc` THEN row ใหม่ append ลง `submissions` มี `messageId`, `userId`, `activeCaloriesKcal=200`, `status=recorded`; และ reply เป็น **success** Flex (chip เขียว `#1e9e57`) โชว์ "บันทึกแล้ว" + cal.
  - GIVEN userId ยังไม่มีใน `employees` WHEN บันทึกสำเร็จ THEN มี row ใหม่ใน `employees` (`userId`, `name`, `registeredAtISO`). GIVEN userId มีแล้ว THEN **ไม่** เพิ่ม employee ซ้ำ.
  - edge/negative: postback `id` ที่ cache **หมดอายุ/ไม่พบ** → reply "หมดเวลา ส่งรูปใหม่" (quick-reply cameraRoll), **ไม่** เขียน Sheet. postback ซ้ำ (กดยืนยัน 2 ครั้ง, id เดิม, stash ถูก consume/หมด) → ไม่เขียน row ซ้ำ (idempotent-ish: หลัง consume ลบ stash).
  - edge/negative: SpreadsheetApp write throw → reply "บันทึกไม่สำเร็จ ลองใหม่" (ไม่ crash, 200).
  - **UI assertion:** success card emoji-free, สีเขียว, มี label+icon.
- impl notes: หลังเขียน Sheet สำเร็จ → **ลบ stash** (กันกดซ้ำ). map ค่า null OCR → cell ว่าง ไม่ใช่ string "null". `submittedAtISO` = now; `activityDateISO` = จาก OCR (validate จริงมา Phase 4). employee `name` v1 = placeholder (mapping จริง Phase 7).
- qa focus: stash-miss graceful (OVERVIEW risk #7) · employee no-duplicate · row schema mapping ตรง column · double-confirm ไม่ทำ row ซ้ำ · Sheet-write error handling.
- security: **TRUST BOUNDARY — data store write.** ASVS L2. STRIDE: *Tampering* → เขียน by-schema, ไม่รับ column จาก user; *Repudiation* → เก็บ `messageId`+`submittedAtISO`; *Elevation* → postback data ไม่พก field ที่ให้ user แก้ค่าที่บันทึก (ค่ามาจาก stash server-side เท่านั้น ไม่ใช่จาก postback). abuse case: postback ที่ปลอม `id` มั่ว → cache-miss → "หมดเวลา" (negative case).
- external: none (Sheet = local datastore; OCR ยัง mock).
- TDD: **YES** — RED-first: sheetRepo (mocked SpreadsheetApp) · postback router · success flex · stash-miss path.

## Sprint 2: guards + business rules + summary  [goal: กันสแปม/ซ้ำ/โกง + สรุปผล + chart บน card]

## Phase 3: anti-spam guards — sha256 image dedup + per-user rate-limit  [5 pts]  [status: pending]

- slice: ก่อนเรียก OCR → คำนวณ **sha256(image)** ในเครื่อง → ถ้า hash เคยมีใน `submissions` (ทั้งระบบ) = reject "รูปนี้เคยส่งแล้ว" ไม่เรียก OCR; **rate-limit/user** (CacheService, เช่น 5/นาที) เกิน = ตอบคูลดาวน์ ไม่เรียก OCR. เพิ่ม `messageId`+LockService dedup กัน redelivery ซ้ำ.
- rationale: กัน cost OCR + กันโกง (แชร์รูป/ส่งซ้ำ) — ชั้นที่ 1 ของ 3 (OVERVIEW §6). ต้องมีก่อน swap OCR จริง (Phase 6) เพราะจุดนี้คุม cost+abuse.
- architecture: `src/rules/imageDedup.ts` (sha256 + lookup Sheet) · `src/rules/rateLimit.ts` (CacheService counter) · `src/state/lock.ts` (LockService) · hook เข้า router image-path **ก่อน** OCR call · `src/sheet/sheetRepo.ts` (lookup by imageHash).
- changes: sha256 hash blob (`Utilities.computeDigest`) · imageHash lookup ใน submissions · rate-limit counter per userId (TTL 60s) · LockService รอบ messageId dedup + Sheet write · reject cards ใหม่ (duplicate-image, cooldown).
- acceptance (sharp, testable):
  - GIVEN รูปที่ sha256 = `H` และ `submissions` มี row ที่ `imageHash=H` WHEN ส่งรูปนั้น THEN reply reject "รูปนี้เคยส่งแล้ว" (chip แดง), **ไม่** เรียก OCR (ocrMock spy = 0 call).
  - GIVEN userId ส่งรูปครั้งที่ 6 ภายใน 60 วิ (limit=5) WHEN ประมวลผล THEN reply cooldown "ส่งบ่อยเกินไป รอสักครู่", **ไม่** เรียก OCR. GIVEN ครั้งที่ 5 → ยังผ่านปกติ.
  - GIVEN webhook redelivery `messageId` เดิม (LINE ส่งซ้ำ) WHEN ประมวลผลพร้อมกัน/ซ้ำ THEN เขียน submission แค่ **1 row** (LockService + messageId dedup).
  - edge/negative: hash lookup ขณะ Sheet ว่าง → ไม่ crash, ถือว่าไม่ซ้ำ. LockService `waitLock` timeout → reply "ระบบไม่ว่าง ลองใหม่" (ไม่ double-write). rate-limit counter หมดอายุ → นับใหม่ปกติ.
- impl notes: hash ต้องคำนวณ **ก่อน** OCR (cost gate). `imageHash` = hex ของ sha256 blob bytes. rate-limit key = `rl:<userId>`, increment + TTL 60s. LockService scope: getScriptLock, waitLock(~10s). messageId dedup: เช็ค `submissions.messageId` ภายใน lock ก่อน write. imageHash dedup = **ทั้งระบบ** (ไม่ผูก user).
- qa focus: OCR-not-called assertion (spy) เมื่อ dup/cooldown · idempotency ใต้ redelivery (OVERVIEW risk #4) · rate-limit boundary (5 ผ่าน, 6 บล็อก) · lock-timeout graceful.
- security: **TRUST BOUNDARY — abuse/DoS + integrity.** ASVS L2. STRIDE: *DoS* → rate-limit + hash-gate คุม OCR cost; *Tampering/fraud* → imageHash dedup ทั้งระบบกันแชร์รูป; *Repudiation* → imageHash เก็บทุก row. **privacy: เก็บ hash เท่านั้น ไม่เก็บรูป.** abuse cases = negative cases ข้างบน (dup, flood, replay).
- external: none (mock OCR + spy).
- TDD: **YES** — RED-first: sha256 determinism · dedup lookup · rate-limit counter boundary · lock/idempotency (mocked LockService + SpreadsheetApp).

## Phase 4: business rules — backdate ≤ 1 วัน + no-duplicate (employee+activityDate)  [3 pts]  [status: pending]

- slice: เพิ่มกติกา P2 ใน 확인 path: **backdate ≤ 1 วัน** (activityDate เก่ากว่า today เกิน 1 วัน → reject) รวม null-handling; **ไม่ซ้ำ** (userId + activityDate มีใน `submissions` แล้ว → reject). เสริม reject reasons.
- rationale: ชั้นกันโกงที่ 2 (OVERVIEW §6) — อ้างวันซ้ำ/ย้อนวัน. ต่อยอดจาก calorieRule (Phase 1) และ dedup (Phase 3).
- architecture: `src/rules/backdateRule.ts` · `src/rules/dedupDateRule.ts` (lookup submissions by userId+activityDate) · rule pipeline ใน router image-path (หลัง OCR, ก่อน confirm). `src/sheet/sheetRepo.ts` lookup by (userId, activityDate).
- changes: backdateRule (compare activityDateISO vs today, ≤1d) + null decision · dedupDateRule (Sheet lookup) · ต่อ rule pipeline (calorie → backdate → dedupDate) · reject cards ใหม่ (too-old, duplicate-date).
- acceptance (sharp, testable):
  - GIVEN today = `2026-07-04`, OCR `activityDateISO=2026-07-04` WHEN ประมวลผล THEN ผ่าน (confirm). GIVEN `activityDateISO=2026-07-03` (1 วันก่อน) THEN ผ่าน. GIVEN `2026-07-02` (2 วันก่อน) THEN reject "วันที่กิจกรรมเก่าเกินกำหนด (ย้อนหลังได้ ≤ 1 วัน)".
  - GIVEN OCR `activityDateISO=null` WHEN ประมวลผล THEN **reject** "อ่านวันที่จากรูปไม่ได้ ส่งรูปที่เห็นวันที่ชัด" (decision OVERVIEW risk #2 — reject fallback).
  - GIVEN `submissions` มี row (userId=`U`, activityDate=`2026-07-04`, status=recorded) WHEN U ส่งรูป activityDate=`2026-07-04` THEN reject "วันนี้บันทึกไปแล้ว".
  - edge/negative: activityDate เป็น **อนาคต** (`2026-07-05`) → reject "วันที่กิจกรรมไม่ถูกต้อง". rule order: cal<150 + also-old → reject ด้วยเหตุผล **แรกที่ fail** (calorie ก่อน) — deterministic.
- impl notes: เทียบวันแบบ **date-only** (ตัด time, timezone = Asia/Bangkok). "≤ 1 วัน" = today หรือ yesterday ผ่าน; เก่ากว่านั้น fail; อนาคต fail. dedupDate lookup เฉพาะ status=recorded (rejected ไม่นับ). pipeline สั้น-circuit ที่ fail แรก.
- qa focus: boundary วัน (today/-1/-2/+1) · null activityDate → reject (ไม่ใช่ pass เงียบ) · dedupDate ไม่นับ rejected rows · rule-order determinism.
- security: **TRUST BOUNDARY — data-integrity/fraud rule.** ASVS L2. STRIDE: *Tampering* → backdate+dup กันปลอมวัน; note: imageHash (Phase 3) กัน byte-identical แต่ **แก้รูปเปลี่ยนวัน (pHash)** = Phase 7, imperfect, flag-admin ไม่ auto-reject. abuse cases = backdate/future/dup negative cases.
- external: none.
- TDD: **YES** — RED-first: backdateRule boundary table · null-handling · dedupDateRule (mocked Sheet) · pipeline order.

## Phase 5: summary + native bar chart + expanded reject + admin-dispute log  [5 pts]  [status: pending]

- slice: success card แสดง **summary** (count สัปดาห์/เดือน/รวม ของ user) + **bar chart (native Flex boxes)**; reject flow ขยาย (เมื่อ fail ≥3 ครั้งบนกิจกรรมเดิม → เพิ่มปุ่ม/ทาง "แจ้งแอดมิน" → log dispute 1/messageId).
- rationale: ปิด P2 — feedback ที่ user เห็นความคืบหน้า + ช่องทาง dispute manual (OVERVIEW §6/risk #8). ไม่มี external service (chart = Flex boxes → privacy-safe).
- architecture: `src/sheet/sheetRepo.ts` (aggregate count by userId/period) · `src/line/flex/success.ts` (+ summary section + bar chart boxes) · `src/rules/disputeGuard.ts` (fail-count ≥3 per activity) · `src/sheet/sheetRepo.ts` (dispute log tab หรือ column) · state fail-counter (CacheService per userId+activity).
- changes: summary aggregate (week=จันทร์-อาทิตย์ปัจจุบัน, month=เดือนปัจจุบัน, total) · bar chart = Flex box array (height ∝ ค่า, backgroundColor semantic, ไม่มี external) · reject card เพิ่ม dispute affordance เมื่อ fail≥3 · dispute log (append, 1/messageId).
- acceptance (sharp, testable):
  - GIVEN userId มี submissions recorded 3 rows สัปดาห์นี้, 5 เดือนนี้, 10 รวม WHEN บันทึกสำเร็จ THEN success card โชว์ "สัปดาห์นี้ 3 · เดือนนี้ 5 · รวม 10" (นับหลัง insert row ใหม่).
  - GIVEN ค่ารายวัน 7 วันล่าสุด `[100,150,0,200,150,0,300]` WHEN render THEN bar chart = 7 Flex box, box สูงสุด (300) height มากสุด, box ค่า 0 height ต่ำสุด/ขั้นต่ำ, **ไม่มี external image URL** ใน JSON (เป็น box ล้วน).
  - GIVEN userId fail กิจกรรมเดิมครบ 3 ครั้ง WHEN reject ครั้งที่ 3 THEN reject card มี affordance "แจ้งแอดมิน"; กด → append **1** dispute log (`messageId`, `userId`, reason, ts). กดซ้ำ messageId เดิม → **ไม่** เพิ่ม dispute ซ้ำ.
  - edge/negative: user ไม่มี submission → summary "สัปดาห์นี้ 0 · เดือนนี้ 0 · รวม 0", chart แสดง baseline ว่าง (ไม่ crash). fail < 3 → **ไม่** มี dispute affordance.
  - **UI assertion:** chart + summary emoji-free; bar boxes ใช้ semantic color; chart ไม่พึ่งสีเดี่ยว (มี label ค่า).
- impl notes: aggregate query = scan submissions filtered userId+status=recorded (trial scale OK; scale=migration checkpoint OVERVIEW risk #3). week boundary = Asia/Bangkok, จันทร์เริ่ม. bar height = normalize ต่อ maxค่า → px range. dispute = fail-counter ใน CacheService key `fc:<userId>:<activity>` TTL พอเหมาะ; dispute log = tab/column append idempotent per messageId.
- qa focus: count correctness (week/month/total boundaries) · chart = **Flex boxes ไม่มี external URL** (privacy) · dispute 1/messageId idempotent · fail≥3 threshold exact · empty-user graceful.
- security: **TRUST BOUNDARY — data aggregation + dispute log write.** ASVS L2. STRIDE: *Info-disclosure* → summary เฉพาะของ user นั้น (filter userId, ไม่ leak คนอื่น); *Repudiation* → dispute log ผูก messageId+ts; **privacy** → chart no external service (ไม่ส่งข้อมูลออก). abuse: dispute spam → 1/messageId (negative case).
- external: none (chart native, no QuickChart).
- TDD: **YES** — RED-first: aggregate counts (mocked Sheet rows) · chart box shape/no-URL · dispute idempotency · fail-count threshold.

## Sprint 3: integration + stretch  [goal: ต่อ OCR จริง + deploy สาธารณะ + stretch features]

## Phase 6: Integration / handover — swap mock → real OCR + real E2E  [3 pts]  [status: pending]

- slice: เปลี่ยน `ocrMock` → `ocrClient` จริง (real OCR URL+token จาก Script Properties) → contract-test/real E2E ต่อ OCR จริง → เปิด public exposure (dev channel) พร้อมใช้.
- rationale: จุด swap ที่ proposal ระบุ — OCR จริงมาทีหลัง (ฝั่งเขา Phase 2/3). ก่อนหน้าทั้งหมด build บน mock; ที่นี่พิสูจน์ end-to-end จริง. **นี่คือ phase ที่ external service ต้อง hit จริง.**
- architecture: `src/config/props.ts` (`OCR_BASE_URL`, `OCR_TOKEN`) · `src/ocr/ocrClient.ts` (multipart POST `/v1/ocr`, Bearer, parse 25-key) · router สลับ client จาก mock (env/flag) → real · `test/contract/ocr.contract.spec.ts` (hit real `/health` + `/v1/ocr` ด้วยรูปตัวอย่าง).
- changes: ocrClient จริง (multipart/form-data, `fetchTimeoutSeconds:10`, Bearer) · wiring flag mock↔real · contract test vs **real** OCR (`GET /health` 200 no-auth; `POST /v1/ocr` คืน 25-key) · verify mock/real interface parity · deploy dev channel + public webhook.
- acceptance (sharp, testable):
  - GIVEN `OCR_BASE_URL`+`OCR_TOKEN` ตั้งใน Script Properties WHEN `ocrClient.recognize(imageBlob)` เรียก real API THEN คืน `OcrMetrics` 25-key ครบ, field ตรง type contract (numbers เป็น number, dates ISO). **(hits real OCR service.)**
  - GIVEN `GET {OCR_BASE_URL}/health` WHEN เรียก (no auth) THEN 200.
  - GIVEN real E2E: ส่งรูป workout จริงผ่าน dev LINE channel WHEN full flow THEN ได้ confirm card < ~10 วิ; กดยืนยัน → row ลง Sheet + success card. **(manual staged, real device — owner step.)**
  - edge/negative: OCR token ผิด/หมดอายุ → ocrClient คืน error handled → reply "อ่านรูปไม่สำเร็จ" (ไม่ crash). OCR timeout >10s → handled เดียวกัน. real API คืน field ไม่ครบ 25-key → parse graceful (missing → null, ไม่ throw).
- impl notes: **mock↔real ต้อง interface เดียวกัน** (ที่ตั้งไว้ Phase 1) → swap = สลับ implementation ไม่แก้ caller. multipart Blob auto-detect GAS. ถ้าตอน E2E พบ LINE redelivery/timeout รุนแรง (research concern) → escalate เป็น decision (async trigger) + log (rule 8). real-device LINE OAuth/verify = **owner-only step** (ระบุเป็น statement ไม่ใช่คำถาม, per AUTO).
- qa focus: mock/real parity (25-key) · real `/health` + `/v1/ocr` hit จริง · timeout/auth-error handling · E2E latency < ~10 วิ · missing-field graceful.
- security: **TRUST BOUNDARY — outbound auth to external service (HARD-STOP class: outbound + secrets).** ASVS L2. STRIDE: *Info-disclosure* → OCR token ไม่ log, Script Properties เท่านั้น, ส่งรูป over TLS; *Spoofing* → verify OCR base URL. **security review + secrets/SAST/SCA scan ก่อน public exposure** (rule 11 pentest gate). abuse: token leak → rotation policy (quarterly, research `secrets-management`).
- external: **Fit-OCR API (REAL)** — test ต้อง hit real service (`/health` + `/v1/ocr`). LINE dev channel (real webhook).
- TDD: contract test = **YES** (assert 25-key shape vs real). real E2E = manual staged (no true browser E2E for LINE+GAS) — owner-executed.

## Phase 7: P3 stretch — real identity mapping + rich-menu trigger + advanced chart  [FINAL code phase]  [5 pts]  [status: pending]

- slice: employee **identity mapping จริง** (แทน placeholder-name) · **rich-menu trigger** (ปุ่มบอกวิธีส่งรูป/summary) · **advanced/line chart** (เฉพาะถ้าเกิน Flex boxes — ชั่ง QuickChart/self-host). ปิดงาน + **final deploy**.
- rationale: stretch ที่ owner approve (in-scope ทั้งหมด). identity mapping = แก้ risk #5; rich-menu = UX เข้าถึงง่าย; advanced chart = ถ้า native Flex ไม่พอ. เป็น phase สุดท้าย → รับ **deploy task บังคับ**.
- architecture: `src/sheet/sheetRepo.ts` employees mapping (HR source/manual roster) · `src/line/richMenu.ts` (rich-menu setup + postback trigger) · `src/line/flex/chart.ts` (advanced — **decision gate:** ถ้าต้อง external chart → log-decision QuickChart-vs-self-host vs อยู่กับ Flex boxes) · deploy config.
- changes: identity resolve (map userId → ชื่อจริงจาก roster tab, fallback placeholder) · rich-menu JSON + register + trigger handler · advanced chart (conditional) · final deploy + ENDPOINTS.md.
- acceptance (sharp, testable):
  - GIVEN roster tab มี (userId=`U` → name=`สมชาย`) WHEN U บันทึกสำเร็จ THEN success card + submissions row ใช้ `สมชาย` (ไม่ใช่ placeholder). GIVEN userId ไม่มีใน roster → fallback placeholder (ไม่ crash).
  - GIVEN rich-menu ติดตั้ง WHEN user กดปุ่ม "วิธีส่งรูป" THEN ตอบ trigger card (วิธีใช้ + quick-reply cameraRoll); กด "สรุปของฉัน" THEN ตอบ summary card.
  - GIVEN advanced chart (ถ้า implement) WHEN render THEN chart แสดงถูก + **ถ้าใช้ external service → log-decision privacy trade-off** (rule 8). ถ้าตัดสินว่า Flex boxes พอ → skip advanced (log เหตุผล).
  - edge/negative: roster ว่าง → ทุกคน placeholder (graceful). rich-menu postback ที่ไม่รู้จัก → ignore graceful.
- impl notes: identity mapping source (HR/manual) = ยืนยันตอนถึง slice (OVERVIEW risk #5). advanced chart = **decision gate** privacy (external service ส่งข้อมูลออก) → default อยู่กับ native Flex เว้นมีเหตุจำเป็น. rich-menu = one-time setup call + postback route.
- qa focus: identity fallback graceful · rich-menu postback routing · advanced-chart privacy decision logged · deploy smoke green.
- security: **TRUST BOUNDARY — identity/PII (roster names) + final public exposure.** ASVS L2. STRIDE: *Info-disclosure* → roster names = PII → เก็บใน Sheet เท่านั้น, ไม่ log; advanced chart ถ้า external → **PII/privacy review บังคับ** (rule 11). **final security review + pentest gate ก่อน deploy** (rule 11). abuse: roster-miss → fallback (negative case).
- external: LINE (rich-menu API, real) · advanced chart external service **เฉพาะถ้าตัดสินใช้** (decision-gated) · OCR real (จาก Phase 6).
- deploy task:
  - smoke-test the deployed base URL: GET /health (or equivalent) returns 200
    (fit-webhook = GAS Web App → smoke = `doPost` ต่อ dev channel ตอบ 200 บน invalid-sig payload + real image round-trip; ถ้ามี `/health`-style exec URL → 200)
  - update docs/ENDPOINTS.md with the final deployed base URL (GAS Web App exec URL + LINE dev webhook URL)
- TDD: **YES** สำหรับ logic (identity resolve, rich-menu routing) — RED-first; advanced chart + rich-menu register = staged manual (owner). Final deploy smoke = manual verify.
