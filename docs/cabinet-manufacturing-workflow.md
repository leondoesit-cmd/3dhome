# Cabinet manufacturing review workflow

The cut-plan window now provides **Drilling review CSV**, **Nesting + drilling review DXF**, and **Manufacturing review JSON**. These are machine-neutral review files. They do not contain a CNC program and do not assert that a machine, hardware combination or structural load has been qualified.

## What the review does

- Links drilling patterns to individual physical panels and gives panels and operations distinct IDs. Repeating an unchanged export produces the same IDs; structural edits can change generated part identities.
- Assigns A/B drilling faces. Both faces use one fixed board datum: X follows board height and Y follows the named side edge. A is the positive thickness-axis face; B is negative. A machine setup must explicitly transform these coordinates after flipping a board.
- Uses the actual thickness and dimensions of generated side panels and dividers.
- Distinguishes through holes from blind holes. Through depth is not guessed; the machine setup must supply breakthrough allowance.
- Maps flat fronts and shaker/glazed front assemblies into their physical boards. A hole crossing a component boundary is reported rather than assigned arbitrarily. Glass drilling is separately flagged.
- Checks finite dimensions, hole footprints, drilling depth and intersecting drilling volumes, including opposite-face breakthrough.
- Retains rejected-hole findings rather than silently losing required operations.
- Identifies generic template revisions and flags unverified hardware, incomplete mechanism patterns, relief fronts, drawer-front fixings and advanced edits.
- Separates A and B drilling details in DXF; annotates depth/through state and review status. The DXF sheet layout is not a machine coordinate transform.

The JSON contains the full findings. The UI presents the findings in an expandable section, and review CSV/DXF files carry the same qualifications. Existing quote, purchase and cut-list exports retain their purposes.

## Generic template provenance

The versioned shelf-pin, cup, hinge-plate, runner and handle records describe the application's existing default geometry. They are explicitly `generic-unverified`, with no manufacturer or source-document claim. They are not substitutes for a hardware vendor's mounting drawing. The handle default is the existing generic 96 mm bar pattern; a knob has one operation.

## Required to qualify a shop setup

1. CNC make/model, controller and accepted program format.
2. Hinge, mounting plate, runner and lift mechanism model numbers or mounting drawings.
3. Available tools and tool numbers, feeds/speeds, drilling strategy and breakthrough allowance.
4. Stock/material thickness and machining allowances, plus workholding and board-flip conventions.
5. A representative sample cabinet and the shop's acceptance criteria for simulation and a controlled test cut.

The application currently has no qualified cabinet postprocessor. `machineReady` therefore remains false. Software tests establish the review's internal consistency; they do not replace controller simulation, hardware fit checks or physical qualification at the shop.

## Verification

Regression tests cover opposite-face collision detection, blind/through depths, malformed data, component-level shaker drilling, rejected holes, unique IDs, deterministic exports and preservation of source models. Browser tests open the real cut-plan UI and exercise the JSON/CSV/DXF download handlers, including the review status and face metadata.

## Controller profiles and simulation programs

Open **Machine profiles & simulation** in the cut-plan window. Configure travel, stock clearance, through allowance, flip convention and drilling tools. Each tool needs its diameter, feed, spindle speed, reach, holder envelope and spin-up time. These shop values start empty rather than borrowing unverified values from a machine brand.

The profile editor supports import/export as versioned JSON, including work origins, 0/90/180/270-degree rotation, clamps and declarative hardware templates. Profiles are saved locally. A selected hardware reference links to source documentation but does not automatically change the drilling pattern or qualify a product.

| Target | Implemented output | Qualification |
| --- | --- | --- |
| Grbl 1.1 | Expanded G0/G1 vertical drilling, one file per panel/face/tool | Simulation only |
| LinuxCNC | G98/G81 drilling, explicit cycle cancellation | Simulation only |
| ISO-style linear moves | Conservative linear-move program for compatibility review | No controller compatibility claim |
| HOMAG woodWOP 4 | MPR `BohrVert` vertical drilling | Vendor import and machine simulation still required |
| Biesse CIX 5 | CIX `BG` vertical drilling | Verify import support in the installed vendor software |
| SCM Prisma 110 | XXL vertical drilling | Explicit Z sign convention; verify matching controller |
| SCM Maestro / PGMX | Existing review CSV/DXF/JSON | No PGMX serializer; do not substitute XXL without compatibility evidence |
| Other machines | Existing review CSV/DXF/JSON and extensible profile schema | No silent generic-code fallback |

A successful software check exposes a per-program drawing, code preview and individual program download, plus a JSON bundle containing every program and setup manifest. The G-code targets use millimetres, absolute positioning, G54, stock-top Z0 and a manually loaded/touched-off tool for each file. They do not issue automatic tool changes. A/B setup transforms occur before program emission. XY travel occurs at the configured clearance; depth, reach, panel envelope and conservative cylindrical holder/clamp conflicts are checked.

Any unresolved cabinet manufacturing finding blocks the entire program bundle. A profile change or unapplied JSON edit invalidates the preview. Download handlers recompute against the current cabinet and profile. Existing source findings cannot be dismissed by assigning a brand or tool number.

`simulation-ready` means the supported software checks pass. It does **not** mean a controller has simulated the file or that the physical machine is production-qualified. No hardware motion or controller connection is performed by this feature. Pocketing, contour routing, horizontal boring, automatic workholding and arbitrary vendor formats remain outside the implemented vertical-drilling postprocessors.

### Hardware templates

A shop template replaces each existing operation of its declared kind (`pin`, `plate`, `cup`, `runner`, `handle`) with one or more explicit offset holes. Offsets are in the physical board's fixed datum before setup flipping, not a hinge-edge or hardware-local coordinate system. Each template requires a part number and source-drawing reference. Both input and generated geometry are validated; arbitrary code or custom G-code snippets are never executed.

This is a declarative adaptation mechanism, not a complete vendor catalogue. Mounting-plate assemblies, drawer-front fixings and special mechanisms can instead use complete shop-authored drilling recipes below. Selecting a reference alone does not remove an incomplete-mechanism finding.

### Complete shop-authored recipes

In the complete-profile section, **Download complete drilling recipe draft** produces a profile containing `completeRecipes`. Each cabinet recipe includes its source geometry signature, hardware part numbers, drawing reference, and every rectangular wood board. Enter the exact drawing's holes (`x`, `y`, `d`, `depth`, `through`, `face`) for each panel. Every panel without holes requires an explicit `noDrillReason`. Empty drafts cannot generate programs.

The draft defines `xAxis`, `yAxis`, `faceAxis`, dimensions and a datum for each board. Recipe X/Y follow the named model axes from minimum bounds; A is the positive thickness-axis face and B is negative. These axes may differ from generic pattern axes. They are retained in the setup manifest and displayed beside the preview. Do not modify the draft's dimensions, axes or source signature to make it fit a different cabinet.

Complete recipes replace the cabinet's generic drilling as a whole. They cover drawer fronts, drawer boxes, mounting plates, lifts, folding/sliding fittings and pull-outs when the shop supplies the full mounting drawing. Missing/duplicate panels, absent references, stale geometry, invalid drilling and unknown job targets block the entire bundle. Construction errors, advanced solid edits, relieved fronts, corner/angled hardware and nonrectangular or tilted panels retain their separate blockers. Recipes describe vertical drilling only, not other assembly machining. Shop-authored data remains unqualified until independently checked.

### Native format contracts

These are independently authored, narrow import serializers informed by Autodesk's published postprocessor implementations, not copies of the full Autodesk posts or vendor-certified posts. The installed vendor software has not been available for import testing. Automated tests verify emitted coordinates and depths against setup manifests; they do not prove controller compatibility.

- **woodWOP:** MPR version 4.0, explicit machine type (`HOMAG`, `CF-HOMAG`, `FK-HOMAG`, `WEEKE`), rectangular stock, F0 board origin, vertical boring macro 102, tool number and feed converted from mm/min to m/min. Explicit numeric depth includes the configured through allowance; `LS` avoids an additional controller-generated through allowance. The tool database controls spindle speed and retract behavior. Format reference: [Autodesk woodWOP post](https://cam.autodesk.com/posts/post.php?name=woodwop), revision 44226, 2026-05-19.
- **Biesse:** CIX CID3 / release 5, rectangular stock, configured origin number and top-face `BG` macros. Top-face corner 1 measures Y from the opposite edge, so export converts `Y = board height − setup-local Y`. Z is zero at the top surface; positive DP is the explicit drilling depth; automatic THR depth substitution is disabled. The exact tool database name is required; spindle/feed values are emitted. Format reference: [Autodesk Biesse CIX post](https://cam.autodesk.com/posts/post.php?name=biesse+cix).
- **SCM:** Prisma 110 XXL, rectangular stock, work plane at stock-top height, explicit clearance/linear drilling and plane reset/park commands. The positive-Z direction must be selected explicitly; inversion applies to both the work-plane origin and motion Z values. This target does not claim to produce modern Maestro PGMX. Format reference: [Autodesk SCM Prisma post](https://cam.autodesk.com/posts/post.php?name=scm), revision 44164, 2025-02-12.

All native programs use **board-local** XY after the selected rotation and physical face flip. Machine placement is recorded separately in the manifest `origin`; it is not added to native board dimensions. Each face is presented as an upward-facing board. Native vendor software controls tool selection, retracts, spindle startup, parking and workholding; the internal preview does not simulate those vendor-generated motions. Validate these settings in the matching vendor software before any physical qualification.

### Primary references consulted

- [Grbl controller and supported commands](https://github.com/gnea/grbl).
- [LinuxCNC G-code reference](https://linuxcnc.org/docs/html/gcode/g-code.html).
- [HOMAG woodWOP documentation](https://www.homag.com/fileadmin/product/cnc/brochures/woodwop/CNC-Software-woodWOP-EN.pdf).
- [Biesse B_SOLID](https://biesse.com/ww/en/software/b_solid/).
- [SCM CNC software](https://www.scmgroup.com/en_GB/scmwood/products/maestro-digital-systems/software.c102273/cnc-machining-centers-for-panel-and-solid-wood.102275).
- [Blum CLIP top BLUMOTION assembly](https://www.blum.com/us/en/products/hingesystems/clip-top-blumotion/assembly/).
- [Hettich Sensys brochure](https://web.hettich.com/fileadmin/Company_website/HUS/Media/HUS_Sensys_Brochure.pdf).
- [Salice catalogues](https://www.salice.com/us/en/download/catalogues).
- [GRASS Tiomos catalogue](https://mediacenter.grass.eu/Katalog/EN/563/).
- [Häfele technical catalogue](https://www.hafele.com/INTERSHOP/static/WFS/Haefele-COM-Site/-/Haefele-COM/en_US/opentext/assets/com/Hafele_Serbia_catalog.pdf).

### Validation

Focused tests cover generic and complete recipes, physical panel mapping, all face/rotation transforms, native coordinate conventions, explicit native settings, malformed profiles, stale geometry, collisions, browser previews and downloads. Final verification on 2026-09-12:

- Full unit suite: **2,430 passed, zero failed or skipped**.
- Focused cabinet suites: **74 passed**.
- Cabinet browser suites: **five passed**; the profile test also exercises all three native-format previews and complete-recipe draft download.
- Free-identifier and module-link checks pass (457 linked modules); the source-assertion gate passes.
- The machine-profile screen was visually inspected at 1365 × 1100.

The full run also exposed an outdated rib fixture, now supplied with its actual sketch and a successful-rebuild assertion. Legacy conversion now retains missing standard plane/axis references needed by generated sketches, without replacing existing references. The affected CAD suites were rechecked before the final full run.
