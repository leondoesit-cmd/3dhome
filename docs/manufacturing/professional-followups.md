# Professional CAD integrity follow-ups

All four follow-ups from review batch 6 are implemented.

## Independent native rebuild recovery

Native history now validates dependencies per branch, blocks consumers of unavailable sketches, supports or parameters, and continues rebuilding independent features. Failed feature records remain editable and acquire an error; a successful repair clears it. Rollback and suppression remain respected. Sketch equations and solved profiles feed native construction without cloning unrelated imported payloads.

The editor publishes healthy branches even when regeneration reports failure. Automatic STEP/IGES export still requires a complete successful run; a surviving final shape alone is insufficient. A caller can explicitly export an individual recovered body. Regression coverage verifies its volume through native STEP export/import.

## Physical fillet start/end anchors

Variable-fillet selection creates a persisted `startPoint` on each selected open edge. The viewport labels both ends with the edge number and Start/End text. Constant fillets keep their existing behavior.

The native operation resolves the anchor against OCCT contour endpoints and maps the radii accordingly, using the actual selected edge's contour index. Reversing a raw edge wrapper is not used to decide direction. Invalid, ambiguous or displaced anchors fail with a request to reselect the edge; they do not silently change the radius law. Older recipes without anchors retain their existing kernel convention. Internal edges of an extended tangent contour may require selecting a contour endpoint before an anchored variable law can be applied.

## Section-boundary diagnostics

Section reconstruction welds endpoints by geometric distance, including across neighboring spatial buckets. It detects open chains, duplicate edges, branched vertices and intersecting boundaries. An ambiguous section receives no hatching, and both the drawing scene and exported SVG carry a visible repair message. This avoids filling a missing or invalid inner boundary as solid material. Disjoint and nested valid rings remain supported.

## Manufacturing-table provenance

The registry covers 61 installed groups across fasteners, pipes, hardware, holes, fits, stock materials, knurl pitches and dimensional standard packs. Each declares its local source, edition status, explicit supported entries and no-interpolation policy. Fits also expose diameter and grade coverage. A collapsed table-sources panel is available in the material/appearance panel even without a body selection.

Whole-catalog integrity validation checks finite data, required provenance fields, clearance ordering, approximate tap-drill consistency and fit-series completeness. Unsupported keys and unavailable verified editions return explicit diagnostic codes. The clearance fields link to the previously checked 2025 supplier chart.

An unknown edition is stored as unknown. The registry does **not** turn a handbook value or a structural integrity check into standards certification. Purchasing or independently verifying authoritative dimensional packs remains separate work. User-supplied bend tables retain their existing source, units, row validation and exact-match requirements; they are not represented as installed catalog packs.

## Regression coverage

- Native independent failures, repair, suppression and rollback.
- Exact mass and STEP round-trip of an explicitly selected recovered body.
- Physical variable-fillet endpoint reversal and stale-anchor refusal.
- Section branches, crossings, duplicate edges, open paths, geometric welding and nested holes.
- Repair messages in exported drawing SVG.
- Entire installed table inventory and corrupted/unsupported table cases.
- Browser checks for fillet labels, persisted parameters and material-panel provenance.

## Validation results

The full Node suite passed 2,430 tests with no failures. After the final refinements, the focused recovery/fillet/export/migration suite passed all 14 tests. Four browser checks passed, including both endpoint labels and the ordinary-body table-source panel. Repository identifier, import-link (457 modules), source-assertion (1,402 assertions), and whitespace checks passed.
