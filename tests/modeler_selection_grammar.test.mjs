/* Selection grammar for the 3D viewport: which modifier does what, which
   filter is in force, and what the editor says when a pick is refused.

   These were the gaps that made picking feel unlike a CAD tool. Shift carried
   three unrelated jobs and none of them was "add"; the Sketch filter was
   selectable in a view that has no sketch geometry to acquire; a filtered miss
   cleared the selection in silence; and Ctrl+A in the 3D view ran the sketch
   branch, assigning a sketch entity to the slot that holds the selected solid.
   js/modeler.js cannot be imported under Node (bare `three` specifiers), so
   these are read off the source in the style of the other modeler suites. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { selectionFilterAllows, cycleOverlappingHits, SELECTION_FILTERS } from "../js/modeler_chrome.js";
import { vertexEntriesFrom, vertexKey } from "../js/core/topology_selection.js";
import { topologyForFeature } from "../js/core/topology.js";

const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = await readFile(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const strings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
/* Pick-to-reference and reference-to-screen geometry, split out of js/modeler.js. */
const pickGeometry = await readFile(new URL("../js/modeler_pick_geometry.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

function body(name, from) {
  const text = from || source;
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const braced = text.indexOf("\n}", start);
  return text.slice(start, braced + 2);
}

test("Shift grows the selection and Ctrl/Cmd flips one reference", () => {
  const pick = source.slice(source.indexOf("function pickAssemblyComponent"));
  // Ctrl/Cmd toggles: present, then removed.
  assert.match(pick, /event\.ctrlKey \|\| event\.metaKey \|\| E\.mobileAddSelection[\s\S]{0,400}?splice\(selectedAt,1\)/);
  // Shift only ever adds — that asymmetry is what makes it safe to hold.
  assert.match(pick, /else if \(event\.shiftKey\) \{[\s\S]{0,400}?E\.topologySelection\.push\(topologyReferencePicked\)/);
  assert.doesNotMatch(body("stepPickCycle"), /shiftKey/);
  // Shift no longer cycles, and no longer clears the reference id either.
  assert.doesNotMatch(pick, /if \(event\.shiftKey && overlapping\.length > 1\)/);
  assert.match(pick, /!event\.ctrlKey && !event\.metaKey && !event\.shiftKey\) E\.selectedReferenceId = null/);
});

test("cycling overlapping hits is offered by a chip instead of hiding on Shift", () => {
  assert.match(body("offerPickCycle"), /list\.length < 2[\s\S]{0,120}?hidePickCycle\(\)/);
  // Candidates are captured at pick time, not re-raycast on each step.
  assert.match(body("offerPickCycle"), /E\.pickCycle = \{ candidates: list/);
  // The chip counts, and steps through the same helper the unit tests cover.
  assert.match(body("renderPickCycle"), /tf\("pickCycle", \{ index: cycle\.index \+ 1, count: cycle\.candidates\.length \}\)/);
  assert.match(body("stepPickCycle"), /cycleOverlappingHits\(/);
  // It is torn down with the other viewport overlays and on a mode change.
  assert.match(body("closeChromeOverlays"), /hidePickCycle\(\)/);
  // Escape dismisses it before any branch below can take the key.
  assert.match(source, /if \(e\.key === "Escape"\) \{[\s\S]{0,300}?hidePickCycle\(\);/);
  assert.match(source, /function setMode\(m\)[\s\S]{0,600}?hidePickCycle\(\)/);
  assert.match(styles, /#modeler \.md-pick-cycle/);

  // The helper itself still wraps around, which is what the chip relies on.
  const hits = [{ persistentId: "a" }, { persistentId: "b" }, { persistentId: "c" }];
  assert.equal(cycleOverlappingHits(hits, "a").persistentId, "b");
  assert.equal(cycleOverlappingHits(hits, "c").persistentId, "a");
});

test("the Sketch filter is disabled where it cannot acquire anything", () => {
  // Available in the sketch view, refused in 3D — rather than silently no-op.
  assert.match(body("selectionFilterAvailable"), /E\.mode !== "3d" \|\| E\.modelPlaneActive/);
  assert.match(body("setSelectionFilter"), /if \(!selectionFilterAvailable\(id\)\) \{ flash/);
  assert.match(body("syncSelectionFilters"), /button\.disabled = !available/);
  // An already-selected Sketch filter is demoted rather than left dangling.
  assert.match(body("syncSelectionFilters"), /if \(!selectionFilterAvailable\(E\.selectionFilter\)\) E\.selectionFilter = "all"/);
  assert.match(source, /function setMode\(m\)[\s\S]{0,600}?syncSelectionFilters\(\)/);
  /* A sketch over the model makes sketch geometry pickable without changing
     E.mode, so syncModelPlane() has to repaint too — the state flipped there
     and the button did not, which a live test caught and this one pins. */
  assert.match(body("syncModelPlane"), /syncSelectionFilters\(\)/);
  // The dead early-return it replaces is gone.
  assert.doesNotMatch(source, /E\.selectionFilter === "sketch"\) \{ refreshSelection\(\); return; \}/);
  assert.match(styles, /#modeler \.md-sel-filters button:disabled/);
});

test("a pick the filter refuses says so instead of clearing in silence", () => {
  const pick = source.slice(source.indexOf("function pickAssemblyComponent"));
  assert.match(pick, /flash\(tf\("selFilterBlocked", \{ kind: selectionFilterLabel\(activeFilter\) \}\)\)/);
  // Hover stops pre-highlighting what the click would then refuse...
  const hover = source.slice(source.indexOf("var hoverFilter = commandSelectionPrefer()"));
  assert.match(hover, /filterBlocked = !!\(next && !selectionFilterAllows\(next\.kind, hoverFilter\)\)/);
  // ...and the cursor names the refusal.
  assert.match(hover, /filterBlocked \? "not-allowed"/);
  for (const key of ["selFilterBlocked", "selFilterSketch3d"]) assert.match(strings, new RegExp(`${key}: \\["[^"]+", "[^"]+"\\]`));
});

test("Select All in the 3D view selects topology, not a sketch entity", () => {
  assert.match(source, /E\.mode === "3d" && !E\.modelPlaneActive\) \{\s*selectAllTopology\(\);/);
  const all = body("selectAllTopology");
  // It honours the active filter and never puts a sketch entity in E.sel.
  assert.match(all, /var filter = commandSelectionPrefer\(\)/);
  assert.match(all, /selectionFilterAllows\(reference\.kind, filter\)/);
  assert.match(all, /E\.sel = part/);
  assert.match(all, /E\.ssel = \[\]/);
  // Body means the solid itself; there is no topology to gather for it.
  assert.match(all, /filter === "body" \|\| filter === "sketch"\) \{ E\.topologySelection = \[\]; return; \}/);
});

test("an active command sets the pick kind without eating the user's filter", () => {
  const prefer = body("commandSelectionPrefer");
  assert.match(prefer, /if \(E\.facePick\) return "face"/);
  assert.match(prefer, /FACE_DRIVEN_OPERATIONS\.has\(type\)\) return "face"/);
  assert.match(prefer, /return E\.selectionFilter/);
  // Fillet and chamfer are deliberately not forced to "edge".
  assert.doesNotMatch(prefer, /return "edge"/);
  assert.match(prefer, /E\.collectingFeature[\s\S]{0,80}return "all"/);
  // Shell and draft are the two that do force it.
  assert.match(prefer, /FACE_DRIVEN_OPERATIONS\.has\(type\)/);

  // beginFacePick no longer overwrites the sticky filter to get its face.
  assert.doesNotMatch(body("beginFacePick"), /E\.selectionFilter\s*=/);
  /* Every path that acquires topology goes through the override: the click,
     the hover, and both halves of the Ctrl-drag (window and sweep). */
  assert.ok((source.match(/prefer: commandSelectionPrefer\(\)/g) || []).length >= 4);
  for (const fn of ["beginBoxSelectDrag", "beginPaintSelectDrag"])
    assert.match(body(fn), /commandSelectionPrefer\(\)/, `${fn} must respect the active filter`);
  assert.doesNotMatch(source, /prefer: E\.facePick \? "face" : E\.selectionFilter/);
});

test("a collecting command says which kind it is waiting for", () => {
  assert.match(body("renderFinishEdgeList"), /host\.classList\.add\("is-collecting"\)/);
  assert.match(body("renderFinishEdgeList"), /t\("collectorArmedEdges"\)/);
  // Shell has no edge list but is collecting faces just as much.
  assert.match(body("syncActiveFeatureSelectionFeedback"), /note\.classList\.toggle\("is-collecting",FINISH_FEATURES\.includes\(type\)\|\|collectingEndFace\(\)\)/);
  // Shell, draft and thicken want a face; fillet and chamfer want an edge.
  assert.match(body("syncActiveFeatureSelectionFeedback"), /data-collector-kind",\(FACE_DRIVEN_OPERATIONS\.has\(type\)\|\|collectingEndFace\(\)\)\?"face":"edge"/);
  assert.match(partGeometry, /var FACE_DRIVEN_OPERATIONS = new Set\(\["shell", "dome", "draft", "thicken"\]\);/);
  assert.match(styles, /\.md-feature-selection-note\.is-collecting/);
});

test("the vertex filter is offered because something now emits vertices", () => {
  assert.ok(SELECTION_FILTERS.includes("vertex"));
  assert.equal(selectionFilterAllows("vertex", "vertex"), true);
  assert.equal(selectionFilterAllows("face", "vertex"), false);
  // The button exists only because the pick path can answer it.
  assert.match(source, /data-selfilter="vertex"/);
  assert.match(source, /prefer === "vertex"[\s\S]{0,400}?nearestVertexReference\(/);
  assert.match(body("nearestVertexReference"), /vertexEntriesFrom\(topologyEntriesForPart\(part\)\)/);
  // A corner is a point with no surface to borrow, so it is drawn explicitly.
  assert.match(body("addVertexHighlights"), /reference\.kind === "vertex"/);
  assert.match(source, /addVertexHighlights\(parent\)/);

  // Corners are derived from edge ends and keyed by position, so one corner is
  // one reference however many edges report it.
  const box = topologyForFeature({ id: "f1", type: "box" }, { x0: -10, x1: 10, y0: 0, y1: 8, z0: -6, z1: 6 });
  assert.equal(box.filter((e) => e.kind === "edge").length, 12);
  assert.equal(vertexEntriesFrom(box).length, 8);
  assert.equal(vertexKey({ x: -10, y: 0, z: -6 }), vertexKey({ x: -10.000000001, y: 0, z: -6 }));
});

test("selection operations are commands, reachable from menu and double-click", () => {
  // Grouped ahead of the modelling commands rather than mixed into them.
  const chrome = readFileSync(new URL("../js/modeler_chrome.js", import.meta.url), "utf8");
  assert.match(chrome, /export function selectionMenuItems/);
  assert.match(chrome, /selectionMenuItems\(input\)\.concat\(contextToolbarItems/);
  for (const id of ["selectloop", "selecttangency", "selectconnected", "selectinvert"])
    assert.match(chrome, new RegExp(`id: "${id}"`));
  assert.match(source, /host\.appendChild\(el\("div", "md-context-sep"\)\)/);
  assert.match(styles, /#modeler \.md-context-sep/);

  // One dispatcher, and it neither pushes undo nor edits the document.
  const dispatch = body("runChromeCommand");
  for (const id of ["selectloop", "selecttangency", "selectconnected", "selectinvert", "selectgrow", "selectshrink"])
    assert.match(dispatch, new RegExp(`"${id}"`), `${id} must be dispatched`);
  const run = body("runSelectionOperation");
  assert.doesNotMatch(run, /pushUndo/);
  assert.match(run, /id === "selectloop" \? selectLoop/);
  assert.match(run, /id === "selecttangency" \? selectTangentChain/);
  assert.match(run, /id === "selectconnected" \? selectConnected/);
  assert.match(run, /invertSelection\(E\.topologySelection/);
  // A grow during Fillet must feed the collector, not sit beside it.
  assert.match(run, /if \(finishCommandActive\(\)\) setFinishEdges\(refs, \{ pool: true \}\)/);

  // Double-click: edge gives its loop, face gives its smooth run.
  assert.match(body("growSelectionFromDoubleClick"), /reference\.kind === "face" \? "selecttangency" : "selectloop"/);
  assert.match(source, /doubleClick: function \(\) \{ growSelectionFromDoubleClick\(\); \}/);
  // The view layer had no such hook; mouse only, since a double tap is zoom.
  const view = readFileSync(new URL("../js/editor_view.js", import.meta.url), "utf8");
  assert.match(view, /addEventListener\("dblclick"[\s\S]{0,300}?opts\.doubleClick\(e, view\)/);
  assert.match(view, /e\.pointerType === "touch"\) return;[\s\S]{0,120}?opts\.doubleClick/);
});

test("highlights are sized in pixels and re-baked only when the zoom moves", () => {
  // The width the highlight advertises is the band the pick actually uses.
  assert.match(source, /var perPixel = decorationWorldPerPixel\(\)/);
  assert.match(source, /perPixel \* \(selected \? 2\.2 : hovered \? 1\.7 : 1\.1\)/);
  // The span-relative numbers survive only as a fallback before first render.
  assert.match(source, /: selected \? Math\.max\(\.38, span \* \.0055\)/);

  // Re-baked on a real zoom step, not every frame.
  assert.match(body("decorationScaleStale"), /ratio > 1\.34 \|\| ratio < 0\.75/);
  const scale = body("refreshDecorationScale");
  assert.match(scale, /if \(!\(E\.topologySelection \|\| \[\]\)\.length && !E\.hoverTopology && !finishCommandActive\(\)\) return/);
  assert.match(scale, /if \(!decorationScaleStale\(\)\) return/);
  assert.match(source, /afterRender: function \(view\) \{[\s\S]{0,200}?refreshDecorationScale\(\)/);
  /* The scale is stamped where the width is baked into geometry, not in
     refreshDecorations(): the preview rebuild also builds decorations, and
     recording it on only one of those paths left the stamp at zero — which
     reads as "nothing to compare" and stopped the re-bake ever firing. */
  assert.match(source, /if \(perPixel > 0\) decoratedWorldPerPixel = perPixel/);
  assert.doesNotMatch(body("refreshDecorations"), /decoratedWorldPerPixel =/);
  // Zero means unknown, and must not be treated as a ratio.
  assert.match(body("decorationScaleStale"), /!\(now > 0\) \|\| !\(decoratedWorldPerPixel > 0\)\) return false/);
});

test("the breadcrumb walks the selection instead of describing it", () => {
  assert.doesNotMatch(source, /bar\.textContent = crumbs\.map/);
  assert.match(source, /button\.addEventListener\("click", function \(\) \{ pickBreadcrumb\(crumb\); \}\)/);
  // A crumb label can be a name the user typed, so it is never innerHTML.
  assert.match(source, /button\.textContent = crumb\.label/);
  const pick = body("pickBreadcrumb");
  assert.match(pick, /crumb\.kind === "feature"[\s\S]{0,200}?openFeatureEditor\(feature\)/);
  assert.match(pick, /crumb\.kind === "body"/);
  assert.match(pick, /crumb\.kind === "component"/);
  // The row takes pointer events on its steps only; the gaps stay orbitable.
  assert.match(styles, /#modeler \.md-breadcrumb-step \{[\s\S]{0,200}?pointer-events: auto/);
  assert.match(styles, /#modeler \.md-breadcrumb \{[\s\S]{0,300}?pointer-events: none/);
});

test("window select honours the filter and does not cost the orbit gesture", () => {
  // Ctrl/Cmd-drag, so plain primary-drag stays orbit.
  assert.match(body("beginInstant3dDrag"), /\(event\.ctrlKey \|\| event\.metaKey\) && beginBoxSelectDrag\(event, view\)/);
  const begin = body("beginBoxSelectDrag");
  assert.match(begin, /E\.docType !== "part" \|\| E\.tool !== "select" \|\| E\.facePick/);
  // Same enclosed/crossing grammar as the sketch marquee, same helpers.
  assert.match(begin, /boxSelectMode\(box\.x0, box\.x1\)/);
  const apply = body("applyBoxSelection");
  assert.match(apply, /boundsHitBox\(bounds, box, mode\)/);
  assert.match(apply, /var filter = commandSelectionPrefer\(\)/);
  assert.match(apply, /selectionFilterAllows\(entry\.kind, filter\)/);
  /* A planar face descriptor has no outline, so a face is taken through the
     edges that bound it rather than guessed from a centre and an area. */
  assert.match(apply, /mode === "enclosed" \? taken\.every\(Boolean\) : taken\.some\(Boolean\)/);
  assert.match(body("entryScreenBounds", pickGeometry), /entry\.kind === "vertex"/);
  assert.match(styles, /#modeler \.md-marquee\.is-crossing/);
  assert.match(source, /id="mdMarquee"/);
});

test("Ctrl-drag windows over empty space and sweeps over the model", () => {
  /* The two halves of one gesture, split the way Instant3D splits a handle
     from open space: a window drawn from a point already inside the body would
     start over the thing it is meant to enclose. */
  const begin = body("beginBoxSelectDrag");
  assert.match(begin, /if \(over && over\.reference\) return beginPaintSelectDrag\(event, view, part, over\.reference\)/);
  const paint = body("beginPaintSelectDrag");
  // Additive only: a sweep that could deselect would undo itself on the way back.
  assert.doesNotMatch(paint, /splice/);
  assert.match(paint, /added\.has\(reference\.persistentId\)/);
  assert.match(paint, /if \(finishCommandActive\(\)\)/, "a sweep during Fillet feeds the collector");
});

test("grow and shrink are offered only when there is something to act on", () => {
  const chrome = readFileSync(new URL("../js/modeler_chrome.js", import.meta.url), "utf8");
  assert.match(chrome, /if \(input\.topologyCount\) \{[\s\S]{0,400}?id: "selectgrow"/);
  // Shrink needs more than one reference to have a boundary to pull back.
  assert.match(chrome, /input\.topologyCount > 1\) items\.push\(\{ id: "selectshrink"/);
  assert.match(body("runSelectionOperation"), /id === "selectgrow" \? growSelection/);
  assert.match(body("runSelectionOperation"), /id === "selectshrink" \? shrinkSelection/);
});

test("the selection filter has keys that do not cost the sketch tools", () => {
  // v, b, e and x are all KEY_TOOL entries; taking them would trade four tools
  // for four keystrokes.
  const commands = readFileSync(new URL("../js/modeler_commands.js", import.meta.url), "utf8");
  for (const letter of ["v", "b", "x", "e"]) assert.match(commands, new RegExp(`\\b${letter}: "`));
  assert.match(source, /Digit1: "all", Digit2: "face", Digit3: "edge", Digit4: "vertex", Digit5: "body"/);
  // e.code, because Shift+2 is not "2" on a US layout.
  assert.match(body("handleSelectionFilterChord"), /SELECTION_FILTER_KEYS\[e\.code\]/);
  assert.match(body("handleSelectionFilterChord"), /if \(e\.repeat\) return true/);
  // Tap sticks, hold borrows and snaps back.
  const release = body("releaseSelectionFilterChord");
  assert.match(release, /Date\.now\(\) - chord\.at < 300\) return/);
  assert.match(release, /if \(selectionFilterAvailable\(chord\.previous\)\) setSelectionFilter\(chord\.previous\)/);
  assert.match(source, /addEventListener\("keyup", function \(e\) \{ if \(E\.open\) releaseSelectionFilterChord\(e\); \}\)/);
});

test("an assembly selection is no longer capped at the mate's two references", () => {
  const pick = source.slice(source.indexOf("function pickAssemblyComponent"));
  assert.doesNotMatch(pick, /\.slice\(-2\)/);
  /* The pair is taken where it is needed instead: the newest pick and the most
     recent one before it on a DIFFERENT component, so a third pick on the same
     component no longer breaks the pair. */
  const pair = body("assemblyPickedRefs");
  assert.match(pair, /for \(var i = refs\.length - 2; i >= 0; i--\)/);
  assert.match(pair, /refs\[i\]\.componentId !== b\.componentId/);
});

test("saved selections live on the document and survive a rebuild honestly", () => {
  // In the schema whitelist, or every direct caller drops them silently.
  const schema = readFileSync(new URL("../js/core/schema.js", import.meta.url), "utf8");
  assert.match(schema, /namedSelections: cloneDomain\(options\.namedSelections\) \|\| \[\]/);
  // Saving is a document edit, so it goes through undo.
  assert.match(body("saveNamedSelection"), /pushUndo\(t\("nameSelection"\)\)/);
  assert.match(body("deleteNamedSelection"), /pushUndo\(t\("nameSelection"\)\)/);
  // Restoring rebinds against the body as it stands, and reports shortfall.
  const restore = body("restoreNamedSelection");
  assert.match(restore, /byId\.get\(reference\.persistentId\)/);
  assert.match(restore, /found\.length < \(record\.refs \|\| \[\]\)\.length/);
  assert.match(restore, /selectionSetStale/);
  // Naming uses the non-blocking form, not a window.prompt.
  assert.match(body("saveNamedSelection"), /await sheetPrompt\(t\("nameSelection"\)/);
});

test("the cursor and the hint name what is under the pointer", () => {
  assert.match(source, /dataset\.hoverKind = next \? next\.kind : filterBlocked \? "blocked" : ""/);
  const readout = body("hoverReadout");
  assert.match(readout, /reference\.kind === "face" \? t\("selFilterFace"\)/);
  assert.match(readout, /reference\.kind === "vertex" \? t\("selFilterVertex"\)/);
  // An edge carries the one number that separates several parallel runs.
  assert.match(readout, /reference\.kind !== "edge" \|\| !fin\(measure\)/);
  // It is a fallback for an empty line, never a replacement for the count.
  assert.match(source, /if \(!topologyCaption && E\.hoverTopology\) topologyCaption = hoverReadout\(E\.hoverTopology\)/);
  // And it follows the pointer, which is not what refreshAll() tracks.
  assert.match(source, /E\.hoverTopology = next;\s*refreshDecorations\(\);[\s\S]{0,140}?syncHint\(\)/);
});
