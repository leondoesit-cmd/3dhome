/* The 3D pane's building chrome (js/planner_3d.js owns the pane):

   - Display: a button in .planner-navigation (pn-preview) and its popover.
     Walls: Solid | See-through is the wall X-ray the Services panel also
     toggles (js/wall_xray.js); Tool preview: Transparent / Solid / Outline
     plus an opacity slider for Transparent, how a draw tool's ghost looks
     (js/build3d_prefs.js keeps the choice). On the Round-6 phone layout the
     navigation bar is hidden, so the hint chip carries the same button.
   - The action strip at the pane's bottom centre while a chain is live:
     Finish · Undo point · Cancel, the keyboard's own paths (finishDraw /
     commitRoute for Enter and double-click, escapePlanDraft for Esc). With a
     cabinet selected and nothing drafting it offers Design instead.
   - The hint chip: the active tool's name and its next step, in the words
     the 2D plan already uses (js/build3d_input.js toolHintKey). */
import { S } from "./state.js";
import { getLang, onLangChange, t, tTouch } from "./i18n.js";
import { buildText } from "./build3d_strings.js";
import { build3dPrefs, setBuild3dPrefs, setWallXrayOpacity, wallXrayOpacity, OPACITY_MAX, OPACITY_MIN, WALL_OPACITY_MAX, WALL_OPACITY_MIN } from "./build3d_prefs.js";
import { chainState, isCabinetItem, selectionBar, toolHintKey, wallDragHint } from "./build3d_input.js";
import { isOnWall, onWallByType } from "./item_orient.js";
import { wallPlaneText } from "./wall_plane_strings.js";
import { initSelectionBar, selectionOnWallReady, syncSelectionBar } from "./build3d_selection.js";
import { mountFitFamilyPicker } from "./interaction/fit_cabinet_chooser.js";
import { fitText } from "./fit_cabinet_strings.js";
import { commitRoute, finishDraw, wallPoint } from "./interaction/mep_tools.js";
import { escapePlanDraft } from "./interaction/pointer_up.js";
import { cancelFitCab, fitCabDraftView } from "./interaction/fit_cabinet_tool.js";
import { cancelRoute, ensureMEP } from "./mep.js";
import { setWallXray, wallXrayOn } from "./wall_xray.js";
import { renderPanel as refreshMEPPanel } from "./ui_mep.js";
import { undo } from "./history.js";
import { wallById } from "./geometry.js";
import { resetDrawDirLock } from "./wall_draw.js";
import { render2D } from "./plan2d.js";
import { requestRender } from "./view3d.js";
import { proLabel, proTools } from "./pro_catalog.js";

let pane = null, previewBtn = null, pop = null, strip = null, chip = null, chipText = null, chipPreview = null, chipFamily = null;
const stripButtons = {};
let lastStrip = "", lastChip = "";
const MODES = [["ghost", "modeGhost", "ph-cube-transparent"], ["solid", "modeSolid", "ph-cube"], ["outline", "modeOutline", "ph-bounding-box"]];
const WALL_MODES = [["solid", "wallsSolid", "ph-wall"], ["xray", "wallsXray", "ph-selection"]];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function iconButton(cls, icon) {
  const b = el("button", cls);
  b.type = "button";
  const i = el("i", "ph " + icon);
  i.setAttribute("aria-hidden", "true");
  b.append(i, el("span"));
  return b;
}
function setLabel(b, label, title) {
  const s = b.querySelector("span");
  if (s && s.textContent !== label) s.textContent = label;
  b.title = title || label;
  b.setAttribute("aria-label", label);
}

/* ---- Display popover ----------------------------------------------------- */

function syncPopover() {
  if (!pop) return;
  const p = build3dPrefs();
  const walls = wallXrayOn(S) ? "xray" : "solid";
  pop.querySelectorAll("[data-b3d-walls]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.b3dWalls === walls)));
  pop.querySelectorAll("[data-b3d-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.b3dMode === p.mode)));
  const row = pop.querySelector(".b3d-opacity.b3d-ghost-opacity");
  if (row) row.hidden = p.mode !== "ghost";
  const range = row && row.querySelector("input[type=range]");
  if (range && Number(range.value) !== p.opacity) range.value = String(p.opacity);
  const out = row && row.querySelector("output");
  if (out) out.textContent = Math.round(p.opacity * 100) + "%";
  const wallRow = pop.querySelector(".b3d-wall-opacity");
  if (wallRow) {
    const wo = wallXrayOpacity();
    wallRow.hidden = walls !== "xray";
    const wr = wallRow.querySelector("input[type=range]");
    if (wr && Number(wr.value) !== wo) wr.value = String(wo);
    const wout = wallRow.querySelector("output");
    if (wout) wout.textContent = Math.round(wo * 100) + "%";
  }
}
function labelPopover() {
  if (!pop) return;
  pop.setAttribute("aria-label", buildText("preview"));
  pop.querySelectorAll("[data-b3d-section]").forEach((h) => { h.textContent = buildText(h.dataset.b3dSection); });
  pop.querySelectorAll("[data-b3d-section-group]").forEach((g) => g.setAttribute("aria-label", buildText(g.dataset.b3dSectionGroup)));
  pop.querySelectorAll("[data-b3d-walls]").forEach((b) => {
    const m = WALL_MODES.find((x) => x[0] === b.dataset.b3dWalls);
    if (m) setLabel(b, buildText(m[1]));
  });
  pop.querySelectorAll("[data-b3d-mode]").forEach((b) => {
    const m = MODES.find((x) => x[0] === b.dataset.b3dMode);
    if (m) setLabel(b, buildText(m[1]));
  });
  pop.querySelectorAll(".b3d-opacity").forEach((r) => {
    const key = r.classList.contains("b3d-wall-opacity") ? "wallOpacity" : "opacity";
    const lab = r.querySelector("span"), range = r.querySelector("input[type=range]");
    if (lab) lab.textContent = buildText(key);
    if (range) range.setAttribute("aria-label", buildText(key));
  });
  const note = pop.querySelector(".b3d-note");
  if (note) note.textContent = buildText("previewNote");
  [previewBtn, chipPreview].forEach((b) => b && setLabel(b, buildText("preview"), buildText("previewTip")));
}
function openPopover(open, anchor, byKeyboard) {
  if (!pop) return;
  const on = open == null ? pop.hidden : !!open;
  pop.hidden = !on;
  pop.classList.toggle("b3d-from-chip", !!on && anchor === chipPreview);
  [previewBtn, chipPreview].forEach((b) => b && b.setAttribute("aria-expanded", String(on && b === anchor)));
  if (!on) return;
  syncPopover();
  /* Focus moves in only for a keyboard opener: on a phone a focused control
     reads as "the soft keyboard is up" and the layout gives up the toolbar's room. */
  const first = byKeyboard && pop.querySelector("[aria-pressed=true]");
  if (first) first.focus({ preventScroll: true });
}
/* The same flip as the Services panel's X-Ray Walls box: the flag, a 3D
   rebuild, the plan, and that panel redrawn so its box agrees. */
function setWalls(mode) {
  ensureMEP();
  if (setWallXray(S, mode === "xray")) {
    S.dirty3D = true;
    render2D();
    refreshMEPPanel();
    requestRender();
  }
  syncPopover();
}
/* The walls rebuild with their new opacity a moment after the slider stops,
   not on every input event (a rebuild re-creates every wall mesh). */
let wallOpacityTimer = 0;
function setWallOpacity(value) {
  setWallXrayOpacity(value);
  syncPopover();
  clearTimeout(wallOpacityTimer);
  wallOpacityTimer = setTimeout(() => {
    if (!wallXrayOn(S)) return;
    S.dirty3D = true;
    requestRender();
  }, 120);
}
function opacityRow(cls, min, max, onValue) {
  const row = el("label", "b3d-opacity " + cls);
  const range = el("input");
  range.type = "range"; range.min = String(min); range.max = String(max); range.step = "0.05";
  range.oninput = () => { onValue(Number(range.value)); syncPopover(); };
  row.append(el("span"), range, el("output"));
  return row;
}
function sectionLabel(key) {
  const h = el("div", "b3d-sec");
  h.dataset.b3dSection = key;
  h.setAttribute("aria-hidden", "true");
  return h;
}
function buildPopover() {
  pop = el("div", "b3d-preview-pop");
  pop.setAttribute("role", "dialog");
  pop.hidden = true;
  const wallSeg = el("div", "b3d-seg b3d-walls");
  wallSeg.setAttribute("role", "group");
  wallSeg.dataset.b3dSectionGroup = "sectionWalls";
  for (const [mode, , icon] of WALL_MODES) {
    const b = iconButton("b3d-mode", icon);
    b.dataset.b3dWalls = mode;
    b.onclick = () => setWalls(mode);
    wallSeg.append(b);
  }
  const seg = el("div", "b3d-seg");
  seg.setAttribute("role", "group");
  seg.dataset.b3dSectionGroup = "sectionPreview";
  for (const [mode, , icon] of MODES) {
    const b = iconButton("b3d-mode", icon);
    b.dataset.b3dMode = mode;
    b.onclick = () => { setBuild3dPrefs({ mode }); syncPopover(); };
    seg.append(b);
  }
  const row = opacityRow("b3d-ghost-opacity", OPACITY_MIN, OPACITY_MAX, (v) => setBuild3dPrefs({ opacity: v }));
  const wallRow = opacityRow("b3d-wall-opacity", WALL_OPACITY_MIN, WALL_OPACITY_MAX, setWallOpacity);
  const note = el("div", "b3d-note");
  pop.append(sectionLabel("sectionWalls"), wallSeg, wallRow, sectionLabel("sectionPreview"), note, seg, row);
  pane.append(pop);
  // outside tap / Esc closes it (Esc then does not also cancel the draft)
  document.addEventListener("pointerdown", (e) => {
    if (pop.hidden || pop.contains(e.target) || (previewBtn && previewBtn.contains(e.target)) ||
        (chipPreview && chipPreview.contains(e.target))) return;
    openPopover(false);
  }, true);
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || pop.hidden) return;
    openPopover(false);
    e.stopImmediatePropagation();
  }, true);
}

/* ---- the chain strip ------------------------------------------------------ */

/* Undo the last point of a wall run the way Ctrl+Z does (one history step per
   segment), then pick the run up again at the corner it had reached. */
function undoWallPoint() {
  const ids = (S.drawWalls || []).slice();
  if (!ids.length) { escapePlanDraft(); return; }
  const head = wallById(ids[0]), start = head && S.nodes[head.a];
  const at = start ? { x: start.x, z: start.z } : null;
  undo();
  if (ids.length === 1) { if (at) wallPoint(at); return; }
  const prev = wallById(ids[ids.length - 2]), first = wallById(ids[0]);
  if (!prev || !first || !S.nodes[prev.b]) return;
  S.drawing = true;
  S.drawWalls = ids.slice(0, -1);
  S.drawFrom = prev.b;
  S.drawStart = first.a;
  S.drawFromSplit = false;
  S.previewPt = { x: S.nodes[prev.b].x, z: S.nodes[prev.b].z };
  resetDrawDirLock();
}
function undoPoint(kind) {
  if (kind === "wall") undoWallPoint();
  else if (kind === "arcwall") {
    if (S.arcDraft && S.arcDraft.through) S.arcDraft.through = null;
    else { S.arcDraft = null; S.previewPt = null; }
  } else if (kind === "rect" || kind === "slabvoid") { S.rectDraft = null; S.previewPt = null; }
  else if (kind === "mepRoute") {
    const r = S.mep && S.mep.route;
    if (r && r.pts.length > 1) { r.pts.pop(); r.previewPath = null; r._pk = null; }
    else cancelRoute();
  }
}
function runStrip(act) {
  const fit = fitCabDraftView();
  const chain = chainState(S, !!(fit && fit.dragging));
  if (act === "design") { openDesigner(); return; }
  if (!chain) return;
  if (act === "finish") {
    if (chain.kind === "wall") finishDraw();
    else if (chain.kind === "mepRoute") commitRoute();
  } else if (act === "undo") undoPoint(chain.kind);
  else if (act === "cancel") {
    if (chain.kind === "fitcab") cancelFitCab();
    else escapePlanDraft();
  }
  render2D();
  requestRender();
  updateBuild3DUI();
}
function selectedCabinet() {
  return S.sel && S.sel.kind === "item" && isCabinetItem(S.sel.ref) ? S.sel.ref : null;
}
/** Open the cabinet designer on `it` (or the selected cabinet). */
export function openDesigner(it) {
  const item = it || selectedCabinet();
  if (!item) return false;
  import("./ui_cabinet.js").then((m) => m.openCabinet(item));
  return true;
}
function buildStrip() {
  strip = el("div", "b3d-chain");
  strip.setAttribute("role", "toolbar");
  strip.hidden = true;
  for (const [act, icon] of [["finish", "ph-check"], ["undo", "ph-arrow-u-up-left"], ["cancel", "ph-x"], ["design", "ph-lockers"]]) {
    const b = iconButton("b3d-" + act, icon);
    b.onclick = () => runStrip(act);
    // a tap on the strip must never reach the canvas under it as a plan click
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    stripButtons[act] = b;
    strip.append(b);
  }
  // with one piece selected: Rotate / Flip / On wall / Duplicate / Delete before Design (js/build3d_selection.js)
  initSelectionBar(strip, stripButtons.design, iconButton, setLabel, () => { lastStrip = ""; updateBuild3DUI(); });
  pane.append(strip);
}
function labelStrip() {
  setLabel(stripButtons.finish, buildText("finish"), buildText("finishTip"));
  setLabel(stripButtons.undo, buildText("undoPoint"), buildText("undoPointTip"));
  setLabel(stripButtons.cancel, buildText("cancel"), buildText("cancelTip"));
  setLabel(stripButtons.design, buildText("design"), buildText("designTip"));
}

/* ---- the hint chip -------------------------------------------------------- */

function toolName(tool) {
  const spec = proTools("plan").find((x) => x.bind === "tool:" + tool);
  if (spec) return proLabel(spec.label, getLang() === "he" ? "he" : "en");
  const text = t("tool_" + tool);
  return text && text !== "tool_" + tool ? text.split(/\s[—(]/)[0] : "";
}
function hintText() {
  const tool = S.placeType && (!S.tool || S.tool === "select") ? null : S.tool;
  if (wallDragHint(S, isOnWall)) return wallPlaneText("hint");
  if (!S.placeType && (!tool || tool === "select")) return "";
  const key = toolHintKey(S);
  const step = tool === "fitcab" ? fitText("hint3d") : key ? (key.touch ? tTouch(key.key) : t(key.key)) : "";
  const name = tool ? toolName(tool) : "";
  return [name, step].filter(Boolean).join(" · ");
}
function buildChip() {
  chip = el("div", "b3d-hint");
  chip.hidden = true;
  chipText = el("span", "b3d-hint-text");
  chipText.setAttribute("aria-live", "polite");
  chipPreview = iconButton("b3d-hint-preview", "ph-cube-transparent");
  chipPreview.onclick = (e) => openPopover(null, chipPreview, e.detail === 0);
  // the Draw cabinet tool's family chooser (js/interaction/fit_cabinet_chooser.js)
  chipFamily = mountFitFamilyPicker("b3d-hint-family");
  chipFamily.hidden = true;
  chip.append(chipText, chipFamily, chipPreview);
  pane.append(chip);
}

/* ---- wiring --------------------------------------------------------------- */

/** Build the chrome once; `bar` is the pane's .planner-navigation. */
export function initBuild3DUI(paneEl, bar) {
  if (pane || !paneEl) return;
  pane = paneEl;
  if (bar) {
    previewBtn = iconButton("pn-preview", "ph-cube-transparent");
    const caret = el("i", "ph ph-caret-down b3d-caret");
    caret.setAttribute("aria-hidden", "true");
    previewBtn.append(caret);
    previewBtn.setAttribute("aria-haspopup", "dialog");
    previewBtn.onclick = (e) => openPopover(null, previewBtn, e.detail === 0);
    bar.append(previewBtn);
  }
  buildPopover();
  buildStrip();
  buildChip();
  /* A phone's toolbar is fixed to the screen's foot; some states let the pane
     run under it. --b3d-dock is how far, so the strip stands clear of it. */
  const measureDock = () => {
    const dock = document.querySelector(".ps-dock"), body = document.body.classList;
    let under = 0;
    if (dock && body.contains("pro-compact") && !body.contains("dock-rail")) {
      const a = pane.getBoundingClientRect(), b = dock.getBoundingClientRect();
      if (b.height && a.height) under = Math.max(0, Math.round(a.bottom - b.top));
    }
    pane.style.setProperty("--b3d-dock", under + "px");
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(measureDock).observe(pane);
  window.addEventListener("resize", measureDock);
  const relabel = () => { labelPopover(); labelStrip(); lastChip = ""; updateBuild3DUI(); };
  relabel();
  onLangChange(relabel);
  window.addEventListener("build3d:prefs", syncPopover);
  window.addEventListener("planner-tool", () => updateBuild3DUI());
}

/** Cheap: only touches the DOM when what it shows changed. */
export function updateBuild3DUI(hidden) {
  if (!pane) return;
  const in3D = !hidden && document.documentElement.dataset.plannerViewport === "3d";
  const fit = fitCabDraftView();
  const chain = in3D ? chainState(S, !!(fit && fit.dragging)) : null;
  const compact = document.body.classList.contains("pro-compact");
  const bar = in3D && !chain ? selectionBar(S, compact, selectionOnWallReady(), onWallByType) : null;
  const key = chain ? [chain.kind, chain.finish, chain.undo, chain.cancel].join()
    : bar ? ["sel", bar.rotate, bar.flip, bar.onWall, bar.onWallOn, bar.dup, bar.del, bar.design, bar.note].join() : "";
  if (key !== lastStrip) {
    lastStrip = key;
    strip.hidden = !key;
    stripButtons.finish.hidden = !(chain && chain.finish);
    stripButtons.undo.hidden = !(chain && chain.undo);
    stripButtons.cancel.hidden = !(chain && chain.cancel);
    stripButtons.design.hidden = !(bar && bar.design);
    syncSelectionBar(bar);
  }
  // the Round-6 phone layout hides the navigation bar: the chip carries Display there
  if (chipPreview.hidden === compact) chipPreview.hidden = !compact;
  const fam = in3D && S.tool === "fitcab";
  if (chipFamily.hidden === fam) chipFamily.hidden = !fam;
  const text = in3D ? hintText() : "";
  if (text !== lastChip) {
    lastChip = text;
    chipText.textContent = text;
    chip.hidden = !text;
    if (!text && pop && !pop.hidden && pop.classList.contains("b3d-from-chip")) openPopover(false);
  }
}
