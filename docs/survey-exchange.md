# ModelForge survey exchange, version 1

A UTF-8 JSON document with extension `.mfsurvey.json`. No account or reconstruction service is involved. Keep a copy of this file as the portable backup: ordinary project files contain photo references, while this file embeds photo bytes.

Required envelope: `format: "ModelForge.Survey"`, `version: 1`, `units` (`mm`, `cm`, `m`, `in`, `ft`), and either `geometry` or `capture`. `sourceId` identifies the originating document/device session. IDs must be unique within each entity collection and each floor list. Unsupported versions, invalid endpoints, duplicate IDs, invalid dimensions, unsupported images and missing photo attachments are rejected before changing the live project.

`geometry` uses the planner's nodes, walls, openings, items, markers, floor voids, room metadata, wall types, constraints, parameters and survey features. Coordinates are X/Z in plan and Y upward. Openings reference stable wall IDs and a centre station `s`. Item rotations are degrees. `surveyFeatures` contains `point`, `polyline`, or planar `face`, with XYZ points and a stable ID. Planar faces must agree within 1 mm. DXF maps planner X/Z/Y to DXF X/Y/Z and declares centimetres.

`floors` contains stable floor IDs, names, elevations and scene snapshots. The current floor is identified by `activeFloor`. Imports convert geometry on every floor to centimetres. Files containing expressions/constraints in other units are rejected: they require explicit unit-aware recalibration instead of silently multiplying expressions.

`survey` contains versioned missions, measurements, captures, checkpoints and photo metadata. A reading has an ID, mission ID, target (kind, ID and floor ID), field, value, declared unit, source, reference (`interior` by default), status (`estimated`, `entered`, `checked`, `unresolved`), note and photo IDs. Observations are never replaced by dimensions calculated from the model. A geometry fingerprint invalidates a checked observation when its target changes. Native readings without located targets must be located and checked in the planner.

`captures` retains the unmodified original source separately from applied geometry, source units and alignment/correction records. `capture` optionally holds a compatible Apple CapturedRoom JSON object (in metres). Native companions retain each captured room separately; automatic multiroom fusion is not implied by a sequence of captures.

`attachments` contains photo records with `id`, name, MIME type and a JPEG/PNG/WebP base64 data URL. The corresponding `survey.photos[].attachmentId` must exist. Images are stored in IndexedDB separately from undo history; portable exports embed them. Peer transfers request only referenced photo IDs and transfer bounded chunks.

`navigationProfile` is project metadata in centimetres/degrees. Virtual walker findings do not modify the geometry. Live camera positions, cutaway state and analysis grids are not part of the exchange.

Alignment uses two corresponding X/Z point pairs (which may be shared-wall endpoints). It is rigid and refuses mismatched reference lengths beyond 2 cm. Matching complete shared walls and identical openings can be reused. Dimensional or overlapping-opening conflicts stop the merge for additional measurement.

`transform` supports a rigid planner-space transform: `translation: {x,y,z}` in declared envelope units and `rotationY` in radians. Rotation/translation apply to X/Z geometry and free service coordinates; item/void rotations are adjusted too. Vertical translation changes floor elevations and the height datum, preserving floor-relative geometry. The applied declaration is retained as `sourceTransform`. Matrix transforms are rejected. Navigation settings remain explicitly in centimetres regardless of geometry units.
