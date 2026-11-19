# Building in 3D: solid previews, touch comfort, cabinet design

Goal (user's words, translated): make building in the 3D view intuitive and
comfortable, with a preview that is **transparent by a setting, or not
transparent**, for **every function the 2D plan has, cabinet design included**;
comfortable on a phone and on a foldable; plus other improvements found on the way.

## What exists today (read these first, they are short)

- `js/planner_input.js` (47 lines): the bridge. `dispatchPlannerInput(phase, input)`
  turns a 3D pointer sample into a synthetic pointer event for the SAME 2D
  handlers (`js/interaction/pointer_down.js`, `plan_move.js`, `pointer_up.js`).
  `PLANNER_TOOL_COVERAGE` lists the 20 tools that already work from the 3D pane.
- `js/planner_3d.js` (288 lines): owns the 3D pane's pointer wiring, the
  `.planner-navigation` bar (Walk / Look / Person / Roof / Walls) and
  `paintPlanner3D()`, which draws every draft as **thin 2D lines on a HUD canvas**
  (`#planner-3d-hud`) and fires `planner-overlay-3d` for other painters
  (`js/interaction/fit_cabinet_tool.js`, `js/agent_preview.js`, `js/ui_survey.js`).
- `js/view3d.js` `plannerPointer3D(cx, cy)`: ray → ground plane at y=0, or the hit
  item / opening / wall (walls projected to their centreline).
- `js/planner_touch.js`: who owns a finger in 3D (pure, tested).
- Draft state the 2D tools already keep on `S`: `drawing`/`drawFrom`/`previewPt`,
  `arcDraft`, `rectDraft`, `roomGhost`, `offsetDraft`, `biteDraft`, `markerPreview`,
  `placeType`, `mep.route`, `hoverWall`/`hoverItem`/`hoverNode`/`hoverPt`, and the
  private `draft` in `fit_cabinet_tool.js`.

So the tools run in 3D already. What is missing is that you cannot SEE what you
are about to build: a wall is two green lines, a door is nothing, a sofa is a
flat rectangle at rot 0. That, plus touch ergonomics, is the work.

## Part A: real 3D previews ("ghosts")

### A1. Pure ghost description: `js/build3d_ghost.js` (new, Node-importable)
No `three` import. `ghostSpecs(state, deps)` returns a flat array of primitives
describing what the active tool would build right now:

```
{ shape: "box", cx, cy, cz, w, h, d, rotY, tone }      // tone: "ok" | "blocked" | "erase" | "edit"
{ shape: "prism", pts: [{x,z}...], y0, y1, tone }       // arc walls, room floors, slab voids
{ shape: "tube", pts: [{x,y,z}...], r, tone }           // MEP routes
```

`deps` carries what Node cannot import cheaply (wall geometry lookups, `FURN`,
default wall thickness/height, the fit-cabinet draft, opening defaults) so the
tests feed plain objects. Coverage, one row per tool, each mirroring exactly
what the 2D overlay shows for the same state (read `js/plan2d/overlays.js` and
`js/plan2d.js` around the `S.tool ===` branches to match it):

| Tool / state | Ghost |
|---|---|
| `wall` (`S.drawing`, `drawFrom`, `previewPt`) | box along the segment, the thickness and height the commit will really use (find them in `commands/wall_draw.js`; today's HUD hardcodes 270) |
| `arcwall` (`S.arcDraft`) | prism swept along the arc at wall thickness |
| `rect` (`S.rectDraft`) | four wall boxes + a thin floor prism |
| `roomstamp` (`S.roomGhost`) | same, `blocked` tone when `roomGhost.blocked` |
| `slabvoid` | thin prism at slab level, `erase` tone |
| `walloffset` (`S.offsetDraft`) | wall box at the offset line |
| `door` / `window` / `passage` hover on a wall | box width × height × (wall thickness + 2) at the sill, from `openingDrawDefaults`; `blocked` when the placement command would refuse (clamp/overlap rules are in `commands/opening_place.js`) |
| furniture placement (`S.placeType`) | box of the piece's real w × d × h at the snapped position AND rotation (today's outline uses `rot: 0`; reuse the placement snap the commit uses), with a small front marker |
| `fitcab` | the draft box (export a read-only getter from `fit_cabinet_tool.js`) |
| `wallbite` (`S.biteDraft`) | the bite volume, `erase` tone |
| `mepRoute` / `mepNode` | tube through `route.pts` + preview point; small box at the node |
| `point` (`S.markerPreview`) | small pin box |
| `erase`, `wallbreak`, `walljoin`, `wallreverse`, `wallpaint` hover | a slightly inflated box over the hovered wall/item (`erase` tone for erase, `edit` otherwise); `wallbreak` adds a thin cut slab at the break point |

Storey height: verify what y the active storey's floor has in the 3D scene and
that `plannerPointer3D`'s ground plane matches it on an upper storey. If it
does not, fix it and say so.

### A2. Preview preferences: `js/build3d_prefs.js` (new, pure + storage)
- `mode`: `"ghost"` (transparent, default) | `"solid"` (opaque) | `"outline"` (today's lines only).
- `opacity`: 0.15–0.9, default 0.45, used in ghost mode.
- Stored under `localStorage` key `mf_build3d_preview` (try/catch, sane default on junk).
  Fires `build3d:prefs` on change. Clamp/parse functions are exported and tested.

### A3. Scene side: `js/view3d/build_ghost.js` (new piece)
- One `Group` (`name: "buildGhost"`) kept OUT of the pickable roots, so it is
  never raycast, never selected, never exported, never part of `build3D` merges.
  Attach it lazily and re-attach if a rebuild detached it.
- Pooled meshes (unit box scaled per spec; prisms/tubes rebuilt only when their
  spec changes). Skip all work when the spec signature is unchanged.
- Materials: node materials only (WebGPU renderer; `tests/webgpu_renderer.test.mjs`
  bans `ShaderMaterial`/GLSL). Make the ghost (transparent, `depthWrite: false`)
  and solid (opaque) variants ONCE per tone and swap between them; opacity is a
  uniform/`opacity` change, never a new material. No `castShadow`/`receiveShadow`
  (shadow handoffs re-key every shader in this app). A thin edge line on each
  ghost keeps it readable against a same-coloured wall.
- Tone colours: ok teal `#26b99a`, blocked `#ed705a`, erase `#ed705a`, edit amber `#faac38`
  (the HUD's existing colours).
- Driven from `planner_3d.js` after each `send()` and from the existing render
  hook; hidden in walk/games, in `outline` mode, and when no tool is drafting.
- `js/view3d.js` is over the size limit and frozen: do NOT grow it. Reach the
  scene through what it already exports (`dyn`, etc., as
  `js/view3d/navigation_edit.js` does). If one export is unavoidable, move
  something out with `tools/split_module.mjs` so the file ends smaller.

### A4. HUD in ghost/solid mode
Keep the snap ring, the length/size labels and constraint chips. Drop the
duplicate wire outlines the solid ghost now covers (keep them all in `outline`).
Add the missing labels: rect/roomstamp width × depth, opening width and its
distance to the nearer wall end, fit-cabinet width (if not already shown).

### A5. The setting's UI
A **Preview** button in `.planner-navigation` (`pn-preview`, icon `ph-cube-transparent`)
opening a small popover: segmented Transparent / Solid / Outline + an opacity
slider (only in Transparent). Closes on outside tap / Esc. Follows the bar's
existing `pn-icons` collapse. Strings: a new bilingual module
`js/build3d_strings.js` in the style of `js/code_check_strings.js` (the i18n
files are size-frozen); Hebrew + English, re-labelled on `onLangChange`.

## Part B: comfortable building, phone and foldable included

1. **Action strip for chained tools.** Phones have no Esc / Enter / right-click.
   While a chain is live in the 3D pane (`S.drawing`, `arcDraft`, `rectDraft`,
   `mep.route`, `offsetDraft`, fit-cabinet drag) show a strip at the pane's
   bottom centre: ✓ Finish · ↶ Undo last point · ✕ Cancel, wired to the SAME
   functions the keyboard uses (`finishDraw`, Esc path in `js/ui/keyboard.js`).
   Check first whether the 2D mobile chrome already has one (`js/mobile_shell.js`,
   `js/ui/mobile_chrome.js`) and reuse it rather than building a twin. Show it
   for mouse users too (small), since it also teaches the flow.
2. **Tool hint chip** in the 3D pane: active tool name + the next step
   ("Tap the wall's end point"), reusing the per-tool hint text `js/cad_hud.js`
   already builds for 2D (lines ~450–500). No new wording where one exists.
3. **Touch pick tolerance.** `dispatchPlannerInput` reports drawing-tool touches
   as `pointerType: "mouse"` (to keep the 2D loupe out), which also gives a
   finger the mouse's narrow snap/pick slop (`setPickSlop`). Carry a coarse flag
   through so a finger gets the wide slop without the loupe.
4. **Finger does not hide the target.** For touch with a creating tool, preview
   live while the finger is down and commit on release (2D already defers
   host placement to release for touch; mirror that rule), so the user can
   slide to refine while watching the ghost.
5. **Grazing rays.** Near the horizon the ground hit runs off to hundreds of
   metres and the draft flies away. Reject samples whose ground hit lies beyond
   a sane distance of the plan's bounds (or whose ray is within a few degrees of
   horizontal) and keep the last good sample.
6. **Layout on small and folded screens.** The navigation bar, the new strip,
   the hint chip and the popover must not overlap each other, the dock or the
   tool deck at: 360×800 phone, ~344×882 cover screen, ~884×1104 unfolded with a
   vertical hinge, and phone landscape. Touch targets ≥ 44 px. Keep controls off
   the hinge (existing fold handling lives in `css/pro_compact.css`: `dock-rail`,
   `m-fold-open`, `--ps-fold-col`). New rules go into the matching
   `css/styles_NN_*.css` / `pro_compact.css` area, not a new sheet. The repo's
   overlap/contrast audit tools (grep `tools/` for "overlap") are the check.
7. **Cabinet design from 3D.** Verify and close gaps, on desktop, phone and fold:
   - Fit cabinet from the 3D pane ends in the designer (`planner-fit-cabinet` →
     `js/ui_cabinet_dock.js`).
   - A cabinet selected in 3D can open the designer: double-click / double-tap
     on a cabinet item, plus a visible "Design" affordance wherever the 3D
     selection's actions live (find how 2D exposes `openCabinetForSelection`).
   - Edits in the designer show live in the 3D pane behind/beside it.

## Part C: bugs and improvements on the way

Fix what you meet in the files you are in (known already: placement outline at
`rot: 0`, hardcoded wall height 270 in the HUD). Anything out of this area goes
into `BUGS_TO_FIX.md` in its existing format, not into this change.

## Rules of the house (AGENTS.md is binding; the short version)

- Size gate: files ≤ 1,500 lines, functions ≤ 300, frozen files only shrink.
  New code goes in new small pieces; never raise a limit or add a baseline entry.
- New files → `survey-assets.json`. New planner action → its `js/ui/*_actions.js`
  handler AND that file's Set.
- The working tree already holds another session's uncommitted wall-ink /
  wall-junction work (`js/wall_ink.js`, `js/wall_junctions.js`, `js/plan2d/walls.js`,
  `WALL_*_PLAN.md`, their tests …). Leave it alone; touch one of those files
  only if this work truly needs it, with the smallest edit. **Do not commit,
  stash, reset or switch branches.**
- Never read big files whole; `node tools/outline.mjs <file> --grep word`, then
  Read with offset/limit.

## Done means

- `tests/build3d_ghost.test.mjs`: one behavioural case per row of the A1 table
  (state in → specs out), including blocked tones and the rotation of a
  wall-snapped piece. `tests/build3d_prefs.test.mjs`: parse/clamp/defaults.
  A case in `tests/planner_touch.test.mjs` (or beside it) for the coarse flag.
  Behaviour tests, not source regexes.
- `npm run check` exits 0 (all five gates). `npm run test:changed` passes.
  Do not run the full 17-minute suite.
- Report: files added/changed, what was verified and how, and plainly what was
  NOT verified (3D needs a real GPU; say if you could not look at it).
