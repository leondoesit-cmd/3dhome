/* The cabinet designer's AI adapter (js/editor_agent.js has the loop and the
 * rules). Three direct proposals, each checked against the open cabinet and
 * applied through the same code the inspector uses — so a size goes through
 * the designer's own size check (and its proposal dialog when the layout has
 * to re-plan), and a compartment gets exactly what its type buttons give it:
 *
 *   propose_size         overall width / height / depth, in mm
 *   propose_compartment  column n, compartment m → a type, and a count
 *   propose_door         column n → a door type
 *
 * Previewing selects the compartment or column it names, so it is outlined on
 * the elevation before Apply. The designer stores centimetres; the AI speaks
 * millimetres, the unit a cabinet maker writes on a drawing. */
import { registerEditorAgent } from "./editor_agent.js";
import { api, E, sp } from "./ui_cabinet_ctx.js";
import { SEC, DOORS, famLabel, cabSummary } from "./cabinet.js";
import { CAB_LIMITS } from "./parametric_cabinet.js";
import { applySecType } from "./ui_cabinet_inspect.js";
import { draw } from "./ui_cabinet_view.js";
import { displayUnit } from "./display_units.js";
import { formatCabinetDimension } from "./cabinet_units.js";

function mm(cm) { return Math.round(Number(cm) * 10); }
var COUNTED = { drawers: [1, 8], shelves: [0, 20], shoe: [0, 20], pullout: [1, 8] };

function state() {
  var spec = sp();
  if (!E.it || !spec) return { open: false };
  return {
    open: true,
    cabinet: famLabel(spec.fam) + " · " + cabSummary(E.it),
    sizeMm: { width: mm(E.it.w), height: mm(E.it.h), depth: mm(E.it.d) },
    limitsMm: Object.keys(CAB_LIMITS).reduce(function (o, k) {
      o[k] = [mm(CAB_LIMITS[k].min), mm(CAB_LIMITS[k].max)];
      return o;
    }, {}),
    columns: (spec.cols || []).map(function (col, i) {
      return {
        column: i + 1,
        door: (col.door || {}).t || "none",
        compartments: (col.secs || []).map(function (s, j) {
          var out = { compartment: j + 1, type: s.t, heightMm: mm(s.h) };
          if (s.n != null) out.count = s.n;
          return out;
        }),
      };
    }),
    selected: E.sel ? {
      column: E.sel.col != null ? E.sel.col + 1 : null,
      compartment: E.sel.sec != null ? E.sel.sec + 1 : null,
    } : null,
    compartmentTypes: Object.keys(SEC).map(function (k) { return k + " (" + SEC[k].en + ")"; }),
    doorTypes: Object.keys(DOORS),
  };
}

var TOOLS = [
  { type: "function", function: { name: "propose_size", description: "Propose new overall sizes in millimetres. Give only the sizes that change.", parameters: {
    type: "object", properties: { width: { type: "number" }, height: { type: "number" }, depth: { type: "number" } }, additionalProperties: false } } },
  { type: "function", function: { name: "propose_compartment", description: "Propose what one compartment holds. Column and compartment are 1-based as in get_editor_state (compartment 1 is the bottom one). count is shelves, drawers or baskets.", parameters: {
    type: "object", required: ["column", "compartment", "type"], properties: {
      column: { type: "integer", minimum: 1 }, compartment: { type: "integer", minimum: 1 },
      type: { type: "string", enum: Object.keys(SEC) }, count: { type: "integer", minimum: 0, maximum: 20 },
    }, additionalProperties: false } } },
  { type: "function", function: { name: "propose_door", description: "Propose the front of one column (1-based).", parameters: {
    type: "object", required: ["column", "door"], properties: {
      column: { type: "integer", minimum: 1 }, door: { type: "string", enum: Object.keys(DOORS) },
    }, additionalProperties: false } } },
];

function secName(k) { return SEC[k] ? SEC[k].en : k; }

function preview(name, args) {
  var spec = sp();
  if (!E.it || !spec) return { ok: false, reason: "NO_CABINET_OPEN" };
  if (name === "propose_size") {
    var changes = [];
    ["width", "height", "depth"].forEach(function (dim) {
      if (args[dim] == null) return;
      var cm = Number(args[dim]) / 10, lim = CAB_LIMITS[dim], was = E.it[lim.field];
      if (!Number.isFinite(cm)) return changes.push({ bad: dim });
      if (cm < lim.min || cm > lim.max) return changes.push({ bad: dim, range: [mm(lim.min), mm(lim.max)] });
      if (Math.abs(cm - was) >= 0.05) changes.push({ dim: dim, from: mm(was), to: mm(cm), cm: cm });
    });
    var bad = changes.find(function (c) { return c.bad; });
    if (bad) return { ok: false, reason: "SIZE_OUT_OF_RANGE", size: bad.bad, rangeMm: bad.range };
    if (!changes.length) return { ok: false, reason: "NO_CHANGE" };
    return { ok: true, kind: "size", changes: changes, undoable: true,
      lines: changes.map(function (c) { return c.dim + " " + c.from + " → " + c.to + " mm"; }) };
  }
  if (name === "propose_compartment") {
    var col = (spec.cols || [])[args.column - 1], sec = col && col.secs[args.compartment - 1];
    if (!sec) return { ok: false, reason: "NO_SUCH_COMPARTMENT" };
    if (!SEC[args.type]) return { ok: false, reason: "UNKNOWN_TYPE" };
    var range = COUNTED[args.type];
    if (args.count != null && (!range || args.count < range[0] || args.count > range[1]))
      return { ok: false, reason: "COUNT_NOT_ALLOWED", allowed: range || null };
    if (sec.t === args.type && (args.count == null || args.count === sec.n)) return { ok: false, reason: "NO_CHANGE" };
    return { ok: true, kind: "compartment", col: args.column - 1, sec: args.compartment - 1, type: args.type, count: args.count, undoable: true,
      lines: ["column " + args.column + " · compartment " + args.compartment + ": " + secName(sec.t) + " → " + secName(args.type) + (args.count != null ? " ×" + args.count : "")] };
  }
  if (name === "propose_door") {
    var c = (spec.cols || [])[args.column - 1];
    if (!c) return { ok: false, reason: "NO_SUCH_COLUMN" };
    if (!DOORS[args.door]) return { ok: false, reason: "UNKNOWN_DOOR" };
    var from = (c.door || {}).t || "none";
    if (from === args.door) return { ok: false, reason: "NO_CHANGE" };
    return { ok: true, kind: "door", col: args.column - 1, door: args.door, undoable: true,
      lines: ["column " + args.column + " door: " + DOORS[from].en + " → " + DOORS[args.door].en] };
  }
  return { ok: false, reason: "UNKNOWN_TOOL" };
}

// Outline what a proposal names on the elevation: its compartment or column.
function focus(p) {
  if (!E.it || !p || p.col == null) return;
  var col = sp().cols[p.col];
  if (!col) return;
  E.sel = { col: p.col, sec: p.sec != null ? p.sec : Math.max(0, (col.secs || []).length - 1) };
  draw();
}

function apply(p) {
  var spec = sp();
  if (!E.it || !spec) return { ok: false, reason: "NO_CABINET_OPEN" };
  if (p.kind === "size") {
    // through the inputs the user types into, so the designer's own size
    // check runs (and asks when the layout has to re-plan)
    var steps = 0, asked = false;
    p.changes.forEach(function (c) {
      var input = E.host && E.host.querySelector("#cb" + (c.dim === "width" ? "W" : c.dim === "depth" ? "D" : "H"));
      if (!input || asked) return;
      input.value = formatCabinetDimension(c.cm, displayUnit("furniture"));
      api.act("AI: " + c.dim);
      api.applyOverallSize(c.dim, input);
      // applied now, or the designer asked how to re-plan (its dialog decides)
      if (Math.abs(E.it[CAB_LIMITS[c.dim].field] - c.cm) < 0.05) steps++;
      else asked = true;
    });
    return { ok: true, steps: steps, asked: asked };
  }
  if (p.kind === "compartment") {
    var sec = spec.cols[p.col] && spec.cols[p.col].secs[p.sec];
    if (!sec) return { ok: false, reason: "NO_SUCH_COMPARTMENT" };
    E.sel = { col: p.col, sec: p.sec };
    var n = 0;
    api.act("AI: " + secName(p.type));
    if (sec.t !== p.type) { applySecType(p.type); n++; }
    if (p.count != null && p.count !== sec.n) {
      n++;
      api.act("AI: " + secName(p.type) + " ×" + p.count);
      sec.n = p.count;
      delete sec.heights;
      api.touch();
      api.changed();
    }
    return { ok: true, steps: n };
  }
  if (p.kind === "door") {
    var col = spec.cols[p.col];
    if (!col) return { ok: false, reason: "NO_SUCH_COLUMN" };
    col.door = col.door || {};
    col.door.t = p.door;
    api.act("AI: " + DOORS[p.door].en);
    api.touch();
    api.changed();
    return { ok: true, steps: 1 };
  }
  return { ok: false, reason: "UNKNOWN_PROPOSAL" };
}

registerEditorAgent("cab", {
  name: "cabinet designer",
  guide: [
    "",
    "Cabinet rules:",
    "- Sizes are millimetres. Column and compartment numbers are 1-based as in the live document; compartment 1 is the bottom one.",
    "- \"3 drawers in the left column\" is propose_compartment on that column's compartment with type drawers and count 3.",
    "- Partitions, presets, hardware and production run through their own commands: propose_command with the exact label.",
  ],
  state: state,
  tools: TOOLS,
  preview: preview,
  focus: focus,
  apply: apply,
  undo: function () { var b = E.host && E.host.querySelector("#cbUndo"); if (b && !b.disabled) b.click(); },
  isOpen: function () { return !!(E.open && E.it); },
});
