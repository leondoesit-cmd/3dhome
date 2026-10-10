# Part and assembly template source gap

**Confirmed required digital workflow is unperformed in current evidence and unsupported by the located production authoring path.** This is not closed by existing drawing templates or setting units after New. No CAD/browser/code/ADVANCE/Git mutation performed.

Source `scratch/planchard/book.txt`: PDF223–226 /5-5–8 describes templates as stored document properties, explicitly **Activity: Create Two Part Templates**, SaveAs PART-IN-ANSI and PART-MM-ISO, then a template location/tab. PDF386–388 /8-8–10 explicitly creates/saves ASM-IN-ANSI and ASM-MM-ISO, followed by new assembly use in later mating activity. Source says default template plus needed properties is an alternative if templates were not created; that permits constructing later models, but does not prove the template creation/reuse activity occurred.

|Exact named preset|Kind|Source document defaults|
|---|---|---|
|PART-IN-ANSI|Blank part|ANSI, IPS/inch-pound-second,length3decimal places,angleNone(0decimals)|
|PART-MM-ISO|Blank part|ISO, MMGS/mm-gram-second,length2decimals,angleNone(0decimals)|
|ASM-IN-ANSI|Blank assembly|ANSI, IPS,length3decimals,angleNone(0decimals)|
|ASM-MM-ISO|Blank assembly|ISO, MMGS,length2decimals,angleNone(0decimals)|

First-angle versus third-angle is a separate projection setting. `document-units.md` proposes ISO/first-angle and ANSI/third-angle, sensible document defaults, but source template steps quoted here explicitly require drafting standard/units/precision. Do not attribute unspecified projection to those steps as a mandatory source claim. The design document's anglePrecision1 differs sourceNone and must not override the actual book.

## Existing evidence and implementation check

`docs/planchard/document-units.md` and book-completion-planG9/2B3 propose saved Part/Assembly presets. Production search finds PART-IN/PART-MM/ASM-IN/ASM-MM only in documentation. `js/modeler.js` imports `core/drawing_presets.js`, has SaveDrawingTemplate/NewFromDrawingTemplate and `newModel(template)` for a drawing record. This proves reusable drawing defaults, not part/assembly templates. No actual SavePartTemplate/SaveAssemblyTemplate/NewFromPartOrAssemblyPreset artifact/picker/cold report was located.

Existing models continue to satisfy accepted source geometry/units. Their property setting is preserved; no retrospective reauthoring or units migration is necessary to close this new workflow.

## Short bounded product/browser closure

Implement genuine kind-specific document-default presets and ordinary SaveTemplate/NewFromTemplate controls for Part and Assembly. A preset stores only intended immutable-cloned document defaults, not source CAD/history/meshes/components/mates/motion/drawing/BOM/part metadata. Native binary `.prtdot/.asmdot`, Windows registry folders and original SOLIDWORKS tabs are not required for functional browser equivalence. Never call a populated library model a template without stripping geometry through a validated template operation.

Parent ordinary browser sequence for each kind:

1. New genuinely blank Part/Assembly; choose source standard/units/decimal settings, ordinarySaveTemplatewith exact name.
2. NewFromTemplate → actual chosen named preset; verify blank independently owned document and exact defaults, source units in entry/display (inch versusmm), no inherited parts/sketchentities/features/components/mates/images/drawing content or original metadata.
3. Modify inherited precision/units in this independent instance; verify original preset unchanged by creating a second blank from it. Undo instance change if available; cancel template chooser creates no document/history mutation.
4. Clean ordinary reload, actual named picker retained; NewFromTemplate again proves defaults and empty independent document. Export actual template-created project/configuration evidence via native UI if possible; show live inspected properties. Blank template capture must be saveable separately from ordinary empty-model guard and remain deeply copied.

For4presets, acceptance includes actualsave/pick/reuse/persistence/independence, precise source default fields and kind mismatch rejection. Implementation tests alone do not replace actual ordinarybrowser proof. No full native geometry rebuild required: this is intentionally a zeroCAD document workflow.
