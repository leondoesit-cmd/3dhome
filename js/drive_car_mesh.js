// Procedural GTA-style car meshes for the drive engine.
import * as THREE from "three";

// Wired from drive.js once the TOD clock exists (headlights depend on night).
let _isNight = function () { return false; };
export function setCarMeshNightFn(fn) { _isNight = fn || _isNight; }

const carGeos = new Map();
const fxMats = new Map(); // unlit FX materials (glows, beams) — never env-mapped
const carMats = new Map(); // every env-mapped car material, re-linked on TOD switch
let envRT = null; // PMREM target from drive.js sky updates

/** Push a new environment map onto every cached car paint/glass material. */
export function setCarEnvMap(rt) {
  envRT = rt;
  const tex = rt && rt.texture;
  carMats.forEach((m) => {
    m.envMap = tex;
    m.needsUpdate = true;
  });
}

export function cgeo(key, make) {
  let g = carGeos.get(key);
  if (!g) carGeos.set(key, (g = make()));
  return g;
}
export function fxMat(key, make) {
  let m = fxMats.get(key);
  if (!m) fxMats.set(key, (m = make()));
  return m;
}
export function paintMat(color) {
  const k = "p" + color;
  let m = carMats.get(k);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color, metalness: 0.45, roughness: 0.3,
      clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 1.0,
    });
    if (envRT) m.envMap = envRT.texture;
    carMats.set(k, m);
  }
  return m;
}
export function carMat(key, make) {
  let m = carMats.get(key);
  if (!m) {
    m = make();
    if (envRT) m.envMap = envRT.texture;
    carMats.set(key, m);
  }
  return m;
}
const glassMat = () =>
  carMat("glass", () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0f15, metalness: 0.1, roughness: 0.06, clearcoat: 1,
      transparent: true, opacity: 0.78, envMapIntensity: 1.7,
    }));
const chromeMat = () =>
  carMat("chrome", () =>
    new THREE.MeshStandardMaterial({
      color: 0xc7ccd4, metalness: 1, roughness: 0.2, envMapIntensity: 1.2,
    }));
const rimMat = () =>
  carMat("rim", () =>
    new THREE.MeshStandardMaterial({
      color: 0xb9c0c9, metalness: 0.92, roughness: 0.26, envMapIntensity: 1.1,
    }));
const trimMat = () =>
  carMat("trim", () =>
    new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.2, roughness: 0.75 }));
const tireMat = () =>
  carMat("tire", () =>
    new THREE.MeshStandardMaterial({ color: 0x141618, metalness: 0, roughness: 0.95 }));
const plateMat = () =>
  carMat("plate", () =>
    new THREE.MeshStandardMaterial({ color: 0xe8e6dc, metalness: 0.1, roughness: 0.6 }));

// height of the body's top edge at a distance x back from the nose
export function topAt(low, x) {
  for (let i = 1; i < low.length; i++) {
    if (x <= low[i][0]) {
      const a = low[i - 1],
        b = low[i];
      const s = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return low[low.length - 1][1];
}
// extrude a side-profile shape across the car's width, then rotate it so the
// profile runs along +Z (car length) and the extrusion along X (car width)
export function extrudeProfile(shape, wid) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: wid, bevelEnabled: true, bevelThickness: 0.035,
    bevelSize: 0.035, bevelSegments: 2, curveSegments: 8, steps: 1,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(wid / 2, 0, 0);
  return g;
}
export function bodyGeometry(T) {
  const s = new THREE.Shape();
  s.moveTo(T.low[0][0], T.low[0][1]);
  for (let i = 1; i < T.low.length; i++) s.lineTo(T.low[i][0], T.low[i][1]);
  // down the tail, then forward along the sill — arcing up over each wheel
  s.lineTo(T.len, T.sill);
  for (let i = T.ax.length - 1; i >= 0; i--) {
    const wx = T.ax[i];
    s.lineTo(wx + T.arch, T.sill);
    s.absarc(wx, T.wr, T.arch, 0, Math.PI, false);
    s.lineTo(wx - T.arch, T.sill);
  }
  s.lineTo(0, T.sill);
  s.closePath();
  const g = extrudeProfile(s, T.wid);
  g.translate(0, 0, -T.len / 2);
  return g;
}
export function glassGeometry(T) {
  const p = T.glass;
  const s = new THREE.Shape();
  s.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
  s.lineTo(p[p.length - 1][0], T.belt - 0.04);
  s.lineTo(p[0][0], T.belt - 0.04);
  s.closePath();
  const g = extrudeProfile(s, T.wid - 0.16);
  g.translate(0, 0, -T.len / 2);
  return g;
}
// thin painted strut between two profile points (A/C pillar, roof rail)
export function strut(g, T, a, b, xOff, mat, thick) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 0.01;
  const m = new THREE.Mesh(
    cgeo("strut" + Math.round(len * 100) + "_" + thick, () =>
      new THREE.BoxGeometry(thick, len, thick * 1.3)),
    mat,
  );
  // the box's +Y axis rotates onto (0, dy, dx) — profile x runs along world z
  m.rotation.x = Math.atan2(dx, dy);
  m.position.set(xOff, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2 - T.len / 2);
  m.castShadow = true;
  g.add(m);
  return m;
}
export function wheelAssembly(T) {
  const g = new THREE.Group(); // spin group: rotation.x rolls the wheel
  const w = T.wid * 0.13 + 0.14; // tyre width
  // the cylinders are baked axis-along-X, so width scales on X and the
  // radius (Y/Z) stays put
  const tire = new THREE.Mesh(
    cgeo("tire" + T.wr, () => {
      const c = new THREE.CylinderGeometry(T.wr, T.wr, 1, 20);
      c.rotateZ(Math.PI / 2);
      return c;
    }),
    tireMat(),
  );
  tire.scale.set(w, 1, 1);
  tire.castShadow = true;
  g.add(tire);
  const rim = new THREE.Mesh(
    cgeo("rim" + T.wr, () => {
      const c = new THREE.CylinderGeometry(T.wr * 0.62, T.wr * 0.62, 1, 18);
      c.rotateZ(Math.PI / 2);
      return c;
    }),
    rimMat(),
  );
  rim.scale.set(w * 0.86, 1, 1);
  g.add(rim);
  const spokeG = cgeo("spoke" + T.wr, () =>
    new THREE.BoxGeometry(0.05, T.wr * 1.06, T.wr * 0.2));
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(spokeG, rimMat());
    sp.rotation.x = (i / 5) * Math.PI;
    sp.position.x = w * 0.44;
    g.add(sp);
  }
  const cap = new THREE.Mesh(
    cgeo("cap" + T.wr, () => {
      const c = new THREE.CylinderGeometry(T.wr * 0.2, T.wr * 0.2, 1, 12);
      c.rotateZ(Math.PI / 2);
      return c;
    }),
    chromeMat(),
  );
  cap.scale.set(w * 0.95, 1, 1);
  g.add(cap);
  return g;
}
// glow card for a lamp: an additive billboard that keeps the light readable
// from a distance, where the lamp box itself is only a couple of pixels
export function glowSprite(hex, size) {
  const key = "glow" + hex;
  let mat = fxMats.get(key);
  if (!mat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    const col = new THREE.Color(hex);
    const rgb = [col.r * 255, col.g * 255, col.b * 255].map(Math.round).join(",");
    g.addColorStop(0, "rgba(" + rgb + ",1)");
    g.addColorStop(0.35, "rgba(" + rgb + ",0.45)");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    });
    fxMats.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}
// mirrors, lamps and spoked wheels. Profiles are listed nose-first: `low` is
// the body's top edge (x = metres back from the nose, y = height), `glass` is
// the greenhouse outline, `ax` the axle positions.
export const CAR_TYPES = [
  {
    key: "sedan", len: 4.55, wid: 1.86, sill: 0.30, wr: 0.34, arch: 0.52,
    ax: [1.02, 3.42], belt: 0.84,
    low: [[0, 0.50], [0.10, 0.66], [0.55, 0.76], [1.02, 0.82], [3.72, 0.84], [4.30, 0.80], [4.55, 0.52]],
    glass: [[1.18, 0.84], [1.98, 1.40], [3.02, 1.42], [3.68, 0.86]],
  },
  {
    key: "hatch", len: 4.05, wid: 1.78, sill: 0.30, wr: 0.33, arch: 0.50,
    ax: [0.95, 3.08], belt: 0.86,
    low: [[0, 0.50], [0.10, 0.68], [0.50, 0.80], [0.95, 0.86], [3.55, 0.88], [3.98, 0.82], [4.05, 0.54]],
    glass: [[1.05, 0.86], [1.82, 1.42], [2.86, 1.46], [3.72, 1.00]],
  },
  {
    key: "suv", len: 4.75, wid: 1.95, sill: 0.36, wr: 0.40, arch: 0.58,
    ax: [1.10, 3.60], belt: 1.00,
    low: [[0, 0.60], [0.12, 0.80], [0.60, 0.94], [1.10, 1.00], [3.98, 1.02], [4.62, 0.98], [4.75, 0.64]],
    glass: [[1.28, 1.00], [1.98, 1.62], [3.58, 1.66], [4.20, 1.10]],
  },
  {
    key: "van", len: 5.10, wid: 1.98, sill: 0.34, wr: 0.37, arch: 0.55,
    ax: [1.05, 3.90], belt: 1.04,
    low: [[0, 0.56], [0.10, 0.78], [0.45, 0.96], [0.86, 1.04], [4.72, 1.06], [5.06, 1.02], [5.10, 0.60]],
    glass: [[0.98, 1.04], [1.46, 1.78], [4.52, 1.82], [4.96, 1.22]],
  },
  {
    key: "pickup", len: 5.20, wid: 1.95, sill: 0.38, wr: 0.40, arch: 0.58,
    ax: [1.18, 3.92], belt: 1.06,
    low: [[0, 0.62], [0.12, 0.84], [0.62, 0.98], [1.20, 1.04], [2.40, 1.06], [2.52, 1.18], [5.06, 1.18], [5.20, 1.08], [5.20, 0.66]],
    glass: [[1.38, 1.06], [2.00, 1.70], [2.44, 1.72], [2.52, 1.18]],
  },
  {
    key: "sport", len: 4.35, wid: 1.92, sill: 0.26, wr: 0.35, arch: 0.51,
    ax: [1.00, 3.35], belt: 0.74,
    low: [[0, 0.38], [0.16, 0.54], [0.70, 0.64], [1.16, 0.70], [3.58, 0.74], [4.18, 0.72], [4.35, 0.44]],
    glass: [[1.32, 0.74], [2.18, 1.18], [2.98, 1.20], [3.60, 0.78]],
  },
];

export function buildCarMesh(color, typeIdx) {
  const T = CAR_TYPES[(typeIdx || 0) % CAR_TYPES.length];
  const g = new THREE.Group();
  const paint = paintMat(color);
  const body = new THREE.Mesh(cgeo("body" + T.key, () => bodyGeometry(T)), paint);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(cgeo("glass" + T.key, () => glassGeometry(T)), glassMat());
  glass.castShadow = true;
  g.add(glass);

  // painted roof cap over the greenhouse + A/C pillars at both sides
  const p = T.glass;
  const roofY = Math.max(p[1][1], p[2][1]);
  const roof = new THREE.Mesh(
    cgeo("roof" + T.key, () =>
      new THREE.BoxGeometry(T.wid - 0.13, 0.07, p[2][0] - p[1][0] + 0.12)),
    paint,
  );
  roof.position.set(0, roofY + 0.01, (p[1][0] + p[2][0]) / 2 - T.len / 2);
  roof.castShadow = true;
  g.add(roof);
  const xo = T.wid / 2 - 0.09;
  [-xo, xo].forEach((x) => {
    strut(g, T, p[0], p[1], x, paint, 0.08);
    strut(g, T, p[2], p[3], x, paint, 0.08);
  });

  // bumpers, sill trim, plates, mirrors, exhaust
  const bumpG = cgeo("bump" + T.key, () =>
    new THREE.BoxGeometry(T.wid * 0.99, 0.26, 0.3));
  [-1, 1].forEach((s) => {
    const b = new THREE.Mesh(bumpG, trimMat());
    b.position.set(0, T.sill + 0.16, s * (T.len / 2 - 0.13));
    b.castShadow = true;
    g.add(b);
    const pl = new THREE.Mesh(
      cgeo("plate", () => new THREE.BoxGeometry(0.52, 0.13, 0.03)),
      plateMat(),
    );
    pl.position.set(0, T.sill + 0.17, s * (T.len / 2 + 0.02));
    g.add(pl);
  });
  const skirtG = cgeo("skirt" + T.key, () =>
    new THREE.BoxGeometry(T.wid + 0.02, 0.1, T.len * 0.5));
  const skirt = new THREE.Mesh(skirtG, trimMat());
  skirt.position.y = T.sill + 0.03;
  g.add(skirt);
  const mirrG = cgeo("mirror", () => new THREE.BoxGeometry(0.06, 0.09, 0.16));
  [-1, 1].forEach((s) => {
    const m = new THREE.Mesh(mirrG, paint);
    m.position.set(s * (T.wid / 2 + 0.06), T.belt + 0.09, p[0][0] + 0.16 - T.len / 2);
    m.castShadow = true;
    g.add(m);
  });
  const exh = new THREE.Mesh(
    cgeo("exh", () => {
      const c = new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8);
      c.rotateX(Math.PI / 2);
      return c;
    }),
    chromeMat(),
  );
  exh.position.set(T.wid * 0.28, T.sill + 0.02, T.len / 2 + 0.04);
  g.add(exh);

  // lamps: per-car materials so brake/reverse/headlight state is per-vehicle
  const headM = new THREE.MeshStandardMaterial({
    color: 0xf2f0e4, emissive: 0xfff2d2, emissiveIntensity: 0.35,
    metalness: 0.2, roughness: 0.25,
  });
  const tailM = new THREE.MeshStandardMaterial({
    color: 0x6e0f0a, emissive: 0xff2a14, emissiveIntensity: 0.3,
    metalness: 0.2, roughness: 0.3,
  });
  const revM = new THREE.MeshStandardMaterial({
    color: 0xdcdcd4, emissive: 0xffffff, emissiveIntensity: 0,
    metalness: 0.2, roughness: 0.3,
  });
  const hy = topAt(T.low, 0.26) - 0.12,
    ty = topAt(T.low, T.len - 0.28) - 0.14;
  const lampG = cgeo("lamp", () => new THREE.BoxGeometry(0.32, 0.13, 0.1));
  const glows = [];
  [-1, 1].forEach((s) => {
    const hl = new THREE.Mesh(lampG, headM);
    hl.position.set(s * T.wid * 0.34, hy, -T.len / 2 + 0.04);
    g.add(hl);
    const hg = glowSprite(0xfff0cc, 1.1);
    hg.position.copy(hl.position);
    hg.position.z -= 0.05;
    g.add(hg);
    glows.push({ sp: hg, kind: "head" });
    const tl = new THREE.Mesh(lampG, tailM);
    tl.position.set(s * T.wid * 0.36, ty, T.len / 2 - 0.04);
    g.add(tl);
    const tg = glowSprite(0xff3a1e, 0.85);
    tg.position.copy(tl.position);
    tg.position.z += 0.05;
    g.add(tg);
    glows.push({ sp: tg, kind: "tail" });
    const rl = new THREE.Mesh(
      cgeo("revlamp", () => new THREE.BoxGeometry(0.14, 0.09, 0.08)),
      revM,
    );
    rl.position.set(s * T.wid * 0.16, ty - 0.02, T.len / 2 - 0.04);
    g.add(rl);
  });

  // night headlight beams + the pool of light they throw on the road
  const beams = new THREE.Group();
  beams.visible = false;
  const beamMat = fxMat("beam", () =>
    new THREE.MeshBasicMaterial({
      color: 0xffeec2, transparent: true, opacity: 0.05, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  [-1, 1].forEach((s) => {
    const cone = new THREE.Mesh(
      cgeo("beamcone", () => {
        const c = new THREE.ConeGeometry(1.15, 14, 12, 1, true);
        c.rotateX(-Math.PI / 2);
        c.translate(0, 0, -7);
        return c;
      }),
      beamMat,
    );
    cone.position.set(s * T.wid * 0.3, hy, -T.len / 2);
    cone.rotation.x = -0.06;
    beams.add(cone);
  });
  const pool = new THREE.Mesh(
    cgeo("pool", () => new THREE.PlaneGeometry(7, 13).rotateX(-Math.PI / 2)),
    fxMat("poolm", () => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d");
      const gr = x.createRadialGradient(64, 52, 2, 64, 64, 62);
      gr.addColorStop(0, "rgba(255,240,205,0.30)");
      gr.addColorStop(0.45, "rgba(255,236,190,0.10)");
      gr.addColorStop(1, "rgba(255,230,180,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      return new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
    }),
  );
  pool.position.set(0, T.sill - 0.24, -T.len / 2 - 5.5);
  beams.add(pool);
  // light is not a hitbox: keep bullets from "hitting" the beam cone
  beams.traverse((o) => (o.raycast = () => {}));
  g.add(beams);

  // wheels: steer pivot → spin group (draw() rolls `mesh`, steers `pivot`)
  const ws = [];
  T.ax.forEach((az, i) => {
    [-1, 1].forEach((s) => {
      const spin = wheelAssembly(T);
      const pivot = new THREE.Group();
      pivot.position.set(s * (T.wid / 2 - 0.07), T.wr, az - T.len / 2);
      pivot.add(spin);
      g.add(pivot);
      ws.push({ pivot, mesh: spin, front: i === 0 });
    });
  });
  g.userData.wheels = ws;
  g.userData.lamps = { head: headM, tail: tailM, rev: revM, glows, beams };
  g.userData.ownMats = [headM, tailM, revM];
  g.userData.type = T;
  return g;
}
// NOTE: syncVehicleLights lives in drive_traffic.js — it needs the active
// vehicle and the on-foot flag, which are session state, not mesh state.

