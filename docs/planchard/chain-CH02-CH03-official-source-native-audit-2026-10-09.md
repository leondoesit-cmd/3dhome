# Official chain pins CH02/CH03 — native geometry pass

Closed acceptance follow-up: both `CHAIN-CH02/CH03-official-source-closed-browser-2026-10-09.mforge` bundles preserve features, sketches, history, material, parameters, local frame, canonical references and authored part data exactly. Acceptance descriptions/rebuild caches and any canonical standard-reference initialization are the permitted differences. Parent observed both depth driving edits followed by nominal Undo and actual cold reload/saved-library reopen with two steps, one native solid, density4.6 and source properties preserved. Both compact `...-closed-consistency-...json` checks pass; no heavy native rerun is needed for unchanged authoring data.

Both actual Chrome exports pass all14 definition checks independently. Each contains one active feature, one fully-defined Top sketch and two editable history steps. The ordinary Ø50 driving diameter and fixed centre are retained; reverse Blind extrusions preserve source origins at Y0 and endpoints Y−300/−100. There are no shoulders or extra geometry.

| Part | Native volume mm³ | Mass at source Titanium4.6 g/cm³ | COM mm | Bounds mm |
|---|---:|---:|---|---|
| CH02 long pin | 589048.6225480862 | 2709.6236637211964 g | (0,-150,0) | 50×300×50 |
| CH03 short pin | 196349.54084936206 | 903.2078879070654 g | (0,-50,0) | 50×100×50 |

Each rebuild has one valid native solid and no issues. Both native-minus-STEP and STEP-minus-native differences are **zero** for each part. Volumes agree with independently measured official plain cylinders π·25²·length, without mass fitting. Custom material retains the official source4600kg/m³ reference, unspecified grade/condition and zero strength values; no qualified strength/service rating is claimed.

Evidence for each CH02/CH03 is under `artifacts/planchard/CHAIN-CH0X-official-source-...-2026-10-09.json`: native audit, STEP equivalence and design audit. Read-only helper `scratch/planchard/audit-chain-pin-readonly.mjs` records constraints, source extents, material and unchanged input. Parent observed CH02 depth300→300.2 regeneration and Undo restoring nominal; cold-reopen checks remain pending separately. No authored files, browser, source or ADVANCE mutation occurred.
