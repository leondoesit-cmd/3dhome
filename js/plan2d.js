// 2D top-down floor plan: view transform + canvas rendering of rooms, walls, openings, items, overlays.
import { S } from "./state.js";
import {
  detectRooms, roomName, roomHidden, hiddenSets, wallBounds, wallGeom, wallById,
  contentBounds, wallPointAt, roomEdgeHandles, roomByKey,
} from "./geometry.js";
import "./wall_types.js";
import { offsetGhost, touchDrawing } from "./wall_draw.js";
import { pointAtWall, makeArcFromThreePoints } from "./wall_curves.js";
import "./floors.js";
import { FURN, itemVSpan, vspec } from "./furniture.js";
import "./smarthome.js";
import { planCab } from "./cabinet.js";
import { t } from "./i18n.js";
import { SITE, llToLocalCm } from "./site.js";
import { drawMEP, mepAliveCount } from "./mep.js";
import { isElevation, drawElevation } from "./elevation.js";
import "./touch_precision.js";
import "./touch_precision_ui.js";
import { itemCorners } from "./measure.js";
import { markers } from "./markers.js";
import { planIndex } from "./spatial_index.js";
import { activeWarnings } from "./constraint_engine.js";
import "./wall_constraints.js";
import { sx, sz, planRotRad, toBasePx, fitTransform } from "./plan_view.js";
import { blueprintBounds, drawBlueprintUnderlay, drawBlueprintLinework } from "./blueprint_trace.js";
import "./slab_openings.js";
import "./swing_clearance.js";
import "./plan_sync.js";
import { isLayerVisible, isLayerGhosted, isLayerHidden } from "./layers.js";
import "./user_layers.js";
import { roomClearArea } from "./room_area.js";
import { fmtAreaM2 } from "./display_units.js";
import "./unit_settings.js";
import { isPresentation } from "./plan_style.js";
import "./plan_patterns.js";
import "./plan_material_fill.js";
import "./primitives.js";
import "./plan_sprites.js";
import "./plan_sprite_key.js";
import "./plan_labels.js";
import { symbolPrims, stairShape } from "./plan_symbols.js";
import "./room_summary.js";
import "./state.js";
import { conHitTargets, label, pickCon } from "./plan2d/constraints.js";
import {
  doorsGlyph, drawCabinetPlanSwings, drawItem, drawPresentationRoomLabels,
  drawStairsUp, drawSymbolPrims, drawWallCons, gCirc, gStroke, warnLabel,
} from "./plan2d/items.js";
import {
  drawCachedRooms, drawNodes, drawOpening, drawPresentationWalls,
  drawReferenceFloor, drawSegPreview, drawSnapFlash, drawWallAngleGuide,
  drawWallProbe, drawWarnGlow, ensureAngleGuideAnim,
} from "./plan2d/walls.js";
import {
  drawAngleArc, drawFreeAnnotations, drawGhostWall, drawLen, drawMarkers,
  drawMeasureOverlay, drawOverallDims, drawPlanCursors, drawPreviewDims,
  drawRank, drawScale, drawSize, drawSlabOpenings, drawSnapMark,
  drawTouchGuide, drawWalker, drawWall, markerCard, nodeCard, onAfterRender,
  planLen, segBearing, touchLensDistanceMap,
} from "./plan2d/overlays.js";
export { onAfterRender, segBearing, touchLensDistanceMap };
export { drawCabinetPlanSwings, warnLabel };
export { conHitTargets, pickCon };
// for js/plan2d/constraints.js (live bindings: it sees every reassignment)
export { RELATION_CONS, conForLabel, conHits, conHot, conLabelOcc, pc };
// for js/plan2d/items.js (live bindings: it sees every reassignment)
export {
  ERASE_COL, GLYPH, LN, chromeOn, labelMeasCache, rr, set_conForLabel,
  set_conHits, set_conHot, set_conLabelOcc, set_labelMeasCache,
};
// for js/plan2d/walls.js (live bindings: it sees every reassignment)
export {
  LAWN_MARGIN, PAVE_CM, WARN_COL, angleGuideAnimOn, angleGuideLastFrame,
  proxied, roomLayer, set_angleGuideAnimOn, set_angleGuideLastFrame,
  set_roomLayer, set_snapFlashT, snapFlashT, warnPhase,
};
// for js/plan2d/overlays.js (live bindings: it sees every reassignment)
export { MK_COL, afterRender, planViewReady };

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
  // an imported DXF's line work: over the room fills, under furniture and walls
  band("underlay", function () { drawBlueprintLinework(pc, sx, sz); });
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
      drawLen(draftArc.L) + "  R" + Math.round(draftArc.radius), "#3f6b78");
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
        drawSize(rx1 - rx0, rz1 - rz0),
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
          drawSize(bx1 - bx0 - th, bz1 - bz0 - th),
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
          : drawSize(rmG.size.w, rmG.size.d) + modeSuffix, rmCol);
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

/* ---- placeholder points ----
   A crosshair target rather than a plain dot: the four arms are the same four
   axes its clearances are measured along, so the glyph reads as "measured from
   here". Hollow = free, filled = something is standing on it. */
const MK_COL = "#d6336c";

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


const ERASE_COL = "#c44c43";

/* Room fills are identical across MEP-flow and warning-pulse frames: the
   topology and the view transform have not moved. Paint them onto an offscreen
   layer keyed by that state and blit it, so an idle animated overlay does not
   re-tessellate every enclosure sixty times a second. */
var roomLayer = { key: "", canvas: null, rooms: null, hid: null };
function set_roomLayer(value) { return roomLayer = value; }

/* Lawn round the house and a paving ring hugging its outside, for the
   presentation plan. Painted into the cached room layer, before the rooms, so
   it costs nothing on an ordinary repaint. The ring needs no polygon offset:
   every room outline is stroked wide with round joins, and the rooms painted
   next cover the inside half of that stroke. Skipped under a site aerial, which
   is the real ground. */
var LAWN_MARGIN = 600, PAVE_CM = 110;

/* A piece that just snapped blinks for a moment (js/interaction.js sets
   S.snapFlash). Without it the piece simply JUMPS and the editor looks like it
   moved something on its own; with it, the jump has a visible cause. The pulse
   fades out and the last frame clears the flag, so nothing keeps repainting. */
var snapFlashT = 0;
function set_snapFlashT(value) { return snapFlashT = value; }

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
function set_angleGuideAnimOn(value) { return angleGuideAnimOn = value; }
let angleGuideLastFrame = 0;
function set_angleGuideLastFrame(value) { return angleGuideLastFrame = value; }

/* The glow the constraint engine asks for: a breathing halo on every corner it
   has a complaint about. Red = a wall end connected to nothing, amber = a joint
   that isn't a right angle. The one under the cursor — whether the cursor is
   over the canvas or over its row in the message list — burns brighter, gets
   its walls traced, and says what it is; that shared highlight is what ties the
   list and the plan together. */
const WARN_COL = { openEnd: [225, 62, 62], angle: [222, 150, 24] };

/* top-view glyphs, drawn in the item's local (rotated) pixel space: x=width, y=depth, front=+y */
var LN = "rgba(60,58,50,.5)",
  LNS = "rgba(60,58,50,.7)";
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

/* Presentation room labels: the name in bold capitals with its size under
   it, haloed so they read over any floor texture. Sizes go through the plan's
   length formatter, so a feet project reads 21'-6" X 16'-0". */
var labelMeasCache = { key: "", byRoom: {} };
function set_labelMeasCache(value) { return labelMeasCache = value; }

/* Where each constraint's label ended up this frame, in SCREEN pixels, so a
   click can pick the constraint it belongs to.

   Recorded by the drawing code rather than recomputed by a hit-tester: the
   label positions come out of a dozen little per-type layouts (an arc's
   bisector, a wall midpoint offset by -18, the foot of a perpendicular), and a
   second implementation of all that would drift out of agreement with what is
   actually on screen — which is the one thing a pick target may never do. */
var conHits = [];
function set_conHits(value) { return conHits = value; }
// the constraint currently being drawn, so conLabel can tag its hit box
var conForLabel = null;
function set_conForLabel(value) { return conForLabel = value; }
var conHot = false;
function set_conHot(value) { return conHot = value; }
var conLabelOcc = [];
function set_conLabelOcc(value) { return conLabelOcc = value; }
const RELATION_CONS = {
  parallel: 1, perpendicular: 1, collinear: 1, equalLength: 1, equalLengthSet: 1,
  horizontal: 1, vertical: 1, coincident: 1, symmetric: 1, midpoint: 1,
  pointOnLine: 1, equalSpacing: 1, openAlign: 1, openSpacing: 1, openCentre: 1,
};

