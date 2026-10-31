/* Import DXF (Site & scan › Capture, Output › File): pick a .dxf, choose the
   layers walls, doors and windows are read from, and land the result on the
   active floor — as editable walls with their openings, plus the whole
   drawing as a vector underlay whose line ends are snap points.

   The work is js/dxf_import.js (pure); this file is the dialog and the one
   undoable change to the plan, made the way the blueprint import makes it. */
import { S, WALL_H } from "./state.js";
import { t } from "./i18n.js";
import { pushHistory } from "./history.js";
import { render2D, fitView } from "./plan2d.js";
import { flash } from "./ui.js";
import { refreshTree, updateCost } from "./ui_tree.js";
import { fillProps } from "./ui_props.js";
import { detectRooms } from "./geometry.js";
import { ensureWallTypes } from "./wall_types.js";
import { rebuildProject } from "./core/project.js";
import { setBlueprintReference } from "./blueprint_trace.js";
import { generatedChangePermission } from "./redesign.js";
import {
  DXF_UNITS, createDxfSession, dxfImportMode, roomNameFromTexts,
} from "./dxf_import.js";

const UNIT_CHOICES = ["mm", "cm", "m", "in", "ft"];
const ERRORS = { DXF_IS_DWG: "dxf_err_dwg", DXF_BINARY: "dxf_err_binary", DXF_NOTHING: "dxf_err_nothing" };
const FALLBACK = {
  dxf_replace_blocked: "This floor has locked or linked geometry. Import into a new floor to replace it.",
  dxf_err_locked: "This floor's structure is locked. Unlock it or import into a new floor.",
  dxf_err_protected: "This floor has protected geometry, constraints or services. Import into a new floor.",
  dxf_warn_large: "The drawing was truncated because it exceeds the import limits.",
};
const messageFor = (key) => { const value = t(key); return value === key ? (FALLBACK[key] || key) : value; };
let closeImport = null;

/* Requests stay paired even when a worker fails to load. In that case the
   same session runs locally; the file is read only by the chosen backend. */
function drawingClient() {
  let worker = null, session = null, replied = false, closed = false, id = 0;
  const pending = new Map();
  const runLocal = (requestId, entry) => {
    setTimeout(async () => {
      if (closed || !pending.has(requestId)) return;
      try {
        const { method, file, options } = entry.request;
        const bytes = method === "open" ? await file.arrayBuffer() : null;
        if (closed) return;
        const result = method === "open" ? session.open(bytes, { name: file.name || "drawing.dxf" }) : session.plan(options);
        pending.delete(requestId);
        entry.resolve(result);
      } catch (err) {
        pending.delete(requestId);
        entry.reject(err);
      }
    }, 30);
  };
  const failed = () => {
    worker?.terminate();
    worker = null;
    if (closed) return;
    if (!replied) {
      session = createDxfSession();
      for (const [requestId, entry] of pending) runLocal(requestId, entry);
    } else {
      for (const entry of pending.values()) entry.reject(new Error("DXF worker failed"));
      pending.clear();
    }
  };
  try {
    const created = new Worker(new URL("./dxf_worker.js", import.meta.url), { type: "module" });
    worker = created;
    worker.onmessage = (event) => {
      if (closed || worker !== created) return;
      const { id: requestId, result, error } = event.data;
      const entry = pending.get(requestId);
      if (!entry) return;
      replied = true;
      pending.delete(requestId);
      if (error) { const err = new Error(error.message); err.code = error.code; entry.reject(err); }
      else entry.resolve(result);
    };
    worker.onerror = (event) => { event.preventDefault(); if (worker === created) failed(); };
    worker.onmessageerror = () => { if (worker === created) failed(); };
  } catch (_) {
    session = createDxfSession();
  }
  return {
    request(method, data = {}) {
      if (closed) return Promise.reject(new Error("DXF session closed"));
      return new Promise((resolve, reject) => {
        const requestId = ++id, entry = { request: { id: requestId, method, ...data }, resolve, reject };
        pending.set(requestId, entry);
        if (worker) {
          try { worker.postMessage(entry.request); } catch (_) { failed(); }
        } else if (session) runLocal(requestId, entry);
        else { pending.delete(requestId); reject(new Error("DXF worker failed")); }
      });
    },
    close() {
      closed = true;
      worker?.terminate();
      worker = session = null;
      for (const entry of pending.values()) entry.reject(new Error("DXF session closed"));
      pending.clear();
    },
  };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Read one DXF file and show what it holds (the file picker is in
    js/pro_actions.js, so it opens inside the click that asked for it). */
export async function importDxfFile(file) {
  if (!generatedChangePermission(S, "document.import_blueprint").ok) { flash(t("redesign_protected"), "error"); return; }
  closeImport?.();
  const client = drawingClient(), dismiss = flash(t("dxf_reading"));
  let closed = false, dialog = null;
  const close = () => {
    if (closed) return;
    closed = true;
    dismiss();
    client.close();
    if (dialog?.open) dialog.close();
    dialog?.remove();
    if (closeImport === close) closeImport = null;
  };
  closeImport = close;
  try {
    const drawing = await client.request("open", { file });
    if (closed) return;
    dismiss();
    dialog = openDialog(drawing, client, close, () => !closed && closeImport === close);
  } catch (err) {
    if (closed) return;
    close();
    flash(t(ERRORS[err && err.code] || "dxf_err_bad"), "error");
  }
}

function drawPreview(canvas, drawing, use) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 480, h = canvas.clientHeight || 200;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const b = drawing.bounds;
  if (!b || !(b.w > 0 || b.h > 0)) return;
  const pad = 10, s = Math.min((w - 2 * pad) / (b.w || 1), (h - 2 * pad) / (b.h || 1));
  const X = (x) => pad + (w - 2 * pad - b.w * s) / 2 + x * s;
  const Y = (y) => h - pad - (h - 2 * pad - b.h * s) / 2 - y * s;
  for (const pass of [false, true]) {
    ctx.beginPath();
    for (const row of drawing.preview) {
      if (use.has(row.layer) !== pass) continue;
      const segs = row.segs;
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(X(segs[i]), Y(segs[i + 1]));
        ctx.lineTo(X(segs[i + 2]), Y(segs[i + 3]));
      }
    }
    ctx.strokeStyle = pass ? "#1f2937" : "rgba(120,128,140,.45)";
    ctx.lineWidth = pass ? 1.2 : 0.8;
    ctx.stroke();
  }
}

function openDialog(drawing, client, close, isCurrent) {
  document.getElementById("dxfImport")?.remove();
  const dialog = el("dialog", "pro-dialog dxf-dialog");
  dialog.id = "dxfImport";
  const form = el("form");
  form.method = "dialog";
  form.append(el("h2", null, t("dxf_title")));

  const summary = el("p", "dxf-summary");
  const count = drawing.count;
  form.append(summary);

  // units: from $INSUNITS, or a guess the user is asked to check
  const unitRow = el("label", "dxf-units");
  unitRow.append(el("span", null, t("dxf_units")));
  const unit = el("select");
  unit.id = "dxfUnit";
  for (const u of UNIT_CHOICES) {
    const option = el("option", null, t("dxf_unit_" + u));
    option.value = u;
    unit.append(option);
  }
  unit.value = UNIT_CHOICES.includes(drawing.units.unit) ? drawing.units.unit : "mm";
  unitRow.append(unit, el("small", null, t(drawing.units.source === "header" ? "dxf_units_file" : "dxf_units_guess")));
  form.append(unitRow);
  const updateSummary = () => {
    const b = drawing.bounds, k = DXF_UNITS[unit.value] / 100;
    summary.textContent = drawing.name + " · " + t("dxf_summary", { n: count, w: b ? (b.w * k).toFixed(1) : "0", h: b ? (b.h * k).toFixed(1) : "0" });
  };
  unit.addEventListener("change", updateSummary);
  updateSummary();

  const preview = el("canvas", "dxf-preview");
  preview.setAttribute("aria-hidden", "true");
  form.append(preview);

  // layers
  const head = el("div", "dxf-layers-head");
  head.append(el("strong", null, t("dxf_layers")));
  const quick = el("span", "dxf-quick");
  head.append(quick);
  form.append(head);
  const list = el("div", "dxf-layers");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", t("dxf_layers"));
  const use = new Set(drawing.layers.filter((r) => r.use).map((r) => r.name));
  const boxes = [];
  for (const row of drawing.layers) {
    const line = el("label", "dxf-layer");
    const box = el("input");
    box.type = "checkbox";
    box.checked = use.has(row.name);
    box.disabled = !(row.strokes + row.fills);
    box.addEventListener("change", () => { box.checked ? use.add(row.name) : use.delete(row.name); drawPreview(preview, drawing, use); });
    box.setAttribute("aria-label", row.name + " · " + t("dxf_kind_" + row.kind));
    boxes.push([box, row]);
    const swatch = el("i", "dxf-swatch");
    // colour 7 is "black on paper, white on a dark screen" in CAD: the theme's ink
    swatch.style.background = row.rgb.every((c) => c === 0) ? "var(--text-main)" : "rgb(" + row.rgb.join(",") + ")";
    line.append(box, swatch, el("span", "dxf-layer-name", row.name), el("small", null, t("dxf_kind_" + row.kind) + " · " + (row.strokes + row.fills + row.texts)));
    list.append(line);
  }
  form.append(list, el("p", "dxf-hint", t("dxf_layers_hint")));
  const setAll = (pick) => {
    use.clear();
    for (const [box, row] of boxes) {
      box.checked = !box.disabled && pick(row);
      if (box.checked) use.add(row.name);
    }
    drawPreview(preview, drawing, use);
  };
  for (const [key, pick] of [["dxf_suggested", (r) => r.use], ["dxf_all", () => true], ["dxf_none", () => false]]) {
    const b = el("button", "dxf-link", t(key));
    b.type = "button";
    b.addEventListener("click", () => setAll(pick));
    quick.append(b);
  }

  // options
  const keep = el("label", "dxf-check");
  const keepBox = el("input");
  keepBox.type = "checkbox";
  keepBox.checked = true;
  keepBox.id = "dxfUnderlay";
  keep.append(keepBox, el("span", null, t("dxf_underlay")));
  form.append(keep);
  const mode = dxfImportMode(S, { replace: true, walls: 1 });
  const occupied = mode.occupied;
  let replace = null;
  if (occupied) {
    const modes = el("div", "dxf-modes");
    for (const [value, key] of [["replace", "dxf_replace"], ["add", "dxf_add"]]) {
      const r = el("label", "dxf-check"), input = el("input");
      input.type = "radio";
      input.name = "dxfMode";
      input.value = value;
      input.checked = value === (mode.ok ? "replace" : "add");
      input.disabled = value === "replace" && !mode.ok;
      if (value === "replace") replace = input;
      r.append(input, el("span", null, t(key)));
      modes.append(r);
    }
    form.append(modes);
    if (!mode.ok) form.append(el("p", "dxf-hint", messageFor("dxf_replace_blocked")));
  }

  const warnings = drawing.warnings;
  const warningText = [warnings.xref ? t("dxf_warn_xref") : "", warnings["too-large"] ? messageFor("dxf_warn_large") : ""].filter(Boolean).join(" ");
  const note = el("p", "dxf-note", warningText);
  form.append(note);
  const status = el("p");
  status.setAttribute("role", "status");
  form.append(status);
  const submit = el("button", null, t("dxf_import"));
  submit.type = "submit";
  const cancel = el("button", null, t("cancel"));
  cancel.type = "button";
  cancel.addEventListener("click", close);
  form.append(submit, cancel);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!use.size && !keepBox.checked) { status.textContent = t("dxf_err_pick"); return; }
    status.textContent = "";
    note.textContent = t("dxf_working");
    submit.disabled = true;
    const firstId = S.idc;
    try {
      const result = await client.request("plan", { options: {
        layers: new Set(use), cmPerUnit: DXF_UNITS[unit.value], underlay: keepBox.checked,
        firstId, height: WALL_H,
      } });
      if (!isCurrent() || !dialog.open) return;
      const message = applyDxf(result, { name: drawing.name, replace: !replace || replace.checked, firstId });
      close();
      flash(message, "success");
    } catch (err) {
      if (!isCurrent() || !dialog.open) return;
      if (err.code === "DXF_REFUSED") submit.disabled = false;
      else client.close();
      note.textContent = warningText;
      status.textContent = err.code === "DXF_REFUSED" ? err.message : t(ERRORS[err.code] || "dxf_err_bad");
    }
  });

  dialog.append(form);
  dialog.addEventListener("close", close, { once: true });
  dialog.addEventListener("cancel", close);
  document.body.append(dialog);
  dialog.showModal();
  drawPreview(preview, drawing, use);
  return dialog;
}

/* The one change to the plan: walls, openings and room names, then the
   underlay. Returns the message to show. */
function applyDxf(result, { name, replace, firstId }) {
  const { graph, texts, underlay } = result;
  const mode = dxfImportMode(S, { replace, walls: graph.walls.length });
  const permission = generatedChangePermission(S, "document.import_blueprint");
  if (!mode.ok || !permission.ok) {
    const err = new Error(!permission.ok ? t("redesign_protected") : messageFor("dxf_err_" + mode.reason));
    err.code = "DXF_REFUSED";
    throw err;
  }
  replace = mode.replace;

  // Multiplayer may have allocated ids while recognition was in flight.
  const delta = S.idc - firstId;
  if (delta) {
    for (const wall of graph.walls) wall.id += delta;
    for (const opening of graph.openings) { opening.id += delta; opening.wall += delta; }
    graph.nextId += delta;
  }
  pushHistory();
  if (replace) {
    S.nodes = graph.nodes;
    S.walls = graph.walls;
    S.openings = graph.openings;
    S.items = [];
    S.markers = [];
    S.annotations = [];
    S.slabOpenings = [];
    S.roomMeta = {};
  } else {
    const base = S.nodes.length;
    S.nodes = S.nodes.concat(graph.nodes);
    S.walls = S.walls.concat(graph.walls.map((w) => ({ ...w, a: w.a + base, b: w.b + base })));
    S.openings = S.openings.concat(graph.openings);
  }
  S.idc = Math.max(S.idc, graph.nextId);
  ensureWallTypes(S);
  if (replace) rebuildProject(S);

  // rooms take the names written inside them
  if (graph.walls.length) {
    for (const room of detectRooms()) {
      if (S.roomMeta[room.key]?.name) continue;
      const label = roomNameFromTexts(room.pts, texts);
      if (label) S.roomMeta[room.key] = { ...(S.roomMeta[room.key] || {}), name: label };
    }
  }

  const { dropped, ref } = underlay;
  if (ref) setBlueprintReference(ref);

  S.sel = null;
  S.workSet = "structure";
  if (S.layers?.structure) S.layers.structure.vis = "show";
  window.dispatchEvent(new CustomEvent("layers:changed"));
  S.dirty3D = true;
  render2D();
  fitView();
  refreshTree();
  fillProps();
  updateCost();

  const doors = graph.openings.filter((o) => o.type === "door").length;
  const windows = graph.openings.filter((o) => o.type === "window").length;
  let message = graph.walls.length
    ? t("dxf_done", { walls: graph.walls.length, doors, windows, name })
    : t("dxf_done_none");
  if (dropped) message += " " + t("dxf_dropped", { n: dropped });
  return message;
}
