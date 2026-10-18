// 2D top-down floor plan: view transform + canvas rendering of rooms, walls, openings, items, overlays.
import { S, clamp, fin, hexStr, FILL2D } from "./state.js";
import {
  detectRooms,
  roomFloor,
  roomName,
  roomHidden,
  hiddenSets,
  wallBounds,
  wallGeom,
  wallById,
  contentBounds,
  wallClearLength,
  wallCuts,
  wallOutline,
  wallBandOutline,
  wallPointAt,
  wallTangentAt,
  jointInfo,
  wallDimSide,
  pendingCuts,
  roomsTopologyKey,
  roomEdgeHandles,
  roomByKey,
} from "./geometry.js";
import { ensureWallTypes, normalizeWall, wallLayerBands } from "./wall_types.js";
import {
  resolveWallDrawDefaults, previewCentreline, previewBandPoly, previewLayerBands,
  previewMetrics, hatchSide, offsetGhost, touchDrawing,
} from "./wall_draw.js";
import { normalizeWallKind, curvedWallOutline, pointAtWall, tangentAtWall, makeArcFromThreePoints } from "./wall_curves.js";
import { referenceFloorScene } from "./floors.js";
import { FURN, flabel, isLamp, lampColor, fcolor, itemVSpan, knownVSpan, measureVSpanSoon, vspec } from "./furniture.js";
import { isSmartType, devicePowered } from "./smarthome.js";
import { planCab } from "./cabinet.js";
import { t } from "./i18n.js";
import { SITE, llToLocalCm } from "./site.js";
import { drawMEP, mepAliveCount } from "./mep.js";
import { isElevation, drawElevation, ceilingHeight } from "./elevation.js";
import { drawTouchPrecisionLens } from "./touch_precision.js";
import { getTouchPrecisionPrefs } from "./touch_precision_ui.js";
import { measure4, itemCorners } from "./measure.js";
import { markers, markerItem, markerLabel, hitMarker, markerInfo } from "./markers.js";
import { planIndex } from "./spatial_index.js";
import { activeWarnings } from "./constraint_engine.js";
import {
  wallCons, anchorPos, anchorNode, conSatisfied, conCurrent,
  openingById, openingPos,
} from "./wall_constraints.js";
import {
  sx, sz, wx, wz, planRotRad, toBasePx, rotatePx, unrotatePx, niceScaleCm, fitTransform,
} from "./plan_view.js";
import { blueprintBounds, drawBlueprintUnderlay } from "./blueprint_trace.js";
import { openingCorners, slabOpenings } from "./slab_openings.js";
import { openingHasSwingConflict } from "./swing_clearance.js";
import { cursors, pruneCursors } from "./plan_sync.js";
import { isLayerVisible, isLayerGhosted, isLayerHidden, layerRank } from "./layers.js";
import { itemUserVis, userLayerKey } from "./user_layers.js";
import { roomClearArea } from "./room_area.js";
import { fmtAreaM2, fmtLen, unitLabel } from "./display_units.js";
import { isPresentation, planStyle, planTheme } from "./plan_style.js";
import { patternFill } from "./plan_patterns.js";
import { floorImageFor, floorImageSource } from "./plan_material_fill.js";
import { floorPaintCanvas, floorMeanColor, groundPaintCanvas } from "./primitives.js";
import { itemSprite } from "./plan_sprites.js";
import { spriteMode } from "./plan_sprite_key.js";
import { roomLabelLines, roomLabelFont } from "./plan_labels.js";
import { symbolPrims, stairShape } from "./plan_symbols.js";
import { roomMeasurements } from "./room_summary.js";
import { TILE } from "./state.js";

export {
  sx, sz, wx, wz, planRotRad, toBasePx, rotatePx, dropPoint, centerOn, isOnScreen,
  ensurePointsVisible, niceScaleCm,
} from "./plan_view.js";

export const plan = typeof document !== "undefined" ? document.getElementById("plan") : null;
/* The HUD canvas is stacked over #plan at the same size and transform and has
   pointer-events:none, so every pointer gesture still lands on #plan and no
   listener in js/interaction.js changes. See "the two canvases" below. */
export const planHud = typeof document !== "undefined" ? document.getElementById("plan-hud") : null;
const mc = plan && typeof plan.getContext === "function" ? plan.getContext("2d") : null;
const hc = planHud && typeof planHud.getContext === "function" ? planHud.getContext("2d") : null;
/* The context the draw helpers below write to. Every one of them targets `pc`
   rather than taking a context, so the two passes swap this instead of
   threading an argument through ~40 functions. renderModel()/renderHUD() set
   it on entry; renderHUD() puts it back to the model context on the way out so
   an unexpected caller never paints into the HUD by accident. */
var pc = mc;

function planViewReady() {
  return !!(
    mc &&
    plan &&
    S.SC > 0 &&
    S.CW > 0 &&
    S.CH > 0 &&
    isFinite(S.SC)
  );
}

/* ---- MEP flow animation ----
   A self-perpetuating rAF loop advances a dash offset used by drawMEP to make
   travelling "flow" dashes crawl along live runs. It only runs while the plan
   is visible, the MEP layer + animation are on, and at least one live run
   exists — so an idle or all-dead scene costs nothing. */
let mepFlowPhase = 0;
let mepAnimOn = false;
let mepLastFrame = 0;
const FLOW_SPEED = 0.027; // dash units per millisecond
function prefersReducedMotion() {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}
function mepShouldAnimate() {
  return (
    S.mep &&
    S.mep.show &&
    S.mep.animate !== false &&
    !prefersReducedMotion() && // WCAG 2.3.3 — a static arrow still shows direction
    !isElevation() && // MEP flow only animates in the top-down plan
    mepAliveCount() > 0 &&
    plan.offsetParent !== null // plan pane actually visible (not maximized away)
  );
}
function mepAnimStep(time) {
  if (!mepShouldAnimate()) {
    mepAnimOn = false;
    mepLastFrame = 0;
    /* While the flow animates the whole MEP overlay is drawn on the HUD (see
       mepOnHud); stopping moves it back onto the model canvas, and only a full
       paint can put it there. */
    requestRender2D();
    return;
  }
  // The flow overlay does not need 60 full plan redraws per second. Cap it at
  // ~30fps and advance by elapsed time so animation speed stays stable.
  if (!mepLastFrame || time - mepLastFrame >= 30) {
    var dt = mepLastFrame ? Math.min(80, time - mepLastFrame) : 33;
    mepLastFrame = time;
    mepFlowPhase = (mepFlowPhase + FLOW_SPEED * dt) % 100000;
    requestRenderHUD();
  }
  requestAnimationFrame(mepAnimStep);
}
export function ensureMEPAnim() {
  if (!mepAnimOn && mepShouldAnimate()) {
    mepAnimOn = true;
    requestAnimationFrame(mepAnimStep);
  }
}

/* ---- constraint-warning glow ----
   The same self-perpetuating, self-cancelling loop as the MEP flow above: it
   breathes the halo drawn on loose endpoints and out-of-square joints, and it
   stops the moment the plan is hidden or the last warning is resolved or
   ignored, so a clean plan costs nothing. */
let warnPhase = 0;
let warnAnimOn = false;
let warnLastFrame = 0;
function warnShouldAnimate() {
  return (
    !isElevation() &&
    plan.offsetParent !== null &&
    activeWarnings().length > 0
  );
}
function warnAnimStep(time) {
  if (!warnShouldAnimate()) {
    warnAnimOn = false;
    warnLastFrame = 0;
    return;
  }
  if (!warnLastFrame || time - warnLastFrame >= 45) {
    warnLastFrame = time;
    warnPhase = time / 1000;
    requestRenderHUD();
  }
  requestAnimationFrame(warnAnimStep);
}
function ensureWarnAnim() {
  if (!warnAnimOn && warnShouldAnimate()) {
    warnAnimOn = true;
    requestAnimationFrame(warnAnimStep);
  }
}

var fittingView = false;

export function sizeCanvas() {
  if (!plan || !mc) return;
  var W = plan.clientWidth,
    H = plan.clientHeight,
    dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2);
  /* A hidden pane (3D maximized, or the 2D tab not showing on a phone) reports
     0×0. Writing that into S.CW/S.CH used to destroy the view transform and
     make render2D's grid loop run to Infinity. Keep the last live size. */
  if (!(W > 0) || !(H > 0)) return;

  if (S.CW && S.CH) {
    S.OX += (W - S.CW) / 2;
    S.OY += (H - S.CH) / 2;
  }

  S.CW = W;
  S.CH = H;
  // Assigning even the same canvas size clears pixels and reallocates storage.
  var pixelW = Math.round(W * dpr), pixelH = Math.round(H * dpr);
  if (plan.width !== pixelW) plan.width = pixelW;
  if (plan.height !== pixelH) plan.height = pixelH;
  mc.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* The HUD canvas must be sized and transformed by exactly the same numbers,
     including the dpr clamp above and the 0x0 hidden-pane guard before it:
     the two images are stacked pixel for pixel, so a HUD that disagreed about
     either would draw the selection outline off the object it belongs to. */
  if (planHud && hc) {
    if (planHud.width !== pixelW) planHud.width = pixelW;
    if (planHud.height !== pixelH) planHud.height = pixelH;
    hc.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* fitView can run while the split/chrome shell is still laying itself out.
     If that happened at 0x0, SC used to become the absorbing value 0: later
     resizes kept the canvas size but zoom could never recover. The first real
     canvas size is therefore also the recovery point. `fittingView` prevents
     the intentional sizeCanvas() call inside fitView() from recursing. */
  if (!fittingView && (!(S.SC > 0) || !isFinite(S.SC))) fitView();
}
export function fitView() {
  fittingView = true;
  sizeCanvas();
  fittingView = false;
  // A hidden/not-yet-laid-out pane must not overwrite a usable transform.
  if (!(S.CW > 0) || !(S.CH > 0)) return false;
  var bb = contentBounds(),
    bp = blueprintBounds(),
    pad = 40;
  if (bp && S.blueprintTrace && S.blueprintTrace.visible !== false) {
    var minx = Math.min(bb.minx, bp.minx), minz = Math.min(bb.minz, bp.minz);
    var maxx = Math.max(bb.maxx, bp.maxx), maxz = Math.max(bb.maxz, bp.maxz);
    // An otherwise-empty starter bounds is synthetic; framing a newly loaded
    // sheet should not reserve a mysterious 4×3 m blank block beside it.
    if (!S.walls.length && !S.items.length) {
      minx = bp.minx; minz = bp.minz; maxx = bp.maxx; maxz = bp.maxz;
    }
    bb = { minx: minx, minz: minz, maxx: maxx, maxz: maxz, w: maxx - minx, d: maxz - minz };
  }
  var tx = fitTransform({ minx: bb.minx, minz: bb.minz, maxx: bb.maxx, maxz: bb.maxz }, S.CW, S.CH,
    { worldPad: pad, minSpan: 50 });
  if (!tx) return false;
  S.SC = tx.sc; S.OX = tx.ox; S.OY = tx.oy;
  return S.SC > 0 && isFinite(S.SC);
}

/* Frame one object/room without throwing away the general Fit command. Tree
   double-click uses this to make hierarchy navigation spatial: click selects,
   double-click also brings the target into view. */
export function frameBounds(bb, pad) {
  if (!bb) return false;
  fittingView = true;
  sizeCanvas();
  fittingView = false;
  if (!(S.CW > 0) || !(S.CH > 0)) return false;
  var minx = Number(bb.minx), minz = Number(bb.minz),
    maxx = Number(bb.maxx), maxz = Number(bb.maxz);
  if (![minx, minz, maxx, maxz].every(isFinite)) return false;
  var tx = fitTransform({ minx: minx, minz: minz, maxx: maxx, maxz: maxz }, S.CW, S.CH,
    pad == null ? 72 : Math.max(0, Number(pad) || 0));
  if (!tx) return false;
  S.SC = tx.sc; S.OX = tx.ox; S.OY = tx.oy;
  return S.SC > 0 && isFinite(S.SC);
}
// Re-center the plan content in the current canvas WITHOUT changing zoom.
// For an explicit "frame the model" action. Resize / split-drag must NOT call
// this: sizeCanvas() already keeps the same world point at the canvas centre,
// so calling this on every size change threw away the user's pan.
export function centerContent() {
  if (!(S.SC > 0) || !isFinite(S.SC)) return;
  var bb = contentBounds();
  S.OX = (S.CW - bb.w * S.SC) / 2 - bb.minx * S.SC;
  S.OY = (S.CH - bb.d * S.SC) / 2 - bb.minz * S.SC;
}
// sx/sz / wx/wz / dropPoint live in js/plan_view.js so the mapping can be
// tested without a canvas.

/* ---- 2D plan view-orientation gizmo (axis indicator + click-to-rotate) ----
   Top-down analog of the 3D ViewCube: an X/Z/Y axis marker that rotates with the
   plan; clicking an axis rotates the plan so that axis points up (N/E/S/W-up),
   centre (Y) resets to north-up. */
var planGizmoNubs = [], planGizmoCompass = null;
export function initPlanGizmo() {
  var host = document.getElementById("view-2d");
  if (!host || host.querySelector(".plan-gizmo")) return;
  var NS = "http://www.w3.org/2000/svg", C = 42, R = 20;
  var el = document.createElement("div");
  el.className = "view-gizmo plan-gizmo";
  el.setAttribute("data-i18n-title", "gizmoHint2d");
  el.title = "Click an axis to view that elevation · center = top (plan)";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 84 84");

  var compass = document.createElementNS(NS, "g");
  compass.setAttribute("class", "gz-compass");
  compass.setAttribute("title", "North (click to reset)");

  var ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", C); ring.setAttribute("cy", C); ring.setAttribute("r", 35.5);
  ring.setAttribute("class", "gz-compass-ring");
  compass.appendChild(ring);

  var nPoly = document.createElementNS(NS, "polygon");
  nPoly.setAttribute("points", "42,1.5 38.5,6.5 45.5,6.5");
  nPoly.setAttribute("fill", "#e0564f");
  compass.appendChild(nPoly);

  var nCirc = document.createElementNS(NS, "circle");
  nCirc.setAttribute("cx", 42); nCirc.setAttribute("cy", 8.5); nCirc.setAttribute("r", 5);
  nCirc.setAttribute("fill", "#c0563b"); nCirc.setAttribute("stroke", "#ffffff"); nCirc.setAttribute("stroke-width", 1);
  compass.appendChild(nCirc);

  var nTxt = document.createElementNS(NS, "text");
  nTxt.setAttribute("x", 42); nTxt.setAttribute("y", 8.5); nTxt.setAttribute("dy", 2.6);
  nTxt.setAttribute("text-anchor", "middle");
  nTxt.setAttribute("class", "gz-lbl gz-north-lbl");
  nTxt.textContent = "N";
  compass.appendChild(nTxt);

  var sTick = document.createElementNS(NS, "line");
  sTick.setAttribute("x1", 42); sTick.setAttribute("y1", 74.5); sTick.setAttribute("x2", 42); sTick.setAttribute("y2", 78);
  sTick.setAttribute("class", "gz-compass-tick s-tick");
  compass.appendChild(sTick);
  var eTick = document.createElementNS(NS, "line");
  eTick.setAttribute("x1", 74.5); eTick.setAttribute("y1", 42); eTick.setAttribute("x2", 78); eTick.setAttribute("y2", 42);
  eTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(eTick);
  var wTick = document.createElementNS(NS, "line");
  wTick.setAttribute("x1", 6); wTick.setAttribute("y1", 42); wTick.setAttribute("x2", 9.5); wTick.setAttribute("y2", 42);
  wTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(wTick);

  compass.addEventListener("click", function (e) {
    e.stopPropagation();
    S.planRot = 0;
    S.viewAxis = "top";
    render2D();
    updatePlanGizmo();
  });
  svg.appendChild(compass);
  planGizmoCompass = compass;

  var g = document.createElementNS(NS, "g");
  function line(x2, y2, col) {
    var l = document.createElementNS(NS, "line");
    l.setAttribute("x1", C); l.setAttribute("y1", C); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", col); l.setAttribute("stroke-width", 2); g.appendChild(l);
  }
  line(C + R, C, "#e0564f"); // X
  line(C, C + R, "#4f8cf6"); // Z
  planGizmoNubs = [];

  function nub(x, y, col, label, view) {
    var grp = document.createElementNS(NS, "g");
    grp.setAttribute("class", "gz-nub");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", label ? 6.5 : 5);
    c.setAttribute("stroke", col);
    grp.appendChild(c);
    var tx = null;
    if (label) {
      tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", x); tx.setAttribute("y", y); tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("dy", "3.0"); tx.setAttribute("class", "gz-lbl"); tx.textContent = label;
      grp.appendChild(tx);
    }
    grp.addEventListener("click", function (e) {
      e.stopPropagation();
      S.viewAxis = view;
      render2D();
      updatePlanGizmo();
    });
    g.appendChild(grp);
    planGizmoNubs.push({ circle: c, text: tx, view: view, col: col, label: label });
  }
  nub(C + R, C, "#e0564f", "X", "right");
  nub(C - R, C, "#e0564f", "", "left");
  nub(C, C + R, "#4f8cf6", "Z", "front");
  nub(C, C - R, "#4f8cf6", "", "back");
  nub(C, C, "#3fa34d", "Y", "top");
  svg.appendChild(g);

  el.appendChild(svg);
  host.appendChild(el);
  updatePlanGizmo();
}
// highlight the active view's nub (filled) vs. inactive (hollow)
export function updatePlanGizmo() {
  var cur = S.viewAxis || "top";
  planGizmoNubs.forEach(function (n) {
    var active = n.view === cur;
    n.circle.setAttribute("fill", active ? n.col : "#fff");
    n.circle.setAttribute("stroke-width", active ? 2.2 : 1.4);
    if (n.text) n.text.style.fill = active ? "#fff" : n.col;
  });
  if (planGizmoCompass) {
    var deg = (S.northAngle || 0) + (S.planRot || 0);
    planGizmoCompass.setAttribute("transform", "rotate(" + deg + " 42 42)");
  }
  /* Load, reset, and axis clicks all land here, so the plan-only wall tools
     disable as soon as the view is an elevation — not only after a later
     toolbar click. */
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("plan:view-axis"));
}

// apply / remove the view-rotation canvas transform around the canvas centre
function pushPlan() {
  var a = planRotRad();
  if (!a) return false;
  pc.save();
  pc.translate(S.CW / 2, S.CH / 2);
  pc.rotate(a);
  pc.translate(-S.CW / 2, -S.CH / 2);
  return true;
}

function rr(x, y, w, h, r) {
  pc.beginPath();
  if (!(w > 0) || !(h > 0)) return;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  pc.moveTo(x + r, y);
  pc.arcTo(x + w, y, x + w, y + h, r);
  pc.arcTo(x + w, y + h, x, y + h, r);
  pc.arcTo(x, y + h, x, y, r);
  pc.arcTo(x, y, x + w, y, r);
  pc.closePath();
}

// Real-world aerial + footprint underlay beneath the plan (js/site.js).
// The aerial is centered on the pin (= content center + offset) and shares the
// site's ground rotation; the footprint polygon is anchored at the same pin.
function drawSiteUnderlay(bb) {
  var st = S.site;
  if (!st || !st.enabled || !st.show2D) return;
  if (!(S.SC > 0) || !isFinite(S.SC)) return;
  var cx = bb.cx + (st.offX || 0),
    cz = bb.cz + (st.offZ || 0);
  pc.save();
  pc.translate(sx(cx), sz(cz));
  // three Y-rotation is CCW from above; canvas +y points down -> negate.
  pc.rotate((-(st.groundRot || 0) * Math.PI) / 180);
  pc.scale(S.SC, S.SC); // work in world-cm inside this transform
  var a = SITE.aerial;
  if (a && a.canvas) {
    pc.globalAlpha = st.opacity != null ? st.opacity : 0.85;
    // nearest-neighbour on heavy upscale keeps drawImage cheap + allocation-free
    pc.imageSmoothingEnabled = (a.wcm * S.SC) / a.canvas.width < 3;
    pc.drawImage(a.canvas, -a.wcm / 2, -a.hcm / 2, a.wcm, a.hcm);
    pc.globalAlpha = 1;
  }
  if (st.footprint && st.footprint.polygonLL && st.lat != null) {
    pc.beginPath();
    st.footprint.polygonLL.forEach(function (p, i) {
      var l = llToLocalCm(p[0], p[1], st.lat, st.lon);
      if (i) pc.lineTo(l.x, l.z);
      else pc.moveTo(l.x, l.z);
    });
    pc.closePath();
    pc.lineWidth = 6 / S.SC; // ~6 device px regardless of zoom
    pc.strokeStyle = "#ff3b6b";
    pc.setLineDash([18 / S.SC, 12 / S.SC]);
    pc.stroke();
    pc.setLineDash([]);
  }
  pc.restore();
}

/* ---- the two canvases: model and HUD ----

   The plan is painted onto two stacked canvases of identical size and
   transform. The MODEL canvas (`#plan`) carries the document — underlay, grid,
   rooms, slab voids, items, walls, openings, nodes, markers, constraint
   annotations — and repaints only when the model or the view transform
   changes. The HUD canvas (`#plan-hud`) carries everything that tracks the
   pointer or animates — selection chrome, rubber bands, snap flash and guides,
   the wall probe, the stack host, the warning glow, remote cursors, the
   measure overlay, the walker — and repaints on its own, over an untouched
   model image.

   The reason is measured, not aesthetic. On a 16-room, 64-wall, 48-item plan
   in headless Chrome the model pass took 3.6 ms and the HUD pass 0.1 ms per
   paint — and only the model half grows with the model. Every frame a
   breathing constraint warning, a snap flash or a drag asks for used to pay
   the whole of that. `renderModel()` and `renderHUD()` are the two halves;
   `render2DNow()` paints both immediately, and the exported `render2D()`
   coalesces into the next frame. */

/* Paint both canvases right now. This is the synchronous painter the exported
   render2D() used to be: the only callers that need it are the ones that read
   the canvas back in the same turn. Everything else should let render2D()
   coalesce. */
export function render2DNow() {
  planIndex.invalidate();
  renderModel();
  renderHUD();
  for (var ei = 0; ei < afterRender.length; ei++) afterRender[ei]();
}

/* ---- paint scheduling ----
   The default is now coalescing. The 319 render2D() call sites in the other 24
   modules used to paint synchronously and immediately, and dragWall alone
   asked for 3.4 of those per pointermove; coalescing takes the same gesture to
   one model paint per frame. Level 2 repaints both canvases,
   level 1 only the HUD; a frame takes the highest level asked for since it
   last ran. While a drag proxy holds the dragged object on the HUD, a level-2
   request is served as a HUD repaint — that is what takes the model canvas
   down to zero paints for a whole gesture. Level 3 is the model paint that
   ignores the proxy, and only setDragProxy/clearDragProxy ask for it: they
   bracket the gesture with the two paints that take the object off the model
   image and put it back. */
var paintLevel = 0, paintQueued = false;
/* Invalidating the shared spatial index (js/spatial_index.js) hangs off the
   paint request, because "the plan needs redrawing" is the one signal every
   model mutation in the app already sends, from every module, without this file
   having to know any of them. Marking stale costs a single store, the rebuild is
   deferred to the next query, and a query only ever comes from a pointer path —
   so a HUD-only frame invalidating nothing of substance costs nothing: an
   animation loop at 22 Hz with no pointer on the canvas never triggers a build.
   It over-invalidates by design. Under-
   invalidating would hand a hit test a corner that is no longer there, which is
   a wrong answer rather than a slow one. */
function schedulePaint(level) {
  planIndex.invalidate();
  if (level > paintLevel) paintLevel = level;
  if (paintQueued) return;
  paintQueued = true;
  var run = function () {
    paintQueued = false;
    var lv = paintLevel;
    paintLevel = 0;
    if (lv >= 3 || (lv >= 2 && !dragProxy)) renderModel();
    renderHUD();
    for (var ei = 0; ei < afterRender.length; ei++) afterRender[ei]();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 16);
}
export function render2D() {
  schedulePaint(dragProxy ? 1 : 2);
}
// Historical name for the same thing: before the default was inverted this was
// the only coalescing entry point, and five call sites inside this file use it.
export function requestRender2D() {
  schedulePaint(dragProxy ? 1 : 2);
}
// A HUD-only frame. The animation loops (MEP flow, warning glow, angle guide)
// and anything else that only moves an overlay ask for this. A single
// unresolved warning breathes at 22 Hz for as long as it goes unresolved, and
// used to redraw every room, wall and item of the plan on each of those frames.
export function requestRenderHUD() {
  schedulePaint(1);
}
/* Model + HUD flattened into one offscreen canvas, for the callers that read
   the plan's pixels back (the 2D PNG export, the video studio's frame grabs).
   Since the split, reading #plan alone would silently export the document
   without any of its selection chrome, guides or cursors. */
export function planImageCanvas() {
  render2DNow();
  if (!plan || typeof document === "undefined") return plan;
  var out = document.createElement("canvas");
  out.width = plan.width;
  out.height = plan.height;
  var ctx = out.getContext("2d");
  ctx.drawImage(plan, 0, 0);
  if (planHud) ctx.drawImage(planHud, 0, 0);
  return out;
}

// Screen-space AABB of the (possibly rotated) canvas corners, in base pixels.
// The grid, the align guides and the overall dimensions all need to span the
// visible area rather than the canvas rect, which is not the same rectangle
// once the plan view is rotated.
function viewExtents() {
  var c0 = toBasePx(0, 0), c1 = toBasePx(S.CW, 0), c2 = toBasePx(0, S.CH), c3 = toBasePx(S.CW, S.CH);
  return {
    bxmin: Math.min(c0.x, c1.x, c2.x, c3.x), bxmax: Math.max(c0.x, c1.x, c2.x, c3.x),
    bymin: Math.min(c0.y, c1.y, c2.y, c3.y), bymax: Math.max(c0.y, c1.y, c2.y, c3.y),
  };
}

/* ---- work-set layer bands ----
   Every group of draws names the layer it belongs to (js/layers.js), so a
   hidden layer costs nothing to skip and a ghosted one is drawn once at low
   alpha instead of in a second colour scheme. Unknown ids and a state with no
   layer table at all fail OPEN — a plan that draws nothing is a far worse
   failure than one that draws a band it could have skipped. */
function bandAlpha(id) {
  if (isLayerVisible(id)) return 1;
  if (isLayerGhosted(id)) return 0.35;
  if (isLayerHidden(id)) return 0;
  return 1;
}
function band(id, draw) {
  var a = bandAlpha(id);
  if (!a) return;
  if (a >= 1) return void draw();
  pc.save();
  pc.globalAlpha = a;
  draw();
  pc.restore();
}

/* Selection chrome (the highlight outline on a selected wall/item/node, the
   wall end grips, the erase-hover red) is drawn by the HUD pass, so the model
   pass runs with `chromeOn` false and draws the same objects plain. The HUD then
   redraws just the selected objects on top, chrome and all. Keying the model
   canvas on the selection instead would put a full model repaint behind every
   click, which is exactly what the split exists to remove. */
var chromeOn = true;

/* ---- drag proxy ----
   For the duration of a gesture the dragged objects are lifted off the model
   canvas and drawn on the HUD, so a whole drag costs zero model repaints. The
   model image goes stale in the ways the drag itself cannot fix (rooms do not
   re-detect under a moving wall) until the gesture ends and clearDragProxy()
   forces a full paint. js/interaction.js owns the calls; see setDragProxy(). */
var dragProxy = null;
function proxied(kind, ref) {
  if (!dragProxy) return false;
  return dragProxy[kind] ? dragProxy[kind].indexOf(ref) !== -1 : false;
}
/* Normalise a selection-shaped argument into the flat per-kind lists the two
   passes test against, and close it under the relationships a drag actually
   moves: a wall drags its two corners, a corner drags every wall on it, and a
   wall carries its openings. Without that closure the moved wall would be
   drawn on the HUD while its own corner dots stayed behind on the model. */
function normalizeProxy(sel) {
  if (!sel) return null;
  var p = { item: [], wall: [], node: [], opening: [] };
  var list = Array.isArray(sel) ? sel : [sel];
  list.forEach(function (s) {
    if (!s) return;
    var refs = s.refs || (s.ref === undefined ? [] : [s.ref]);
    var k = String(s.kind || "").replace(/s$/, "");
    if (k === "item" || k === "wall" || k === "node") {
      refs.forEach(function (r) { if (p[k].indexOf(r) === -1) p[k].push(r); });
    }
  });
  p.wall.forEach(function (w) {
    [w.a, w.b].forEach(function (n) { if (p.node.indexOf(n) === -1) p.node.push(n); });
  });
  S.walls.forEach(function (w) {
    if (p.wall.indexOf(w) === -1 && (p.node.indexOf(w.a) !== -1 || p.node.indexOf(w.b) !== -1))
      p.wall.push(w);
  });
  S.openings.forEach(function (o) {
    var host = wallById(o.wall);
    if (host && p.wall.indexOf(host) !== -1) p.opening.push(o);
  });
  return p;
}
/* Lift `sel` (a selection object, or an array of them) onto the HUD until
   clearDragProxy(). Both ends force one full paint: the first to take the
   object off the model image, the second to put it back. */
export function setDragProxy(sel) {
  var p = normalizeProxy(sel);
  if (!p || (!p.item.length && !p.wall.length && !p.node.length)) return clearDragProxy();
  dragProxy = p;
  schedulePaint(3);
}
export function clearDragProxy() {
  if (!dragProxy) return;
  dragProxy = null;
  schedulePaint(3);
}

/* MEP is all-or-nothing per canvas, and this predicate decides which one.
   drawMEP() cannot be asked for geometry without flow — it collapses a missing
   phase to 0 and strokes the travelling dashes anyway (js/mep.js:1003) — and
   js/mep.js is not this file. So: while the flow animates, the whole overlay
   goes on the HUD, where a 30 Hz flow frame costs a HUD repaint instead of a
   full plan repaint; the rest of the time it sits on the model canvas in its
   proper z-order. The two states are governed by the same predicate that runs
   the animation loop, so they cannot disagree, and mepAnimStep() asks for a
   full paint on its way out to move the overlay back down. */
function mepOnHud() {
  return mepAnimOn && mepShouldAnimate();
}

/* ---- the model pass ---- */
function renderModel() {
  if (!mc || !plan) return;
  pc = mc;
  pc.clearRect(0, 0, S.CW, S.CH);
  if (!planViewReady()) return;
  /* Clip in identity (screen) space BEFORE the plan rotation. Nested clips
     taken after pushPlan() are rotated rectangles, which both miss canvas
     corners and fail to bound a zoomed aerial — the hang that used to OOM
     the tab when the site underlay was drawn unclipped. */
  pc.save();
  pc.beginPath();
  pc.rect(0, 0, S.CW, S.CH);
  pc.clip();
  if (isElevation()) {
    drawElevation(pc); // orthographic side view
    pc.restore();
    return;
  }
  chromeOn = false;
  var rotated = pushPlan(); // rotate the whole plan view (CAD N/E/S/W-up)
  var bb = contentBounds(), ext = viewExtents();
  band("underlay", function () {
    drawSiteUnderlay(bb);
    drawBlueprintUnderlay(pc, sx, sz);
  });
  // a presentation plan is a picture of the house, not a drafting surface
  if (!isPresentation()) drawGrid(ext);
  band("underlay", drawReferenceFloor);
  /* The room polygons and the hidden-set maps are needed by every band below,
     hidden structure included — an item is hidden because its ROOM is, so the
     furniture loop cannot be filtered without them. drawCachedRooms() returns
     the pair it had to compute anyway; when the structure band is hidden and
     never runs, derive them here instead. They are kept for the HUD pass,
     which needs the same `hid` to know whether the selected wall is on screen
     at all. */
  var roomPass = null;
  band("structure", function () {
    roomPass = drawCachedRooms();
    drawSlabOpenings();
  });
  if (!roomPass) {
    var onlyRooms = detectRooms();
    roomPass = { rooms: onlyRooms, hid: hiddenSets(onlyRooms) };
  }
  lastRoomPass = roomPass;
  var hid = roomPass.hid;
  // items: rugs/island first, lamps on top
  band("furniture", function () {
    S.items
      .filter(function (it) {
        return !hid.items[it.id] && !proxied("item", it);
      })
      .sort(function (a, b) {
        return drawRank(a) - drawRank(b);
      })
      .forEach(function (it) { drawItem(it); });
  });
  band("structure", function () {
    if (isPresentation())
      drawPresentationWalls(S.walls.filter(function (w) {
        return !hid.walls[w.id] && !proxied("wall", w);
      }));
    S.walls.forEach(function (w) {
      if (!hid.walls[w.id] && !proxied("wall", w)) drawWall(w);
    });
    S.openings.forEach(function (o) {
      if (!hid.walls[o.wall] && !proxied("opening", o)) drawOpening(o);
    });
    if (!isPresentation()) drawNodes(hid);
  });
  if (!mepOnHud())
    band("mep", function () {
      drawMEP(pc, sx, sz, label, mepFlowPhase, planRotRad());
    });
  band("annotations", function () {
    // placeholder points sit above everything they are measured against
    drawMarkers();
    drawFreeAnnotations();
    drawWallCons();
    // room name + area labels
    if (isPresentation()) drawPresentationRoomLabels(roomPass.rooms);
    else roomPass.rooms.forEach(function (r) {
      var nm = roomName(r.key),
        clearArea = roomClearArea(S, r),
        areaText = clearArea.area == null
          ? t("room_area_reference_short", { area: fmtAreaM2(r.area / 10000) })
          : t("room_area_usable_short", { area: fmtAreaM2(clearArea.area) }),
        isHid = roomHidden(r.key);
      if (nm) label(r.cx, r.cz - 9, nm, isHid ? "#9a9289" : "#33312c", true);
      if (S.showDims)
        label(
          r.cx,
          r.cz + (nm ? 9 : 0),
          areaText,
          isHid ? "#a49c93" : "#46504f",
          !nm,
        );
    });
    if (S.showDims) {
      var wb = wallBounds();
      if (wb) drawOverallDims(wb);
    }
  });
  if (rotated) pc.restore(); // end plan rotation
  pc.restore(); // end screen-space clip
}

// grid — extent = base-frame AABB of the (possibly rotated) canvas corners,
// so lines still cover the visible area after the view is rotated
function drawGrid(ext) {
  pc.strokeStyle = "#e4dcc9";
  pc.lineWidth = 1;
  var step = S.SC < 0.45 ? 100 : 50;
  var gx0 = Math.floor((ext.bxmin - S.OX) / S.SC / step) * step,
    gx1 = (ext.bxmax - S.OX) / S.SC,
    gz0 = Math.floor((ext.bymin - S.OY) / S.SC / step) * step,
    gz1 = (ext.bymax - S.OY) / S.SC;
  var gridSpan = Math.max(gx1 - gx0, gz1 - gz0);
  if (gridSpan / step > 240) step = gridSpan / 240;
  if (!(step > 0) || !isFinite(step) || !isFinite(gx0) || !isFinite(gz0)) return;
  pc.beginPath();
  for (var gx = gx0; gx <= gx1; gx += step) {
    pc.moveTo(sx(gx), ext.bymin);
    pc.lineTo(sx(gx), ext.bymax);
  }
  for (var gz = gz0; gz <= gz1; gz += step) {
    pc.moveTo(ext.bxmin, sz(gz));
    pc.lineTo(ext.bxmax, sz(gz));
  }
  pc.stroke();
}

/* The last room pass the model made. The HUD needs the same hidden-set maps to
   know whether the selected wall is on screen at all, and re-deriving them per
   HUD frame would put detectRooms()/hiddenSets() back in the drag path. Any
   model change repaints the model first, so this is never older than the
   pixels the HUD is drawing over. */
var lastRoomPass = null;
/** The rooms the last render labelled (centre cx / cz in world units): the
    part-code tags keep off their name and area (js/part_code_labels.js). */
export function lastRoomLabels() { return lastRoomPass ? lastRoomPass.rooms : []; }
function roomPassForHUD() {
  if (!lastRoomPass) {
    var rooms = detectRooms();
    lastRoomPass = { rooms: rooms, hid: hiddenSets(rooms) };
  }
  return lastRoomPass;
}

/* The objects the HUD redraws with chrome: whatever is selected, whatever the
   erase tool is hovering, and whatever the drag proxy has lifted off the model
   canvas. The three overlap during a drag (the dragged thing is normally also
   the selected thing) so the lists are deduplicated. */
function chromeSet() {
  var out = { item: [], wall: [], node: [], opening: [], room: [] };
  function add(kind, ref) {
    if (ref == null) return;
    if (out[kind] && out[kind].indexOf(ref) === -1) out[kind].push(ref);
  }
  function fromSel(s) {
    if (!s) return;
    var k = String(s.kind || "").replace(/s$/, "");
    if (!out[k]) return;
    if (s.refs) s.refs.forEach(function (r) { add(k, r); });
    else add(k, s.ref);
  }
  fromSel(S.sel);
  if (S.eraseHover) fromSel(S.eraseHover);
  if (dragProxy) {
    ["item", "wall", "node", "opening"].forEach(function (k) {
      dragProxy[k].forEach(function (r) { add(k, r); });
    });
  }
  // a selected wall's openings ride along, or a dragged wall would leave its
  // door behind on the model canvas
  out.wall.forEach(function (w) {
    S.openings.forEach(function (o) { if (String(o.wall) === String(w.id)) add("opening", o); });
  });
  return out;
}

/* ---- the HUD pass ---- */
function renderHUD() {
  if (!hc || !planHud) return;
  pc = hc;
  pc.clearRect(0, 0, S.CW, S.CH);
  if (!planViewReady() || isElevation()) {
    pc = mc;
    return;
  }
  chromeOn = true;
  pc.save();
  pc.beginPath();
  pc.rect(0, 0, S.CW, S.CH);
  pc.clip();
  var rotated = pushPlan();
  var ext = viewExtents();
  var roomPass = roomPassForHUD(), hid = roomPass.hid;
  var sel = chromeSet();
  // selection chrome, in the model's own z-order: rooms, items, walls,
  // openings, nodes
  if (sel.room.length)
    band("structure", function () {
      roomPass.rooms.forEach(function (r) {
        if (sel.room.indexOf(r.key) === -1) return;
        pc.beginPath();
        r.pts.forEach(function (p, i) {
          var X = sx(p.x), Y = sz(p.z);
          if (i) pc.lineTo(X, Y); else pc.moveTo(X, Y);
        });
        pc.closePath();
        pc.strokeStyle = "#3f6b78";
        pc.lineWidth = 2.5;
        pc.setLineDash([8, 5]);
        pc.stroke();
        pc.setLineDash([]);
      });
    });
  if (sel.item.length)
    band("furniture", function () {
      sel.item.forEach(function (it) {
        if (S.items.indexOf(it) !== -1 && !hid.items[it.id]) drawItem(it);
      });
    });
  if (sel.wall.length || sel.opening.length || sel.node.length)
    band("structure", function () {
      sel.wall.forEach(function (w) {
        if (S.walls.indexOf(w) !== -1 && !hid.walls[w.id]) drawWall(w);
      });
      sel.opening.forEach(function (o) {
        if (!hid.walls[o.wall]) drawOpening(o);
      });
      drawNodes(hid, true);
    });
  // live preview of a manual "open segment" on the selected wall
  if (S.sel && S.sel.kind === "wall" && S.segPreview)
    drawSegPreview(S.sel.ref, S.segPreview);
  // "how far along this wall is the cursor" — above the walls, under everything
  // that is being placed
  drawWallProbe();
  // the piece that just clicked into a snap, blinking so the jump is explained
  drawSnapFlash();
  if (mepOnHud())
    band("mep", function () {
      drawMEP(pc, sx, sz, label, mepFlowPhase, planRotRad());
    });
  ensureMEPAnim();
  drawPlanCursors();
  // constraint-engine warnings: loose endpoints and joints that aren't square
  band("annotations", drawWarnGlow);
  ensureWarnAnim();
  /* The piece the drag is about to land ON (js/stack.js). The plan is a view
     from above, so a stacked piece would otherwise just cover its host with no
     hint that anything happened — this outlines the host and says how high the
     dropped piece will sit, which is the only cue the plan can give about the
     axis it cannot draw. */
  if (S.stackHost && S.items.indexOf(S.stackHost) !== -1) {
    var hc2 = itemCorners(S.stackHost);
    pc.save();
    pc.beginPath();
    hc2.forEach(function (p, i) {
      var X = sx(p.x), Z = sz(p.z);
      if (i) pc.lineTo(X, Z); else pc.moveTo(X, Z);
    });
    pc.closePath();
    pc.fillStyle = "rgba(60,150,235,.16)";
    pc.fill();
    pc.strokeStyle = "rgba(45,130,220,.95)";
    pc.lineWidth = 2;
    pc.setLineDash([6, 4]);
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    label(
      S.stackHost.x,
      S.stackHost.z - 14 / S.SC,
      t("stack_onTop", { h: Math.round(itemVSpan(S.stackHost).hi) }),
      "rgba(45,130,220,.95)",
    );
  }
  // smart-alignment guide lines (while dragging an item)
  if (S.alignX != null || S.alignZ != null) {
    pc.save();
    pc.strokeStyle = "rgba(225,90,70,.85)";
    pc.lineWidth = 1;
    pc.setLineDash([5, 4]);
    if (S.alignX != null) {
      pc.beginPath();
      pc.moveTo(sx(S.alignX), ext.bymin);
      pc.lineTo(sx(S.alignX), ext.bymax);
      pc.stroke();
    }
    if (S.alignZ != null) {
      pc.beginPath();
      pc.moveTo(ext.bxmin, sz(S.alignZ));
      pc.lineTo(ext.bxmax, sz(S.alignZ));
      pc.stroke();
    }
    pc.setLineDash([]);
    pc.restore();
  }
  drawWallAngleGuide();
  ensureAngleGuideAnim();

  // drafting guides while drawing/dragging a wall corner: a dashed run from the
  // corner being aligned WITH to the point being placed, and a ring marking
  // that corner, so it is obvious WHICH corner the endpoint is square to.
  if (S.snapGuides && S.snapGuides.length) {
    pc.save();
    S.snapGuides.forEach(function (gd) {
      var x1 = sx(gd.x1),
        z1 = sz(gd.z1),
        x2 = sx(gd.x2),
        z2 = sz(gd.z2);
      pc.strokeStyle = "rgba(225,90,70,.9)";
      pc.lineWidth = 1.2;
      pc.setLineDash([6, 4]);
      pc.beginPath();
      pc.moveTo(x1, z1);
      pc.lineTo(x2, z2);
      pc.stroke();
      pc.setLineDash([]);
      // the reference corner
      pc.beginPath();
      pc.arc(x1, z1, 5.5, 0, Math.PI * 2);
      pc.stroke();
      pc.fillStyle = "rgba(225,90,70,.28)";
      pc.fill();
      // the point being placed
      pc.beginPath();
      pc.arc(x2, z2, 3.5, 0, Math.PI * 2);
      pc.fillStyle = "rgba(225,90,70,.95)";
      pc.fill();
    });
    pc.restore();
  }
  drawWalker();
  // wall-drawing rubber band — thickness-true ghost on the location line
  if (
    S.tool === "wall" &&
    S.drawing &&
    S.drawFrom != null &&
    S.nodes[S.drawFrom] &&
    S.previewPt
  ) {
    var a = S.nodes[S.drawFrom];
    drawGhostWall(a.x, a.z, S.previewPt.x, S.previewPt.z);
    drawPreviewDims(a, S.previewPt);
    drawAngleArc(a, S.previewPt);
  }
  // Three-point arc-wall rubber band. First choose a through-point; the next
  // move shows the exact circular wall, including its true centre-line length.
  if (S.tool === "arcwall" && S.arcDraft && (S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint) && S.previewPt) {
    var arcStart = S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint, draftArc = S.arcDraft.through
      ? makeArcFromThreePoints(arcStart, S.arcDraft.through, S.previewPt)
      : null;
    pc.save(); pc.strokeStyle = "#3f6b78"; pc.lineWidth = 2; pc.setLineDash([6, 5]); pc.beginPath();
    if (draftArc) {
      var arcSteps = Math.max(12, Math.ceil(draftArc.L / 20));
      for (var ai2 = 0; ai2 <= arcSteps; ai2++) {
        var arcPoint = pointAtWall(draftArc, draftArc.L * ai2 / arcSteps);
        if (ai2) pc.lineTo(sx(arcPoint.x), sz(arcPoint.z)); else pc.moveTo(sx(arcPoint.x), sz(arcPoint.z));
      }
    } else {
      pc.moveTo(sx(arcStart.x), sz(arcStart.z)); pc.lineTo(sx(S.previewPt.x), sz(S.previewPt.z));
    }
    pc.stroke(); pc.setLineDash([]); pc.restore();
    if (S.arcDraft.through) {
      pc.save(); pc.fillStyle = "#e0813a"; pc.beginPath();
      pc.arc(sx(S.arcDraft.through.x), sz(S.arcDraft.through.z), 4, 0, Math.PI * 2); pc.fill(); pc.restore();
    }
    if (draftArc && !touchDrawing()) label(S.previewPt.x, S.previewPt.z - 12 / S.SC,
      planLen(draftArc.L) + "  R" + Math.round(draftArc.radius), "#3f6b78");
  }
  if (S.tool === "rect" || S.tool === "slabvoid") {
    if (S.rectDraft && S.previewPt) {
    var rx0 = Math.min(S.rectDraft.x, S.previewPt.x),
      rz0 = Math.min(S.rectDraft.z, S.previewPt.z),
      rx1 = Math.max(S.rectDraft.x, S.previewPt.x),
      rz1 = Math.max(S.rectDraft.z, S.previewPt.z);
    drawGhostWall(rx0, rz0, rx1, rz0);
    drawGhostWall(rx1, rz0, rx1, rz1);
    drawGhostWall(rx1, rz1, rx0, rz1);
    drawGhostWall(rx0, rz1, rx0, rz0);
    if (!touchDrawing())
      label(
        (rx0 + rx1) / 2,
        (rz0 + rz1) / 2,
        planSize(rx1 - rx0, rz1 - rz0),
        S.tool === "slabvoid" ? "#c45c4a" : "#3f6b78",
      );
    }
  }
  /* The hallway a room drag is proposing, drawn in the gap while the drag is
     still live.
   *
     A dragged room previews itself — it is the thing moving. A corridor does
     not exist yet, so without this the only difference between "this room will
     end up flush" and "this room will end up with a whole hallway built
     between it and that wall" is a distance the eye cannot judge. The outline
     and the highlighted face it reaches to are what make the second one a
     choice rather than a surprise on release. */
  if (S.action === "room" && S.dragRoom && S.dragRoom.corridor) {
    var dc = S.dragRoom.corridor, dcFace = S.dragRoom.dock && S.dragRoom.dock.face;
    pc.save();
    pc.fillStyle = "#e0813a";
    pc.globalAlpha = 0.12;
    pc.beginPath();
    pc.moveTo(sx(dc.x0), sz(dc.z0));
    pc.lineTo(sx(dc.x1), sz(dc.z0));
    pc.lineTo(sx(dc.x1), sz(dc.z1));
    pc.lineTo(sx(dc.x0), sz(dc.z1));
    pc.closePath();
    pc.fill();
    pc.globalAlpha = 1;
    pc.strokeStyle = "#e0813a";
    pc.lineWidth = 1.5;
    pc.setLineDash([6, 4]);
    pc.stroke();
    pc.setLineDash([]);
    if (dcFace) {
      pc.lineWidth = 4;
      pc.globalAlpha = 0.5;
      pc.beginPath();
      if (dcFace.axis === "v") { pc.moveTo(sx(dcFace.at), sz(dcFace.lo)); pc.lineTo(sx(dcFace.at), sz(dcFace.hi)); }
      else { pc.moveTo(sx(dcFace.lo), sz(dcFace.at)); pc.lineTo(sx(dcFace.hi), sz(dcFace.at)); }
      pc.stroke();
    }
    pc.restore();
    if (!touchDrawing()) {
      label((dc.x0 + dc.x1) / 2, (dc.z0 + dc.z1) / 2,
        t("rp_corridor") + " " + planLen(Math.min(dc.x1 - dc.x0, dc.z1 - dc.z0)), "#e0813a");
    }
  }
  /* Room resize handles. A room you have just placed is a rectangle with a
     size, and the obvious way to change that size is to pull its side — but
     only if the sides look pullable. The handle sits at the middle of each
     axis-aligned side with a stub pointing out of the room, and while one is
     being dragged the room's clear size is drawn in the middle of it, because
     the number is the thing being edited. */
  if (S.sel && S.sel.kind === "room" && (!S.viewAxis || S.viewAxis === "top")) {
    var dragging = S.action === "wall" && S.wallDrag && S.wallDrag.edge
      && S.wallDrag.edge.room === S.sel.ref;
    roomEdgeHandles(S.sel.ref).forEach(function (h) {
      var live = dragging && S.wallDrag.wall === h.wall;
      var out = 9 / S.SC;
      pc.save();
      pc.strokeStyle = live ? "#e0813a" : "#3f6b78";
      pc.lineWidth = live ? 3 : 2;
      pc.beginPath();
      pc.moveTo(sx(h.x), sz(h.z));
      pc.lineTo(sx(h.x + h.ux * out), sz(h.z + h.uz * out));
      pc.stroke();
      pc.fillStyle = live ? "#e0813a" : "#fff";
      pc.strokeStyle = "#3f6b78";
      pc.lineWidth = 1.5;
      pc.beginPath();
      pc.arc(sx(h.x), sz(h.z), 4.5, 0, Math.PI * 2);
      pc.fill();
      pc.stroke();
      pc.restore();
    });
    if (dragging && !touchDrawing()) {
      var rr2 = roomByKey(S.sel.ref);
      if (rr2) {
        var bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
        rr2.pts.forEach(function (p) {
          bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x);
          bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z);
        });
        var th = Number(S.wallDrag.wall.thickness) || 10;
        label((bx0 + bx1) / 2, (bz0 + bz1) / 2,
          planSize(bx1 - bx0 - th, bz1 - bz0 - th),
          "#e0813a");
      }
    }
  }
  /* Preset-room ghost. Two things have to be readable at a glance while the
     pointer moves: the rectangle that will be built, and WHAT IT IS ABOUT TO
     DO to the plan it is over. A room that has found a wall to share is drawn
     against a highlighted face — that face becomes one party wall, not two —
     and a corridor dock also outlines the corridor it will build in the gap,
     because otherwise a room that stops 120 cm short looks like a mistake. */
  if (S.tool === "roomstamp" && S.roomGhost) {
    var rmG = S.roomGhost, rr = rmG.rect,
      rmCol = rmG.blocked ? "#c45c4a"
        : rmG.dock ? (rmG.dock.mode === "corridor" ? "#e0813a"
          : rmG.dock.mode === "insert" ? "#2f6f8a" : "#2f7d5b") : "#3f6b78";
    if (rmG.dock && rmG.dock.mode === "insert" && !rmG.blocked) {
      pc.save();
      pc.fillStyle = rmCol;
      pc.globalAlpha = 0.14;
      pc.beginPath();
      pc.moveTo(sx(rr.x0), sz(rr.z0));
      pc.lineTo(sx(rr.x1), sz(rr.z0));
      pc.lineTo(sx(rr.x1), sz(rr.z1));
      pc.lineTo(sx(rr.x0), sz(rr.z1));
      pc.closePath();
      pc.fill();
      pc.restore();
    }
    drawGhostWall(rr.x0, rr.z0, rr.x1, rr.z0);
    drawGhostWall(rr.x1, rr.z0, rr.x1, rr.z1);
    drawGhostWall(rr.x1, rr.z1, rr.x0, rr.z1);
    drawGhostWall(rr.x0, rr.z1, rr.x0, rr.z0);
    if (rmG.corridor) {
      var cr = rmG.corridor;
      pc.save();
      pc.strokeStyle = rmCol; pc.lineWidth = 1.5; pc.setLineDash([4, 4]);
      // corner by corner through sx/sz, not strokeRect: the plan view rotates
      pc.beginPath();
      pc.moveTo(sx(cr.x0), sz(cr.z0));
      pc.lineTo(sx(cr.x1), sz(cr.z0));
      pc.lineTo(sx(cr.x1), sz(cr.z1));
      pc.lineTo(sx(cr.x0), sz(cr.z1));
      pc.closePath(); pc.stroke();
      pc.restore();
    }
    if (rmG.dock && !rmG.blocked) {
      var df = rmG.dock.face;
      pc.save();
      if (rmG.connMode === "open") {
        pc.strokeStyle = "#e0813a";
        pc.lineWidth = 5;
        pc.globalAlpha = 0.85;
        pc.setLineDash([6, 4]);
      } else {
        pc.strokeStyle = rmCol;
        pc.lineWidth = 4;
        pc.globalAlpha = 0.5;
      }
      pc.beginPath();
      if (df.axis === "v") { pc.moveTo(sx(df.at), sz(df.lo)); pc.lineTo(sx(df.at), sz(df.hi)); }
      else { pc.moveTo(sx(df.lo), sz(df.at)); pc.lineTo(sx(df.hi), sz(df.at)); }
      pc.stroke(); pc.restore();
    }
    if (!touchDrawing()) {
      var modeSuffix = "";
      if (rmG.dock && !rmG.blocked && rmG.connMode && rmG.connMode !== "auto") {
        var modeKey = "rp_conn_" + rmG.connMode;
        modeSuffix = " · " + (t(modeKey) || rmG.connMode);
      }
      label((rr.x0 + rr.x1) / 2, (rr.z0 + rr.z1) / 2,
        rmG.blocked ? (rmG.blockedReason ? t("rp_failed_short", { reason: rmG.blockedReason }) : t("rp_overlapShort"))
          : planSize(rmG.size.w, rmG.size.d) + modeSuffix, rmCol);
    }
  }
  /* The span about to be bitten out of a wall, drawn over the wall itself in
     the erase colour so it reads as "this much is going", not "this much is
     selected". */
  if (S.biteDraft) {
    var bw2 = wallById(S.biteDraft.wall);
    if (bw2) {
      var bg = wallGeom(bw2);
      var blo = Math.max(0, Math.min(S.biteDraft.s0, S.biteDraft.s1));
      var bhi = Math.min(bg.L, Math.max(S.biteDraft.s0, S.biteDraft.s1));
      var pA = wallPointAt(bw2, blo), pB = wallPointAt(bw2, bhi);
      pc.save();
      pc.strokeStyle = "#c45c4a";
      pc.lineWidth = Math.max(3, (bw2.thickness || 10) * S.SC);
      pc.globalAlpha = 0.55;
      pc.lineCap = "butt";
      pc.beginPath();
      pc.moveTo(sx(pA.x), sz(pA.z));
      pc.lineTo(sx(pB.x), sz(pB.z));
      pc.stroke();
      pc.restore();
      if (!touchDrawing())
        label((pA.x + pB.x) / 2, (pA.z + pB.z) / 2,
          planLen(bhi - blo), "#c45c4a");
    }
  }
  if (S.tool === "walloffset" && S.offsetDraft && S.offsetDraft.hostId != null) {
    var oh = wallById(S.offsetDraft.hostId);
    if (oh) {
      var og = offsetGhost(oh, S.offsetDraft.dist, S.offsetDraft.side || 1);
      if (og) {
        drawGhostWall(og.a.x, og.a.z, og.b.x, og.b.z);
        label((og.a.x + og.b.x) / 2, (og.a.z + og.b.z) / 2,
          planLen(og.dist), "#e0813a");
      }
    }
  }
  if (S.placeType && S.previewPt && FURN[S.placeType]) {
    var spec = FURN[S.placeType],
      hw = (spec.w || 60) / 2,
      hd = (spec.d || 60) / 2;
    pc.save();
    pc.strokeStyle = "rgba(79,70,229,.9)";
    pc.fillStyle = "rgba(79,70,229,.12)";
    pc.lineWidth = 2;
    pc.setLineDash([4, 3]);
    pc.beginPath();
    pc.rect(
      sx(S.previewPt.x - hw),
      sz(S.previewPt.z - hd),
      sx(S.previewPt.x + hw) - sx(S.previewPt.x - hw),
      sz(S.previewPt.z + hd) - sz(S.previewPt.z - hd),
    );
    pc.fill();
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
  }
  drawSnapMark();
  // distance overlay drawn LAST so its labels sit above every other layer
  drawMeasureOverlay();
  /* Resting the cursor on a point reads it out on the spot — the same numbers
     the inspector prints, without spending the selection (so a wall or room you
     were editing stays selected while you check a point). Dead last, after even
     the measurement labels: a card that a room's area label prints through is
     unreadable. Only while idle on the select tool — mid-drag it would trail
     the cursor across the geometry being edited. */
  if (!S.action && S.tool === "select" && !S.placeType) {
    if (S.hoverMarker && markers().indexOf(S.hoverMarker) !== -1)
      markerCard(S.hoverMarker);
    else if (S.hoverNode != null && S.nodes[S.hoverNode]) nodeCard(S.hoverNode);
  }
  if (rotated) pc.restore(); // end plan rotation — overlays below stay screen-fixed
  if (S.showDims) drawScale();
  drawTouchGuide();
  pc.restore(); // end screen-space clip
  pc = mc;
}


if (typeof window !== "undefined")
  window.addEventListener("blueprint:render", function (e) {
    if (e.detail && e.detail.fit) fitView();
    render2D();
  });

/* Overlays that live in the DOM rather than on the canvas (the CAD status bar)
   need to refresh in step with the drawing. Subscribing here rather than
   having them poll is what keeps the numbers on the bar and the numbers on the
   rubber band identical: interaction's pointermove is throttled, so anything
   reading S from its own listener is a frame behind. */
// a slice of furniture pictures finished baking (js/plan_sprites.js)
if (typeof window !== "undefined")
  window.addEventListener("planSpritesReady", function () {
    if (isPresentation()) render2D();
  });
var afterRender = [];
export function onAfterRender(fn) {
  if (typeof fn === "function") afterRender.push(fn);
}

/* Bearing of a segment in whole degrees. Same convention as the inspector's
   ANGLE field (js/ui_props.js): atan2(dz,dx), so 0 = east and a wall running
   UP the plan reads -90. Two angle conventions in one editor is how a user
   ends up not trusting either number, so this must not be "improved" to a
   compass bearing without changing the inspector with it. */
export function segBearing(a, b) {
  return Math.round((Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI);
}

function planLen(cm, options) {
  return fmtLen(cm, Object.assign({ domain: "plan" }, options || {}));
}

function planSize(w, d) {
  return planLen(w, { suffix: false }) + " × " + planLen(d);
}

function fillPoly(pts, fill, stroke) {
  if (!pts || pts.length < 3) return;
  pc.beginPath();
  pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.closePath();
  if (fill) { pc.fillStyle = fill; pc.fill(); }
  if (stroke) { pc.strokeStyle = stroke; pc.lineWidth = 0.7; pc.stroke(); }
}

function drawGhostWall(ax, az, bx, bz) {
  var spec = resolveWallDrawDefaults();
  if (spec.kind === "roomDivider") {
    pc.save();
    pc.strokeStyle = "rgba(91,122,134,.8)";
    pc.lineWidth = 1.6;
    pc.setLineDash([7, 5]);
    pc.beginPath();
    pc.moveTo(sx(ax), sz(az));
    pc.lineTo(sx(bx), sz(bz));
    pc.stroke();
    pc.restore();
    return previewCentreline(ax, az, bx, bz, spec);
  }
  var cl = previewCentreline(ax, az, bx, bz, spec);
  var bands = previewLayerBands(spec);
  pc.save();
  bands.forEach(function (band) {
    fillPoly(previewBandPoly(cl, band.start, band.end), band.color || "rgba(63,107,120,.45)", "rgba(80,73,64,.35)");
  });
  pc.strokeStyle = "rgba(63,107,120,.95)";
  pc.lineWidth = 1.1;
  pc.setLineDash([5, 4]);
  pc.beginPath();
  pc.moveTo(sx(ax), sz(az));
  pc.lineTo(sx(bx), sz(bz));
  pc.stroke();
  pc.setLineDash([]);
  var hs = hatchSide(spec);
  if (hs) {
    var nx = -cl.uz * hs, nz = cl.ux * hs;
    var face = cl.thickness / 2;
    var steps = Math.max(2, Math.floor(cl.L / 18));
    pc.strokeStyle = "rgba(90,82,70,.55)";
    pc.lineWidth = 1;
    for (var i = 1; i < steps; i++) {
      var tt = i / steps;
      var px = cl.a.x + cl.ux * cl.L * tt + nx * face;
      var pz = cl.a.z + cl.uz * cl.L * tt + nz * face;
      pc.beginPath();
      pc.moveTo(sx(px), sz(pz));
      pc.lineTo(sx(px + nx * 8 + cl.ux * 4), sz(pz + nz * 8 + cl.uz * 4));
      pc.stroke();
    }
  }
  pc.restore();
  return cl;
}

function drawPreviewDims(from, preview) {
  var metrics = previewMetrics(S.drawFrom, preview);
  if (!metrics) return;
  var d = Math.max(0, metrics.length -
    (S.interiorDims !== false ? pendingCuts(S.drawFrom, preview) : 0));
  var turnDeg = Math.round((metrics.turn * 180) / Math.PI);
  var angTxt = metrics.hasPrev
    ? (turnDeg > 0 ? "+" : "") + turnDeg + "°"
    : "∠" + Math.round((metrics.absAng * 180) / Math.PI) + "°";
  /* On a finger, the same numbers ride the draw point (drawTouchReadout); the
     midpoint copy would sit under the hand AND collide with the parallel and
     close-loop labels below. */
  if (!touchDrawing())
    label((from.x + preview.x) / 2, (from.z + preview.z) / 2, planLen(d) + "  " + angTxt, "#3f6b78");
  if (metrics.parallel) {
    var par = metrics.parallel, mx = (from.x + preview.x) / 2, mz = (from.z + preview.z) / 2;
    var ox = mx - par.nx * par.dist, oz = mz - par.nz * par.dist;
    pc.save();
    pc.strokeStyle = "rgba(224,129,58,.8)";
    pc.lineWidth = 1;
    pc.setLineDash([3, 3]);
    pc.beginPath();
    pc.moveTo(sx(mx), sz(mz));
    pc.lineTo(sx(ox), sz(oz));
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    if (!touchDrawing())
      label((mx + ox) / 2, (mz + oz) / 2, planLen(par.abs), "#e0813a");
  }
  if (metrics.close && metrics.close.dist > 8) {
    pc.save();
    pc.strokeStyle = "rgba(63,107,120,.45)";
    pc.lineWidth = 1;
    pc.setLineDash([4, 4]);
    pc.beginPath();
    pc.moveTo(sx(preview.x), sz(preview.z));
    pc.lineTo(sx(metrics.close.x), sz(metrics.close.z));
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    if (!touchDrawing())
      label((preview.x + metrics.close.x) / 2, (preview.z + metrics.close.z) / 2,
        planLen(metrics.close.dist), "#6b8a92");
  }
}

/* A small arc at the origin corner whenever the segment is locked to a
   cardinal-ish bearing — the visual confirmation that the snap took, without
   which a 90.0 and an 89.6 look identical on screen. */
function drawAngleArc(a, p) {
  var brg = segBearing(a, p);
  if (brg % 15 !== 0) return;
  var r = 22,
    X = sx(a.x),
    Y = sz(a.z);
  var to = (brg * Math.PI) / 180;
  pc.save();
  pc.strokeStyle = brg % 90 === 0 ? "#e15a46" : "#3f6b78";
  pc.lineWidth = 1.5;
  pc.beginPath();
  pc.arc(X, Y, r, Math.min(0, to), Math.max(0, to));
  pc.stroke();
  pc.restore();
}

/* Glyph naming WHICH snap caught the point, in the AutoCAD idiom: a square on
   an endpoint, a triangle on a point along a wall, a cross on the grid. Until
   this existed the cursor jumped and you had to infer why — the single most
   common complaint about a snapping editor that gives no feedback. */
function drawSnapMark() {
  var si = S.snapInfo;
  if (!si || !fin(si.x) || !fin(si.z)) return;
  var live =
    S.tool === "wall" ||
    S.tool === "arcwall" ||
    S.tool === "rect" ||
    S.tool === "walloffset" ||
    S.tool === "wallbreak" ||
    S.tool === "wallbite" ||
    S.tool === "walljoin" ||
    S.tool === "wallpaint" ||
    S.tool === "point" ||
    S.action === "node" ||
    S.action === "marker";
  if (!live) return;
  var X = sx(si.x),
    Y = sz(si.z),
    c = "#e15a46",
    r = 6;
  pc.save();
  pc.strokeStyle = c;
  pc.lineWidth = 2;
  pc.beginPath();
  if (si.type === "corner") pc.rect(X - r, Y - r, r * 2, r * 2);
  else if (si.type === "marker" || si.type === "blueprint") {
    // a datum: the endpoint square, turned 45° so the two read apart at a glance
    pc.moveTo(X, Y - r); pc.lineTo(X + r, Y);
    pc.lineTo(X, Y + r); pc.lineTo(X - r, Y);
    pc.closePath();
  } else if (si.type === "itemCorner") {
    // an L, the corner of the footprint it came from
    pc.moveTo(X - r, Y + r); pc.lineTo(X - r, Y - r); pc.lineTo(X + r, Y - r);
  } else if (si.type === "midpoint") pc.arc(X, Y, r, 0, Math.PI * 2);
  else if (si.type === "wall") {
    pc.moveTo(X - r, Y + r);
    pc.lineTo(X, Y - r);
    pc.lineTo(X + r, Y + r);
    pc.closePath();
  } else if (si.type === "perpendicular") {
    pc.rect(X - r, Y - r, r, r);
  } else if (si.type === "intersection" || si.type === "align" || si.type === "angle" ||
             si.type === "ortho" || si.type === "bisector") {
    pc.moveTo(X - r, Y - r);
    pc.lineTo(X + r, Y + r);
    pc.moveTo(X + r, Y - r);
    pc.lineTo(X - r, Y + r);
  } else if (si.type === "extension") {
    pc.setLineDash([3, 2]); pc.arc(X, Y, r, 0, Math.PI * 2);
  } else if (si.type === "close") {
    pc.arc(X, Y, r + 2, 0, Math.PI * 2);
    pc.moveTo(X - r, Y); pc.lineTo(X + r, Y);
    pc.moveTo(X, Y - r); pc.lineTo(X, Y + r);
  } else if (si.type === "hit") {
    pc.moveTo(X - r, Y); pc.lineTo(X + r, Y);
    pc.moveTo(X, Y - r); pc.lineTo(X, Y + r);
    pc.rect(X - r * 0.6, Y - r * 0.6, r * 1.2, r * 1.2);
  } else {
    // grid / free: a light cross, deliberately quieter than a real object snap
    pc.strokeStyle = "rgba(63,107,120,.75)";
    pc.moveTo(X - 4, Y);
    pc.lineTo(X + 4, Y);
    pc.moveTo(X, Y - 4);
    pc.lineTo(X, Y + 4);
  }
  pc.stroke();
  pc.restore();
}

/* What the fingertip is currently authoring: one headline (the number being
   set) and one qualifier at most.  Deliberately short — this rides with the
   draw point, so anything longer would cover the geometry it describes. */
function touchDrawReadout() {
  if (S.tool === "wall" && S.drawing && S.drawFrom != null && S.nodes[S.drawFrom] && S.previewPt) {
    var m = previewMetrics(S.drawFrom, S.previewPt);
    if (!m) return null;
    var len = Math.max(0, m.length -
      (S.interiorDims !== false ? pendingCuts(S.drawFrom, S.previewPt) : 0));
    var turnDeg = Math.round((m.turn * 180) / Math.PI);
    return {
      main: planLen(len),
      sub: m.hasPrev
        ? (turnDeg > 0 ? "+" : "") + turnDeg + "\u00b0"
        : "\u2220" + Math.round((m.absAng * 180) / Math.PI) + "\u00b0",
    };
  }
  if (S.tool === "arcwall" && S.arcDraft && (S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint) && S.previewPt) {
    var a0 = S.nodes[S.arcDraft.startNode] || S.arcDraft.startPoint;
    var arc = S.arcDraft.through ? makeArcFromThreePoints(a0, S.arcDraft.through, S.previewPt) : null;
    if (arc) return { main: planLen(arc.L), sub: "R" + Math.round(arc.radius) };
    return { main: planLen(Math.hypot(S.previewPt.x - a0.x, S.previewPt.z - a0.z)), sub: "" };
  }
  if ((S.tool === "rect" || S.tool === "slabvoid") && S.rectDraft && S.previewPt) {
    return {
      main: planSize(Math.abs(S.previewPt.x - S.rectDraft.x), Math.abs(S.previewPt.z - S.rectDraft.z)),
      sub: "",
    };
  }
  return null;
}

/* How much of the canvas top edge is covered by DOM chrome (the CAD
   instruction bar). Canvas pixels are CSS pixels here — the context is
   pre-scaled by the device ratio — so the two rects compare directly. */
function topReservedPx() {
  if (typeof document === "undefined") return 0;
  var el = document.getElementById("cad-status");
  if (!el || el.hidden || !el.offsetParent) return 0;
  // a quiet bar keeps its box but paints nothing — it reserves no space
  if (el.classList.contains("cad-quiet")) return 0;
  var pr = plan.getBoundingClientRect(), er = el.getBoundingClientRect();
  if (!er.height || er.bottom <= pr.top) return 0;
  return Math.max(0, Math.min(pr.height, er.bottom - pr.top));
}

/* One card, always in the same place relative to the draw point: directly
   above it, so it travels with the cursor exactly the way the cursor travels
   with the finger.  It is the ONLY copy on the canvas — drawPreviewDims and the
   rect/arc labels stand down while a finger is drawing, since three copies of
   "550 cm" printed over each other is what made the old readout unreadable. */
function drawTouchReadout(ox, oy) {
  var r = touchDrawReadout();
  if (!r) return;
  var W = S.CW || plan.width;
  pc.save();
  pc.textBaseline = "middle";
  pc.font = "700 15px system-ui, Arial";
  var mainW = pc.measureText(r.main).width;
  pc.font = "600 12px system-ui, Arial";
  var subW = r.sub ? pc.measureText(r.sub).width + 10 : 0;
  var padX = 10, h = 28, w = padX * 2 + mainW + subW;
  var x = Math.min(Math.max(6, ox - w / 2), W - w - 6);
  /* Above the draw point — unless that puts it behind the CAD instruction bar,
     which is a DOM element painted OVER the canvas: the card would simply
     vanish under it. Then it goes below the point instead. */
  var top = oy - 16 - h;
  if (top < topReservedPx() + 6) top = oy + 16;
  pc.beginPath();
  if (pc.roundRect) pc.roundRect(x, top, w, h, 14);
  else pc.rect(x, top, w, h);
  pc.fillStyle = "rgba(28, 30, 45, 0.92)";
  pc.fill();
  var cy = top + h / 2;
  pc.textAlign = "left";
  pc.fillStyle = "#fff";
  pc.font = "700 15px system-ui, Arial";
  pc.fillText(r.main, x + padX, cy);
  if (r.sub) {
    pc.font = "600 12px system-ui, Arial";
    pc.fillStyle = "rgba(255,255,255,.72)";
    pc.fillText(r.sub, x + padX + mainW + 10, cy);
  }
  pc.restore();
}

export function touchLensDistanceMap(screenX, screenY, preferPreview) {
  var origin = preferPreview && S.previewPt && (S.tool !== "select" || S.placeType)
    ? S.previewPt
    : { x: wx(screenX, screenY), z: wz(screenX, screenY) };
  var out = { up: null, down: null, left: null, right: null };
  var angle = planRotRad(), ca = Math.cos(angle), sa = Math.sin(angle);
  measure4(origin.x, origin.z, null, null, { target: "nearest" }).forEach(function (hit) {
    var screenX = hit.dir.dx * ca - hit.dir.dz * sa;
    var screenY = hit.dir.dx * sa + hit.dir.dz * ca;
    var key = Math.abs(screenX) > Math.abs(screenY)
      ? (screenX < 0 ? "left" : "right")
      : (screenY < 0 ? "up" : "down");
    if (out[key] === null || hit.gap < out[key]) out[key] = hit.gap;
  });
  return out;
}

function touchLensDistances(tc) {
  return touchLensDistanceMap(tc.ox, tc.oy, true);
}

function drawTouchGuide() {
  if (!S.touchContact || S.touchContact.pointerId == null) return;
  var tc = S.touchContact;
  var ox = tc.ox, oy = tc.oy;
  drawTouchPrecisionLens(pc, plan, tc, {
    color: "#4f46e5",
    crosshair: "#e05a46",
    distances: touchLensDistances(tc),
    unitLabel: unitLabel("plan"),
    handedness: getTouchPrecisionPrefs().handedness,
  });
  pc.save();
  pc.beginPath();
  pc.arc(ox, oy, 5, 0, Math.PI * 2);
  pc.strokeStyle = "#4f46e5";
  pc.lineWidth = 1.5;
  pc.stroke();
  pc.restore();

  drawTouchReadout(ox, oy);
}

function drawOverallDims(bb) {
  pc.strokeStyle = "#9a8f78";
  pc.fillStyle = "#6b6356";
  pc.lineWidth = 1;
  pc.lineCap = "butt";
  var off = 18,
    ext = 6;
  var yT = sz(bb.minz) - off,
    xA = sx(bb.minx),
    xB = sx(bb.maxx);
  dimLine(xA, yT, xB, yT, 0, ext, planLen(bb.w, { suffix: false }));
  pc.beginPath();
  pc.moveTo(xA, sz(bb.minz));
  pc.lineTo(xA, yT - ext);
  pc.moveTo(xB, sz(bb.minz));
  pc.lineTo(xB, yT - ext);
  pc.stroke();
  var xL = sx(bb.minx) - off,
    zA = sz(bb.minz),
    zB = sz(bb.maxz);
  dimLine(xL, zA, xL, zB, ext, 0, planLen(bb.d, { suffix: false }));
  pc.beginPath();
  pc.moveTo(sx(bb.minx), zA);
  pc.lineTo(xL - ext, zA);
  pc.moveTo(sx(bb.minx), zB);
  pc.lineTo(xL - ext, zB);
  pc.stroke();
}
// Decide what the distance overlay measures from, and render it. Runs on every
// repaint (drawn last), so it's always visible: it follows the cursor over empty
// floor (point origin) and snaps to an item's clearances when over/selecting one.
function drawMeasureOverlay() {
  if (S.action === "pan" || S.action === "pinch") return;
  if (!(S.SC > 0) || !isFinite(S.SC)) return;
  var origins = [],
    seen = [];
  function add(it, pt, skip) {
    origins.push({ it: it, pt: pt, skip: skip || it || null });
    if (it) seen.push(it);
  }
  // Wall / arc / rectangle tools keep the four-axis overlay on the live
  // cursor, including before the first click: that is when you are choosing
  // where a wall should start, and the CSS crosshair alone does not say how
  // far the nearest walls and objects are. Manual reference walls are also
  // made unmistakable here.
  var draftPt =
    (S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid") && S.previewPt;
  if (draftPt) {
    add(null, S.previewPt);
    drawLiveMeasureCross(S.previewPt.x, S.previewPt.z);
    if (S.measureTarget === "manual") {
      pc.save();
      pc.strokeStyle = "#d6336c";
      pc.lineWidth = 4;
      (S.measureWalls || []).forEach(function (id) {
        var w = wallById(id), g = w && wallGeom(w);
        if (!g) return;
        pc.beginPath(); pc.moveTo(sx(g.a.x), sz(g.a.z)); pc.lineTo(sx(g.b.x), sz(g.b.z)); pc.stroke();
      });
      pc.restore();
    }
  }
  // a selected item always shows its clearances (even mid-drag)
  if (S.sel && S.sel.kind === "item") add(S.sel.ref, null);
  /* Placeholder points are placed precisely so their clearances can be read,
     so they carry the overlay permanently rather than only while hovered —
     that IS the point of a point. `showDims` is the switch for anyone who
     wants a quiet plan. An OCCUPIED point measures from its object's outer
     edges rather than from the point: once something stands there, the useful
     number is the clear space left around the thing, not the distance to a
     dot buried inside it. */
  markers().forEach(function (m) {
    var selM =
      (S.sel && S.sel.kind === "marker" && S.sel.ref === m) || S.hoverMarker === m;
    if (!selM && !S.showDims) return;
    var held = markerItem(m);
    if (!held) add(null, m);
    else if (seen.indexOf(held) === -1) add(held, null);
  });
  // plus the always-on cursor overlay when idle: over an item -> its clearances,
  // over empty floor -> distances from the cursor point itself
  if (!S.action && S.tool === "select") {
    if (S.hoverItem) {
      if (seen.indexOf(S.hoverItem) === -1) add(S.hoverItem, null);
    } else if (S.hoverPt && !hitMarker(S.hoverPt.x, S.hoverPt.z)) {
      // resting the cursor ON a point would draw a second, nearly identical set
      // of leaders over the point's own — and the point's is the better one
      // (it measures past the object standing there)
      add(null, S.hoverPt);
    }
  }
  origins.forEach(function (o) {
    if (o.it) drawMeasureFrom(o.it.x, o.it.z, itemCorners(o.it), o.skip);
    else drawMeasureFrom(o.pt.x, o.pt.z, null, o.skip);
  });
}
// Small CAD-style target at the live drafting point so the four measurement
// axes are visible even before a ray has hit anything.
function drawLiveMeasureCross(ox, oz) {
  var X = sx(ox),
    Y = sz(oz),
    arm = 12;
  pc.save();
  pc.strokeStyle = "rgba(63,107,120,.9)";
  pc.lineWidth = 1.25;
  pc.setLineDash([]);
  pc.beginPath();
  pc.moveTo(X - arm, Y);
  pc.lineTo(X - 3, Y);
  pc.moveTo(X + 3, Y);
  pc.lineTo(X + arm, Y);
  pc.moveTo(X, Y - arm);
  pc.lineTo(X, Y - 3);
  pc.moveTo(X, Y + 3);
  pc.lineTo(X, Y + arm);
  pc.stroke();
  pc.beginPath();
  pc.arc(X, Y, 2.2, 0, 7);
  pc.fillStyle = "rgba(63,107,120,.95)";
  pc.fill();
  pc.restore();
}

// Dashed leaders from an origin (an item's edges, or a bare point when ownCs is
// null) to the nearest object — wall inner face or another item's edge — along
// +x/-x/+z/-z, each labelled with the gap in cm. The distances themselves come
// from measure4 so the inspector can print the very same numbers. Leader lines
// are drawn first, labels afterward so the numbers sit above every leader.
// Wall-drawing tools in "nearest" mode show BOTH the nearest wall and the
// nearest item on each axis, in two colours, because collapsing them to one
// number hid the wall behind a sofa (or the sofa behind a wall).
function drawMeasureFrom(ox, oz, ownCs, skip) {
  var target = S.measureTarget || "nearest";
  var drafting =
    S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid";
  var hits = measure4(ox, oz, ownCs, skip, {
    target: drafting && target === "nearest" ? "both" : target,
    wallIds: S.measureWalls || [],
  });
  var labels = [];
  pc.save();
  pc.lineWidth = 1.5;
  pc.setLineDash([4, 4]);
  hits.forEach(function (r) {
    var d = r.dir;
    var item = r.kind === "item";
    pc.strokeStyle = item ? "rgba(180, 83, 9, 0.75)" : "rgba(63, 107, 120, 0.7)";
    pc.beginPath();
    pc.moveTo(sx(ox + d.dx * r.ownT), sz(oz + d.dz * r.ownT));
    pc.lineTo(sx(ox + d.dx * r.hitT), sz(oz + d.dz * r.hitT));
    pc.stroke();
    labels.push({
      x: ox + d.dx * (r.ownT + r.gap / 2),
      z: oz + d.dz * (r.ownT + r.gap / 2),
      txt: Math.round(r.gap) + "",
      color: item ? "#b45309" : "#3f6b78",
    });
  });
  pc.restore();

  // labels last -> above the leaders and every other layer
  labels.forEach(function (l) {
    label(l.x, l.z, l.txt, l.color, false);
  });
}

/* ---- placeholder points ----
   A crosshair target rather than a plain dot: the four arms are the same four
   axes its clearances are measured along, so the glyph reads as "measured from
   here". Hollow = free, filled = something is standing on it. */
const MK_COL = "#d6336c";
function markerGlyph(X, Y, filled, isSel) {
  var R = isSel ? 9.5 : 8,
    arm = R + (isSel ? 6 : 5);
  pc.save();
  pc.strokeStyle = MK_COL;
  pc.lineWidth = isSel ? 2.2 : 1.6;
  pc.setLineDash([]);
  pc.beginPath();
  pc.moveTo(X - arm, Y);
  pc.lineTo(X - R + 1, Y);
  pc.moveTo(X + R - 1, Y);
  pc.lineTo(X + arm, Y);
  pc.moveTo(X, Y - arm);
  pc.lineTo(X, Y - R + 1);
  pc.moveTo(X, Y + R - 1);
  pc.lineTo(X, Y + arm);
  pc.stroke();
  pc.beginPath();
  pc.arc(X, Y, R, 0, 7);
  pc.fillStyle = filled ? MK_COL : "rgba(255,255,255,.85)";
  pc.fill();
  pc.stroke();
  if (!filled) {
    pc.beginPath();
    pc.arc(X, Y, 2.4, 0, 7);
    pc.fillStyle = MK_COL;
    pc.fill();
  }
  pc.restore();
}
function drawMarkers() {
  // the name sits DIAGONALLY off the glyph: the four axes are already occupied
  // by this point's own clearance labels, and a name on top of a measurement
  // hides the number the point exists to show
  var off = 17 / (S.SC || 1);
  markers().forEach(function (m) {
    var isSel = (S.sel && S.sel.kind === "marker" && S.sel.ref === m) ||
      eraseHover("marker", m);
    markerGlyph(sx(m.x), sz(m.z), !!markerItem(m), isSel);
    // a point up a wall or on the ceiling looks identical from above, so its
    // height rides on the label — otherwise the plan silently lies about it
    var nm = markerLabel(m) + (m.y > 0.5 ? " ↑" + Math.round(m.y) : "");
    label(m.x + off, m.z - off, nm, MK_COL, isSel);
  });
  // ghost of where the next point would land while the tool is armed
  if (S.tool === "point" && S.markerPreview) {
    pc.save();
    pc.globalAlpha = 0.5;
    markerGlyph(sx(S.markerPreview.x), sz(S.markerPreview.z), false, false);
    pc.restore();
  }
}

function drawFreeAnnotations() {
  for (const a of S.annotations || []) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
    const x = sx(a.x), y = sz(a.z), x2 = sx(a.x2), y2 = sz(a.z2);
    pc.save();
    pc.strokeStyle = "#234961"; pc.fillStyle = "#234961"; pc.lineWidth = 1.5;
    pc.font = "12px sans-serif";
    if (a.kind === "note") {
      pc.beginPath(); pc.arc(x, y, 3, 0, Math.PI * 2); pc.fill();
      String(a.text || "Note").split("\n").forEach((line, i) => pc.fillText(line, x + 8, y - 7 + i * 15));
    } else if (a.kind === "symbol") {
      const symbol = a.symbol || "north";
      if (symbol === "north") {
        pc.beginPath(); pc.moveTo(x, y - 22); pc.lineTo(x - 10, y + 10); pc.lineTo(x, y + 5); pc.lineTo(x + 10, y + 10); pc.closePath(); pc.stroke();
        pc.fillText("N", x - 5, y - 27);
      } else if (symbol === "level") {
        pc.beginPath(); pc.moveTo(x - 12, y); pc.lineTo(x + 12, y); pc.moveTo(x, y); pc.lineTo(x + 8, y - 8); pc.lineTo(x + 8, y + 8); pc.closePath(); pc.stroke();
        pc.fillText(a.text || "±0.00", x + 14, y + 4);
      } else {
        pc.beginPath(); pc.arc(x, y, 9, 0, Math.PI * 2); pc.stroke();
        pc.fillText(a.text || "A", x - 4, y + 4);
      }
    } else if (Number.isFinite(a.x2) && Number.isFinite(a.z2)) {
      pc.setLineDash(a.kind === "section" ? [7, 5] : []);
      pc.beginPath(); pc.moveTo(x, y); pc.lineTo(x2, y2); pc.stroke(); pc.setLineDash([]);
      const dx = x2 - x, dy = y2 - y, length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      if (a.kind === "dimension") {
        for (const [px, py] of [[x, y], [x2, y2]]) {
          pc.beginPath(); pc.moveTo(px - nx * 7, py - ny * 7); pc.lineTo(px + nx * 7, py + ny * 7); pc.stroke();
        }
        const distance = Math.hypot(a.x2 - a.x, a.z2 - a.z);
        pc.fillText(a.unit === 'cm' ? Math.round(distance * 10) / 10 + ' cm' : fmtLen(distance, { domain: "plan" }), (x + x2) / 2 + nx * 8, (y + y2) / 2 + ny * 8);
      } else {
        for (const [px, py] of [[x, y], [x2, y2]]) { pc.beginPath(); pc.arc(px, py, 10, 0, Math.PI * 2); pc.stroke(); pc.fillText(a.text || "A", px - 4, py + 4); }
      }
    }
    pc.restore();
  }
}
function drawSlabOpenings() {
  slabOpenings().forEach(function (o) {
    if (!(o.w > 0) || !(o.d > 0)) return;
    var cs = openingCorners(o);
    var isSel = (S.sel && S.sel.kind === "slabvoid" && S.sel.ref === o) ||
      eraseHover("slabvoid", o);
    pc.save();
    pc.beginPath();
    cs.forEach(function (p, i) {
      var X = sx(p.x), Z = sz(p.z);
      if (i) pc.lineTo(X, Z); else pc.moveTo(X, Z);
    });
    pc.closePath();
    pc.fillStyle = isSel ? "rgba(196,92,74,.22)" : "rgba(50,48,44,.14)";
    pc.fill();
    pc.save();
    pc.clip();
    var minx = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var maxx = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
    var minz = Math.min(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    var maxz = Math.max(cs[0].z, cs[1].z, cs[2].z, cs[3].z);
    pc.strokeStyle = isSel ? "rgba(196,92,74,.55)" : "rgba(80,76,70,.4)";
    pc.lineWidth = 1;
    var step = 18 * S.SC, gx, gz;
    var x0 = sx(minx) - 40, x1 = sx(maxx) + 40, z0 = sz(minz) - 40, z1 = sz(maxz) + 40;
    pc.beginPath();
    for (gx = x0 - (z1 - z0); gx < x1; gx += step) {
      pc.moveTo(gx, z0);
      pc.lineTo(gx + (z1 - z0), z1);
    }
    pc.stroke();
    pc.restore();
    pc.strokeStyle = isSel ? "#c45c4a" : "#6a6560";
    pc.lineWidth = isSel ? 2.4 : 1.6;
    pc.setLineDash([6, 4]);
    pc.stroke();
    pc.setLineDash([]);
    pc.restore();
    label(o.x, o.z, o.name || t("sv_void"), isSel ? "#c45c4a" : "#6a6560");
  });
}
function drawPlanCursors() {
  pruneCursors();
  Object.keys(cursors).forEach(function (code) {
    var c = cursors[code];
    if (!c || !fin(c.x) || !fin(c.z)) return;
    var X = sx(c.x), Z = sz(c.z);
    pc.save();
    pc.fillStyle = "#4f46e5";
    pc.beginPath();
    pc.moveTo(X, Z);
    pc.lineTo(X + 11, Z + 4);
    pc.lineTo(X + 4, Z + 11);
    pc.closePath();
    pc.fill();
    pc.strokeStyle = "#fff";
    pc.lineWidth = 1;
    pc.stroke();
    label(c.x + 8 / S.SC, c.z - 8 / S.SC, c.name || code, "#4f46e5");
    pc.restore();
  });
}
/* The hover read-out card for a point: everything the inspector prints, drawn
   next to the glyph so a point can be checked without selecting it. */
function markerCard(m) {
  var info = markerInfo(m, ceilingHeight()),
    held = info.held;
  var lines = [];
  lines.push({ txt: markerLabel(m) + (held ? " · " + flabel(held.type) : ""), head: true });
  lines.push({
    txt:
      planLen(m.x, { suffix: false }) + ", " + planLen(m.z, { suffix: false }) +
      (info.y > 0.5 ? "  ↑" + planLen(info.y, { suffix: false }) : "") +
      "  " + t("mk_sf_" + (m.surface || "floor")),
  });
  var room = info.room ? info.roomName || t("room") : t("mk_outside");
  if (info.near)
    room += "  ·  " + flabel(info.near.item.type) + " " + planLen(info.near.dist);
  lines.push({ txt: room });
  function g(k) {
    return info.dm[k] == null ? "—" : planLen(info.dm[k], { suffix: false });
  }
  lines.push({
    txt: "↑" + g("n") + "  ↓" + g("s") + "  ←" + g("w") + "  →" + g("e") + "  " + unitLabel("plan"),
  });
  if (info.tight.length)
    lines.push({
      txt: t("mk_tight", {
        req: planLen(m.req, { suffix: false }),
        sides: info.tight.map(function (k) { return t("mk_dir_" + k); }).join(", "),
      }),
      warn: true,
    });
  else if (m.req != null) lines.push({ txt: t("mk_req") + ": " + planLen(m.req) });
  if (m.note) lines.push({ txt: m.note });

  infoCard(m.x, m.z, lines);
}

/* Everything a corner has to say, next to the corner: which walls meet here,
   how long they are and which way they run, plus the angle between them —
   flagged when it is neither square nor a straight run, the same complaint the
   warning list makes, at the place the eye already is. */
function nodeCard(ni) {
  var info = jointInfo(ni);
  if (!info) return;
  var lines = [];
  lines.push({
    txt: t("nd_title") + " · " + planLen(info.x, { suffix: false }) + ", " + planLen(info.z, { suffix: false }),
    head: true,
  });
  lines.push({
    txt: info.open ? t("nd_open") : t("nd_walls", { n: info.arms.length }),
    warn: info.open,
  });
  info.arms.forEach(function (arm) {
    lines.push({
      txt:
        t("wall") + " " + arm.wall.id + "  " + planLen(arm.len) +
        "  " + Math.round(arm.ang) + "°",
    });
  });
  info.gaps.forEach(function (g) {
    var deg = Math.round(g.deg * 10) / 10,
      square = Math.abs(deg - 90) < 0.5 || Math.abs(deg - 270) < 0.5,
      straight = Math.abs(deg - 180) < 0.5;
    lines.push({
      txt: g.a.id + " ↔ " + g.b.id + "  " + deg + "°",
      warn: !square && !straight,
    });
  });
  infoCard(info.x, info.z, lines, "#2c5560");
}

/* The card itself: drawn in screen space next to a world point, kept upright
   against plan rotation (same trick as label), and nudged back inside the
   canvas near an edge — a card that runs off the pane is worse than no card. */
function infoCard(wxc, wzc, lines, col) {
  col = col || MK_COL;
  var X = sx(wxc), Y = sz(wzc), a = planRotRad();
  pc.save();
  if (a) { pc.translate(X, Y); pc.rotate(-a); pc.translate(-X, -Y); }
  pc.textBaseline = "middle";
  pc.textAlign = "left";
  var padX = 8, padY = 6, lh = 14, w = 0;
  lines.forEach(function (l) {
    pc.font = (l.head ? "bold 11px" : "10px") + " Arial";
    w = Math.max(w, pc.measureText(l.txt).width);
  });
  var bw = w + padX * 2,
    bh = lines.length * lh + padY * 2,
    bx = X + 16,
    by = Y + 16;
  // flip to the other side of the glyph rather than hang off the pane
  if (bx + bw > (S.CW || plan.width) - 4) bx = X - 16 - bw;
  if (by + bh > (S.CH || plan.height) - 4) by = Y - 16 - bh;
  if (bx < 4) bx = 4;
  if (by < 4) by = 4;
  pc.fillStyle = "rgba(255,255,255,.95)";
  pc.strokeStyle = col;
  pc.lineWidth = 1.2;
  pc.setLineDash([]);
  pc.beginPath();
  pc.rect(bx, by, bw, bh);
  pc.fill();
  pc.stroke();
  lines.forEach(function (l, i) {
    pc.font = (l.head ? "bold 11px" : "10px") + " Arial";
    pc.fillStyle = l.head ? col : l.warn ? "#c92a2a" : "#33312c";
    pc.fillText(l.txt, bx + padX, by + padY + i * lh + lh / 2);
  });
  pc.restore();
}

function dimLine(x0, y0, x1, y1, ax, ay, txt) {
  pc.beginPath();
  pc.moveTo(x0, y0);
  pc.lineTo(x1, y1);
  pc.moveTo(x0 - ax, y0 - ay);
  pc.lineTo(x0 + ax, y0 + ay);
  pc.moveTo(x1 - ax, y1 - ay);
  pc.lineTo(x1 + ax, y1 + ay);
  pc.stroke();
  pc.save();
  pc.font = "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2,
    tw = pc.measureText(txt).width;
  pc.fillStyle = "rgba(255,255,255,.85)";
  pc.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14);
  pc.fillStyle = "#6b6356";
  pc.fillText(txt, mx, my);
  pc.restore();
}
// You-are-here indicator for walk (fpv/tpv) mode: dot + view cone at the
// walker's plan position, pointing where the 3D camera looks. World dir is
// (sin yaw, cos yaw) in (x,z); canvas x→right, z→down maps it 1:1.
function drawWalker() {
  var w = S.walk2D;
  if (!w) return;
  var X = sx(w.x),
    Y = sz(w.z),
    dx = Math.sin(w.yaw),
    dy = Math.cos(w.yaw),
    half = Math.PI / 6, // 30° half-angle view cone
    R = 46;
  pc.save();
  // view cone
  var a0 = Math.atan2(dy, dx) - half,
    a1 = Math.atan2(dy, dx) + half;
  var grad = pc.createRadialGradient(X, Y, 4, X, Y, R);
  grad.addColorStop(0, "rgba(63,107,120,.45)");
  grad.addColorStop(1, "rgba(63,107,120,0)");
  pc.beginPath();
  pc.moveTo(X, Y);
  pc.arc(X, Y, R, a0, a1);
  pc.closePath();
  pc.fillStyle = grad;
  pc.fill();
  // body dot
  pc.beginPath();
  pc.arc(X, Y, 6, 0, 7);
  pc.fillStyle = "#3f6b78";
  pc.fill();
  pc.lineWidth = 2;
  pc.strokeStyle = "#fff";
  pc.stroke();
  pc.restore();
}

// repaint the plan while the user walks/turns in 3D so the indicator tracks
// live (rAF-throttled; walk:look fires on every camera move in walk mode)
var walkRepaintQueued = false;
if (typeof window !== "undefined") {
  window.addEventListener("walk:look", function () {
    if (walkRepaintQueued) return;
    walkRepaintQueued = true;
    requestAnimationFrame(function () {
      walkRepaintQueued = false;
      requestRenderHUD();
    });
  });
}


function drawScale() {
  if (!planViewReady()) return;
  var cm = niceScaleCm(S.SC);
  var w = cm * S.SC,
    x0 = S.CW - w - 16,
    /* The CAD strip is user-movable/resizable and its wrapper is taller than
       the inner status row. Reserving a hard-coded 30px drew the scale card
       underneath the wrapper. Measure the live bottom obstruction and leave
       an 8px visual gutter above it. */
    y0 = S.CH - bottomReservedPx() - 21,
    seg = 4,
    sw = w / seg;
  pc.save();
  pc.fillStyle = "rgba(255,255,255,.7)";
  pc.fillRect(x0 - 6, y0 - 13, w + 12, 26);
  for (var s = 0; s < seg; s++) {
    pc.fillStyle = s % 2 ? "#fff" : "#33312c";
    pc.fillRect(x0 + s * sw, y0 - 4, sw, 5);
  }
  pc.strokeStyle = "#33312c";
  pc.lineWidth = 1;
  pc.strokeRect(x0, y0 - 4, w, 5);
  pc.fillStyle = "#33312c";
  pc.font = "10px Arial";
  pc.textAlign = "left";
  pc.textBaseline = "middle";
  pc.fillText(planLen(cm), x0, y0 + 8);
  pc.restore();
}

function bottomReservedPx() {
  if (typeof document === "undefined" || !plan) return 0;
  var el = document.getElementById("cad-status");
  if (!el || el.hidden || !el.offsetParent) return 0;
  var host = el.closest && el.closest('.pt-panel[data-panel="cad"]');
  if (!host) host = el;
  var pr = plan.getBoundingClientRect(), er = host.getBoundingClientRect();
  if (!er.height || er.top >= pr.bottom || er.bottom < pr.bottom - 10) return 0;
  return Math.max(0, Math.min(pr.height, pr.bottom - er.top));
}
function drawRank(it) {
  return isLamp(it) ? 3 : it.type === "rug" ? 0 : it.type === "island" ? 1 : 2;
}

const ERASE_COL = "#c44c43";
/* Erase-hover red is selection chrome by another name — it tracks the pointer
   — so like every other highlight it is false on the model pass and drawn by
   the HUD pass on top. */
function eraseHover(kind, ref) {
  return !!(chromeOn && S.eraseHover && S.eraseHover.kind === kind && S.eraseHover.ref === ref);
}
function markCol(isSel, isErase, idle) {
  return isSel ? "#3f6b78" : isErase ? ERASE_COL : idle;
}

function drawWall(w) {
  if (!w || !S.nodes[w.a] || !S.nodes[w.b]) return;
  ensureWallTypes(S);
  normalizeWall(w, S);
  var gm = wallGeom(w),
    isSel = chromeOn && S.sel && ((S.sel.kind === "wall" && S.sel.ref === w) ||
      (S.sel.kind === "walls" && S.sel.refs.indexOf(w) !== -1)),
    isErase = eraseHover("wall", w);
  /* Filled as a MITERED quad, not a thick stroke: a stroke can only end square
     across its own direction, which at anything but a right-angle corner
     leaves a wedge of daylight on the outside and a lump on the inside. */
  var col = markCol(isSel, isErase, "#7a7060"),
    kind = normalizeWallKind(w),
    phase = w.phase || "new",
    th = w.thickness || 0;
  if (kind === "roomDivider") {
    pc.save();
    pc.strokeStyle = markCol(isSel, isErase, "rgba(91,122,134,.72)");
    pc.lineWidth = isSel || isErase ? 2.5 : 1.5;
    pc.setLineDash([7, 5]);
    traceWallCentre(w);
    pc.stroke();
    pc.restore();
    return;
  }
  var demolish = phase === "demolition" || phase === "demolish";
  if (isPresentation() && !demolish) {
    /* The model pass filled every wall at once, shadow and all
       (drawPresentationWalls). The HUD redraws a selected wall on top of that
       image, so it paints its own fill — with its openings left open — and
       then the selection outline. */
    if (chromeOn) {
      pc.save();
      clipOutsideOpenings([w]);
      pc.fillStyle = planTheme().wallFill;
      pc.fill(wallPath(w));
      pc.restore();
    }
    if (isSel || isErase) {
      pc.save();
      pc.strokeStyle = isSel ? "#3f6b78" : ERASE_COL;
      pc.lineWidth = 2.3;
      pc.stroke(wallPath(w));
      pc.restore();
    }
  } else if (th * S.SC < 3) {
    pc.lineCap = "butt";
    pc.lineWidth = 3;
    pc.strokeStyle = col;
    traceWallCentre(w);
    pc.stroke();
  } else {
    var bands = wallLayerBands(w, S);
    bands.forEach(function (band) {
      var out = wallBandPolygon(w, band.start, band.end);
      pc.fillStyle = phase === "demolition" || phase === "demolish"
        ? "rgba(194,76,67,.25)"
        : (band.color || col);
      pc.beginPath();
      out.forEach(function (p, i) {
        if (i) pc.lineTo(sx(p.x), sz(p.z));
        else pc.moveTo(sx(p.x), sz(p.z));
      });
      pc.closePath(); pc.fill();
      pc.strokeStyle = "rgba(80,73,64,.35)"; pc.lineWidth = .65; pc.stroke();
    });
    {
      // A stronger perimeter distinguishes the wall from its internal layers.
      var outline = wallOutline(w);
      pc.save();
      pc.strokeStyle = isSel ? "#3f6b78" : isErase ? ERASE_COL :
        phase === "demolition" || phase === "demolish" ? "#b43d35" : "#635b50";
      pc.lineWidth = isSel || isErase ? 2.3 : 1.1;
      if (phase === "demolition" || phase === "demolish") pc.setLineDash([8, 5]);
      pc.beginPath();
      outline.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
      pc.closePath(); pc.stroke(); pc.restore();
    }
  }
  // the half a typed length/angle edit will move: locked pick (solid) or the
  // half merely under the cursor (dashed preview)
  if (isSel) {
    var half = S.wallEditEnd === "a" || S.wallEditEnd === "b" ? S.wallEditEnd : null;
    var locked = !!half || S.wallEditEnd === "mid";
    if (!half && !locked) half = S.wallHoverHalf;
    var mid = { x: (gm.a.x + gm.b.x) / 2, z: (gm.a.z + gm.b.z) / 2 };
    var ends = S.wallEditEnd === "mid" ? ["a", "b"] : half ? [half] : [];
    ends.forEach(function (h) {
      var p = h === "a" ? gm.a : gm.b;
      pc.save();
      pc.lineCap = "butt";
      pc.lineWidth = Math.max(th * S.SC, 3);
      pc.strokeStyle = locked ? "#e0813a" : "rgba(224,129,58,.55)";
      if (!locked) pc.setLineDash([6, 4]);
      pc.beginPath();
      pc.moveTo(sx(mid.x), sz(mid.z));
      pc.lineTo(sx(p.x), sz(p.z));
      pc.stroke();
      pc.restore();
    });
  }
  /* The dimension is drawn ON THE FACE it is measured along (js/geometry.js
     wallDimSide), with a witness tick at each measured end. Which face a
     number belongs to is a real 10 cm question at every corner, so it is shown
     rather than left to be assumed. */
  // a presentation plan is annotated per room, not per wall: the wall's own
  // dimension appears only while it is selected
  if (S.showDims && S.SC > 0.32 && (!isPresentation() || isSel)) {
    var side = wallDimSide(w),
      c = wallCuts(w),
      face = side ? w.thickness / 2 : 0, // centreline dims sit on the wall
      p0 = wallPointAt(w, c.a), p1 = wallPointAt(w, gm.L - c.b),
      t0 = wallTangentAt(w, c.a), t1 = wallTangentAt(w, gm.L - c.b),
      n0 = { x: -t0.z * (side || 1), z: t0.x * (side || 1) },
      n1 = { x: -t1.z * (side || 1), z: t1.x * (side || 1) };
    pc.save();
    pc.strokeStyle = isSel ? "#2c5560" : "rgba(107,99,86,.55)";
    pc.lineWidth = 1;
    pc.beginPath();
    [[p0,n0], [p1,n1]].forEach(function (entry) {
      var p = entry[0], n = entry[1];
      pc.moveTo(sx(p.x + n.x * (face - 1)), sz(p.z + n.z * (face - 1)));
      pc.lineTo(sx(p.x + n.x * (face + 9)), sz(p.z + n.z * (face + 9)));
    });
    var dimSteps = gm.kind === "arc" ? Math.max(12, Math.ceil(gm.L / 25)) : 1;
    for (var di = 0; di <= dimSteps; di++) {
      var ds = c.a + (gm.L - c.a - c.b) * di / dimSteps,
        dp = wallPointAt(w, ds), dt = wallTangentAt(w, ds), dn = { x: -dt.z * (side || 1), z: dt.x * (side || 1) };
      if (di) pc.lineTo(sx(dp.x + dn.x * (face + 4)), sz(dp.z + dn.z * (face + 4)));
      else pc.moveTo(sx(dp.x + dn.x * (face + 4)), sz(dp.z + dn.z * (face + 4)));
    }
    pc.stroke();
    pc.restore();
    /* The selected wall also gets the measured face itself drawn on, end to
       end. "Which line is this number the length of" is the question the whole
       reference-face setting exists to answer, and a witness tick at each end
       only answers it once you already know where to look. A centreline
       dimension (side 0) shows the centreline for the same reason: without it
       the number simply floated over the wall with nothing to point at. */
    if (isSel) {
      pc.save();
      pc.strokeStyle = "#2c5560";
      pc.lineWidth = 2;
      pc.setLineDash(side ? [] : [6, 4]);
      pc.beginPath();
      for (var si = 0; si <= dimSteps; si++) {
        var ss = c.a + (gm.L - c.a - c.b) * si / dimSteps,
          sp = wallPointAt(w, ss), st = wallTangentAt(w, ss), sn = { x: -st.z * (side || 1), z: st.x * (side || 1) };
        if (si) pc.lineTo(sx(sp.x + sn.x * face), sz(sp.z + sn.z * face));
        else pc.moveTo(sx(sp.x + sn.x * face), sz(sp.z + sn.z * face));
      }
      pc.stroke();
      pc.restore();
    }
    var off = face + 12, midS = (c.a + gm.L - c.b) / 2,
      midP = wallPointAt(w, midS), midT = wallTangentAt(w, midS), midN = { x: -midT.z * (side || 1), z: midT.x * (side || 1) };
    label(
      midP.x + midN.x * off,
      midP.z + midN.z * off,
      planLen(wallClearLength(w), { suffix: false }),
      isSel ? "#2c5560" : "#6b6356",
    );
  }
}

/* ---- presentation walls ----
   One dark mass with a soft drop shadow, the way a marketing plan draws the
   structure: every visible wall's outline goes into one path and is filled
   once, so the shadow does not stack darker where two walls overlap at a
   corner. Openings are CLIPPED out rather than painted over afterwards, so the
   floor (and the lawn, at an outside door) shows through them — the technical
   style's knockout rectangle is a flat colour that would sit on top of a
   textured floor like a sticker. Canvas shadows ignore the transform, so the
   light stays in the same screen corner however the plan is rotated. */
function wallPath(w) {
  var path = new Path2D(),
    out = wallOutline(w);
  if (!out || out.length < 3) return path;
  out.forEach(function (p, i) {
    if (i) path.lineTo(sx(p.x), sz(p.z)); else path.moveTo(sx(p.x), sz(p.z));
  });
  path.closePath();
  return path;
}
function openingRectPts(o) {
  var w = wallById(o.wall);
  if (!w) return null;
  var gm = wallGeom(w),
    s0 = clamp(o.s, o.width / 2, gm.L - o.width / 2),
    c = wallPointAt(w, s0), tg = wallTangentAt(w, s0);
  if (!c || !tg) return null;
  var hw = o.width / 2, ht = (w.thickness || 0) / 2 + 1, nx = -tg.z, nz = tg.x;
  return [
    { x: c.x - tg.x * hw - nx * ht, z: c.z - tg.z * hw - nz * ht },
    { x: c.x + tg.x * hw - nx * ht, z: c.z + tg.z * hw - nz * ht },
    { x: c.x + tg.x * hw + nx * ht, z: c.z + tg.z * hw + nz * ht },
    { x: c.x - tg.x * hw + nx * ht, z: c.z - tg.z * hw + nz * ht },
  ];
}
function clipOutsideOpenings(walls) {
  var ids = {};
  walls.forEach(function (w) { ids[w.id] = true; });
  var clip = new Path2D(), any = false;
  clip.rect(-1e5, -1e5, 2e5, 2e5);
  S.openings.forEach(function (o) {
    if (!ids[o.wall]) return;
    var pts = openingRectPts(o);
    if (!pts) return;
    any = true;
    pts.forEach(function (p, i) {
      if (i) clip.lineTo(sx(p.x), sz(p.z)); else clip.moveTo(sx(p.x), sz(p.z));
    });
    clip.closePath();
  });
  if (any) pc.clip(clip, "evenodd");
}
function canvasDpr() {
  return plan && S.CW ? plan.width / S.CW : 1;
}
function drawPresentationWalls(walls) {
  var list = walls.filter(function (w) {
    if (!w || !S.nodes[w.a] || !S.nodes[w.b]) return false;
    var ph = w.phase || "new";
    return normalizeWallKind(w) !== "roomDivider" && ph !== "demolition" && ph !== "demolish";
  });
  if (!list.length) return;
  var th = planTheme(), dpr = canvasDpr(), mass = new Path2D();
  list.forEach(function (w) {
    ensureWallTypes(S);
    normalizeWall(w, S);
    mass.addPath(wallPath(w));
  });
  pc.save();
  clipOutsideOpenings(list);
  pc.shadowColor = th.wallShadow;
  pc.shadowBlur = 9 * dpr;
  pc.shadowOffsetX = 3.5 * dpr;
  pc.shadowOffsetY = 3.5 * dpr;
  pc.fillStyle = th.wallFill;
  pc.fill(mass, "nonzero");
  pc.shadowColor = "transparent";
  pc.strokeStyle = th.wallStroke;
  pc.lineWidth = 0.8;
  pc.stroke(mass);
  pc.restore();
}

function traceWallCentre(w) {
  var g = wallGeom(w), steps = g.kind === "arc" ? Math.max(12, Math.ceil(g.L / 25)) : 1;
  pc.beginPath();
  for (var i = 0; i <= steps; i++) {
    var p = wallPointAt(w, g.L * i / steps);
    if (!p) continue;
    if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
  }
}

function wallBandPolygon(w, from, to) {
  var g = wallGeom(w),
    h = (w.thickness || 0) / 2;
  if (g.kind !== "arc" && Math.abs(from + h) < 0.05 && Math.abs(to - h) < 0.05) {
    var outline = wallOutline(w);
    if (outline && outline.length >= 4) return outline;
  }
  if (g.kind !== "arc") {
    var band = wallBandOutline(w, from, to);
    if (band) return [band.a0, band.b0, band.b1, band.a1];
  }
  var steps = g.kind === "arc" ? Math.max(12, Math.ceil(g.L / 20)) : 1,
    a = [], b = [];
  for (var i = 0; i <= steps; i++) {
    var s = g.L * i / steps, p = wallPointAt(w, s), tng = wallTangentAt(w, s);
    if (!p || !tng) continue;
    var nx = -tng.z, nz = tng.x;
    a.push({ x: p.x + nx * from, z: p.z + nz * from });
    b.push({ x: p.x + nx * to, z: p.z + nz * to });
  }
  return a.concat(b.reverse());
}

/* Room fills are identical across MEP-flow and warning-pulse frames: the
   topology and the view transform have not moved. Paint them onto an offscreen
   layer keyed by that state and blit it, so an idle animated overlay does not
   re-tessellate every enclosure sixty times a second. */
var roomLayer = { key: "", canvas: null, rooms: null, hid: null };
/* A floor image finished loading: drop the cached room layer and repaint. */
function presentationImageReady() {
  roomLayer.key = "";
  render2D();
}
function paintRooms(ctx, rooms, dpr) {
  var pres = isPresentation(),
    view = { OX: S.OX, OY: S.OY, SC: S.SC, dpr: dpr || 1 };
  if (pres) paintPresentationSite(ctx, rooms, view);
  rooms.forEach(function (r) {
    ctx.beginPath();
    r.pts.forEach(function (p, i) {
      var X = sx(p.x),
        Y = sz(p.z);
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    });
    ctx.closePath();
    if (roomHidden(r.key)) {
      ctx.fillStyle = "rgba(150,146,138,.10)";
      ctx.fill();
      ctx.strokeStyle = "#9a9289";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (pres) {
      var ft = roomFloor(r.key) || "wood";
      var rm = S.roomMeta[r.key];
      // a custom finish (library material or uploaded image) is what the room
      // looks like — the floor type underneath is only its fallback
      var img = rm && floorImageFor(rm.floorTex, rm.floorScale);
      ctx.fillStyle = img
        ? patternFill(ctx, "img:" + img.url, function (level) {
            return floorImageSource(img.url, level, presentationImageReady);
          }, floorMeanColor(ft), img.tileCm, view)
        : patternFill(ctx, ft, function (level) {
            return floorPaintCanvas(ft, level);
          }, floorMeanColor(ft), TILE[ft] || 200, view);
      ctx.fill();
    } else {
      ctx.fillStyle = FILL2D[roomFloor(r.key)] || "#efe7d6";
      ctx.fill();
    }
  });
}

/* Lawn round the house and a paving ring hugging its outside, for the
   presentation plan. Painted into the cached room layer, before the rooms, so
   it costs nothing on an ordinary repaint. The ring needs no polygon offset:
   every room outline is stroked wide with round joins, and the rooms painted
   next cover the inside half of that stroke. Skipped under a site aerial, which
   is the real ground. */
var LAWN_MARGIN = 600, PAVE_CM = 110;
function paintPresentationSite(ctx, rooms, view) {
  if (!rooms.length) return;
  if (S.site && S.site.enabled && S.site.show2D) return;
  var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  rooms.forEach(function (r) {
    r.pts.forEach(function (p) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    });
  });
  if (!isFinite(x0)) return;
  var th = planTheme();
  ctx.save();
  ctx.fillStyle = patternFill(ctx, "__lawn", function (level) {
    return groundPaintCanvas(level);
  }, th.lawn, 260, view);
  var lx = sx(x0 - LAWN_MARGIN), lz = sz(z0 - LAWN_MARGIN),
    lw = (x1 - x0 + 2 * LAWN_MARGIN) * S.SC, lh = (z1 - z0 + 2 * LAWN_MARGIN) * S.SC;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(lx, lz, lw, lh, 120 * S.SC);
  else ctx.rect(lx, lz, lw, lh);
  ctx.fill();
  // soft edge between lawn and paving
  ctx.beginPath();
  rooms.forEach(function (r) {
    r.pts.forEach(function (p, i) {
      if (i) ctx.lineTo(sx(p.x), sz(p.z)); else ctx.moveTo(sx(p.x), sz(p.z));
    });
    ctx.closePath();
  });
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(70,60,45,.22)";
  ctx.lineWidth = 2 * PAVE_CM * S.SC + 3;
  ctx.stroke();
  ctx.strokeStyle = patternFill(ctx, "pavers", function (level) {
    return floorPaintCanvas("pavers", level);
  }, floorMeanColor("pavers"), TILE.pavers || 180, view);
  ctx.lineWidth = 2 * PAVE_CM * S.SC;
  ctx.stroke();
  ctx.restore();
}
/* The room fills are cached as a whole bitmap keyed on topology + transform.
   The selected room's dashed outline used to be part of that bitmap and part of
   that key, so clicking a room re-painted every room in the plan; it is HUD
   chrome now, and the key no longer mentions the selection. */
function drawCachedRooms() {
  var rooms = detectRooms();
  var pixelW = plan ? plan.width : S.CW, pixelH = plan ? plan.height : S.CH;
  var key =
    roomsTopologyKey() +
    "|" +
    S.OX +
    "," +
    S.OY +
    "," +
    S.SC +
    "," +
    S.CW +
    "," +
    S.CH +
    "|" +
    rooms
      .map(function (r) {
        var ft = S.roomMeta[r.key] && S.roomMeta[r.key].floorTex;
        // data URLs run to megabytes: their length and tail identify them
        var ftKey = ft ? ft.length + ":" + ft.slice(-24) + ":" + (S.roomMeta[r.key].floorScale || "") : "";
        return r.key + (roomHidden(r.key) ? "h" : "") + (roomFloor(r.key) || "") + ftKey;
      })
      .concat("ul=" + userLayerKey()) // hiddenSets() also answers for user layers
      .join(";") +
    "|" + planStyle() + "|" + (pixelW / (S.CW || 1)) +
    (S.site && S.site.enabled && S.site.show2D ? "|site" : "");
  if (
    roomLayer.key === key &&
    roomLayer.canvas &&
    roomLayer.canvas.width === pixelW &&
    roomLayer.canvas.height === pixelH
  ) {
    pc.drawImage(roomLayer.canvas, 0, 0, S.CW, S.CH);
    return { rooms: roomLayer.rooms, hid: roomLayer.hid };
  }
  var hid = hiddenSets(rooms);
  if (typeof document === "undefined") {
    paintRooms(pc, rooms, 1);
    return { rooms: rooms, hid: hid };
  }
  var c = roomLayer.canvas || document.createElement("canvas");
  if (c.width !== pixelW) c.width = Math.max(1, pixelW);
  if (c.height !== pixelH) c.height = Math.max(1, pixelH);
  var ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(pixelW / S.CW, 0, 0, pixelH / S.CH, 0, 0);
  paintRooms(ctx, rooms, pixelW / (S.CW || 1));
  roomLayer = { key: key, canvas: c, rooms: rooms, hid: hid };
  pc.drawImage(c, 0, 0, S.CW, S.CH);
  return { rooms: rooms, hid: hid };
}

function drawReferenceFloor() {
  var scene = referenceFloorScene(S.workspace);
  if (!scene) return;
  var spatial = scene.spatial || scene,
    nodes = spatial.nodes || [], walls = spatial.walls || [];
  pc.save();
  pc.globalAlpha = .42;
  pc.strokeStyle = "#6b67a8";
  pc.fillStyle = "rgba(107,103,168,.10)";
  pc.setLineDash([7, 5]);
  walls.forEach(function (w) {
    var poly = curvedWallOutline(w, w.thickness || 10, nodes, 20);
    if (!poly.length) return;
    pc.beginPath();
    poly.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
    pc.closePath(); pc.fill(); pc.stroke();
  });
  pc.restore();
}
/* A piece that just snapped blinks for a moment (js/interaction.js sets
   S.snapFlash). Without it the piece simply JUMPS and the editor looks like it
   moved something on its own; with it, the jump has a visible cause. The pulse
   fades out and the last frame clears the flag, so nothing keeps repainting. */
var snapFlashT = 0;
function drawSnapFlash() {
  var f = S.snapFlash;
  if (!f) return;
  var left = f.until - Date.now();
  if (left <= 0) {
    S.snapFlash = null;
    return;
  }
  var it = null;
  for (var i = 0; i < S.items.length; i++)
    if (S.items[i].id === f.id) { it = S.items[i]; break; }
  if (!it) return;
  var pts = itemCorners(it);
  pc.save();
  pc.globalAlpha = Math.max(0, Math.min(1, left / 300));
  pc.strokeStyle = "#e0813a";
  pc.fillStyle = "rgba(224,129,58,.22)";
  pc.lineWidth = 2.4;
  pc.beginPath();
  pts.forEach(function (p, k) {
    if (k) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.closePath();
  pc.fill();
  pc.stroke();
  pc.restore();
  // keep the fade going without owning an animation loop
  if (!snapFlashT)
    snapFlashT = setTimeout(function () {
      snapFlashT = 0;
      requestRenderHUD();
    }, 60);
}

/* A translated chamfer has one angle at each end.  Near the equal-angle locus
   draw both arcs together; before the catch, an arrow says which way to move,
   and after the deliberately weak snap, matching double ticks pulse briefly.
   Keeping this on the canvas (rather than a tooltip at the pointer) lets the
   user watch the actual joints while dragging the wall body. */
/* ---- snapped angle-guide pulse ----
   The matching double ticks breathe (drawWallAngleGuide's `pulse`) while the
   equal-angle snap is held, and through the short confirmation that outlives
   the release, so those frames have to be asked for. Same self-perpetuating,
   self-cancelling rAF loop as the MEP flow and the warning glow near the top of
   this file: it stops the moment the plan is hidden, the snap is let go, or the
   confirmation runs out, so a plan with no live snap costs nothing. The one
   frame it asks for on the way out is what wipes the expired badge off the
   canvas — nothing else is watching the clock. */
let angleGuideAnimOn = false;
let angleGuideLastFrame = 0;
function angleGuideShouldAnimate() {
  var gd = S.wallAngleGuide;
  return (
    !!gd &&
    gd.snapped &&
    !isElevation() &&
    plan.offsetParent !== null &&
    // held mid-drag, or still inside the post-release confirmation
    (S.action === "wall" || gd.until > Date.now())
  );
}
function angleGuideAnimStep(time) {
  if (!angleGuideShouldAnimate()) {
    angleGuideAnimOn = false;
    angleGuideLastFrame = 0;
    // Final frame: drops the guide and clears its ticks. Only needed while one
    // is still on the canvas — an interaction that dropped it already repainted.
    if (S.wallAngleGuide) requestRenderHUD();
    return;
  }
  if (!angleGuideLastFrame || time - angleGuideLastFrame >= 45) {
    angleGuideLastFrame = time;
    requestRenderHUD();
  }
  requestAnimationFrame(angleGuideAnimStep);
}
function ensureAngleGuideAnim() {
  if (!angleGuideAnimOn && angleGuideShouldAnimate()) {
    angleGuideAnimOn = true;
    requestAnimationFrame(angleGuideAnimStep);
  }
}
function drawWallAngleGuide() {
  var gd = S.wallAngleGuide;
  if (!gd || !gd.wall || !gd.pair) return;
  /* The guide is a reference INTO the document. If its wall has gone (deleted,
     undone, or a whole new plan loaded under it) there is nothing left to
     confirm, and drawing on the stale reference would put a badge on a wall the
     user cannot see. */
  if (S.walls.indexOf(gd.wall) === -1) {
    S.wallAngleGuide = null;
    return;
  }
  var lingering = S.action !== "wall" && gd.snapped && gd.until > Date.now();
  if (S.action !== "wall" && !lingering) {
    S.wallAngleGuide = null;
    return;
  }
  var w = gd.wall,
    a = S.nodes[w.a],
    b = S.nodes[w.b],
    pa = S.nodes[gd.pair.a.other],
    pb = S.nodes[gd.pair.b.other];
  if (!a || !b || !pa || !pb) return;
  var pulse = gd.snapped ? 0.72 + 0.28 * Math.sin(Date.now() / 85) : 0.72,
    color = gd.snapped ? "224,129,58" : "63,107,120",
    radius = 25;

  function shortArc(p, q1, q2, angleValue) {
    var s = Math.atan2(q1.z - p.z, q1.x - p.x),
      e = Math.atan2(q2.z - p.z, q2.x - p.x),
      d = e - s;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var X = sx(p.x),
      Y = sz(p.z);
    pc.beginPath();
    pc.arc(X, Y, radius, s, s + d, d < 0);
    pc.stroke();
    var mid = s + d / 2,
      lx = p.x + (Math.cos(mid) * (radius + 13)) / S.SC,
      lz = p.z + (Math.sin(mid) * (radius + 13)) / S.SC;
    label(lx, lz, Math.round(angleValue) + "°", "rgb(" + color + ")");
    if (gd.snapped) {
      // identical double witness ticks on both arcs are the CAD convention for
      // equality; their pulse is the small animation confirming the catch.
      [-2.5, 2.5].forEach(function (off) {
        var rr = radius + off,
          tx = X + Math.cos(mid) * rr,
          ty = Y + Math.sin(mid) * rr,
          nx = Math.cos(mid),
          ny = Math.sin(mid);
        pc.beginPath();
        pc.moveTo(tx - nx * 3.5, ty - ny * 3.5);
        pc.lineTo(tx + nx * 3.5, ty + ny * 3.5);
        pc.stroke();
      });
    }
  }

  pc.save();
  pc.strokeStyle = "rgba(" + color + "," + pulse + ")";
  pc.fillStyle = "rgba(" + color + "," + pulse + ")";
  pc.lineWidth = gd.snapped ? 2.4 : 1.5;
  pc.setLineDash(gd.snapped ? [] : [5, 4]);
  shortArc(a, b, pa, gd.angleA);
  shortArc(b, a, pb, gd.angleB);
  pc.setLineDash([]);

  var mx = (a.x + b.x) / 2,
    mz = (a.z + b.z) / 2;
  if (!gd.snapped) {
    var dl = Math.hypot(gd.correctionX, gd.correctionZ);
    if (dl > 0.001) {
      var ux = gd.correctionX / dl,
        uz = gd.correctionZ / dl,
        X = sx(mx),
        Y = sz(mz),
        ex = X + ux * 22,
        ey = Y + uz * 22;
      pc.beginPath();
      pc.moveTo(X, Y);
      pc.lineTo(ex, ey);
      pc.lineTo(ex - ux * 7 - uz * 4, ey - uz * 7 + ux * 4);
      pc.moveTo(ex, ey);
      pc.lineTo(ex - ux * 7 + uz * 4, ey - uz * 7 - ux * 4);
      pc.stroke();
    }
  }
  pc.restore();
  var wg = wallGeom(w),
    gnx = -wg.uz,
    gnz = wg.ux,
    neighbourMidX = (pa.x + pb.x) / 2,
    neighbourMidZ = (pa.z + pb.z) / 2,
    openSide =
      (neighbourMidX - mx) * gnx + (neighbourMidZ - mz) * gnz > 0 ? -1 : 1,
    badgeOff = (42 * openSide) / S.SC;
  // In split view a wall can sit less than 42 px from the canvas edge. Keep
  // the confirmation visible by using the other face when the open side would
  // be clipped (the larger offset still clears the wall's own dimension).
  var badgeX = mx + gnx * badgeOff,
    badgeZ = mz + gnz * badgeOff,
    badgePx = sx(badgeX),
    badgePy = sz(badgeZ);
  if (badgePx < 24 || badgePx > S.CW - 24 || badgePy < 18 || badgePy > S.CH - 18) {
    badgeOff *= -1;
    badgeX = mx + gnx * badgeOff;
    badgeZ = mz + gnz * badgeOff;
  }
  label(
    badgeX,
    badgeZ,
    gd.snapped
      ? t("snap_symmetry", { a: Math.round(gd.angleA) })
      : t("snap_symmetry_move", { d: Math.max(1, Math.round(Math.abs(gd.angleA - gd.angleB))) }),
    "rgb(" + color + ")",
    gd.snapped,
  );
}

/* Where the cursor sits along the wall it is over, as the pair of distances a
   tape measure would give: start→here and here→end (interior, so the two add up
   to the wall's own label). Drawn for hovering, for dragging a piece and for
   drawing the next wall, because that is exactly when the question comes up. */
function drawWallProbe() {
  var wp = S.wallProbe;
  if (!wp || !wp.wall || S.walls.indexOf(wp.wall) === -1) return;
  var w = wp.wall,
    gm = wallGeom(w);
  var X = sx(wp.x),
    Y = sz(wp.z),
    // the tick across the wall, a little proud of it on both faces
    ext = (w.thickness / 2 + 5) * S.SC,
    nx = -gm.uz * ext,
    nz = gm.ux * ext;
  pc.save();
  pc.strokeStyle = "#e0813a";
  pc.lineWidth = 1.4;
  pc.setLineDash([4, 3]);
  pc.beginPath();
  pc.moveTo(X + nx, Y + nz);
  pc.lineTo(X - nx, Y - nz);
  pc.stroke();
  pc.setLineDash([]);
  pc.restore();
  // each number sits on its own half, offset off the wall so it never covers it
  var off = 16 / (S.SC || 1);
  label(
    (gm.a.x + wp.x) / 2 - gm.uz * off,
    (gm.a.z + wp.z) / 2 + gm.ux * off,
    Math.round(wp.fromA) + "",
    "#b35f19",
  );
  label(
    (wp.x + gm.b.x) / 2 - gm.uz * off,
    (wp.z + gm.b.z) / 2 + gm.ux * off,
    Math.round(wp.toB) + "",
    "#b35f19",
  );
}
function drawOpening(o) {
  var w = wallById(o.wall);
  if (!w) return;
  var gm = wallGeom(w);
  var s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
  var centre = wallPointAt(w, s), tangent = wallTangentAt(w, s);
  if (!centre || !tangent) return;
  var cx = centre.x, cz = centre.z;
  var isSel = (S.sel && S.sel.kind === "opening" && S.sel.ref === o) ||
    eraseHover("opening", o);
  pc.save();
  pc.translate(sx(cx), sz(cz));
  pc.rotate(Math.atan2(tangent.z, tangent.x));
  var hw = (o.width / 2) * S.SC,
    ht = (w.thickness / 2 + 1) * S.SC;
  if (isPresentation()) {
    /* The wall is already open here (clipOutsideOpenings); a door gets a
       pale stone threshold and a window a white sill under its glass. */
    var pth = planTheme(), wt = (w.thickness / 2) * S.SC;
    pc.fillStyle = o.type === "door" ? pth.threshold : pth.sill;
    pc.fillRect(-hw, -wt, hw * 2, wt * 2);
  } else {
    pc.fillStyle = "#efe7d6";
    pc.fillRect(-hw, -ht, hw * 2, ht * 2);
  }
  if (o.type === "door") {
    if (o.isSliding || o.isPocket) {
      var isPocket = !!o.isPocket;
      var py = isPocket ? 0 : 2; // pocket inside wall (0), sliding outside (2)
      
      var spaceLeft = s - o.width / 2;
      var spaceRight = gm.L - (s + o.width / 2);
      var canLeft = spaceLeft >= o.width - 10;
      var canRight = spaceRight >= o.width - 10;
      var slideDir = 1;
      if (o.slideDir === "-1") slideDir = -1;
      else if (o.slideDir === "1") slideDir = 1;
      else slideDir = canRight ? 1 : (canLeft ? -1 : 1);
      
      var spaceError = (slideDir === 1 && !canRight) || (slideDir === -1 && !canLeft);

      pc.fillStyle = "#fff";
      pc.fillRect(-hw, isPocket ? -2 : 0, hw * 2, 4);
      pc.strokeStyle = isSel ? "#3f6b78" : "#5b7a86";
      pc.lineWidth = 1.5;
      pc.strokeRect(-hw, isPocket ? -2 : 0, hw * 2, 4);

      pc.beginPath();
      if (slideDir === 1) {
        pc.moveTo(-hw, py);
        pc.lineTo(hw + Math.min(hw * 2, spaceRight * S.SC), py);
      } else {
        pc.moveTo(hw, py);
        pc.lineTo(-hw - Math.min(hw * 2, spaceLeft * S.SC), py);
      }
      pc.strokeStyle = spaceError ? "red" : (isSel ? "#3f6b78" : "#999");
      pc.lineWidth = 2;
      if (isPocket) pc.setLineDash([4, 4]);
      pc.stroke();
      if (isPocket) pc.setLineDash([]);

      var ax = Math.min(hw * 1.5, hw + Math.max(0, (slideDir === 1 ? spaceRight : spaceLeft) * S.SC - 5));
      pc.beginPath();
      if (slideDir === 1) {
        pc.moveTo(ax, py - 4);
        pc.lineTo(ax + 5, py);
        pc.lineTo(ax, py + 4);
      } else {
        pc.moveTo(-ax, py - 4);
        pc.lineTo(-ax - 5, py);
        pc.lineTo(-ax, py + 4);
      }
      pc.strokeStyle = spaceError ? "red" : (isSel ? "#3f6b78" : "#5b7a86");
      pc.lineWidth = 1.5;
      pc.stroke();

      if (spaceError) {
        pc.fillStyle = "red";
        pc.font = "bold 14px Arial";
        pc.textAlign = "center";
        pc.fillText("!", 0, -10);
      }
    } else if (o.isDouble) {
      var pairInward = String(o.swingDir || "R_IN").slice(-2) === "IN",
        pairSide = pairInward ? -1 : 1,
        leftLeaf = Math.max(1, Math.min(o.width - 1, Number(o.leafA) || o.width / 2)) * S.SC,
        rightLeaf = hw * 2 - leftLeaf,
        pairConflict = openingHasSwingConflict(o);
      pc.strokeStyle = pairConflict ? "#c0392b" : (isSel ? "#3f6b78" : isPresentation() ? "#4a443c" : "#5b7a86");
      pc.lineWidth = isSel ? 3 : 2;
      [[-hw, leftLeaf, 1], [hw, rightLeaf, -1]].forEach(function (leaf) {
        pc.beginPath(); pc.moveTo(leaf[0], 0); pc.lineTo(leaf[0], pairSide * leaf[1]); pc.stroke();
        pc.beginPath();
        var closed = leaf[2] > 0 ? 0 : Math.PI, opened = pairSide > 0 ? Math.PI / 2 : -Math.PI / 2;
        pc.arc(leaf[0], 0, leaf[1], closed, opened, (leaf[2] > 0) === pairInward); pc.stroke();
      });
    } else {
      // Reflect chosen swing: hinge side (L/R) + opening face (IN/OUT).
      var swingDir = o.swingDir || "R_IN";
      var isLeftHinge = swingDir.charAt(0) === "L";
      var isInward = swingDir.slice(-2) === "IN";
      var hx = isLeftHinge ? -hw : hw; // hinge jamb
      var leafDir = isLeftHinge ? 1 : -1; // toward the far jamb along the wall
      var sy = isInward ? -1 : 1; // wall face the leaf sweeps toward
      var dw = hw * 2; // door leaf length
      var swingConflict = openingHasSwingConflict(o);
      pc.strokeStyle = swingConflict ? "#c0392b" : (isSel ? "#3f6b78" : isPresentation() ? "#4a443c" : "#5b7a86");
      pc.lineWidth = isSel ? 3 : 2;
      // Open leaf: perpendicular into the room, on the swing face.
      pc.beginPath();
      pc.moveTo(hx, 0);
      pc.lineTo(hx, sy * dw);
      pc.stroke();
      // Swing arc from closed (along wall) to open (perpendicular).
      var aClosed = leafDir > 0 ? 0 : Math.PI;
      var aOpen = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
      pc.beginPath();
      pc.arc(hx, 0, dw, aClosed, aOpen, isLeftHinge === isInward);
      pc.stroke();
      if (swingConflict) {
        pc.fillStyle = "#c0392b";
        pc.font = "bold 13px Arial";
        pc.textAlign = "center";
        pc.fillText("!", 0, -10);
      }
    }
  } else if (o.type === "passage") {
    pc.strokeStyle = isSel ? "#3f6b78" : "#8a7f68";
    pc.lineWidth = isSel ? 3 : 2.2;
    pc.beginPath();
    pc.moveTo(-hw, -ht);
    pc.lineTo(-hw, ht);
    pc.moveTo(hw, -ht);
    pc.lineTo(hw, ht);
    pc.stroke();
  } else {
    pc.fillStyle = isSel ? "#bcdcea" : "#cfe3ec";
    pc.fillRect(-hw, -ht * 0.5, hw * 2, ht);
    pc.strokeStyle = isSel ? "#3f6b78" : "#7aa3b3";
    pc.lineWidth = isSel ? 3 : 1.6;
    pc.strokeRect(-hw, -ht * 0.5, hw * 2, ht);
    pc.beginPath();
    pc.moveTo(-hw, 0);
    pc.lineTo(hw, 0);
    pc.stroke();
  }
  pc.restore();
}
function drawSegPreview(w, seg) {
  var gm = wallGeom(w),
    hw = Math.max(5, seg.width) / 2,
    s = Math.max(hw, Math.min(gm.L - hw, seg.s));
  pc.save();
  pc.lineCap = "butt";
  pc.strokeStyle = "rgba(70,150,90,.85)";
  pc.lineWidth = Math.max(w.thickness * S.SC, 4);
  pc.setLineDash([7, 5]);
  pc.beginPath();
  var steps = gm.kind === "arc" ? Math.max(6, Math.ceil(seg.width / 15)) : 1;
  for (var i = 0; i <= steps; i++) {
    var p = wallPointAt(w, s - hw + seg.width * i / steps);
    if (!p) continue;
    if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
  }
  pc.stroke();
  pc.setLineDash([]);
  pc.restore();
}
/* `chromeOnly` is the HUD pass asking for the highlighted corners alone: the
   selected dots and the grips on the selected wall, drawn over the plain dots
   the model pass already laid down. A corner the drag proxy has lifted counts
   as highlighted too, which is what keeps a dragged corner moving while the
   model canvas holds still. */
function drawNodes(hid, chromeOnly) {
  // corners of hidden-away walls go with them (usedNodes() spans every wall)
  var u = {};
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    if (!chromeOnly && proxied("wall", w)) return;
    u[w.a] = 1;
    u[w.b] = 1;
  });
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !isFinite(n.x) || !isFinite(n.z)) continue;
    var isSel = chromeOn && S.sel && (
        (S.sel.kind === "node" && S.sel.ref === +k) ||
        (S.sel.kind === "nodes" && S.sel.refs.indexOf(+k) !== -1)
      );
    if (chromeOnly && !isSel && !proxied("node", +k)) continue;
    if (!chromeOnly && proxied("node", +k)) continue;
    pc.beginPath();
    pc.arc(sx(n.x), sz(n.z), isSel ? 6 : 4.2, 0, 7);
    pc.fillStyle = isSel ? "#3f6b78" : "#fff";
    pc.fill();
    pc.lineWidth = 1.6;
    pc.strokeStyle = isSel ? "#2c5560" : "#7a7060";
    pc.stroke();
  }
  /* Grips on the ends of the SELECTED wall. Dragging one resizes that wall
     only — the walls sharing the corner hold their locked dimensions and let go
     of the joint (js/constraint_engine.js) — while dragging a bare corner still
     moves the whole junction. The two gestures land on the same pixel, so the
     grip is the only thing that tells them apart. */
  if (chromeOn && S.sel && S.sel.kind === "wall" && !hid.walls[S.sel.ref.id]) {
    var sw = S.sel.ref;
    [S.nodes[sw.a], S.nodes[sw.b]].forEach(function (n) {
      if (!n) return;
      var X = sx(n.x),
        Z = sz(n.z),
        h = 5;
      pc.beginPath();
      pc.rect(X - h, Z - h, h * 2, h * 2);
      pc.fillStyle = "#fff";
      pc.fill();
      pc.lineWidth = 2;
      pc.strokeStyle = "#3f6b78";
      pc.stroke();
    });
  }
}
/* The glow the constraint engine asks for: a breathing halo on every corner it
   has a complaint about. Red = a wall end connected to nothing, amber = a joint
   that isn't a right angle. The one under the cursor — whether the cursor is
   over the canvas or over its row in the message list — burns brighter, gets
   its walls traced, and says what it is; that shared highlight is what ties the
   list and the plan together. */
const WARN_COL = { openEnd: [225, 62, 62], angle: [222, 150, 24] };
function drawWarnGlow() {
  var list = activeWarnings();
  if (!list.length) return;
  var pulse = 0.5 + 0.5 * Math.sin(warnPhase * 2.2); // 0..1
  pc.save();
  list.forEach(function (wr) {
    var hot = S.warnHover === wr.key || S.warnSel === wr.key;
    var c = WARN_COL[wr.kind] || WARN_COL.angle,
      rgb = c[0] + "," + c[1] + "," + c[2];
    var X = sx(wr.x),
      Z = sz(wr.z);
    var base = hot ? 15 : 11,
      r = base + pulse * (hot ? 5 : 3);
    // the halo itself
    var grd = pc.createRadialGradient(X, Z, 1, X, Z, r * 1.9);
    grd.addColorStop(0, "rgba(" + rgb + "," + (hot ? 0.55 : 0.34) + ")");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    pc.beginPath();
    pc.arc(X, Z, r * 1.9, 0, 7);
    pc.fillStyle = grd;
    pc.fill();
    // a crisp ring so it reads as a marker, not a smudge
    pc.beginPath();
    pc.arc(X, Z, r, 0, 7);
    pc.strokeStyle = "rgba(" + rgb + "," + (hot ? 1 : 0.85) + ")";
    pc.lineWidth = hot ? 2.4 : 1.6;
    pc.stroke();
    if (wr.kind === "openEnd") {
      // an open end gets a cross: nothing lands here
      var q = r * 0.42;
      pc.beginPath();
      pc.moveTo(X - q, Z - q);
      pc.lineTo(X + q, Z + q);
      pc.moveTo(X + q, Z - q);
      pc.lineTo(X - q, Z + q);
      pc.stroke();
    }
    if (!hot) return;
    // trace the walls this warning is about
    pc.lineWidth = 3;
    pc.strokeStyle = "rgba(" + rgb + ",.9)";
    pc.setLineDash([9, 6]);
    wr.walls.forEach(function (id) {
      var w = wallById(id);
      if (!w) return;
      traceWallCentre(w);
      pc.stroke();
    });
    pc.setLineDash([]);
  });
  pc.restore();
  // the hovered/picked warning names itself, above every halo
  var hotW = null;
  list.forEach(function (wr) {
    if (S.warnHover === wr.key || S.warnSel === wr.key) hotW = wr;
  });
  if (hotW)
    label(
      hotW.x,
      hotW.z - 26 / S.SC,
      warnLabel(hotW),
      hotW.kind === "openEnd" ? "#c92b2b" : "#a86c05",
      true,
    );
}
/* One short line naming a warning — shared by the canvas label and the list. */
export function warnLabel(wr) {
  if (wr.kind === "openEnd")
    return wr.ignored ? t("cw_intentionalEnd") : (wr.near ? t("cw_openEndNear") : t("cw_openEnd"));
  var a = wr && wr.angle;
  return t("cw_angle", { a: Number.isFinite(a) ? Number(a).toFixed(1) : "?" });
}

/* top-view glyphs, drawn in the item's local (rotated) pixel space: x=width, y=depth, front=+y */
var LN = "rgba(60,58,50,.5)",
  LNS = "rgba(60,58,50,.7)";
function gStroke(lw) {
  pc.strokeStyle = LN;
  pc.lineWidth = lw || 1.2;
  pc.lineCap = "butt";
}
function gCirc(x, y, r, fill) {
  pc.beginPath();
  pc.arc(x, y, r, 0, 7);
  if (fill) {
    pc.fillStyle = fill;
    pc.fill();
  }
  pc.stroke();
}
function doorsGlyph(w, d, n) {
  gStroke();
  for (var i = 1; i < n; i++) {
    var x = -w / 2 + (i * w) / n;
    pc.beginPath();
    pc.moveTo(x, -d / 2 + 2);
    pc.lineTo(x, d / 2 - 2);
    pc.stroke();
  }
}
var GLYPH = {
  sofa: function (w, d, it) {
    gStroke();
    var bk = -d / 2 + d * 0.3;
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, bk);
    pc.lineTo(w / 2 - 3, bk);
    pc.stroke();
    var n = Math.max(2, Math.round(it.w / 70));
    for (var i = 1; i < n; i++) {
      var x = -w / 2 + 3 + (i * (w - 6)) / n;
      pc.beginPath();
      pc.moveTo(x, bk);
      pc.lineTo(x, d / 2 - 3);
      pc.stroke();
    }
  },
  armchair: function (w, d) {
    gStroke();
    var bk = -d / 2 + d * 0.3;
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, bk);
    pc.lineTo(w / 2 - 3, bk);
    pc.stroke();
  },
  bed: function (w, d) {
    gStroke();
    pc.fillStyle = "rgba(255,255,255,.75)";
    var pw = w * 0.36,
      ph = Math.min(d * 0.16, 14);
    pc.fillRect(-w / 2 + w * 0.07, -d / 2 + 3, pw, ph);
    pc.strokeRect(-w / 2 + w * 0.07, -d / 2 + 3, pw, ph);
    pc.fillRect(w / 2 - w * 0.07 - pw, -d / 2 + 3, pw, ph);
    pc.strokeRect(w / 2 - w * 0.07 - pw, -d / 2 + 3, pw, ph);
    pc.beginPath();
    pc.moveTo(-w / 2 + 2, -d / 2 + d * 0.34);
    pc.lineTo(w / 2 - 2, -d / 2 + d * 0.34);
    pc.stroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 2, -d / 2 + d * 0.34);
    pc.lineTo(-w / 2 + w * 0.12, -d / 2 + d * 0.46);
    pc.moveTo(w / 2 - 2, -d / 2 + d * 0.34);
    pc.lineTo(w / 2 - w * 0.12, -d / 2 + d * 0.46);
    pc.stroke();
  },
  table: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
  },
  desk: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
    pc.beginPath();
    pc.moveTo(w / 2 - w * 0.28, -d / 2 + 4);
    pc.lineTo(w / 2 - w * 0.28, d / 2 - 4);
    pc.stroke();
  },
  chair: function (w, d) {
    gStroke(1.6);
    pc.beginPath();
    pc.moveTo(-w / 2 + 2, -d / 2 + 3);
    pc.lineTo(w / 2 - 2, -d / 2 + 3);
    pc.stroke();
  },
  fridge: function (w, d) {
    gStroke();
    pc.beginPath();
    pc.moveTo(0, -d / 2 + 2);
    pc.lineTo(0, d / 2 - 2);
    pc.stroke();
    gCirc(-w * 0.2, d * 0.28, Math.min(w, d) * 0.06);
    gCirc(w * 0.2, d * 0.28, Math.min(w, d) * 0.06);
  },
  sink: function (w, d) {
    gStroke();
    var r = Math.min(w, d) * 0.3;
    gCirc(0, d * 0.06, r, "rgba(255,255,255,.7)");
    gCirc(0, -d / 2 + d * 0.18, Math.max(1.5, r * 0.14), "#8a8f92");
  },
  vanity: function (w, d) {
    gStroke();
    var r = Math.min(w, d) * 0.3;
    gCirc(0, d * 0.06, r, "rgba(255,255,255,.7)");
    gCirc(0, -d / 2 + d * 0.18, Math.max(1.5, r * 0.14), "#8a8f92");
  },
  cooktop: function (w, d) {
    gStroke();
    var r = Math.min(w, d) * 0.16;
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(function (p) {
      gCirc(p[0] * w * 0.2, p[1] * d * 0.2, r);
    });
  },
  oven: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 5, -d / 2 + 5, w - 10, d - 10);
    pc.beginPath();
    pc.moveTo(-w / 2 + 5, d / 2 - d * 0.24);
    pc.lineTo(w / 2 - 5, d / 2 - d * 0.24);
    pc.stroke();
  },
  dishwasher: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 5, -d / 2 + 5, w - 10, d - 10);
    gCirc(0, 0, Math.min(w, d) * 0.14);
  },
  washer: function (w, d) {
    gStroke(1.4);
    gCirc(0, 0, Math.min(w, d) * 0.32, "rgba(255,255,255,.55)");
    gCirc(0, 0, Math.min(w, d) * 0.18);
  },
  toilet: function (w, d) {
    gStroke();
    pc.fillStyle = "rgba(255,255,255,.8)";
    pc.fillRect(-w / 2 + 2, -d / 2 + 2, w - 4, d * 0.22);
    pc.strokeRect(-w / 2 + 2, -d / 2 + 2, w - 4, d * 0.22);
    pc.save();
    pc.translate(0, d * 0.14);
    pc.scale(1, 1.25);
    pc.beginPath();
    pc.arc(0, 0, w * 0.34, 0, 7);
    pc.restore();
    pc.fillStyle = "rgba(255,255,255,.85)";
    pc.fill();
    pc.stroke();
  },
  bathtub: function (w, d) {
    gStroke(1.4);
    rr(-w / 2 + 5, -d / 2 + 5, w - 10, d - 10, Math.min(w, d) * 0.18);
    pc.fillStyle = "rgba(255,255,255,.6)";
    pc.fill();
    pc.stroke();
    gCirc(-w / 2 + w * 0.14, 0, Math.min(w, d) * 0.08);
  },
  shower: function (w, d) {
    gStroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, -d / 2 + 3);
    pc.lineTo(w / 2 - 3, d / 2 - 3);
    pc.moveTo(w / 2 - 3, -d / 2 + 3);
    pc.lineTo(-w / 2 + 3, d / 2 - 3);
    pc.stroke();
    gCirc(0, -d / 2 + d * 0.2, Math.min(w, d) * 0.09, "rgba(255,255,255,.8)");
  },
  tv: function (w, d) {
    pc.strokeStyle = LNS;
    pc.lineWidth = 2.4;
    pc.beginPath();
    pc.moveTo(-w / 2 + 5, -d / 2 + d * 0.3);
    pc.lineTo(w / 2 - 5, -d / 2 + d * 0.3);
    pc.stroke();
  },
  plant: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.32);
    gCirc(-w * 0.14, -d * 0.12, Math.min(w, d) * 0.18);
    gCirc(w * 0.15, d * 0.1, Math.min(w, d) * 0.15);
  },
  bookshelf: function (w, d) {
    gStroke();
    for (var i = 1; i < 5; i++) {
      var x = -w / 2 + (i * w) / 5;
      pc.beginPath();
      pc.moveTo(x, -d / 2 + 2);
      pc.lineTo(x, d / 2 - 2);
      pc.stroke();
    }
  },
  wardrobe: function (w, d) {
    doorsGlyph(w, d, 2);
  },
  tall: function (w, d) {
    doorsGlyph(w, d, 2);
  },
  base: function (w, d) {
    doorsGlyph(w, d, 2);
  },
  upper: function (w, d) {
    doorsGlyph(w, d, 2);
  },
  dresser: function (w, d) {
    doorsGlyph(w, d, 3);
  },
  nightstand: function (w, d) {
    gStroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, 0);
    pc.lineTo(w / 2 - 3, 0);
    pc.stroke();
  },
  island: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
  },
  rug: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 6, -d / 2 + 6, w - 12, d - 12);
  },
  coffee: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
  },
  sideTable: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.42);
    gCirc(0, 0, Math.min(w, d) * 0.08);
  },
  tvunit: function (w, d) {
    doorsGlyph(w, d, 3);
  },
  roundTable: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.46, "rgba(255,255,255,.25)");
    gCirc(0, 0, Math.min(w, d) * 0.1);
  },
  barstool: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.34);
  },
  officeChair: function (w, d) {
    gStroke();
    gCirc(0, d * 0.05, Math.min(w, d) * 0.32);
    pc.beginPath();
    pc.moveTo(-w * 0.3, -d / 2 + 3);
    pc.lineTo(w * 0.3, -d / 2 + 3);
    pc.stroke();
  },
  piano: function (w, d) {
    gStroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, d * 0.1);
    pc.lineTo(w / 2 - 3, d * 0.1);
    pc.stroke();
    for (var i = 1; i < 7; i++) {
      var x = -w / 2 + (i * w) / 7;
      pc.beginPath();
      pc.moveTo(x, d * 0.1);
      pc.lineTo(x, d / 2 - 3);
      pc.stroke();
    }
  },
  crib: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6);
    for (var i = 1; i < 6; i++) {
      var x = -w / 2 + (i * w) / 6;
      pc.beginPath();
      pc.moveTo(x, -d / 2 + 3);
      pc.lineTo(x, -d / 2 + 7);
      pc.moveTo(x, d / 2 - 7);
      pc.lineTo(x, d / 2 - 3);
      pc.stroke();
    }
  },
  bunk: function (w, d) {
    gStroke();
    pc.fillStyle = "rgba(255,255,255,.75)";
    var pw = w * 0.36,
      ph = Math.min(d * 0.12, 12);
    pc.fillRect(-w / 2 + w * 0.07, -d / 2 + 3, pw, ph);
    pc.strokeRect(-w / 2 + w * 0.07, -d / 2 + 3, pw, ph);
    pc.fillRect(w / 2 - w * 0.07 - pw, -d / 2 + 3, pw, ph);
    pc.strokeRect(w / 2 - w * 0.07 - pw, -d / 2 + 3, pw, ph);
    for (var i = 0; i < 3; i++) {
      pc.beginPath();
      pc.moveTo(-w * 0.15 + i * w * 0.15, d / 2 - 3);
      pc.lineTo(-w * 0.08 + i * w * 0.15, d / 2 - 9);
      pc.stroke();
    }
  },
  mirror: function (w, d) {
    pc.strokeStyle = LNS;
    pc.lineWidth = 2.2;
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, 0);
    pc.lineTo(w / 2 - 3, 0);
    pc.stroke();
    pc.lineWidth = 1;
    pc.beginPath();
    pc.moveTo(w * 0.1, -d * 0.2);
    pc.lineTo(w * 0.25, -d * 0.45);
    pc.stroke();
  },
  art: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 3, -d / 2 + 2, w - 6, d - 4);
    pc.beginPath();
    pc.moveTo(-w / 2 + 3, d / 2 - 2);
    pc.lineTo(w / 2 - 3, -d / 2 + 2);
    pc.stroke();
  },
  ac: function (w, d) {
    gStroke();
    for (var i = 0; i < 3; i++) {
      var y = -d / 2 + 4 + (i * (d - 8)) / 2;
      pc.beginPath();
      pc.moveTo(-w / 2 + 5, y);
      pc.lineTo(w / 2 - 5, y);
      pc.stroke();
    }
  },
  // ducted AC: the fan coil shows its two duct spigots, the grilles show their
  // face pattern, and the condenser shows its fan — readable at plan scale.
  acDucted: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
    pc.beginPath();
    pc.moveTo(-w * 0.25, -d / 2 + 4);
    pc.lineTo(-w * 0.25, -d / 2);
    pc.moveTo(w * 0.25, d / 2 - 4);
    pc.lineTo(w * 0.25, d / 2);
    pc.stroke();
    gCirc(0, 0, Math.min(w, d) * 0.16);
  },
  acDiffuser: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 2, -d / 2 + 2, w - 4, d - 4);
    pc.beginPath();
    pc.moveTo(-w / 2 + 2, -d / 2 + 2);
    pc.lineTo(w / 2 - 2, d / 2 - 2);
    pc.moveTo(w / 2 - 2, -d / 2 + 2);
    pc.lineTo(-w / 2 + 2, d / 2 - 2);
    pc.stroke();
  },
  acReturn: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 2, -d / 2 + 2, w - 4, d - 4);
    for (var i = 1; i < 4; i++) {
      var x = -w / 2 + 2 + (i * (w - 4)) / 4;
      pc.beginPath();
      pc.moveTo(x, -d / 2 + 2);
      pc.lineTo(x, d / 2 - 2);
      pc.stroke();
    }
  },
  acCassette: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 2, -d / 2 + 2, w - 4, d - 4);
    pc.strokeRect(-w * 0.18, -d * 0.18, w * 0.36, d * 0.36);
  },
  acOutdoor: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.38);
    pc.beginPath();
    pc.moveTo(-w / 2 + 4, -d / 2 + 3);
    pc.lineTo(w / 2 - 4, -d / 2 + 3);
    pc.stroke();
  },
  tvWall: function (w, d) {
    gStroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 2, -d / 2 + 1);
    pc.lineTo(w / 2 - 2, -d / 2 + 1);
    pc.stroke();
    pc.beginPath();
    pc.moveTo(-w * 0.1, -d / 2 + 1);
    pc.lineTo(0, d / 2 - 1);
    pc.lineTo(w * 0.1, -d / 2 + 1);
    pc.stroke();
  },
  shoeCab: function (w, d) {
    doorsGlyph(w, d, 3);
  },
  coatRack: function (w, d) {
    gStroke();
    gCirc(0, 0, Math.min(w, d) * 0.1);
    var r = Math.min(w, d) * 0.4;
    for (var i = 0; i < 4; i++) {
      var a = (i * Math.PI) / 2 + Math.PI / 4;
      pc.beginPath();
      pc.moveTo(0, 0);
      pc.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      pc.stroke();
    }
  },
  dryer: function (w, d) {
    gStroke(1.4);
    gCirc(0, 0, Math.min(w, d) * 0.32);
    gCirc(0, 0, Math.min(w, d) * 0.2);
  },
  microwave: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6);
    pc.strokeRect(-w / 2 + 6, -d / 2 + 5, w * 0.55, d - 10);
  },
  hood: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
    gCirc(0, 0, Math.min(w, d) * 0.14);
  },
  aquarium: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6);
    pc.beginPath();
    pc.moveTo(-w / 2 + 5, -d * 0.1);
    pc.bezierCurveTo(
      -w * 0.2,
      -d * 0.25,
      w * 0.2,
      d * 0.05,
      w / 2 - 5,
      -d * 0.1,
    );
    pc.stroke();
    pc.beginPath();
    pc.moveTo(-w / 2 + 5, d * 0.15);
    pc.bezierCurveTo(-w * 0.2, 0, w * 0.2, d * 0.3, w / 2 - 5, d * 0.15);
    pc.stroke();
    gCirc(-w * 0.15, d * 0.02, 1.8, "#e8873c");
  },
  bench: function (w, d) {
    gStroke();
    for (var i = 0; i < 3; i++) {
      var y = -d / 2 + 4 + (i * (d - 8)) / 2;
      pc.beginPath();
      pc.moveTo(-w / 2 + 4, y);
      pc.lineTo(w / 2 - 4, y);
      pc.stroke();
    }
  },
  stairs: function (w, d, it) {
    gStroke();
    // L-shaped and curved flights: the drafting symbol, the same line-work
    // the construction sheet prints (js/plan_symbols.js)
    var sit = { steps: it.steps, configuration: it.configuration, shape: vspec(it).shape };
    if (stairShape(sit) !== "straight") {
      drawSymbolPrims(symbolPrims("stairs", it.w, it.d, sit), S.SC, it);
      return;
    }
    var steps = Math.max(2, Math.min(100, Math.round(it.configuration?.stepCount || it.steps || 10)));
    for (var i = 1; i < steps; i++) {
      var y = -d / 2 + (i * d) / steps;
      pc.beginPath();
      pc.moveTo(-w / 2 + 2, y);
      pc.lineTo(w / 2 - 2, y);
      pc.stroke();
    }
    pc.beginPath();
    pc.moveTo(0, d / 2 - 4);
    pc.lineTo(0, -d / 2 + 6);
    pc.lineTo(-4, -d / 2 + 12);
    pc.moveTo(0, -d / 2 + 6);
    pc.lineTo(4, -d / 2 + 12);
    pc.stroke();
    drawStairsUp(it, w, d);
  },
  fireplace: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 3, w - 8, d - 6);
    pc.beginPath();
    pc.moveTo(-5, d * 0.15);
    pc.lineTo(0, -d * 0.2);
    pc.lineTo(5, d * 0.15);
    pc.closePath();
    pc.stroke();
  },
  pouf: function (w, d) {
    gStroke();
    rr(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8, Math.min(w, d) * 0.2);
    pc.stroke();
  },
  dressTable: function (w, d) {
    gStroke();
    pc.strokeRect(-w / 2 + 4, -d / 2 + 4, w - 8, d - 8);
    pc.strokeStyle = LNS;
    pc.lineWidth = 2;
    pc.beginPath();
    pc.moveTo(-w * 0.28, -d / 2 + 3);
    pc.lineTo(w * 0.28, -d / 2 + 3);
    pc.stroke();
  },
  /* The modular cabinet draws what it actually is: column divisions, drawer
     fronts, and the swing of every door — the symbol a plan is read for.
     Coordinates come from cabinet.js in cm and are scaled to the drawing. */
  cabsys: function (w, d, it) {
    var P;
    try {
      P = planCab(it);
    } catch (e) {
      return;
    }
    var sc = w / P.w,
      front = d / 2,
      back = -d / 2;
    pc.save();
    /* A corner unit is not a rectangle: draw its actual footprint and the door
       across the diagonal, which is the whole reason it exists. */
    if (P.poly) {
      var zc2 = d / P.d;
      pc.lineWidth = 1.4;
      pc.strokeStyle = "#8d8674";
      pc.beginPath();
      P.poly.forEach(function (q, i) {
        var px = q.x * sc,
          pz = q.z * zc2;
        if (i === 0) pc.moveTo(px, pz);
        else pc.lineTo(px, pz);
      });
      pc.closePath();
      pc.stroke();
      drawCabinetPlanSwings(pc,P,sc,zc2);
      pc.restore();
      return;
    }
    pc.lineWidth = 1;
    pc.strokeStyle = "#8d8674";
    // A floating shelf run is not a carcass: its joints are drawn dashed,
    // the way anything above the cut plane is drawn on a plan.
    if (P.float) pc.setLineDash([4, 3]);
    P.cols.forEach(function (col) {
      var x0 = col.x0 * sc,
        x1 = col.x1 * sc,
        cw = x1 - x0;
      // the carcass division
      pc.beginPath();
      pc.moveTo(x0, back);
      pc.lineTo(x0, front);
      pc.stroke();
      if (col.kind !== "normal") {
        pc.save(); // hatch a filler / blind corner
        pc.strokeStyle = "rgba(90,90,90,.5)";
        for (var hx = 0; hx < cw + d; hx += 6) {
          pc.beginPath();
          pc.moveTo(x0 + hx, front);
          pc.lineTo(x0 + hx - d, back);
          pc.stroke();
        }
        pc.restore();
        return;
      }
      if (col.drawers) {
        pc.strokeStyle = "#6f7a86"; // drawer fronts read as a doubled line
        pc.beginPath();
        pc.moveTo(x0 + 2, front - 3);
        pc.lineTo(x1 - 2, front - 3);
        pc.stroke();
        pc.strokeStyle = "#8d8674";
      }
      if (col.door === "none" || col.door === "drawer" || col.door === "lift") return;
      if (col.door === "sliding") {
        pc.save();
        pc.strokeStyle = "#5b7a86";
        pc.lineWidth = 2;
        pc.beginPath();
        pc.moveTo(x0 + cw * 0.15, front + 1);
        pc.lineTo(x1 - cw * 0.15, front + 1);
        pc.stroke();
        pc.restore();
        return;
      }

    });
    drawCabinetPlanSwings(pc,P,sc,d/P.d);
    pc.restore();
  },
};
export function drawCabinetPlanSwings(context,P,sx,sz) {
  var seen=new Set();
  (P.swings||[]).forEach(function(sw){
    var key=[sw.pivot.x,sw.pivot.z,sw.start,sw.sweep,sw.reach].join("|");if(seen.has(key))return;seen.add(key);
    context.save();context.strokeStyle="rgba(91,122,134,.85)";context.setLineDash([3,3]);context.beginPath();
    // Polyline sampling retains the actual quarter-turn under different X/Z scales.
    for(var i=0;i<=24;i++){var angle=sw.start+sw.sweep*i/24,x=(sw.pivot.x+sw.reach*Math.cos(angle))*sx,z=(sw.pivot.z+sw.reach*Math.sin(angle))*sz;
      if(i===0)context.moveTo(x,z);else context.lineTo(x,z);}
    context.stroke();context.setLineDash([]);context.beginPath();context.moveTo(sw.pivot.x*sx,sw.pivot.z*sz);
    context.lineTo((sw.pivot.x+sw.reach*Math.cos(sw.start+sw.sweep))*sx,(sw.pivot.z+sw.reach*Math.sin(sw.start+sw.sweep))*sz);
    context.stroke();context.restore();
  });
}

/* A piece on a faded user layer (js/user_layers.js) draws at a third of its
   strength; the hidden ones never get here (hiddenSets). */
function drawItem(it) {
  if (it && it.ulayer && itemUserVis(it) === "ghost") {
    pc.save();
    pc.globalAlpha *= 0.35;
    try {
      drawItemInner(it);
    } finally {
      pc.restore();
    }
    return;
  }
  drawItemInner(it);
}
function drawItemInner(it) {
  var f = FURN[it.type],
    isSelL = (chromeOn && S.sel && S.sel.kind === "item" && S.sel.ref === it) ||
      (chromeOn && S.sel && S.sel.kind === "items" && S.sel.refs.indexOf(it) !== -1) ||
      eraseHover("item", it);
  if (isLamp(it)) {
    /* Presentation: a ceiling fitting is not furniture you would draw on a
       plan of the floor, so it shows only while selected; floor and table
       lamps are pictured like any other piece. */
    if (isPresentation() && it.w > 0 && it.d > 0) {
      var lv = null;
      try { lv = knownVSpan(it); } catch (e) { lv = null; }
      // not measured yet (a fresh plan): wait for it rather than build the
      // model inside this paint, and do not flash a ceiling fitting meanwhile
      if (!lv) {
        measureVSpanSoon(it);
        if (isSelL) drawLamp(it, f, isSelL);
        return;
      }
      if (lv.lo >= 150) {
        if (isSelL) drawLamp(it, f, isSelL);
        return;
      }
      pc.save();
      pc.translate(sx(it.x), sz(it.z));
      pc.rotate(((it.rot || 0) * Math.PI) / 180);
      var drawn = drawItemPresentation(it, it.w * S.SC, it.d * S.SC, isSelL);
      pc.restore();
      if (drawn) return;
    }
    drawLamp(it, f, isSelL);
    return;
  }
  if (!(it.w > 0) || !(it.d > 0)) return;
  var A = ((it.rot || 0) * Math.PI) / 180;
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  pc.rotate(A);
  var w = it.w * S.SC,
    d = it.d * S.SC,
    isSel = isSelL;
  if (isPresentation() && drawItemPresentation(it, w, d, isSel)) {
    pc.restore();
    if (it.type === "motionSensor") drawMotionCone(it);
    if (isSmartType(it.type) && !isLamp(it)) drawSmartPip(it);
    if (it.locked) drawLock(it);
    return;
  }
  rr(-w / 2, -d / 2, w, d, 5);
  pc.fillStyle = fcolor(it);
  pc.globalAlpha = it.type === "rug" ? 0.85 : 1;
  pc.fill();
  pc.globalAlpha = 1;
  pc.lineWidth = isSel ? 3 : 1.4;
  pc.strokeStyle = isSel && eraseHover("item", it) ? ERASE_COL : isSel ? "#3f6b78" : "#b3a586";
  pc.stroke();
  var glyphFn = it.cab ? GLYPH.cabsys : GLYPH[it.type];
  if (glyphFn && w > 16 && d > 12) glyphFn(w, d, it);
  if (it.type !== "rug" && it.type !== "cabsys" && !it.cab) {
    pc.strokeStyle = "#5b7a86";
    pc.lineWidth = 2.6;
    pc.lineCap = "round";
    pc.beginPath();
    pc.moveTo(-w / 2 + 6, d / 2 - 3);
    pc.lineTo(w / 2 - 6, d / 2 - 3);
    pc.stroke();
  }
  if (w > 44 && d > 26) {
    pc.rotate(-A - planRotRad()); // upright: cancel item + plan rotation
    pc.fillStyle = "#2f2d28";
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.font = it.type === "island" ? "bold 12px Arial" : "10px Arial";
    var nm2 = flabel(it.type);
    var tw = pc.measureText(nm2).width;
    pc.fillStyle = "rgba(255,255,255,.55)";
    pc.fillRect(-tw / 2 - 3, -7, tw + 6, 14);
    pc.fillStyle = "#2f2d28";
    pc.fillText(nm2, 0, 1);
  }
  pc.restore();
  if (it.type === "motionSensor") drawMotionCone(it);
  if (isSmartType(it.type) && !isLamp(it)) drawSmartPip(it);
  if (it.locked) drawLock(it);
}
/* Presentation furniture, drawn in the item's rotated frame (origin at its
   centre, +y toward its front). Returns false to let drawItem fall back to the
   technical glyph — while the picture is still being baked, or for the pieces
   (sensors, small smart devices) whose symbol says more than a render. */
function drawItemPresentation(it, w, d, isSel) {
  // lamps reach here only when they stand on the floor (see drawItem)
  var mode = spriteMode(it, { lamp: false });
  if (mode === "sprite") {
    // whether it hangs above the plan cut needs its measured height; not
    // measured yet (a fresh plan) → its line glyph until it is, rather than
    // building the model inside this paint
    var vspan = null;
    try { vspan = knownVSpan(it); } catch (e) { vspan = null; }
    if (!vspan) {
      measureVSpanSoon(it);
      return false;
    }
    mode = spriteMode(it, { lamp: false, vspan: vspan });
  }
  if (mode === "glyph") return false;
  if (mode === "overhead") {
    // hung above the plan cut: outline only, dashed, like a drafted upper
    pc.save();
    pc.setLineDash([6, 4]);
    pc.strokeStyle = isSel ? "#3f6b78" : "rgba(55,50,44,.7)";
    pc.lineWidth = isSel ? 2.2 : 1;
    pc.strokeRect(-w / 2, -d / 2, w, d);
    pc.beginPath();
    pc.moveTo(-w / 2, -d / 2); pc.lineTo(w / 2, d / 2);
    pc.moveTo(w / 2, -d / 2); pc.lineTo(-w / 2, d / 2);
    pc.globalAlpha = 0.35;
    pc.stroke();
    pc.restore();
    return true;
  }
  var dpr = canvasDpr(),
    sp = itemSprite(it, S.SC, dpr);
  if (!sp) return false;
  var kx = sp.w > 0 ? it.w / sp.w : 1, kz = sp.d > 0 ? it.d / sp.d : 1, r = sp.rect;
  pc.save();
  if (it.type !== "rug") {
    pc.shadowColor = planTheme().itemShadow;
    pc.shadowBlur = 7 * dpr;
    pc.shadowOffsetX = 2.5 * dpr;
    pc.shadowOffsetY = 2.5 * dpr;
  }
  pc.imageSmoothingEnabled = true;
  pc.drawImage(sp.img, r.x0 * kx * S.SC, r.z0 * kz * S.SC, (r.x1 - r.x0) * kx * S.SC, (r.z1 - r.z0) * kz * S.SC);
  pc.restore();
  if (it.type === "stairs") {
    // the walking line and UP over the render, following the flight's plan
    var sit = { steps: it.steps, configuration: it.configuration, shape: vspec(it).shape };
    pc.save();
    pc.strokeStyle = "rgba(38,35,31,.85)";
    drawSymbolPrims(symbolPrims("stairs", it.w, it.d, sit).filter(function (p) {
      return p.k === "text" || (p.k === "line" && p.weight === "heavy");
    }), S.SC, it);
    pc.restore();
  }
  if (isSel) {
    rr(-w / 2, -d / 2, w, d, 5);
    pc.lineWidth = 2.4;
    pc.strokeStyle = eraseHover("item", it) ? ERASE_COL : "#3f6b78";
    pc.stroke();
  }
  return true;
}

/* Draft symbol primitives (js/plan_symbols.js) on the canvas, in an item's
   rotated frame, cm scaled by k. "UP" labels go through drawStairsUp-style
   upright text. */
function drawSymbolPrims(prims, k, it) {
  var A = ((it.rot || 0) * Math.PI) / 180;
  prims.forEach(function (p) {
    pc.lineWidth = p.weight === "heavy" ? 1.6 : 1;
    pc.beginPath();
    if (p.k === "line") { pc.moveTo(p.x1 * k, p.z1 * k); pc.lineTo(p.x2 * k, p.z2 * k); pc.stroke(); }
    else if (p.k === "rect") { pc.strokeRect(p.x * k, p.z * k, p.w * k, p.d * k); }
    else if (p.k === "circle") { pc.arc(p.x * k, p.z * k, p.r * k, 0, Math.PI * 2); pc.stroke(); }
    else if (p.k === "poly") {
      p.pts.forEach(function (q, i) { if (i) pc.lineTo(q.x * k, q.z * k); else pc.moveTo(q.x * k, q.z * k); });
      if (p.closed) pc.closePath();
      pc.stroke();
    } else if (p.k === "text") {
      pc.save();
      pc.translate(p.x * k, p.z * k);
      pc.rotate(-A - planRotRad());
      pc.font = "bold " + Math.max(9, Math.min(13, Math.round(p.size * k))) + "px Arial";
      pc.textAlign = "center";
      pc.textBaseline = "middle";
      var txt = p.upLabel ? t("plan_stairs_up") : p.s, tw = pc.measureText(txt).width;
      pc.fillStyle = "rgba(255,255,255,.8)";
      pc.fillRect(-tw / 2 - 3, -8, tw + 6, 16);
      pc.fillStyle = "#26231f";
      pc.fillText(txt, 0, 0);
      pc.restore();
    }
  });
}

/* "UP" at the foot of a flight, upright whatever the flight's and the plan's
   rotation. The arrow (GLYPH.stairs) runs from the +y end to the -y end. */
function drawStairsUp(it, w, d) {
  if (w < 22 || d < 30) return;
  var A = ((it.rot || 0) * Math.PI) / 180;
  pc.save();
  pc.translate(0, d / 2 - Math.min(16, d * 0.12));
  pc.rotate(-A - planRotRad());
  pc.font = "bold " + Math.max(9, Math.min(13, Math.round(w * 0.14))) + "px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var txt = t("plan_stairs_up"), tw = pc.measureText(txt).width;
  pc.fillStyle = "rgba(255,255,255,.8)";
  pc.fillRect(-tw / 2 - 3, -8, tw + 6, 16);
  pc.fillStyle = "#26231f";
  pc.fillText(txt, 0, 0);
  pc.restore();
}

/* Presentation room labels: the name in bold capitals with its size under
   it, haloed so they read over any floor texture. Sizes go through the plan's
   length formatter, so a feet project reads 21'-6" X 16'-0". */
var labelMeasCache = { key: "", byRoom: {} };
function roomMeasFor(r) {
  var k = roomsTopologyKey();
  if (labelMeasCache.key !== k) labelMeasCache = { key: k, byRoom: {} };
  if (!(r.key in labelMeasCache.byRoom)) {
    var m = null;
    try { m = roomMeasurements(S, r); } catch (e) { m = null; }
    labelMeasCache.byRoom[r.key] = m;
  }
  return labelMeasCache.byRoom[r.key];
}
function drawPresentationRoomLabels(rooms) {
  var th = planTheme(), a = planRotRad(),
    fTitle = roomLabelFont(S.SC, true), fSize = roomLabelFont(S.SC, false);
  rooms.forEach(function (r) {
    if (roomHidden(r.key)) return;
    var nm = roomName(r.key);
    var lines = roomLabelLines({
      name: nm,
      meas: S.showDims ? roomMeasFor(r) : null,
      fmt: function (cm) { return planLen(cm, { suffix: false }); },
      fmtLast: function (cm) { return planLen(cm); },
    });
    if (!lines.title && !lines.size) return;
    var x = sx(r.cx), y = sz(r.cz);
    pc.save();
    if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); }
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.lineJoin = "round";
    pc.strokeStyle = th.halo;
    var ty = lines.size ? y - fTitle * 0.55 : y;
    if (lines.title) {
      pc.font = "700 " + fTitle + "px 'Inter', 'Helvetica Neue', Arial, sans-serif";
      pc.lineWidth = Math.max(3, fTitle * 0.28);
      pc.strokeText(lines.title, x, ty);
      pc.fillStyle = th.roomTitle;
      pc.fillText(lines.title, x, ty);
    }
    if (lines.size) {
      var sy = lines.title ? ty + fTitle * 0.62 + fSize * 0.55 : y;
      pc.font = "500 " + fSize + "px 'Inter', 'Helvetica Neue', Arial, sans-serif";
      pc.lineWidth = Math.max(3, fSize * 0.3);
      pc.strokeText(lines.size, x, sy);
      pc.fillStyle = th.roomSub;
      pc.fillText(lines.size, x, sy);
    }
    pc.restore();
  });
}

function drawMotionCone(it) {
  var A = ((it.rot || 0) * Math.PI) / 180;
  var range = 180 * S.SC;
  var halfFov = (45 * Math.PI) / 180;
  var isMotion = it.smart && it.smart.motion;
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  pc.rotate(A);
  pc.beginPath();
  pc.moveTo(0, 0);
  pc.arc(0, 0, range, Math.PI / 2 - halfFov, Math.PI / 2 + halfFov);
  pc.closePath();
  var grad = pc.createRadialGradient(0, 0, 4, 0, 0, range);
  if (isMotion) {
    grad.addColorStop(0, "rgba(16, 185, 129, 0.32)");
    grad.addColorStop(1, "rgba(16, 185, 129, 0.02)");
    pc.fillStyle = grad;
    pc.fill();
    pc.strokeStyle = "rgba(16, 185, 129, 0.65)";
    pc.lineWidth = 1.4;
    pc.stroke();
  } else {
    grad.addColorStop(0, "rgba(56, 189, 248, 0.15)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.01)");
    pc.fillStyle = grad;
    pc.fill();
    pc.strokeStyle = "rgba(56, 189, 248, 0.35)";
    pc.lineWidth = 1.0;
    pc.setLineDash([4, 4]);
    pc.stroke();
  }
  pc.restore();
}
function drawLock(it) {
  pc.save();
  pc.font = "12px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.fillText(
    "🔒",
    sx(it.x),
    sz(it.z) - (Math.min(it.w, it.d) * S.SC * 0.5 + 9),
  );
  pc.restore();
}
function drawSmartPip(it) {
  var on = devicePowered(it);
  var st = it.smart || {};
  pc.save();
  pc.translate(sx(it.x) + Math.max(6, it.w * S.SC * 0.38), sz(it.z) - Math.max(6, it.d * S.SC * 0.38));

  if (it.type === "smartLock") {
    var isLocked = st.locked !== false;
    pc.font = "10px sans-serif";
    pc.textAlign = "center";
    pc.textBaseline = "middle";
    pc.fillText(isLocked ? "🔒" : "🔓", 0, 0);
  } else if (it.type === "smokeDetector" && st.smoke) {
    pc.beginPath();
    pc.arc(0, 0, 6, 0, 7);
    pc.fillStyle = "rgba(239, 68, 68, 0.85)";
    pc.fill();
    pc.strokeStyle = "#991b1b";
    pc.lineWidth = 1.5;
    pc.stroke();
  } else {
    if (on) {
      pc.beginPath();
      pc.arc(0, 0, 6.5, 0, 7);
      pc.fillStyle = "rgba(61, 214, 140, 0.25)";
      pc.fill();
    }
    pc.beginPath();
    pc.arc(0, 0, 4.2, 0, 7);
    pc.fillStyle = on ? "#3dd68c" : "rgba(80,80,80,0.55)";
    pc.fill();
    pc.strokeStyle = on ? "#1f8a54" : "rgba(255,255,255,0.35)";
    pc.lineWidth = 1.2;
    pc.stroke();
  }
  pc.restore();
}
function drawLamp(it, f, isSel) {
  var on = it.lightOn !== false,
    col = hexStr(lampColor(it)),
    r = Math.max((Math.min(it.w, it.d) * S.SC) / 2, 11);
  pc.save();
  pc.translate(sx(it.x), sz(it.z));
  if (on) {
    var g = pc.createRadialGradient(0, 0, 2, 0, 0, r * 2.4);
    g.addColorStop(0, "rgba(255,236,150,.55)");
    g.addColorStop(1, "rgba(255,236,150,0)");
    pc.fillStyle = g;
    pc.beginPath();
    pc.arc(0, 0, r * 2.4, 0, 7);
    pc.fill();
  }
  if (on) {
    pc.strokeStyle = "#cfa441";
    pc.lineWidth = 1.6;
    for (var k = 0; k < 8; k++) {
      var aa = (k * Math.PI) / 4;
      pc.beginPath();
      pc.moveTo(Math.cos(aa) * (r + 2), Math.sin(aa) * (r + 2));
      pc.lineTo(Math.cos(aa) * (r + 6), Math.sin(aa) * (r + 6));
      pc.stroke();
    }
  }
  pc.beginPath();
  pc.arc(0, 0, r, 0, 7);
  pc.fillStyle = on ? "#fff1c0" : "#dad5c8";
  pc.fill();
  pc.lineWidth = isSel ? 3 : 1.6;
  pc.strokeStyle = isSel ? "#3f6b78" : on ? "#caa14e" : "#9a9384";
  pc.stroke();
  pc.beginPath();
  pc.arc(0, 0, r * 0.42, 0, 7);
  pc.fillStyle = on ? col : "#b7b1a3";
  pc.fill();
  pc.fillStyle = "#2f2d28";
  pc.font = "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "top";
  pc.rotate(-planRotRad()); // keep lamp label upright when the plan is rotated
  pc.fillText(flabel(it.type), 0, r + 7);
  pc.restore();
  if (it.locked) drawLock(it);
}
/* The explicit dimensions, drawn on the plan (js/wall_constraints.js).
   A dimension that only exists in the inspector is a dimension nobody trusts —
   you cannot see whether it points where you meant. Blue when satisfied, red
   when the solver could not honour it, which is the same colour language the
   constraint-engine warnings already use. */
function drawWallCons() {
  var list = wallCons();
  /* Rebuilt every frame, including the empty one. Keeping this reset behind
     the early return left a deleted dimension's old label clickable until
     some other constraint happened to be drawn. */
  conHits = [];
  conLabelOcc = [];
  if (!list.length) return;
  pc.save();
  pc.lineWidth = 1.2;
  pc.font = "600 11px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";

  list.forEach(function (c) {
    try {
    var sel = S.sel && S.sel.kind === "con" && S.sel.ref && S.sel.ref.id === c.id,
      hover = S.conHover === c.id,
      hot = sel || hover;
    /* Suppression switches a relation off, but it must still be locatable.
       Keep it hidden during ordinary drafting and reveal it in grey when its
       row is selected or hovered. */
    if (c.off && !hot) return;
    conForLabel = c;
    conHot = hot;
    /* Three states, three colours. A reference dimension is drawn in the
       muted grey every CAD uses for one, because a value that does NOT drive
       the drawing must never look like a value that does — that is the whole
       distinction the type exists to make. */
    var ok = conSatisfied(c),
      report = !!c.report,
      col = c.off ? "rgba(105,112,124,.95)"
        : report ? "rgba(120,128,140,.85)"
        : ok ? "rgba(60,120,220,.85)" : "rgba(225,70,70,.95)";
    pc.strokeStyle = col;
    pc.lineWidth = sel ? 3 : hover ? 2.4 : 1.2;
    pc.setLineDash(c.off || report ? [2, 3] : [5, 4]);
    pc.shadowColor = hot ? col : "transparent";
    pc.shadowBlur = hot ? 8 : 0;
    drawConTargetHighlight(c, col, hot);

    /* Opening constraints are first-class constraints too. They previously
       appeared in the inspector and solver but had no canvas glyph, so they
       could neither be seen nor picked from the drawing. */
    if (c.type === "openCentre" || c.type === "openDist") {
      var oo = openingById(c.opening), op = openingPos(oo);
      if (!op) return;
      var from = c.type === "openCentre"
        ? { x: (op.g.a.x + op.g.b.x) / 2, z: (op.g.a.z + op.g.b.z) / 2 }
        : c.end === "b" ? op.g.b : op.g.a;
      pc.beginPath();
      pc.moveTo(sx(from.x), sz(from.z));
      pc.lineTo(sx(op.x), sz(op.z));
      pc.stroke();
      conLabel((from.x + op.x) / 2, (from.z + op.z) / 2,
        c.type === "openCentre" ? "C" : Math.round(c.value) + "", col, -14);
      return;
    }
    if (c.type === "openAlign") {
      var oaa = openingPos(openingById(c.a)), obb = openingPos(openingById(c.b));
      if (!oaa || !obb) return;
      pc.beginPath(); pc.moveTo(sx(oaa.x), sz(oaa.z)); pc.lineTo(sx(obb.x), sz(obb.z)); pc.stroke();
      conLabel((oaa.x + obb.x) / 2, (oaa.z + obb.z) / 2,
        c.axis === "z" ? "Z=" : "X=", col, -14);
      return;
    }
    if (c.type === "openSpacing") {
      var ops = (c.openings || []).map(openingById).map(openingPos).filter(Boolean);
      if (ops.length < 3) return;
      pc.beginPath();
      ops.forEach(function (p, i) {
        if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
      });
      pc.stroke();
      var om = ops[Math.floor(ops.length / 2)];
      conLabel(om.x, om.z, "= =", col, -16);
      return;
    }

    /* A pin is not a dimension between two things, so it gets its own mark
       rather than a line and a number: the corner in a ring, which is how a
       grounded point reads in every sketcher. */
    if (c.type === "fixed") {
      var fp = anchorPos(c.a);
      if (!fp) return;
      var fx = sx(fp.x), fy = sz(fp.z);
      pc.setLineDash([]);
      pc.beginPath();
      pc.arc(fx, fy, 7, 0, Math.PI * 2);
      pc.stroke();
      pc.beginPath();
      pc.arc(fx, fy, 2.5, 0, Math.PI * 2);
      pc.fillStyle = col;
      pc.fill();
      /* The ring sits ON the corner, so it cannot also be the pick target —
         clicking there has to keep selecting the corner, which is the far more
         common intent. The pin therefore carries a small tag offset clear of
         the corner's own grab radius, and THAT is what selects the pin. What
         you click is what you can see. Drawn upright against plan rotation so
         the tag stays a square, not a diamond. */
      var aFix = planRotRad();
      pc.save();
      if (aFix) { pc.translate(fx, fy); pc.rotate(-aFix); pc.translate(-fx, -fy); }
      pc.beginPath();
      pc.rect(fx + 7, fy - 15, 8, 8);
      pc.fill();
      pc.restore();
      var corner = rotatePx(fx, fy);
      conHits.push({ con: c, x: corner.x + 11, y: corner.y - 11, w: 10 });
      return;
    }

    if (c.type === "coincident" || c.type === "symmetric") {
      var ca = anchorPos(c.a), cb = anchorPos(c.b);
      if (!ca || !cb) return;
      pc.beginPath();
      pc.moveTo(sx(ca.x), sz(ca.z));
      pc.lineTo(sx(cb.x), sz(cb.z));
      pc.stroke();
      if (c.type === "symmetric") {
        // show the mirror line the pair is measured about
        var axw = wallById(c.axis.id);
        if (axw) {
          var ag = wallGeom(axw), amx = (ag.a.x + ag.b.x) / 2, amz = (ag.a.z + ag.b.z) / 2,
            adx = c.axis.k === "perp" ? -ag.uz : ag.ux,
            adz = c.axis.k === "perp" ? ag.ux : ag.uz,
            half = Math.max(ag.L, 120) / 2;
          pc.save();
          pc.setLineDash([9, 4, 2, 4]);
          pc.beginPath();
          pc.moveTo(sx(amx - adx * half), sz(amz - adz * half));
          pc.lineTo(sx(amx + adx * half), sz(amz + adz * half));
          pc.stroke();
          pc.restore();
        }
      }
      conLabel((ca.x + cb.x) / 2, (ca.z + cb.z) / 2,
        c.type === "coincident" ? "\u2299" : "\u21C4", col);
      return;
    }

    if (c.type === "midpoint" || c.type === "pointOnLine") {
      var mw = wallById(c.ref), mp = anchorPos(c.point);
      if (!mw || !mp) return;
      var mg = wallGeom(mw);
      pc.beginPath();
      pc.moveTo(sx(mg.a.x), sz(mg.a.z));
      pc.lineTo(sx(mg.b.x), sz(mg.b.z));
      pc.stroke();
      conLabel(mp.x, mp.z, c.type === "midpoint" ? "\u25B3" : "\u2500\u25CB", col, -16);
      return;
    }

    if (c.type === "equalLengthSet") {
      (c.walls || []).map(wallById).filter(Boolean).forEach(function (ew) {
        var eg = wallGeom(ew);
        conLabel((eg.a.x + eg.b.x) / 2, (eg.a.z + eg.b.z) / 2, "=L", col, -18);
      });
      return;
    }

    if (c.type === "wallAngle") {
      var aw = wallById(c.wall), ar = wallById(c.ref);
      if (!aw || !ar) return;
      var awg = wallGeom(aw), arg = wallGeom(ar),
        am = { x: (awg.a.x + awg.b.x) / 2, z: (awg.a.z + awg.b.z) / 2 },
        rm = { x: (arg.a.x + arg.b.x) / 2, z: (arg.a.z + arg.b.z) / 2 };
      pc.beginPath();
      pc.moveTo(sx(rm.x), sz(rm.z));
      pc.lineTo(sx(am.x), sz(am.z));
      pc.stroke();
      conLabel((am.x + rm.x) / 2, (am.z + rm.z) / 2,
        Math.round(c.value) + "\u00b0", col);
      return;
    }

    if (["dist", "alignX", "alignZ", "axisDistX", "axisDistZ"].indexOf(c.type) !== -1) {
      var pa = anchorPos(c.a),
        pb = anchorPos(c.b);
      if (!pa || !pb) return;
      var x1 = sx(pa.x),
        z1 = sz(pa.z),
        x2 = sx(pb.x),
        z2 = sz(pb.z);
      pc.beginPath();
      pc.moveTo(x1, z1);
      pc.lineTo(x2, z2);
      pc.stroke();
      // a tick at the held end, so which side the solver pins is visible
      // without opening the inspector
      var hp = c.hold === "b" ? pb : pa;
      pc.setLineDash([]);
      pc.beginPath();
      pc.arc(sx(hp.x), sz(hp.z), 4, 0, Math.PI * 2);
      pc.fillStyle = col;
      pc.fill();
      conLabel((pa.x + pb.x) / 2, (pa.z + pb.z) / 2,
        c.type === "dist" ? (report ? "(" + Math.round(c.value) + ")" : Math.round(c.value) + "") :
          c.type === "axisDistX" ? "ΔX " + Math.round(c.value) :
            c.type === "axisDistZ" ? "ΔZ " + Math.round(c.value) :
              c.type === "alignX" ? "X=" : "Z=", col);
    } else if (c.type === "angle") {
      drawAngleConstraint({ joint: c.joint, w1: c.w1, w2: c.w2 }, Math.round(c.value) + "\u00b0", col, 26);
    } else if (c.type === "equalAngle") {
      if (report) {
        /* Comparing, not equalising: show what each corner actually measures
           and the difference between them. "=" would be a lie here — they are
           precisely what is NOT being forced equal. */
        var refA = conAngleOf(c.referenceAngle), drvA = conAngleOf(c.drivenAngle);
        drawAngleConstraint(c.referenceAngle, fmtDeg(refA), col, 24);
        drawAngleConstraint(c.drivenAngle, fmtDeg(drvA), col, 31);
        if (refA != null && drvA != null) {
          var jn = anchorNode(c.drivenAngle.joint), jp = jn != null && S.nodes[jn];
          if (jp) conLabel(jp.x, jp.z, "\u0394 " + fmtDeg(Math.abs(drvA - refA)), col, -46);
        }
      } else {
        drawAngleConstraint(c.referenceAngle, "=", col, 24);
        drawAngleConstraint(c.drivenAngle, "=", col, 31);
      }
    } else if (c.type === "pointWallDist") {
      var pp = anchorPos(c.point), pr = wallById(c.ref);
      if (!pp || !pr) return;
      var pgr = wallGeom(pr), ps = (pp.x - pgr.a.x) * pgr.ux + (pp.z - pgr.a.z) * pgr.uz,
        pfx = pgr.a.x + pgr.ux * ps, pfz = pgr.a.z + pgr.uz * ps;
      if (c.refFace === 1 || c.refFace === -1) {
        pfx += -pgr.uz * c.refFace * (pr.thickness || 0) / 2;
        pfz += pgr.ux * c.refFace * (pr.thickness || 0) / 2;
      }
      pc.beginPath(); pc.moveTo(sx(pp.x), sz(pp.z)); pc.lineTo(sx(pfx), sz(pfz)); pc.stroke();
      conLabel((pp.x + pfx) / 2, (pp.z + pfz) / 2, Math.abs(Math.round(c.value)) + "", col);
    } else if (c.type === "equalSpacing") {
      var centres = (c.walls || []).map(wallById).filter(Boolean).map(function (sw) {
        var sg = wallGeom(sw); return { x: (sg.a.x + sg.b.x) / 2, z: (sg.a.z + sg.b.z) / 2 };
      });
      if (centres.length < 3) return;
      pc.beginPath();
      centres.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
      pc.stroke();
      var sc = centres[Math.floor(centres.length / 2)]; conLabel(sc.x, sc.z, "= =", col, -18);
    } else {
      var w = wallById(c.wall),
        r = wallById(c.ref);
      if (!w) return;
      var gw = wallGeom(w),
        gr = r ? wallGeom(r) : null;
      var mx = (gw.a.x + gw.b.x) / 2,
        mz = (gw.a.z + gw.b.z) / 2;
      if (c.type !== "offset") {
        var relationLabels = {
          parallel: "∥", perpendicular: "⊥", collinear: "—", equalLength: "=L",
          horizontal: "H", vertical: "V",
        };
        conLabel(mx, mz,
        report ? "(" + (relationLabels[c.type] || c.type) + ")"
          : relationLabels[c.type] || c.type, col, -18);
        traceWallCentre(w);
        pc.stroke();
        pc.setLineDash([]);
        return;
      }
      if (!r || !gr) return;
      // foot of the perpendicular on the reference wall's centreline
      var tpar = (mx - gr.a.x) * gr.ux + (mz - gr.a.z) * gr.uz;
      var fx = gr.a.x + gr.ux * tpar,
        fz = gr.a.z + gr.uz * tpar;
      var onx = -gr.uz, onz = gr.ux;
      if (c.refFace === 1 || c.refFace === -1) {
        fx += onx * c.refFace * (r.thickness || 0) / 2;
        fz += onz * c.refFace * (r.thickness || 0) / 2;
      }
      if (c.wallFace === 1 || c.wallFace === -1) {
        mx += onx * c.wallFace * (w.thickness || 0) / 2;
        mz += onz * c.wallFace * (w.thickness || 0) / 2;
      }
      pc.beginPath();
      pc.moveTo(sx(fx), sz(fz));
      pc.lineTo(sx(mx), sz(mz));
      pc.stroke();
      conLabel((fx + mx) / 2, (fz + mz) / 2, Math.abs(Math.round(c.value)) + "", col);
    }
    pc.setLineDash([]);
    } catch (err) {
      pc.shadowBlur = 0;
      pc.setLineDash([]);
    }
  });
  conForLabel = null;
  pc.restore();
}

/* Reveal the actual pieces a relation touches, not only its small label. This
   is deliberately limited to hover/selection: drawing every referenced wall
   twice all the time would turn a dense constrained plan into blue fog. */
function drawConTargetHighlight(c, col, hot) {
  if (!hot) return;
  var wallIds = {}, points = [], openings = [];
  function wall(id) { if (id != null && wallById(id)) wallIds[id] = 1; }
  function anchor(an) {
    if (!an || typeof an !== "object") return;
    wall(an.wall);
    var p = anchorPos(an);
    if (p) points.push(p);
  }
  function sector(sec) {
    if (!sec) return;
    anchor(sec.joint); wall(sec.w1); wall(sec.w2);
  }
  function opening(id) {
    var o = openingById(id), p = openingPos(o);
    if (!o || !p) return;
    wall(o.wall); openings.push(p);
  }
  wall(c.wall); wall(c.ref); wall(c.w1); wall(c.w2);
  (c.walls || []).forEach(wall);
  if (c.axis) wall(c.axis.id);
  anchor(c.a); anchor(c.b); anchor(c.point); anchor(c.joint);
  sector(c.referenceAngle); sector(c.drivenAngle);
  opening(c.opening);
  if (c.type === "openAlign") { opening(c.a); opening(c.b); }
  (c.openings || []).forEach(opening);

  pc.save();
  pc.shadowBlur = 0;
  pc.setLineDash([]);
  pc.globalAlpha = 0.32;
  pc.strokeStyle = col;
  pc.lineWidth = 8;
  Object.keys(wallIds).forEach(function (id) {
    var w = wallById(isNaN(Number(id)) ? id : Number(id));
    if (!w) return;
    traceWallCentre(w);
    pc.stroke();
  });
  pc.globalAlpha = 0.92;
  pc.lineWidth = 2;
  points.concat(openings).forEach(function (p) {
    pc.beginPath(); pc.arc(sx(p.x), sz(p.z), 8, 0, Math.PI * 2); pc.stroke();
  });
  pc.restore();
}

/* The live opening of a sector, in degrees, for the reference readouts. */
function conAngleOf(sec) {
  if (!sec) return null;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  if (ni == null || !w1 || !w2) return null;
  var J = S.nodes[ni],
    f1 = w1.a === ni ? S.nodes[w1.b] : S.nodes[w1.a],
    f2 = w2.a === ni ? S.nodes[w2.b] : S.nodes[w2.a];
  if (!J || !f1 || !f2) return null;
  var d = (Math.atan2(f2.z - J.z, f2.x - J.x) - Math.atan2(f1.z - J.z, f1.x - J.x)) * 180 / Math.PI;
  return ((d % 360) + 360) % 360;
}
function fmtDeg(v) {
  return v == null ? "?" : (Math.round(v * 10) / 10) + "\u00b0";
}

function drawAngleConstraint(sec, txt, col, radius) {
  if (!sec) return;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  if (ni == null || !w1 || !w2) return;
  var J = S.nodes[ni], f1 = w1.a === ni ? S.nodes[w1.b] : S.nodes[w1.a],
    f2 = w2.a === ni ? S.nodes[w2.b] : S.nodes[w2.a];
  if (!J || !f1 || !f2) return;
  var X = sx(J.x), Y = sz(J.z);
  var a1 = Math.atan2(sz(f1.z) - Y, sx(f1.x) - X),
    a2 = Math.atan2(sz(f2.z) - Y, sx(f2.x) - X),
    d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  pc.setLineDash([]); pc.beginPath(); pc.moveTo(X, Y);
  pc.arc(X, Y, radius, a1, a1 + d, d < 0); pc.strokeStyle = col; pc.stroke();
  var mid = a1 + d / 2;
  conLabel(J.x, J.z, txt, col, Math.sin(mid) * (radius + 13));
}

/* Where each constraint's label ended up this frame, in SCREEN pixels, so a
   click can pick the constraint it belongs to.

   Recorded by the drawing code rather than recomputed by a hit-tester: the
   label positions come out of a dozen little per-type layouts (an arc's
   bisector, a wall midpoint offset by -18, the foot of a perpendicular), and a
   second implementation of all that would drift out of agreement with what is
   actually on screen — which is the one thing a pick target may never do. */
var conHits = [];
export function conHitTargets() {
  return conHits;
}
/* The constraint whose label box is under this screen point, or null. Boxes
   are small and may overlap on a dense plan, so the LAST one drawn wins —
   that is the one painted on top, i.e. the one the user can see. */
/* Constraint labels are annotations, so a hidden or overridden-unpickable
   annotations layer takes them out of the hit test entirely. Rank 1 still
   picks: an off-work-set constraint label is worth selecting, it just does not
   win over a focused layer, and that ordering is the caller's to apply. */
export function pickCon(sxp, syp) {
  if (!isFinite(layerRank("annotations"))) return null;
  for (var i = conHits.length - 1; i >= 0; i--) {
    var h = conHits[i];
    if (sxp >= h.x - h.w / 2 - 2 && sxp <= h.x + h.w / 2 + 2 &&
      syp >= h.y - 10 && syp <= h.y + 10) return h.con;
  }
  return null;
}
// the constraint currently being drawn, so conLabel can tag its hit box
var conForLabel = null;
var conHot = false;
var conLabelOcc = [];
const RELATION_CONS = {
  parallel: 1, perpendicular: 1, collinear: 1, equalLength: 1, equalLengthSet: 1,
  horizontal: 1, vertical: 1, coincident: 1, symmetric: 1, midpoint: 1,
  pointOnLine: 1, equalSpacing: 1, openAlign: 1, openSpacing: 1, openCentre: 1,
};

function conLabelOverlaps(x, y, w) {
  var pad = 3, h = 16;
  for (var i = 0; i < conLabelOcc.length; i++) {
    var p = conLabelOcc[i];
    if (Math.abs(x - p.x) < (w + p.w) / 2 + pad && Math.abs(y - p.y) < h + pad)
      return true;
  }
  return false;
}

// a boxed number on the plan — plain text over a wall hatch is unreadable
function conLabel(wxc, wzc, txt, col, dy) {
  var scr = rotatePx(sx(wxc), sz(wzc));
  scr.y += dy || 0;
  pc.save();
  pc.font = "600 11px system-ui, sans-serif";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var wpx = pc.measureText(String(txt)).width + 10;
  var relation = !!(conForLabel && RELATION_CONS[conForLabel.type]);
  var offsets = [0, -18, 18, -34, 34, -50, 50],
    placed = false,
    oy = 0,
    i;
  for (i = 0; i < offsets.length; i++) {
    oy = offsets[i];
    if (!conLabelOverlaps(scr.x, scr.y + oy, wpx)) {
      placed = true;
      break;
    }
  }
  /* Relation glyphs (∥ ⊥ =L …) that would still sit on a number are hidden
     unless the constraint is hovered or selected — otherwise a dense plan
     becomes an unpickable stack of identical boxes. Driving dimensions always
     stay, even if they have to share a slot. */
  if (!placed && relation && !conHot) {
    pc.restore();
    return;
  }
  scr.y += oy;
  var base = unrotatePx(scr.x, scr.y),
    x = base.x,
    y = base.y,
    a = planRotRad();
  if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); }
  if (conForLabel) {
    conHits.push({ con: conForLabel, x: scr.x, y: scr.y, w: wpx });
    conLabelOcc.push({ x: scr.x, y: scr.y, w: wpx });
  }
  pc.setLineDash([]);
  pc.fillStyle = "rgba(255,255,255,.9)";
  pc.strokeStyle = col;
  pc.lineWidth = 1;
  pc.beginPath();
  if (pc.roundRect) pc.roundRect(x - wpx / 2, y - 8, wpx, 16, 5);
  else pc.rect(x - wpx / 2, y - 8, wpx, 16);
  pc.fill();
  pc.stroke();
  pc.fillStyle = col;
  pc.fillText(txt, x, y);
  pc.restore();
}

function label(wx_, wz_, txt, color, big) {
  var x = sx(wx_),
    y = sz(wz_);
  var a = planRotRad();
  pc.save();
  if (a) { pc.translate(x, y); pc.rotate(-a); pc.translate(-x, -y); } // keep text upright
  pc.font = big ? "bold 12px Arial" : "10px Arial";
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  var tw = pc.measureText(txt).width,
    h = big ? 17 : 14;
  pc.fillStyle = "rgba(255,255,255," + (big ? ".8" : ".75") + ")";
  pc.fillRect(x - tw / 2 - 4, y - h / 2, tw + 8, h);
  pc.fillStyle = color || "#33312c";
  pc.fillText(txt, x, y);
  pc.restore();
}
