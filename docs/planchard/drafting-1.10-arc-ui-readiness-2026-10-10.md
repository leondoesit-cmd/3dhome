# Exercise 1.10 sketch Arc UI readiness — 2026-10-10

Read-only source/UI review; no browser actions, model authoring, source code changes or ADVANCE edits. Frozen geometry plan: `drafting-1.10-native-browser-plan-2026-10-10.md`, PDF86 / printed1-58. Existing sketch tools support all three exact quarters.

## Actual tool and inspector paths

Sketch Three-point arc uses **Start → End → Through**, unlike Paper arc's Start → Through → End. Therefore use:

| Quarter | First click | Second click | Third click |
|---|---|---|---|
| Top right | (60,10) | (50,20) | (57.0710678118655,17.0710678118655) |
| Top lower | (30,40) | (20,50) | (27.0710678118655,47.0710678118655) |
| Front upper | (60,40) | (50,50) | (57.0710678118655,47.0710678118655) |

Centerpoint Arc instead uses Center → Start → End. Arc creation reuses snapped endpoint IDs, so pick existing line endpoints to establish actual closure, not merely nearby coordinates. If separate endpoint IDs were created, select each corresponding pair and add Coincident or use existing endpoint healing; verify zero open endpoints before Boss.

Single-click an Arc row in Sketch geometry, then choose the right-panel ruler tab **Shape** (tooltip **Shape & size**). Center U, Center V and R are there; double-clicking the geometry row is not a numeric arc editor. The R control adds or updates a driving radius. Numeric Center U/V alone do not establish permanent positional constraints on a free center. To anchor it, select the center point from Sketch geometry, click **Set point coordinates**, enter the exact center and Apply.

## Exact quarter constraint recipe

For each arc, use one fixed center, driving R10, Horizontal between center and start rim point, and Vertical between center and end rim point. Centers are (50,10), (20,40), and (50,40) mm. This fixes the two angular directions and radius without freezing the rim endpoints. Sketch geometry lists arc points in center/start/end order. Select the center and desired rim point using Ctrl, then use the corresponding Sketch & constraints button. The arc has an implicit equal-radius rule; do not add a second equal-radius relation.

Set point coordinates fixes only that point: free rim points may move while solving. Verify the desired branch after each relation. Do not fix both rim points and also expect R10 to remain an independently editable driver. If pre-existing fixed rim coordinates are retained for an illustrative coordinate-anchored construction, qualify that constraint strategy and avoid redundant radial drivers.

Base arcs are tangent to their adjoining horizontal/vertical contour segments. The Front arc's endpoint at (50,50) deliberately joins the downward X50 edge sharply; do not add Tangent to that edge. A generic fillet at an unrounded (60,50) corner would consume its whole 10 mm top segment and is rejected by the current finite-segment fillet guard; direct Arc is the existing supported workflow, not a missing capability.

For straight segments, snapped endpoints preserve identity, Horizontal/Vertical fixes orientation, and Shape & size Length adds a driving distance. Use independent dimensions only while those lengths remain free; derive remaining lengths from shared arc endpoints/anchors and closure. In the Front profile, after the fixed-center/R10 radial recipe and anchor (0,10), seven H/V straight segments leave the internal step locations set by three line lengths: inner X50 vertical length30, middle horizontal length30, and left X0 vertical length20. This yields (50,20),(20,20),(20,30),(0,30). Closedness and Fully defined must be read from actual browser results; this source review does not claim them for the parent's model.

Existing checks: `node --test tests/sketch_three_point_arc.test.mjs tests/sketch_tangent_arc.test.mjs` — 9/9 PASS, covering exact branch selection, endpoint reuse, degenerate rejection, tangency and healing. No new production change, new model fixture or full CI claim.
