/* The ghost of the other storey under the plan (the "reference floor",
   js/floors.js), and the framing that uses it, split out of js/plan2d/walls.js
   and js/plan2d.js.

   The reference storey is a stored scene that does not change while it is not
   active (switching or editing it replaces floor.scene with a fresh clone), so
   everything about it that is world geometry — wall outlines, the stairs'
   line-work, furniture footprints, its bounds — is computed once per scene
   object and kept in a WeakMap. A render then only maps cached points to the
   screen. */
import { floorAbove, floorBelow, floorById, referenceFloorScene } from "../floors.js";
import { floorDisplayName, floorText } from "../floor_strings.js";
import { vspec } from "../furniture.js";
import { contentBounds } from "../geometry.js";
import { canvasToneIsDark } from "../plan_grid.js";
import { symbolPrims } from "../plan_symbols.js";
import { planRotRad, rotatePx, sx, sz } from "../plan_view.js";
import { S } from "../state.js";
import { curvedWallOutline } from "../wall_curves.js";
import { pc, plan } from "../plan2d.js";

var refGeomCache = new WeakMap();

function refFinite(v) { return typeof v === "number" && isFinite(v); }

function refItemPoint(it, lx, lz) {
  var a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c };
}

function refFootprint(it) {
  var w = it.w / 2, d = it.d / 2;
  return [refItemPoint(it, -w, -d), refItemPoint(it, w, -d), refItemPoint(it, w, d), refItemPoint(it, -w, d)];
}

// the stairs' drafting symbol in world points: rects and polys as closed
// rings, lines as two-point runs; circles, arcs and text are left out
function refStairRuns(it) {
  var sit = { steps: it.steps, configuration: it.configuration, shape: vspec(it).shape };
  var runs = [];
  var prims = [];
  try { prims = symbolPrims("stairs", it.w, it.d, sit) || []; } catch (_) { prims = []; }
  prims.forEach(function (p) {
    if (!p) return;
    if (p.k === "line") runs.push({ closed: false, pts: [refItemPoint(it, p.x1, p.z1), refItemPoint(it, p.x2, p.z2)] });
    else if (p.k === "rect") runs.push({ closed: true, pts: [refItemPoint(it, p.x, p.z), refItemPoint(it, p.x + p.w, p.z), refItemPoint(it, p.x + p.w, p.z + p.d), refItemPoint(it, p.x, p.z + p.d)] });
    else if (p.k === "poly" && Array.isArray(p.pts)) runs.push({ closed: !!p.closed, pts: p.pts.map(function (q) { return refItemPoint(it, q.x, q.z); }) });
  });
  return runs;
}

export function refFloorGeometry(scene) {
  if (!scene || typeof scene !== "object") return null;
  var cached = refGeomCache.get(scene);
  if (cached) return cached;
  var sp = scene.spatial || scene,
    nodes = sp.nodes || scene.nodes || [], walls = sp.walls || scene.walls || [],
    items = sp.instances || sp.items || scene.items || [];
  var minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  var grow = function (p) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z;
  };
  var polys = [];
  walls.forEach(function (w) {
    if (!w) return;
    var poly = [];
    try { poly = curvedWallOutline(w, w.thickness || 10, nodes, 20) || []; } catch (_) { poly = []; }
    poly = poly.filter(function (p) { return p && refFinite(p.x) && refFinite(p.z); });
    if (poly.length < 3) return;
    poly.forEach(grow);
    polys.push(poly);
  });
  var stairs = [], boxes = [];
  items.forEach(function (it) {
    if (!it || !refFinite(it.x) || !refFinite(it.z) || !(it.w > 0) || !(it.d > 0)) return;
    var foot = refFootprint(it);
    foot.forEach(grow);
    if (it.type === "stairs") stairs.push({ foot: foot, runs: refStairRuns(it) });
    else boxes.push(foot);
  });
  var bounds = minx <= maxx && minz <= maxz
    ? { minx: minx, minz: minz, maxx: maxx, maxz: maxz, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2, w: maxx - minx, d: maxz - minz }
    : null;
  var geom = { polys: polys, stairs: stairs, boxes: boxes, bounds: bounds };
  refGeomCache.set(scene, geom);
  return geom;
}

function refRing(pts, closed) {
  for (var i = 0; i < pts.length; i++) {
    if (i) pc.lineTo(sx(pts[i].x), sz(pts[i].z));
    else pc.moveTo(sx(pts[i].x), sz(pts[i].z));
  }
  if (closed) pc.closePath();
}

// colours per canvas tone: a lavender that reads on the dark plan and an
// indigo that reads on the light one, both translucent and dashed
var REF_INK = {
  dark: { line: "rgba(196,190,255,.62)", fill: "rgba(196,190,255,.08)", stair: "rgba(214,209,255,.85)", box: "rgba(196,190,255,.22)", text: "rgba(226,222,255,.92)", halo: "rgba(20,22,32,.72)" },
  light: { line: "rgba(76,70,150,.55)", fill: "rgba(76,70,150,.07)", stair: "rgba(66,60,140,.8)", box: "rgba(76,70,150,.2)", text: "rgba(52,47,112,.95)", halo: "rgba(255,255,255,.78)" },
};

function refLabelText() {
  var ws = S.workspace;
  var floor = ws && floorById(ws.referenceFloor, ws);
  if (!floor) return "";
  var above = floorAbove(ws), below = floorBelow(ws);
  var name = floorDisplayName(floor, (ws.floors || []).indexOf(floor));
  if (below && below.id === floor.id) return floorText("tagBelow", { name: name });
  if (above && above.id === floor.id) return floorText("tagAbove", { name: name });
  return name;
}

export function drawRefFloorOverlay() {
  var scene = referenceFloorScene(S.workspace);
  if (!scene) return;
  var g = refFloorGeometry(scene);
  if (!g || (!g.polys.length && !g.stairs.length && !g.boxes.length)) return;
  var ink = REF_INK[canvasToneIsDark(plan) ? "dark" : "light"];
  pc.save();
  pc.setLineDash([7, 5]);
  pc.lineWidth = 1.2;
  pc.strokeStyle = ink.line;
  pc.fillStyle = ink.fill;
  for (var i = 0; i < g.polys.length; i++) {
    pc.beginPath();
    refRing(g.polys[i], true);
    pc.fill();
    pc.stroke();
  }
  // other furniture: only a very faint footprint, enough to recognise a room
  if (g.boxes.length) {
    pc.setLineDash([]);
    pc.lineWidth = 1;
    pc.strokeStyle = ink.box;
    pc.beginPath();
    for (var b = 0; b < g.boxes.length; b++) refRing(g.boxes[b], true);
    pc.stroke();
  }
  // the stairs: footprint dashed, treads and walking line solid
  if (g.stairs.length) {
    pc.strokeStyle = ink.stair;
    for (var s = 0; s < g.stairs.length; s++) {
      var st = g.stairs[s];
      pc.setLineDash([5, 4]);
      pc.lineWidth = 1.4;
      pc.beginPath();
      refRing(st.foot, true);
      pc.stroke();
      pc.setLineDash([]);
      pc.lineWidth = 1;
      pc.beginPath();
      for (var r = 0; r < st.runs.length; r++) refRing(st.runs[r].pts, st.runs[r].closed);
      pc.stroke();
    }
  }
  var bb = g.bounds, text = bb && refLabelText();
  if (text) {
    // upright whatever the plan's rotation, centred just outside the far edge
    // (the corners are where the floor strip and the layer chips float)
    pc.setLineDash([]);
    pc.translate(sx(bb.cx), sz(bb.minz));
    pc.rotate(-planRotRad());
    pc.font = "600 12px system-ui, sans-serif";
    pc.textAlign = "center";
    pc.textBaseline = "bottom";
    pc.lineWidth = 3;
    pc.strokeStyle = ink.halo;
    pc.strokeText(text, 0, -8);
    pc.fillStyle = ink.text;
    pc.fillText(text, 0, -8);
  }
  pc.restore();
}

/* What "Fit" frames. An active storey with no walls and no furniture frames
   the storey shown under it instead of a synthetic block, so a new storey
   opens right over the one below. Everything else frames its own content. */
export function planFrameBounds() {
  if (!S.walls.length && !S.items.length) {
    var scene = referenceFloorScene(S.workspace);
    var g = scene && refFloorGeometry(scene);
    if (g && g.bounds) return g.bounds;
  }
  return contentBounds();
}

/* True when some of what Fit would frame is inside the visible canvas — the
   test a storey switch uses to keep the view instead of refitting. */
export function planFrameOnScreen() {
  if (!(S.SC > 0) || !isFinite(S.SC) || !(S.CW > 0) || !(S.CH > 0)) return false;
  var bb = planFrameBounds();
  if (!bb || ![bb.minx, bb.minz, bb.maxx, bb.maxz].every(isFinite)) return false;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  [[bb.minx, bb.minz], [bb.maxx, bb.minz], [bb.maxx, bb.maxz], [bb.minx, bb.maxz]].forEach(function (p) {
    var q = rotatePx(sx(p[0]), sz(p[1]));
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  });
  // at least a 40 px sliver of it must show
  return x1 > 40 && y1 > 40 && x0 < S.CW - 40 && y0 < S.CH - 40;
}
