# Five remaining design-intent/rollback browser witnesses

Read-only route planning from supplied PDF120 / printed2-34 and PDF193–194 /4-13–14, current feature catalog/controller and accepted artifact inventory. No browser/CAD/code/ADVANCE/Git changes. Prior matrix already identifies these exact example proofs as unlocated. Reuse any newly found genuine prior proof instead of duplicating it. Values below are **chosen illustrative mm**, since these paragraphs do not specify a complete dimensioned manufacturing part.

Shortest route: one independent rectangle part closes midpoint and symmetric-depth examples; one disk/tooth part closes circular-pattern and functional rollback examples; two saved copies of one simple box demonstrate feature order. Existing numbered geometry/reviews remain accepted, not reopened.

## 1–2. Bottom-edge midpoint, then Mid Plane depth

New independent part, mm; Front sketch; ordinary Corner Rectangle initial corners(-20,0)/(20,15). Retain genuine horizontal/vertical corner relationships. Add one sketch Point at Origin(0,0), constrained/fixed there, if the app's Origin glyph cannot itself enter the relation selection. This fixed-origin sketch point is an explicit app equivalent of the source Origin, not a free datum. Select that point and bottom horizontal rectangle line → **Midpoint** relation. Current relation UI requires **point + line** and persists `{type:'midpoint',point,entity}`.

Dimension width40, height15; require fully-defined rectangle with bottom y0, left/right x−20/+20, top y15. Check existing autosnap constraints before adding redundant relation: if a free point-on-line relation duplicates the stronger midpoint, remove that redundant relation through ordinary UI, never drop the Origin anchoring or Midpoint. Do not apply Fix to all four corners; that would defeat the driver.

Real width driver40→46: expected bottom endpoints(−23,0)/(23,0), top y15, midpoint exactlyOrigin, height unchanged. Export driver; Undo→40, Redo→46, Undo→40 as supported; Finish sketch and Save. Exact constraint/native/source/cold audit validates the result, not just a picture.

On the restored sketch ordinary **Extrude/Boss**: **End condition=Mid plane**, Depth10mm, Offset0, DirectionForward, merge. Catalog stores `endCondition:'mid-plane'` and `symmetric:true`; Front-plane normal is Z. Nominal native bounds X±20,Y0..15,Z±5 mm. Ordinary edit Depth10→14: Z±7, origin-plane symmetry and sketch X/Y unchanged; expected volume6000→8400 mm³ for this simple rectangle. Actual driver/Undo/restored Save/cold provides separate proof of source feature ExampleA. Do not equate native mesh bounding tolerances with exact BRep extents; independently audit the native body.

**Reuse alternative:** protected ANGLE-valve final contains `cm_munfbmor`, named `Planchard 8.6 - valve body - fresh designer example 2026-09-30`; feature `feature_munfdu26_1`, Extrude/Boss1, MidPlane depth4cm, axisX, from−2/to2cm. It establishes nominal symmetry but is on a different plane and has downstream features. A copy can show the equivalent depth driver, explicitly qualified; the fresh simple Front rectangle avoids unnecessary assembly/context complexity and satisfies both examples.

## 3. Genuine feature Circular Pattern32→24

Independent illustrative part, mm, Top plane. Fully-defined Origin-centred circle diameter60 → Boss8mm. Separate Top-plane rectangle X28..34/Z−1..+1 (width6/depth2, centre31/0), fully defined by dimensions/centre constraints → Boss8mm **Add material/Merge**. It overlaps the disk by2mm radially and makes one finite external tooth. Use a real editable source tooth feature, not separate manually placed teeth.

Select tooth Boss in feature tree → **Pattern**. Exact catalog controls:

- **Pattern scope=Pattern seed only** (`scope:'feature'`), correct source tooth feature ID;
- **Pattern type=Circular**; **Circular instances=32**;
- **Circular extent=360°**, **Circular axis=Y axis**, **Equal spacing=on**;
- **Distance from axis=0** (source tooth is already positioned); **Merge instances=on**; Skip copies blank.

Verify preview/current native rebuild produces one connected disk with32 total tooth positions including seed, not32 full disks or32 additional copies. Ordinary pattern edit Circular instances32→24; extent/source feature/axis remain unchanged, angular step11.25→15°. Count actual native radial teeth/feature instances, source IDs and volume/topology; export driver, Undo/restored Save/cold. Do not infer acceptance merely from the Count field. Source paragraph says34 then specifically instructs32→24; disclose following the explicit edit example. This simple rectangular tooth is illustrative, not an involute gear or certified manufacturing gear.

## 4. Shell/Fillet order consequence

Independent simple base: Top centred30×30 square → Boss20mm. Save base; create two **ordinary Save copies**. Keep exact same base graph and dimensions; do not edit original accepted Housing.

CopyA: select actual top planar face → **Shell**, Thickness2mm, DirectionInside, Remove selected facesOn, Corner joinIntersection for the controlled comparison. Require one valid open box. Then select the **four exterior vertical corner edges only** → Fillet4mm. Inner vertical corners remain sharp; check source/native faces and do not accidentally fillet inner edges or the opening rim.

CopyB: original solid base → four exterior vertical edges Fillet4mm → actual top face Shell2mm/Inside/Remove selected/Intersection. Inner vertical corner rounding is expected approximatelyR2mm from the inward offset of an outerR4mm surface; confirm actual native geometry rather than assuming that result. If kernel rejects a particular order or selected edges, record the failure precisely and revisit the bounded geometry/control selection; do not claim order parity from the other copy alone.

Same final outer footprint/height, different inner corner topology is the source's intended comparison. Genuine graphs must be Base→Shell→Fillet versus Base→Fillet→Shell. Export both/native validity/inner-face geometry and clean Saved cold. Native selection references must resolve to intended outer edges after each upstream operation. A wireframe/section screenshot can make the contrast readable, but analysis must derive from native surfaces. Chosen dimensions are not provided source dimensions.

## 5. Functional rollback / Roll to End

Reuse the restored illustrative disk/tooth part, or one box copy. Select the later actual feature in tree → context **Rollback here**. Current action sets history rollback at the selected feature's index, excluding that feature and later consumers. For the disk, rollback before tooth Boss should show only the base disk, native tooth count0, while entire stored sketches/features/parameters/history remain intact. Rollback before Pattern should retain exactly the seed tooth. Neither operation may delete graph nodes or replace canonical authoring with imported geometry.

Use tree rollback release/return-to-end control (translation key`rollbackRelease`) to restore full history; ordinary tree UI handler clears the canonical rollback marker. Current UI may label this differently from source **Roll to End**—record its actual accessible label. Require exact restored source/native32-teeth body (or restored24 if deliberately final), then Save/cold. If claiming source's additional save-at-arbitrary-rollback behavior, separately save the rolled-back copy and prove reopened earlier body plus later intact graph; do not imply that from restored-final Save.

Source BRACKET steps20–25 roll above10mm hole, then aboveFillet1, then Roll to End. Original official `Bracket/Bracket.SLDPRT` exists, but native proprietary feature-tree import/replay is unproved. This route is **functional illustrative rollback parity**, not an exact original BRACKET-file reproduction. Stored graph plus a screenshot of an unchanged full mesh is insufficient; actual earlier native shape must change.

## Common evidence and stopping rules

For each claimed behavior: ordinary actual controls/picks, current native success, protected nominal/driver/restored bundle and actual SVG/PNG/STEP where useful, genuine Undo when claimed, clean Save/cache-bypass/exact Saved cold, source/canonical/native comparison enumerating derived-only differences. Metadata explicitly citesPDF120/2-34 or193–194/4-13–14 and chosen dimensions/shape equivalence. No source-authored CAD scripts/import. These five examples do not resolve damaged3.9 glyphs, Plane7H ownership, proprietary format import or physical printing, and cannot establish a whole-book percentage.
