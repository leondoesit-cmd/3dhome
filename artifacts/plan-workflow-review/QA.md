# Manual floor-plan reconstruction and workflow QA

Reference: `/Users/leonkhey/Desktop/PLAN.webp`.

## Result

**Latest CAD and mobile follow-up (15 September 2026):** the saved plan now uses the custom double oven, two copies of the shallow entry-step model, and a single combined island/sink library model. The current results below supersede the earlier substitutions and priority list in this report.

### Completed in the latest pass

- **1 — Upgraded combined asset:** edited the existing island in built-in CAD, cut the countertop and base, created a two-bowl insert from sketches/extrusions/cuts, assembled both at the correct elevation, and published one room-library model. The editable source assembly remains separately saved. The published room item is a mesh snapshot; its source component histories remain in the assembly.
- **2 — Cabinet scope:** added explicit instance-only versus linked editing. Opening the designer preserves fractional dimensions; the mobile size entry point is now called **Size**. Verified the beverage cabinet reads **243.84 cm** with **This cabinet only** visible.
- **3 — Joined/jogged rooms:** added a boundary list with precise wall lengths and direct corner selection. This enables individual boundary editing; resizing the entire irregular room by overall width/depth remains unavailable.
- **4 — Precision:** numeric editors retain up to six decimal places rather than inheriting rounded display labels. Final island dimensions are **274.32 × 96.52 × 92.44 cm**.
- **5 — Intentional ends:** explicit intentional-end controls distinguish designed wall returns. Both kitchen/beverage returns were marked and saved.
- **6 — CAD assets:** built and saved a double oven, a **165 × 60 × 38 cm** two-riser step model, and the double-bowl insert. Placed the oven and both step copies in the reconstruction. The steps use 19 cm risers and 30 cm treads. The insert has two 35 × 44 cm bowl cutouts; faucet/drain detailing is absent.
- **7 — Export:** added an honest, retryable **Export ready** dialog with a full-width, 44 px minimum download action. Verified PNG preparation and clicked Download; actual delivery into the browser's download folder was not confirmed. The dialog does not falsely mark the project saved.
- **8 — Unidentified:** the prior list ends at 7. This item needs the user's description; no fix is claimed for it.

### Mobile and reliability verification

At **390 × 844**, used visible clicks, numeric typing and scrolling to verify exact cabinet dimensions/scope, wall-end controls, the combined-model inspector, fitting the reconstruction and export feedback. Room, wall and furniture properties now use continuous scrolling instead of artificial pages. The 3D preview is collapsed on phones, and non-stair objects no longer show the stair-void action.

Large CAD projects now save to IndexedDB with legacy-save fallback on load. The roughly 40 MB reconstruction saved and reloaded successfully. A save-revision guard preserves the dirty indicator when a newer edit occurs during a save. Unchanged custom definitions are interned across undo snapshots to reduce duplicated memory; the browser had previously crashed during this large-model session, and its recovery copy was restored. This is not a long-duration memory stress-test result.

**Validation:** `npm run check` passed (499 modules, 1,423 source assertions). Eight focused CAD/workflow/persistence tests passed; 16 history tests passed (the history-pool test overlaps these runs). No full CI success is claimed; the earlier interrupted CI result is retained below.

**Remaining limits:** construction annotations, exposed joists, bulkhead, fence/property lines and detail callouts are unmodeled. Some adjoining-room measurements are inferred from the partial drawing. Sink materials and lighting still give weak depth contrast. Selecting an object can mark the plan dirty without an intentional edit. The converted-box face-attachment path can fail; this build used explicit datum planes. Cost figures use catalog defaults and are not an estimate for this construction.

Evidence: [upgraded reconstruction](reconstruction-upgraded.png), [mobile reconstruction](mobile-reconstruction.png), [mobile object controls](mobile-object-controls.png), [cabinet scope and precision](mobile-cabinet-scope.png), [wall controls](mobile-wall-controls.png), [export dialog](mobile-export.png).

---

Rebuilt the kitchen/beverage shell and adjoining dining, powder and mud rooms, openings, cabinetry, island, seating, fixtures, dryer and stairs. The model is saved in the local browser and left open at `http://localhost:8765/?workflow-review=1`. Use **File → Load** if a fresh page shows the demo. Save/reopen was checked. Model construction used visible UI clicks and drags; keyboard input was limited to numbers, without shortcuts.

This is a reconstruction of the floor layout, with the approximations below. It is not a complete reproduction of the construction drawing.

## Workflow improvements implemented

- Persistent Units, Fit plan, panel visibility and Done placing controls make drawing actions discoverable.
- Opening dimensions are editable before placement, remembered separately for doors, windows and passages, and applied immediately when the last number is typed.
- Toolbars wrap so tools remain reachable; drawing focus mode retains the numeric inspector.
- Common room labels can be selected with the mouse.
- Selecting a room no longer detaches shared geometry. Detachment begins only after a real drag; dragging and Undo were checked visually.
- Save/load preserves wall assemblies and dimensional relationships. The main shell's 13.97 cm walls survived reopening.
- Cabinet designer tolerates linked instances without custom cabinet data.
- The plan's stair symbol respects the configured step count.
- Rectangle creation passes clean coordinates; inspector preview handles an empty selection safely.

### Mobile follow-up (iPhone 14 Pro Max, 430 × 932)

- Recreated the 18′3″ × 29′ main room through **Build → Preset**, verified the exact clear-size labels, placed it, finished placement and fitted it to the viewport.
- Closed Build/More sheets are now inert and removed from the accessibility tree. Focus returns to the bottom-navigation control that opened the sheet, preventing invisible sheets from intercepting later input.
- Removed the duplicate Save command from the Project group; Save remains promoted in Design Workspace.
- Exact room-size updates no longer require replacing the room controls. This preserves the width-to-depth input flow instead of invalidating the second field after the first value commits.
- Room options now have a labelled collapse/reveal control. On phones the expanded card can be reduced to a 42 px button, and it collapses automatically after a successful placement so adjoining walls remain tappable.
- No non-UI CAD failure was found: the measured room was created and persisted. The browser driver can still turn an emulated touch on a text field into a long-press context menu; that is test-driver behavior, not an app failure.

### Manual-tools-only mobile follow-up

This pass deliberately avoided **Preset** and all generators. Starting from an empty canvas, the main rectangle was drawn with the two-point **Room** tool and then resized through ordinary room properties to an exact 18′3″ × 29′ interior. The plan was divided with a two-point **Wall** operation using OSNAP and ORTHO. A 60 × 84 in door, a 114 × 84 in floor-level window, a sink and a refrigerator were then sized/placed through the regular opening and library controls. The final state was saved locally.

- Room creation, exact post-draw resizing, snapped wall joins, opening hosting, object placement and smart facing all worked.
- **Just explore** now opens the blank canvas in Select mode with guidance disabled. Previously its “blank canvas, no required questions” choice unexpectedly armed Room and expanded Project Guide across the phone canvas.
- The properties sheet exposes exact dimensions, but reaching them requires page 2 of 3 and the page label is generated from field text. A future refinement should call this page simply **Dimensions & finishes**.
- Selecting geometry can leave the old object name in the header while a new placement tool is active; the central tool badge is accurate, but the competing header label is easy to misread.
- No non-UI geometry defect blocked the manual workflow.

## Accuracy and substitutions

| Element | Reconstruction |
|---|---|
| Main exterior | 556.26 × 883.92 cm (18′3″ × 29′); 13.97 cm walls |
| Island | 274.32 × 96.52 cm, with double sink, dishwasher and three seats |
| South glazed opening | 289.56 × 213.36 cm; generic sliding-door representation |
| West beverage opening | 213.36 × 213.36 cm; generic sliding-door representation |
| Paired entries | 152.4 × 213.36 cm |
| East kitchen run | Individual modules follow the visible width sequence; generic appliance assets |
| Existing adjoining rooms | Some dimensions and wall positions estimated from the partial drawing |
| Exterior steps | Two risers; catalog minimum depth of 100 cm prevented the shallower intended footprint |
| Double oven | Generic tall oven stand-in |
| Construction annotations | Joists, bulkhead, property/fence lines and elevation/detail callouts remain unmodeled |

## Remaining workflow priorities

1. **Hosted fixtures:** inserting a sink should create a countertop cutout and set its elevation. Currently the stock island top obscures the sink bowls in 3D.
2. **Cabinet edit scope:** show “this cabinet” versus “all linked cabinets” before offering a layout change. Resizing the beverage cabinet propagated its four-column layout to smaller linked cabinets, although their footprints stayed unchanged.
3. **Exact editing of joined rooms:** keep width, depth, wall-face offsets and numeric positioning available for attached and jogged rooms. The inspector currently says exact width/depth editing is unavailable for this geometry.
4. **Precision visibility:** expose retained decimal dimensions consistently; rounded inspector values make it difficult to audit an imperial drawing converted to centimeters.
5. **Intentional wall returns:** distinguish valid short returns from unintended dangling walls. Current red warnings distract from the drawing.
6. **Architectural assets:** provide double ovens, shallow two-riser steps and properly hosted fixtures with configurable dimensions.
7. **Export feedback:** JSON and PNG export displayed success notifications, but delivery of actual downloaded files could not be verified in this browser. A reliable downloadable artifact or explicit failure state is needed.

## Validation

- Visual browser checks covered numeric placement, panel visibility, room labeling, room selection/move/Undo, 2D/3D representation and saving/reopening.
- `npm run check`: passed; no free identifiers or module-link errors (496 modules), 1,408 source assertions checked.
- Targeted opening defaults, persistence and cabinet tests: **18 passed**.
- Full CI did **not** complete successfully: 2,810 tests passed; the long-running `planchard_housing_shell.test.mjs` process was interrupted after approximately eight minutes. Its interruption accounts for the reported one failure; the subsequent browser-test stage was not reached.

Screenshot: [reconstruction.png](reconstruction.png).
