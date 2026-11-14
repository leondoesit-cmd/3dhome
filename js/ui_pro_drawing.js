/* Professional drawing VIEW: the construction sheet drawn to the project's
   regional drafting standard (js/drafting_standards.js), shown full-page in
   the work area like the 2D plan, one of the planner's views (Plan · 3D ·
   Dollhouse · Split · Drawing, js/view_modes.js). js/main.js setViewMode
   ("drawing") keeps the plan pane maximized underneath, puts .sheet-view on
   #center-canvas and calls showDrawingView(); any other view takes the class
   off and fires "drawing-view:leave".

   A slim toolbar holds the standard, paper and scale, zoom, Print and
   Download SVG. The page pans and zooms like a document viewer: wheel or
   pinch to zoom about the pointer, drag to pan, double-click or Fit for the
   whole page. It re-renders from the live plan on entry and, debounced, after
   each 2D re-render (an undo, a floor switch, a collaborator's edit).

   The standard is a project setting, S.workspace.draftingStandard (absent =
   automatic: follows the code-check jurisdiction), saved and undone with the
   rest of the workspace like S.workspace.codeProfile. Paper and scale are
   per-print choices and stay in the view. */
import { S } from "./state.js";
import { getLang, t, onLangChange } from "./i18n.js";
import { draftingStandard, draftingStandardIds, IMPERIAL_SCALE_LABELS } from "./drafting_standards.js";
import { draftText } from "./drafting_strings.js";
import { toConstructionSVG, currentDraftingStandard, downloadText } from "./exports_pro.js";
import { printSheetSVG, PAPER_SIZES } from "./sheet_print.js";
import { pushHistory } from "./history.js";
import { onAfterRender } from "./plan2d.js";
import { PX_PER_MM, zoomAbout, fitPage, sheetPageMm } from "./sheet_viewer.js";
import { select } from "./ui_props.js";
import { openSheetInfo } from "./ui_pro_drawing_info.js";

const AUTO = "auto";
const RERENDER_MS = 400;

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  node.dir = "auto";
  return node;
}

function option(value, text) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

export function standardName(std, lang) {
  return (std && std.name && (std.name[lang] || std.name.en)) || "";
}

/* Scales offered for a standard: its own first, then coarser ones for a plan
   too big for them. US scales print as 1/4" = 1'-0". */
export function scaleChoices(std) {
  if (std.imperial) return [48, 96, 192].map((d) => ({ denom: d, label: IMPERIAL_SCALE_LABELS[d] }));
  const list = [...new Set(std.scales.concat([100, 200]))].sort((a, b) => a - b);
  return list.map((d) => ({ denom: d, label: "1:" + d }));
}

/* What the view would print, from its three choices. */
export function sheetFor(choice) {
  const opts = { standard: choice.standard };
  if (choice.paper && choice.paper !== AUTO) opts.paper = choice.paper;
  if (choice.scale && choice.scale !== AUTO) opts.scale = Number(choice.scale);
  if (choice.furniture) opts.furniture = true;
  return toConstructionSVG(opts);
}

const V = { pane: null, active: false, svg: "", page: null, view: { zoom: 1, x: 0, y: 0 }, fitted: false, timer: 0, hooked: false, furniture: false, picked: null };

const resolve = (id) => currentDraftingStandard({ workspace: { ...(S.workspace || {}), draftingStandard: id === AUTO ? undefined : id } });

function applyView() {
  const svg = V.pane && V.pane.querySelector(".sheet-page > svg");
  if (!svg || !V.page) return;
  const { zoom, x, y } = V.view;
  svg.setAttribute("width", (V.page.w * zoom).toFixed(1));
  svg.setAttribute("height", (V.page.h * zoom).toFixed(1));
  const page = svg.parentNode;
  page.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  V.pane.querySelector(".sheet-zoom-label").textContent = Math.round((zoom / PX_PER_MM) * 100) + "%";
}

/* Zoom so a paper millimetre is a millimetre on screen (CSS 96 dpi). */
function actualSize() {
  const port = V.pane.querySelector(".sheet-viewport");
  zoomBy(PX_PER_MM / V.view.zoom, port.clientWidth / 2, port.clientHeight / 2);
}

function fit() {
  const port = V.pane && V.pane.querySelector(".sheet-viewport");
  if (!port || !V.page || !port.clientWidth) return;
  V.view = fitPage(V.page, port.clientWidth, port.clientHeight);
  V.fitted = true;
  applyView();
}

function zoomBy(factor, cx, cy) {
  const port = V.pane.querySelector(".sheet-viewport");
  if (cx == null) { cx = port.clientWidth / 2; cy = port.clientHeight / 2; }
  V.view = zoomAbout(V.view, factor, cx, cy);
  V.fitted = false;
  applyView();
}

function control(name) { return V.pane.querySelector(`[data-sheet="${name}"]`); }

function fillChoices() {
  const std = resolve(control("standard").value);
  const paper = control("paper"), scale = control("scale");
  const keepPaper = paper.value, keepScale = scale.value;
  paper.textContent = "";
  paper.appendChild(option(AUTO, draftText("pro_drawing_best_fit")));
  std.papers.filter((p) => PAPER_SIZES[p]).forEach((p) => paper.appendChild(option(p, p.replace(/^Arch/, "Arch "))));
  scale.textContent = "";
  scale.appendChild(option(AUTO, draftText("pro_drawing_best_fit")));
  scaleChoices(std).forEach((s) => scale.appendChild(option(String(s.denom), s.label)));
  paper.value = [...paper.options].some((o) => o.value === keepPaper) ? keepPaper : AUTO;
  scale.value = [...scale.options].some((o) => o.value === keepScale) ? keepScale : AUTO;
}

function fillSources(std) {
  const box = V.pane.querySelector(".sheet-sources");
  box.textContent = "";
  box.appendChild(el("summary", draftText("pro_drawing_sources")));
  const body = el("div", null, "sheet-sources-body");
  box.appendChild(body);
  body.appendChild(el("p", draftText("pro_drawing_unverified"), "sheet-note"));
  std.sources.forEach((url) => {
    const link = document.createElement("a");
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    let text = url;
    try { text = decodeURIComponent(url); } catch (e) { text = url; }
    link.textContent = text.slice(0, 90);
    const line = el("div"); line.appendChild(link); body.appendChild(line);
  });
}

/* The Paper and Scale tooltips say why the sheet got its paper and scale
   (js/sheet_print.js layoutWhy, carried on the root as data-*). */
export function layoutReason(attrs, stdName) {
  const A = attrs || {}, parts = [];
  // first-strong isolates keep 1/4" = 1'-0" and "254 × 245" whole inside a Hebrew sentence
  const iso = (v) => "⁨" + v + "⁩";
  const scale = iso(A.label || ("1:" + A.scale));
  if (A.why === "pinned") parts.push(draftText("pro_drawing_why_pinned"));
  else {
    parts.push(draftText("pro_drawing_why_scale", { scale, std: stdName }));
    if (A.why === "finer") parts.push(draftText("pro_drawing_why_finer"));
    parts.push(draftText("pro_drawing_why_paper", { paper: iso(A.paper), need: iso(String(A.need || "").replace("x", " × ")) }));
    if (A.smaller) { const [smaller, room] = String(A.smaller).split(":"); parts.push(draftText("pro_drawing_why_smaller", { smaller: iso(smaller), room: iso(room.replace("x", " × ")) })); }
  }
  if (A.fill) parts.push(draftText("pro_drawing_why_fill", { fill: Math.round(Number(A.fill) * 100) }));
  return parts.join(" ");
}

function explainLayout(std) {
  const root = V.pane.querySelector(".sheet-page > svg");
  if (!root) return;
  const pick = (k) => root.getAttribute("data-" + k);
  const sel = control("scale"), opt = sel && [...sel.options].find((x) => x.value === pick("scale"));
  const text = layoutReason({ why: pick("why"), fill: pick("fill"), need: pick("need"), smaller: pick("smaller"), paper: (pick("paper") || "").replace(/^Arch/, "Arch "), scale: pick("scale"), label: opt ? opt.textContent : null }, standardName(std, getLang()));
  [control("paper"), control("scale")].forEach((c) => { if (c) { c.title = text; c.closest("label").title = text; } });
}

/* Rebuild the sheet from the live plan. Same markup → no DOM work, so the
   debounced re-render after every 2D paint costs one string build. */
function render() {
  if (!V.pane) return;
  // an undo or a loaded project can change the standard under the view
  const pick = control("standard"), saved = S.workspace && S.workspace.draftingStandard;
  const want = saved && draftingStandard(saved) ? saved : AUTO;
  if (pick.value !== want) { pick.value = want; fillChoices(); }
  const std = resolve(pick.value);
  const svg = sheetFor({ standard: std, paper: control("paper").value, scale: control("scale").value, furniture: V.furniture });
  V.pane.dataset.standard = std.id;
  if (svg === V.svg) return;
  const page = sheetPageMm(svg), resized = !V.page || page.w !== V.page.w || page.h !== V.page.h;
  V.svg = svg;
  V.page = page;
  // our own markup: every text it carries went through the sheet's escaping
  V.pane.querySelector(".sheet-page").innerHTML = svg;
  markPicked();
  explainLayout(std);
  fillSources(std);
  if (resized || V.fitted) fit(); else applyView();
}

function scheduleRender() {
  if (!V.active) return;
  clearTimeout(V.timer);
  V.timer = setTimeout(() => { if (V.active) render(); }, RERENDER_MS);
}

function toolbar() {
  const lang = getLang();
  const bar = el("div", null, "sheet-toolbar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", draftText("pro_drawing_title"));
  const select = (name, label) => {
    const s = document.createElement("select");
    s.dataset.sheet = name;
    s.setAttribute("aria-label", label);
    const l = el("label", null, "sheet-field");
    l.append(el("span", label), s);
    bar.appendChild(l);
    return s;
  };
  const std = select("standard", draftText("pro_drawing_standard"));
  // "Automatic: Israel" — the profile's long name in brackets goes in the tooltip
  const autoName = standardName(resolve(AUTO), lang);
  std.appendChild(option(AUTO, draftText("pro_drawing_auto", { name: autoName.replace(/\s*\(.*\)\s*$/, "") })));
  std.title = autoName;
  draftingStandardIds().forEach((id) => std.appendChild(option(id, standardName(draftingStandard(id), lang))));
  const saved = S.workspace && S.workspace.draftingStandard;
  std.value = saved && draftingStandard(saved) ? saved : AUTO;
  select("paper", draftText("pro_drawing_paper"));
  select("scale", draftText("pro_drawing_scale"));
  // loose furniture is off on a working drawing; built-in fixtures always show
  const furn = el("label", null, "sheet-check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.sheet = "furniture";
  box.checked = V.furniture;
  box.addEventListener("change", () => { V.furniture = box.checked; render(); });
  furn.append(box, el("span", draftText("pro_drawing_furniture")));
  bar.appendChild(furn);
  const button = (icon, label, fn, cls) => {
    const b = el("button", null, "sheet-btn" + (cls ? " " + cls : ""));
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i>`;
    if (cls && cls.includes("labelled")) b.appendChild(el("span", label));
    b.addEventListener("click", fn);
    bar.appendChild(b);
    return b;
  };
  bar.appendChild(el("span", null, "sheet-sep"));
  button("ph-magnifying-glass-minus", draftText("pro_drawing_zoom_out"), () => zoomBy(1 / 1.25));
  bar.appendChild(el("span", "100%", "sheet-zoom-label"));
  button("ph-magnifying-glass-plus", draftText("pro_drawing_zoom_in"), () => zoomBy(1.25));
  button("ph-corners-out", draftText("pro_drawing_fit"), fit);
  button("ph-ruler", draftText("pro_drawing_actual"), actualSize, "actual");
  bar.appendChild(el("span", null, "sheet-sep"));
  button("ph-identification-card", draftText("pro_drawing_info"), (ev) => openSheetInfo(ev.currentTarget, render), "labelled");
  button("ph-printer", draftText("pro_drawing_print"), () => printSheetSVG(V.svg, t("sheet_floor_plan")), "labelled primary");
  button("ph-download-simple", draftText("pro_drawing_download"), () => downloadText("home3d-drawing-" + (V.pane.dataset.standard || "sheet") + ".svg", V.svg, "image/svg+xml"), "labelled");
  bar.appendChild(el("details", null, "sheet-sources"));

  std.addEventListener("change", () => {
    // the standard belongs to the project: an undoable edit that also autosaves
    pushHistory(draftText("pro_drawing_standard"));
    if (std.value === AUTO) delete S.workspace.draftingStandard;
    else S.workspace.draftingStandard = std.value;
    fillChoices();
    render();
  });
  bar.querySelector('[data-sheet="paper"]').addEventListener("change", render);
  bar.querySelector('[data-sheet="scale"]').addEventListener("change", render);
  return bar;
}

/* Document-viewer gestures: wheel / ctrl+wheel / pinch zoom about the pointer,
   one-finger or mouse drag pans, double-click fits, keys + − 0 and arrows. */
function wireViewport(port) {
  const pts = new Map();
  let last = null, tap = null;
  const local = (e) => { const r = port.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  port.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e), unit = e.deltaMode === 1 ? 16 : 1;
    zoomBy(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
  }, { passive: false });
  port.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    try { port.setPointerCapture(e.pointerId); } catch (err) { /* a pointer already gone */ }
    pts.set(e.pointerId, local(e));
    last = null;
    tap = pts.size === 1 ? { x: e.clientX, y: e.clientY } : null;
    port.classList.add("dragging");
  });
  port.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), p = local(e);
    pts.set(e.pointerId, p);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 4) tap = null;
    if (pts.size === 1) {
      V.view = { ...V.view, x: V.view.x + p.x - prev.x, y: V.view.y + p.y - prev.y };
      V.fitted = false;
      applyView();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (last) {
        V.view = { ...V.view, x: V.view.x + mid.x - last.mid.x, y: V.view.y + mid.y - last.mid.y };
        if (last.d > 0) V.view = zoomAbout(V.view, d / last.d, mid.x, mid.y);
        V.fitted = false;
        applyView();
      }
      last = { d, mid };
    }
  });
  const up = (e) => {
    if (e.type === "pointerup" && tap && pts.size === 1) pickAt(e.clientX, e.clientY);
    tap = null;
    pts.delete(e.pointerId);
    last = null;
    if (!pts.size) port.classList.remove("dragging");
  };
  port.addEventListener("pointerup", up);
  port.addEventListener("pointercancel", up);
  port.addEventListener("dblclick", fit);
  port.addEventListener("keydown", (e) => {
    const step = 40, keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(1 / 1.25);
    else if (e.key === "0") fit();
    else if (keys[e.key]) {
      V.view = { ...V.view, x: V.view.x + keys[e.key][0], y: V.view.y + keys[e.key][1] };
      V.fitted = false;
      applyView();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
}

/* A tap on the sheet selects the room or opening under it in the planner
   (the inspector beside the view shows it); the sheet marks the pick. */
function pickAt(cx, cy) {
  const hit = document.elementsFromPoint(cx, cy).find((n) => n.closest && n.closest("#view-sheet [data-sel]"));
  const node = hit && hit.closest("[data-sel]");
  const [kind, id] = node ? String(node.getAttribute("data-sel")).split(/:(.*)/s) : [];
  if (kind === "room" && id) select({ kind: "room", ref: id });
  else if (kind === "opening") {
    const op = (S.openings || []).find((o) => String(o.id) === id);
    if (op) select({ kind: "opening", ref: op });
  } else select(null);
  V.picked = node ? node.getAttribute("data-sel") : null;
  markPicked();
}

function markPicked() {
  if (!V.pane) return;
  V.pane.querySelectorAll("[data-picked]").forEach((n) => n.removeAttribute("data-picked"));
  if (!V.picked) return;
  V.pane.querySelectorAll(".hit-rooms [data-sel], .hit-openings [data-sel]").forEach((n) => {
    if (n.getAttribute("data-sel") === V.picked) n.setAttribute("data-picked", "");
  });
}

function buildPane(host) {
  const pane = el("section", null, "sheet-view-pane");
  pane.id = "view-sheet";
  pane.setAttribute("aria-label", draftText("pro_drawing_title"));
  pane.hidden = true;
  V.pane = pane;
  pane.appendChild(toolbar());
  const port = el("div", null, "sheet-viewport");
  port.tabIndex = 0;
  port.setAttribute("role", "img");
  port.setAttribute("aria-label", draftText("pro_drawing_title"));
  port.appendChild(el("div", null, "sheet-page"));
  pane.appendChild(port);
  wireViewport(port);
  host.appendChild(pane);
  if (window.ResizeObserver) new ResizeObserver(() => { if (V.active && V.fitted) fit(); }).observe(port);
  return pane;
}

function hookOnce() {
  if (V.hooked) return;
  V.hooked = true;
  onAfterRender(scheduleRender);
  ["plan-undo", "plan-redo", "layers:changed", "planner-units"].forEach((ev) => window.addEventListener(ev, scheduleRender));
  window.addEventListener("drawing-view:leave", hideDrawingView);
  // labels are built in the toolbar: a new language rebuilds the pane
  onLangChange(() => {
    if (!V.pane) return;
    const host = V.pane.parentNode, wasActive = V.active;
    V.pane.remove();
    V.pane = null; V.svg = ""; V.page = null;
    if (wasActive && host) showDrawingView(host);
  });
}

/* Enter the view (called by js/main.js setViewMode("drawing")). */
export function showDrawingView(host = document.getElementById("center-canvas")) {
  if (!host) return null;
  hookOnce();
  if (!V.pane || !V.pane.isConnected) { V.svg = ""; V.page = null; buildPane(host); }
  V.active = true;
  V.pane.hidden = false;
  // the plan's drawing tools have nothing to draw on here (css dims them)
  document.body.classList.add("sheet-view-on");
  fillChoices();
  V.svg = "";
  V.fitted = true;
  render();
  requestAnimationFrame(() => { if (V.active && V.fitted) fit(); });
  V.pane.querySelector(".sheet-viewport").focus({ preventScroll: true });
  return V.pane;
}

export function hideDrawingView() {
  V.active = false;
  document.body.classList.remove("sheet-view-on");
  clearTimeout(V.timer);
  if (V.pane) V.pane.hidden = true;
}

/* The proDrawing action and menu items: switch to the Drawing view. */
export function openProDrawing() {
  if (typeof window.__setViewMode === "function") window.__setViewMode("drawing");
  else showDrawingView();
  return V.pane;
}
