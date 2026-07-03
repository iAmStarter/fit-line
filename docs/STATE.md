# STATE

phase: 0 (pending)
plan: PENDING (รอ human approve proposal → เป็น plan sign-off ด้วย)
completed: project bootstrapped — double grill + design research done · OVERVIEW.md เขียนแล้ว · PROPOSAL.md + proposal-full.html + proposal-design.html (mockup 4 การ์ด semantic-color, animated system flow, plan/estimate, bar chart จริง, charset ฝัง, 0 emoji)
blocker: รอ human อนุมัติ proposal (commercial+plan gate)

## Locked decisions (จาก grill+research)
- LINE webhook consumer (GAS) · sync + reply-token (ฟรีทุก scale) · Thai docs · AUTO mode
- Flow: 2 events (รูป→OCR→confirm/reject card · postback→Sheet→success) · CacheService stash
- Stack: TS + GAS(clasp) · Jest + contract-test · Google Sheet (submissions+employees) · verify X-Line-Signature
- v1 thin slice = cal≥150 confirm flow · P2 = backdate≤1d + no-dup + summary + bar chart(native Flex) · P3 stretch = identity/rich-menu/advanced chart
- UI: text ล้วน ไม่มี emoji · semantic color via chip+value+icon (WCAG) · ไม่มีแถบ stripe
- Reject card = ไม่มีปุ่ม + โค้ช + LINE quick-reply(cameraRoll); แจ้งแอดมิน→P2 (โผล่เมื่อ fail≥3)
- กันสแปม/cost P1 = sha256 dedup + rate-limit/user (CacheService)
- กันซ้ำ/โกง 3 ชั้น: **imageHash dedup ทั้งระบบ (P1)** · (employee+activityDate)+backdate≤1วัน (P2) · pHash flag-admin สำหรับรูปแก้วันที่ (P3, imperfect). System Flow diagram สะท้อน guard เหล่านี้แล้ว
- Estimate: Core ฿83k–129k (@฿8k/day placeholder, +15%) · 30/40/30

## NEXT (fresh session)
1. รับ proposal approval → stamp PROPOSAL.md + STATE `plan: approved <date>` + HISTORY line
2. รัน planner → PLAN.md ; สร้าง ISSUES.md / HISTORY.md / ENDPOINTS.md (ยังไม่ได้สร้าง)
3. PLAN-APPROVAL gate → เริ่ม /phase (Phase 0 bootstrap: clasp+TS+Jest, Script Properties, deploy skeleton)
- OCR URL+token ยังไม่มี → build บน mock; true E2E ติดจน handover
