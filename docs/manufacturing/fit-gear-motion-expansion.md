# Fit tables, generated gears and gear motion

The editor now has an ISO fit calculator under **Evaluate**, profile-shift and explicit undercut controls under **Rack-generated gear**, and editable gear relations under assembly **Motion Study**. These changes extend numerical and geometric capabilities; they do not issue a manufacturing approval.

## ISO fits

`js/iso286_data.js` contains 415 tolerance classes and 7,419 explicit diameter bands, including the J9–J18 aliases directed to the symmetric JS table by Table 8. Coverage extends to 3,150 mm where that particular class is published. It is not the Cartesian product of every letter, grade and diameter. Blank cells and the small-diameter restrictions remain unsupported. Every interval is lower-exclusive and upper-inclusive; deviations are in micrometres, while fit results are in millimetres.

The numerical source is ISO 286-2:2010, Tables 1–32, with the eleven numerical amendments in [ISO 286-2:2010/Cor 1:2013](https://www.iso.org/obp/ui#iso:std:iso:286:-2:ed-2:v1:cor:1:v1:en). The data records the original PDF URL and SHA-256; the publication itself is not distributed in this repository. `tools/data/extract_iso286.py` and `iso286_finalize.py` reproduce the extraction, apply restrictions and corrections, and reject inconsistent widths.

One additional source inconsistency is explicitly recorded: za11 for 225 < diameter ≤ 250 mm prints a lower deviation of 820 µm and upper deviation of 1,100 µm. Table 1 gives IT11 = 290 µm. Applying the published `es = ei + IT` rule yields 1,110 µm. This is recorded as `derived-es-equals-ei-plus-IT`, **not** an ISO corrigendum. `fitLimitSource` and the editor report expose that distinction. Other classes use the tabulated limits directly; there is no extrapolation or approximate fundamental-deviation formula.

Reproduction requires Python and PyMuPDF:

```sh
python3 tools/data/extract_iso286.py /path/to/iso286-2.pdf /tmp/iso286_data.js
```

The calculator saves its inputs, computed limits and source bands in `lastFitCheck`, so reopening it retains the reviewed size and fit. A fit report does not change the geometry or certify the manufactured dimensions.

## Generated spur gears

`profileShift` is the dimensionless rack displacement coefficient, limited to −1 through +1. The cutter shifts by `profileShift × module`. The generator updates root/addendum radii and pitch tooth thickness. Positive shift can eliminate undercut on small pinions.

`allowUndercut: true` explicitly enables undercut. The root trochoid is intersected with the ascending involute at a common radius; the folded envelope is discarded. Defaults remain compatible with existing models. Profiles with unresolved intersections, folded flanks, or no tip land are rejected.

For a shifted external pair, the working pressure angle is solved from:

```
inv(alpha_w) = inv(alpha) + 2 (x1 + x2) tan(alpha) / (z1 + z2)
a_w = (rb1 + rb2) / cos(alpha_w)
```

The mating and tolerance checks use that center distance and pressure angle, including backlash scaling. Unshifted pairs retain their exact original center-distance calculation. The approach follows the [KHK gear-dimension reference](https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/) and the rolling cutter-envelope treatment described by [FVA](https://doc.fva-service.de/60/en/root-cylindrical-gear-geometry.html).

The editor normally requires the mating check to pass. Disabling that requirement permits a standalone generated body and retains its failed mating diagnostic. An undercut outline can be valid while the proposed pair fails the conservative root-transition/contact checks. Profiles remain sampled outlines extruded into native B-rep solids; they are not analytic involute surfaces. Material qualification, tolerances and production rating remain separate.

## Gear motion

Relations are saved in each study's `gearRelations`. External meshes reverse rotation; internal meshes preserve direction, with magnitude `driverTeeth / followerTeeth`. Ratios operate on continuous angle increments, before any modulo operation used for the display orientation. This preserves full-turn ratios, reverse motion, chains, random seeks and reloads.

Each component uses a saved zero-pose rotation. Axes are world-space directions through the component origin. The editor offers world X/Y/Z and preserves an existing custom direction. A newly participating component takes its current pose as its zero pose; the relation does not infer tooth phase or shaft location. Existing relations can be edited or removed, and additional relations can be added to form a train.

Multiple drives must agree. Inconsistent cycles, disconnected undriven relations, conflicting axes, missing components, non-finite inputs and grounded driven components reject the evaluation. Assembly mates solve with all prescribed rotating components fixed. Both transforms and study baselines commit only after the complete evaluation succeeds. New study/motor/relation IDs use UUIDs to avoid same-millisecond collisions.

This is kinematic coupling. It does not simulate tooth contact, backlash take-up, torque transmission, elastic deformation or collision-free motion. Shafts must be positioned separately.

## Verification

- All 7,419 fit bands checked for table width, lookup midpoint and exact upper boundary; published restrictions and all correction records tested.
- Independent NSK K/M/N/P hole and shaft reference cases retained.
- Undercut threshold cases from 5 to 20 teeth; shifted 10-tooth pinion; independent tooth-thickness and working-angle equations.
- Native extrusions of undercut and shifted gears; polygon-area versus native volume; shifted gear STEP round-trip volume.
- Motion chains, full-turn ratios, reversal, saved random seeks and transactional failures, including contradictory cycles at time zero.
- Browser creation, saved fit reports, motion relation editing/removal, reload and seeking; existing material controls remain covered.

Tests: `tests/cad_iso286_tables.test.mjs`, `tests/cad_gear_expansion.test.mjs`, and `tests/cad_gear_expansion.browser.mjs`.
