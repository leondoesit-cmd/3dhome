# Native vertex-to-plane Distance acceptance

Completed the app capability needed for Planchard PDF page 399: Switch Loft top vertex to Handle top planar face, Distance .1 in (.254 cm). The book assembly mate itself remains the root agent's workflow.

The chooser exposes real native edge endpoint vertices. Each reference retains its source edge identity and endpoint index; each solve resolves the current edge rather than using the saved coordinate. Nested component topology now transforms edge endpoints into the holder's local coordinates.

Point-to-plane Distance enforces one signed separation equation in either holder order. It imposes no orientation constraint. Existing plane-to-plane Distance retains its orientation equations. Missing native geometry is rejected.

## Actual desktop Chrome acceptance

Used only human UI interactions on tab 710858796 and the independent two-component QA assembly built from fresh parts during this book task. Removed the disposable plane-axis relation, chose the base's native end face at Y 1 cm and the screw's native shaft end vertex, opened Distance mate, entered .254 cm, and applied.

- One editable Distance mate; five degrees of freedom.
- Save completed with a clean Save control.
- Project bundle exported normally: 542,724 bytes.
- Cold Chrome reload and library reopen retained the Distance mate and five degrees of freedom without native reference issues.
- The QA library record retains the earlier name `Plane-axis Coincident - fresh task QA 2026-09-30`; its previous axis acceptance export is separately protected.

Portable checkpoint: [Vertex-plane-Distance-fresh-browser-2026-09-30.mforge](Vertex-plane-Distance-fresh-browser-2026-09-30.mforge).

![Created mate](C:/Users/liron/Desktop/3dhome/artifacts/planchard/Vertex-plane-Distance-created-browser-2026-09-30.png)

![Cold reopen](C:/Users/liron/Desktop/3dhome/artifacts/planchard/Vertex-plane-Distance-cold-reopen-browser-2026-09-30.png)

## Verification and stop state

13 focused solver/chooser regressions passed, including five freedoms, both holder orders, repeated JSON round trips, edited native endpoints, nested endpoint transforms, missing reference rejection and existing plane-to-plane behavior. `npm run check` passed: no free identifiers, no link errors across 617 modules, 1,490 source assertions.

Stopped further source edits at the user's requested nearest-task checkpoint. No unsaved geometry remains in this agent's QA tab. Root live tabs were not operated or closed. Native face cache persistence and browser responsiveness audits remain pending; this result does not claim those gaps fixed.
