# Bugs to fix (found in passing)

Bugs noticed while working on other things and NOT fixed there. One entry per
bug: where, what is wrong, how to see it, suggested fix. Tick the box when fixed.

## Open

- [ ] **2D placement outline is not where the click puts the piece** —
  `js/plan2d.js` (the `S.placeType && S.previewPt` branch) draws the library
  piece as an axis-aligned rectangle at `S.previewPt`, which
  `js/interaction/plan_move.js` sets from `snapPoint`; the click
  (`pointer_down.js` → `placeFurnAt`) places at the raw pointer, snapped to
  2 cm, then turns it by `applyAutoFace` and moves it by `flushToWall`. So a
  sofa dropped near a wall previews square and centred on the snap, and lands
  turned and flush. The 3D pane now previews the real pose
  (`js/build3d_pose.js` `placementPose`); the plan could draw
  `footprint({...FURN[type], ...placementPose(type, px, pz)})` the same way.
- [ ] **Pick slop is only refreshed on pointerdown** — `js/interaction.js`
  `setPickSlop` is called from `pointer_down.js` only, so the hover picks
  (`hitWall` for `S.wallProbe`, `pickErase`) keep the last press's slop: a
  mouse hover after a touch keeps the finger's 1.9× tolerance, and a finger's
  held preview in the 3D pane (moves before the press) uses the mouse's.
  Fix: call `setPickSlop(pickSlopType(e))` at the top of the plan's
  pointermove handler too (`js/interaction/plan_move.js`).
- [ ] **Empty wall-palette bar left in the 3D pane** — after leaving the wall
  tool with the 3D view maximised, an empty dark bar stays where the "Wall
  types / Draw from" palette was (top of #view-3d, under the Structure chip).
  Seen in a GPU harness screenshot after `setTool("select")` with
  `S.placeType` set; cause not traced (js/plan_tools_dock.js moves the plan
  panels into the 3D pane; the palette's visibility rule may not follow).
- [ ] **Hardcoded English in the Pro dialogs** — `js/pro_actions.js` (`openRoof`,
  the stack dialog, `reportDialog` callers). Titles, labels and buttons
  ("Roof from exterior walls", "Type", "Pitch (degrees)", "Overhang (cm)",
  "Generate roof", "Remove roof", "Stack", the roof type option names) never go
  through a translation, so a Hebrew UI shows English. Fix: a bilingual strings
  module in the style of `js/code_check_strings.js` (the i18n files are
  size-frozen), used by those dialogs.
- [ ] **Hardcoded English flashes for grouping** — `js/ui/selection_actions.js`
  `groupItems` / `ungroupItems`: `flash("Items grouped")`, `flash("Items ungrouped")`.
  Also neither branch re-renders or refreshes the tree after changing `groupId`.
- [ ] **Hardcoded English in the Workspace dialog** — `js/workspace.js`:
  "Add empty", "Duplicate active", "Elevation", `Wall aligned to …` flashes.
- [ ] **Roof dialog measures the "cm" fields without the unit setting** —
  `js/pro_actions.js` `openRoof`: overhang is always typed in cm even when the
  plan's length unit is something else (the rest of the inspector goes through
  `writeInspectorLen` / `fmtLen`).
- [ ] **Stairwell void id comes from the wrong storey's counter** —
  `js/ui/selection_actions.js` `slabFromStairs`: `stairVoidFields()` takes its
  id from `uid()`, i.e. the ACTIVE (lower) storey's `S.idc`, but the void is
  written into the storey above with `addSlabOpeningToFloor`. That id can
  collide with an id already used on the upper storey (its own counter runs
  independently). Fix: give the void an id from the target scene's `idc` (bump
  it in the stored scene) or a string id that cannot collide.
- [ ] **Construction sheet ignores the stairs' catalogue variant** —
  `js/drawing_sheet.js` passes the raw item to `symbolPrims("stairs", …, it)`,
  so a legacy (undesigned) stair with the `lShape` or `curved` variant prints
  as a straight flight (plan2d.js passes `shape: vspec(it).shape`). Designed
  stairs (`configuration.stair`) are unaffected. Fix: pass
  `{ ...it, shape: stairVariantShape(it.variant) }` (js/stair_layout.js).
- [ ] **Walk mode treats every stair as one straight ramp over its box** —
  `js/navigation_geometry.js` `stairSupport` interpolates height across the
  item's bounding box from front to back, so an L / U (designed or legacy)
  flight is walked as a straight slope through the landing and the empty
  corner. Fix: read the step blocks from `stairLayout(it)` and take the top of
  the block under the point.
- [ ] **Room-naming prompts follow you to another storey** — "Enclosed space
  detected" prompts queued while walls close on one storey keep popping up
  after switching to another storey, where the room they name does not exist.
  Seen after copying a storey's walls and switching floors. Fix: drop the
  pending prompt queue in the floor switch path (js/floors.js `switchFloor`
  already cancels draft gestures there; js/ui_tree.js owns the queue).
- [ ] **Command bar keeps the old language after a language switch** — after
  switching Hebrew → English the plan command bar's mode button still reads
  "› פקודה" until reload (the AI / Cmd labels are written once when the bar
  is built). Fix: re-label `.ps-modes` buttons in an `onLangChange` hook
  (js/pro_shell.js / js/pro_ribbon.js — find the builder by "ps-modes").
- [ ] **Light-bulb fallback says "Your first plan" on a finished plan** —
  `js/coach_topics.js` `bulbTopic` falls back to `first_plan` whenever no
  topic applies, so pressing the bulb on a furnished ground floor explains how
  to draw a first room. Fix: a general "What next" topic for plans that
  already have rooms (add a door/window, furnish, open 3D, add a floor).
