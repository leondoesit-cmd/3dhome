/* Part codes on the plan (js/part_codes.js has the scheme): a small tag on
 * every wall, opening and piece of furniture — W12, D7, F13 — so what the AI
 * card, its plan tags and the inspector call a part can be found on the
 * drawing, and typed back into the command bar to select it.
 *
 * Off by default (View & render → Part codes); the choice is remembered per
 * browser. Drawn on an SVG over the plan after every render, like the AI's
 * candidates, and never part of the plan's own drawing or its exports. */
import { S } from "./state.js";
import { t } from "./i18n.js";
import { onAfterRender, render2D, centerOn, isOnScreen } from "./plan2d.js";
import { sx, sz, rotatePx } from "./plan_view.js";
import { wallGeom, wallPointAt } from "./geometry.js";
import { select } from "./ui_props.js";
import { partCode, findPartByCode, parsePartCode } from "./part_codes.js";

var KEY = "mf.partCodes";
var shown = read();
var layer = null;

function read() {
  try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
}
export function partCodesShown() { return shown; }
export function togglePartCodes(on) {
  shown = on == null ? !shown : !!on;
  try { localStorage.setItem(KEY, shown ? "1" : "0"); } catch (_) {}
  render2D();
  return shown;
}

function svgEl(name, attrs) {
  var node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
  return node;
}
function selectedId() {
  var sel = S.sel;
  return sel && sel.ref && sel.ref.id != null ? String(sel.ref.id) : null;
}
/* Where each code sits: a wall at its middle, an opening at its centre on the
   wall, a piece at the centre of its footprint. */
function anchors() {
  var out = [];
  (S.walls || []).forEach(function (w) {
    var g = wallGeom(w);
    if (!g || !(g.L > 0)) return;
    var p = wallPointAt(w, g.L / 2);
    if (p) out.push({ kind: "wall", code: partCode("wall", w.id), id: w.id, x: p.x, z: p.z });
  });
  (S.openings || []).forEach(function (o) {
    var w = (S.walls || []).find(function (x) { return x.id === o.wall; });
    var p = w && wallPointAt(w, Number(o.s) || 0);
    if (p) out.push({ kind: "opening", code: partCode("opening", o.id, o), id: o.id, x: p.x, z: p.z });
  });
  (S.items || []).forEach(function (it) {
    if (!it || !isFinite(it.x) || !isFinite(it.z)) return;
    out.push({ kind: "item", code: partCode("item", it.id), id: it.id, x: it.x, z: it.z });
  });
  return out.filter(function (a) { return a.code; });
}

function clear() {
  if (layer) layer.remove();
  layer = null;
}
/* The desktop inspector's heading carries the selected part's code, codes
   shown on the plan or not (the phone card has its own, in mobile_shell.js). */
function syncInspectorCode() {
  var head = document.querySelector("#right-inspector > .panel-section > h3");
  if (!head) return;
  var chip = document.getElementById("pcInspCode");
  var sel = S.sel, code = sel && !Array.isArray(sel.refs) && sel.ref && sel.ref.id != null ? partCode(sel.kind, sel.ref.id, sel.ref) : "";
  if (!code) { if (chip) chip.hidden = true; return; }
  if (!chip) {
    chip = document.createElement("span");
    chip.id = "pcInspCode";
    chip.className = "pc-insp-code";
    var cost = head.querySelector("#costChip");
    head.insertBefore(chip, cost || null);
  }
  chip.hidden = false;
  chip.textContent = code;
  chip.title = t("m_card_id_tip");
}
function paint() {
  syncInspectorCode();
  clear();
  if (!shown) return;
  var host = document.getElementById("view-2d"), plan = document.getElementById("plan");
  if (!host || !plan || !plan.clientWidth) return;
  var W = plan.clientWidth, H = plan.clientHeight, sel = selectedId();
  var svg = svgEl("svg", { class: "part-code-layer", viewBox: "0 0 " + W + " " + H, "aria-hidden": "true" });
  /* The tag font follows the layout's text floor (css/pro_skin.css), so the
     box does too: a fixed advance per character of the monospace font, no
     text measuring on every repaint. */
  var floor = parseFloat(getComputedStyle(document.body).getPropertyValue("--fs-floor")) || 0;
  var fs = Math.max(10.5, floor), adv = fs * 0.63, th = Math.round(fs + 6);
  /* Tags that would land on one another are skipped, not stacked: a pile of
     codes is unreadable, and every part can still be found by tapping it or
     typing its code. The selected part goes first, so its tag always shows. */
  var placed = [], list = anchors();
  if (sel) list.sort(function (a, b) { return (String(b.id) === sel) - (String(a.id) === sel); });
  list.forEach(function (a) {
    var p = rotatePx(sx(a.x), sz(a.z));
    if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) return;
    var w = a.code.length * adv + 8;
    var box = { l: p.x - w / 2 - 2, r: p.x + w / 2 + 2, t: p.y - th / 2 - 2, b: p.y + th / 2 + 2 };
    if (placed.some(function (q) { return q.l < box.r && box.l < q.r && q.t < box.b && box.t < q.b; })) return;
    placed.push(box);
    var g = svgEl("g", {
      class: "pc-tag pc-" + a.kind + (sel === String(a.id) ? " pc-sel" : ""),
      transform: "translate(" + Math.round(p.x) + "," + Math.round(p.y) + ")",
    });
    g.appendChild(svgEl("rect", { x: -w / 2, y: -th / 2, width: w, height: th, rx: 4, ry: 4 }));
    var text = svgEl("text", { x: 0, y: Math.round(fs * 0.36), "text-anchor": "middle" });
    text.textContent = a.code;
    g.appendChild(text);
    svg.appendChild(g);
  });
  host.appendChild(svg);
  layer = svg;
}
onAfterRender(paint);

/* "W12" typed into the command bar: select that part and bring it into view.
   Returns the code it selected, or "" when the text is not a code of a part
   on this floor (the caller then treats it as a tool name or a question). */
export function selectPartByCode(text) {
  var hit = findPartByCode(S, text);
  if (!hit) return "";
  return selectHit(hit);
}
function selectHit(hit) {
  select({ kind: hit.kind, ref: hit.ref });
  var at = anchors().find(function (a) { return String(a.id) === String(hit.ref.id); });
  if (at && !isOnScreen(at.x, at.z)) centerOn(at.x, at.z);
  render2D();
  return partCode(hit.kind, hit.ref.id, hit.ref);
}
export function partCodeToast(on) { return t(on ? "pc_shown" : "pc_hidden"); }

/* The command bar's answer to typed text that is a code: "F13 selected", or
   "No D12 on this floor" for a lettered code that names nothing here — that
   is a code, not a question, so it never goes on to the AI. A bare number
   that finds nothing is left to the caller. Returns null for other text. */
export function partCodeAnswer(text) {
  var code = selectPartByCode(text);
  if (code) return t("pc_selected", { code: code });
  var parsed = parsePartCode(text);
  if (parsed && parsed.kind) return t("pc_missing", { code: String(text).trim().toUpperCase().replace(/\s+/g, "") });
  return null;
}
