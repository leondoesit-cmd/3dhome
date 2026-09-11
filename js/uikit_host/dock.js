/* Bridging js/plan_tools_dock.js into the layout document.
 *
 * THE SPLIT. The dock keeps everything that makes it look like a dock: which
 * pane edges a zone is flush against, the borders and corner radii that
 * disappear where two panels meet, the axis that turns a tool column into a
 * tool row, the measure-both-ways pass that decides whether two panels sit
 * side by side or stack. None of that belongs in a general layout module —
 * they are facts about panels floating over a canvas, and absorbing them would
 * make uikit a worse fit for every other host.
 *
 * What moves across is ASSIGNMENT: which panel is in which zone, in what
 * order. That is the layout document's job everywhere else in this app, and
 * putting it there is what buys the dock undo/redo, "reset all", export, and
 * being editable from customize mode alongside the rest of the chrome.
 *
 * OFF BY DEFAULT MEANS OFF. uikit ships behind mf_uikit, so the dock has to
 * work exactly as it always has with no uikit in the page at all. Every
 * function here answers "not active" when there is no instance, and the dock
 * falls back to its own localStorage. That is also why the ten tests in
 * tests/plan_tools_dock.browser.mjs still describe the shipped behaviour
 * unchanged — they run with the flag off.
 */

import { ops } from "../../uikit/index.js";

export const ZONES = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
];

export const PANEL_KEYS = ["tools", "layers", "walls", "rooms", "status"];

export const slotName = (zone) => "pt:" + zone;
export const zoneNodeId = (zone) => "n:pt-" + zone;
export const panelNodeId = (key) => "pt:" + key;

/* The dock speaks h/v and row/column; the document speaks the schema's
   row/col and row/col. Mapping rather than renaming either: the dock's words
   are in its CSS and its tests, and the schema's are shared with every other
   node type. */
const AXIS_TO_ORIENT = { h: "row", v: "col" };
const ORIENT_TO_AXIS = { row: "h", col: "v" };
const FLOW_TO_SCHEMA = { row: "row", column: "col" };
const SCHEMA_TO_FLOW = { row: "row", col: "column" };

const DEFAULT_AXIS = {
  top: "h", bottom: "h", left: "v", right: "v",
  "top-left": "v", "top-right": "v", "bottom-left": "v", "bottom-right": "v",
};

/* Main commands and contextual submenus form two top rows; layers live at the side. */
const HOME = { tools: "top", layers: "left", walls: "top", rooms: "top", status: "left" };

export function dockLayoutNodes() {
  // A preset is deterministic; saved layouts are restored separately.
  const seed = { panels: {}, zones: { top: { axis: "h", flow: "column" }, left: { axis: "v", flow: "column" } } };
  for (const key of PANEL_KEYS) seed.panels[key] = { zone: HOME[key], order: PANEL_KEYS.indexOf(key) };
  const nodes = {};
  for (const zone of ZONES) {
    const zs = seed.zones[zone] || {};
    const here = PANEL_KEYS
      .filter((k) => seed.panels[k].zone === zone)
      .sort((a, b) => seed.panels[a].order - seed.panels[b].order);
    nodes[zoneNodeId(zone)] = {
      type: "stack",
      slot: slotName(zone),
      orient: AXIS_TO_ORIENT[zs.axis] || AXIS_TO_ORIENT[DEFAULT_AXIS[zone]],
      flow: FLOW_TO_SCHEMA[zs.flow] || "row",
      children: here.map(panelNodeId),
    };
  }
  for (const key of PANEL_KEYS) {
    nodes[panelNodeId(key)] = { type: "item", ref: panelNodeId(key) };
  }
  return nodes;
}

export function dockRootChildren() {
  return ZONES.map(zoneNodeId);
}

/* ---- is the document in charge right now? -------------------------------- */

let host = null;
let attached = null; // what js/plan_tools_dock.js lent us

export function connect(activeUIKit) {
  host = activeUIKit || null;
}

/* The dock keeps its wrappers and zone elements in a module closure, so it
   hands them over rather than being reached into. Called once, at dock init —
   which happens before uikit mounts, so this only records them; registration
   happens when there is an instance to register with. */
export function attach(parts) {
  attached = parts || null;
  if (attached && attached.zoneEls) registerZones(attached.zoneEls);
  return !!attached;
}

export function attachedParts() {
  return attached;
}

/* uikit has just re-rendered. If the document's assignment has moved — an
   undo, a reset, or a drag made in customize mode — the dock has to lay out
   again against the new arrangement. */
export function onRender() {
  if (attached && typeof attached.sync === "function") attached.sync();
}

export function homeZone(key) {
  return HOME[key];
}

/* Has the LAYOUT hidden this panel?
 *
 * There are two independent reasons a dock panel is not on screen, and they
 * belong to different owners: the app hides the wall palette when its tool is
 * not active, and the user can hide any panel from customize mode. Neither can
 * be expressed as the other, so the dock ORs them in the one place that writes
 * `hidden` on a wrapper — otherwise whichever of the two ran last would undo
 * the other on every layout pass.
 *
 * While customizing, this always answers false: uikit deliberately keeps a
 * hidden node on screen and marks it instead, so the user can see what they
 * did and put it back. */
export function hiddenInDoc(key) {
  const live = ui();
  if (!live || !active() || live.editing) return false;
  return !!ops.readField(live.doc, panelNodeId(key), "hidden", live.variant);
}

function ui() {
  const live = typeof host === "function" ? host() : host;
  return live && live.doc ? live : null;
}

/* Active means: uikit is mounted AND its document actually describes the dock.
   A layout saved before this existed, or one imported from elsewhere, will not
   — and the dock must go on working from its own store rather than quietly
   losing the user's arrangement. */
export function active() {
  const live = ui();
  if (!live) return false;
  return !!live.doc.nodes[zoneNodeId("left")];
}

/* ---- reading the assignment out of the document -------------------------- */

export function readState() {
  const live = ui();
  if (!live) return null;
  const doc = live.doc;
  const panels = {};
  const zones = {};
  for (const zone of ZONES) {
    const node = doc.nodes[zoneNodeId(zone)];
    if (!node) return null;
    zones[zone] = {
      axis: ORIENT_TO_AXIS[node.orient] || DEFAULT_AXIS[zone],
      flow: SCHEMA_TO_FLOW[node.flow] || "row",
    };
    (node.children || []).forEach((childId, index) => {
      const key = PANEL_KEYS.find((k) => panelNodeId(k) === childId);
      if (key) panels[key] = { zone, order: index };
    });
  }
  /* A panel the document has lost track of goes home rather than nowhere:
     an arrangement missing one panel is a bug the user cannot fix, because
     the thing they would drag is not on screen. */
  for (const key of PANEL_KEYS) {
    if (!panels[key]) panels[key] = { zone: HOME[key], order: 99 };
  }
  return { panels, zones };
}

/* ---- writing one back ---------------------------------------------------- */

/* The dock's single mutation point, mirrored. `lead` is what the drop gesture
   meant: against the flush edge, or after whatever is already there. */
export function writeDock(key, zone, axis, flow, lead) {
  const live = ui();
  if (!live || !active()) return false;
  const id = panelNodeId(key);
  const parent = zoneNodeId(zone);
  if (!live.doc.nodes[id] || !live.doc.nodes[parent]) return false;

  let next = live.doc;
  if (axis && AXIS_TO_ORIENT[axis]) {
    next = ops.setOrient(next, { id: parent, orient: AXIS_TO_ORIENT[axis] });
  }
  if (flow && FLOW_TO_SCHEMA[flow]) {
    next = ops.setFlow(next, { id: parent, flow: FLOW_TO_SCHEMA[flow] });
  }
  const existing = (next.nodes[parent].children || []).filter((c) => c !== id);
  const index = lead === false ? existing.length : 0;
  next = ops.move(next, { id, parent, index });

  if (next === live.doc) return false;
  live.apply("Dock " + key, next);
  return true;
}

/* ---- the zones as slots -------------------------------------------------- */

/* Called when the dock builds its zones, and again when it tears them down for
   a phone. uikit skips a container whose slot is absent, so unregistering is
   what stops the document from trying to place panels into zones that are no
   longer on the page. */
export function registerZones(zoneEls) {
  const live = ui();
  if (!live) return false;
  for (const zone of ZONES) {
    const el = zoneEls && zoneEls[zone];
    if (el) live.registerSlot(slotName(zone), el);
  }
  return true;
}

export function unregisterZones() {
  const live = ui();
  if (!live) return false;
  for (const zone of ZONES) live.unregisterSlot(slotName(zone));
  return true;
}

/* Registry entries for the four panels. The adopted element is the dock's own
   .pt-panel WRAPPER, not the panel inside it: the wrapper carries the grip and
   the flush/join attributes, and it is the thing a zone contains. */
export function dockEntries() {
  const wraps = attached && attached.wraps;
  const labels = attached && attached.labels;
  return PANEL_KEYS.map((key) => ({
    id: panelNodeId(key),
    kind: "panel",
    textKey: "dock_panel_" + key,
    titleFallback: (labels && labels[key]) || key,
    icon: null,
    adopt: () => (wraps && wraps[key]) || null,
    constraints: { resize: "none" },
  }));
}
