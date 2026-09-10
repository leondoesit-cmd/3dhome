# Responsive UI/UX audit — September 10, 2026

The most useful next step is to make each modelling transition predictable:
choose an action, see its preview, enter a value, apply or cancel, and return
to the canvas. The responsive shell already exists. The problems found here
were mostly broken transitions and competing layout rules.

## Scope and evidence

Reviewed the UX/performance plans against the current working tree. Ran the
complete Node test suite, complete browser suite, overlap audit and contrast
audit. Used the real in-app browser with WebGL to walk through a blank sketch,
Finish, Extrude and the feature form on a phone and unfolded device. Inspected
desktop editor entry, chrome and shared planner navigation.

The overlap audit exercised 17 viewport configurations and 248 named stages.
The contrast audit exercised six theme/device configurations. New regression
tests cover 344×812 English, 390×844 Hebrew, 717×829 English and 1280×800
English, including a phone → unfolded → phone transition with an active form.

These are browser viewport tests, not physical-device testing. Software
keyboard space is simulated through the existing viewport inset. Actual iOS
keyboard animation, Android folding hardware, hinge occlusion, thermal
behaviour and sustained touch performance remain unmeasured.

## Verified problems fixed

| Problem | Result |
|---|---|
| The changing phone action row showed only icons, including Start sketch and Extrude. | Contextual verbs have visible labels; Undo/Redo retain compact icons. The row still fits and keeps 44 px targets. |
| Finish sketch remained a coach suggestion after a closed sketch had already been finished. | The closed-profile action takes precedence over that coach suggestion. |
| Opening Extrude through the thumb row left the closed-profile offer over its form. | Starting a feature dismisses the offer from the common entry point. |
| The profile offer displayed `revolvefeature`. | It uses the existing localized Revolve label. |
| An empty generated sheet body consumed space above the borrowed form. | Empty bodies collapse. At 390×844, the measured form area increased from about 159 px to 292 px and the gap above it fell to 8 px. |
| Paging the tree wrapped its absolute-positioned feature form in a zero-height page. | Active feature forms use their own scrolling area; tree/library pagination is retained elsewhere. The sheet title names the active feature. |
| Canvas overlays could appear above a sheet and intercept its controls. | The sheet and backdrop stack above the viewport rails. |
| The sheet reserved space for the bottom bars twice. | It ends at the editor boundary, immediately above the context row. |
| The editor moved for keyboard space but its bottom actions did not. | Navigation and context actions follow the same keyboard inset; the sheet does not subtract it a second time. |
| A folded device could hide the active docked form. | Folding reopens the active form in its phone sheet and preserves entered values. |
| A docked form inherited a 42vh height ceiling. | The unfolded column uses its available height. Narrow dock fields stack labels above inputs to preserve readable values. |
| Mobile feature fields were very small. | Numeric inputs and selects use 16 px text and a 44 px minimum height. |
| Apply/Cancel appeared both in the form and in the reachable thumb row. | The visible confirmation controls own the action; the duplicate form row is hidden. |
| Cancel/Apply could leave a stale form sheet open. | Completing or cancelling a feature returns to the canvas. |
| Switching desktop view modes could detach the floor selector. | Dock wrappers attach before taking ownership of live controls, including while layout waits for the pane to gain a size. |
| Desktop drag handles and Dusk destructive text failed sampled contrast checks. | Handles retain full opacity; Dusk destructive text is slightly lighter. The contrast rerun reports zero violations in 1,239 sampled pairs. |

## Verification

- Initial Node suite: 2,199 tests; one timing failure under simultaneous audit
  load. Its 14-test suite passed when rerun on its own.
- Subsequent complete Node run: 2,198 passed, one obsolete source assertion
  expected the previous coach predicate. Updated that assertion; its full
  23-test suite passed.
- Complete browser run: 432 tests, 422 passed, 10 failed, no skips. Four failures
  required the old icon-only action row; four were in the new regression test
  while its selector still targeted the field wrapper instead of the input.
  The remaining failures exposed the disappearing floor selector and a narrow
  Night Shift HUD collision. This broad run preceded the final fixes.
- Final navigation and workflow rerun: 25/25 passed, covering desktop floor
  switching, dock placement/free placement, responsive feature forms, exact
  numeric commits, cancellation and undo.
- Final source/unit regression slice: 83/83 passed. The revised mobile layout
  suite's 27 layout cases passed; the separate four-case workflow suite also
  passed after its selector correction and sheet-lifecycle fix.
- Source module/import/assertion gates and whitespace checks passed.
- The full browser suite is **not completely green**: the Night Shift minigame
  still has responsive HUD collisions. Its original first failure is the
  mission/threat overlap on the 280×653 folded cover screen. A targeted probe
  also exposed mission/stats overlap at 720×360 landscape. No minigame layout
  changes are included in this patch; record this as a separate game-HUD fix.

The new workflow test checks visible labels, form dimensions, hit testing,
keyboard clearance, folding continuity, cancellation, exact depth commit and
one-step undo. It caught both the zero-height form and the stale open sheet
during development. Existing layout tests now require labelled verbs while
retaining their overflow, accessible-name and touch-target checks.

## Limits of the general audit scripts

The overlap script reported 744 intersections. This is not 744 confirmed user
bugs: it repeats the same planner layout through multiple stages and includes
intentional drag-handle intersections. It also has coverage gaps: the modal
filter recognizes `#m-sheet` but not the editor's `#md-sheet`, some stage
selectors are stale, and its call to `page.eval` supplies a third argument
which that helper does not forward. Mobile target-size checks therefore need
the dedicated browser tests. Do not use a clean general-audit count as release
evidence until the auditor itself is repaired.

The contrast result applies to the pairs sampled by that script, not every
state, pixel, translucent background or accessibility requirement in the app.

## Next changes, in priority order

1. **Make precise editing work without a held drag.** Tap a dimension or handle
   value to edit it, keep the preview visible, and commit once. Check negative
   values, decimals, units and the software keyboard on physical devices.
2. **Measure selection and parameter editing on actual mobile hardware.**
   `refreshSelection()` skips the parametric solve but still rebuilds the
   preview. Prioritize tap-to-highlight, sketch dragging and feature-value
   feedback over more hover optimization. Record latency and rebuild counts.
3. **Make View and More discoverable.** The editor's stable navigation and
   generated View palette still hide labels. Test short captions or labelled
   groups with new users before adding more launchers.
4. **Make rebuild messages explain the next action.** A sketch with remaining
   degrees of freedom currently raises a generic rebuild-warning banner in the
   demonstrated flow. Separate incomplete constraints from failed geometry;
   take the user directly to the relevant feature/reference.
5. **Reduce desktop chrome deliberately.** Collapse redundant empty-state
   guidance and the unused inspector, preserve the shared viewport canvas and
   existing panel preferences, and keep command search complete. Coordinate
   with the substantial existing changes in this working tree.
6. **Add the inexpensive pattern-overlap advisory.** Use “Copies may overlap”
   for bounding-box detection, preserve legal commits and keep merge-off free
   of kernel fusion work.
7. **Repair the broad audit tooling.** Use current launchers and real workflow
   states, assert each stage reached its intended surface, include editor
   sheets, and distinguish intended overlapping affordances from blocked
   controls. Add real touch/keyboard tests rather than more source needles.

Keep the existing modelling doctrine: one document and one panel implementation
across devices, visible previews, reversible commits, non-blocking guidance,
and commands that remain reachable as the screen posture changes.
