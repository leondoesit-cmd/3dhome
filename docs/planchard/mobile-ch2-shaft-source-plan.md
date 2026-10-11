# Chapter2 shaft view examples — native mobile source plan

Original rendered pages `scratch/planchard/mobile-source-101.png` (printed2-15/PDF101) and `mobile-source-102.png` (2-16/PDF102) visually inspected. The two101examples and dimensioned102example are distinct source tasks. No app geometry or prior desktop model authored/reused by this source plan.

## Source interpretation

PDF101Example1: horizontal solid stepped shaft, large section atleft and smaller section extendingright. Front is stepped rectangular silhouette with a horizontal axial centerline. Right shows two concentric **visible circles**, outerlarge-cylinder circumference and smaller-cylinder end; this is a solid stepped shaft, **not a tube/bore**. Crossed centermark inRight extends beyond outercircle.

PDF101Example2: same qualitative stepped shape vertical, large lower section and narrow upper extension. Front has a vertical axial centerline; Top, directlyabove andaligned, contains two concentric visiblecircles/crossed centermark. Neither101illustration gives numeric dimensions ormaterial. Suggested illustrative dimensions only: largeØ20,length25;smallØ10,length15,overall40. No measuredpublisherclaim.

PDF102Example1 gives actual source inchdimensions: largeØ2.00,smallØ1.00,large-sectionlength2.50,overall4.00;hence smallerextensionlength1.50. Solidsteppedshaft, nohole. Centerline and explicitdiameters make this **one-view** adequate. Sourcepoint is annotation/vieweconomy, not simply repeating prior two-viewartifact.

## Preferred natural native-touch modeling

Two connected native Bosses are straightforward for actual mobile touch, with driving diameters/depths. A native Revolve of a single closed stepped half-profile is an equally sound alternative if parent already has a comfortable touch axis-selectionworkflow; source does not demand one featurehistory.

### A. Horizontal two-view shaft,PDF101Example1

1. CleannativePart; choose **Right/Z·Y** plane after visible UI verification. Place actualorigin-centered circular sketch with native Circle. DriveØ20mm via visible circle dimension/control;fullydefinecentercoincidence.
2. NativeBoss depth25mm;actualpreview/bodybounds must showlongaxis **X**. Choose sign to makelargeportionleft ofsmallextension inFront; defaultSWscreenorientation cannot beassumed.
3. Actualtouchpick farcircularendface; startattachedsketch. Placeorigin/concentric smallcircleØ10, fullydefine. Boss15mm outwardwithMerge;inspectactualfaceanddirection. Resultoneconnected solid, twosketches/twoBosses, noinnerloop/cut.
4. NativeDrawing: Front+Right **only**,thirdangle;RightcenterhorizontallyalignedwithFrontaxis. Remove/unselectunneededTop/isometric views through visible viewcontrols, notDOM/appstate mutation. LabelFront/Right and “Part in horizontal position”.
5. ActualgeneratedRightmustshow twovisiblecircles, nohiddenborelines. Addcenterannotations asbelow; nativecoldreopen andexportbeforeacceptance.

### B. Vertical two-view shaft,PDF101Example2

Independentlycreate on **Top/X·Z** plane, Bossalong **Y**, largebottomØ20×25mm thenattachedtopfaceØ10×15mmBoss. Visiblepreview/bodybounds andFrontorientation mustprove narrowextensionupward. NativeDrawingFront+Top only, Topaboveandcenteraligned;verticalFrontcenterline andTopcrossedcentermark. Label “Part in vertical position”. Do notcountreopening thehorizontaldrawingwithrotatedcamera asnativeverticalmodel proof.

### C. Source-dimensioned one-view shaft,PDF102

Independentlycreatehorizontalmodel likeA using sourceinchvalues: largeØ2.00,length2.50;smallØ1.00,length1.50. Equivalentmm:Ø50.8/25.4,lengths63.5/38.1,overall101.6. Use actualdocumentunitpicker/visiblefeaturefields; dimensionlabels mustretain sourceinchmeaning. NativeDrawingFrontonly; annotationextentØ2.00onlarge,Ø1.00onsmall,2.50large-segmentlength,4.00overall. Noextraendviewneeded. Centerline visiblyshowsaxialsymmetry.

If drawingdimensions cannot be inferred automatically, use visible native modelitems/dimensionpicks andverify measuredvalue/unit. StatictypedNotesalone do notprove native linked dimensions; qualify any staticannotationfallback. Source102also includes thirdangle symbol and introducesflatpartthicknessnote; those are next distinctillustrations, notaccepted byshaftalone.

## Native drawing centerline / centermark controls (read-only code audit)

- **Sheet setup → Centre marks** checkbox (`mdSheetCentersBox`; englishcaptionfromsheetShowCenters) controls native generatedcenterannotations. Enable and inspectactualendview/export; presenceofcheckboxdoesnotprove neededlinesweregenerated.
- NativepaperLine's **Edit drawing annotation → Line style → Centerline** is supported (`modeler_drawing.js` stylechoice). If longitudinalaxis doesnotautogenerate, author actualtouchline through the steppedFrontcenter, slightlyextendedbeyondsilhouette, thenapplyCenterlinestyle. This manualannotation is separatefromgeneratedgeometry.
- If crossed endcentermark is absent, nativepaperhorizontal/verticalcenterlinestrokes canbeactualtouchauthored atcirclecenter, extendingoutsideoutercircle. Qualify manual staticpapercentermark; do notclaim it is automatically linked to modelmovement.
- Sourceleadernotes “HORIZONTAL CENTER LINE” or “VERTICAL CENTER LINE” mayuse nativeLeader ifavailable;plainNoteisacceptable withsimplifiedleaderqualification. Noextra hiddenbore/centerholeinvented.

## Acceptance and progression

Threeindependentlynamed artifacts: horizontal101Example1,vertical101Example2,dimensionedone-view102Example1. Recordactualsource/illustrativescope inDescription,save/export,actualcoldlibraryreopen/nativebody/drawingchecks,phone390×844screenshot,progressupdateandpushaftereach. No publishermaterial/massclaimed. NextPDF103/printed2-17 flatpart with/withoutthicknessnote, followedPDF104countersinkannotation illustration.

## PDF102: native linked dimension authoring — code audit

Native **Edit dimension → Dimension text → Displayed value** supports the live placeholder `<>`. Set a silhouette-height dimension's displayed value to **`Ø<>`**, not literal `Ø2.00` or `Ø1.00`. The template keeps the measured value live; plain numeric text freezes the annotation. This is supported native formatting, not a static Note. The stored dimension remains a vertical linear measurement with a live diameter prefix; do not claim it becomes a radial `diameter` measurement type.

Set native sheet units **in**, nominal decimal places **2**, and trailing zeros on. These settings control displayed2.00/1.00/2.50/4.00. If a dimension is selected, the native text form also has **Nominal decimal places → 2** independently of the sheet. Keep quantity1/referenceoff unless source requires otherwise.

**Insert Model Items** only imports circular sketch dimensions into a face-on end view. `js/core/model_items.js` explicitly refuses a diameter leader on a shaft side silhouette; therefore a Front-only horizontal shaft sheet will not import both circle diameters just because the source sketches contain them. This is correct model-item behavior, not evidence that the sketch is unlinked. Model Items may supply linked Boss lengths2.50/1.50 when surviving start/end topology is available, but merging a second Boss can remove a named start/end face; inspect actual result rather than assume import success. Overall4.00 is not one Boss depth and needs an extent/manual dimension.

Recommended visible-touch sequence:

1. Keep only native Front view; inspect actual outline largeleft/smallright.
2. Use native drawing Dimension tool and touch large-section upper/lower outline endpoints, then place its vertical dimension outside the left end. Prefer native snap indicators for exact projected geometry.
3. Double-touch its dimension text → **Displayed value `Ø<>`** → decimalplaces2 → Apply. Repeat at the small extension upper/lower endpoints, placing outside the right end.
4. Touch shaft leftmost lower endpoint and shoulder lower endpoint for horizontal2.50. Touch leftmost and rightmost endpoints for horizontal4.00; place the overall dimension farther below.
5. If automatic overall dimensions already exist, native overall width4.00 is an `auto:"extent"` reference and re-reads bounds after rebuild. Its largeheight2.00 can use the same liveØtemplate. Avoid duplicate manual overall measurements; source requires four callouts, not the unrequested1.50 extension length.
6. Verify native exported dimensions use actual associative topology references or dynamic extent references. A free projected coordinate pair can display the right number yet remain static after model edits. Native Dimension touch code binds only when picked points match named topology anchors; scene pixel positions alone do not guarantee binding.
7. Meaningful acceptance: temporarily change a source diameter or length through its actual native model parameter, rebuild, and verify the corresponding live `Ø<>`/length callout changes. Undo back to the source values. If a pick has no surviving associative anchor, record it as static reference annotation and leave full linked-dimension acceptance pending; do not replace with literal Notes and call it linked.

Existing meaningful tests: `tests/drawing_live_dimension_text.test.mjs` exercises actual associative anchor changes while preserving `Ø<>` and inch precision, and distinguishes unchanged literal overrides. `tests/model_items.test.mjs` verifies face-on shaft diameter placement and topology binding. Read-only audit found native live diameter-prefix support; no production fix was needed. Actual phone touch binding and mutation/Undo proof remain pending parent browser work.
