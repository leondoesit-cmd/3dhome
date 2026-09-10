# Exporting to Blender

`Export ▸ GLB` writes a glTF 2.0 file built specifically for Blender's
`File ▸ Import ▸ glTF 2.0`. Hold **Shift** (or **Alt**) on the toolbar button to
skip the dialog and export with the last settings used.

- `js/blender_export.js` — builds a throwaway scene and runs `GLTFExporter`
- `js/blender_names.js` — the naming rules (pure, unit-tested)
- `js/ui_blender.js` — the options dialog

## What the file contains

| In the app | In Blender |
| --- | --- |
| A wall | `Wall_<id>` empty, its meshes parented under it, in the `Walls` collection |
| A door / window | `Door_<id>` / `Window_<id>`, under `Walls` |
| A room floor | `Floor_<RoomName>`, in `Floors` |
| A ceiling | `Ceiling_<RoomName>`, in `Ceilings` (only when ceilings are shown) |
| A piece of furniture | `<Type>_<id>` empty with its parts under it, in `Furniture` |
| A conduit / duct run | `MEP` collection |
| Sun, daylight, lamps | `Lights` collection, as real Blender lamps |

The collections are glTF group nodes, so Blender imports them as **empties**,
not as collection datablocks. Select one and press `]` (Select ▸ Select
Hierarchy) to get the whole layer, or `M` to move it into a real collection.

Every object carries its planner data as glTF `extras`, which Blender turns
into **custom properties** (N-panel ▸ Item ▸ Custom Properties, or
`obj["home3d_id"]` from Python):

| Property | On | Meaning |
| --- | --- | --- |
| `home3d_kind` | everything | `wall`, `opening`, `floor`, `furniture`, `mep`, … |
| `home3d_id` | walls, openings, furniture | the planner's own id |
| `home3d_type` | furniture | the catalogue type (`diningChair`, …) |
| `home3d_room` | floors, ceilings | the room's name |
| `width_cm` / `depth_cm` / `height_cm` | furniture, openings | real dimensions, **in centimetres** |
| `thickness_cm` / `height_cm` | walls | assembly thickness and wall height |

Dimensions stay in centimetres on purpose: they are the numbers shown in the
planner, and they are data about the model rather than a length in the file.

## The five things this export gets right

1. **Units.** glTF is metres by specification and Blender believes it. The model
   is in centimetres, so everything is scaled by 0.01 — and the scale is baked
   into the **vertices**, so every object lands at scale `1.0` with no
   `Ctrl+A ▸ Apply Scale` needed. Switch **Units** to *Centimetres (raw)* if you
   would rather have 1 Blender unit = 1 cm.
2. **Light intensity.** Point and spot intensity in the app is candela
   calibrated for centimetre throws (`js/gpu.js`, `CD`). Illuminance falls off
   as 1/d², so a scene shrunk by 100 would arrive with every lamp 10 000× too
   bright. Punctual intensity is scaled by k² to compensate; the sun, measured
   in lux, is not touched.
3. **Names.** Blender takes node names verbatim, so they are sanitized, made
   unique with Blender's own `.001` convention, and kept inside the 63-character
   id limit before they reach the file.
4. **View aids stay in the viewport.** Layer ghosting, the MEP x-ray and the
   dollhouse cut-away are ways of looking at the model, not properties of it. A
   cut-away wall exports whole and solid. (Turn **Solid walls** off if you
   actually want the translucency.)
5. **Instancing.** The furniture cache builds each piece separately, so ten
   identical chairs hold ten copies of the same geometry. They are matched by
   content hash and exported as one mesh referenced ten times, which Blender
   imports as linked mesh data. Identical materials are merged the same way —
   a real flat went from 103 materials to 43.

## Importing

Blender's importer converts glTF's Y-up to Blender's Z-up on its own; leave
`+Y Up` on (the default). Nothing else needs changing.

The model is placed with its centre on the world origin and its floor at
`Z = 0`, so it opens where the viewport is already looking. Turn **Move to
origin** off to keep the planner's own coordinates — worth doing when the plan
is anchored to a real site and the coordinates mean something.

### Checking an import

```python
import bpy

# every object the planner named, with its planner id
for obj in bpy.data.objects:
    kind = obj.get("home3d_kind")
    if kind:
        print(kind, obj.name, obj.get("home3d_id", ""), obj.dimensions)

# select one layer
for obj in bpy.data.objects:
    obj.select_set(obj.get("home3d_kind") == "wall")
```

Object dimensions print in metres, and a wall drawn 270 cm high measures
`2.7`. If it measures `270`, the file was exported with *Centimetres (raw)*.

## What is deliberately left out

- **The ground plane and the site overlay.** They are an infinite backdrop and a
  satellite photo, not building fabric. The **Ground plane** switch adds them.
- **Hidden layers.** What the planner is hiding stays hidden, unless **Hidden
  layers** is on.
- **Other storeys.** Only the active storey is in the 3D scene at all, so only
  the active storey can be exported. Switch floors and export again.
- **The hemisphere fill light.** glTF's `KHR_lights_punctual` has no ambient or
  hemisphere type. Blender's world lighting is the equivalent, and it is a
  choice better made on that side.
- **Bump maps.** They ride along as `EXT_materials_bump`, which Blender does not
  read. Normal maps do import.
