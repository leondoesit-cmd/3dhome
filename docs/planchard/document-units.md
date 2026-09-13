# Document units and templates (G9)

Phase 1-7 design. Implementation is Phase 4. Retrofitting saved flashlight parts after the fact is a migration, so the defaults have to be chosen now.

## Decision

Each document carries an explicit **document system**:

| Template | Length unit | Drafting standard | Angle | Mass display default |
|---|---|---|---|---|
| PART-IN-ANSI | inch | ASME Y14.5 / third-angle | degree | lb (with g available) |
| PART-MM-ISO | millimetre | ISO 128 / first-angle | degree | g |
| ASM-IN-ANSI | inch | ASME Y14.5 / third-angle | degree | lb |
| ASM-MM-ISO | millimetre | ISO 128 / first-angle | degree | g |

A drawing document inherits the referenced part/assembly system, then may override sheet units for dual dimensioning.

The kernel and solver stay in **centimetres**. Templates only change entry, display, dual dimensions, title-block fields, and projection. Typed suffixes (`2.7in`, `68.58mm`) already parse into centimetres and remain valid in every template.

## Stored fields

On `def.documentProperties` (parts, assemblies, drawings):

```
{
  template: "PART-MM-ISO",
  lengthUnit: "mm" | "in",
  massUnit: "g" | "kg" | "lb",
  angleUnit: "deg",
  draftingStandard: "iso" | "ansi",
  projection: "first-angle" | "third-angle",
  lengthPrecision: 2,          // display decimals in the document unit
  anglePrecision: 1,
  dualDimensions: false
}
```

`template` is the named defaults pack. Editing a property after creation does not rename the template; it marks the document as a derived standard.

Custom properties (Phase 4-2) live beside this pack: `Description`, `PartNo`, `Material`, `Revision`. They are strings that drawings and BOM tables reference by name.

## Templates as saved document defaults

A template is an otherwise-empty saved library document with `documentProperties` and a sheet format (drawings). New Part / New Assembly copies that document’s properties, not a hardcoded switch.

Book Chapter 5–9 flow:

1. File → New → MY-TEMPLATES → PART-IN-ANSI or PART-MM-ISO.
2. The flashlight parts in this project use the **inch branch** (documented M5 vs ½ in bolt-hole discrepancy on PDF 279). New flashlight parts should start from PART-IN-ANSI with millimetre dual display optional.
3. Assemblies use the matching ASM-* template so nested FLASHLIGHT does not mix projection or units.

Ship four starter templates in the library, created on first launch if missing. Users can Save As Template from any document.

## Precision

Display precision is not modeling precision. Sketch and feature values stay full IEEE floats in centimetres. Rounding is for HUD, drawings, and mass-property *labels*. Mass properties already expose a mm/g toggle for CSWA gram answers.

Default display: inch templates 3 decimal inches; millimetre templates 2 decimal millimetres. That matches the book’s typical callouts (4.900 in, 124.46 mm).

## Migration of the eight saved parts

On first open after this lands:

- If `documentProperties` is absent, write `PART-IN-ANSI` for the Planchard flashlight parts (BATTERY through LENSCAP) because they were authored from the inch steps.
- Do not rescale stored centimetre geometry.
- Do not rewrite sketches. Only display and drawing projection change.

Assemblies and drawings created later take the template chosen at File → New.

## Out of scope here

Sheet formats, logos, title blocks, Insert Model Items, and BOM tables are Phase 4. This note only freezes the document-system so those features have a stable place to read units from.
