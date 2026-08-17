// pt-worker.js — progressive Monte-Carlo path tracer (classic Web Worker: no imports, no THREE).
// Consumes the analytic scene from view3d.extractPTScene(); driven by photomode.js.
// Units are centimeters; output is linear HDR radiance (main thread tone-maps).
// Also runs under node for testing: renderRows(scene,W,H,y0,y1,seed,spp) is the pure entry point.

var SUN_SCALE = 3.0,
  SKY_SCALE = 1.35,
  LAMP_SCALE = 70000,
  EMIS_SCALE = 3.0,
  SUN_DISC = 60,
  CLAMP = 24,
  MAX_BOUNCE = 5,
  EPS = 0.05;

/* ---------------- RNG: xorshift32 ---------------- */
var RS = 1;
function rnd() {
  RS ^= RS << 13;
  RS ^= RS >>> 17;
  RS ^= RS << 5;
  return (RS >>> 0) / 4294967296;
}

/* ---------------- scene globals (filled by initScene) ---------------- */
var cpx = 0,
  cpy = 0,
  cpz = 0,
  cfx = 0,
  cfy = 0,
  cfz = 1,
  cux = 0,
  cuy = 1,
  cuz = 0,
  crx = 1,
  cry = 0,
  crz = 0,
  tanH = 1;
var sunI = 0,
  sunCr = 1,
  sunCg = 1,
  sunCb = 1,
  sdx = 0,
  sdy = 1,
  sdz = 0,
  sunCosMax = 1,
  sb1x = 1,
  sb1y = 0,
  sb1z = 0,
  sb2x = 0,
  sb2y = 0,
  sb2z = 1;
var skyZ = [0.2, 0.4, 0.8],
  skyH = [0.7, 0.8, 0.9],
  skyG = [0.3, 0.3, 0.3];
var M_COL = null,
  M_ROUGH = null,
  M_METAL = null,
  M_OP = null,
  M_EMIS = null,
  M_EMISI = null,
  M_TEX = null;
var TEXS = [];
var NL = 0,
  L_P = null,
  L_R = null,
  L_C = null,
  L_POW = null;
var NP = 0,
  P_TYPE = null,
  P_MAT = null,
  P_OFS = null,
  P_DATA = null,
  P_AABB = null;
var BVH_BOX = null,
  BVH_A = null,
  BVH_B = null,
  BVH_CNT = null,
  PRIM_ORDER = null;

var SRGB = new Float32Array(256);
for (var _si = 0; _si < 256; _si++) SRGB[_si] = Math.pow(_si / 255, 2.2);

/* scratch (module-level to avoid per-ray allocation) */
var S_L = new Float64Array(3),
  S_D = new Float64Array(3),
  S_H = new Float64Array(3);
var VEC = new Float64Array(3),
  TEXC = new Float64Array(3),
  SKYC = new Float64Array(3),
  OUT = new Float64Array(3);
var STK = new Int32Array(128);

/* ---------------- scene flattening ---------------- */
function initScene(sc) {
  var i, j, l;
  var c = sc.camera;
  cpx = c.pos[0];
  cpy = c.pos[1];
  cpz = c.pos[2];
  cfx = c.fwd[0];
  cfy = c.fwd[1];
  cfz = c.fwd[2];
  l = Math.sqrt(cfx * cfx + cfy * cfy + cfz * cfz) || 1;
  cfx /= l;
  cfy /= l;
  cfz /= l;
  cux = c.up[0];
  cuy = c.up[1];
  cuz = c.up[2];
  l = Math.sqrt(cux * cux + cuy * cuy + cuz * cuz) || 1;
  cux /= l;
  cuy /= l;
  cuz /= l;
  crx = cfy * cuz - cfz * cuy;
  cry = cfz * cux - cfx * cuz;
  crz = cfx * cuy - cfy * cux; // right = cross(fwd, up)
  l = Math.sqrt(crx * crx + cry * cry + crz * crz) || 1;
  crx /= l;
  cry /= l;
  crz /= l;
  tanH = Math.tan(((c.fov || 45) * Math.PI) / 360);
  var su = sc.sun;
  sunI = su ? su.intensity || 0 : 0;
  if (su) {
    sdx = -su.dir[0];
    sdy = -su.dir[1];
    sdz = -su.dir[2]; // toward the sun
    l = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz) || 1;
    sdx /= l;
    sdy /= l;
    sdz /= l;
    sunCr = su.color[0];
    sunCg = su.color[1];
    sunCb = su.color[2];
    sunCosMax = Math.cos(su.angRad || 0.005);
    var axx = Math.abs(sdx) > 0.9 ? 0 : 1,
      axy = Math.abs(sdx) > 0.9 ? 1 : 0; // onb around toward-sun dir
    sb1x = axy * sdz;
    sb1y = -axx * sdz;
    sb1z = axx * sdy - axy * sdx;
    l = Math.sqrt(sb1x * sb1x + sb1y * sb1y + sb1z * sb1z) || 1;
    sb1x /= l;
    sb1y /= l;
    sb1z /= l;
    sb2x = sdy * sb1z - sdz * sb1y;
    sb2y = sdz * sb1x - sdx * sb1z;
    sb2z = sdx * sb1y - sdy * sb1x;
  }
  skyZ = sc.sky.zenith;
  skyH = sc.sky.horizon;
  skyG = sc.sky.ground;
  var mats = sc.materials || [],
    nm = mats.length;
  M_COL = new Float32Array(nm * 3);
  M_ROUGH = new Float32Array(nm);
  M_METAL = new Float32Array(nm);
  M_OP = new Float32Array(nm);
  M_EMIS = new Float32Array(nm * 3);
  M_EMISI = new Float32Array(nm);
  M_TEX = new Int32Array(nm);
  for (i = 0; i < nm; i++) {
    var mm = mats[i];
    M_COL[i * 3] = mm.color[0];
    M_COL[i * 3 + 1] = mm.color[1];
    M_COL[i * 3 + 2] = mm.color[2];
    M_ROUGH[i] = mm.rough;
    M_METAL[i] = mm.metal;
    M_OP[i] = mm.opacity != null ? mm.opacity : 1;
    var em = mm.emissive || [0, 0, 0];
    M_EMIS[i * 3] = em[0];
    M_EMIS[i * 3 + 1] = em[1];
    M_EMIS[i * 3 + 2] = em[2];
    M_EMISI[i] = mm.emissiveI || 0;
    M_TEX[i] = mm.tex != null ? mm.tex : -1;
  }
  TEXS = sc.textures || [];
  var ls = sc.lights || [];
  NL = ls.length;
  L_P = new Float32Array(NL * 3);
  L_R = new Float32Array(NL);
  L_C = new Float32Array(NL * 3);
  L_POW = new Float32Array(NL);
  for (i = 0; i < NL; i++) {
    var lt = ls[i];
    L_P[i * 3] = lt.p[0];
    L_P[i * 3 + 1] = lt.p[1];
    L_P[i * 3 + 2] = lt.p[2];
    L_R[i] = lt.r;
    L_C[i * 3] = lt.color[0];
    L_C[i * 3 + 1] = lt.color[1];
    L_C[i * 3 + 2] = lt.color[2];
    L_POW[i] = lt.power;
  }
  var prims = sc.prims || [];
  NP = prims.length;
  P_TYPE = new Int32Array(NP);
  P_MAT = new Int32Array(NP);
  P_OFS = new Int32Array(NP);
  P_AABB = new Float32Array(NP * 6);
  var total = 0;
  for (i = 0; i < NP; i++) {
    var t = prims[i].t;
    total += t === "b" ? 15 : t === "c" ? 14 : t === "s" ? 4 : 18;
  }
  P_DATA = new Float32Array(total);
  var o = 0;
  for (i = 0; i < NP; i++) {
    var p = prims[i];
    P_MAT[i] = p.m;
    P_OFS[i] = o;
    for (j = 0; j < 6; j++) P_AABB[i * 6 + j] = p.aabb[j];
    if (p.t === "b") {
      P_TYPE[i] = 0;
      for (j = 0; j < 12; j++) P_DATA[o + j] = p.inv[j];
      P_DATA[o + 12] = p.h[0];
      P_DATA[o + 13] = p.h[1];
      P_DATA[o + 14] = p.h[2];
      o += 15;
    } else if (p.t === "c") {
      P_TYPE[i] = 1;
      for (j = 0; j < 12; j++) P_DATA[o + j] = p.inv[j];
      P_DATA[o + 12] = p.r;
      P_DATA[o + 13] = p.hh;
      o += 14;
    } else if (p.t === "s") {
      P_TYPE[i] = 2;
      P_DATA[o] = p.c[0];
      P_DATA[o + 1] = p.c[1];
      P_DATA[o + 2] = p.c[2];
      P_DATA[o + 3] = p.r;
      o += 4;
    } else {
      P_TYPE[i] = 3;
      var q = p.p;
      var e1x = q[3] - q[0],
        e1y = q[4] - q[1],
        e1z = q[5] - q[2];
      var e2x = q[6] - q[0],
        e2y = q[7] - q[1],
        e2z = q[8] - q[2];
      var nx = e1y * e2z - e1z * e2y,
        ny = e1z * e2x - e1x * e2z,
        nz = e1x * e2y - e1y * e2x;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl > 1e-12) {
        nx /= nl;
        ny /= nl;
        nz /= nl;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      P_DATA[o] = q[0];
      P_DATA[o + 1] = q[1];
      P_DATA[o + 2] = q[2];
      P_DATA[o + 3] = e1x;
      P_DATA[o + 4] = e1y;
      P_DATA[o + 5] = e1z;
      P_DATA[o + 6] = e2x;
      P_DATA[o + 7] = e2y;
      P_DATA[o + 8] = e2z;
      P_DATA[o + 9] = nx;
      P_DATA[o + 10] = ny;
      P_DATA[o + 11] = nz;
      var uv = p.uv || [0, 0, 0, 0, 0, 0];
      for (j = 0; j < 6; j++) P_DATA[o + 12 + j] = uv[j];
      o += 18;
    }
  }
  buildBVH();
}

/* ---------------- BVH: median split on longest axis, leaf <= 4 ---------------- */
function buildBVH() {
  var boxes = [],
    aArr = [],
    bArr = [],
    cArr = [],
    order = [];
  function node(list) {
    var ni = aArr.length;
    aArr.push(0);
    bArr.push(0);
    cArr.push(0);
    var mnx = 1e30,
      mny = 1e30,
      mnz = 1e30,
      mxx = -1e30,
      mxy = -1e30,
      mxz = -1e30,
      i,
      p6;
    for (i = 0; i < list.length; i++) {
      p6 = list[i] * 6;
      if (P_AABB[p6] < mnx) mnx = P_AABB[p6];
      if (P_AABB[p6 + 1] < mny) mny = P_AABB[p6 + 1];
      if (P_AABB[p6 + 2] < mnz) mnz = P_AABB[p6 + 2];
      if (P_AABB[p6 + 3] > mxx) mxx = P_AABB[p6 + 3];
      if (P_AABB[p6 + 4] > mxy) mxy = P_AABB[p6 + 4];
      if (P_AABB[p6 + 5] > mxz) mxz = P_AABB[p6 + 5];
    }
    boxes.push(mnx, mny, mnz, mxx, mxy, mxz);
    if (list.length <= 4) {
      aArr[ni] = order.length;
      cArr[ni] = list.length;
      for (i = 0; i < list.length; i++) order.push(list[i]);
    } else {
      var ex = mxx - mnx,
        ey = mxy - mny,
        ez = mxz - mnz;
      var ax = ex > ey && ex > ez ? 0 : ey > ez ? 1 : 2;
      list.sort(function (a, b) {
        return (
          P_AABB[a * 6 + ax] +
          P_AABB[a * 6 + 3 + ax] -
          (P_AABB[b * 6 + ax] + P_AABB[b * 6 + 3 + ax])
        );
      });
      var mid = list.length >> 1;
      aArr[ni] = node(list.slice(0, mid));
      bArr[ni] = node(list.slice(mid));
    }
    return ni;
  }
  if (NP > 0) {
    var idx = [],
      i;
    for (i = 0; i < NP; i++) idx.push(i);
    node(idx);
  } else {
    boxes.push(0, 0, 0, 0, 0, 0);
    aArr.push(0);
    bArr.push(0);
    cArr.push(0);
  }
  BVH_BOX = new Float32Array(boxes);
  BVH_A = new Int32Array(aArr);
  BVH_B = new Int32Array(bArr);
  BVH_CNT = new Int32Array(cArr);
  PRIM_ORDER = new Int32Array(order);
}

/* ---------------- intersectors (update the global hit record if closer) ---------------- */
var hT = 0,
  hNx = 0,
  hNy = 1,
  hNz = 0,
  hU = 0,
  hV = 0,
  hMat = -1;

function isectBox(ox, oy, oz, dx, dy, dz, pi) {
  var o = P_OFS[pi],
    D = P_DATA;
  S_L[0] = D[o] * ox + D[o + 1] * oy + D[o + 2] * oz + D[o + 3];
  S_L[1] = D[o + 4] * ox + D[o + 5] * oy + D[o + 6] * oz + D[o + 7];
  S_L[2] = D[o + 8] * ox + D[o + 9] * oy + D[o + 10] * oz + D[o + 11];
  S_D[0] = D[o] * dx + D[o + 1] * dy + D[o + 2] * dz;
  S_D[1] = D[o + 4] * dx + D[o + 5] * dy + D[o + 6] * dz;
  S_D[2] = D[o + 8] * dx + D[o + 9] * dy + D[o + 10] * dz;
  S_H[0] = D[o + 12];
  S_H[1] = D[o + 13];
  S_H[2] = D[o + 14];
  var tEn = -1e30,
    tEx = 1e30,
    eA = 0,
    eS = 1,
    xA = 0,
    xS = 1,
    i;
  for (i = 0; i < 3; i++) {
    var lv = S_L[i],
      dv = S_D[i],
      hv = S_H[i];
    if (dv < 1e-9 && dv > -1e-9) {
      if (lv < -hv || lv > hv) return;
      continue;
    }
    var inv = 1 / dv,
      ta = (-hv - lv) * inv,
      tb = (hv - lv) * inv,
      s = -1;
    if (ta > tb) {
      var tm = ta;
      ta = tb;
      tb = tm;
      s = 1;
    }
    if (ta > tEn) {
      tEn = ta;
      eA = i;
      eS = s;
    }
    if (tb < tEx) {
      tEx = tb;
      xA = i;
      xS = -s;
    }
    if (tEn > tEx) return;
  }
  var t, ax, sg;
  if (tEn > EPS && tEn < hT) {
    t = tEn;
    ax = eA;
    sg = eS;
  } else if (tEx > EPS && tEx < hT) {
    t = tEx;
    ax = xA;
    sg = xS;
  } else return;
  hT = t;
  hMat = P_MAT[pi];
  var r = o + ax * 4; // worldN = sg * row ax of the 3x3 (transpose rule)
  var wx = D[r] * sg,
    wy = D[r + 1] * sg,
    wz = D[r + 2] * sg;
  if (wx * dx + wy * dy + wz * dz > 0) {
    wx = -wx;
    wy = -wy;
    wz = -wz;
  }
  hNx = wx;
  hNy = wy;
  hNz = wz;
  var a1 = (ax + 1) % 3,
    a2 = (ax + 2) % 3; // fallback planar uv on the face (rarely textured)
  hU = (S_L[a1] + t * S_D[a1]) / 100;
  hV = (S_L[a2] + t * S_D[a2]) / 100;
}

function isectCyl(ox, oy, oz, dx, dy, dz, pi) {
  var o = P_OFS[pi],
    D = P_DATA;
  var lx = D[o] * ox + D[o + 1] * oy + D[o + 2] * oz + D[o + 3];
  var ly = D[o + 4] * ox + D[o + 5] * oy + D[o + 6] * oz + D[o + 7];
  var lz = D[o + 8] * ox + D[o + 9] * oy + D[o + 10] * oz + D[o + 11];
  var ldx = D[o] * dx + D[o + 1] * dy + D[o + 2] * dz;
  var ldy = D[o + 4] * dx + D[o + 5] * dy + D[o + 6] * dz;
  var ldz = D[o + 8] * dx + D[o + 9] * dy + D[o + 10] * dz;
  var r = D[o + 12],
    hh = D[o + 13];
  var best = hT,
    nlx = 0,
    nly = 0,
    nlz = 0,
    found = false,
    yy;
  var a = ldx * ldx + ldz * ldz;
  if (a > 1e-12) {
    var b = 2 * (lx * ldx + lz * ldz),
      cc = lx * lx + lz * lz - r * r,
      disc = b * b - 4 * a * cc;
    if (disc > 0) {
      var sq = Math.sqrt(disc),
        t1 = (-b - sq) / (2 * a),
        t2 = (-b + sq) / (2 * a);
      if (t1 > EPS && t1 < best) {
        yy = ly + t1 * ldy;
        if (yy >= -hh && yy <= hh) {
          best = t1;
          nlx = (lx + t1 * ldx) / r;
          nly = 0;
          nlz = (lz + t1 * ldz) / r;
          found = true;
        }
      }
      if (!found && t2 > EPS && t2 < best) {
        yy = ly + t2 * ldy;
        if (yy >= -hh && yy <= hh) {
          best = t2;
          nlx = (lx + t2 * ldx) / r;
          nly = 0;
          nlz = (lz + t2 * ldz) / r;
          found = true;
        }
      }
    }
  }
  if (ldy > 1e-12 || ldy < -1e-12) {
    for (var k = 0; k < 2; k++) {
      var s = k ? -1 : 1,
        tc = (s * hh - ly) / ldy;
      if (tc > EPS && tc < best) {
        var px2 = lx + tc * ldx,
          pz2 = lz + tc * ldz;
        if (px2 * px2 + pz2 * pz2 <= r * r) {
          best = tc;
          nlx = 0;
          nly = s;
          nlz = 0;
          found = true;
        }
      }
    }
  }
  if (!found) return;
  hT = best;
  hMat = P_MAT[pi];
  var wx = D[o] * nlx + D[o + 4] * nly + D[o + 8] * nlz;
  var wy = D[o + 1] * nlx + D[o + 5] * nly + D[o + 9] * nlz;
  var wz = D[o + 2] * nlx + D[o + 6] * nly + D[o + 10] * nlz;
  if (wx * dx + wy * dy + wz * dz > 0) {
    wx = -wx;
    wy = -wy;
    wz = -wz;
  }
  hNx = wx;
  hNy = wy;
  hNz = wz;
  hU = Math.atan2(nlz, nlx) * 0.15915494309 + 0.5;
  hV = (ly + best * ldy + hh) / (2 * hh || 1);
}

function isectSph(ox, oy, oz, dx, dy, dz, pi) {
  var o = P_OFS[pi],
    D = P_DATA;
  var cx = D[o],
    cy = D[o + 1],
    cz = D[o + 2],
    r = D[o + 3];
  var mx = ox - cx,
    my = oy - cy,
    mz = oz - cz;
  var b = mx * dx + my * dy + mz * dz,
    c = mx * mx + my * my + mz * mz - r * r;
  var disc = b * b - c;
  if (disc < 0) return;
  var sq = Math.sqrt(disc),
    t = -b - sq;
  if (t <= EPS) t = -b + sq;
  if (t <= EPS || t >= hT) return;
  hT = t;
  hMat = P_MAT[pi];
  var nx = (ox + dx * t - cx) / r,
    ny = (oy + dy * t - cy) / r,
    nz = (oz + dz * t - cz) / r;
  if (nx * dx + ny * dy + nz * dz > 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  hNx = nx;
  hNy = ny;
  hNz = nz;
  hU = Math.atan2(nz, nx) * 0.15915494309 + 0.5;
  hV = ny * 0.5 + 0.5;
}

function isectTri(ox, oy, oz, dx, dy, dz, pi) {
  var o = P_OFS[pi],
    D = P_DATA;
  var e1x = D[o + 3],
    e1y = D[o + 4],
    e1z = D[o + 5],
    e2x = D[o + 6],
    e2y = D[o + 7],
    e2z = D[o + 8];
  var pvx = dy * e2z - dz * e2y,
    pvy = dz * e2x - dx * e2z,
    pvz = dx * e2y - dy * e2x;
  var det = e1x * pvx + e1y * pvy + e1z * pvz;
  if (det < 1e-12 && det > -1e-12) return; // double-sided: no backface cull
  var inv = 1 / det;
  var tvx = ox - D[o],
    tvy = oy - D[o + 1],
    tvz = oz - D[o + 2];
  var u = (tvx * pvx + tvy * pvy + tvz * pvz) * inv;
  if (u < 0 || u > 1) return;
  var qvx = tvy * e1z - tvz * e1y,
    qvy = tvz * e1x - tvx * e1z,
    qvz = tvx * e1y - tvy * e1x;
  var v = (dx * qvx + dy * qvy + dz * qvz) * inv;
  if (v < 0 || u + v > 1) return;
  var t = (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
  if (t <= EPS || t >= hT) return;
  hT = t;
  hMat = P_MAT[pi];
  var nx = D[o + 9],
    ny = D[o + 10],
    nz = D[o + 11];
  if (nx * dx + ny * dy + nz * dz > 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  } // face the incoming ray
  hNx = nx;
  hNy = ny;
  hNz = nz;
  var w = 1 - u - v;
  hU = D[o + 12] * w + D[o + 14] * u + D[o + 16] * v;
  hV = D[o + 13] * w + D[o + 15] * u + D[o + 17] * v;
}

/* ---------------- BVH traversal ---------------- */
function trace(ox, oy, oz, dx, dy, dz, tmax) {
  hT = tmax;
  hMat = -1;
  if (!NP) return false;
  var ix = 1 / dx,
    iy = 1 / dy,
    iz = 1 / dz;
  var sp = 0;
  STK[sp++] = 0;
  while (sp > 0) {
    var n = STK[--sp],
      b = n * 6;
    var t0 = EPS,
      t1 = hT,
      ta,
      tb,
      tm;
    ta = (BVH_BOX[b] - ox) * ix;
    tb = (BVH_BOX[b + 3] - ox) * ix;
    if (ta > tb) {
      tm = ta;
      ta = tb;
      tb = tm;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    ta = (BVH_BOX[b + 1] - oy) * iy;
    tb = (BVH_BOX[b + 4] - oy) * iy;
    if (ta > tb) {
      tm = ta;
      ta = tb;
      tb = tm;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    ta = (BVH_BOX[b + 2] - oz) * iz;
    tb = (BVH_BOX[b + 5] - oz) * iz;
    if (ta > tb) {
      tm = ta;
      ta = tb;
      tb = tm;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) continue;
    var cnt = BVH_CNT[n];
    if (cnt > 0) {
      var st = BVH_A[n];
      for (var k = 0; k < cnt; k++) {
        var p = PRIM_ORDER[st + k],
          tp = P_TYPE[p];
        if (tp === 0) isectBox(ox, oy, oz, dx, dy, dz, p);
        else if (tp === 3) isectTri(ox, oy, oz, dx, dy, dz, p);
        else if (tp === 1) isectCyl(ox, oy, oz, dx, dy, dz, p);
        else isectSph(ox, oy, oz, dx, dy, dz, p);
      }
    } else {
      STK[sp++] = BVH_A[n];
      STK[sp++] = BVH_B[n];
    }
  }
  return hMat >= 0;
}

/* shadow ray: opaque blocks; thin-transparent attenuates by (1-opacity), up to 8 surfaces */
function shadowTrace(ox, oy, oz, dx, dy, dz, maxDist) {
  var trans = 1;
  for (var k = 0; k < 5; k++) {
    if (!trace(ox, oy, oz, dx, dy, dz, maxDist)) return trans;
    var op = M_OP[hMat];
    if (op >= 1) return 0;
    trans *= 1 - op;
    if (trans < 0.05) return 0;
    var adv = hT + EPS;
    ox += dx * adv;
    oy += dy * adv;
    oz += dz * adv;
    maxDist -= adv;
    if (maxDist <= EPS) return trans;
  }
  return 0;
}

/* ---------------- environment ---------------- */
function skyRad(dx, dy, dz, specOnly, out) {
  var t, r, g, b;
  if (dy >= 0) {
    t = Math.pow(dy, 0.45);
    r = skyH[0] + (skyZ[0] - skyH[0]) * t;
    g = skyH[1] + (skyZ[1] - skyH[1]) * t;
    b = skyH[2] + (skyZ[2] - skyH[2]) * t;
  } else {
    t = -dy * 3;
    if (t > 1) t = 1;
    r = skyH[0] + (skyG[0] - skyH[0]) * t;
    g = skyH[1] + (skyG[1] - skyH[1]) * t;
    b = skyH[2] + (skyG[2] - skyH[2]) * t;
  }
  r *= SKY_SCALE;
  g *= SKY_SCALE;
  b *= SKY_SCALE;
  if (sunI > 0) {
    var ct = dx * sdx + dy * sdy + dz * sdz;
    if (specOnly && ct > sunCosMax) {
      r += sunCr * sunI * SUN_DISC;
      g += sunCg * sunI * SUN_DISC;
      b += sunCb * sunI * SUN_DISC;
    }
    if (ct > 0) {
      var gl = 0.5 * sunI * Math.pow(ct, 320);
      r += sunCr * gl;
      g += sunCg * gl;
      b += sunCb * gl;
    }
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

/* ---------------- texture sampling (bilinear, wrap, sRGB decode) ---------------- */
function texSample(ti, u, v, out) {
  var t = TEXS[ti],
    w = t.w,
    h = t.h,
    d = t.data;
  var fu = u * t.rx;
  fu -= Math.floor(fu);
  var fv = v * t.ry;
  fv -= Math.floor(fv);
  var x = fu * w - 0.5,
    y = fv * h - 0.5;
  var x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  var x1 = x0 + 1,
    y1 = y0 + 1;
  x0 = ((x0 % w) + w) % w;
  x1 = ((x1 % w) + w) % w;
  y0 = ((y0 % h) + h) % h;
  y1 = ((y1 % h) + h) % h;
  var i00 = (y0 * w + x0) * 4,
    i10 = (y0 * w + x1) * 4,
    i01 = (y1 * w + x0) * 4,
    i11 = (y1 * w + x1) * 4;
  var w00 = (1 - fx) * (1 - fy),
    w10 = fx * (1 - fy),
    w01 = (1 - fx) * fy,
    w11 = fx * fy;
  out[0] =
    SRGB[d[i00]] * w00 +
    SRGB[d[i10]] * w10 +
    SRGB[d[i01]] * w01 +
    SRGB[d[i11]] * w11;
  out[1] =
    SRGB[d[i00 + 1]] * w00 +
    SRGB[d[i10 + 1]] * w10 +
    SRGB[d[i01 + 1]] * w01 +
    SRGB[d[i11 + 1]] * w11;
  out[2] =
    SRGB[d[i00 + 2]] * w00 +
    SRGB[d[i10 + 2]] * w10 +
    SRGB[d[i01 + 2]] * w01 +
    SRGB[d[i11 + 2]] * w11;
}

/* ---------------- samplers ---------------- */
function randUnitVec(out) {
  var z = 2 * rnd() - 1,
    ph = rnd() * 6.283185307179586,
    s = Math.sqrt(1 - z * z > 0 ? 1 - z * z : 0);
  out[0] = Math.cos(ph) * s;
  out[1] = Math.sin(ph) * s;
  out[2] = z;
}
function randInSphere(out) {
  for (;;) {
    var x = 2 * rnd() - 1,
      y = 2 * rnd() - 1,
      z = 2 * rnd() - 1;
    if (x * x + y * y + z * z <= 1) {
      out[0] = x;
      out[1] = y;
      out[2] = z;
      return;
    }
  }
}
function sampleSunCone(out) {
  var ca = 1 - rnd() * (1 - sunCosMax),
    sa = Math.sqrt(1 - ca * ca > 0 ? 1 - ca * ca : 0);
  var ph = rnd() * 6.283185307179586,
    cp = Math.cos(ph) * sa,
    sp = Math.sin(ph) * sa;
  out[0] = sdx * ca + sb1x * cp + sb2x * sp;
  out[1] = sdy * ca + sb1y * cp + sb2y * sp;
  out[2] = sdz * ca + sb1z * cp + sb2z * sp;
}
function cosineHemi(nx, ny, nz, out) {
  var ax = Math.abs(nx) > 0.9 ? 0 : 1,
    ay = Math.abs(nx) > 0.9 ? 1 : 0;
  var t1x = ay * nz,
    t1y = -ax * nz,
    t1z = ax * ny - ay * nx;
  var l = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z) || 1;
  t1x /= l;
  t1y /= l;
  t1z /= l;
  var t2x = ny * t1z - nz * t1y,
    t2y = nz * t1x - nx * t1z,
    t2z = nx * t1y - ny * t1x;
  var ph = rnd() * 6.283185307179586,
    r2 = rnd(),
    sr = Math.sqrt(r2),
    cz = Math.sqrt(1 - r2 > 0 ? 1 - r2 : 0);
  var xx = Math.cos(ph) * sr,
    yy = Math.sin(ph) * sr;
  out[0] = t1x * xx + t2x * yy + nx * cz;
  out[1] = t1y * xx + t2y * yy + ny * cz;
  out[2] = t1z * xx + t2z * yy + nz * cz;
}

/* ---------------- path integrator (one sample; writes clamped radiance to out) ---------------- */
function pathTrace(ox, oy, oz, dx, dy, dz, out) {
  var tr = 1,
    tg = 1,
    tb = 1,
    rr = 0,
    rg = 0,
    rb = 0,
    specOnly = true;
  for (var depth = 0; depth < MAX_BOUNCE; depth++) {
    if (!trace(ox, oy, oz, dx, dy, dz, 1e30)) {
      skyRad(dx, dy, dz, specOnly, SKYC);
      rr += tr * SKYC[0];
      rg += tg * SKYC[1];
      rb += tb * SKYC[2];
      break;
    }
    var t = hT,
      nx = hNx,
      ny = hNy,
      nz = hNz,
      m = hMat,
      u = hU,
      v = hV,
      mi = m * 3;
    var px = ox + dx * t,
      py = oy + dy * t,
      pz = oz + dz * t;
    var ei = M_EMISI[m];
    if (
      ei > 0 &&
      (M_EMIS[mi] > 0 || M_EMIS[mi + 1] > 0 || M_EMIS[mi + 2] > 0)
    ) {
      var ee = ei * EMIS_SCALE;
      rr += tr * M_EMIS[mi] * ee;
      rg += tg * M_EMIS[mi + 1] * ee;
      rb += tb * M_EMIS[mi + 2] * ee;
    }
    var op = M_OP[m];
    if (op < 1) {
      // thin glass: reflect or pass straight through
      var cosI = -(dx * nx + dy * ny + dz * nz);
      if (cosI < 0) cosI = 0;
      var Fg = 0.06 + 0.94 * Math.pow(1 - cosI, 5);
      if (rnd() < Fg) {
        var dn = 2 * (dx * nx + dy * ny + dz * nz);
        dx -= dn * nx;
        dy -= dn * ny;
        dz -= dn * nz;
        ox = px + nx * EPS;
        oy = py + ny * EPS;
        oz = pz + nz * EPS;
      } else {
        var at = 1 - op * 0.25;
        tr *= (1 + (M_COL[mi] - 1) * op) * at;
        tg *= (1 + (M_COL[mi + 1] - 1) * op) * at;
        tb *= (1 + (M_COL[mi + 2] - 1) * op) * at;
        ox = px + dx * EPS;
        oy = py + dy * EPS;
        oz = pz + dz * EPS;
      }
      // counts as a specular bounce; no NEE at glass hits
    } else {
      var ar = M_COL[mi],
        ag = M_COL[mi + 1],
        ab = M_COL[mi + 2];
      var ti = M_TEX[m];
      if (ti >= 0) {
        texSample(ti, u, v, TEXC);
        ar *= TEXC[0];
        ag *= TEXC[1];
        ab *= TEXC[2];
      }
      var rough = M_ROUGH[m],
        metal = M_METAL[m];
      var kd = (1 - metal) * 0.3183098861837907; // (1-metal)/pi
      /* NEE: sun */
      if (sunI > 0 && kd > 0) {
        sampleSunCone(VEC);
        var sx = VEC[0],
          sy = VEC[1],
          sz = VEC[2];
        var ndl = nx * sx + ny * sy + nz * sz;
        if (ndl > 0) {
          var sh = shadowTrace(
            px + nx * EPS,
            py + ny * EPS,
            pz + nz * EPS,
            sx,
            sy,
            sz,
            1e30,
          );
          if (sh > 0) {
            var wS = kd * ndl * sunI * SUN_SCALE * sh;
            rr += tr * ar * wS * sunCr;
            rg += tg * ag * wS * sunCg;
            rb += tb * ab * wS * sunCb;
          }
        }
      }
      /* NEE: lamps (sample up to 3 distinct lights per hit — big variance win indoors) */
      if (NL > 0 && kd > 0) {
        var nk = NL < 3 ? NL : 3,
          st0 = (rnd() * NL) | 0,
          wNL = NL / nk;
        for (var lj = 0; lj < nk; lj++) {
          var li = (st0 + lj) % NL;
          randUnitVec(VEC);
          var qx = L_P[li * 3] + L_R[li] * VEC[0],
            qy = L_P[li * 3 + 1] + L_R[li] * VEC[1],
            qz = L_P[li * 3 + 2] + L_R[li] * VEC[2];
          var lvx = qx - px,
            lvy = qy - py,
            lvz = qz - pz;
          var dist = Math.sqrt(lvx * lvx + lvy * lvy + lvz * lvz);
          if (dist > 1e-6) {
            var il = 1 / dist,
              lxn = lvx * il,
              lyn = lvy * il,
              lzn = lvz * il;
            var ndl2 = nx * lxn + ny * lyn + nz * lzn;
            if (ndl2 > 0) {
              var sh2 = shadowTrace(
                px + nx * EPS,
                py + ny * EPS,
                pz + nz * EPS,
                lxn,
                lyn,
                lzn,
                dist - EPS,
              );
              if (sh2 > 0) {
                var dc = dist < 15 ? 15 : dist;
                var E = (LAMP_SCALE * L_POW[li]) / (dc * dc);
                var wL = kd * ndl2 * E * wNL * sh2;
                rr += tr * ar * wL * L_C[li * 3];
                rg += tg * ag * wL * L_C[li * 3 + 1];
                rb += tb * ab * wL * L_C[li * 3 + 2];
              }
            }
          }
        }
      }
      /* BRDF bounce */
      var cosT = -(dx * nx + dy * ny + dz * nz);
      if (cosT < 0) cosT = 0;
      var fw = Math.pow(1 - cosT, 5);
      var F0r = 0.04 + (ar - 0.04) * metal,
        F0g = 0.04 + (ag - 0.04) * metal,
        F0b = 0.04 + (ab - 0.04) * metal;
      var Fr = F0r + (1 - F0r) * fw,
        Fg2 = F0g + (1 - F0g) * fw,
        Fb2 = F0b + (1 - F0b) * fw;
      var maxF = Fr > Fg2 ? (Fr > Fb2 ? Fr : Fb2) : Fg2 > Fb2 ? Fg2 : Fb2;
      var pSpec = maxF < 0.05 ? 0.05 : maxF > 0.9 ? 0.9 : maxF;
      if (rnd() < pSpec) {
        var dn2 = 2 * (dx * nx + dy * ny + dz * nz);
        var bx = dx - dn2 * nx,
          by = dy - dn2 * ny,
          bz = dz - dn2 * nz;
        var r2 = rough * rough;
        randInSphere(VEC);
        bx += r2 * VEC[0];
        by += r2 * VEC[1];
        bz += r2 * VEC[2];
        var bl = Math.sqrt(bx * bx + by * by + bz * bz);
        if (bl < 1e-9) {
          bx = nx;
          by = ny;
          bz = nz;
        } else {
          bx /= bl;
          by /= bl;
          bz /= bl;
        }
        var bn = bx * nx + by * ny + bz * nz;
        if (bn <= 0) {
          bx -= 2 * bn * nx;
          by -= 2 * bn * ny;
          bz -= 2 * bn * nz;
        }
        tr *= Fr / pSpec;
        tg *= Fg2 / pSpec;
        tb *= Fb2 / pSpec;
        if (rough >= 0.25) specOnly = false;
        dx = bx;
        dy = by;
        dz = bz;
      } else {
        cosineHemi(nx, ny, nz, VEC);
        dx = VEC[0];
        dy = VEC[1];
        dz = VEC[2];
        var wD = ((1 - metal) * (1 - maxF)) / (1 - pSpec);
        tr *= ar * wD;
        tg *= ag * wD;
        tb *= ab * wD;
        specOnly = false;
      }
      ox = px + nx * EPS;
      oy = py + ny * EPS;
      oz = pz + nz * EPS;
    }
    /* Russian roulette from bounce 3 */
    if (depth >= 3) {
      var pm = tr > tg ? (tr > tb ? tr : tb) : tg > tb ? tg : tb;
      var pq = pm < 0.05 ? 0.05 : pm > 0.95 ? 0.95 : pm;
      if (rnd() > pq) break;
      tr /= pq;
      tg /= pq;
      tb /= pq;
    }
  }
  /* firefly clamp + NaN guard on the whole sample */
  if (!(rr >= 0)) rr = 0;
  if (!(rg >= 0)) rg = 0;
  if (!(rb >= 0)) rb = 0; // NaN/negative -> 0
  if (rr > CLAMP) rr = CLAMP;
  if (rg > CLAMP) rg = CLAMP;
  if (rb > CLAMP) rb = CLAMP;
  out[0] = rr;
  out[1] = rg;
  out[2] = rb;
}

/* ---------------- per-pass renderer over owned rows (strided: y0, y0+step, ...) ---------------- */
function renderPass(W, H, y0, step, nRows, seed, pass, acc) {
  var aspect = W / H,
    thA = tanH * aspect,
    oi = 0;
  for (var k = 0; k < nRows; k++) {
    var y = y0 + k * step;
    for (var x = 0; x < W; x++) {
      RS = (seed + (y * W + x) * 9781 + pass * 6271) | 0;
      if (RS === 0) RS = 0x9e3779b9 | 0;
      rnd();
      rnd(); // decorrelate nearby streams
      var pxn = ((2 * (x + rnd())) / W - 1) * thA;
      var pyn = (1 - (2 * (y + rnd())) / H) * tanH;
      var ddx = cfx + pxn * crx + pyn * cux;
      var ddy = cfy + pxn * cry + pyn * cuy;
      var ddz = cfz + pxn * crz + pyn * cuz;
      var dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
      pathTrace(cpx, cpy, cpz, ddx / dl, ddy / dl, ddz / dl, OUT);
      acc[oi] += OUT[0];
      acc[oi + 1] += OUT[1];
      acc[oi + 2] += OUT[2];
      oi += 3;
    }
  }
}

/* first-hit albedo + normal buffers for the edge-aware denoiser (deterministic center rays) */
function renderAux(W, H, y0, step, nRows) {
  var aspect = W / H,
    thA = tanH * aspect,
    n = nRows * W;
  var alb = new Float32Array(n * 3),
    nrm = new Float32Array(n * 3),
    oi = 0;
  for (var k2 = 0; k2 < nRows; k2++) {
    var y = y0 + k2 * step;
    for (var x = 0; x < W; x++) {
      var pxn = ((2 * (x + 0.5)) / W - 1) * thA,
        pyn = (1 - (2 * (y + 0.5)) / H) * tanH;
      var dx = cfx + pxn * crx + pyn * cux,
        dy = cfy + pxn * cry + pyn * cuy,
        dz = cfz + pxn * crz + pyn * cuz;
      var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= dl;
      dy /= dl;
      dz /= dl;
      var ox = cpx,
        oy = cpy,
        oz = cpz,
        found = false;
      for (var k = 0; k < 4; k++) {
        // march through thin glass to the first opaque hit
        if (!trace(ox, oy, oz, dx, dy, dz, 1e30)) break;
        if (M_OP[hMat] >= 1) {
          found = true;
          break;
        }
        var adv = hT + EPS;
        ox += dx * adv;
        oy += dy * adv;
        oz += dz * adv;
      }
      if (found) {
        var m = hMat,
          mi = m * 3,
          ar = M_COL[mi],
          ag = M_COL[mi + 1],
          ab2 = M_COL[mi + 2];
        if (M_TEX[m] >= 0) {
          texSample(M_TEX[m], hU, hV, TEXC);
          ar *= TEXC[0];
          ag *= TEXC[1];
          ab2 *= TEXC[2];
        }
        alb[oi] = ar;
        alb[oi + 1] = ag;
        alb[oi + 2] = ab2;
        nrm[oi] = hNx;
        nrm[oi + 1] = hNy;
        nrm[oi + 2] = hNz;
      }
      oi += 3;
    }
  }
  return { alb: alb, nrm: nrm };
}

/* pure entry point (used by the node test; the worker drives renderPass itself) */
function renderRows(scene, W, H, y0, y1, seed, spp) {
  initScene(scene);
  var acc = new Float64Array((y1 - y0) * W * 3);
  for (var p = 1; p <= spp; p++) renderPass(W, H, y0, 1, y1 - y0, seed, p, acc);
  var out = new Float32Array(acc.length),
    inv = 1 / spp;
  for (var i = 0; i < acc.length; i++) out[i] = acc[i] * inv;
  return out;
}

/* ---------------- worker protocol ---------------- */
if (typeof self !== "undefined" && typeof window === "undefined") {
  var _halt = false,
    _pass = 0,
    _max = 0,
    _W = 0,
    _H = 0,
    _y0 = 0,
    _step = 1,
    _nRows = 0,
    _seed = 0,
    _acc = null;
  var _loop = function () {
    if (_halt || _pass >= _max) {
      self.postMessage({ type: "done", passes: _pass });
      return;
    }
    try {
      _pass++;
      renderPass(_W, _H, _y0, _step, _nRows, _seed, _pass, _acc);
      var n = _acc.length,
        buf = new Float32Array(n),
        inv = 1 / _pass;
      for (var i = 0; i < n; i++) buf[i] = _acc[i] * inv; // running average, linear HDR
      self.postMessage(
        {
          type: "pass",
          pass: _pass,
          y0: _y0,
          step: _step,
          nRows: _nRows,
          buf: buf,
        },
        [buf.buffer],
      );
      if (_pass === 1) {
        var aux = renderAux(_W, _H, _y0, _step, _nRows);
        self.postMessage(
          {
            type: "aux",
            y0: _y0,
            step: _step,
            nRows: _nRows,
            alb: aux.alb,
            nrm: aux.nrm,
          },
          [aux.alb.buffer, aux.nrm.buffer],
        );
      }
    } catch (err) {
      self.postMessage({
        type: "error",
        message: String((err && err.message) || err),
      });
      return;
    }
    setTimeout(_loop, 0); // yield so a 'stop' can land
  };
  self.onmessage = function (e) {
    var msg = e.data;
    if (msg.type === "stop") {
      _halt = true;
      return;
    }
    if (msg.type === "start") {
      try {
        _halt = false;
        _pass = 0;
        _max = msg.maxSpp;
        _W = msg.W;
        _H = msg.H;
        _y0 = msg.y0;
        _step = msg.step || 1;
        _nRows = msg.nRows;
        _seed = msg.seed;
        initScene(msg.scene);
        _acc = new Float64Array(_nRows * _W * 3);
      } catch (err) {
        self.postMessage({
          type: "error",
          message: String((err && err.message) || err),
        });
        return;
      }
      setTimeout(_loop, 0);
    }
  };
}
