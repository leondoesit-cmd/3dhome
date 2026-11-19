# UI review: verdicts and execution plan

Checked 2026-11-16 on branch `planner-mobile-pbr` (working tree with uncommitted changes).
Source: the external "bug fixes, state sync and UI polish" review covering Planner, Model and Cabinet.

How each claim was checked: code reading for all of them; a live run (scratch origin, port 8791,
Furnished demo, 1440×900) for the ones marked **run**. The browser pane has no usable GPU, so
anything that depends on 3D pixels is marked **needs GPU** and must be reproduced in a real
browser before work starts.

No code was written. This file is the plan only.

## 1. Verdict per claim

Legend: ✅ confirmed · ◐ partly right (wrong cause, scope or fix) · ❌ wrong or already exists ·
🅿 product decision, not a bug · ❓ not reproduced.

### Section 1 — Planner state, layers, floors

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Status bar stale after Inspector resize | ◐ **run** | The readout is rebuilt only after a 2D render (`js/cad_hud.js:235` `onAfterRender(updateCadHud)`). In Plan it updates at once. In 3D the bar is still on screen and stays stale: width 100→150 left "100 cm × 60 cm" until the next return to Plan. The bar shows width × depth only (`cad_hud.js:510-512`), so a height change never appears there. No per-item price exists in that bar; the "₪990" location was not found. |
| 1.2 | Inspector 3D preview does not frame the selection | ❓ needs GPU | Code frames the selection box on every selection-key change (`js/inspector_preview.js:166`, `:496-515`). |
| 1.3 | Selection survives a preset switch | ✅ **run** | `applyPreset` and `setWorkSet` never touch `S.sel` (`js/ui_layers.js:127-133`, `:628-639`). Wardrobe stayed selected after Services. Clearing for *faded* layers is wrong: ghosted layers are selectable by design. Only *hidden* should drop the selection. |
| 1.4 | Cross-layer selection needs a toast or auto-switch | ❌ | Already there: the status text plus a blocked-drag pill on the drag attempt (`ui_layers.js:979-1100`). Auto-switching on click would fight `followTool`. |
| 1.5 | Active editing layer can stay Hidden | ✅ **run** | Furnish preset (Services hidden), then click the Services row name: `workSet = mep`, `vis = hide`. `setWorkSet` does not change visibility. Sub-fix 2 ("align layer with tool") already exists as `followTool` (`ui_layers.js:1213`); "kept" is the deliberate opt-out. Sub-fix 3 (a "Visible" badge) is noise: the tag is empty for the normal state on purpose (`ui_layers.js:290`). |
| 1.6 | Preset does not switch the ribbon tab | ✅ **run** | True, and by design today (presets set layers and walls only). Reasonable one-way improvement. |
| 1.7 | New empty floor keeps "Services · kept" | ✅ code | `js/floors.js:319-327` never touches `workSet` or `workSetPinned`. Only matters when pinned; unpinned, the Wall tool already moves the layer. |
| 1.8 | `<title>` stuck on "Home Planner · 3D" | ✅ **run** | Single assignment, `js/i18n.js:100`, from the string `title` (`js/i18n/en.js:253`). |

### Section 2 — Cabinet logic

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Shoe shelves default Count is 0 | ◐ | Real mismatch, different cause: the Count field falls back to `STD.shelfSpace` (36) for shoe (`js/ui_cabinet_inspect.js:401`) while the layout uses `STD.shoeSpace` (19) (`js/cabinet/layout.js:495`). For 420/190 the field says 0 and the layout builds 1 shelf. "Empty in 2D and 3D" is not what the code does for those numbers (❓). The proposed `floor(h / spacing)` is wrong: the house rule is `round(h / spacing) - 1` and changing it would re-shelve every saved cabinet. Drawers already default to ≥ 1. |
| 2.2 | "No production convention" is passive text | ✅ **run** | Static span (`js/ui_cabinet.js:1045`, `:1064`). |
| 2.3a | "1 rails" | ✅, wider | No singular form for any of the five nouns, in either language (`js/cabinet/labels_plan.js:118-122`): "1 columns", "1 doors"… |
| 2.3b | Title should show the preset name | 🅿 | The design preset is not stored on the cabinet (`ui_cabinet.js:1096`); needs a new saved field, and it goes stale after the first edit. |

### Section 3 — Model studio

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 3.1 | cm in Model vs mm in Cabinet | ✅ | Heading hard-codes "(cm)" (`js/modeler/editor_forms.js:847`), values are raw cm; the Model placeholder says "430mm" (`js/pro_shell.js:59`). The modeler has its own unit setting (`modelLengthUnit`, `js/modeler/sketch_workflow.js:573`) that this panel ignores. |
| 3.2a | Two sketch banners at once | ❓ plausible | `coachSuggestion` (`js/modeler/welcome_coach.js:258-273`) never checks `E.facePick`; the face prompt is shown by `syncFacePrompt` (`sketch_workflow.js:325`). Not reproduced. |
| 3.2b | "Finish sketch" visible before a sketch starts | ❌ **run** | Hidden outside a sketch (`js/modeler_commands.js:153`, `js/modeler_chrome.js:28-31`). On Blank part the editor is already in a sketch, so the button is correct. |
| 3.3 | Dock a right-hand property manager | 🅿 | Layout redesign. |

### Section 4 — Duplication and labels

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Partition controls in three places | ◐ **run** | Two places: ribbon Design › Interior (`js/pro_catalog.js:130`) and the context bar (`js/ui_cabinet.js:135-138`). The Inspector's Split column / Split compartment are different operations. Real defect: the same action is "Erase partition" in one and "Remove partition" in the other (`js/ui_cabinet_ctx.js:82`, `:199`). |
| 4.2 | Two "Drawing" labels in Model | ✅ **run** | View switcher (`modeDrawing`, `js/modeler_strings.js:278`) and ribbon tab (`js/uikit_host/ribbon.js:155`). Hebrew already differs. |
| 4.3 | Two 2D / 3D / Split switchers in Cabinet | ✅ | Header (`ui_cabinet.js:141-143`) and View › Mode (`pro_catalog.js:136`). |
| 4.4 | "Room" duplicates the Planner tab | ❌ **run** | Misread. `#cbDock` is "Design beside the room" (dock the designer next to the 3D apartment), not a way back to the Planner. The label is the problem. |
| 4.5 | Floating layer pill duplicates the sidebar | ◐ **run** | `#psLayersChip` (`js/pro_compact.js:709`) is shown with the Library tab open, where it is the only layer cue. Redundant only while the Layers tab is open; that state was not checked. |
| 4.6 | Review & export strip repeats the Production ribbon | 🅿 **run** | Both exist. Hiding the strip per tab makes the Inspector jump. |
| 4.7 | "This cabinet only" has no label | ✅ **run** | The label is in the markup and hidden on purpose: `css/pro_skin.css:1183` sets `font-size: 0`. |
| 4.8 | "over Ground floor" pill unclear | ✅ | Static `span.floor-ref-note` beside the real toggle (`js/planner_chrome.js:242-265`). It is not an elevation, so the "+300 cm" idea is a misreading. |
| 4.9 | "Engineering" mode for the ribbon | 🅿 | Information-architecture change. |

### Section 5 — Layout and truncation

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 5.1 | Labels overlap values in Cabinet parameters | ✅ CSS | The override makes the label wrap and overflow visibly (`css/styles_16_dial_lava_layers.css:1422`) but the base rule still caps it at `max-width: 42px; flex: none` (`css/styles_04_model_editor.css:2077-2080`), so long words spill over the input. Not seen live (needs a cabinet opened in Model). |
| 5.2 | Clipped subtitles | ◐ **run** | Both already use ellipsis. The tree row is covered by something on the row rather than clipped by its box (name box 147 px, no overflow), and its `title` is the internal id, not the text. The Cabinet subtitle has no tooltip. |
| 5.3 | Orphan "mm" in the Cabinet status bar | ❌ **run** | Misread: it is the units indicator (`ui_cabinet.js:1046`). Unlabelled, so it reads as orphaned. |
| 5.4 | Command placeholder cut mid-word | ✅ **run** | Input is 190 px for 71–75 characters in all three studios (`js/pro_shell.js:53-66`, `fitCommandBar` `:483`). |
| 5.5a | Status bar collapses in split | ◐ | Priority rules exist but key on viewport width (`css/pro_ribbon.css:1036-1040`), so a half-width pane on a wide screen misses them. |
| 5.5b | Hint bar truncated in split | ◐ | Deliberate ellipsis (`pro_ribbon.css:923`); the text is simply too long for that pane. |
| 5.5c | "Walls: Down" clipped, dimension under the hint bar | ❓ needs GPU | |
| 5.5d | Ribbons need scroll indicators | ❌ | Already there (`js/pro_ribbon.js:525-535`, `pro_ribbon.css:277-296`). |

### Section 6 — Viewports

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 6.1 | 3D orbit gizmo shown in Plan | ❌ **run** | Misread: Plan has its own 2D gizmo with N (`js/plan2d.js:322-437`, `.plan-gizmo`); the 3D one is hidden. |
| 6.2 | Room stamps and dimensions collide with MEP badges | ◐ | Stamps avoid other labels (`js/plan2d/constraints.js:218`) but MEP nodes are not obstacles. Dimension text already has a backing (`js/plan2d/dim_chains.js:126-142`). |
| 6.3 | Overlay dimensions cross furniture in Dollhouse | ◐ needs GPU | No Dollhouse branch in `js/planner_drawing.js`; interior chains come from the ray rule at `:6-61`. |
| 6.4 | MEP floats above cut walls | ✅ code, needs GPU | Nothing in the cutaway touches `mepRoot` (`js/view3d/items_layers.js:395`, `:580-583`). |
| 6.5 | MEP runs are 1 px hairlines | ❌ | They are cylinders and boxes (`js/mep/drawing.js:325-457`). Thin because conduit is thin. |
| 6.6 | Drawing overlay card not anchored | ✅ | Fixed CSS offsets, `bottom: 136px` (`css/styles_02_toolbar_hud.css:1776-1811`). |
| 6.7 | Thumbnail labels collide ("340450") | ✅ code | Only gate is `h > 22 && w > 44` (`js/ui_cabinet_view.js:739-746`), also in the thumbnail pass. |
| 6.8 | Low-contrast compartment sub-labels | ✅ code | Muted 10 px text, no backing (`ui_cabinet_view.js:741-744`). |
| 6.9 | Cabinet 3D split: auto-frame and Reset view | ◐ | Fixed distance 420, no reset control (`ui_cabinet_view.js:1651-1687`). |
| 6.10a | Model faces blow out to white | ❓ needs GPU | Ambient 0.6 + key 0.95 + fill 0.35, ACES, exposure 1.1 (`js/editor_view.js:132-167`). |
| 6.10b | Add SSAO and a studio backdrop to Planner | ❌ / 🅿 | Ambient occlusion already runs (GTAO, `js/view3d/renderer_setup.js:115-198`). A studio backdrop is a new feature and cuts against the physical-light rule. |
| 6.11 | Two-storey graphic in the floor tip | 🅿 | Cosmetic. |

Score: of 47 claims, 18 hold as written, 12 are partly right, 9 are wrong or already built,
5 are product decisions, 3 could not be reproduced without a GPU browser.

## 2. What is wrong with the review itself

1. **No reproduction data.** No view mode, window size, build or steps. Claim 1.1 is only true in
   3D; 5.5 depends entirely on width. Every item needs: studio, view, window size, steps, expected,
   actual.
2. **Elements misidentified from screenshots.** "Room" (4.4), "mm" (5.3), the Plan gizmo (6.1),
   "three places" for partitions (4.1), the elevation reading of "over Ground floor" (4.8).
3. **Asks for things that exist.** Ambient occlusion, tubular MEP, ribbon scroll arrows, the
   blocked-drag pill, tool-follows-layer, ellipsis, dimension backing.
4. **Prescribes fixes without reading the code.** `floor(height / spacing)` would change every saved
   cabinet; the flex snippet for 5.1 misses that the cause is a leftover `max-width`.
5. **Fights documented design.** Ghosted layers are meant to be selectable; "kept" is a user pin;
   the empty layer tag is intentional.
6. **Bugs, polish and redesigns in one flat list**, opened with "implement the following". Split
   into defects (with severity), polish, and proposals that need a decision.
7. **Under-reports.** Plurals are broken for all five nouns in both languages, not just "rails";
   Erase/Remove naming; the status bar never shows height at all.
8. **Section 7 is right** and stays as a regression note: the project cost chip (`#costChip`) is
   separate from the status readout.

## 3. Execution plan (accepted items only)

Rules for every step: new code goes in the existing area file, no growth of the core files, strings
in both `js/i18n/en.js` and `js/i18n/he.js` (or the module's own two-language table), behaviour
tests over source regexes, then `npm run check` and `npm run test:changed`. Several target files
have uncommitted changes (`js/pro_shell.js`, `js/pro_catalog.js`, `js/ui_cabinet.js`, both i18n
files, `css/ui_system.css`): land or commit that work first, or these steps will tangle with it.

### Phase A — defects (do first, one commit each)

| Step | Change | Where | Test |
|---|---|---|---|
| A1 | Rebuild the selection readout whenever the selection or its size changes, not only after a 2D render. Hook the same commit/notify path the Inspector uses; do not add a per-frame 3D callback. Decide whether the readout should also show height for items. | `js/cad_hud.js` (export a refresh, call from the commit path) | Node test on a pure `selectionReadout(S)` extracted from `updateCadHud` |
| A2 | Making a layer the work set shows it if it was hidden. One place: `setWorkSet`. Ghost stays ghost. | `js/ui_layers.js:127` | Behaviour test: hidden + setWorkSet → `vis === "show"` |
| A3 | When a layer becomes hidden (preset, eye button, solo), drop selected refs that live on it. Keep selection on ghosted layers. | `js/ui_layers.js` (`applyPreset`, visibility row), using the existing layer-of-ref lookup | Behaviour test per entry point |
| A4 | Adding a floor clears the pin and sets the work set to Structure. Switching between existing floors changes nothing. | `js/planner_chrome.js:305` (`addFloorFromUI`), not `js/floors.js` | Behaviour test |
| A5 | One `defaultShelfCount(section, clearHeight)` used by the Inspector field and both layout sites, with the shoe spacing for shoe sections. Keep `round(h / spacing) - 1`. Before coding, reproduce the "empty compartment" case in the app and record the real clear height. | `js/cabinet/layout.js:352`, `:459`; `js/ui_cabinet_inspect.js:401` | Node test: 42 cm shoe section → field and layout agree; existing layout tests unchanged |
| A6 | Singular forms for all five nouns, Hebrew included. | `js/cabinet/labels_plan.js:103-123` | Node test on `cabSummary` |
| A7 | Lift the 42 px cap and `flex: none` for labels in the cabinet parameter grid; give the input a fixed width. Mirror the existing `#mdSketch` rule (`css/styles_11_history_chrome.css:429-430`). | `css/styles_16_dial_lava_layers.css:1421-1422` | Live check with a cabinet opened in Model, EN and HE |
| A8 | Cabinet parameters: heading and values follow the model's length unit (`modelLengthUnit` / `modelLengthText`) instead of fixed cm. The Model placeholder example follows the same unit or drops the unit. | `js/modeler/editor_forms.js:845-863`, `js/pro_shell.js:59` | Node test on the formatting helper; `tests/pro_shell.test.mjs` still passes |

### Phase B — small polish (batchable, mostly strings and CSS)

| Step | Change | Where |
|---|---|---|
| B1 | Page title follows the view: `brand · view name`, set where the view mode changes; `applyLang` keeps it in sync. | `js/i18n.js:100` plus the view-switch handler |
| B2 | Show a short visible prefix ("Apply to") on the scope select instead of hiding the label. | `css/pro_skin.css:1183`, `js/ui_cabinet_ctx.js` |
| B3 | Units segment reads "Units: mm". | `js/ui_cabinet.js:1046` |
| B4 | "No production convention" becomes a button that opens the convention picker (reuse the existing action; find it first). | `js/ui_cabinet.js:1040-1068` |
| B5 | Rename the Model ribbon tab so it differs from the view switcher (EN only; HE already differs). | `js/uikit_host/ribbon.js:155`, `js/modeler_strings.js` |
| B6 | Relabel `#cbDock` from "Room" to what it does ("Beside room"), keep the button. | `js/ui_cabinet.js` |
| B7 | One name for the partition delete action: "Remove partition" everywhere. | `js/ui_cabinet_ctx.js:82`, `:199`, `js/pro_catalog.js:130` (check `tests/pro_shell.test.mjs` examples) |
| B8 | Drop the Mode group from the Cabinet View ribbon tab but keep the three commands reachable from the command bar and shortcuts. Check first whether the catalog supports "searchable, not on the ribbon". | `js/pro_catalog.js:135-136` |
| B9 | Fold the "over …" note into the reference-floor toggle so the text is part of the button. | `js/planner_chrome.js:242-265` |
| B10 | Short placeholder (one example) when the input is narrow; full text in `title`. | `js/pro_shell.js:53-66`, `:296-311` |
| B11 | Hide the coach bar while a face pick is active. Reproduce first. | `js/modeler/welcome_coach.js:258` |
| B12 | Feature-tree row: find what covers the name, reserve room for it, and set `title` to the visible text. Cabinet subtitle gets a `title`. | modeler tree CSS, `js/ui_cabinet.js:1097` |
| B13 | Anchor the Drawing overlay card to its trigger. | `js/ui.js:1569-1600`, `css/styles_02_toolbar_hud.css:1776` |
| B14 | No compartment sub-labels in the thumbnail pass; in the main view give them a contrast-safe colour or backing. | `js/ui_cabinet_view.js:739-746` |
| B15 | Preset click selects the matching ribbon tab (Build / Interior / MEP), one way only, and only when the current tab is one of those three. | `js/ui_layers.js:628`, ribbon tab API in `js/pro_ribbon.js` |
| B16 | Hide `#psLayersChip` while the Layers tab is the open left tab. Check the current behaviour first. | `js/pro_compact.js:709` |
| B17 | Cabinet status priority and hint length keyed on the pane width (container query), not the viewport. | `css/pro_ribbon.css:897-923`, `:1036-1040` |

### Phase C — reproduce in a GPU browser, then decide

| Step | Question to answer | If it reproduces |
|---|---|---|
| C1 | Does the Inspector preview keep a room camera after selecting an item (1.2)? | Fix in `js/inspector_preview.js` `syncInspectorPreview` |
| C2 | MEP above cut walls (6.4) | Hide or fade runs above the cut height while the cutaway is on; build once, no per-frame material toggles (shader re-key trap) |
| C3 | Overlay dimensions in Dollhouse (6.3) | Dollhouse option in `js/planner_drawing.js`: exterior chains only. Keep the 25% behind-walls look in 3D untouched |
| C4 | Room stamps over MEP badges (6.2) | Fade the annotation band while Services is the work set (`js/plan2d.js:627-632`) |
| C5 | Model faces clipping to white (6.10a) | Measure on a white box first; tune `js/editor_view.js:132-167` |
| C6 | "Walls: Down" clipping and the dimension under the hint bar in split (5.5c) | CSS only |
| C7 | Cabinet 3D split framing and a reset control (6.9) | Fit on mode change in `initPreview`; reset on double-click |

### Not doing (with reason)

- 1.4, 5.5d, 6.5, 6.10b (SSAO): already built.
- 1.5 "Visible" badge, 4.6, 6.1, 6.11: no defect; change adds noise or churn.
- 6.2 dimension pill: backing already exists.

### Needs your decision before any work

- 2.3b preset name in the Cabinet title (new saved field).
- 3.3 docked right-hand panel in Model.
- 4.1 whether partition tools stay in both the ribbon and the context bar (recommended: keep both, B7 fixes the naming).
- 4.9 "Engineering" ribbon mode.
- 6.10b studio backdrop.

## 4. Order and effort

1. Phase A in the order A2, A3, A4 (one file, one session), A1, A5, A6, A7 + A8.
2. Phase B as two batches: strings/CSS (B1–B10, B14, B17) and behaviour (B11–B13, B15, B16).
3. Phase C one item at a time, each starting with a capture from the GPU script.

Phase A and B are specified well enough for the code-writing subagent; C2, C3 and C5 are
renderer work and stay with the main model. Full suite once at the end of each phase.
