# Exercise 1.10 actual browser audit — 2026-10-10

PASS for the authored native model, actual STEP, saved drawing authoring, rib driving edit and final cold durability, within the illustrative source-grid scope.

The source is PDF86 / printed1-58, interpreted in [the source plan](drafting-1.10-native-browser-plan-2026-10-10.md). The chosen10mm/grid is illustrative. The source supplies no certified physical dimensions, material or mass. This audit reads actual Chrome exports and rebuilds disposable clones; it does not author or modify the saved model.

Saved key: `cm_mv1o5avl`. Name: `Planchard 1.10 - rounded stepped rib - browser 2026-10-10`.

## Native geometry and STEP

The authored export has three fully defined sketches, six history entries and three merged additive Bosses, along canonical Y, Z and X respectively. Independent rebuilding produces one valid connected solid, volume **35,356.19449019236mm³**, bounds **60×50×50mm**. The independent analytic sum `(33+3π/4)cm³` agrees.

Both Top arcs and the Front crown are genuine R10mm quarter circles with90° sweep. Their centers are Top(50,10), Top(20,40), Front(50,40)mm. The rib Side triangle is(Z,Y)=(10,10),(50,10),(10,30)mm, extruded X0..10mm. All match the source-plan branches and ownership.

The actual authored STEP imports as one valid solid with the same bounds and volume35,356.19449019259mm³. Native-minus-STEP and STEP-minus-native both have zero remaining volume. Both original input files remain byte-identical.

Evidence: `artifacts/planchard/DRAFTING-1.10-authored-native-audit-2026-10-10.json`.

## Saved drawing

The qualified export preserves sketches, constraints, features, history, source reference geometry, context, Description and all present part authoring/material fields. Changes are the Drawing, derived mesh/build token and rebuild/standards timestamps. Four native views, third-angle projection, Hidden ON and two genuine four-row notes persist. Every note row appears in the actual SVG, including illustrative units and absence of source physical/material/mass specifications.

The parent reports actual Chrome visual correspondence for Top divisionsX20/X50, rearZ10 and ribX10; Front internalX10/baseX30; Right slope and hiddenY20/Y30. The independent finite check confirms saved native inputs and SVG hidden-edge presence; it does not substitute that check for a full independent pixel/layout certification.

Evidence: `artifacts/planchard/DRAFTING-1.10-qualified-drawing-audit-2026-10-10.json`.

## Actual driving edit

The protected driving export changes only the third Boss X depth/end from10 to10.2mm. All three sketch definitions, first two features and history remain exact. Fresh native rebuilding gives one valid solid at **35,436.19449019236mm³**, an increase of **80mm³**, matching triangular area400mm² ×0.2mm. Overall bounds remain60×50×50mm.

Evidence: `artifacts/planchard/DRAFTING-1.10-driving-native-audit-2026-10-10.json`. Parent Undo/Redo/Undo and cold-restored proof will be attributed separately when final exports arrive.

## Final cold durability

The parent completed actual Chrome full reload, reopened the exact saved key, observed six history entries/three fully defined sketches and four native Drawing views with Hidden ON, read both four-row notes, and verified the restored third Boss depth10mm after Undo/Redo/Undo.

Independent comparison of qualified261027-byte and cold260954-byte exports passes every present authoring field, including whole Drawing, Description, units/context, references/default datums, history, sketches/constraints, features and all present part authoring/material fields. The complete SVG is **byte-identical**. The only model differences are `lastRebuild` and derived `parts[0].meshData`; the other cache/build-token fields compare equal in this pair. This is not a claim that regenerated caches always remain identical.

A fresh disposable cold rebuild again produces one valid connected solid at35,356.19449019236mm³ and60×50×50mm. Its difference against the actual authored STEP remains zero in both directions. No input artifact was modified.

Evidence: `artifacts/planchard/DRAFTING-1.10-cold-native-audit-2026-10-10.json` and `DRAFTING-1.10-cold-durability-audit-2026-10-10.json`. This acceptance covers browser-authored illustrative geometry, source-view correspondence reported by the parent, driving restoration, native STEP equality and durable drawing/source qualification. It does not certify undisclosed publisher physical dimensions or material.
