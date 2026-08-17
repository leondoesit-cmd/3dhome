/* In-race minimap: the whole circuit in a corner of the HUD.

   Indoors the road weaves through rooms and behind walls, so the chase camera
   alone never tells you where the next corner goes. This is deliberately
   north-up and whole-circuit rather than a rotating radar: the apartment is
   small enough to fit, and a fixed map matches the plan the user drew.

   The walls and the road never move during a race, so they are rendered ONCE
   into an offscreen canvas on sync; each frame only blits that and stamps the
   dots on top. */
import { R } from "./rc_state.js";

var M = {
  wrap: null,
  cv: null,
  ctx: null,
  base: null, // offscreen static layer (walls + road)
  baseCtx: null,
  w: 0,
  h: 0,
  dpr: 1,
  view: null, // {ox, oz, s} world -> map transform
  dirty: true,
  lastPaint: 0,
};

var PAD = 6;

export function miniInit(host) {
  if (M.wrap) return M.wrap;
  var wrap = document.createElement("div");
  wrap.id = "rcMini";
  var cv = document.createElement("canvas");
  cv.id = "rcMiniCv";
  wrap.appendChild(cv);
  host.appendChild(wrap);
  M.wrap = wrap;
  M.cv = cv;
  M.ctx = cv.getContext("2d");
  M.dirty = true;
  return wrap;
}

export function miniSetOn(on) {
  if (!M.wrap) return;
  M.wrap.classList.toggle("on", !!on);
  if (on) M.dirty = true;
}

// the track was rebuilt / the plan changed — throw the static layer away
export function miniSync() {
  M.dirty = true;
}

function resize() {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var r = M.wrap.getBoundingClientRect();
  var w = Math.max(40, Math.round(r.width)),
    h = Math.max(40, Math.round(r.height));
  if (w === M.w && h === M.h && dpr === M.dpr) return false;
  M.w = w;
  M.h = h;
  M.dpr = dpr;
  M.cv.width = Math.round(w * dpr);
  M.cv.height = Math.round(h * dpr);
  M.cv.style.width = w + "px";
  M.cv.style.height = h + "px";
  return true;
}

// Fit whatever the circuit covers into the box, with a little margin. Falls
// back to the collision model's own extent before a track exists.
function computeView() {
  var minx = 1e9,
    maxx = -1e9,
    minz = 1e9,
    maxz = -1e9,
    any = false;
  var C = R.track && R.track.center;
  if (C && C.length) {
    for (var i = 0; i < C.length; i++) {
      any = true;
      if (C[i].x < minx) minx = C[i].x;
      if (C[i].x > maxx) maxx = C[i].x;
      if (C[i].z < minz) minz = C[i].z;
      if (C[i].z > maxz) maxz = C[i].z;
    }
  }
  if (!any && R.col && R.col.segs) {
    R.col.segs.forEach(function (s) {
      any = true;
      minx = Math.min(minx, s.ax, s.bx);
      maxx = Math.max(maxx, s.ax, s.bx);
      minz = Math.min(minz, s.az, s.bz);
      maxz = Math.max(maxz, s.az, s.bz);
    });
  }
  if (!any) {
    minx = minz = -200;
    maxx = maxz = 200;
  }
  var spanX = Math.max(1, maxx - minx),
    spanZ = Math.max(1, maxz - minz);
  var s = Math.min((M.w - PAD * 2) / spanX, (M.h - PAD * 2) / spanZ);
  return {
    s: s,
    ox: (M.w - spanX * s) / 2 - minx * s,
    oz: (M.h - spanZ * s) / 2 - minz * s,
  };
}
function wx(x) {
  return x * M.view.s + M.view.ox;
}
function wz(z) {
  return z * M.view.s + M.view.oz;
}

// Elevation ramp: the circuit's own floor is cool blue, its high deck warm.
// Measured against the ROAD's lowest point, not absolute world height — a plan
// whose floor slab sits at y=162 (an upper storey) would otherwise saturate
// every sample into the top bucket and the map would be one flat colour.
function heightCol(f) {
  var hue = 205 - Math.max(0, Math.min(1, f)) * 175;
  return "hsl(" + hue.toFixed(0) + ",78%," + (48 + Math.max(0, Math.min(1, f)) * 14).toFixed(0) + "%)";
}

function paintBase() {
  if (!M.base || M.base.width !== M.cv.width || M.base.height !== M.cv.height) {
    M.base = document.createElement("canvas");
    M.base.width = M.cv.width;
    M.base.height = M.cv.height;
    M.baseCtx = M.base.getContext("2d");
  }
  var c = M.baseCtx;
  c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  c.clearRect(0, 0, M.w, M.h);
  M.view = computeView();
  // walls, faint — enough to recognise the flat without competing with the road
  if (R.col && R.col.segs) {
    c.strokeStyle = "rgba(190,205,230,0.22)";
    c.lineWidth = 1;
    c.beginPath();
    R.col.segs.forEach(function (s) {
      c.moveTo(wx(s.ax), wz(s.az));
      c.lineTo(wx(s.bx), wz(s.bz));
    });
    c.stroke();
  }
  var C = R.track && R.track.center;
  if (!C || C.length < 2) return;
  var lo = Infinity,
    hi = -Infinity;
  for (var k = 0; k < C.length; k++) {
    if (C[k].y < lo) lo = C[k].y;
    if (C[k].y > hi) hi = C[k].y;
  }
  var span = Math.max(20, hi - lo); // a flat circuit stays one calm colour
  var wpx = Math.max(2, (R.roadWidth || 26) * M.view.s);
  c.lineCap = "round";
  c.lineJoin = "round";
  // dark casing first so the road reads against the walls behind it
  c.strokeStyle = "rgba(6,9,14,0.8)";
  c.lineWidth = wpx + 1.5;
  strokeRun(c, C);
  // then in elevation buckets — the same six the editor map uses, so the two
  // views of the same circuit are colour-consistent
  var bucket = -1,
    run = [];
  for (var i = 0; i < C.length; i++) {
    var p = C[i];
    var bk = p.gap
      ? -2
      : Math.min(5, Math.floor(Math.max(0, Math.min(0.999, (p.y - lo) / span)) * 6));
    if (bk !== bucket) {
      flushRun(c, run, bucket, wpx);
      run = run.length ? [run[run.length - 1]] : [];
      bucket = bk;
    }
    run.push(p);
  }
  flushRun(c, run, bucket, wpx);
}
function flushRun(c, run, bucket, wpx) {
  if (run.length < 2) return;
  c.strokeStyle = bucket === -2 ? "rgba(255,255,255,0.14)" : heightCol((bucket + 0.5) / 6);
  c.lineWidth = wpx;
  strokeRun(c, run);
}
function strokeRun(c, pts) {
  c.beginPath();
  c.moveTo(wx(pts[0].x), wz(pts[0].z));
  for (var i = 1; i < pts.length; i++) c.lineTo(wx(pts[i].x), wz(pts[i].z));
  c.stroke();
}

function dot(c, x, z, r, fill, ring) {
  c.beginPath();
  c.arc(wx(x), wz(z), r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (ring) {
    c.lineWidth = 1.2;
    c.strokeStyle = ring;
    c.stroke();
  }
}

export function miniTick(now, player) {
  if (!M.wrap || !M.wrap.classList.contains("on")) return;
  // ~20fps is plenty for a map and keeps the 2D context off the hot path
  if (now - M.lastPaint < 48) return;
  M.lastPaint = now;
  if (resize()) M.dirty = true;
  if (M.dirty) {
    paintBase();
    M.dirty = false;
  }
  if (!M.view) return;
  var c = M.ctx;
  c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  c.clearRect(0, 0, M.w, M.h);
  c.drawImage(M.base, 0, 0, M.cv.width, M.cv.height, 0, 0, M.w, M.h);
  // start/finish
  var wps = R.track && R.track.wps;
  if (wps && wps[0]) dot(c, wps[0].x, wps[0].z, 3, "#ffffff", "rgba(0,0,0,0.6)");
  // the gate the player is heading for, pulsing like its 3D ring
  if (wps && player && wps[player.next]) {
    var g = wps[player.next];
    var pulse = 3.5 + Math.sin(now / 140) * 1.2;
    c.beginPath();
    c.arc(wx(g.x), wz(g.z), pulse + 2.5, 0, Math.PI * 2);
    c.strokeStyle = "rgba(255,210,61,0.85)";
    c.lineWidth = 1.4;
    c.stroke();
  }
  // rivals, then the player on top
  R.cars.forEach(function (car) {
    if (car === player || car.dead) return;
    dot(
      c,
      car.x,
      car.z,
      2.6,
      "#" + ("000000" + (car.color >>> 0).toString(16)).slice(-6),
      "rgba(0,0,0,0.55)",
    );
  });
  if (R.mp && R.mp.ghosts)
    Object.keys(R.mp.ghosts).forEach(function (k) {
      var g = R.mp.ghosts[k];
      if (g && g.cur) dot(c, g.cur.x, g.cur.z, 2.6, "#8fd4ff", "rgba(0,0,0,0.55)");
    });
  if (player && !player.dead) {
    // a wedge, not a dot: which way you are pointing is half the information
    var px = wx(player.x),
      pz = wz(player.z),
      h = player.heading;
    c.save();
    c.translate(px, pz);
    c.rotate(-h + Math.PI); // world +Z is map +y, and the nose is +Z
    c.beginPath();
    c.moveTo(0, -5.5);
    c.lineTo(3.6, 3.4);
    c.lineTo(0, 1.6);
    c.lineTo(-3.6, 3.4);
    c.closePath();
    c.fillStyle = "#ffd23d";
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.7)";
    c.lineWidth = 1.1;
    c.stroke();
    c.restore();
  }
}

export function miniDispose() {
  if (M.wrap && M.wrap.parentNode) M.wrap.parentNode.removeChild(M.wrap);
  M.wrap = null;
  M.cv = null;
  M.ctx = null;
  M.base = null;
  M.baseCtx = null;
  M.w = M.h = 0;
}
