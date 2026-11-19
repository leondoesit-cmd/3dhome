/* Night Shift zombie materials, hair and skin, building and spawning zombies,
   split out of js/zombies_world.js. It shares the editor's state through live
   imports from ../zombies_world.js. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { legacyIntensity } from "../gpu.js";
import { clamp } from "../state.js";
import { Z, pick, rnd, rr } from "../zombies_state.js";
import { fleshMat, prettyMat } from "../zombies_world/atmosphere.js";
import { applyZedShadowQuality } from "../zombies_world/fx_gore.js";
import { ensureTex } from "../zombies_world/textures.js";
import {
  CLOTHES, FLESH_SKINS, GEO, GEO_STEP, HAIR_COLS, PRETTY_SKINS, TEX, Z_TYPES,
  Zmat, freeSpot, nsQuality, prewarmRun, set_GEO, set_prewarmRun,
} from "../zombies_world.js";

export function lipMat() {
  if (!Zmat.lip)
    Zmat.lip = new THREE.MeshStandardMaterial({
      color: 0xa03038,
      roughness: 0.35,
      metalness: 0.08,
      emissive: 0x200408,
      emissiveIntensity: 0.15,
    });
  return Zmat.lip;
}
export function hairMat(hex) {
  if (!Zmat.hair[hex])
    Zmat.hair[hex] = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.55,
      metalness: 0.12,
      envMapIntensity: 0.4,
    });
  return Zmat.hair[hex];
}
export function clothMat(hex) {
  if (!Zmat.cloth[hex])
    Zmat.cloth[hex] = new THREE.MeshStandardMaterial({
      map: TEX.cloth,
      normalMap: TEX.clothNorm || null,
      normalScale: new THREE.Vector2(0.9, 0.9),
      color: hex,
      roughness: 0.92,
      metalness: 0.04,
      envMapIntensity: 0.1,
    });
  return Zmat.cloth[hex];
}
export function stumpMat() {
  if (!Zmat.stump)
    Zmat.stump = new THREE.MeshStandardMaterial({
      color: 0x5e0a10,
      roughness: 0.38,
      metalness: 0.05,
      emissive: 0x2a0508,
      emissiveIntensity: 0.35,
    });
  return Zmat.stump;
}
export function boneMat() {
  if (!Zmat.bone)
    Zmat.bone = new THREE.MeshStandardMaterial({
      color: 0xc8bba0,
      roughness: 0.55,
      metalness: 0.05,
    });
  return Zmat.bone;
}
export function eyeMat(hex) {
  var c = hex || 0xff3a10;
  if (!Zmat.eyeGlow[c])
    Zmat.eyeGlow[c] = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  return Zmat.eyeGlow[c];
}

function q(v) {
  if (!v) return 0;
  var s = v < 0 ? -1 : 1,
    a = Math.abs(v);
  // below half a centimetre the relative step is finer than the eye or the
  // renderer cares about; snap those to a flat 0.05cm grid instead
  if (a < 0.5) return s * (Math.round(a * 20) / 20);
  return s * Math.round(Math.exp(Math.round(Math.log(a) / GEO_STEP) * GEO_STEP) * 100) / 100;
}
function sharedGeo(key, make) {
  var g = GEO[key];
  if (!g) {
    g = GEO[key] = make();
    g.userData.shared = true;
  }
  return g;
}

export function clearZedGeoCache() {
  set_prewarmRun(prewarmRun + 1);
  for (var k in GEO) GEO[k].dispose();
  set_GEO({});
}
// true when the holder owns this geometry outright and may dispose it;
// false for cache-shared body parts, which only clearZedGeoCache() frees
export function ownsGeo(geo) {
  return !!(geo && !(geo.userData && geo.userData.shared));
}

/* A procedural zombie is visually detailed but most of that detail is rigid
   inside one articulated joint. Submitting every cheek, toe, tooth and torso
   accent separately made a small horde cost hundreds of draw calls on every
   frame (and again in the flashlight shadow pass). Merge only direct siblings
   that have the same material/hit region/render state; joint animation,
   dismemberment, materials and the final pixels stay the same. Clothing stays
   separate because each shell has its own secondary-motion transform. */
function batchZombieRig(rig) {
  if (!rig || !rig.root) return;
  var protectedMeshes = new Set();
  (rig.eyes || []).forEach(function (m) { if (m) protectedMeshes.add(m); });
  [rig.buttL, rig.buttR].forEach(function (m) { if (m) protectedMeshes.add(m); });
  if (rig.clothes && rig.clothes.meshes)
    rig.clothes.meshes.forEach(function (m) { if (m) protectedMeshes.add(m); });

  var before = 0,
    after = 0,
    groups = [];
  rig.root.traverse(function (o) {
    if (o.isMesh) before++;
    else if (o.children && o.children.length) groups.push(o);
  });
  groups.forEach(function (parent) {
    var buckets = {};
    parent.children.slice().forEach(function (m) {
      if (
        !m.isMesh ||
        m.children.length ||
        !m.geometry ||
        !m.material ||
        Array.isArray(m.material) ||
        protectedMeshes.has(m) ||
        m.userData.cloth ||
        !m.visible
      ) return;
      var key = [
        m.material.uuid,
        m.userData.part || "",
        m.castShadow ? 1 : 0,
        m.receiveShadow ? 1 : 0,
        m.renderOrder || 0,
      ].join("|");
      (buckets[key] || (buckets[key] = [])).push(m);
    });
    Object.keys(buckets).forEach(function (key) {
      var meshes = buckets[key];
      if (meshes.length < 2) return;
      var copies = meshes.map(function (m) {
        m.updateMatrix();
        var geo = m.geometry.clone();
        geo.applyMatrix4(m.matrix);
        return geo;
      });
      var mergedGeo = mergeGeometries(copies, false);
      copies.forEach(function (geo) { geo.dispose(); });
      if (!mergedGeo) return;
      var first = meshes[0],
        merged = new THREE.Mesh(mergedGeo, first.material);
      merged.castShadow = first.castShadow;
      merged.receiveShadow = first.receiveShadow;
      merged.renderOrder = first.renderOrder;
      merged.userData.part = first.userData.part;
      merged.userData.zedBatch = true;
      meshes.forEach(function (m) { parent.remove(m); });
      parent.add(merged);
    });
  });
  rig.root.traverse(function (o) { if (o.isMesh) after++; });
  rig.batchStats = { before: before, after: after };
}

export function bx(parent, w, h, d, x, y, z, mat, part) {
  var m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}
function boxGeo(w, h, d) {
  w = q(w); h = q(h); d = q(d);
  return sharedGeo("b" + w + "," + h + "," + d, function () {
    return new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  });
}
function cylGeo(r1, r2, h, segs, open) {
  r1 = q(r1); r2 = q(r2); h = q(h);
  return sharedGeo("c" + r1 + "," + r2 + "," + h + "," + segs + (open ? "o" : ""), function () {
    return new THREE.CylinderGeometry(r1, r2, h, segs, 1, !!open);
  });
}
function sphGeo(r, w, h) {
  r = q(r);
  return sharedGeo("s" + r + "," + w + "," + h, function () {
    return new THREE.SphereGeometry(r, w, h);
  });
}

export function cy(parent, r1, r2, h, x, y, z, mat, part, segs) {
  var m = new THREE.Mesh(cylGeo(r1, r2, h, segs || 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}
export function sp(parent, r, x, y, z, mat, part, segs) {
  var m = new THREE.Mesh(sphGeo(r, segs || 14, segs ? segs - 2 : 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}

function makeClothLayer(base, accent, style, layer, female) {
  var kind;
  if (layer === "pants") {
    kind = "denim";
  } else if (layer === "coat") {
    kind = style % 2 === 0 ? "leather" : "camo";
  } else {
    if (female) {
      kind = style % 2 === 0 ? "floral" : "knit";
    } else {
      kind = style % 3 === 0 ? "plaid" : style % 3 === 1 ? "knit" : "camo";
    }
  }
  var leather = kind === "leather";
  var key = kind + "|" + (base >>> 0);
  if (!Zmat.clothLayer) Zmat.clothLayer = {};
  if (!Zmat.clothLayer[key]) {
    Zmat.clothLayer[key] = new THREE.MeshStandardMaterial({
      map: TEX.clothes[kind],
      // The weave is the whole point of these photos and it was being thrown
      // away: at repeat 2 over a torso, colour alone cannot tell denim from
      // knitwear under a flashlight. Leather is smoother than it is bumpy, so
      // it leans on roughness while knit and camo lean on the normal.
      normalMap: nsQuality() === 0 ? null : ((TEX.clothesNorm && TEX.clothesNorm[kind]) || null),
      normalScale: new THREE.Vector2(leather ? 0.6 : 1, leather ? 0.6 : 1),
      color: base,
      roughness: leather ? 0.4 : 0.88,
      metalness: leather ? 0.1 : 0.02,
      side: THREE.DoubleSide,
      envMapIntensity: 0.12,
    });
  }
  return { mat: Zmat.clothLayer[key], layer: layer, damage: 0 };
}

function addClothMesh(parent, geometry, layer, part, list, layerName, sway) {
  var mesh = new THREE.Mesh(geometry, layer.mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.part = part || "body";
  mesh.userData.cloth = true;
  mesh.userData.clothLayer = layerName;
  mesh.userData.clothSway = sway || 1;
  mesh.userData.clothBaseRX = mesh.rotation.x;
  mesh.userData.clothBaseRY = mesh.rotation.y;
  mesh.userData.clothBaseRZ = mesh.rotation.z;
  parent.add(mesh);
  list.push(mesh);
  return mesh;
}

// A two-joint fabric strip is much cheaper than cloth simulation, yet it
// gives loose hems and coats a convincing delayed follow-through. The root is
// parented to the same body joint as the garment, while the two segments are
// animated independently in applyJiggle().
function addClothFlap(parent, width, height, x, y, z, layer, part, list, flaps, sway) {
  var root = new THREE.Group();
  root.position.set(x, y, z);
  root.userData.cloth = true;
  root.userData.clothLayer = layer.layer;
  root.userData.part = part || "body";
  parent.add(root);

  var upper = new THREE.Group();
  root.add(upper);
  var upperMesh = addClothMesh(
    upper, boxGeo(width, height * 0.52, 1.35), layer, part, list, layer.layer, sway
  );
  upperMesh.position.y = -height * 0.26;

  var lower = new THREE.Group();
  lower.position.y = -height * 0.52;
  upper.add(lower);
  var lowerMesh = addClothMesh(
    lower, boxGeo(width * 0.94, height * 0.48, 1.18), layer, part, list, layer.layer, sway * 1.25
  );
  lowerMesh.position.y = -height * 0.24;

  var flap = {
    root: root, upper: upper, lower: lower,
    sway: sway || 1, phase: rnd() * 6.28,
    // Longer panels carry more momentum; left/right coat tails get opposite
    // torsion while turning. These are scalars only—no extra bones or meshes.
    drag: clamp(height / 30, 0.45, 1.25),
    side: x < -0.5 ? -1 : x > 0.5 ? 1 : 0,
    upperX: 0, upperY: 0, upperZ: 0, lowerX: 0, lowerY: 0, lowerZ: 0,
    upperVX: 0, upperVY: 0, upperVZ: 0, lowerVX: 0, lowerVY: 0, lowerVZ: 0,
  };
  flaps.push(flap);
  return flap;
}

// Clothing is made from thin moving shells attached to the same shoulder/hip
// groups as the body.  This means the fabric inherits every step, stagger and
// death pose, while the small sway pass below gives loose layers their own lag.
function buildClothes(torso, legL, legR, armL, armR, p) {
  var bulk = p.bulk,
    hipW = p.hipW,
    chestW = p.chestW,
    waist = p.waist,
    lean = p.lean,
    legLen = p.legLen,
    type = p.type,
    female = p.female,
    clothes = [],
    flaps = [],
    layers = {};
  var palettes = [
    [0x283647, 0x9b5a45], [0x44352d, 0xbca46c], [0x3b2938, 0x8d556d],
    [0x243b35, 0x8ba07c], [0x4b4640, 0xb7aa91], [0x252832, 0x697d9c],
  ];
  var idx = (rnd() * palettes.length) | 0;
  var pal = palettes[idx];
  layers.shirt = makeClothLayer(pal[0], pal[1], (idx + 1) % 3, "shirt", female);
  layers.pants = makeClothLayer(pick(CLOTHES), pal[1], (idx + 2) % 3, "pants", female);
  layers.sleeve = makeClothLayer(pal[0], pal[1], (idx + 3) % 3, "sleeve", female);
  layers.coat = makeClothLayer(pal[1], pal[0], (idx + 4) % 3, "coat", female);

  var shirtSegs = nsQuality() >= 2 ? 18 : nsQuality() >= 1 ? 12 : 8;
  var limbClothSegs = nsQuality() >= 2 ? 14 : nsQuality() >= 1 ? 10 : 8;
  var shirt = cylGeo(
    15.2 * bulk * chestW * 1.08,
    12.8 * bulk * waist * 1.10,
    type === "brute" ? 53 : 49,
    shirtSegs, true
  );
  var shirtMesh = addClothMesh(torso, shirt, layers.shirt, "body", clothes, "shirt", 0.75);
  shirtMesh.position.set(0, 31, 0);
  shirtMesh.scale.z = female ? 1.24 : 1.08;
  shirtMesh.userData.clothLayerRef = layers.shirt;

  var shorts = cylGeo(
    17.0 * bulk * hipW,
    13.2 * bulk * waist,
    female ? 22 : 19,
    shirtSegs, true
  );
  var shortMesh = addClothMesh(torso, shorts, layers.pants, "body", clothes, "pants", 0.65);
  shortMesh.position.set(0, 4, 0);
  shortMesh.userData.clothLayerRef = layers.pants;

  function legCloth(leg) {
    if (!leg || !leg.hip) return;
    var thigh = cylGeo(10.0 * bulk, 8.2 * bulk, 45 * lean * legLen, limbClothSegs, true);
    var tm = addClothMesh(leg.hip, thigh, layers.pants, "limb", clothes, "pants", 0.9);
    tm.position.y = -23 * lean * legLen;
    tm.userData.clothLayerRef = layers.pants;
    if (leg.knee) {
      var shin = cylGeo(7.0 * bulk, 5.8 * bulk, 43 * lean * legLen, limbClothSegs, true);
      var sm = addClothMesh(leg.knee, shin, layers.pants, "limb", clothes, "pants", 1.05);
      sm.position.y = -22 * lean * legLen;
      sm.userData.clothLayerRef = layers.pants;
    }
  }
  legCloth(legL);
  legCloth(legR);

  function armCloth(arm) {
    if (!arm || !arm.sh) return;
    var upper = cylGeo(6.7 * bulk, 5.6 * bulk, 36, limbClothSegs, true);
    var um = addClothMesh(arm.sh, upper, layers.sleeve, "limb", clothes, "sleeve", 1.1);
    um.position.y = -18;
    um.userData.clothLayerRef = layers.sleeve;
    if (arm.el) {
      var fore = cylGeo(5.9 * bulk, 4.8 * bulk, 34, limbClothSegs, true);
      var fm = addClothMesh(arm.el, fore, layers.sleeve, "limb", clothes, "sleeve", 1.25);
      fm.position.y = -17;
      fm.userData.clothLayerRef = layers.sleeve;
    }
  }
  armCloth(armL);
  armCloth(armR);

  // Separate articulated hems make the clothing visibly lag behind the body.
  // They inherit torso motion first, then sway on their own two lightweight
  // joints. Splitting at the centre keeps a tear from looking like a decal on
  // a rigid postcard.
  if (type !== "crawler" && nsQuality() > 0) {
    var coatChance = type === "brute" ? 0.9 : 0.72;
    if (rnd() < coatChance) {
      addClothFlap(torso, 12.5 * bulk * chestW, 31, -7.0 * bulk, 39, -14.8 * bulk, layers.coat, "body", clothes, flaps, 1.55);
      addClothFlap(torso, 12.5 * bulk * chestW, 31, 7.0 * bulk, 39, -14.8 * bulk, layers.coat, "body", clothes, flaps, 1.55);
    }
    // A short split shirt hem is present on every standing zombie, so the
    // layered-body system remains legible even when this spawn has no coat.
    addClothFlap(torso, 10.5 * bulk * waist, 13, 0, 12, 13.2 * bulk, layers.shirt, "body", clothes, flaps, 0.82);
  }
  return { meshes: clothes, flaps: flaps, layers: layers, palette: idx };
}

// Shaded-in skin for the parts that sit in a crease or catch less light.
function softenSkin(m) {
  m.color.multiplyScalar(0.92);
  m.roughness = Math.min(1, m.roughness + 0.06);
  return m;
}

// Higher-segment body parts for smoother curves
function spH(parent, r, x, y, z, mat, part) {
  return sp(parent, r, x, y, z, mat, part, nsQuality() >= 2 ? 18 : nsQuality() >= 1 ? 12 : 8);
}
function cyH(parent, r1, r2, h, x, y, z, mat, part) {
  return cy(parent, r1, r2, h, x, y, z, mat, part, nsQuality() >= 2 ? 16 : nsQuality() >= 1 ? 10 : 7);
}

// Hair is kept separate from the head mesh. Each lock has an anchor plus two
// articulated segments, making it follow head turns while retaining a small
// physical delay. This is deliberately a transform-only rig: dozens of
// zombies can use it without the cost of skinning or a cloth solver.
function addHairLock(parent, x, y, z, length, radius, mat, phase) {
  var anchor = new THREE.Group();
  anchor.position.set(x, y, z);
  parent.add(anchor);

  var upper = new THREE.Group();
  anchor.add(upper);
  var upperMesh = cyH(upper, radius, radius * 0.78, length * 0.56, 0, -length * 0.28, 0, mat, "head");
  upperMesh.userData.hair = true;

  var lower = new THREE.Group();
  lower.position.y = -length * 0.55;
  upper.add(lower);
  var lowerMesh = cyH(lower, radius * 0.8, radius * 0.34, length * 0.48, 0, -length * 0.24, 0, mat, "head");
  lowerMesh.userData.hair = true;

  return {
    anchor: anchor, upper: upper, lower: lower, phase: phase || 0,
    upperX: 0, upperZ: 0, lowerX: 0, lowerZ: 0,
    upperVX: 0, upperVZ: 0, lowerVX: 0, lowerVZ: 0,
  };
}

// Night Shift 21+: clothed undead with layered, damageable textiles.
export function buildZombie(type) {
  ensureTex();
  var T = Z_TYPES[type] || Z_TYPES.walker,
    root = new THREE.Group(),
    // fewer "pretty" skins; mix rot back in
    usePretty = type !== "brute" && type !== "crawler" ? rnd() < 0.42 : rnd() < 0.12,
    pi = (rnd() * PRETTY_SKINS.length) | 0,
    fi = (rnd() * FLESH_SKINS.length) | 0,
    fm = (usePretty ? prettyMat(pi) : fleshMat(fi)).clone(),
    // The soft material dresses cheeks, knees and creases on the SAME body,
    // so it is a nudge off this zombie's skin — not the next entry in the
    // palette, which now that the palette actually differs would have given
    // one undead a green torso and jaundiced limbs.
    fmSoft = softenSkin(fm.clone()),
    // more bruised / sickly accents
    accent = new THREE.MeshStandardMaterial({
      color: usePretty ? 0xa84850 : 0x6a3030,
      roughness: 0.62,
      metalness: 0.04,
      map: usePretty ? TEX.prettyMap : TEX.fleshMap,
      normalMap: (usePretty ? TEX.prettyNorm : TEX.fleshNorm) || null,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    cm = clothMat(pick(CLOTHES)),
    sc = T.scale * rr(0.94, 1.06),
    bulk = type === "brute" ? 1.2 : type === "bloater" ? 1.45 : type === "runner" ? 0.9 : 1,
    lean = type === "runner" ? 1.05 : 1,
    // balanced gender, less glam bias
    female =
      type === "screamer" ? rnd() < 0.7 :
      type === "brute" ? rnd() < 0.25 :
      type === "runner" ? rnd() < 0.5 :
      rnd() < 0.48,
    rags = rnd() < 0.28;

  // more natural / less exaggerated proportions
  var hipW = female ? rr(1.08, 1.2) : rr(0.98, 1.08),
    chestW = female ? rr(1.02, 1.12) : type === "brute" ? 1.22 : 1.06,
    waist = female ? rr(0.82, 0.92) : rr(0.92, 1.02),
    shoulder = female ? rr(0.9, 0.98) : type === "brute" ? 1.18 : 1.05,
    legLen = female ? 1.02 : 1.0;

  var body = new THREE.Group();
  root.add(body);

  // --- long smooth legs
  // --- long smooth legs
  function leg(sx) {
    var hip = new THREE.Group();
    hip.position.set(sx * 10.5 * bulk * hipW, 86, 0);
    var thighR = (female ? 9.2 : 8.6) * bulk;
    cyH(hip, thighR, thighR * 0.78, 46 * lean * legLen, 0, -23 * lean * legLen, 0, fm, "limb");
    // full outer thigh + hip curve
    spH(hip, thighR * 0.85, sx * 3.2, -4, -2, fm, "limb").scale.set(1.25, 1.45, 1.2);
    // inner thigh soft
    spH(hip, thighR * 0.45, -sx * 2.5, -14, 2, fmSoft, "limb").scale.set(0.9, 1.4, 1.0);
    var knee = new THREE.Group();
    knee.position.set(0, -46 * lean * legLen, 0);
    cyH(knee, 6.4 * bulk, 5.2 * bulk, 44 * lean * legLen, 0, -22 * lean * legLen, 0, fm, "limb");
    spH(knee, 5.0 * bulk, 0, -2, 2.5, fmSoft, "limb");
    // elegant foot
    var foot = spH(knee, 5.5 * bulk, 0, -44 * lean * legLen, 8, fm, "limb");
    foot.scale.set(0.85, 0.55, 1.55);
    bx(knee, 10 * bulk, 4.5, 20, 0, -45 * lean * legLen, 10, fm, "limb");
    // combined toes box
    bx(knee, 9.2 * bulk, 3.6, 6.5, 0, -46 * lean * legLen, 19, fm, "limb");
    hip.add(knee);
    body.add(hip);
    return { hip: hip, knee: knee };
  }
  var legL = leg(-1),
    legR = leg(1);

  // --- hourglass torso
  var torso = new THREE.Group();
  torso.position.set(0, 86, 0);
  body.add(torso);

  // wide hips
  cyH(torso, 15.5 * bulk * hipW, 12 * bulk * waist, 16, 0, 7, 0, fm, "body");
  // plump glutes (jiggle targets)
  var buttS = (female ? 10.2 : 9.0) * bulk * hipW;
  var buttL = spH(torso, buttS, -7.2 * hipW, 5, -9, fm, "body");
  buttL.scale.set(1.15, 1.25, 1.2);
  buttL.userData.baseSX = 1.15;
  buttL.userData.baseSY = 1.25;
  buttL.userData.baseSZ = 1.2;
  var buttR = spH(torso, buttS, 7.2 * hipW, 5, -9, fm, "body");
  buttR.scale.set(1.15, 1.25, 1.2);
  buttR.userData.baseSX = 1.15;
  buttR.userData.baseSY = 1.25;
  buttR.userData.baseSZ = 1.2;
  // soft lower back dimples
  if (female) {
    spH(torso, 2.2, -3, 14, -10, fmSoft, "body");
    spH(torso, 2.2, 3, 14, -10, fmSoft, "body");
  }

  // cinched waist
  cyH(torso, 11.5 * bulk * waist, 13.5 * bulk * chestW, 20, 0, 24, 1, fm, "body");
  // soft belly (female slight curve, not wound)
  spH(torso, 8 * waist * bulk, 0, 22, 7, fmSoft, "body").scale.set(1.15, 0.9, 0.85);

  // upper chest
  cyH(torso, 14.5 * bulk * chestW, 13 * bulk * shoulder, 26, 0, 46, 0, fm, "body");

  // --- breasts / pecs (groups stored for jiggle)
  var breastL = null,
    breastR = null,
    hairLocks = [];
  if (female) {
    var bSize = type === "brute" ? 11.5 : type === "runner" ? rr(9, 11) : rr(9.5, 12);
    var bY = 50,
      bZ = 10,
      bSpread = 7.6 * chestW;
    // streamlined teardrop breast shape
    function breast(sx) {
      var g = new THREE.Group();
      g.position.set(sx * bSpread, bY, bZ);
      g.userData.baseY = bY;
      g.userData.baseZ = bZ;
      g.userData.baseX = sx * bSpread;
      g.userData.jiggle = 0;
      torso.add(g);
      var main = new THREE.Mesh(sphGeo(bSize, 14, 12), fm);
      main.scale.set(1.02, 1.08, 1.15);
      main.position.set(0, -1.5, 0);
      main.castShadow = true;
      main.userData.part = "body";
      g.add(main);
      // areola + nipple
      var nip = new THREE.Mesh(sphGeo(2.4, 10, 8), accent);
      nip.scale.set(1, 1, 0.8);
      nip.position.set(0, -0.6, bSize * 0.95);
      nip.userData.part = "body";
      g.add(nip);
      return g;
    }
    breastL = breast(-1);
    breastR = breast(1);
    spH(torso, 4, 0, bY - 2, bZ + 2, fmSoft, "body").scale.set(0.6, 1.2, 0.8);
  } else {
    // defined athletic pecs
    spH(torso, 10 * bulk, -8.5, 51, 8, fm, "body").scale.set(1.4, 0.9, 1.05);
    spH(torso, 10 * bulk, 8.5, 51, 8, fm, "body").scale.set(1.4, 0.9, 1.05);
    spH(torso, 2.0, -7, 49, 13.5, accent, "body");
    spH(torso, 2.0, 7, 49, 13.5, accent, "body");
    // abs suggestion
    for (var ab = 0; ab < 3; ab++) {
      spH(torso, 3.2, -3.5, 28 + ab * 7, 8, fmSoft, "body").scale.set(1.1, 0.7, 0.6);
      spH(torso, 3.2, 3.5, 28 + ab * 7, 8, fmSoft, "body").scale.set(1.1, 0.7, 0.6);
    }
  }

  // shoulders — smooth, no boxy pads
  spH(torso, 7.5 * bulk * shoulder, -18 * shoulder, 58, 0, fm, "body");
  spH(torso, 7.5 * bulk * shoulder, 18 * shoulder, 58, 0, fm, "body");
  cyH(torso, 4.5, 4.5, 34 * bulk * shoulder, 0, 60, -1, fm, "body").rotation.z = Math.PI / 2;

  // visible decay — wounds, ribs, gut
  if (rnd() < 0.7) {
    spH(torso, rr(4, 7), rr(-10, 10), rr(28, 52), rnd() < 0.5 ? 10 : -11, stumpMat(), "body");
  }
  if (rnd() < 0.55) {
    bx(torso, rr(8, 18), 1.4, 2.2, rr(-8, 8), rr(10, 40), 10, stumpMat(), "body").rotation.z = rr(-0.5, 0.5);
  }
  if (rnd() < 0.45) {
    for (var rb = 0; rb < 2; rb++) {
      var rib = cyH(torso, 1.0, 1.0, 16 - rb * 2, 0, 32 + rb * 6, 9, boneMat(), "body");
      rib.rotation.z = Math.PI / 2;
    }
    spH(torso, 6, 0, 22, 9, stumpMat(), "body");
  }

  // --- anatomy
  if (female) {
    var mons = spH(torso, 6.2 * hipW, 0, 1.5, 9, fmSoft, "body");
    mons.scale.set(1.15, 0.65, 0.9);
    spH(torso, 2.4, 0, 0.4, 12.5, accent, "body").scale.set(1.2, 1.3, 0.85);
  } else {
    var shaftLen = type === "brute" ? 16 : rr(12, 15);
    var gen = new THREE.Group();
    gen.position.set(0, 0.5, 9.5);
    torso.add(gen);
    var shaft = new THREE.Mesh(cylGeo(2.7, 2.3, shaftLen, 12), fmSoft);
    shaft.rotation.x = Math.PI / 2 + 0.28;
    shaft.position.set(0, -0.5, shaftLen * 0.38);
    shaft.castShadow = true;
    shaft.userData.part = "body";
    gen.add(shaft);
    var sac = new THREE.Mesh(sphGeo(4.8, 10, 8), fm);
    sac.position.set(0, -2.8, 1.2);
    sac.scale.set(1.4, 1.1, 1.0);
    sac.castShadow = true;
    sac.userData.part = "body";
    gen.add(sac);
  }

  if (rags && female) {
    var band = cyH(torso, 16 * hipW, 16 * hipW, 2.5, 0, 10, 0, cm, "body");
    band.scale.set(1, 1, 0.7);
  }

  // --- head
  var neck = new THREE.Group();
  neck.position.set(0, 61 + (type === "brute" ? 3 : 0), 1);
  torso.add(neck);
  cyH(neck, female ? 4.6 : 5.2, female ? 5.0 : 5.6, 12, 0, 6, 0, fm, "head");
  if (female) spH(neck, 3.2, 0, 2, 3, fmSoft, "head").scale.set(1.1, 1.4, 0.9);

  var head = new THREE.Group();
  head.position.set(0, 14, 0);
  neck.add(head);
  var skullR = type === "brute" ? 13 : female ? 10.8 : 11.6;
  var skull = spH(head, skullR, 0, 3.5, 0.5, fm, "head");
  skull.scale.set(female ? 0.92 : 1.0, female ? 1.18 : 1.12, female ? 1.0 : 1.06);
  spH(head, female ? 4.4 : 4.0, -5.5, 1.5, 4, fmSoft, "head");
  spH(head, female ? 4.4 : 4.0, 5.5, 1.5, 4, fmSoft, "head");
  spH(head, 2.0, 0, 2.5, 10, fm, "head").scale.set(0.75, 1.1, 1.3);
  var lips = bx(head, female ? 7.5 : 8, 2.4, 3.2, 0, -3.2, 9.5, lipMat(), "head");
  lips.scale.set(1, 0.85, 1);
  if (type === "screamer") {
    bx(head, 8, 3.5, 4, 0, -5.5, 8, fm, "head");
    for (var ti = 0; ti < 4; ti++)
      bx(head, 1.4, 2.6, 1.2, (ti - 1.5) * 2.2, -6.5, 10, boneMat(), "head");
  } else {
    bx(head, 5.5, 1.2, 1.5, 0, -4.2, 10.5, boneMat(), "head");
  }
  bx(head, 4.5, 1.0, 1.5, -4, 6.5, 8.5, hairMat(0x1a1010), "head").rotation.z = 0.15;
  bx(head, 4.5, 1.0, 1.5, 4, 6.5, 8.5, hairMat(0x1a1010), "head").rotation.z = -0.15;
  spH(head, 2.2, -10, 2.5, 0, fm, "head").scale.set(0.6, 1.1, 0.85);
  spH(head, 2.2, 10, 2.5, 0, fm, "head").scale.set(0.6, 1.1, 0.85);

  // hair
  var hCol = pick(HAIR_COLS);
  var hm = hairMat(hCol);
  var hairTop = spH(head, female ? 12.2 : 11.5, 0, 8, -2, hm, "head");
  hairTop.scale.set(1.12, female ? 1.0 : 0.75, 1.18);
  spH(head, 5, 0, 7, 8, hm, "head").scale.set(1.6, 0.55, 0.7);
  if (female) {
    if (nsQuality() > 0) {
      for (var hk = 0; hk < 3; hk++) {
        var a = (hk / 2) * Math.PI * 1.1 - Math.PI * 0.55;
        var lock = addHairLock(
          head,
          Math.sin(a) * 8.2,
          rr(-1, 3),
          -4.5 + Math.cos(a) * 4.2,
          rr(26, 38),
          2.2,
          hm,
          hk * 1.1
        );
        lock.anchor.rotation.x = rr(0.45, 0.75);
        lock.anchor.rotation.z = Math.sin(a) * 0.35;
        hairLocks.push(lock);
      }
    }
    spH(head, 6, -8, 4, -2, hm, "head").scale.set(0.9, 1.4, 1.1);
    spH(head, 6, 8, 4, -2, hm, "head").scale.set(0.9, 1.4, 1.1);
  } else if (nsQuality() > 0 && rnd() < 0.62) {
    for (var mk = 0; mk < 2; mk++) {
      var shortLock = addHairLock(
        head, (mk - 0.5) * 6.5, rr(2, 5), rr(-4, -6), rr(10, 16), 1.35, hm, 4 + mk * 1.2
      );
      shortLock.anchor.rotation.x = rr(0.35, 0.55);
      shortLock.anchor.rotation.z = (mk - 0.5) * 0.15;
      hairLocks.push(shortLock);
    }
  }

  // glowing eyes
  var eyeCol = female
    ? pick([0xff6688, 0xff4466, 0xaa66ff, 0x66ccff, T.eye || 0xff3a10])
    : T.eye || 0xff3a10;
  var eL = sp(head, female ? 2.5 : 2.3, -4.2, 4.5, 9.8, eyeMat(eyeCol), "head", 10),
    eR = sp(head, female ? 2.5 : 2.3, 4.2, 4.5, 9.8, eyeMat(eyeCol), "head", 10);
  eL.castShadow = eR.castShadow = false;
  var gL = sp(head, 4.8, -4.2, 4.5, 9.4, eyeMat(eyeCol), "head", 8),
    gR = sp(head, 4.8, 4.2, 4.5, 9.4, eyeMat(eyeCol), "head", 8);
  gL.material = gL.material.clone();
  gR.material = gR.material.clone();
  gL.material.opacity = gR.material.opacity = 0.4;
  gL.castShadow = gR.castShadow = false;

  // --- slender / toned arms
  function arm(sx) {
    var sh = new THREE.Group();
    sh.position.set(sx * 19 * bulk * shoulder, 57, 0);
    var armR = (female ? 5.2 : 6.2) * bulk;
    cyH(sh, armR, armR * 0.85, 36, 0, -18, 0, fm, "limb");
    var el = new THREE.Group();
    el.position.set(0, -36, 0);
    cyH(el, armR * 0.85, armR * 0.7, 34, 0, -17, 0, fm, "limb");
    spH(el, armR * 0.75, 0, 0, 0, fmSoft, "limb");
    var hand = spH(el, 5.5 * bulk, 0, -34, 2, fm, "limb");
    hand.scale.set(0.95, 0.75, 1.2);
    // combined fingers & thumb box
    var fingers = bx(el, 7.5 * bulk, 7.0, 3.0, 0, -39, 4.5, fm, "limb");
    fingers.rotation.x = 0.2;
    var thumb = bx(el, 2.2, 4.5, 2.0, sx * 4.0, -35, 3.5, fm, "limb");
    thumb.rotation.z = sx * 0.45;
    sh.add(el);
    torso.add(sh);
    return { sh: sh, el: el, hand: hand };
  }
  var armL = arm(-1),
    armR = arm(1);

  var clothes = buildClothes(torso, legL, legR, armL, armR, {
    bulk: bulk,
    hipW: hipW,
    chestW: chestW,
    waist: waist,
    lean: lean,
    legLen: legLen,
    type: type,
    female: female,
  });

  if (type === "brute") {
    spH(torso, 12, -17, 55, 0, fm, "body");
    spH(torso, 12, 17, 55, 0, fm, "body");
  } else if (type === "screamer") {
    spH(neck, 5, 0, 3, 5, fmSoft, "body").scale.set(1, 1.2, 1.3);
  }

  // slightly taller elegant females
  root.scale.setScalar(sc * (female && type !== "brute" ? 1.02 : 1));
  root.userData.zed = true;
  root.userData.female = female;
  root.userData.nude = false;
  root.userData.clothed = true;
  root.userData.pretty = usePretty;

  // faint cold aura only — no hot-pink glam glow
  var aura = null;
  if (usePretty && nsQuality() >= 2 && rnd() < 0.35) {
    aura = new THREE.PointLight(0x8866aa, legacyIntensity(0.22, 160), 160, 2);
    aura.position.set(0, 100, 16);
    root.add(aura);
  }

  // Shadow trim. The flashlight is the only shadow caster left in the mode, and
  // it renders the whole rig a second time into its shadow map every frame. Around
  // 50 of a rig's ~120 primitives are detail under 5cm — fingers, toes, teeth,
  // abs, dimples, hair locks — none of which resolve as a shadow from across a
  // room. Dropping them from the shadow pass costs nothing visible and takes
  // ~40% off the per-zombie shadow draw calls.
  root.traverse(function (o) {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    var bs = o.geometry.boundingSphere;
    if (bs && bs.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 5) o.castShadow = false;
  });

  // fewer sirens; still a light distraction pull
  var siren = !!(female && usePretty && type !== "brute" && rnd() < 0.28);

  var rig = {
    root: root,
    body: body,
    torso: torso,
    head: head,
    neck: neck,
    skull: skull,
    eyes: [eL, eR, gL, gR],
    rim: null,
    aura: aura,
    breastL: breastL,
    breastR: breastR,
    buttL: buttL,
    buttR: buttR,
    hairLocks: hairLocks,
    legL: legL,
    legR: legR,
    armL: armL,
    armR: armR,
    clothes: clothes,
    fleshMat: fm,
    fleshSoftMat: fmSoft,
    skinDamage: 0,
    scale: sc,
    type: type,
    female: female,
    nude: false,
    clothed: true,
    pretty: usePretty,
    siren: siren,
    distract: female && usePretty ? rr(0.35, 0.7) : female ? 0.25 : 0.12,
  };
  batchZombieRig(rig);
  return rig;
}

export function spawnZed(type, x, z) {
  ensureTex();
  var T = Z_TYPES[type],
    rig = buildZombie(type);
  var spot = freeSpot(x, z, 22);
  var z0 = {
    type: type,
    female: !!(rig && rig.female),
    nude: false,
    clothed: true,
    pretty: !!(rig && rig.pretty),
    siren: !!(rig && rig.siren),
    distract: (rig && rig.distract) || 0.2,
    teaseT: 0,
    jiggle: 0,
    rig: rig,
    root: rig.root,
    x: spot.x,
    z: spot.z,
    y: 0,
    vy: 0,
    hp: T.hp * rr(0.9, 1.15) * (1 + (Z.wave.n - 1) * 0.09),
    maxHp: T.hp,
    spd: T.spd * rr(0.88, 1.14),
    dmg: T.dmg,
    rate: T.rate,
    head: 0,
    state: "idle",
    phase: rnd() * 10,
    stagger: 0,
    windup: 0,
    cool: 0,
    dead: false,
    deadT: 0,
    dist: 1e9,
    crawler: type === "crawler",
    limbs: { armL: true, armR: true, legL: true, legR: true, head: true },
    limbDmg: { armL: 0, armR: 0, legL: 0, legR: 0, head: 0 },
    clothDamage: 0,
    clothTears: [],
    skinWounds: [],
    growlT: rr(0.5, 4),
    alerted: false,
    wander: { x: spot.x, z: spot.z, t: 0 },
    feel: 0,
    grabT: 0,
    grabbing: false,
    hitFlash: 0,
    flankSign: rnd() < 0.5 ? -1 : 1,
    burstT: null,
    crowdT: rnd() * 0.12,
    frontCount: 0,
    sepT: rnd() * 0.06,
    doorT: rnd() * 0.16,
    animT: 0,
  };
  if (z0.crawler) {
    // legs already gone: drag along on the elbows
    if (rig.legL && rig.legL.hip) rig.legL.hip.visible = false;
    if (rig.legR && rig.legR.hip) rig.legR.hip.visible = false;
    z0.limbs.legL = z0.limbs.legR = false;
  }
  rig.root.position.set(z0.x, 0, z0.z);
  Z.grp.add(rig.root);
  // wire hit-detection back to the logical zombie from any mesh
  rig.root.traverse(function (o) {
    o.userData.zed = z0;
  });
  applyZedShadowQuality(rig.root);
  Z.zeds.push(z0);
  return z0;
}

export { boxGeo, sphGeo };
