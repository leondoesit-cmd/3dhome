/* Bridging the model editor's ribbon into the layout document.
 *
 * WHY THIS IS THE HARD SURFACE. The planner's chrome is markup in index.html:
 * it is there before uikit starts and it stays there. The modeler's is a
 * string, built by buildDOM() when the editor opens and thrown away when it
 * closes — and thrown away again on a language change, because every caption
 * in it is baked in at build time. So the elements a layout points at do not
 * exist for most of the session, come back as DIFFERENT elements, and vanish
 * under uikit rather than with it.
 *
 * Everything needed to survive that already exists, from the plan dock:
 * slots register and unregister at runtime, and a container whose slot is
 * absent renders nothing. This file is the same shape as dock.js, and that it
 * IS the same shape is the useful result — the generated-DOM case turned out
 * to need no new capability, only the identity that js/modeler.js was not
 * emitting.
 *
 * ONE DOCUMENT, NOT TWO. The ribbon's groups are nodes in the same layout as
 * the planner's panels, so there is one customize mode, one undo history and
 * one export covering both. A second instance would mean two of each, and two
 * escape hatches to remember.
 */

export const PANES = ["features", "sketch", "evaluate", "assembly"];

/* The fourteen groups, in the pane and order buildDOM emits them. Keyed by the
   i18n key js/modeler.js now stamps onto each group as data-mdgroup. */
export const GROUPS = [
  { key: "grpStart", pane: "features" },
  { key: "grpFinish", pane: "features" },
  { key: "grpDirect", pane: "features" },
  { key: "grpReferences", pane: "features" },
  { key: "grpStandards", pane: "features" },
  { key: "grpSketch", pane: "sketch" },
  { key: "grpRelations", pane: "sketch" },
  { key: "grpSketchEdit", pane: "sketch" },
  { key: "grpSketchOpenClose", pane: "sketch" },
  { key: "grpAnalyze", pane: "evaluate" },
  { key: "grpFile", pane: "evaluate" },
  { key: "grpInsert", pane: "assembly" },
  { key: "grpMates", pane: "assembly" },
  { key: "grpReview", pane: "assembly" },
];

export const slotName = (pane) => "md:" + pane;
export const paneNodeId = (pane) => "n:md-" + pane;
export const groupNodeId = (key) => "md:" + key;
export const groupButtonNodeId = (groupKey, id) => "cmd:" + groupKey + ":" + id;

export const RIBBON_BUTTONS = {
  grpStart: [
    { id: "newsketch", textKey: "createSketch", fallback: "Create Sketch", icon: "mode3d" },
    { id: "extrude", textKey: "opExtrude", fallback: "Extrude", icon: "extrude" },
    { id: "extrudecut", textKey: "extrudeCut", fallback: "Extrude Cut", icon: "extrudecut" },
    { id: "revolvefeature", textKey: "opRevolve", fallback: "Revolve", icon: "revolvefeature" },
    { id: "revolvecutfeature", textKey: "opRevolveCut", fallback: "Revolve Cut", icon: "revolvecutfeature" },
    { id: "sweepfeature", textKey: "opSweep", fallback: "Sweep", icon: "sweepfeature" },
    { id: "sweepcutfeature", textKey: "opSweepCut", fallback: "Sweep Cut", icon: "sweepcutfeature" },
    { id: "loftfeature", textKey: "loftOp", fallback: "Loft", icon: "loftfeature" },
    { id: "holefeature", textKey: "holeWizard", fallback: "Hole Wizard", icon: "holefeature" },
  ],
  grpFinish: [
    { id: "filletfeature", textKey: "quickFillet", fallback: "Fillet", icon: "filletfeature" },
    { id: "chamferfeature", textKey: "quickChamfer", fallback: "Chamfer", icon: "chamferfeature" },
    { id: "shellfeature", textKey: "shellOp", fallback: "Shell", icon: "shellfeature" },
    { id: "draftfeature", textKey: "draftOp", fallback: "Draft", icon: "draftfeature" },
    { id: "domefeature", textKey: "domeOp", fallback: "Dome", icon: "domefeature" },
    { id: "thickenfeature", textKey: "thickenOp", fallback: "Thicken", icon: "thickenfeature" },
    { id: "ribfeature", textKey: "ribOp", fallback: "Rib", icon: "ribfeature" },
    { id: "splitbodyfeature", textKey: "splitBodyOp", fallback: "Split Body", icon: "splitbodyfeature" },
    { id: "movebodyfeature", textKey: "moveBodyOp", fallback: "Move / Copy Body", icon: "movebodyfeature" },
    { id: "patternfeature", textKey: "quickPattern", fallback: "Pattern", icon: "patternfeature" },
    { id: "mirrorfeature", textKey: "quickMirror", fallback: "Mirror", icon: "mirrorfeature" },
    { id: "booleanfeature", textKey: "opBoolean", fallback: "Combine / Boolean", icon: "booleanfeature" },
  ],
  grpDirect: [
    { id: "directbox", textKey: "tool_rect", fallback: "Box", icon: "directbox" },
    { id: "directcyl", textKey: "tool_circle", fallback: "Cylinder", icon: "directcyl" },
    { id: "directsph", textKey: "tool_sph", fallback: "Sphere", icon: "directsph" },
    { id: "directpoly", textKey: "tool_poly", fallback: "Polygon Prism", icon: "directpoly" },
    { id: "directrev", textKey: "tool_rev", fallback: "Revolved Solid", icon: "directrev" },
  ],
  grpReferences: [
    { id: "refplane", textKey: "refPlane", fallback: "Reference Plane", icon: "refplane" },
    { id: "refaxis", textKey: "refAxis", fallback: "Reference Axis", icon: "refaxis" },
    { id: "coordsys", textKey: "refCoord", fallback: "Coordinate System", icon: "coordsys" },
  ],
  grpStandards: [
    { id: "stdscrew", textKey: "stdScrewCommand", fallback: "Standard Screw", icon: "stdscrew" },
    { id: "toolboxfastener", textKey: "toolboxFastener", fallback: "Fastener", icon: "toolboxfastener" },
    { id: "stdgear", textKey: "stdGearCommand", fallback: "Standard Gear", icon: "stdgear" },
    { id: "helixfeature", textKey: "opHelix", fallback: "Helix", icon: "helixfeature" },
    { id: "threadfeature", textKey: "opThread", fallback: "Thread", icon: "threadfeature" },
    { id: "knurlfeature", textKey: "opKnurl", fallback: "Knurl", icon: "knurlfeature" },
    { id: "insertfeature", textKey: "opInsert", fallback: "Threaded Insert", icon: "insertfeature" },
  ],
  // ---- sketch pane ----
  grpSketch: [
    { id: "select", textKey: "tool_select", fallback: "Select", icon: "select" },
    { id: "wall", textKey: "tool_wall", fallback: "Line / Wall", icon: "wall" },
    { id: "srect", textKey: "tool_srect", fallback: "Rectangle", icon: "srect" },
    { id: "centerrectangle", textKey: "centerRectangle", fallback: "Center rectangle", icon: "centerrectangle" },
    { id: "faceboundary", textKey: "faceBoundary", fallback: "Copy face boundary", icon: "faceboundary" },
    { id: "scirc", textKey: "tool_scirc", fallback: "Circle", icon: "scirc" },
    { id: "sarc", textKey: "tool_sarc", fallback: "Arc", icon: "sarc" },
    { id: "arc3point", textKey: "arcThreePoint", fallback: "3-point arc", icon: "sarc" },
    { id: "sslot", textKey: "tool_sslot", fallback: "Slot", icon: "sslot" },
    { id: "spoly", textKey: "tool_spoly", fallback: "Polygon", icon: "spoly" },
    { id: "sell", textKey: "tool_sell", fallback: "Ellipse", icon: "sell" },
    { id: "sspline", textKey: "tool_sspline", fallback: "Cubic spline", icon: "sspline" },
    { id: "sketchrepair", textKey: "sketchRepair", fallback: "Repair sketch relationships", icon: "sketchrepair" },
    { id: "dim", textKey: "tool_dim", fallback: "Dimension", icon: "dim" },
    { id: "trim", textKey: "tool_trim", fallback: "Trim", icon: "trim" },
    { id: "extend", textKey: "tool_extend", fallback: "Extend", icon: "extend" },
    { id: "sketchfillet", textKey: "sketchFillet", fallback: "Sketch Fillet", icon: "sketchfillet" },
  ],
  grpRelations: [
    { id: "coincident", textKey: "cCoincident", fallback: "Coincident", icon: "ph-dot-outline" },
    { id: "horizontal", textKey: "cHorizontal", fallback: "Horizontal", icon: "ph-arrows-horizontal" },
    { id: "vertical", textKey: "cVertical", fallback: "Vertical", icon: "ph-arrows-vertical" },
    { id: "parallel", textKey: "cParallel", fallback: "Parallel", icon: "ph-equals" },
    { id: "perpendicular", textKey: "cPerpendicular", fallback: "Perpendicular", icon: "ph-angle" },
    { id: "tangent", textKey: "cTangent", fallback: "Tangent", icon: "ph-circle-half" },
    { id: "equal", textKey: "cEqual", fallback: "Equal", icon: "ph-approximate-equals" },
  ],
  grpSketchEdit: [
    { id: "offset", textKey: "tool_offset", fallback: "Offset", icon: "offset" },
    { id: "constr", textKey: "tool_constr", fallback: "Construction", icon: "constr" },
    { id: "mirror", textKey: "sketchMirror", fallback: "Mirror", icon: "mirror" },
    { id: "dynamicmirror", textKey: "dynamicMirror", fallback: "Dynamic mirror", icon: "mirror" },
    { id: "pattern", textKey: "sketchPattern", fallback: "Linear Pattern", icon: "pattern" },
    { id: "circpattern", textKey: "sketchCircPattern", fallback: "Circular Pattern", icon: "circpattern" },
    { id: "project", textKey: "projectEdgesTip", fallback: "Project Edges", icon: "project" },
  ],
  grpSketchOpenClose: [
    { id: "newsketch", textKey: "createSketch", fallback: "Create Sketch", icon: "mode3d" },
    { id: "finishsketch", textKey: "finishSketch", fallback: "Finish Sketch", icon: "finishsketch" },
  ],
  // ---- evaluate pane ----
  grpAnalyze: [
    { id: "regen", textKey: "regenerate", fallback: "Regenerate", icon: "regen" },
    { id: "mass", textKey: "massProps", fallback: "Mass Properties", icon: "mass" },
    { id: "measure", textKey: "measureTool", fallback: "Measure", icon: "measure" },
    { id: "section", textKey: "sectionView", fallback: "Section View", icon: "section" },
    { id: "paint", textKey: "tool_paint_tip", fallback: "Paint / Appearance", icon: "paint" },
    { id: "note", textKey: "tool_note_tip", fallback: "Annotation / Note", icon: "note" },
    { id: "standards", textKey: "standardsAudit", fallback: "Standards Audit", icon: "standards" },
    { id: "fitcheck", textKey: "fitCheck", fallback: "Fit check", icon: "fitcheck" },
  ],
  grpFile: [
    { id: "drawing", textKey: "drawingExport", fallback: "Drawing", icon: "drawing" },
    { id: "config", textKey: "configurations", fallback: "Configurations", icon: "config" },
    { id: "bundle", textKey: "projectBundle", fallback: "Project Bundle", icon: "bundle" },
    { id: "bundlein", textKey: "importBundle", fallback: "Import Bundle", icon: "bundlein" },
    { id: "stepin", textKey: "stepImport", fallback: "Import STEP", icon: "stepin" },
    { id: "stepout", textKey: "stepExport", fallback: "Export STEP", icon: "stepout" },
    { id: "igesout", textKey: "exportIges", fallback: "Export IGES", icon: "igesout" },
  ],
  // ---- assembly pane ----
  grpInsert: [
    { id: "components", textKey: "insertComponent", fallback: "Insert Component", icon: "components" },
  ],
  grpMates: [
    { id: "mates", textKey: "mate", fallback: "Standard Mates", icon: "mates" },
    { id: "screwmate", textKey: "screwMate", fallback: "Screw Mate", icon: "screwmate" },
  ],
  grpReview: [
    { id: "explode", textKey: "explodeView", fallback: "Exploded View", icon: "explode" },
    { id: "isolate", textKey: "isolate", fallback: "Isolate", icon: "isolate" },
    { id: "interference", textKey: "interferenceCheck", fallback: "Interference Detection", icon: "interference" },
    { id: "bom", textKey: "billOfMaterials", fallback: "Bill of Materials", icon: "bom" },
    { id: "motion", textKey: "motionStudy", fallback: "Motion Study", icon: "motion" },
  ],
};

export function ribbonLayoutNodes() {
  const nodes = {};
  for (const pane of PANES) {
    nodes[paneNodeId(pane)] = {
      type: "bar",
      slot: slotName(pane),
      orient: "row",
      children: GROUPS.filter((g) => g.pane === pane).map((g) => groupNodeId(g.key)),
    };
  }
  for (const group of GROUPS) {
    const btns = RIBBON_BUTTONS[group.key];
    if (btns && btns.length) {
      const children = btns.map((b) => groupButtonNodeId(group.key, b.id));
      nodes[groupNodeId(group.key)] = {
        type: "group",
        ref: groupNodeId(group.key),
        children,
        constraints: { resize: "none", accepts: ["command"] },
      };
      for (const b of btns) {
        const bid = groupButtonNodeId(group.key, b.id);
        nodes[bid] = { type: "item", ref: bid };
      }
    } else {
      nodes[groupNodeId(group.key)] = { type: "item", ref: groupNodeId(group.key) };
    }
  }
  return nodes;
}

export function ribbonRootChildren() {
  return PANES.map(paneNodeId);
}

/* ---- connection ---------------------------------------------------------- */

let host = null;
let root = null;

export function connect(activeUIKit) {
  host = activeUIKit || null;
}

function ui() {
  const live = typeof host === "function" ? host() : host;
  return live && live.doc ? live : null;
}

export function active() {
  const live = ui();
  return !!(live && root && live.doc.nodes[paneNodeId("features")]);
}

/* The editor has just built its chrome. Registering the four panes is what
   brings the ribbon's groups into the layout; until then the four pane
   containers name slots that are not on the page, and render nothing. */
export function attach(modelerRoot) {
  root = modelerRoot || null;
  const live = ui();
  if (!live || !root) return false;
  for (const pane of PANES) {
    const el = root.querySelector('[data-command-pane="' + pane + '"]');
    if (el) live.registerSlot(slotName(pane), el);
  }
  return true;
}

/* Called BEFORE the editor removes its root.
 *
 * Order matters and is the whole reason this is a separate call rather than
 * something inferred: unregistering the slots makes uikit drop the four
 * containers on its next pass, which releases the group elements back to where
 * it borrowed them — inside the root that is about to be removed. Do it the
 * other way round and uikit is left holding elements in a detached tree, and
 * its teardown restores them into nothing. */
export function detach() {
  const live = ui();
  root = null;
  if (!live) return false;
  for (const pane of PANES) live.unregisterSlot(slotName(pane));
  return true;
}

/* Registry entries for the fourteen groups. Resolved on every render rather
   than captured: the ribbon is rebuilt from scratch on a language change, so a
   held reference would point at an element that is no longer in the page. */
export function ribbonEntries(label) {
  const entries = [];
  for (const group of GROUPS) {
    entries.push({
      id: groupNodeId(group.key),
      kind: "panel",
      textKey: "md_" + group.key,
      titleFallback: label ? label("md_" + group.key, group.key) : group.key,
      icon: null,
      adopt: () => (root ? root.querySelector('[data-mdgroup="' + group.key + '"]') : null),
      target: (el) => (el ? el.querySelector(".md-command-items") : null),
      /* A ribbon group is sized by the buttons in it; a width set here would
         fight the wrap the ribbon does when the window narrows. */
      constraints: { resize: "none" },
    });
    const btns = RIBBON_BUTTONS[group.key] || [];
    for (const b of btns) {
      const bid = groupButtonNodeId(group.key, b.id);
      const isRel = group.key === "grpRelations";
      const adoptBtn = () => {
        if (!root) return null;
        const attr = isRel ? `[data-relation="${b.id}"]` : `[data-command="${b.id}"]`;
        return root.querySelector(`[data-mdgroup="${group.key}"] ${attr}`);
      };
      entries.push({
        id: bid,
        kind: "command",
        textKey: b.textKey,
        titleFallback: label ? label(b.textKey, b.fallback) : b.fallback,
        icon: b.icon || null,
        adopt: adoptBtn,
        run: () => {
          const el = adoptBtn();
          if (el) el.click();
        },
        escapes: true,
        constraints: { resize: "none" },
      });
    }
  }
  return entries;
}
