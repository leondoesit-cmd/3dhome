/* The staircase's 3D model (FURN.stairs.build in js/furniture_models.js),
   drawn from js/stair_layout.js so the model shows exactly the steps the plan
   symbol and the code check count.

   Legacy plans (straight / L / U / curved, no configuration.stair) keep the
   look they always had: closed stringers, a sloped rail on balusters, the
   curved fan round its newel. A designed stair is one solid block per tread
   or landing (riser block + a 3 cm tread on top), winder wedges as prisms,
   and a handrail on balusters along its outer side, sloped up each flight
   and level across the landings. */
import { THREE } from "./three_lazy.js";
import { box, cyl } from "./primitives.js";
import { WOOD } from "./state.js";
import { stairLayout } from "./stair_layout.js";

var TR = 0xb09a76, BAL = 0x2b2e31;

/* A vertical prism over an x/z polygon, from y0 to y1, with the material a
   box of the same colour gets (box() makes it; the geometry is swapped). */
function prism(g, poly, y0, y1, color, opt) {
  var xs = poly.map(function (p) { return p.x; }), zs = poly.map(function (p) { return p.z; });
  var me = box(g, Math.min.apply(null, xs), Math.max.apply(null, xs), y0, y1, Math.min.apply(null, zs), Math.max.apply(null, zs), color, Object.assign({ sharp: true }, opt || {}));
  if (!me || !THREE.Shape || !THREE.ExtrudeGeometry) return me;
  var shape = new THREE.Shape();
  // shape y is -z: rotateX(-90°) then carries shape y onto world -z, depth onto +y
  poly.forEach(function (p, i) { if (i) shape.lineTo(p.x, -p.z); else shape.moveTo(p.x, -p.z); });
  shape.closePath();
  var geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, y1 - y0), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  me.geometry.dispose();
  me.geometry = geo;
  me.position.set(0, 0, 0);
  return me;
}

// a round bar between two points
function bar(g, a, b, r, color, opt) {
  var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
  if (!(L > 0.5)) return null;
  var me = cyl(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, r, L, color, opt);
  if (me && THREE.Quaternion && THREE.Vector3)
    me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  return me;
}

function buildDesigned(g, lay) {
  var R = lay.riser;
  lay.steps.forEach(function (st) {
    var y = st.top, y0 = st.k * R;
    if (st.kind !== "winder") {
      var xs = st.poly.map(function (p) { return p.x; }), zs = st.poly.map(function (p) { return p.z; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
      var a2 = 0;
      for (var i2 = 0, j2 = st.poly.length - 1; i2 < st.poly.length; j2 = i2++) a2 += st.poly[j2].x * st.poly[i2].z - st.poly[i2].x * st.poly[j2].z;
      if (Math.abs(Math.abs(a2 / 2) - (x1 - x0) * (z1 - z0)) < 1) {
        // an axis-aligned rectangle (treads, landings, a merged half landing)
        box(g, x0, x1, y0, y - 3, z0, z1, TR, { rough: 0.7, sharp: true });
        box(g, x0, x1, y - 3, y, z0, z1, TR, { rough: 0.6, radius: 0.5 });
        return;
      }
    }
    prism(g, st.poly, y0, y - 3, TR, { rough: 0.7 });
    prism(g, st.poly, y - 3, y, TR, { rough: 0.6 });
  });
  var rail = lay.rail || [];
  for (var i = 0; i + 1 < rail.length; i++) {
    var a = rail[i], b = rail[i + 1];
    bar(g, { x: a.x, y: a.y + 90, z: a.z }, { x: b.x, y: b.y + 90, z: b.z }, 2.2, WOOD, { rough: 0.45, seg: 12 });
    // balusters about one per going along the segment
    var L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(L / Math.max(12, lay.going || 28)));
    for (var q = 0; q < n; q++) {
      var f = (q + 0.5) / n, y = a.y + (b.y - a.y) * f;
      cyl(g, a.x + (b.x - a.x) * f, y + 45, a.z + (b.z - a.z) * f, 0.9, 90, BAL, { metal: 0.6, rough: 0.4, seg: 8 });
    }
  }
  if (rail.length) {
    // newel posts at the foot and the head of the rail
    var f0 = rail[0], f1 = rail[rail.length - 1];
    cyl(g, f0.x, f0.y + 47, f0.z, 3, 94, WOOD, { rough: 0.45, seg: 12 });
    cyl(g, f1.x, f1.y + 47, f1.z, 3, 94, WOOD, { rough: 0.45, seg: 12 });
  }
}

/* The catalogue builder: `V` is the item's variant spec (vspec(it)). */
export function buildStairs(g, it, V) {
  var lay = stairLayout(it, V && V.shape);
  if (lay.designed) return buildDesigned(g, lay);
  var LG = lay.legacy, hw = it.w / 2, hd = it.d / 2, H = it.h, n = LG.n, rise = LG.rise, shape = lay.shape;
  function step(st) {
    // solid riser block with a 3 cm nosing tread on top
    var r = st.rect, y = (st.k + 1) * rise;
    box(g, r.x0, r.x1, st.k * rise, y - 3, r.z0, r.z1, TR, { rough: 0.7, sharp: true });
    box(g, r.x0, r.x1, y - 3, y, r.z0, r.z1, TR, { rough: 0.6, radius: 0.5 });
  }
  function railRun(x, z0, y0, z1, y1) {
    var L = Math.hypot(z1 - z0, y1 - y0), r = cyl(g, x, (y0 + y1) / 2 + 90, (z0 + z1) / 2, 2.2, L, WOOD, { rough: 0.45, seg: 12 });
    // tilt the cylinder's y axis onto the rise: up the flight, toward -z
    if (r) r.rotation.x = Math.atan2(z1 - z0, y1 - y0);
  }
  if (shape === "L") {
    var fw = LG.fw, n1 = LG.n1, len1 = LG.len1;
    lay.steps.forEach(step);
    box(g, -hw + fw, -hw + fw + 3, 0, n1 * rise + 6, -hd + fw, hd, TR, { rough: 0.7, sharp: true }); // open stringer
    railRun(-hw + fw + 1.5, hd, 0, -hd + fw, n1 * rise);
    for (var b = 0; b < n1; b++) cyl(g, -hw + fw + 1.5, (b + 1) * rise + 45, hd - ((b + 0.5) * len1) / n1, 0.9, 90, BAL, { metal: 0.6, rough: 0.4, seg: 8 });
    return;
  }
  if (shape === "U") {
    var flightW = LG.flightW, landingD = LG.landingD, first = LG.first;
    lay.steps.forEach(step);
    box(g, -hw + flightW - 3, -hw + flightW, 0, first * rise + 6, -hd + landingD, hd, TR, { rough: 0.7, sharp: true });
    box(g, hw - flightW, hw - flightW + 3, first * rise, H, -hd + landingD, hd, TR, { rough: 0.7, sharp: true });
    return;
  }
  if (shape === "curved") {
    // treads fan round the back-left corner through a quarter turn
    var ro = LG.ro, ri = LG.ri, cx = LG.cx, cz = LG.cz;
    for (var k = 0; k < n; k++) {
      var a0 = (k / n) * (Math.PI / 2), a1 = ((k + 1) / n) * (Math.PI / 2), am = (a0 + a1) / 2,
        rm = (ri + ro) / 2, wdt = (a1 - a0) * ro + 4, y = (k + 1) * rise;
      // a = 0 points toward the front (+z), a = π/2 toward the right (+x)
      var tread = box(g, -(ro - ri) / 2, (ro - ri) / 2, y - 3, y, -wdt / 2, wdt / 2, TR, { rough: 0.6, radius: 0.5 });
      var riser = box(g, -(ro - ri) / 2, (ro - ri) / 2, 0, y - 3, -wdt / 2 + 1, wdt / 2 - 1, TR, { rough: 0.7, sharp: true });
      [tread, riser].forEach(function (m) {
        if (!m) return;
        m.position.x = cx + Math.sin(am) * rm;
        m.position.z = cz + Math.cos(am) * rm;
        m.rotation.y = Math.PI / 2 - am;
      });
      var bx = cx + Math.sin(am) * (ro - 2), bz = cz + Math.cos(am) * (ro - 2);
      cyl(g, bx, y + 45, bz, 0.9, 90, BAL, { metal: 0.6, rough: 0.4, seg: 8 });
    }
    cyl(g, cx + 0.1, H / 2, cz + 0.1, ri * 0.7, H, TR, { rough: 0.6, seg: 20 }); // newel column
    return;
  }
  lay.steps.forEach(step);
  [-1, 1].forEach(function (sd) {
    // closed stringers either side, following the pitch
    box(g, sd * hw - (sd > 0 ? 3 : 0), sd * hw + (sd > 0 ? 0 : 3), 0, 12, -hd, hd, TR, { rough: 0.7, sharp: true });
  });
  railRun(hw - 3, hd, 0, -hd, H);
  for (var b2 = 0; b2 < n; b2++) cyl(g, hw - 3, (b2 + 1) * rise + 45, hd - ((b2 + 0.5) * it.d) / n, 0.9, 90, BAL, { metal: 0.6, rough: 0.4, seg: 8 });
  cyl(g, hw - 3, 50, hd - 3, 3, 100, WOOD, { rough: 0.45, seg: 12 }); // newel
}
