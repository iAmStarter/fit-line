# STATE

phase: 0 (pending)
plan: APPROVED 2026-07-04 (owner approved proposal = plan sign-off; scope = Core P0+P1+P2+Integration + P3 stretch ทั้งหมด)
completed: project bootstrapped — double grill + design research done · OVERVIEW.md เขียนแล้ว · PROPOSAL.md (approved+stamped) + proposal-full.html + proposal-design.html · pushed → github.com/iAmStarter/fit-line · GitHub Pages live (serve /docs)
blocker: none — เดินหน้า planner → PLAN.md ได้

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
- PLAN.md **APPROVED** (8 phases: P0 infra + P1–P7 slices, 3 sprints). gate cleared.
1. เริ่ม **/phase Phase 0** (infra): clasp+TS+Jest+Rollup · Script Properties · doPost skeleton 200 · signature-verify (RED-first) · Sheet 2 tab · wire dev webhook. TDD=YES(sig/props)+manual deploy.
2. ต่อ P1→P2→P3→P4→P5→P6(swap real OCR)→P7(final+deploy) sequential.
- OCR URL+token ยังไม่มี → P1–P5 build บน mock; Phase 6 = swap point; true E2E ติดจน handover
- owner-only steps: clasp login · LINE console webhook wiring · real-device E2E (Phase 6)
