# Basic Q2 / Q3 provenance and driving acceptance preflight

Read-only preparation for actual Chrome continuation; no app model or geometry changes. Basic Q1 is already accepted and excluded. This plan extends `basic-q1-q2-q3-browser-acceptance-plan-2026-10-09.md`; the existing Basic Q2/Q3 native geometry preflight remains the evidence, rather than a new reconstruction.

## Exact saved targets and current fields

| Question | Saved name / canonical key | Protected actual export | Existing material / provenance |
|---|---|---|---|
| Basic Q2 | CSWA Q2 copper bracket / `cm_mumwq36i` | `CSWA-Q2-browser-2026-09-29.mforge` | Body1473 and engineering profile1502: custom Copper (CSWA book 0.0089 g/mm3), density8.9 g/cm3. Density reference and qualification reference are empty. Four fully defined sketches, eight history steps. |
| Basic Q3 | CSWA Q3 cast alloy steel pin / `cm_mumxa3i6` | `CSWA-Q3-browser-2026-09-29.mforge` | Body1523: `stock:castAlloySteel`, density7.3 g/cm3. Existing density citation points to a 2011 reference. No engineering profile yet. Two fully defined sketches, four history steps. |

Both old exports use mm / kg, origin report frame. Neither contains document customProperties. That is a historical absence, not a claim about the restored live library after explicit UI edits. Source densities8.9 and7.3 are independently supported by official companion source properties; they are not derived from dividing printed mass by reconstructed volume.

## Browser controls and copyable text

Select the native body, open its material/appearance properties, then **Engineering material data**. Fields are **Grade / material specification**, **Density (g/cm³)**, **Density reference**, **Qualification data reference**, and **Material model**. Preserve the current catalog assignment. Changing the catalog resets dialog fields from its template, so enter provenance after any deliberate catalog change. Leave unspecified strength and rating inputs at zero; the density citation does not supply a certified grade or service rating.

For Q2 use density `8.9`, and **Density reference**:

> David Planchard, Engineering Graphics with SOLIDWORKS 2021, Basic Part Modeling Question 2, PDF page 497: Copper, 0.0089 g/mm3 = 8.9 g/cm3; official companion source density agrees. Grade unspecified.

For Q3 use density `7.3`, and **Density reference**:

> David Planchard, Engineering Graphics with SOLIDWORKS 2021, Basic Part Modeling Question 3, PDF page 498, Cast Alloy Steel; official companion source density 7300 kg/m3 = 7.3 g/cm3. Grade unspecified.

For either **Qualification data reference**:

> Educational reference material; density only. No certified grade, strength data, service rating, or capacity claim.

Use **Custom properties** (command search), **+ Property**, Name `Description`, Value below, then **Save**. These are ASCII descriptions, separate from the saved model name:

Q2:

> Planchard 2021 Basic Q2 copper bracket. Browser-authored parametric reconstruction; source geometry and density 8.9 g/cm3 checked against official companion. Educational, unrated material. Original opaque face selections/history are not reproduced.

Q3:

> Planchard 2021 Basic Q3 cast alloy steel pin. Browser-authored parametric reconstruction; source geometry and density 7.3 g/cm3 checked against official companion. Educational, unrated material. Original opaque face selections/history are not reproduced.

These text edits are explicit provenance improvements, not evidence that previous empty fields were populated. The future audit reports both preflight and final values.

## Meaningful existing driving dimensions

Q2: edit the first Top sketch `sk_2tdb4`, right base-hole diameter20mm, relation1467 / circle1465 at X+40mm. Change20 to20.1mm; Finish. Undo20, Redo20.1, Undo20. The left hole, stock, and upright dimensions stay fixed. Source-independent expected volume change is `-pi/4*(20.1^2-20^2)*14` mm3. Four sketches must remain fully defined; one native solid.

Q3: edit the first Front revolve profile `sk_1g7hb`, shaft axial span20mm, line1515 / relation `dim_3leysl9`. Change20 to20.1mm; Finish. Undo20, Redo20.1, Undo20. The R6mm shaft, R14mm head, and crown slot stay fixed. Expected volume change is `pi*6^2*0.1` mm3. Two sketches must remain fully defined; one native solid.

The retained sketch planes and feature scopes are already reviewed. Do not alter support planes, dimensions, feature order, or density to chase rounded book answers.

## Future actual-export audit runner

Prepared, syntax checked only; not executed during this preflight:

`scratch/planchard/basic23-future-driving-cold-step-audit-readonly.mjs`

Arguments: question2 or3, actual preflight bundle, actual changed bundle, actual restored bundle, actual cold bundle, actual restored STEP, audit JSON output. It reads all inputs without modifying them, rebuilds disposable copies sequentially, checks the actual20→20.1 driving delta, fully defined sketches, exact restored geometry, present-field cold durability, one valid native solid, and STEP bidirectional zero difference. It captures actual material/profile/context/customProperties values and input hashes. UI Undo/Redo, Save and screenshots remain parent-owned evidence. It writes only an audit JSON, never a model or geometry artifact.

Example invocation after all real Chrome exports exist:

```text
node scratch/planchard/basic23-future-driving-cold-step-audit-readonly.mjs 2 <preflight.mforge> <changed.mforge> <restored.mforge> <cold.mforge> <restored.step> <audit.json>
```

Source provenance: official publisher companion, https://www.sdcpublications.com/downloads/978-1-63057-407-9 ; independent property extraction `artifacts/planchard/remaining-official-source-properties-2026-10-09.json`. Browser material dialog implementation: `js/modeler_material_validation.js`; body button and custom-properties flow: `js/modeler.js`. This preflight makes no new UI acceptance claim.
