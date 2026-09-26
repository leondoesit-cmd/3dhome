# Cabinet production review implementation

This increment provides revision-bound workshop review documents and explicit evidence records. It does not certify a cabinet, qualify a machine, or authorize CNC production. The application remains a static browser app with local project/session state.

Open the feature through **Cabinet designer → Cut plan & quote → Production parts & standards**.

## Delivered scope

- Physical cabinet part manifests with persistent cabinet/part occurrence identifiers, stable across resizing and cabinet ordering. Structural topology changes invalidate bound overrides. Manifests include millimetre dimensions, sheet/material references, grain direction, and rectangular/polygon/unsupported geometry distinctions.
- Finished design dimensions remain distinct from substrate deductions and rough blanks. Explicit edge assignments bind to the current part axis datum, reference stocked bands, and reject inconsistent thicknesses or impossible deductions. Unknown allowances stay unknown.
- Revision snapshots retain the source design and manufacturing manifest. Exact canonical comparison detects changed dimensions, hardware/design settings and overrides; purely visual door opening and selection order do not invalidate a revision. Human-readable fingerprints also cover hardware evidence.
- Draft, checked and released **review-document** states require a reviewer, evidence reference, current design, and explicit acknowledgment of document issues. Invalid identities, geometry or edge allowances block checking. Every state retains `machineReady:false` and `productionRelease:false`.
- Cut, band, drill, assemble and inspect station records bind to a part and revision, require an operator and timestamp, and enforce station order. Band/drill may be skipped with an explicit reason. Records are operator reports, not process certification.
- Saved job imports validate the snapshot fingerprint and station sequence. Imports reopen as draft and retain valid station history explicitly marked imported/unverified. HTML travelers preserve that distinction.
- CSV part lists, printable labels, assembly travelers and dimensioned per-part SVG drawings. Drawings show original-datum face A/B views, hole tables, thickness, cutting versus drilling axes and missing-operation coverage. Polygon rectangles are labeled bounding blanks, never represented as finished contours. All documents retain review-only warnings and escape external text.
- Native project facts and the local hardware article catalog support explicit review inputs; neither claims universal manufacturer coverage. Hardware evidence slots require exact user-supplied manufacturer, SKU, source reference, revision, target part and verifier. These references are not fabricated vendor catalog data.
- Integrated interfaces also expose scoped standards/evidence review and a mating-joinery review planner. Standards evidence is partial and destination/product specific; joinery requires supplied connector dimensions and drawing references.

## Continued implementation

- **Reviewed stock datums:** part allowances now accept an explicit distribution of rough surplus to the minimum length/width edges, a reviewer and a setup drawing. The binding includes stock dimensions, edge deductions, axes and topology. Complete shop recipes with matching positive model axes translate both faces into the cut-stock datum and validate holes before and after translation. Ambiguous generic drilling remains blocked. Apply allowances and record the stock datum before downloading a complete recipe draft.
- **Stock-aware drawings:** production drawing exports use the applied shop profile's complete recipes. Translated views identify the actual cut-stock envelope, offsets, reviewer and setup reference. Unapplied profile edits block drawing export. Machine setup also exposes initial tool X/Y and signed holder-bottom offset inputs.
- **Router rectangular nesting:** Cut plan & quote includes a MaxRects router option alongside guillotine panel-saw packing. Both validate dimensions, bounds, grain orientation and spacing. Rack pieces retain their actual dimensions and grain axes; recoverable rectangles are disjoint and rounded down when banked. CSV/DXF identify the algorithm, production part IDs and review scope. Router labour is a perimeter estimate using the existing saw-rate proxy; this is not contour nesting or CAM.
- **Persistent joinery:** reviewed mating plans save on the face cabinet, participate in project history and revision snapshots, and can be loaded for revalidation or removed. Bound part geometry, topology, material, edge assignments and authored connector details prevent stale plans contributing operations. Review drawings include separate face and edge views and a hardware reference. Saved plans remain supplemental review operations; neither face nor edge plans are automatically merged into CNC programs.

Shop datum configuration is stored in `cab.productionOverrides[partId].machiningDatum`. Saved mating plans are stored in `cab.joineryPlans`. Both travel with the cabinet project; job JSON includes the immutable source snapshot and evaluated joinery report.

## Operation coverage and handoff

- **Physical operation inventory:** `cabinetOperationCoverage(items, recipes)` identifies complete drilling recipes, justified no-drill panels, partial generic patterns, missing operations and unsupported parts. Counts are face-specific; saved joinery review operations remain separate. The production UI provides a per-part inspector and JSON export. Recipe coverage does not imply coverage of grooves, contours or every manufacturing process.
- **Stable recipe bindings:** recipes target persistent cabinet IDs rather than selection indexes. Manufacturing geometry is evaluated with doors/drawers closed. Visual opening, runtime animation, saved joinery and allowance-review metadata no longer invalidate a finished-board recipe; actual geometry, hardware and topology changes still do. Stock mappings are validated independently. Older recipe signatures require a fresh draft after this change.
- **Batch allowances:** choose a source with valid allowances, explicitly select matching targets and review the before/after changes. Matching requires identical role, material, stock, grain, datum and finished dimensions. Apply is atomic and rejects changed sources/targets or altered previews. Only normalized edge and rough allowances copy; existing target machining-datum approvals are cleared. The change participates in undo history.
- **Review handoff package:** `createCabinetReviewPackage(job, items, {recipes, standardsContext})` returns one immutable JSON container with 11 fixed-name text files: README, job, evidence, manufacturing, coverage, joinery, standards, parts CSV, labels, traveler and drawings. The UI builds/downloads a package, verifies a saved package and downloads individual contained documents. Packages bind supplemental evidence as well as the design revision, so a changed recipe cannot silently reuse the same package contents.
- **Archive integrity:** import validates per-file and package checksums, the embedded revision and exact regenerated reports/documents. Checksums detect alteration; they are not digital signatures or proof of authorship. Source order and animation are canonicalized. External advanced CAD edits are rejected because the package does not embed their geometry definitions. Reconstruction depends on the current implementation; an incompatible future renderer may require an explicit package migration.

## Revision comparison and dimensional inspection

- **Revision comparison:** select an archived snapshot and compare it with the current saved revision. The report identifies added/removed/changed physical part IDs, exact dimension deltas, material, grain, edge allowances, stock datums, joinery, evidence and source-setting changes. A topology change explicitly warns that a reused semantic ID cannot establish physical-board continuity. Printable HTML and spreadsheet-safe CSV retain both revision IDs. Live edits require a new snapshot before comparison/export.
- **Inspection plans:** add an explicit part, dimension basis (finished/substrate/rough), dimension and positive/negative tolerance. No standard or shop tolerances are inferred. Nominals derive from the revision snapshot; unknown dimensions cannot be inspected. Plans and measurement records bind to the exact revision and criteria.
- **Measurement history:** records require a positive measured dimension, operator, instrument ID, calibration reference and UTC timestamp. Remeasurements append to the history; the latest measurement determines the displayed result. Results distinguish pass, fail, not measured and stale, and never qualify production. Instrument/calibration references are recorded claims. A documented `1e-9 mm` comparison margin absorbs floating-point noise; stored quantities and exported tolerances remain unrounded.
- **Persistence and handoff:** save or import inspection JSON and export printable HTML/CSV. Stale plans block new measurements and current-review exports, but can still be saved as JSON archives. Imports mark measurements as imported/unverified. When a current inspection plan exists, the review package includes four additional files: inspection plan JSON, report JSON, HTML and CSV (15 files total). Failed results are preserved. Packages without inspection retain the original 11-file format.

The illustrative inspection document is `output/cabinet-production-review/sample-inspection.html`.

## Core APIs

`cabinetProductionParts(items)` returns a pure parts/issue manifest.

`createCabinetProductionJob(items, {jobId, hardwareEvidence})` returns a deeply frozen draft snapshot. `cabinetProductionStaleness(job, items)` compares it with the live design. `validateCabinetProductionJob(job, items)` returns document validation findings and unconditional production blockers.

`transitionCabinetProductionJob(job, status, {items, reviewer, evidence, acknowledgedIssues})` returns a new frozen job or throws. Acknowledgments use manifest issue codes; released means review documents only.

`recordCabinetStation(job, {items, revision, partId, station, operator, note, skipped, skipReason, timestamp})` returns a new frozen job or throws. `importCabinetProductionJob(json)` validates and reopens an archived job.

`cabinetProductionCSV(job)` and `cabinetProductionHTML(job, {document:'labels'|'traveler'})` produce review artifacts. `cabinetProductionDrawingHTML(job, items, {recipes})` rejects stale live designs and regenerates manufacturing evidence internally. Optional complete recipes are supplemental review evidence, not machine qualification.

No workflow API writes global storage. The parent UI owns the session and file downloads.

## Validation evidence

- Latest inspection increment: **189 cabinet/nesting unit tests and 17 browser tests passed**. Commands: `node --test tests/cabinet*.test.mjs tests/nest*.test.mjs` and `node --test --test-concurrency=2 tests/cabinet*.browser.mjs tests/nest_rectangular.browser.mjs`.
- New regression coverage includes negative stock offsets, exchanged recipe axes, finished/stock edge-breakout rejection, translated CNC coordinates, current shop-recipe drawing exports, deterministic random nesting/clearance checks, disjoint rack remnants, saved joinery lifecycle and stale-plan release blocking.
- Focused workflow/drawing tests cover immutable snapshots, stale evidence, selection reorder, visual door opening, review gates, malformed evidence, station order, imported history, CSV/HTML escaping, numeric labels, original-datum asymmetric face coordinates and polygon labeling.
- Final `npm run check` passed, including module free-identifier, import-link (525 modules), and source assertion checks.
- Browser verification confirmed readable drawing exports, router sheet layouts and stock datum controls. The illustrative saved-joinery artifact is `output/cabinet-production-review/sample-saved-joinery.html`.
- The broad `npm test` run in `/tmp/cabinet-full-unit-tests.log` was stopped before completion after more than twelve minutes in unrelated kernel tests. It does **not** establish a whole-repository green result. Reported failures included sandbox `listen EPERM` in external bridge/browser tests and an unrelated kernel source-regex assertion. An obsolete cabinet datum expectation observed early in that run was corrected and passed subsequent focused testing. No final whole-suite totals are claimed.

## Remaining production gaps

Universal jurisdictional compliance is not implemented. Additional standards, editions, product classifications, verified evidence and qualified review may be required for a particular destination and use.

The app does not include a verified universal hardware/vendor catalog, universal machine/controller postprocessor qualification, full contour/edge CAM, workholding/collision certification, or validated tooling libraries. Generic drilling and geometric review do not establish manufacturer compatibility.

Physical first-article checks, material and hardware verification, machine setup qualification, measurement/inspection and shop acceptance remain external evidence. Document release and recorded station completion never satisfy those requirements automatically.
