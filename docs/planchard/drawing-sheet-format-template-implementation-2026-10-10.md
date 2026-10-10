# Native sheet formats and drawing templates

## Source and scope

The supplied book PDF446 (printed9-12), steps67–76, saves a separate MY-A-FORMAT sheet format and A-IN-ANSI/A-MM-ISO drawing templates. PDF447 (9-13), steps77–81, starts a new drawing from a saved template. The app now provides these separate workflows using native local presets. It does not import or emit SOLIDWORKS `.slddrt` or `.drwdot` binaries.

A sheet format carries matching paper size/orientation, zones, reusable company/author/general-tolerance title fields, and embedded local images. The optional independent paper art includes primitives and free notes; model-linked notes are excluded. A drawing template adds document units, drafting standard, projection, scale, precision, secondary units, and display defaults. Neither carries source CAD, views, associative dimensions, part numbers, descriptions, or mass.

## Ordinary UI

Drawing toolbar commands: **Save sheet format**, **Apply sheet format**, **Save drawing template**, and **New from drawing template**.

Save forms provide **Local preset name** and **Include independent paper notes and geometry** (unchecked initially). Local images are always included. Suggested names are MY-A-FORMAT and A-IN-ANSI/A-MM-ISO. Apply/New forms provide **Saved local preset**.

Applying a format requires matching paper size/orientation, records one Undo state, and preserves existing source views, dimensions, CAD, part title fields and unowned paper content. Previously applied format-owned content is replaced, so repeated application is idempotent. Existing unowned artwork remains; users should remove an original logo if applying its saved copy to the same document would overlap it.

New from template uses the existing unsaved-document guard, creates an independent blank document in Drawing mode, and retains only the preset content/defaults. It does not mutate the previous part or its saved model. Existing part-property links continue to resolve normally.

## Persistence and safeguards

`modelForge.drawingPresets.v1` stores validated presets locally, with at most12 records and a2MiB encoded JSON limit. Re-saving the same kind/name replaces that preset. Storage failures are reported and do not claim success. Embedded image validation is shared with drawing image insertion. Dialog application checks the document and history identity before changing it; Undo normalization cannot leave edits on a detached document.

The drawing document stores applied format/template provenance and copied paper assets. Save/export/cold reconstruction uses the existing shared drawing scene and embedded SVG image path. Local preset storage itself belongs to the browser profile; cross-profile transfer is outside this implementation.

## Validation

Six new meaningful tests cover capture boundaries, preservation/idempotence/cold SVG, independent blank templates, validated local storage/quota failure, the actual new-model lifecycle/unsaved guard, and the actual preset action's Undo/stale-dialog behavior. Combined with image and model-library regressions: **15/15 PASS**. `npm run check`: **679 modules linked;1487 source assertions; no free identifiers**.

Actual browser Save/apply/New/file-library/cold acceptance remains the parent driver's next step. These source and controller checks are not a claim of completed browser evidence.
