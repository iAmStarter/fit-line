# Wireframe baseline — canonical prototype frame

The low-fidelity reference every screen maps to BEFORE pixels exist. Copy a block
per screen, fill the `[...]`. The agent validates generated UI against this frame
(METHODOLOGY hard rule 9). Anything the screen renders that this frame does not
describe is **drift** — fix the UI or, if the frame is genuinely missing, update
this file first (`log-decision`).

Keep it low fidelity on purpose: boxes + intent, not styling. Styling lives in the
design tokens / cookbook, not here.

-----

## Global frame (applies to all screens)

```
+--------------------------------------------------+
| [top bar: logo · primary nav · account ]         |  <- persistent
+--------------------------------------------------+
| [breadcrumb / page title ]                        |
|                                                   |
|   [ MAIN CONTENT REGION ]                          |
|                                                   |
+--------------------------------------------------+
| [footer / status ]                                |
+--------------------------------------------------+
```

- Breakpoints: nav collapses to a menu below MD (768px). Content single-column
  below SM (640px).
- Every screen declares: its route, its primary action, its empty/loading/error
  rendering.

-----

## Screen template (copy per screen)

```
### Screen: [name]
- Route:            [/path]
- Goal (one line):  [what the user accomplishes here]
- Primary action:   [the single most important button/intent]
- Entry points:     [how the user arrives]
- Exit / next:      [where they go after the primary action]

Layout (regions, top -> bottom):
  1. [region]   — [content + which components from the inventory]
  2. [region]   — [...]
  3. [region]   — [...]

States:
  - loading:  [skeleton of which regions]
  - empty:    [message + the recovery action — never a dead end]
  - error:    [message + retry]
  - success:  [confirmation / what changes on screen]

Data in / out:
  - reads:    [endpoints from docs/ENDPOINTS.md]
  - writes:   [endpoints]

Responsive notes:
  - mobile:   [what stacks / hides / becomes a sheet]
  - desktop:  [what spreads out]

A11y notes:
  - focus order: [logical tab order]
  - landmarks:   [main / nav / form labels]
```

-----

## Component legend (the inventory the wireframe references)

List every reusable block a screen may place. A screen MAY ONLY use components
named here; a new one is added here first.

```
[Button]        — primary | secondary | ghost | destructive
[Input]         — text | select | date | search   (always labelled)
[Card]          — header + body + optional actions
[Table/List]    — has empty + loading + error states baked in
[Modal/Sheet]   — confirm | form ; sheet on mobile
[Toast]         — success | error | info  (async feedback)
[Nav]           — top bar (desktop) -> menu (mobile)
[...add project components here...]
```

-----

## How to use (agent)

1. New screen -> write its block above from the PLAN acceptance spec.
2. Build the screen to match the block (layout + states + data + a11y).
3. Run the `ux-design` cookbook check. Verdict BLOCK -> fix before CLOSE.
4. Frame too small for a real need -> update this file + `log-decision`, then build.
