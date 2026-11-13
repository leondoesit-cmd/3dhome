/* The plan's outside dimension chains (js/dim_chain.js builds them): on all
   four sides of the building (the overall size stands outside the top and
   left ones),
   every wall thickness and every clear span between walls in plan order. The
   per-wall numbers that used to sit inside the rooms are left off for every
   wall a chain states, and for every wall of a room whose clear size its
   label prints (drawWall asks chainCoveredWall; drawRoomLabels asks
   roomInteriorSize) — the sales-plan / home-design-app convention: rooms
   carry their size, the walls stay clean, and a wall's own length appears
   when it is hovered or selected. Hovering or selecting a wall lights its
   own numbers here, with dashed leaders back to it. */
import { fmtLen } from "../display_units.js";
import { chainSegsOf, dimChain } from "../dim_chain.js";
import { roomHidden, wallGeom, wallOutline } from "../geometry.js";
import { roomMeasurements } from "../room_summary.js";
import { planRotRad, sx, sz } from "../plan_view.js";
import { S } from "../state.js";
import { normalizeWallKind } from "../wall_curves.js";
import { pc } from "../plan2d.js";

/* Screen px from the building's outer face to the chain line; the overall
   dimension (drawOverallDims) stands outside it at OVERALL_DIM_PX. */
var CHAIN_DIM_PX = 18;
var OVERALL_DIM_PX = 46;
var CHAIN_HOT = "#2c5560";
var CHAIN_DIM_ALPHA = 0.6; // numbers that are not in focus (see drawChain)
var CHAIN_FONT = "'Inter', system-ui, 'Segoe UI', sans-serif";

var planChains = null;

/* Rebuilt once per model paint from the walls on screen (`hid` is the paint's
   hidden-set map), before any wall is drawn, so drawWall knows which walls
   the chains already dimension. `rooms` are the paint's detected rooms: a
   rectangular one gets its clear size (roomMeasurements) and its walls drop
   their own numbers. */
function refreshDimChains(hid, rooms) {
  var walls = [];
  (S.walls || []).forEach(function (w) {
    if (!w || (hid && hid.walls && hid.walls[w.id])) return;
    if (!S.nodes[w.a] || !S.nodes[w.b] || normalizeWallKind(w) === "roomDivider") return;
    var g = wallGeom(w);
    if (!g || g.kind === "arc" || !(g.L > 0.5)) return;
    walls.push({ id: w.id, ang: Math.atan2(g.b.z - g.a.z, g.b.x - g.a.x), pts: wallOutline(w) });
  });
  var pts = {};
  walls.forEach(function (w) { pts[w.id] = w.pts; });
  var side = chainSides(walls), chains = {
    top: dimChain(side.top, "x"), bottom: dimChain(side.bottom, "x"),
    left: dimChain(side.left, "z"), right: dimChain(side.right, "z"),
  }, covered = {};
  Object.keys(chains).forEach(function (k) {
    Object.keys(chains[k].walls).forEach(function (id) { covered[id] = true; });
  });
  var sizes = {};
  (rooms || []).forEach(function (r) {
    if (!r || roomHidden(r.key)) return;
    var m = roomMeasurements(S, r);
    if (!m || !m.interior) return;
    sizes[r.key] = m.interior;
    String(r.key).split(",").forEach(function (id) { covered[id] = true; });
  });
  planChains = { chains: chains, pts: pts, exterior: side.exterior, covered: covered, sizes: sizes };
  return planChains;
}

/* A room's clear size { width, depth } (cm) when it is a plain rectangle the
   label states, else null. */
function roomInteriorSize(key) {
  return (planChains && planChains.sizes[key]) || null;
}

/* Which walls each outside chain reads, and which walls are the building's
   shell. A chain along the top states what you meet walking along the top
   face — the walls that reach it — not every partition anywhere in the plan
   projected onto it: a bathroom/corridor wall in the middle column used to
   cut Bedroom 2's left-side span (390) into 240 + 10 + 140, numbers that
   belong to no room on that side. Walls the chains leave out keep their own
   number on the plan (chainCovers). A wall is exterior when its footprint
   lies on the building's outer bounds. */
function chainSides(walls) {
  var bb = { minx: Infinity, minz: Infinity, maxx: -Infinity, maxz: -Infinity }, band = 0;
  walls.forEach(function (w) {
    w.pts.forEach(function (p) {
      bb.minx = Math.min(bb.minx, p.x); bb.maxx = Math.max(bb.maxx, p.x);
      bb.minz = Math.min(bb.minz, p.z); bb.maxz = Math.max(bb.maxz, p.z);
    });
    var t = (S.walls.find(function (sw) { return sw.id === w.id; }) || {}).thickness;
    if (t > band) band = t;
  });
  band += 2; // a partition reaching a face stops at its inner side
  var top = [], bottom = [], left = [], right = [], exterior = {};
  walls.forEach(function (w) {
    var lo = { x: Infinity, z: Infinity }, hi = { x: -Infinity, z: -Infinity };
    w.pts.forEach(function (p) {
      lo.x = Math.min(lo.x, p.x); lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x); hi.z = Math.max(hi.z, p.z);
    });
    if (lo.z <= bb.minz + band) top.push(w);
    if (hi.z >= bb.maxz - band) bottom.push(w);
    if (lo.x <= bb.minx + band) left.push(w);
    if (hi.x >= bb.maxx - band) right.push(w);
    var horiz = Math.abs(Math.cos(w.ang)) > Math.abs(Math.sin(w.ang));
    if (horiz ? (lo.z <= bb.minz + 0.5 || hi.z >= bb.maxz - 0.5)
      : (lo.x <= bb.minx + 0.5 || hi.x >= bb.maxx - 0.5)) exterior[w.id] = true;
  });
  return { top: top, bottom: bottom, left: left, right: right, exterior: exterior };
}

function chainCoveredWall(w) {
  return !!(w && S.showDims && planChains && planChains.covered[w.id]);
}

/* The walls whose numbers are lit: the one under the cursor and the selected. */
function hotWallIds() {
  var ids = [];
  if (S.hoverWall && S.hoverWall.id != null) ids.push(S.hoverWall.id);
  var s = S.sel;
  if (s && s.kind === "wall" && s.ref) ids.push(s.ref.id);
  else if (s && s.kind === "walls" && s.refs) s.refs.forEach(function (w) { if (w) ids.push(w.id); });
  return ids;
}

/* A chain number, upright whatever the plan rotation, centred at (X, Y) on a
   small backing so it reads on a dark grid too. Returns its extent along the
   chain, in px, so the caller can keep neighbours apart. */
function chainText(X, Y, txt, alongX, hot) {
  var a = planRotRad(), t = (alongX ? 0 : Math.PI / 2) + a;
  while (t >= Math.PI / 2 - 1e-6) t -= Math.PI;
  while (t < -Math.PI / 2 - 1e-6) t += Math.PI;
  pc.save();
  pc.font = (hot ? "700 11px " : "600 10.5px ") + CHAIN_FONT;
  var tw = pc.measureText(txt).width;
  pc.translate(X, Y);
  pc.rotate(t - a);
  pc.textAlign = "center";
  pc.textBaseline = "middle";
  pc.fillStyle = hot ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.82)";
  pc.fillRect(-tw / 2 - 2.5, -6.5, tw + 5, 13);
  pc.fillStyle = hot ? CHAIN_HOT : "#4f483d";
  pc.fillText(txt, 0, 0.5);
  pc.restore();
  return tw + 5;
}
function chainTextWidth(txt, hot) {
  pc.save();
  pc.font = (hot ? "700 11px " : "600 10.5px ") + CHAIN_FONT;
  var w = pc.measureText(txt).width + 5;
  pc.restore();
  return w;
}

/* One chain: `alongX` = a row along x (top or bottom), else a column (left or
   right); `far` = the bottom / right side. `o` is the outward direction in
   screen px (-1 above / left of the building, +1 below / right). */
function drawChain(chain, bb, alongX, far, hot) {
  if (!chain || !chain.segs.length) return;
  var o = far ? 1 : -1,
    face = alongX ? sz(far ? bb.maxz : bb.minz) : sx(far ? bb.maxx : bb.minx),
    line = face + o * CHAIN_DIM_PX,
    P = function (v, off) { return alongX ? [sx(v), off] : [off, sz(v)]; },
    toPx = alongX ? sx : sz;
  var pts = [];
  chain.segs.forEach(function (s, i) {
    if (!i) pts.push(s.a);
    pts.push(s.b);
  });
  pc.save();
  pc.lineCap = "butt";
  pc.strokeStyle = "rgba(107,99,86,.75)";
  pc.lineWidth = 1;
  pc.beginPath();
  var p0 = P(pts[0], line), p1 = P(pts[pts.length - 1], line);
  pc.moveTo(p0[0], p0[1]);
  pc.lineTo(p1[0], p1[1]);
  // witness line from near the building to past the chain, and the oblique
  // tick architectural chains are read by
  pts.forEach(function (v) {
    var e0 = P(v, face + o * 3), e1 = P(v, line + o * 4), c = P(v, line);
    pc.moveTo(e0[0], e0[1]);
    pc.lineTo(e1[0], e1[1]);
    pc.moveTo(c[0] - 3, c[1] + 3);
    pc.lineTo(c[0] + 3, c[1] - 3);
  });
  pc.stroke();
  pc.restore();
  var lit = [];
  hot.forEach(function (id) {
    chainSegsOf(chain, id).forEach(function (s) { if (lit.indexOf(s) === -1) lit.push(s); });
  });
  if (lit.length) {
    pc.save();
    pc.strokeStyle = CHAIN_HOT;
    pc.lineWidth = 2.2;
    pc.beginPath();
    lit.forEach(function (s) {
      var a = P(s.a, line), b = P(s.b, line);
      pc.moveTo(a[0], a[1]);
      pc.lineTo(b[0], b[1]);
    });
    pc.stroke();
    // dashed leaders from the lit wall's own ends out to its numbers
    pc.lineWidth = 1;
    pc.setLineDash([4, 3]);
    pc.beginPath();
    hot.forEach(function (id) {
      var e = chain.walls[id], wp = planChains.pts[id];
      if (!e || !wp) return;
      var near = far ? -Infinity : Infinity;
      wp.forEach(function (p) {
        var v = alongX ? p.z : p.x;
        near = far ? Math.max(near, v) : Math.min(near, v);
      });
      var from = alongX ? sz(near) : sx(near);
      [e.lo, e.hi].forEach(function (v) {
        var a = P(v, from), b = P(v, line);
        pc.moveTo(a[0], a[1]);
        pc.lineTo(b[0], b[1]);
      });
    });
    pc.stroke();
    pc.restore();
  }
  /* Each number on the outer side of the line when it fits its segment. A
     wall thickness too narrow for its number drops to the inner side, between
     the line and the building, where the clear spans never write; a clear
     span too narrow is left off. A lit segment always shows its number. */
  /* Emphasis: with nothing hovered or selected, the shell's own numbers are
     full strength and the rest stand back at 60%; a hovered or selected wall
     takes the full strength for its numbers and everything else drops to 60%. */
  var ext = planChains.exterior || {};
  var innerEnd = -Infinity, outerEnd = -Infinity;
  chain.segs.forEach(function (s) {
    var c0 = toPx(s.a), c1 = toPx(s.b), lo = Math.min(c0, c1), hi = Math.max(c0, c1),
      mid = (lo + hi) / 2, isLit = lit.indexOf(s) !== -1,
      txt = fmtLen(s.b - s.a, { domain: "plan", suffix: false }),
      w = chainTextWidth(txt, isLit),
      full = hot.length ? isLit
        : s.kind === "wall" && s.ids.some(function (id) { return ext[id]; });
    pc.globalAlpha = full ? 1 : CHAIN_DIM_ALPHA;
    if (w + 2 <= hi - lo || (isLit && mid - w / 2 > outerEnd)) {
      var at = alongX ? [mid, line + o * 7] : [line + o * 7, mid];
      chainText(at[0], at[1], txt, alongX, isLit);
      outerEnd = mid + w / 2;
    } else if (s.kind === "wall" && mid - w / 2 > innerEnd + 2) {
      var ai = alongX ? [mid, line - o * 8] : [line - o * 8, mid];
      chainText(ai[0], ai[1], txt, alongX, isLit);
      innerEnd = mid + w / 2;
    }
  });
  pc.globalAlpha = 1;
}

function drawDimChains(bb) {
  if (!bb || !planChains) return;
  var hot = hotWallIds();
  var c = planChains.chains;
  drawChain(c.top, bb, true, false, hot);
  drawChain(c.bottom, bb, true, true, hot);
  drawChain(c.left, bb, false, false, hot);
  drawChain(c.right, bb, false, true, hot);
}

export { OVERALL_DIM_PX, chainCoveredWall, drawDimChains, refreshDimChains, roomInteriorSize };
