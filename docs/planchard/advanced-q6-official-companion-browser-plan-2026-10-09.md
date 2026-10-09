# Advanced Q6/Q6A: official companion preparation

Read-only inspection of the official SDC2021exercise archive, Chapter10CSWAModels `Advanced Part Modeling-Question6.SLDPRT` and `...Question6A.SLDPRT`. CRC/length-verified container payloads are in `scratch/planchard/official-q6-container` and `official-q6a-container`; typed loci were extracted with the same conservative helper used forQ5, now including the source's `ffff1f0001` generation. `sketch-loci.json` contains owner/offset/coordinate provenance. Native analytic observations are in `official-q6-partition-inspection/record-observations.json`. No source geometry import, app model creation or mass fitting occurred.

Embedded preview, XML named dimensions, linked sketch coordinates and independently decoded Parasolid analytic primitives agree on the following source frame: X0..100mm, Y−75..75mm, Z−50..50mm. Use that physical frame in the browser; the whole height is150 and boss transverse extent100. SourcePlainCarbonSteel density7800kg/m³ is the exercise material reference, not a qualified strength rating.

## Outer stock and chamfer

Front sketch atZ0, closed C outline in millimetres:

`(0,−75)→(100,−75)→(100,−65)→(70,−50)→(70,50)→(100,65)→(100,75)→(0,75)→close`.

Boss Extrude100mm, symmetric aboutZ0 (−50..50). These are sourceSketch1loci, corroborated by native exterior planes/lines. The inclined inner arm edges join(70,±50)to(100,±65); do not replace them with25×45°ramps.

SourceChamfer1is10mm/45°. Native plane/line observations locate its four exterior longitudinal edges where outerY±75 meetsZ±50; they run inX. Apply10×45°to those four edges, producing boundaries atY±65/Z±50 andY±75/Z±40. Do not chamfer the sloped inner arm edges. Select the actual native edges and verify their world endpoints before commit.

## Shell and current app gap

SourceShell1has default10mm and two25mm face values. Native inside planes are X10, Y±50 and Z±40. A tested geometry-coherent browser Shell selection removes the three inner C faces: the vertical faceX70,Y−50..50 and both inclined faces joining(70,±50)to(100,±65), with default10 and increased25on the outer top/bottomY±75faces. The two arm faces lie outside the eventual Y±50 cavity and retain their original physical surface. This is an explicit geometric reconstruction choice; the source selection-vector to face-producer binding remains partial. Selecting only the vertical opening currently fails the native uniform offset; do not certify that untested selection. The outer10mm chamfers remain outside the cavity.

The native engine now accepts aceThicknesses:[{facePersistentId,thickness}] in centimetres. UI integration remains pending. The scoped generalized inward planar increase operation uses: persistent retained-face references, exact supporting-plane constraints, larger-than-default thicknesses, rejection of unsupported surfaces/directions/ambiguous references. It preserves the original nonconvex void by clipping a native cavity bounded by the original body. Native uniform offset is preferred; if it fails, an exact fallback requires every retained face to be a supporting plane and intersects their inward halfspaces with the original body. Unsupported retained curved/non-supporting faces reject in that fallback. The disposable source C profile, including all four10mm outer chamfers, passes native10/25/25 wall, cavity, bounds and unchanged-source checks. These tests are source implementation evidence, not browser authorship acceptance. Actual browser Shell acceptance is pending UI integration.

## R22.5 open slot

Top sketch atY75, coordinates(U,V)=(X,Z). Centre(70,0), radius22.5. Closed slot contour `(100,−22.5)→(70,−22.5)→left semicircle through(47.5,0)→(70,22.5)→(100,22.5)→close`. Cut ThroughAll toward−Y; source native cylinders span upper/lower plates. The30mm witness locates centreX70 from theX100end, and45is the slot width. Do not useR30for this feature.

## Exact paired-R30 S scallop

SourceSketch4loci and independent native cylinders resolve the shallow rear scallop on the Top X/Z plane. Its profile vertices are `(0,−30),(5,−30),(5,0),(5,30),(0,30)`; join the two right-side vertices with **two opposing minor60°R30arcs**:

- Firstarc from(5,−30)to(5,0), centre(−20.9807621135,−15), bulging toward+X; its midpoint is(9.0192378865,−15).
- Secondarc from(5,0)to(5,30), centre(30.9807621135,15), bulging toward−X; its midpoint is(.9807621135,15).

Close with lines(5,30)→(0,30)→(0,−30)→(5,−30). Cut ThroughAllY. These circle centres are5±sqrt(30²−15²), not projected pixel measurements. Their common(5,0)junction is a smooth S continuation. The two arc midpoints identify the correct minor branches. Native source primitives confirm the centres/radii atY±75; the operation cuts both top/bottomplates and the exposed rear edge.

## Q6A named frame

Q6A's three sketch-locus sets are identical toQ6. Its added `moCoordSys_c` object namedCoordinateSystem1contains identity axes and source translation(0.100,−0.075,−0.040)m. Thus its origin is **(100,−75,−40)mm**, the outer chamfer corner; axes remain+X,+Y,+Z. This is read from source bytes and vertex references, not obtained by adjusting an origin to reproduce the printed COM. Author a named reference/measurement frame at that actual vertex after geometry completion, preserving the physical solid.

The S scallop makes the final body asymmetric across Z0 despite the symmetric stock. Q6 source SHA256: 83118CB30F71C647844E9DC609BFB4931B5BD8E80C5B5EFC303800B6D461B9EE; Q6A: C742017DC083A36455F0AB13E6A8931D56095C7165326DD69F248598359004AC.

The source report prepares browser work; no authored Q6app artifact or acceptance is claimed. Native variable-shell tests, browser authored sketches/features, clean Save/cold reload and independent native/STEP audits remain required.
