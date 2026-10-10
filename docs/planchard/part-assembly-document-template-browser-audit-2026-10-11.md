# Actual Part/Assembly template browser audit

The four actual ordinary Chrome capture/reuse/Save exports pass25 read-only guards. They contain source-correct IPS length3/angle0 ANSI and MMGS length2/angle0 ISO settings and genuine matching local template provenance. All four have distinct document keys and distinct preset identities. No source CAD, drawing, parts, feature geometry, components, mates or source properties are present. The Part documents each contain one empty working sketch with no points/entities/constraints and no history; Assembly documents have no sketch or history.

|Template|Actual independent saved key|Units / standard / decimal places|
|---|---|---|
|ASM-IN-ANSI|asm_mv30xdm8|in / lb / ANSI / length3 / angle0|
|ASM-MM-ISO|asm_mv30y23l|mm / g / ISO / length2 / angle0|
|PART-IN-ANSI|cm_mv30z9u4|in / lb / ANSI / length3 / angle0|
|PART-MM-ISO|cm_mv310csk|mm / g / ISO / length2 / angle0|

The bundles' `metadata.activeDocument` correctly identifies the intended Assembly in Assembly exports; their unrelated blank Part `mainModel` is not the active witness. All four retain additional chosen projection `first` and disabled dual dimensions. These settings are explicitly independent of the source template steps, which require standard/unit/precision but do not prescribe projection in this activity. No `.prtdot` / `.asmdot` binary compatibility or original publisher identity is claimed.

Source: PDF224–226 /5-6–8 and386–388 /8-8–10. Artifacts: `artifacts/planchard/{ASM-IN-ANSI,ASM-MM-ISO,PART-IN-ANSI,PART-MM-ISO}-template-warm-browser-2026-10-11.mforge`. Machine evidence: `part-assembly-document-template-browser-audit-2026-10-11.json`.

Follow-up10/10 guards pass, total35/35. Ordinary reload followed by new-template reuse created new independent blank documents from persisted **ASM-IN-ANSI** (`asm_mv31301r`) and **PART-MM-ISO** (`cm_mv31262m`); their properties and preset identity exactly match the first witnesses. The Assembly local override changes only `documentProperties.lengthPrecision` and `context.units.precision` from3→4, with all other owner fields exact. Parent then created another document from the same ASM-IN preset and observed original precision3, proving the local override does not mutate the captured template. Both names per kind remain visible in the actual post-reload pickers.

Accepted scope: all four actual capture/reuse/Save/source properties, both-kind persisted library/reuse, and local settings independence. The three additional protected exports are `ASM-IN-ANSI-template-cold-second`, `PART-MM-ISO-template-cold-second`, and `ASM-IN-ANSI-template-local-override`, each ending `-browser-2026-10-11.mforge`. These cold-second exports prove creation from the persisted library; they are not four first-witness documents reopened byte-for-byte. No four-document cold equivalence is claimed. The final newly created precision3 probe is supported by parent ordinary UI observation, not a new exported bundle.
