# Official companion follow-up: Advanced Q6/Q6A and Chain

Read-only source reconciliation, 2026-10-09. No reference geometry was imported, no app model was authored, and no acceptance claim is added here. ADVANCE remains parent-owned.

Publisher source: https://www.sdcpublications.com/downloads/978-1-63057-407-9. Archive `C:/Users/liron/Downloads/Eng_Graphics_SW_2021_Exercise_Files_V3.zip`; extracted chapter root `scratch/planchard/official-companion-2021/Chapter 10 CSWA Models/`. The previous “missing companion files” blocker is superseded. Readable dimensions/topology are a separate question.

## Advanced Q6/Q6A: source now confirms parameters and density

Ebook cursor: printed 10-31–10-32, PDF pages 511–512. This supplements `advanced-q6-source-browser-plan-2026-10-09.md` rather than substituting a new interpretation derived from the answer mass/COM.

The generic container inspector extracted 44 blocks per file with size and CRC verification. Evidence: `scratch/planchard/official-q6-container/manifest.json`, `official-q6a-container/manifest.json`, each `source-dimensions.json`, Keywords XML, MATERIALTREE XML, and `020-PreviewPNG.png`.

| Native source item | Published file parameter |
| --- | --- |
| Sketch1 | D1 150, D2 100, D3 100, D4 10, D5 70 |
| Boss-Extrude1 | D1 100 |
| Chamfer1 | D1 10, D2 45° |
| Shell1 | D1 10, D2 25, D3 25 |
| Sketch3 / Cut-Extrude2 | D1 30, D2 45 |
| Sketch4 / Cut-Extrude3 | D1 5, D2 R30, D3 60 |

Both Q6 and Q6A contain exactly this Keywords dimension set and Plain Carbon Steel material. MATERIALTREE gives `DENS=7800.000000`, i.e. **7.8 g/cm³**. This is the publisher model's nominal reference density, not certification of an actual steel product. The earlier unresolved choice between this source value and the app's representative 7.85 preset is resolved: author the exercise density explicitly as 7.8 using the UI and disclose this source. Do not alter the global material catalog merely to match an exercise.

The visible feature sequence is Boss → Chamfer → Shell → slot Cut2 → scallop Cut3. The preview shows the S-shaped rear scallop in the upper/lower shelves and the front U-slot in both shelves; it supports the prior two-arc interpretation. It does **not** label the two R30 arc centers/join, cut scope, sketch plane axes, or shell face selections. Keywords alone also does not associate Shell D2/D3 with specific faces. Those coordinates/topological associations remain to be read from native reference streams before treating the proposed G1 midpoint as exact.

Q6A adds `Coordinate System1`; the preview puts its origin at the illustrated right bottom shelf corner, with Y vertical and X/Z along the shown horizontal directions. Q6 has the same geometry dimensions. Exact transform/physical vertex still requires source-frame inspection; no origin should be derived by fitting the target COM.

Suggested next browser sequence after reference loci are resolved: new model → source base profile and 100 extrusion → 10×45 chamfer → variable-thickness shell 10/25/25 (or explicitly equivalent browser-authored features) → 30/45 U-slot → 5/R30/60 scallop → material/reference density → native volume/mass/COM → Q6A physical coordinate frame → Save/cold reopen/STEP and a reversible upstream parameter edit. No accepted task-fresh Q6 checkpoint exists yet.

## Chain: companion present; imported bodies have no sketch dimensions

Ebook cursor: printed 10-34–10-35, PDF pages 514–515. Main chapter source parts are modern compressed containers; the three similarly named `CSWA Sample Exam/` parts are legacy OLE containers and **different bytes**. They must not be silently treated as the same revision.

The main-folder `chain_link`, `long_pin`, and `short_pin` were each extracted as 44 size/CRC-verified blocks into `scratch/planchard/official-chain-link-container/`, `official-long-pin-container/`, and `official-short-pin-container/`. Their Keywords XML explicitly gives **Titanium**, `Default` configuration, and **Imported1**. There is no native sketch dimension list to recover from those Keywords. MATERIALTREE streams are empty, so the Titanium label alone does not prove a numerical density.

Previews `038-PreviewPNG.png` show: link with two ears at one end and a single tongue at the other, three holes; long and short pins are plain cylinders. This establishes intended shape, not exact hole spacing/diameters, ear thicknesses, pin dimensions, or density. Those require source B-rep/reference decoding. Cached `SW-MassProp-Config-0` strings are present but their tuple schema/units were not verified in this audit; they are not numerical acceptance targets here.

The official `CSWA Sample Exam/CSWASampleExam.pdf` is 33 pages. It is image-heavy: text extraction omits most actual questions, so conclusions below come from rendered pages 26–29. It confirms the chain assembly reference, MMGS, two decimal places, concentric pins without clearance, and pin end faces coincident with link side faces. Page 26 locates the origin at the first long-pin/top-link hole reference with Y upward and X/Z as illustrated. It does not dimension the individual parts or assign their material/density.

| Official sample page | Workflow / published reference |
| --- | --- |
| 26–27, question 7 | A=25°, B=125°, C=130°; COM (348.66, −88.48, −91.40) mm |
| 28, question 8 | Modify same assembly to A=30°, B=115°, C=135°; COM (327.67, −98.39, −102.91) mm |
| 29 | Answer key confirms both COM references |

Question 8 is useful additional publisher evidence for an upstream angle-change/cold-configuration check. It should not be confused with a new mandatory printed-book geometry requirement. The sample's modeling “Question 6” on pages 24–25 is a tool-block pocket modification, **not Advanced Q6** from ebook page 511; its AISI1020 material and ToolBlock dimensions must not contaminate the Advanced Q6 plan.

Next necessary Chain work: resolve exact dimensions and density from the appropriate reference revision; browser-author the three fresh parametric definitions; assemble source occurrences with native concentric/coincident constraints; apply the three illustrated angles and physical origin; compare COM without fitting geometry/density; then change the three angles and check the second reference. Source availability is now real, but Chain modeling remains pending.

## Source identity

| Main chapter source | Bytes | SHA256 |
| --- | ---: | --- |
| Advanced Part Modeling-Question6.SLDPRT | 95347 | 83118cb30f71c647844e9dc609bfb4931b5bd8e80c5b5efc303800b6d461b9ee |
| Advanced Part Modeling-Question6A.SLDPRT | 99935 | c742017dc083a36455f0ab13e6a8931d56095c7165326dd69f248598359004ac |
| chain_link.SLDPRT | 72311 | 84957466976d973ee991d5283d4921605e38119693dda32c22187feb89ea7755 |
| long_pin.SLDPRT | 35340 | 86dbb56afc1fc72840979ebcd1b6c65bed3a1b2a6c5d40f46b19d7983a5efdde |
| short_pin.SLDPRT | 40439 | d80dfd0e158cd9aca088c7caa982453e9aa353cfa5d565a0b22534b6cc149afb |

The legacy sample folder variants are 125952/101376/100352 bytes respectively. Sample PDF is 2822021 bytes, SHA256 `1f8a823e8ce0b4f6d29554eeb4df38ea24d355f92f14139624b49c58b3465ab4`.

No new concrete app UI defect was established by this source audit. Source dimensions not exposed by imported reference bodies are a reference-decoding task, not evidence that the app's authoring controls malfunction.
