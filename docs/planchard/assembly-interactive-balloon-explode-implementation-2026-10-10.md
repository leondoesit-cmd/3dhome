# Interactive assembly drawing balloons and saved explode chains

Provided book PDF460–463 / printed9-26–29 requires an exploded FLASHLIGHT drawing, parts-only BOM and numbered component callouts. The prior interactive Drawing supplied the BOM but omitted the legacy export's balloon/chain providers. This implementation supplies both through the same ordinary owned Drawing scene used by Canvas and SVG. It is capability verification, not a new actual browser acceptance claim.

## Ordinary controls

Open the independent assembly copy, activate its existing saved exploded view, enter Drawing and set BOM scope **Parts only**. Select the ordinary isometric view and click **Auto component balloons** in the Sheet panel. This creates one bound callout per visible leaf occurrence, including repeated parts and nested O-RING. Repeating the command skips existing path/view pairs. It refuses incomplete native mesh targets and special clipped, sectioned or broken projections. Seven saved chains are resolved by the existing assembly explode-chain function and supplied to the shared scene; no new chains or assembly geometry are authored.

Balloon numbers resolve through the same assemblyDrawingBOM itemByPath pass as the table. Stored componentBalloon.path is the occurrence identity, independent of the current item number. Current occurrence placements and exploded offsets position the leader. Missing occurrences are explicitly dangling and their old glyph/leader is not displayed. Double-click a balloon for **Component balloon position**: automatic placement or finite horizontal/vertical paper offsets. This dialog cannot replace the BOM number. Dragging changes placement only; cancellation restores the prior automatic/manual state and offsets. Standard Drawing history/deletion remain available.

## Exact scope and safeguards

Anchors are actual native-mesh triangle centroids transformed by the current component frame and explosion offset. They are component-associated mesh surface points, not persistent BREP face/edge references or guaranteed frontmost silhouette points. No primitive envelope substitute is used when native meshes are unavailable. The assembly host caches derived targets by assembly owner, Drawing invalidation token and BOM row stamp; existing native rebuild/assembly preview invalidation refreshes the token. The Drawing scene key additionally folds live targets, BOM rows and explode chains, so metadata/pose/chain changes cannot retain a stale sheet scene.

The new path does not edit source parts, occurrence placements, mates, configurations, material or saved explode steps. Balloons persist in Drawing.notes, with original source path plus layout fields. Derived targets are recomputed and not saved as substitute CAD. Canvas/SVG consume identical resolved items. Source scope remains ordinary assembly views; specialty projections are rejected by the authoring command.

## Validation

27/27 focused tests passed: new assembly_drawing_balloons tests plus automatic balloon layout, BOM configuration identity/properties and last-principal deletion neighbors. The new regression uses an actual kernel extrusion mesh: eight distinct occurrence callouts, seven live chains, a repeated part BOM quantity2, normalized host replacement during Undo, no source/mesh mutation, duplicate prevention, cold Drawing JSON → identical shared SVG, live item/position changes without a body-token change, missing occurrence diagnostics, chain removal, layout-only dialog/Undo and stale dialog rejection. Separate tests prove real transformed triangle centroid placement and fail-closed missing/nonfinite native targets.

Module/free-identifier/link gates pass with683 modules. Final source assertion stage also passed1487 assertions. Parent owns actual Chrome FLASHLIGHT authoring, all8/7 visual readability, saved-copy source identity, actual drivers/Undo/cold and final acceptance. Source PartNo values and assembly10-F123 must be entered through ordinary source/occurrence metadata controls as described in flashlight-final-drawing-browser-route-audit-2026-10-10.md; automatic balloons do not fabricate those properties.

