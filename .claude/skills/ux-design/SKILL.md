---
name: ux-design
description: >
  The iStartSoft UX cookbook + wireframe baseline. A checklist an agent uses to
  VALIDATE generated UI so it does not drift outside the design frame. Use on
  every UI-facing task: building a screen/component, reviewing a UI diff, or
  before a frontend phase closes. Triggers: "ui", "screen", "component",
  "layout", "design", "ux", "wireframe", "responsive", "accessib", "a11y",
  "ตรวจดีไซน์", "หน้าจอ".
---

# ux-design — cookbook + wireframe frame

Caveman ULTRA mode. UI conforms to the FRAME. Build or change UI -> run this
cookbook before you call it done. Drift outside the wireframe = defect, not
creative liberty (METHODOLOGY hard rule 9).

Read `references/wireframe-template.md` when starting a new screen — it is the
canonical low-fidelity baseline every screen must map to. Read it on demand only.

-----

## When to apply

ALL web / UI work runs this — no exception. Every screen or component is verified
against the cookbook + wireframe and produces a UX CHECK verdict; nothing UI ships
without it. New visual direction (a layout or look the wireframe doesn't cover) is
confirmed with the user before building — design is where human taste matters.

- Building a screen / page / component.
- Reviewing a UI diff (the "ตรวจ" pass).
- CLOSE gate of any frontend phase — the cookbook check MUST pass.

This skill is the STANDARD + the inline GATE (one screen, at phase close). For a
WHOLE-PRODUCT sweep against this same cookbook — periodic or before a release — run
`/ui-audit` (same rubric, broader scope, a scored report).

Order: **wireframe first** (does the layout match the baseline frame?) ->
**cookbook** (do the details obey the system?). Never invent layout the
wireframe does not have. If the design truly needs a frame the wireframe lacks,
STOP and update the wireframe baseline first (a design decision -> `log-decision`).

-----

## The cookbook (check every item)

### 1. Design tokens — no raw values
- Color / spacing / radius / type / shadow come from named tokens, never
  hard-coded hex / px literals scattered in components.
- One source of truth (CSS vars / theme file). New token? add it to the source,
  don't inline it.

### 2. Spacing scale — 8pt grid
- All spacing is a multiple of 4px, prefer 8 (4 · 8 · 12 · 16 · 24 · 32 · 48 · 64).
- No magic margins (`margin: 7px`). Off-grid spacing is a defect.

### 3. Type scale
- A fixed, named ramp (e.g. xs/sm/base/lg/xl/2xl). No arbitrary font-sizes.
- Line-height ≥ 1.4 for body. One primary font family + a fallback stack.

### 4. Accessibility — WCAG 2.1 AA (non-negotiable)
- Text contrast ≥ **4.5:1** (≥ 3:1 for large text ≥ 24px / 19px-bold + UI/icon).
- Every interactive element: keyboard-reachable, visible focus ring, ≥ 44×44px hit area.
- Semantic HTML (`button`/`nav`/`main`/`label`), not `div` soup. Inputs have labels.
- Images have `alt`; icon-only buttons have `aria-label`.
- Color is never the ONLY signal (add text/icon for state).

### 5. Iconography — real icons, never emoji
- Use ONE real icon set (SVG, `currentColor`, one consistent grid + stroke width).
- **NEVER use emoji as UI icons.** They render differently per OS/browser, don't
  inherit color/size cleanly, aren't reliably accessible, and break visual
  consistency. Emoji inside user *content* is fine; emoji as interface iconography
  is a defect — replace with an SVG icon (or a consistent brand accent mark).
- Icon-only controls get an `aria-label`; purely decorative icons get `aria-hidden`.

### 6. Component inventory — reuse, don't reinvent
- Use an existing component before creating one. New component? it earns a place
  in the inventory + the wireframe legend.
- One component = one responsibility.

### 7. State matrix — every interactive element covers all states
- `default · hover · focus · active · disabled · loading · error · empty`.
- Lists/data views handle: **empty**, **loading (skeleton)**, **error**, **partial**.
- No dead-end empty states (always an action or explanation).

### 8. Responsive breakpoints
- Mobile-first. Honor the project breakpoints (XS < 640 · SM 640 · MD 768 ·
  LG 1024 · XL 1280). Layout must not break or overflow between them.
- No fixed widths that overflow small screens. Touch targets hold on mobile.

### 9. Content & i18n
- No hard-coded user-facing strings — go through the i18n layer.
- Text can grow ~30% (translation) without breaking layout. Numbers/dates/currency
  are locale-formatted.

### 10. Feedback & motion
- Every async action has visible feedback (spinner/skeleton/toast) within ~100ms.
- Destructive actions confirm. Motion is subtle, respects `prefers-reduced-motion`.

-----

## RETURN FORMAT (the "ตรวจ" verdict)

```
UX CHECK: <screen/component>
- wireframe match: PASS | DRIFT (<what left the frame>)
- tokens/spacing/type: PASS | FAIL (<which raw values>)
- icons: PASS | FAIL (emoji used as icons / inconsistent set)
- a11y (WCAG AA): PASS | FAIL (<contrast/keyboard/semantic gap>)
- states covered: <list missing, or "all">
- responsive: PASS | FAIL (<breakpoint that breaks>)
- i18n: PASS | FAIL
- VERDICT: PASS | BLOCK (frontend phase cannot close)
```

Sources behind these defaults: WCAG 2.1 AA, Material Design 3 (semantic tokens),
Apple HIG, Shopify Polaris. See `docs/research/design-ux-cookbook-wireframe-pattern.md`.
