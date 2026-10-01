# Advanced Questions 5–6 — independent source audit

Read directly from PDF pages 509–512, rendered with Poppler. This is preparation, not completed geometry or acceptance. Printed mass and centre of mass were not used to choose dimensions.

## Advanced Question 5

- Given A = 63 mm, B = 50 mm, C = 100 mm; copper; MMGS; density = 0.0089 g/mm³.
- The top hole is Ø10 mm, 20 mm from the top front edge on page 509 and 30 mm from the top right edge on page 510.
- All holes are through all. The drawing includes separate Ø10 leaders at the top, central side, and rear side.
- Named radii include front R30, main side pocket R25, front rail R25, rear R20, and local R10 bends. The upper front bevel is 20° with an 18 mm vertical witness. The lower rear transition includes 20° and 45° witnesses.
- The bottom 8 mm witness runs in the transverse B direction between the outer side and the inset front edge. It is a rail width, not a toe height. The front R30 centre witness is 35 mm above the bottom plane. A quarter-circle would therefore reach 5 mm above the bottom; its exact end tangencies must be checked against the top 50 mm chain before cutting.
- The top 50 / 12 / 40 mm witnesses, two 9 mm annotations, 13 mm recess, and 15 mm upper step still need their individual endpoints traced. They must not be assigned by proximity alone.
- The suggested construction uses 13 features and 12 sketches. Feature count does not establish unlabelled geometry.
- Printed reference: volume = 143857.58 mm³; mass = 1280.33 g; COM = (26.81, 25.80, −56.06) mm from the illustrated front corner origin.

### Current browser preparation

A fresh model was authored from blank in Chrome tab 710858828. The Right Plane rectangle has a fixed origin, horizontal and vertical sides, and opposite corner at (−10, 6.3) cm. It is fully defined. A 5 cm blind extrusion creates the printed 100 × 50 × 63 mm stock. Native rebuild succeeds with one body. This is preparation stock, not the completed Question 5 geometry or a mass acceptance.

Library: `Planchard Advanced Q5 - fresh print reconstruction 2026-09-30`.
Portable checkpoint: `artifacts/planchard/ADVANCED-Q5-fresh-stock-browser-2026-09-30.mforge` (30,158 bytes).
Browser screenshot: same stem with `.png`.
Focused drawing: `scratch/planchard/advanced-q5-dimensions-detail.png` and the 600 dpi `advanced-q5-front-witnesses.png`.

## Advanced Question 6

- Plain carbon steel, MMGS, linear precision 2; explicitly not symmetric about Front Plane.
- Front view: overall 100 mm horizontal and 150 mm vertical. Opening height = 100 mm; lower reference height = 25 mm. The 22.50 mm front setback, 10 mm typical lips, and distinct 60 / 70 mm wall references require separate witness traces.
- Top view: overall transverse width = 100 mm. The open U slot has 45 mm clear width and its centreline is 30 mm from the right end, implying an R22.5 semicircular return. The R30 TYP leader belongs to the left shallow scallop, not that U slot.
- The left scallop has 60 mm between its end witnesses, a 5 mm inset, and 10 mm lip references. Its paired R30 arc tangencies remain unresolved.
- Right view: 10 mm × 45° typical chamfers and 25 mm offsets. Confirm their actual edges before applying them.
- Printed reference: volume = 522989.22 mm³; mass = 4079.32 g; default COM = (35.91, 0, 0.70) mm.
- Question 6A defines an origin at the back-right-bottom vertex. Printed COM = (−64.09, 75.00, 40.70) mm. Choose the displayed vertex and retain a right-handed frame; do not fit an origin to obtain those values.

Rendered source pages: `advanced-q5-source-audit-509.png`, `advanced-source-audit-510.png`, `advanced-source-audit-511.png`, and `advanced-source-audit-512.png`, under `scratch/planchard`.

### Resolved front arc witnesses

The 600 dpi drawing crop and an independent second reader now agree that the R30 centre is on the front datum, 35 mm above the bottom. Its quarter arc starts at depth 0 / height 5 mm and ends at depth 30 / height 35 mm. The front rail R25 shares that datum and height, giving depth 0 / height 10 mm and depth 25 / height 35 mm. The bottom 8 mm dimension runs transversely and labels rail width. These arc facts are established from the print; they do not depend on the still unresolved top bevel/notch chain.

The browser placement method uses rough clicks followed by exact source coordinates and radius constraints before any extrusion cut is committed. Rough on-screen positions are provisional sketch geometry, not final dimensions. The first core cut will occupy 42 mm of the 50 mm width, preserving the printed 8 mm side rail.

### October 1 browser checkpoint: R30 front core

The fresh stock was reopened through the model library in dedicated Chrome tab 710858892. A new Right Plane sketch was authored using the visible centre arc tool and exact point coordinate controls. Its centre is (0, 35) mm, tangent endpoint (-30, 35) mm and toe endpoint (0, 5) mm. The visible Reverse arc command selected the quarter arc instead of its complementary 270 degree path. Three closure lines run through (-30, 63) and (0, 63) mm. Overlapping endpoints were merged, then the top point was constrained exactly. The browser reports a fully defined, closed four-entity profile.

An Extrude Cut with Blind depth 42 mm and along-normal direction preserves the source 8 mm transverse rail of the 50 mm stock. Native rebuild completed with one solid and no displayed diagnostics. Save to library completed; no Unsaved changes flag remained. The model now has four editable history steps and two fully defined sketches. This is a completed front core feature, not acceptance of the complete Question 5 model. The rail R25 profile, bevel, pockets and holes remain pending; no printed mass was used to infer geometry.

Portable bundle: `artifacts/planchard/ADVANCED-Q5-R30-core-browser-2026-10-01.mforge` (88,940 bytes). Browser proof: same stem with `.png`. Source: PDF page 509, printed page 10-29; Question 5 answer follows on PDF page 510, printed page 10-30.

### October 1 browser checkpoint: R25 side rail

A separate Right Plane sketch was drawn with centre (0, 35), tangent (-25, 35) and toe (0, 10) mm. Its quarter arc and top closure were fully constrained through the visible point coordinates, horizontal/vertical relations and endpoint merge controls. A Blind Extrude Cut, depth 8 mm and start offset 42 mm, shaped only the transverse side rail. Native rebuild completed with one body and no displayed diagnostics; Save to library completed cleanly.

The saved model now has six editable history steps and three fully defined sketches. Portable bundle `artifacts/planchard/ADVANCED-Q5-R30-R25-rails-browser-2026-10-01.mforge` is 154,247 bytes; same-stem `.png` captures the native geometry, fully defined profile and clean Save state. Read-only bundle audit confirms stock depth 50 mm, core cut 42 mm from offset 0, and rail cut 8 mm from offset 42 mm. Both radii use their printed source centre and endpoints. The upper bevel, side pocket, rear pocket, underside relief and three through holes still remain; complete Question 5 mass/COM acceptance is pending.

### October 1 browser checkpoint: upper core bevel

A new fully defined triangular Right Plane sketch uses (depth, height) vertices (30, 45), (30, 63), and (36.55146421679164, 63) mm. The 6.55146421679164 mm setback is derived only from the printed vertical span 18 mm and angle 20 degrees from vertical: 18 tan(20 degrees). A Blind cut of 42 mm from offset zero bevels the core. The outer 8 mm rail remains for its separately illustrated upper recess and R10 details; those have not been silently assigned the same bevel.

Native rebuild completed with one body and no displayed diagnostics; clean Save to library confirmed. Eight history steps and four fully defined sketches are retained. Portable checkpoint `artifacts/planchard/ADVANCED-Q5-core-bevel-browser-2026-10-01.mforge` is 212,376 bytes with same-stem PNG browser proof. Complete Question 5 remains pending; this checkpoint accepts the established front core, R25 rail and core bevel features only.

## 2026-10-01: book Play / Stop / Reset gap closed (PDF 409–410, printed 8-31–8-32)

The source asks for Play Animate / Play, then Stop and Reset after publishing an eDrawing. ModelForge now offers the equivalent presentation workflow through Assembly → Exploded view: duration, Play, Stop (pause), Reset and Close. Playback traverses the existing explode steps sequentially; earlier steps retain their offsets as the next moves. Duration is stored on the active exploded-view configuration. Mated transforms and all seven FLASHLIGHT steps remain unchanged. This implements the animation workflow; it does not create or claim proprietary eDrawing-format output.

The renderer updates positions on existing component groups and renders the current scene; it does not rebuild meshes or refresh the editor per animation frame. Leader/interference overlays are hidden during playback and ordinary overlays rebuild on Close. Reset uses zero presentation offsets and restores the assembled pose.

Actual dedicated Chrome tab 710858940 human-control verification: loaded the task-fresh saved FLASHLIGHT record, opened Exploded view, saw seven saved steps, set Duration 20 seconds, pressed Play, saw components separate, pressed Stop at 46%, confirmed it remained paused, pressed Reset and saw the assembled model at 0%. Set one-second duration and pressed Play; the panel reached Complete · 7 steps. Reset and Close completed afterward.

Browser proof: `artifacts/planchard/FLASHLIGHT-animation-paused-browser-2026-10-01.png`, `FLASHLIGHT-animation-reset-browser-2026-10-01.png`, `FLASHLIGHT-animation-complete-browser-2026-10-01.png`. The browser pass exercised the initial playback implementation; the subsequent saved-duration configuration change has targeted controller coverage.

Verification: 10 targeted tests pass in explode_animation, explode_step_lines and component_context_render; tests cover sequential accumulation, nested occurrence paths, unchanged poses, cancellation/Reset and existing GPU-group movement with zero refreshes per frame. Module/link/source-assertion checks passed. Advanced Q5 remains unfinished at its completed core-bevel checkpoint (PDF 509, printed 10-29).
