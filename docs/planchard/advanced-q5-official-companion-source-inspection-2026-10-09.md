# Advanced Q5 official companion: read-only source findings

Source: official SDC companion archive `C:/Users/liron/Downloads/Eng_Graphics_SW_2021_Exercise_Files_V3.zip`, downloaded by the parent from [the publisher's exercise-file page](https://www.sdcpublications.com/downloads/978-1-63057-407-9). Inspected file: `scratch/planchard/official-companion-2021/Chapter 10 CSWA Models/Advanced Part Modeling-Question5.SLDPRT`,206916bytes, SHA256`ba8fe5004486e2d8c770cc17f2513fd8471fd01cbbc17ab45b5f430cb127b7fb`.

The source file remains unchanged. No source geometry was imported into the app, no sketch/model was authored by script, and no answer mass/COM was used to choose coordinates. This replaces inference where native source evidence is available. Parent owns all browser repairs and ADVANCE updates.

## Container and evidence provenance

The file has modern magic`4c8b16cb`, version4, rather than OLE/ZIP. The read-only helper `scratch/planchard/inspect-q5-companion-readonly.py` identifies compressed blocks, nibble-decodes their names, inflates raw DEFLATE and accepts only exact declared lengths and CRC32. All44accepted payloads and their file offsets are recorded in `scratch/planchard/q5-companion-inspection/inventory.json`. An independent Node extractor by polygon_gap produced the same44blocks.

Container grammar and conservative sketch-record interpretation were checked against the experimental [cadmpeg format documentation](https://github.com/cadmpeg/cadmpeg/blob/main/docs/formats/sldprt.md), CC-BY4.0. It is parser guidance, not the authority for the part's dimensions. Those values come from the downloaded source's actual XML, coordinate records and analytic primitives.

Important extracted evidence:

- `20-PreviewPNG.png`: original embedded640×480preview, showing an intact front panel and **solid projecting central pin**.
- `41-swXmlContents_KeyWords.xml`: named features/sketches, IDs, materialCopper and dimensions.
- `08-Contents_Config-0-ResolvedFeatures.bin`: source sketch objects. `q5-companion-sketch-loci.py` extracts typed coordinate loci at their verified legacy/current offsets, in metres converted to millimetres, with source offsets and owner names in `sketch-loci.json`.
- `official-q5-partition-inspection/record-observations.json` and `world-point-candidates.json`: polygon_gap's independently decoded compact analytic Parasolid records. Nested zlib member lengths were verified. These are raw source-record observations; a complete FACE/SHELL/BODY graph or every feature-producer link has not been decoded. Their coordinate agreement is corroboration, not a claimed native import.

Coordinate-locus lists contain external references and display handles as well as contour vertices. Only linked profile vertices, named dimensions and matching native primitives are used below. StockSketch1 establishes the local depth/height frame: (0,0),(100,0),(100,63),(0,63). Source Right coordinates use positiveD, whereas ModelForge's current Right U is−D.

## Certain corrections to the current browser interpretation

|Item|Actual companion evidence|Browser consequence|
|---|---|---|
|Core front R30|Sketch2centre(0,35),toe(0,5),tangent(30,35),closure(30,63),(0,63); nativeR30atX42|The quarter-circle geometry already authored is consistent. Do not move it to accommodate a false bore|
|Far rear strip|Sketch4linked rectangle nativeTop(−12,−50),(0,−50),(0,−100),(−12,−100); Cut3ThroughAll flag; underside/rear-hole nativeendX12|Remove W0..12/D50..100 **through the full height**. Earlier15mm-deep small notch is wrong scope. Extend its rectangle toD100 and use ReverseThroughAllY; retain the separate main15-deep stepD60..100|
|Bevel|Native planeorigin(6.551464216791661,63,0),normal(−cos20°,sin20°,0); bounded-line/world-point witnesses atZ−30 and−50, plus(0,45,−30)|It is a **width/height bevel**, not depth/height. Replace the old Right-triangle core cut with Front triangle(W0,H45),(W0,H63),(W6.5514642168,H63), spanningD30..50. Native producer binding is incomplete, but plane plus boundary coordinates agree independently|
|Rear relief|Sketch5vertices(D80,H48),(80,35),(100,35),(100,15); sourceR20centre(D100,H35),nativecirclesatX41/50; Cut4D1=9|Right profile atX41, R20centre(−100,35), plusupperrectangleU−100..−80/V35..48, bothBlind+X9|
|Rear bore|Sketch6centre(D90,H35),radialpoint(94.7815237798,36.4618585236); XMLØ10/35/10; nativeR5atX41/12,Y35,Z−90|RightØ10ThroughAllX atU−90,V35. EarlierD91/H38 was incorrect|
|Top bore|Sketch7nativecentre(−20,−39),radialpoint(−15.2184762202,−37.5381414764); XMLØ10/20/9; nativeY-axisR5atX20,Z−39,Y0/63|TopØ10ThroughAll−Y atW20,D39. EarlierD50 was incorrect;20locates width and9 references the D30 front station|
|Central centre|Sketch9Ø50/Ø20circlescentre(D30,H35); nativeR25/R10atX37/42/50|D30 is actual source. The false front channel was caused by treating the Ø10 feature as a bore, not by this centre|
|Central pin|Sketch12Ø10centre(D30,H35); XML**Boss-Extrude3**, notCut; nativeR5circlesatX42/50; end-specUpToFace|Delete/replace the wrongly authored ThroughAllX bore. Add a solidR5 pin X42→50 instead. A Blind8 add is the geometry-equivalent endpoint interpretation of the observed source bounds|
|Underside profile|Sketch8A(45,0),B(85,0),tangencies(68.3396509331,8.4949382178),(78.8309201782,6.1690798218),R10centre(71.7598523663,−0.9019879901);20°/45°/R10XML; Cut7ThroughAllboth|Keep the parent's exact triangle/SketchFillet and ThroughAllX. Do not force startX12: the source far rear strip removal naturally leaves material onlyX12..50 around this rear arc; its baseline startsD45, ahead of that strip'sD50 start|

The old “source-only twelve-step checkpoint” designation needs qualification: stock/R30/mainstep coordinates are supported, but the old bevel orientation, far rear strip scope and full quarter-to-D25 rail closure do not reproduce the actual companion. Preserve that checkpoint as an **illustration-derived partial**, not source-exact geometry.

The far strip's actual sketch connectivity is explicit: nativeTop(−12,−50)joinsLines3/4; (0,−50)joinsLines1/3; (−12,−100)joinsLines2/4; (0,−100)joinsLines1/2. The extra(0,−60)locus is a converted/display reference, not its rectangle endpoint. Its ThroughAll termination plus independent native underside/rear-hole endpointX12 corroborates the full-height removal. This explains those X12stations without inventing a38mm blind underside cut.

## Exact linked contours recovered for the central workflow

SourceSketch9 includes two full-circle loci centred(D30,H35), radii25/10, and a frontR25open chain. Its linked chain has the arc centre(0,35), endpoint(0,10), endpoint(15,15), and verticalline(15,15)→(15,63). Native Right curve incidence tags distinguish these profile points from the many display/external points. The current rail's endpoint(25,35) is not this source endpoint. A browser closed-cut equivalent for the existing rail can use(0,10)→minorR25arc→(15,15)→(15,63)→(0,63)→(0,10), limited to the existing side railX42..50. The arc sweep is36.8698976458°, not90°; negatingD in ModelForge reverses the planar orientation. Inspect the minor branch explicitly.

**SourceSketch10 is a small upper cap**, not the initially proposed major-circle pocket boundary. Typed point-incidence identifies exactly:

|Vertex(D,H)|Connections|
|---|---|
|(30,60)|Line1,Arc3|
|(30,63)|Line1,Line2|
|(15,63)|Line2,Line3|
|(15,55)|Line3,Arc3|

Arc3has centre(30,35),radius25 and joins(15,55)to(30,60) using the minor36.8698976458°upper-left branch. Lines close(30,60)→(30,63)→(15,63)→(15,55). SourceCut9isBlind13; native circle stations corroborate X37..50. Browser Right supportX37 therefore usesU−30/V60→U−30/V63→U−15/V63→U−15/V55→minorarcbackU−30/V60, cut+X13. The locus(15,55.11506657) is an unlinked handle, not the exact contour vertex; (15,15) in this owner is a converted/external locus and must not replace the linked(15,55) arc endpoint.

SourceSketch11/Boss-Extrude2 is a trimmedR10 profile with5mm depth. Its linked loop is:

1. Line(D30,H35)→(30,45).
2. R10arc centre(30,35), from(30,45) around the **right and bottom** to(28.3333333333,25.1398670282).
3. R30arc centre(0,35), fromthatlowerpoint to(30,35).

The lower point is the exact R30/R10 intersection, independent of mass. NativeR10stationsX37/42corroborate the five-millimetre projection. The existing annulus-plus-inner-disk cuts implicitly retain this core-clipped profile, so a geometry-equivalent repair can preserve that retained shape while adding the missing cap and solidpin. Reproducing the source's complete original feature selection/order is a separate, still-partial decoding task.

## Limits on original history decoding

The source keyword tree lists13solid features/12sketches: stockBoss1; nineCuts; Boss2; Boss3; Chamfer1. End-spec candidates found inside the named feature intervals identify Cut4Blind9, Cut9Blind13, Boss2Blind5, Boss3UpToFace; Cut7/8carry through-all flags in both directions. A naive interpretation of Cut8as an entire through-widthannulus would contradict the actual partial-depth circle stations and solid connectivity. Its selected contours, construction/reference circles and operand ownership must be decoded together before certifying that semantic interpretation. Do not turn the raw flags into an unsupported complete cut recipe.

Source dimensions/native primitive bounds now support concrete browser corrections without fitting the answer. Actual repaired silhouette, one-solid status, parameter drive, Save/cold reload and STEP equivalence remain parent/browser audit work; this source inspection itself does not certify the repaired model.
