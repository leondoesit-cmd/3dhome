# Manufacturing controls

The modeler stores engineering dimensions in centimetres. Thread specifications
and fit limits use millimetres. Flat-pattern SVGs declare physical millimetres;
cut paths and bend centre lines occupy separate `cut` and `bends` groups.

## Sheet metal

Select a box and convert it to sheet metal. **Bend rules** sets the inside
radius, material, K factor or measured table, and rectangular corner-relief
width. **Edge flange** selects left, right, top or bottom. Each side supports one
full-width flange. Dimensions are outside virtual-sharp dimensions; the flat
extension equals flange length minus bend deduction.

Adjacent flanges require relief at least as wide as the material thickness.
The implemented rectangular relief trims to the bend tangent plus half the
specified gap. The resulting cut boundary is a connected notched polygon,
not a bounding rectangle. This operation describes the flat blank; it does not
create a folded sheet-metal BREP or check press-brake tooling collisions.

**Import bend table** accepts JSON with the following schema. Values below are
synthetic test data, not production recommendations:

```json
{
  "type": "table",
  "name": "Example measured brake setup",
  "source": "Replace with coupon measurement record and tooling revision",
  "material": "Example material",
  "units": "mm",
  "rows": [
    {"kind": "bend", "angle": 90, "thickness": 1, "radius": 2, "deduction": 2.2},
    {"kind": "hem", "angle": 180, "thickness": 1, "radius": 2, "deduction": 1.5, "setback": 2}
  ]
}
```

Angles are bend rotation from the flat state. Units may be `mm`, `cm` or `in`.
The optional material must match the sheet. Each angle/thickness/radius tuple
must have exactly one row. There is no interpolation or extrapolation. Hem rows
supply both deduction and setback from the same measurement convention; hems
never use the ordinary tangent formula at 180 degrees. Developed bend length
is `2 × setback − deduction`.

**Flat pattern** downloads a full-size SVG; **Bend report** downloads the outline,
bend locations, reliefs and source rule as JSON. Rule changes and failed flange
edits are validated before document mutation. The table is saved with the part.

## Threads

The thread form exposes lead-in and lead-out runout lengths in millimetres.
Their sum must leave positive full-form length. Linear runouts taper to a point,
and modeled sections are clipped to the specified axial length. External
threads on cylindrical stock remove complementary grooves; standalone threads
produce the helical ridge. Internal threads produce a cutting tool.

Modeled threads use straight 60-degree flanks and flat roots. The ruled loft is
an approximation: metadata records maximum radial chord deviation (default
0.005 mm), the runout rule and fit status. Root fillets, tooling-specific runouts
and gauge certification are not implied by the model.

The default class is 6g externally and 6H internally. Class syntax and side are
checked, but a class name alone does not supply numerical limits. Enable
**Use supplied limits** and enter major, pitch and minor diameter minimum and
maximum values, plus their inspection/table source. Geometry uses the midpoint
of those limits. Sources and dimensions are stored with the feature.

For two threaded parts, **Check thread fit** verifies matching nominal size,
pitch and handedness, and worst-case diametral clearances from both parts' limits.
It refuses numerical verification when either set of limits is missing, invalid
or permits interference. This is dimensional fit checking, not certification
against a licensed ISO tolerance table or inspection with a physical gauge.

## STEP and IGES

Both writers validate the native BREP before transfer: topology/geometry,
positive volume for every solid, absence of loose faces and maximum stored
geometric tolerance (default 0.001 cm / 0.01 mm). Writer return codes are checked.
IGES and STEP both use the document's centimetre working unit.

The kernel API accepts `{maxToleranceCm}` for a tighter job requirement. Intentional
surface exchange may explicitly set `{allowSurfaces:true}`; this does not bypass
validity or tolerance checks. Empty shapes and invalid solids are never accepted.
The modeler's ordinary export buttons require solids.

These checks do not prove assemblability, tool access or absence of all geometric
self-intersections. They are export gates, not a manufacturing certification.

Design references: [Autodesk sheet-metal rules](https://help.autodesk.com/cloudhelp/ENU/Fusion-Sheet-Metal/files/SM-RULES-REF.htm)
and [OpenCascade BREP validation](https://occt3d.com/dev/doc/refman/html/class_b_rep_check___analyzer.html).
