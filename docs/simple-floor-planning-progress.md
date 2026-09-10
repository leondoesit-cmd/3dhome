# Simple floor planning — implementation progress

The accepted direction is preserved in [the plan](simple-floor-planning-plan.md).
Stage 1 now includes the project guide, redesign baselines, selected-room details
and exact resizing for simple unfurnished rectangular rooms.
The full four-stage plan remains in progress.

## Implemented

- Three primary starts: recreate, design, explore. Existing demo, generator,
  JSON import, local Open, and Continue remain available. Guided starts open
  the plan view and the optional Project sidebar.
- Project intention, optional property type and advisory usable-area target.
  The target is stored as a preference; this panel explicitly does not yet
  claim an area comparison.
- Optional Rooms wanted checklist: add, rename, retype, reorder, skip, revisit,
  remove, place, focus, assign an existing selected room, and unassign without
  deleting geometry. The active floor's placed count uses derived live faces.
  Entries assigned elsewhere open that floor; they do not count as placed on
  the current floor. A deleted face becomes unplaced without losing its entry.
- Stable room `hid` plus floor ID for assignments. Existing wall-key metadata
  reconciliation remains authoritative. No parallel room geometry is stored.
- Checklist placement uses the existing room-stamp preview and command. The
  stamp, semantic metadata and checklist assignment commit in one transaction.
  Failed validation rolls everything back; changed requirements invalidate a
  prepared preview. Checklist placement disarms after one room to prevent
  accidental duplicates. Ordinary preset stamping still supports repetition.
- Version 1 brief normalization under `workspace.guidance`, native JSON,
  autosave via existing serialization, undo/redo, floor switching and the
  existing structure synchronization operation. Legacy files default to
  exploration with guidance disabled, without imposing locks.
- Stable `roomType` metadata for stamped and generated rooms. Generator
  furnishing branches use type IDs; old generator names remain a fallback only
  when no explicit type exists. Renaming a typed room cannot change its type.
- Existing calibrated-reference import is reachable directly in recreation.
- Existing desktop sidebar / mobile bottom sheet, English and Hebrew text,
  local disclosure preferences, keyboard focus preservation, and no extra
  naming prompt in guided drawing. Existing CAD tools remain reachable.

## Redesign-baseline increment

- Named, immutable snapshots of the active floor in `workspace.baselines`.
  Ordinary undo preserves the archive while reverting redesign permissions.
  Failed command transactions roll back a draft capture completely. History
  interns the frozen archive instead of copying its contents into every step.
- `workspace.documentKey` separates new/imported projects. Native saves, floor
  switches and synchronization retain archives; old files receive no protection.
  Incoming snapshots from the same document merge archives without overwriting
  captured records. Remote scene adoption preserves local access/display settings.
- The Project guide offers baseline capture, read-only saved/current wall
  outlines at a shared scale (including arcs), and object-change counts.
  Comparison never loads the saved scene into the editable model.
- Explicit generated-change scope for a selected wall, a selected room's walls,
  or the whole active floor. Shared-wall implications are explained. Permission
  changes are undoable; manual corrections and furniture proposals remain available.
- Agent proposals check scope at preview and Apply, then validate protected
  wall coordinates and hosted openings inside the transaction. Apartment
  generation, its public layout writer, and parsed blueprint application also
  check scope before changing structure.
- Conservative current limit: structural room/wall proposals and whole-layout
  generation (including append) require permission for every existing wall.
  Per-wall scope supports opening proposals. Localized structural generation
  and resize proposals still belong to Stage 2.
- Archive/scope synchronization uses a separate operation, so ordinary geometry
  edits do not resend baseline contents. New-project structure changes adopt the
  new identity before the matching redesign operation.
- Desktop and mobile controls are translated into English and Hebrew.

## Selected-room details increment

- Selecting a room opens its section in Project. Name/type edits update assigned
  checklist entries in the same transaction. Floor and wall-color edits are
  undoable; replacing a custom floor image is explained and undo restores it.
- Interior face-to-face width/depth are shown for axis-aligned rectangles whose
  inner faces form a rectangle. Measurements use individual material bands,
  wall reference settings and decimal coordinates without mutating the model.
  Curved, irregular, divided or partial-height boundaries do not receive a
  misleading rectangular interior size. Reference-line bounds are labeled
  separately and are never called usable area.
- Finishes and openings expand within the Project section. Existing openings
  open the matching inspector; door/window/passage buttons activate the normal
  placement tools. Shared-wall behavior is explained. Advanced room controls
  remain reachable on desktop and mobile.
- Room finishes, including custom-image removal, now travel with room metadata
  in structural synchronization. The signature tracks scalar finish changes
  without serializing texture images on every render.
- English/Hebrew controls preserve keyboard focus and fit the 390px mobile sheet.

## Exact room-size increment

- Project now accepts decimal interior width/depth for measurable axis-aligned
  rectangles. The command moves a free edge while retaining shared corners,
  room identity, metadata and the immutable redesign archive. It commits as one
  undo step and verifies the resulting interior faces before accepting the edit.
- Opening positions survive a changed wall start; apertures must fit both the
  host length and adjacent interior wall faces. Neighbor collisions, locked
  geometry and unsupported shared-edge changes refuse without partial edits.
- This initial direct-capture path requires an unfurnished floor without
  services, slab openings, constraints or markers. Foreign curved walls and
  paired/locked openings also conservatively prevent edits. It does not attempt
  furniture relocation or constrained layout proposals.
- Decimal coordinates invalidate the derived-room cache even below 0.01 cm.
  This path uses a hard 20 cm geometric minimum, without preset advisory minima.
  The inspector migration below now brings both numeric panels onto this command.

## Next Stage 1 increments

1. Extend reviewed resizing to furnished, constrained and complex shared rooms.
   Audit drag-based sizing against the same contract; numeric controls now share
   one command, while existing drag/weld behavior remains separate.
2. Audit rectangle and opening commands against non-grid dimensions, shared
   boundaries and hosted-object invariants. Existing preset minima are still
   enforced; advisory size preferences must eventually be separated from hard
   validity checks.
3. Extend the clear-area subtotals below into usable indoor area and footprint
   accounting with polygon/void subtraction and detached-room resolution. The
   existing plan labels are not asserted to meet the new definitions. Keep the
   stored area target unassessed until whole-project measurements exist.
4. Add split/merge assignment conflict previews and semantic relationship
   records. The current checklist follows the existing primary-room identity;
   it does not invent a conflict-resolution policy.

## Later stages

- Stage 2: cancellable snapshot-based fit analysis, furniture/rearrangement and
  reviewed rectangular-resize proposals, plus generator Preview / Apply /
  Discard. The existing generator is still the existing generator, not the new
  proposal system.
- Stage 3: validated closed-loop insertion, L/T/U stamps and authored-shape
  descriptors with undoable invalidation after incompatible edits.
- Stage 4: connectivity separate from walkability, bounded global corridor
  routing, constrained opening suggestions and expanded SVG/DXF exports.

## Verification for this increment

- Focused Node tests cover defaults, scope preservation, assignments, re-keying,
  removed rooms/floors, uniqueness, reordering, skip, rollback, stale previews,
  stable types and read-only roles. Structure synchronization has a metadata
  round-trip test.
- Browser tests cover placement undo/redo, JSON loading and legacy defaults,
  floor switching, keyboard focus, and 390 px English/Hebrew sheet layouts.
- A real GPU-backed browser showed checklist placement in both plan and 3D.
- Run `npm run ci` for the complete repository gates, Node and browser suites.
  No SVG/DXF/IFC exporter changes are included in this increment.

### Latest results (2026-09-08)

- Repository checks passed: no free identifiers, no missing named exports,
  and source-assertion checks passed.
- Full Node run: 1,790 passed, zero failures or skips.
- Full browser run: 346 of 348 passed initially. The remaining two tests held
  the previous UI registry inventory (before the Project tab and panel). Their
  expected inventories were updated, and both passed a focused rerun. No
  browser failures remain unresolved.
- The guide-specific browser cases passed for one-step placement undo/redo,
  floor switching, native JSON/legacy loading, and keyboard editing at 390 px
  in both English and Hebrew. Tab reordering also passed after registering
  the new tab with the existing customizer.
- Real GPU-backed inspection confirmed a checklist room appearing in both
  the plan and synchronized 3D view. The temporary test server was stopped;
  the existing app server was left running.

### Redesign verification (2026-09-08)

- Repository checks pass with 372 linked modules. The full Node run passed
  1,815 tests; the subsequently added malformed-sync regression also passed
  with all 18 synchronization cases.
- Four redesign browser cases pass: baseline capture/undo/save/floors, English
  and Hebrew mobile controls, revoked preview permissions, manual corrections,
  protected-generation atomicity, and rollback of a failed capture.
- Existing guide and AI-helper browser suites also pass. The new mobile tests
  initially simulated clicks without focusing the button; the keyboard fixture
  now focuses the control before activation and verifies focus restoration.
- Pure tests cover immutable archives, malformed imports, floor scope, shared
  endpoints, opening preservation, comparison, commands and read-only roles.
  Synchronization tests cover archive merging and document transitions.
- Real-browser visual review confirmed saved/current outlines, accurate zero
  changes for an untouched furnished plan, and working plan/3D rendering.
- Full browser CI has not been rerun for this increment; verification uses the
  affected browser suites plus the full Node suite and repository gates.

### Selected-room verification (2026-09-08)

- Repository gates pass: 376 linked modules and source-assertion checks.
- All 32 focused room-summary, guide and synchronization Node tests pass.
- All five guide/room-summary browser cases pass, including English/Hebrew
  mobile layouts, keyboard focus, assigned-room renaming, finish undo/redo and
  opening-tool activation. Real-browser review confirmed interior/reference
  labels, finishes, opening navigation and functioning 3D.
- Full Node suite: 1,835 passed, three failed. The same three failures reproduce
  in an isolated run of `tests/racing_features.test.mjs`: RC home flat traversal,
  elevated tabletop auto tour, and the hand-picked pass-by. Those racing paths
  were not modified for the room panel and remain unresolved in this workspace.
- A source assertion in the concurrently edited lava tests required a comment
  between two statements. Its regex now checks the bounded statement sequence;
  all 42 lava cases pass. No lava runtime code was changed for this increment.
- Numeric room resizing and general usable-area accounting remain outstanding;
  this increment does not assert that the legacy inspector's resize calculation
  meets the new measurement contract.

### Exact-resize verification (2026-09-09)

- Repository gates pass with 377 linked modules and 1,352 source assertions.
- All 11 resize/measurement unit tests pass, including unequal wall thickness,
  decimal sizes, shared corners, neighboring walls and opening jamb clearance.
- Seven affected guide, room-summary and resize browser cases passed. Both
  resize cases passed again after the final clearance changes; they cover
  English/Hebrew at 390 px, undo/redo, baseline preservation, sub-0.01 cm edits
  and refusing furnished-floor edits without mutation.
- Real-browser review confirmed the decimal inputs resize a room to
  321.75 × 245.125 cm with working plan and GPU-backed selection preview.
- Full Node run: 1,840 passed and the same three previously reproduced racing
  failures remain. The final clearance refinements were subsequently checked
  with the focused unit/browser suites and repository gates.
- Full browser CI was not rerun. General usable-area accounting, the legacy
  resize setter and later stages remain outstanding.


### Inspector sizing migration (2026-09-09)

- Both Project and the room inspector now measure individual interior wall
  faces and use the same exact resize transaction. The old inspector setter
  was removed. Decimal fields and ±10 cm buttons preserve fractional sizes;
  rejected or blank entries restore the actual dimensions.
- Inspector labels identify interior dimensions in centimeters. Unsupported
  geometry no longer receives an incorrect rectangular size or an automatic
  L-shape label. English/Hebrew messages describe current limits without
  redirecting users to an inspector that has the same limits.
- Command-owned history replaces the inspector's generic field checkpoint,
  so typing and nudging each undo in one step. Furnished or constrained floors
  now receive the same conservative refusal from either numeric panel.
- Existing room dragging, preset minima and automatic welding during dragging
  remain separate and are not claimed to satisfy the exact-capture contract.
- Verification: 11 focused unit cases pass. All 18 affected browser cases pass
  across the initial run and corrected inspector rerun (the fixture must
  reselect the room after undo/redo, which normally clears selection). Gates
  pass with 377 linked modules. Full Node run: 1,842 passed, with the same three
  existing racing failures; full browser CI was not rerun.


### Clear floor-area subtotals (2026-09-09)

- Selected rooms show rectangular clear floor area between their actual
  interior material faces. Project details separate indoor typed rooms,
  balconies/terraces, untyped rooms and the count of unresolved rooms.
- These are active-floor subtotals including detached rooms, not building
  footprint or verified whole-home usable area. Furniture is included and door
  thresholds are excluded. No area target comparison is enabled.
- Irregular/curved/partial-height boundaries remain unresolved. Any floor void
  conservatively leaves the floor's rooms unresolved until void subtraction is
  implemented. Intersecting foreign wall bounds also refuse measurement;
  foreign curves conservatively prevent measurement. Overlapping derived room
  rectangles cannot be counted twice. This does not yet subtract object-based
  columns, cabinetry or other non-wall solids.
- All values are derived without mutating geometry or storing parallel areas.
  The guide's update signature includes the report so geometry/type/void edits
  can refresh the subtotals even without a selected room.
- Verification: eight area/measurement unit tests and five affected guide and
  room-summary browser cases pass. Both English/Hebrew mobile cases pass again
  with explicit room and floor area assertions. Repository gates pass with 378
  linked modules. The full Node/browser suites were not rerun for this increment;
  the previous full Node run still had three unrelated racing failures.

## Remaining-plan execution (in progress)

- Added a pure polygon union/difference integrator and an adapter to renderer
  wall-band geometry. Straight concave rooms, overlapping wall solids, clipped
  floor voids and floor-level opening thresholds are now measured geometrically.
  Indoor footprint counts enclosing solids once. Disconnected groups remain
  explicit; whole-project target comparison is still disabled.
- Building a cancellable worker-based room assistance panel with required-item
  selection, physical/door/front-access checks, furniture and rearrangement
  previews, alternative options, and one-transaction Apply through existing
  planner commands. This work is undergoing browser validation; it is not yet
  treated as a completed stage.
- Remaining acceptance work includes continuous walkability, broader configurable
  clearances and optional pieces, reviewed resizing, generator alternatives,
  semantic split/merge relationships, closed-loop shapes, bounded circulation
  proposals, exposure decisions, expanded exports and full integration review.

## Integration review — 9 September 2026

The remaining-plan implementation now includes:

- Required and optional furniture, configurable access depths, operating and door
  swing checks, worker cancellation, preview alternatives and transactional Apply.
  Final applied furniture is checked again inside the transaction; a failed fit
  rolls the batch back. Operating zones follow rearranged item poses.
- Reviewed furnished rectangular resizing, plus L/T/U and custom closed loops.
  Authored shapes retain editable dimensions while compatible; growth into loose
  wall solids is refused. Explicit split and merge commands record relationships
  and preserve the primary room identity.
- Template apartment drafts are previewed without furniture or openings. Replace
  refuses attached services, markers, floor openings, constraints and locked
  content that the generator cannot preserve. These templates do not yet solve
  arbitrary building boundaries or fixed room requirements.
- Entrance-based door connectivity and sampled walkability review. Bounded
  corridor proposals connect two existing exterior openings, avoiding rooms,
  furniture, floor voids and other walls. Broader circulation networks remain
  outside this bounded implementation.
- Exterior-opening suggestions require an exposure choice. Changing the wall or
  exposure invalidates the candidate. Full opening dimensions, jamb margins,
  height limits, overlaps and locks are validated, with bilingual repair help.
- SVG and DXF drawing exports include wall geometry, openings, swings, room
  labels/dimensions, voids and optional furniture. Independent export-viewer
  review remains outstanding.
- Polygon area calculation supersedes the older rectangle-only report above.
  Single-floor, connected, fully classified measurable plans can compare indoor
  usable area against an advisory target. Multi-floor aggregation and curved or
  special-wall cases remain explicitly unresolved.

Validation during this review:

- Focused browser tests pass for English/Hebrew mobile layout assistance and
  shapes, plus draft Apply/undo, identity-preserving split and corridor creation.
- A real GPU browser was checked in an isolated local project: the L-shaped room
  renders in plan and 3D and survives undo/redo.
- Full Node run: 1,976 tests, 1,972 passed, four failed. One was missing diagnostic
  coverage for the new opening errors; this is fixed and its focused suites pass.
  The other three are the previously reproduced racing failures.
- Full browser review is still running. An older drafting fixture attempted an
  overlapping window and an oversized passage. It now explicitly tests refusal
  before placing full-size openings at valid locations; rerun pending.

Remaining acceptance work is not complete: shared-wall multi-room resizing,
project boundary/fixed-dimension draft inputs, broader circulation, full preview
lifecycle review, independent export verification, and final integration checks.

## Follow-through — 10 September 2026

- Draft generation now consumes unplaced checklist entries, their optional exact
  interior width/depth, and an optional simple permitted polygon. The bounded
  deterministic packer supports up to 24 rooms and never drops a requirement or
  scales it to fit. An infeasible packing is reported as a failed candidate, not
  proof that every possible arrangement is impossible. Applying checks actual
  derived room dimensions and assigns checklist identities in the same undo step.
  Replacement uses only assignments on the active floor. Existing geometry is
  conservatively excluded from boundary-based append candidates.
- Manual preset sizing and side dragging allow dimensions below advisory room
  preferences, down to the existing 20 cm positive-span guard. Non-grid numeric
  dimensions remain exact; locks and topology checks still apply.
- Room assistance now supplies type-appropriate defaults for offices, kitchens,
  bathrooms, WC/en-suite and laundry, with twelve selectable furniture/equipment
  types and corresponding configurable access depths. Circulation rooms do not
  default to a sofa.
- Guidance cleanup now covers worker-backed drafts/access/corridors and local
  shape, split, merge and opening previews. Closing the guide or changing the
  relevant document discards pending work. A browser regression verifies that a
  draft cannot be applied after leaving and reopening the guide.
- Service-run-only documents now receive the same structural protection as
  documents with service devices. Draft replacement, split/merge, shape insertion
  and shape editing refuse unsupported service changes.
- Independent export review completed using ezdxf and an offline SVG renderer.
  The DXF now uses R2007 UTF-8, centered room text and a valid layer-table handle;
  the generated fixture has zero audit errors and zero repairs. Native Hebrew
  text is retained (visual bidi handling in DXF readers varies). The SVG review
  found and fixed outward door swings crossing the title block: drawing bounds
  now include swings, voids and other exported geometry before choosing scale.
  The browser's local-file URL policy prevented opening the SVG directly there;
  the independent check used offline rendering, without browser file access.
- Latest completed focused run before the final additions: 90 unit tests pass;
  eight shape/merge/draft/corridor browser cases pass. Exact non-grid checklist
  draft dimensions, assignment and undo pass on a 390 px mobile viewport. Full
  Node and affected-browser reruns are currently in progress.

The previous broad run had 395/397 browser tests passing. The drafting fixture
failure is corrected and verified; the ribbon's expected item count remains an
unrelated concurrent-change failure. Three previously recorded racing tests also
remain outside this planning work. Do not interpret these older totals as results
from the latest in-progress reruns.

Remaining limits: the packer searches a bounded set of positions; circulation
connects a selected pair of openings rather than optimizing an entire network;
shared-wall resizing with coupled neighboring-room constraints is refused;
curved/special-wall area measurement remains unresolved; multi-floor targets are
not aggregated. These limits are exposed conservatively rather than silently
relaxing requested dimensions or altering protected geometry.

## Latest acceptance results

- Room-panel units now support cm, mm, m, inches and feet, including exact numeric
  edits. Coordinates and grid settings are unchanged. The mobile conversion test
  verifies 3.4125 m becomes 341.25 cm and undo restores 350 cm while keeping the
  chosen display preference. Project details also reports the floor count.
- Check fit now includes the entrance-based walking review and links directly to
  its settings. Missing entrances remain unresolved; blocked approaches are
  listed. Its browser test distinguishes unresolved and reachable cases without
  changing geometry.
- Corridor search now includes incoming direction in its cost state so turn
  penalties are compared correctly. Cached cell checks use polygon containment
  for concave permitted outlines. Corridor unit and browser regressions pass.
- Failed furniture searches identify the pieces that could not be placed. A
  search that omits every optional piece no longer offers an empty Apply action.
- Final broad Node run: 2,136 tests, 2,133 passed. The three failing cases were
  the changed advisory-minimum expectation, a requestAnimationFrame call in the
  Node-only UI harness, and a timing threshold under concurrent load. The first
  two were corrected; all 44 tests in those affected suites pass on rerun,
  including the timing case. The earlier racing failures did not recur in this
  broad run. This is not a claim of a second all-green full run.
- The twelve affected mobile/guide/layout/draft browser cases passed. Subsequent
  focused checks passed for unit conversion (three cases), entrance-aware fit,
  corridor routing, and layout Apply/undo. The last focused pure-unit batch has
  18 passing tests; display-unit/checklist synchronization also passes.
- Repository module/link/source-assertion gates pass with the expanded graph.
  Independent DXF audit and SVG visual review are complete as described above.

## Draft packing refinement

- Exact-size checklist drafts now retry three deterministic room orders and
  consider boundary vertices, opposite boundary edges, and previously placed
  room edges. This finds arrangements missed by the original corner-first,
  checklist-order search, including usable arms of concave outlines.
- Results retain original checklist order and identity. Rooms are never resized,
  rotated, or omitted to force a fit. Material outlines must remain inside the
  permitted boundary. Rectangle overlap checks run before polygon containment,
  and the entire search remains capped at 6,000 candidate positions.
- English and Hebrew failure messages now acknowledge that other arrangements
  may fit; this bounded search does not prove infeasibility.
- Seven focused draft/generator unit tests and six planning browser tests pass.
  The new browser regression verifies a formerly missed three-room arrangement,
  exact interior sizes, checklist assignments, a non-mutating preview, and one
  undo restoring the empty plan. The reordered-packing browser case was rerun
  after the overlap-check optimization and passed.
