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
