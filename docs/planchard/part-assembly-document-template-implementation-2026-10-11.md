# Part and Assembly document templates

Implemented the previously missing reusable document template workflow. Source: PDF224–226 /5-6–8 and386–388 /8-8–10. This implementation captures local settings into named Part/Assembly presets and creates independent blank documents; it does not claim proprietary `.prtdot` / `.asmdot` binary compatibility.

## Ordinary browser route for acceptance

1. Select Part or Assembly, create a fresh document, then open Model Settings.
2. Click **Document properties**. For PART-IN-ANSI / ASM-IN-ANSI set Length unit `in`, Mass unit `lb`, Drafting standard `ANSI`, Length decimal places `3`, Angle decimal places `0`. For PART-MM-ISO / ASM-MM-ISO set `mm`, `g`, `ISO`, `2`, `0`. Projection and dual dimension defaults are additional app settings, not claimed as explicit requirements of these source template instructions.
3. Click **Save document template**, enter the corresponding exact name. This saves a local template immediately; no dummy solid or sketch is required.
4. Click **New from document template** in Settings, or **New from part/assembly template** in Saved models. Pick the matching saved template. The standard discard confirmation protects unsaved work.
5. The new document is blank and owns a fresh identity, inherited unit context and defaults plus template provenance. Give it an independent name and Save. Reopen that saved blank document and inspect Document properties. Reload, inspect the template picker, and create another independent blank document to prove local persistence.

The factory captures only length/mass/angle units, drafting standard, projection, length/angle precision and dual dimension default. CAD parts, feature/sketch history, source identities, drawing images/notes, custom properties, materials, components and mates are excluded. Existing source documents are not modified by capture or reuse. Part and Assembly libraries are separated by kind. Capture replaces a same-kind/name preset; validation rejects unexpected fields, duplicate identities, invalid properties or corrupted records. Storage failures are reported rather than announcing a successful save.

Document properties are undoable and guarded against a document changing while its dialog is open. They synchronize existing authoring input units without rescaling centimetre geometry. New drawings inherit units, standard, projection and precision once; existing drawings retain their authoring. Explicit new angular precision affects actual dimension text, and older documents retain their previous rounding. Mass evaluation starts in the document's chosen display unit system. Geometry-specific inspectors keep their useful explicit numerical precision.

## Verification

Seven focused tests exercise the actual production newModel/settings/chooser/drawing handlers in addition to core factories. They cover four source combinations, geometry/identity exclusion and deep copies, persistence/replacement/corruption, invalid/nonblank input, blank Save eligibility and canonical reopen, discard protection, current-host Undo, stale-dialog rejection and true dimension output/inheritance. All seven passed. Six existing drawing preset tests also passed. Actual browser authoring, saved library reload and the four named source presets remain **pending parent browser acceptance** at this implementation checkpoint.

`npm run check` passed: no free identifiers,689 linked modules,1487 source assertions with none satisfied only by comments. This is a code verification checkpoint, not a browser completion claim.

The expanded related Save suite passed20/20. Independent read-only review reran13/13 and accepted the strict provenance follow-up: malformed numeric/object/whitespace identities or extra geometry fields cannot qualify a blank as a template document. See `document-presets-independent-review-2026-10-11.md`. Implementation is frozen for parent ordinary Chrome acceptance.
