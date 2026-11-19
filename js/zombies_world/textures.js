/* Night Shift procedural canvases and textures: wounds, spray, cloth, skin and
   roughness, split out of js/zombies_world.js. It shares the editor's state
   through live imports from ../zombies_world.js. */
import * as THREE from "three";
import { rnd, rr } from "../zombies_state.js";
import { normalTex as texNormal, registerFallback, tex as texLoad } from "../zombies_tex.js";
import {
  CLOTH_FILES, HIT_SURFACE_MAT, NO_RAYCAST, TEX, Zmat, bloodSplatCanvas, cnv,
  ctex, fleshCanvas, fleshRoughTex, impactCanvas, set_HIT_SURFACE_MAT,
  set_TEX, set_Zmat,
} from "../zombies_world.js";

function bloodWoundCanvas() {
  var c = cnv(64, 64),
    x = c.getContext("2d"),
    cx = 32,
    cy = 32,
    i;
  x.clearRect(0, 0, 64, 64);
  x.fillStyle = "rgba(40,2,4,0.98)";
  x.beginPath();
  x.ellipse(cx, cy, 14, 8, rr(-0.4, 0.4), 0, 6.3);
  x.fill();
  x.fillStyle = "rgba(10,0,2,0.95)";
  x.beginPath();
  x.ellipse(cx, cy, 7, 3, 0, 0, 6.3);
  x.fill();
  for (i = 0; i < 6; i++) {
    x.fillStyle = "rgba(80,4,8," + rr(0.4, 0.8) + ")";
    x.beginPath();
    x.arc(cx + rr(-10, 10), cy + rr(-6, 6), rr(1.5, 3.5), 0, 6.3);
    x.fill();
  }
  // registered as a fallback painter: the loader drawImage()s whatever this
  // returns, so it must be the canvas itself, not a texture
  return c;
}

/* Soft white radial sprite — the alpha falloff every particle system samples
   (blood mist, dust motes). Drawn once, shared by TEX.spray. */
function sprayTex() {
  var c = cnv(64, 64),
    x = c.getContext("2d");
  var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function clothCanvas() {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, S, S);
  // woven fabric grain
  for (i = 0; i < S; i += 2) {
    x.fillStyle = "rgba(0,0,0," + (0.03 + (i % 4 === 0 ? 0.04 : 0)) + ")";
    x.fillRect(0, i, S, 1);
    x.fillStyle = "rgba(0,0,0," + (0.02 + (i % 6 === 0 ? 0.03 : 0)) + ")";
    x.fillRect(i, 0, 1, S);
  }
  for (i = 0; i < 800; i++) {
    x.fillStyle = "rgba(0,0,0," + rr(0.02, 0.14) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(1, 4), rr(1, 3));
  }
  // grime + dried blood at the hem
  for (i = 0; i < 35; i++) {
    x.fillStyle = "rgba(48,10,10," + rr(0.08, 0.4) + ")";
    x.beginPath();
    x.arc(rnd() * S, rr(S * 0.45, S), rr(3, 14), 0, 6.3);
    x.fill();
  }
  // mud / dirt
  for (i = 0; i < 25; i++) {
    x.fillStyle = "rgba(40,32,22," + rr(0.06, 0.28) + ")";
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, rr(4, 15), rr(2, 8), rnd() * 3, 0, 6.3);
    x.fill();
  }
  return c;
}

// Textile stand-in: a palette/pattern seed per garment file, so a wardrobe
// painted without the photos is still six distinguishable fabrics rather than
// one flat weave repeated across the horde.
function uniqueClothCanvas(base, accent, style) {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#" + (base >>> 0).toString(16).padStart(6, "0");
  x.fillRect(0, 0, S, S);
  var ac = "#" + (accent >>> 0).toString(16).padStart(6, "0");
  x.globalAlpha = 0.34;
  if (style % 3 === 0) {
    for (var i = -S; i < S * 2; i += 18) {
      x.fillStyle = ac;
      x.fillRect(i, 0, 6, S);
      x.fillRect(0, i, S, 5);
    }
  } else if (style % 3 === 1) {
    for (var j = 0; j < S; j += 20) {
      x.fillStyle = ac;
      x.fillRect(0, j, S, 4);
      x.fillRect(j, 0, 4, S);
    }
  } else {
    x.fillStyle = ac;
    for (var k = 0; k < 20; k++) {
      x.beginPath();
      x.arc(rnd() * S, rnd() * S, rr(3, 12), 0, 6.3);
      x.fill();
    }
  }
  x.globalAlpha = 1;
  // woven grain and grime, repeated on every layer but with a unique phase
  for (var q0 = 0; q0 < S; q0 += 2) {
    x.fillStyle = "rgba(255,255,255," + rr(0.018, 0.07) + ")";
    x.fillRect(0, q0, S, 1);
    x.fillStyle = "rgba(0,0,0," + rr(0.018, 0.08) + ")";
    x.fillRect(q0, 0, 1, S);
  }
  for (var d = 0; d < 90; d++) {
    x.fillStyle = "rgba(26,12,10," + rr(0.025, 0.16) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(1, 4), rr(1, 3));
  }
  return c;
}

// A small transparent jagged slash used as the visible opening in a damaged
// garment.  It is layered over a persistent blood/skin decal at the same hit.
function clothTearCanvas() {
  var S = 64,
    c = cnv(S, S),
    x = c.getContext("2d");
  x.clearRect(0, 0, S, S);
  x.strokeStyle = "rgba(8,4,5,0.96)";
  x.lineWidth = 6;
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(9, 48);
  x.lineTo(22, 36);
  x.lineTo(17, 27);
  x.lineTo(39, 12);
  x.lineTo(52, 7);
  x.stroke();
  x.strokeStyle = "rgba(150,18,22,0.86)";
  x.lineWidth = 1.8;
  x.beginPath();
  x.moveTo(10, 47);
  x.lineTo(23, 35);
  x.lineTo(18, 26);
  x.lineTo(40, 11);
  x.stroke();
  return c;
}

// Smooth “pretty undead” skin — pale porcelain, less necrosis blotching.
function prettySkinCanvas(base, blush, vein) {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // soft subsurface warmth
  for (i = 0; i < 40; i++) {
    var r = rr(10, 45),
      px = rnd() * S,
      py = rnd() * S;
    var g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, blush + (0.08 + rnd() * 0.12) + ")");
    g.addColorStop(1, blush + "0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  // fine pores
  for (i = 0; i < 600; i++) {
    x.fillStyle = "rgba(40,20,24," + rr(0.015, 0.05) + ")";
    x.fillRect(rnd() * S, rnd() * S, 1.0, 1.0);
  }
  // faint veins (pretty, not grotesque)
  x.lineWidth = 0.6;
  for (i = 0; i < 12; i++) {
    x.strokeStyle = vein + rr(0.06, 0.16) + ")";
    x.beginPath();
    var vx = rnd() * S,
      vy = rnd() * S,
      a = rnd() * 6.3;
    x.moveTo(vx, vy);
    for (var k = 0; k < 4; k++) {
      a += rr(-0.5, 0.5);
      vx += Math.cos(a) * 6;
      vy += Math.sin(a) * 6;
      x.lineTo(vx, vy);
    }
    x.stroke();
  }
  // tiny beauty marks / freckles
  for (i = 0; i < 20; i++) {
    x.fillStyle = "rgba(90,40,30," + rr(0.08, 0.22) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(0.5, 1.5), 0, 6.3);
    x.fill();
  }
  // very few small bruises (undead cue without ruining the look)
  for (i = 0; i < 3; i++) {
    var wx = rnd() * S,
      wy = rnd() * S,
      wr = rr(3, 8);
    var wg = x.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wg.addColorStop(0, "rgba(90,30,50,0.25)");
    wg.addColorStop(1, "rgba(40,10,20,0)");
    x.fillStyle = wg;
    x.beginPath();
    x.arc(wx, wy, wr, 0, 6.3);
    x.fill();
  }
  return c;
}

export function prettyRoughTex() {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d");
  // mostly smooth (light grey = higher roughness mid); keep soft
  x.fillStyle = "#b8b0aa";
  x.fillRect(0, 0, S, S);
  for (var i = 0; i < 30; i++) {
    x.fillStyle = "rgba(255,255,255," + rr(0.05, 0.2) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(4, 20), 0, 6.3);
    x.fill();
  }
  // oily/wet highlights zones (darker = smoother)
  for (i = 0; i < 15; i++) {
    x.fillStyle = "rgba(30,30,30," + rr(0.15, 0.4) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(3, 11), 0, 6.3);
    x.fill();
  }
  var t2 = ctex(c, 1);
  t2.colorSpace = THREE.NoColorSpace;
  return t2;
}

/* Offline stand-ins. The mode's photographic maps sit in assets/, which is
   the one part of the app that is not vendored — open index.html without them
   (or with a file:// path the browser refuses) and every surface used to fall
   back to flat white. These procedural painters predate the photos and were
   left stranded when they landed; registered here they are the fallback the
   loader draws instead, and because the library derives normals and roughness
   from whatever it ends up with, the substitute is a full material rather
   than a colour. Each url gets a fixed seed set so the stand-in is at least
   the right fabric. */
function registerFallbacks() {
  registerFallback("assets/textures/zombie_flesh.jpg", function () {
    return fleshCanvas("#6b6a52", "rgba(74,96,58,");
  });
  registerFallback("assets/textures/zombie_pretty_flesh.jpg", function () {
    return prettySkinCanvas("#d8bfae", "rgba(200,120,120,", "rgba(90,110,150,");
  });
  registerFallback("assets/textures/zombie_cloth.jpg", clothCanvas);
  registerFallback("assets/textures/fx_tear_1.png", clothTearCanvas);
  registerFallback("assets/textures/fx_tear_v2.png", clothTearCanvas);
  registerFallback("assets/textures/fx_wound_entry_v2.png", bloodWoundCanvas);
  registerFallback("assets/textures/fx_wound_graze_v2.png", bloodWoundCanvas);
  registerFallback("assets/textures/fx_blood_spatter_v2.png", bloodSplatCanvas);
  [1, 2, 3].forEach(function (n) {
    registerFallback("assets/textures/fx_blood_" + n + ".png", bloodSplatCanvas);
  });
  CLOTH_FILES.forEach(function (f, i) {
    registerFallback("assets/textures/cloth_" + f.k + ".jpg", function () {
      return uniqueClothCanvas(f.base, f.accent, i);
    });
  });
}

export function ensureTex() {
  if (TEX.ready) return;
  registerFallbacks();

  // One shared photo per skin family, plus the normal map derived from it —
  // without that the flashlight sweeping over a body produced no shading at
  // all and the undead read as painted mannequins.
  TEX.fleshMap = texLoad("assets/textures/zombie_flesh.jpg", { rep: 1 });
  TEX.fleshNorm = texNormal("assets/textures/zombie_flesh.jpg", { rep: 1, strength: 2.6 });
  TEX.prettyMap = texLoad("assets/textures/zombie_pretty_flesh.jpg", { rep: 1 });
  TEX.prettyNorm = texNormal("assets/textures/zombie_pretty_flesh.jpg", { rep: 1, strength: 1.5 });

  TEX.fleshRough = fleshRoughTex();
  TEX.prettyRough = prettyRoughTex();
  TEX.cloth = texLoad("assets/textures/zombie_cloth.jpg", { rep: 1 });
  TEX.clothNorm = texNormal("assets/textures/zombie_cloth.jpg", { rep: 1, strength: 2 });

  // Decals are quads, not tiling surfaces: repeat wrapping made the bilinear
  // filter sample across the far edge and smear blood along the border.
  // World stains, skin wounds and fabric tears are different phenomena. The
  // old path reused the same square blood photos for all three, which made a
  // hit read as an image pasted over the material instead of damaged material.
  TEX.blood = [texLoad("assets/textures/fx_blood_spatter_v2.png", { clamp: true })];
  TEX.wound = [
    texLoad("assets/textures/fx_wound_entry_v2.png", { clamp: true }),
    texLoad("assets/textures/fx_wound_graze_v2.png", { clamp: true })
  ];
  TEX.tear = texLoad("assets/textures/fx_tear_v2.png", { clamp: true });
  // Three bullet holes so a burst into one spot does not stamp the same
  // silhouette three times — that repetition is most of what makes decals
  // read as stickers.
  TEX.impact = [0, 1, 2].map(function () {
    var t = new THREE.CanvasTexture(impactCanvas());
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
  TEX.spray = sprayTex();

  TEX.clothes = {};
  TEX.clothesNorm = {};
  CLOTH_FILES.forEach(function (f) {
    var url = "assets/textures/cloth_" + f.k + ".jpg";
    TEX.clothes[f.k] = texLoad(url, { rep: 2 });
    TEX.clothesNorm[f.k] = texNormal(url, { rep: 2, strength: f.n });
  });
  TEX.ready = true;
}

// Drops every texture and material the undead are built from. Survives a
// restart on purpose — only leaving the mode (or a change of texel budget)
// pays to rebuild them. Textures loaded through the library are released by
// disposeTexLib(); the procedural ones are ours to free.
export function resetTexCache() {
  function kill(t) {
    if (t && t.isTexture) t.dispose();
  }
  Object.keys(TEX).forEach(function (k) {
    var v = TEX[k];
    if (Array.isArray(v)) v.forEach(kill);
    else if (v && typeof v === "object" && !v.isTexture)
      Object.keys(v).forEach(function (kk) {
        kill(v[kk]);
      });
    else kill(v);
  });
  set_TEX({});
  Zmat.flesh.forEach(function (m) {
    m && m.dispose();
  });
  Zmat.pretty.forEach(function (m) {
    m && m.dispose();
  });
  ["cloth", "clothLayer", "eyeGlow", "hair"].forEach(function (g) {
    for (var k in Zmat[g]) Zmat[g][k].dispose();
  });
  ["stump", "eye", "bone", "lip"].forEach(function (k) {
    if (Zmat[k]) Zmat[k].dispose();
  });
  set_Zmat({ flesh: [], pretty: [], cloth: {}, clothLayer: {}, stump: null, eye: null, bone: null, eyeGlow: {}, lip: null, hair: {} });
  for (var h in HIT_SURFACE_MAT) if (HIT_SURFACE_MAT[h]) HIT_SURFACE_MAT[h].dispose();
  set_HIT_SURFACE_MAT({ wound: null, tear: null });
}

export function noRaycast(o) {
  o.traverse
    ? o.traverse(function (c) {
        c.raycast = NO_RAYCAST;
      })
    : (o.raycast = NO_RAYCAST);
  return o;
}

/* A unit quad turned into an instanced geometry — the carrier for both particle
   pools. See the note in initFX: WebGPU cannot draw sized points, so particles
   are billboarded sprite instances. */
function instancedQuad(count) {
  var base = new THREE.PlaneGeometry(1, 1);
  var g = new THREE.InstancedBufferGeometry();
  // Node materials resolve `uv()` from the *rendered* geometry.  Referencing
  // PlaneGeometry's attributes directly made the WebGPU path lose that
  // attribute after the temporary base geometry was disposed, producing a
  // console warning on the first muzzle-flash/fire-particle render.
  g.setIndex(base.index.clone());
  g.setAttribute("position", base.attributes.position.clone());
  g.setAttribute("uv", base.attributes.uv.clone());
  g.instanceCount = count;
  base.dispose();
  return g;
}

// A decal is still alpha-masked, but its carrier no longer has four perfectly
// straight sides. This irregular fan removes the last visible rectangular
// silhouette under grazing light, low mip levels and overlapping marks.
function organicDecalGeometry(seed, points) {
  points = points || 14;
  var pos = new Float32Array((points + 1) * 3),
    uv0 = new Float32Array((points + 1) * 2),
    idx = new Uint16Array(points * 3);
  uv0[0] = uv0[1] = 0.5;
  for (var i = 0; i < points; i++) {
    var a = (i / points) * Math.PI * 2;
    var wobble = Math.sin(seed * 12.9898 + i * 7.113) * 0.5 + 0.5;
    var rad = 0.43 + wobble * 0.065;
    var vi = i + 1,
      px = Math.cos(a) * rad,
      py = Math.sin(a) * rad;
    pos[vi * 3] = px;
    pos[vi * 3 + 1] = py;
    uv0[vi * 2] = px + 0.5;
    uv0[vi * 2 + 1] = py + 0.5;
    idx[i * 3] = 0;
    idx[i * 3 + 1] = vi;
    idx[i * 3 + 2] = ((i + 1) % points) + 1;
  }
  var geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv0, 2));
  geo.computeVertexNormals();
  return geo;
}

export { instancedQuad, organicDecalGeometry };
