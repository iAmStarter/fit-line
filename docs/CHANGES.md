# CHANGES — change-order audit trail (append-only)

Baseline = docs/PROPOSAL.md v1 (approved 2026-07-04). Estimation config: THB, ฿8,000/day, +15% contingency.

```
CR-1 | 2026-07-04 | remove user-confirm step — auto-save immediately when rules pass (image→save→success; drop confirm card + postback-confirm branch) | impact: P1,P2,P3 (done/frozen, ALTERED) + P5 success now immediate; reject/rules/OCR/identity/rich-menu unchanged | effort Δ: +1.5–2.5d | cost Δ: +฿13.8k–23.0k | new total: ฿115k–189k (incl. P3 stretch) | status: APPROVED (owner "Approve — proceed" 2026-07-04) → implemented as Phase 8
```

---

## CR-1 detail — auto-save (no confirm)

**Requested:** "จาก proposal เราจะไม่ให้ user ยืนยันแล้ว เราจะ save เลยหากผ่านเงื่อนไข" — remove the user confirm step; if the submission passes all rules, save to the Sheet immediately and reply the success card. Reject path unchanged.

**Baseline flow (2 webhook events):** image → OCR → rules → PASS → **confirm card** → user taps ยืนยัน (postback) → write Sheet → success card.
**New flow (1 event):** image → OCR → rules → PASS → **write Sheet immediately** → success card. No confirm card, no confirm postback.

### Impact (done phases are FROZEN — their spent cost still counts; this is added rework)
| area | change |
|---|---|
| P1 | `buildConfirmCard` + CacheService stash-across-events removed from the main flow |
| P2 | `appendSubmission` + `ensureEmployee` move from `handlePostback` (confirm) INTO `handleImageMessage` (auto, after rules pass) |
| P3 | **messageId + LockService idempotency MUST move to the image write path** — a webhook redelivery of the image now writes directly, so the lock/dedup that guarded the postback write now guards the image write (critical, not optional). imageHash dedup already in the image path. |
| P5 | success card (summary + bar chart) now rendered immediately on auto-save; counts computed after the auto-insert |
| handlePostback | confirm branch removed; **dispute / help / summary branches unchanged** |
| unchanged | reject flow, all rules (calorie/backdate/dedup), rate-limit, imageHash dedup, OCR client (P6), identity roster + rich-menu (P7), deploy |

### Security re-threat-model (change touches a trust boundary)
- **New risk:** no human-in-the-loop before persist → an OCR misread now auto-records (user can't review/cancel). Mitigation: the rule pipeline still gates every save; still no manual value editing.
- **Heightened:** redelivery double-write — idempotency (messageId+Lock) becomes mandatory on the image path (folded into the effort).
- **Reduced:** postback `id`-tamper surface shrinks (no stash id round-trips through the client).
- Net: acceptable with the idempotency move; the UX/data-integrity trade-off (no user confirm) is the owner's product call.

### Re-estimate (delta only, same config)
- Added rework: refactor image-path auto-save + move lock idempotency (~0.5–1d) · remove confirm card/branch + stash cleanup (~0.25d) · RED→GREEN test realign P1/P2/P3/P5 (~0.5–1d) · re-threat-model + gates + regression (~0.25d) = **+1.5–2.5 dev-days**.
- cost Δ = 1.5–2.5d × ฿8,000 × 1.15 = **+฿13,800–23,000**.
- New total (baseline Core+P3 ฿101k–166k) → **฿115k–189k**.
- **Timeline Δ: +~0.5 week.** Everything else (P0, rules, summary/chart/dispute, real OCR, identity, rich-menu, deploy) is unchanged — the re-price is only the confirm→auto-save seam + its tests.

**status: APPROVED** — owner selected "Approve — proceed" 2026-07-04. Commercial gate + plan re-approval (rule 13) both granted via this decision. Implemented as **Phase 8** (done phases P1/P2/P3/P5 stay frozen; Phase 8 applies the delta).
