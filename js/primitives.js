// Low-level THREE mesh helpers + procedural floor textures + flat polygon geometry.
import { THREE, ADDONS } from "./three_lazy.js";
import { S, fin, PHYSICS_MATS, MAT_PROPS, FABRIC, WOOD, TOP, BEDC, RUGC, STEEL, ISL, GREEN, CAB } from "./state.js";
import { pbrPixels } from "./pbr_textures.js";
import { getTexturePresetBumpUrl } from "./textures.js";
import { pbrEntryFor, pbrTextures, applyPbrMaps, legacyTextureUrl } from "./pbr_material.js";

// Classify a part's physical material from how it is actually rendered:
// transmissive/transparent → glass, high metalness → metal, then the
// color table, falling back to engineered board (the furniture default).
function physProps(color, opt) {
  opt = opt || {};
  if (opt.transmission != null || opt.trans) return MAT_PROPS.glass;
  if (opt.metal != null && opt.metal >= 0.4) return MAT_PROPS.steel;
  return PHYSICS_MATS[color] || PHYSICS_MATS.default;
}

export function emis(m, opt) {
  if (opt.emis != null) {
    m.emissive = new THREE.Color(opt.emis);
    m.emissiveIntensity = 0.4 + 1.4 * S.artK;
    m.userData.glow = true;
  }
}

// Metals & polished surfaces should mirror the room/sky (IBL). Default matte
// materials are barely touched; shiny appliances/glass get a strong reflection boost.
function tuneEnv(m) {
  var gloss = 1 - m.roughness;
  m.envMapIntensity = 1 + m.metalness * 0.9 + Math.max(0, gloss - 0.6) * 0.8;
}

/* ---- finish "skins" (furniture variants) --------------------------------
   A variant re-finishes a model without touching its build(): the active skin
   maps a SOURCE color (the shared constants in state.js — CAB, FABRIC, WOOD…)
   to a replacement color and, optionally, replacement roughness/metalness.
   furniture.js sets it around f.build() and always clears it, so nothing
   built outside a variant is ever affected.
   Physics still classifies parts by their ORIGINAL color, so a black-leather
   sofa keeps behaving like fabric rather than like painted steel. */
var skin = null;
export function setSkin(s) {
  skin = s && s.swap ? s : null;
}
function reskin(color, opt) {
  if (!skin) return { col: color, opt: opt };
  var to = skin.swap[color];
  if (to == null) return { col: color, opt: opt };
  if (typeof to === "number") return { col: to, opt: opt };
  // object form: { col, rough, metal, tex, texScale } — only the given fields override
  var o = Object.assign({}, opt);
  if (to.rough != null) o.rough = to.rough;
  if (to.metal != null) o.metal = to.metal;
  if (to.tex != null) o.tex = to.tex;
  if (to.texScale != null) o.texScale = to.texScale;
  if (to.texBump != null) o.texBump = to.texBump;
  if (to.texColor != null) o.texColor = to.texColor;
  return { col: to.col != null ? to.col : color, opt: o };
}

// A catalogue item's custom texture is an item-level finish.  Older code
// listed only four source colours here, so most procedural parts (legs,
// cushions, shelves, round pieces, etc.) silently kept their flat material.
// Apply the finish to every non-metal/non-transparent part unless the builder
// explicitly opts out.  Hardware, glass and emissive surfaces remain intact.
function withSkinTexture(opt) {
  opt = opt || {};
  if (opt.tex || !skin || !skin.allTex) return opt;
  if (opt.noItemTexture || opt.trans || opt.transmission != null || opt.emis != null)
    return opt;
  if (opt.metal != null && opt.metal >= 0.65) return opt;
  var o = Object.assign({}, opt, { tex: skin.allTex });
  if (skin.allTexScale != null) o.texScale = skin.allTexScale;
  if (skin.allTexBump != null) o.texBump = skin.allTexBump;
  if (skin.allTexColor != null) o.texColor = skin.allTexColor;
  return o;
}

// Shared loader/mapping path for boxes, cylinders, spheres and custom cabinet
// polygons.  Keeping this in one place prevents a new primitive from losing
// the selected texture and keeps UV density consistent in centimetres.
export function applyTextureToMaterial(m, opt, width, height, depth) {
  opt = withSkinTexture(opt);
  if (!m || !opt || !opt.tex) return;
  var texUrl = opt.tex;
  // Library material: full PBR maps once loaded, its old preset meanwhile.
  var lib = pbrEntryFor(texUrl);
  if (lib) {
    var libScale = opt.texScale || lib.sizeCm;
    var libDim = Math.max(Math.abs(width) || 0, Math.abs(depth) || 0) || 100;
    if (applyPbrMaps(m, lib, Math.max(libDim / libScale, 0.001), Math.max((Math.abs(height) || 100) / libScale, 0.001),
      { tint: opt.texColor })) return;
    texUrl = legacyTextureUrl(lib);
    if (!texUrl) return;
  }
  if (!S.customTexCache) S.customTexCache = {};
  if (!S.customTexCache[texUrl]) {
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    var tx = loader.load(texUrl, function () {
      // Parts built while this was still loading were left untextured on
      // purpose; the event invalidates the item cache so they get rebuilt.
      S.dirty3D = true;
      S.repaint3D = true;
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("customTextureLoaded"));
      if (typeof window !== "undefined" && typeof window.cadUpdatePreview === "function")
        window.cadUpdatePreview();
    });
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace) tx.colorSpace = THREE.SRGBColorSpace;
    S.customTexCache[texUrl] = tx;
  }
  // Wait for the bitmap before handing the material a map. Texture.copy() sets
  // needsUpdate on every clone, so a clone taken while the loader is still
  // fetching is version>0 with `image === null` — and updateTexture() then
  // throws on `image.complete`, killing the render pass (black viewport).
  // The loader callback above flags a rebuild, which re-runs this with an image.
  if (!S.customTexCache[texUrl].image) return;
  var tex = S.customTexCache[texUrl].clone();
  var maxDim = Math.max(Math.abs(width) || 0, Math.abs(depth) || 0) || 100;
  var scale = opt.texScale || 200;
  tex.repeat.set(Math.max(maxDim / scale, 0.001), Math.max((Math.abs(height) || 100) / scale, 0.001));
  m.map = tex;
  m.color.setHex(opt.texColor != null ? opt.texColor : 0xffffff);

  var bUrl = getTexturePresetBumpUrl(texUrl);
  if (bUrl) {
    if (!S.customBumpCache) S.customBumpCache = {};
    if (!S.customBumpCache[bUrl]) {
      var btx = new THREE.TextureLoader().load(bUrl, function () {
        S.dirty3D = true;
        S.repaint3D = true;
        if (typeof window !== "undefined")
          window.dispatchEvent(new CustomEvent("customTextureLoaded"));
      });
      btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
      S.customBumpCache[bUrl] = btx;
    }
  }
  if (bUrl && S.customBumpCache[bUrl].image) { // same wait-for-bitmap rule as the map
    var btxCloned = S.customBumpCache[bUrl].clone();
    btxCloned.repeat.set(Math.max(maxDim / scale, 0.001), Math.max((Math.abs(height) || 100) / scale, 0.001));
    m.bumpMap = btxCloned;
    m.bumpScale = opt.texBump != null ? opt.texBump : 0.20;
  }
  m.needsUpdate = true;
}

/* ---- surface detail (js/pbr_textures.js) ----
   Every part painted with one of the shared source colours gets that
   material's detail: weave on upholstery, grain on wood, flecks on a quartz
   top. Keyed on the SOURCE colour (before a variant re-tints it), like the
   physics table, so a variant keeps its material and changes only its tint —
   the detail map is near-white and multiplies the colour. Textures are shared
   and never disposed (clearGroup disposes materials, not their maps). */
var COLOR_PBR = {};
COLOR_PBR[FABRIC] = "linen";
COLOR_PBR[BEDC] = "cotton";
COLOR_PBR[RUGC] = "boucle";
COLOR_PBR[WOOD] = "oak";
COLOR_PBR[ISL] = "oak";
COLOR_PBR[CAB] = "oak";
COLOR_PBR[TOP] = "quartz";
COLOR_PBR[STEEL] = "brushed";
COLOR_PBR[GREEN] = "foliage";
var pbrCache = {};
function pbrTex(name) {
  if (name in pbrCache) return pbrCache[name];
  pbrCache[name] = null;
  if (typeof document === "undefined" || !THREE.CanvasTexture) return null;
  var px = pbrPixels(name, 256);
  if (!px) return null;
  function tex(bytes, srgb) {
    var c = document.createElement("canvas");
    c.width = c.height = px.size;
    var x = c.getContext("2d");
    if (!x) return null;
    x.putImageData(new ImageData(bytes, px.size, px.size), 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  pbrCache[name] = { map: tex(px.albedo, true), normalMap: px.normal ? tex(px.normal, false) : null, tileCm: px.tileCm };
  return pbrCache[name];
}
/* Box-project UVs in centimetres (u,v = the two coordinates across the
   dominant normal axis, over tileCm), so a tiled detail keeps its real size
   on a 2 m sofa and on a 20 cm cushion alike. */
export function worldUVs(geo, tileCm) {
  var p = geo.attributes.position, n = geo.attributes.normal;
  if (!p || !n) return;
  var uv = new Float32Array(p.count * 2), k = 1 / (tileCm || 50);
  for (var i = 0; i < p.count; i++) {
    var ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    var u, v;
    // on upright faces the texture's v axis runs horizontally, so grain and
    // brushing (which run along u) stand vertical on doors, sides and legs
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getY(i); v = p.getZ(i); }
    else { u = p.getY(i); v = p.getX(i); }
    uv[i * 2] = u * k;
    uv[i * 2 + 1] = v * k;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
/* A wood family on a finish a variant has painted (white gloss, graphite,
   navy…) is lacquer, not timber: grain showing through it would read as a
   mistake. Low-saturation finishes get the fine painted texture instead. */
function paintedFinish(hex) {
  var r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn < 0.1 || (mx - mn) / (mx || 1) < 0.16;
}
function applyDetail(m, geo, srcColor, opt, finalColor) {
  if (!m || m.map || opt.tex || opt.trans || opt.transmission != null || opt.emis != null || opt.noDetail) return;
  var fam = opt.pbr || COLOR_PBR[srcColor];
  if (!fam) return;
  var painted = fam === "oak" && finalColor != null && finalColor !== srcColor && paintedFinish(finalColor);
  // Baked library detail (Codex source, Blender-derived normal + ORM) when
  // it has loaded; the procedural family below until then.
  var lib = pbrEntryFor("pbr:" + (painted ? "lacquer" : fam));
  if (lib && pbrTextures(lib)) {
    worldUVs(geo, lib.sizeCm);
    applyPbrMaps(m, lib, 1, 1, { normalScale: 0.7 });
    var base = opt.rough != null ? opt.rough : m.roughness;
    // the ORM map holds the catalogue's roughness; keep a part's own glossier
    // or rougher intent by scaling it rather than discarding it
    m.roughness = Math.min(1.6, Math.max(0.3, base / ((lib.rough[0] + lib.rough[1]) / 2 || 1)));
    if (opt.metal != null) m.metalness = opt.metal;
    return;
  }
  if (painted) fam = "plaster";
  var t = pbrTex(fam);
  if (!t || !t.map) return;
  worldUVs(geo, t.tileCm);
  m.map = t.map;
  if (t.normalMap) {
    m.normalMap = t.normalMap;
    m.normalScale = new THREE.Vector2(0.7, 0.7);
  }
}

/* Dome one face of a box outward by up to `amt` cm, falling off to zero at
   its edges — the fill of a cushion pushing its cover out. axis "y" crowns
   the top, "z" the front. */
function crownGeometry(g, bw, bh, bd, amt, axis) {
  var p = g.attributes.position, hw = bw / 2, hh = bh / 2, hd = bd / 2;
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), y = p.getY(i), z = p.getZ(i), f;
    if (axis === "z") {
      if (z <= 0) continue;
      f = Math.max(0, 1 - (x / hw) * (x / hw)) * Math.max(0, 1 - (y / hh) * (y / hh)) * (z / hd);
      p.setZ(i, z + amt * f);
    } else {
      if (y <= 0) continue;
      f = Math.max(0, 1 - (x / hw) * (x / hw)) * Math.max(0, 1 - (z / hd) * (z / hd)) * (y / hh);
      p.setY(i, y + amt * f);
    }
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
}

export function box(parent, x0, x1, y0, y1, z0, z1, color, opt) {
  opt = opt || {};
  if (!(fin(x0) && fin(x1) && fin(y0) && fin(y1) && fin(z0) && fin(z1)))
    return null; // never feed NaN to WebGL
  var srcColor = color,
    sk = reskin(color, opt);
  color = sk.col;
  opt = withSkinTexture(sk.opt);
  var bw = Math.abs(x1 - x0) || 0.1,
    bh = Math.abs(y1 - y0) || 0.1,
    bd = Math.abs(z1 - z0) || 0.1;
  // Rounded edges catch a highlight and read as real furniture instead of raw CGI boxes.
  // Radius is adaptive & capped so flush-stacked parts don't gap; skip on thin panels.
  var g,
    br = Math.min(1.3, Math.min(bw, bh, bd) * 0.28);
  if (opt.taper) {
    /* A frustum: the top face scaled toward the centre by taper.x / taper.z
       (a hood canopy, a lampshade, a tapered plinth). */
    g = new THREE.BoxGeometry(bw, bh, bd);
    var tp = g.attributes.position;
    for (var ti = 0; ti < tp.count; ti++)
      if (tp.getY(ti) > 0) {
        tp.setX(ti, tp.getX(ti) * (opt.taper.x != null ? opt.taper.x : 1));
        tp.setZ(ti, tp.getZ(ti) * (opt.taper.z != null ? opt.taper.z : 1));
      }
    tp.needsUpdate = true;
    g.computeVertexNormals();
  } else if (opt.radius != null && ADDONS.RoundedBoxGeometry) {
    /* Upholstery: a real soft radius (a cushion is not a crate with its
       edges sanded), with enough segments that the curve reads, and an
       optional crown so a seat cushion domes instead of sitting flat. */
    var rr = Math.max(0.4, Math.min(opt.radius, Math.min(bw, bh, bd) / 2 - 0.05));
    // segments by need: a crowned cushion needs a face grid to dome; a
    // softened edge needs only enough to catch a highlight
    g = new ADDONS.RoundedBoxGeometry(bw, bh, bd, opt.crown ? 4 : rr < 1.5 ? 2 : 3, rr);
    if (opt.crown) crownGeometry(g, bw, bh, bd, opt.crown, opt.crownAxis || "y");
  } else if (opt.sharp || br < 0.35 || !ADDONS.RoundedBoxGeometry) {
    g = new THREE.BoxGeometry(bw, bh, bd);
  } else {
    g = new ADDONS.RoundedBoxGeometry(bw, bh, bd, 2, br);
  }
  var m;
  if (opt.transmission != null && THREE.MeshPhysicalMaterial) {
    m = new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: opt.metal != null ? opt.metal : 0.1,
      roughness: opt.rough != null ? opt.rough : 0.05,
      transparent: true,
      transmission: opt.transmission,
      opacity: opt.opacity != null ? opt.opacity : 1,
      ior: 1.5,
      thickness: Math.min(bw, bh, bd)
    });
  } else {
    m = new THREE.MeshStandardMaterial({
      color: color,
      metalness: opt.metal != null ? opt.metal : 0.08,
      roughness: opt.rough != null ? opt.rough : 0.8,
      transparent: !!opt.trans,
      opacity: opt.opacity != null ? opt.opacity : 1,
    });
  }
  applyTextureToMaterial(m, opt, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  applyDetail(m, g, srcColor, opt, color);
  if (opt.depthBias) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
  }
  emis(m, opt);
  tuneEnv(m);
  var me = new THREE.Mesh(g, m);
  me.userData.physicsProps = physProps(srcColor, opt);
  me.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  me.receiveShadow = true;
  me.castShadow = opt.cast !== false;
  parent.add(me);
  return me;
}
export function cyl(parent, x, y, z, r, h, color, opt) {
  opt = opt || {};
  if (!(fin(x) && fin(y) && fin(z) && fin(r) && fin(h))) return null;
  var srcColor = color,
    sk = reskin(color, opt);
  color = sk.col;
  opt = withSkinTexture(sk.opt);
  var g = new THREE.CylinderGeometry(
    opt.r2 != null ? opt.r2 : r,
    r,
    h,
    opt.seg || 24,
    1,
    !!opt.open, // openEnded: a real tube (basin walls, pipes seen from inside)
  );
  var m = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opt.metal != null ? opt.metal : 0.3,
    roughness: opt.rough != null ? opt.rough : 0.55,
    transparent: !!opt.trans,
    opacity: opt.opacity != null ? opt.opacity : 1,
    // an open tube is seen from the inside too, so it must not be back-culled
    side: opt.open ? THREE.DoubleSide : THREE.FrontSide,
  });
  applyTextureToMaterial(m, opt, r * 2, h, r * 2);
  applyDetail(m, g, srcColor, opt, color);
  emis(m, opt);
  tuneEnv(m);
  var me = new THREE.Mesh(g, m);
  me.userData.physicsProps = physProps(srcColor, opt);
  me.position.set(x, y, z);
  if (opt.rx) me.rotation.x = opt.rx;
  if (opt.ry) me.rotation.y = opt.ry;
  if (opt.rz) me.rotation.z = opt.rz;
  me.castShadow = opt.cast !== false;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}
export function sph(parent, x, y, z, r, color, opt) {
  opt = opt || {};
  if (!(fin(x) && fin(y) && fin(z) && fin(r))) return null;
  var srcColor = color,
    sk = reskin(color, opt);
  color = sk.col;
  opt = withSkinTexture(sk.opt);
  // thetaLen < PI opens the sphere into a dome (a bowl, a lampshade); an
  // open dome is seen from inside too, so it is drawn double-sided
  var g = new THREE.SphereGeometry(r, opt.seg || 16, opt.segV || 12, 0, Math.PI * 2, 0, opt.thetaLen || Math.PI);
  var m = new THREE.MeshStandardMaterial({
    color: color,
    roughness: opt.rough != null ? opt.rough : 0.8,
    metalness: opt.metal != null ? opt.metal : 0.05,
    transparent: !!opt.trans,
    opacity: opt.opacity != null ? opt.opacity : 1,
    side: opt.thetaLen ? THREE.DoubleSide : THREE.FrontSide,
  });
  applyTextureToMaterial(m, opt, r * 2, r * 2, r * 2);
  applyDetail(m, g, srcColor, opt, color);
  emis(m, opt);
  tuneEnv(m);
  var me = new THREE.Mesh(g, m);
  me.userData.physicsProps = physProps(srcColor, opt);
  me.position.set(x, y, z);
  me.castShadow = opt.cast !== false;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}
/* ---- turned, bent and draped parts ----
   What boxes and plain cylinders cannot say: a turned lamp base or kettle
   (lathe), a bent tube (an arc lamp, a chandelier arm, a towel-rail bow), a
   ring (a speaker surround, a clock bezel) and a pleated curtain. They share
   one finishing path with box/cyl/sph — variant skins, item textures, PBR
   detail, glow, physics class — so a model built from them behaves exactly
   like one built from boxes. */
function solid(parent, g, color, opt, x, y, z, dims, open) {
  var srcColor = color,
    sk = reskin(color, opt || {});
  color = sk.col;
  opt = withSkinTexture(sk.opt);
  var m = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opt.metal != null ? opt.metal : 0.1,
    roughness: opt.rough != null ? opt.rough : 0.6,
    transparent: !!opt.trans,
    opacity: opt.opacity != null ? opt.opacity : 1,
    side: open ? THREE.DoubleSide : THREE.FrontSide,
  });
  applyTextureToMaterial(m, opt, dims[0], dims[1], dims[2]);
  applyDetail(m, g, srcColor, opt, color);
  emis(m, opt);
  tuneEnv(m);
  var me = new THREE.Mesh(g, m);
  me.userData.physicsProps = physProps(srcColor, opt);
  me.position.set(x, y, z);
  if (opt.rx) me.rotation.x = opt.rx;
  if (opt.ry) me.rotation.y = opt.ry;
  if (opt.rz) me.rotation.z = opt.rz;
  me.castShadow = opt.cast !== false;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

/* A turned part: `prof` is [[radius, height], …] from the bottom up,
   revolved round the vertical axis through (x, y, z). Radii of 0 at the ends
   close it; otherwise it is an open shell, drawn double-sided. */
export function lathe(parent, x, y, z, prof, color, opt) {
  opt = opt || {};
  if (!(fin(x) && fin(y) && fin(z)) || !prof || prof.length < 2) return null;
  var pts = [], rMax = 0, h0 = Infinity, h1 = -Infinity;
  for (var i = 0; i < prof.length; i++) {
    var r = Math.max(0, prof[i][0]), h = prof[i][1];
    if (!(fin(r) && fin(h))) return null;
    pts.push(new THREE.Vector2(r, h));
    rMax = Math.max(rMax, r);
    h0 = Math.min(h0, h);
    h1 = Math.max(h1, h);
  }
  var open = prof[0][0] > 0.01 || prof[prof.length - 1][0] > 0.01;
  var g = new THREE.LatheGeometry(pts, opt.seg || 32);
  return solid(parent, g, color, opt, x, y, z, [rMax * 2, h1 - h0, rMax * 2], open || opt.open);
}

/* A round bar bent along a smooth path through `pts` ([[x,y,z], …], model
   cm). Ends are left open — cap them with a sph or cyl where they show. */
export function tube(parent, pts, r, color, opt) {
  opt = opt || {};
  if (!pts || pts.length < 2 || !fin(r)) return null;
  var v = [];
  for (var i = 0; i < pts.length; i++) {
    if (!(fin(pts[i][0]) && fin(pts[i][1]) && fin(pts[i][2]))) return null;
    v.push(new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]));
  }
  var curve = v.length === 2 ? new THREE.LineCurve3(v[0], v[1]) : new THREE.CatmullRomCurve3(v, false, "centripetal");
  var g = new THREE.TubeGeometry(curve, opt.steps || Math.max(8, v.length * 6), r, opt.seg || 10, false);
  var bb = new THREE.Box3().setFromPoints(v);
  return solid(parent, g, color, opt, 0, 0, 0, [bb.max.x - bb.min.x + 2 * r, bb.max.y - bb.min.y + 2 * r, bb.max.z - bb.min.z + 2 * r]);
}

/* A ring of round section: major radius R, section radius r, lying flat
   (in XZ) unless rotated with rx/ry/rz. `arc` < 2π opens it. */
export function torus(parent, x, y, z, R, r, color, opt) {
  opt = opt || {};
  if (!(fin(x) && fin(y) && fin(z) && fin(R) && fin(r))) return null;
  var g = new THREE.TorusGeometry(R, r, opt.segR || 8, opt.seg || 32, opt.arc || Math.PI * 2);
  g.rotateX(Math.PI / 2);
  return solid(parent, g, color, opt, x, y, z, [2 * (R + r), 2 * r, 2 * (R + r)]);
}

/* A hanging pleated panel: fabric from (x0,y0) to (x1,y1) in the plane z,
   gathered into `folds` soft pleats `depth` cm deep. The pleats settle
   slightly deeper toward the hem, as a real curtain falls. Double-sided. */
export function drape(parent, x0, x1, y0, y1, z, folds, depth, color, opt) {
  opt = opt || {};
  if (!(fin(x0) && fin(x1) && fin(y0) && fin(y1) && fin(z)) || x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  var nx = Math.max(8, Math.round(folds) * 8), ny = 6;
  var g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  var p = g.attributes.position, k = (Math.PI * 2 * Math.max(1, folds)) / (x1 - x0);
  for (var i = 0; i < p.count; i++) {
    var lx = p.getX(i) + (x1 - x0) / 2, ly = p.getY(i) + (y1 - y0) / 2,
      fall = 1 + 0.35 * (1 - ly / (y1 - y0));
    p.setZ(i, (depth / 2) * Math.sin(lx * k) * fall);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return solid(parent, g, color, opt, (x0 + x1) / 2, (y0 + y1) / 2, z, [x1 - x0, y1 - y0, depth], true);
}

export function clearGroup(g) {
  if (!g) return;
  for (var i = g.children.length - 1; i >= 0; i--) {
    var c = g.children[i];
    // walls/furniture are nested Groups — dispose the WHOLE subtree, not just
    // the direct child, or every inner mesh's GPU geometry/material leaks on
    // each rebuild3D. Textures are left alone: they live in shared caches
    // (floorTexture/customTexCache/…) and are reused by the next rebuild.
    c.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        [].concat(o.material).forEach(function (m) {
          m.dispose();
        });
      }
    });
    g.remove(c);
  }
}

/* ---- procedural floor textures (canvas -> CanvasTexture, cached) ----
   Every painter draws into a 256x256 tile that is REPEATED across the floor
   (see TILE in state.js for how many cm one tile covers), so all of them must
   wrap seamlessly: anything drawn near an edge is drawn again shifted by ±256.
   Randomness is deterministic (rnd() below) so a rebuild looks identical. */
var texCache = {};

// deterministic pseudo-random, re-seeded per painter so tiles are stable
function mkRnd(seed) {
  var s = seed || 1;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
// mix towards white/black by k (-1..1) — quick shade helper for hex strings
function shade(hex, k) {
  var n = parseInt(hex.slice(1), 16),
    r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255,
    t = k < 0 ? 0 : 255,
    a = Math.abs(k);
  return (
    "rgb(" +
    Math.round(r + (t - r) * a) +
    "," +
    Math.round(g + (t - g) * a) +
    "," +
    Math.round(b + (t - b) * a) +
    ")"
  );
}
// speckle the whole tile — grain for stone/concrete/carpet
function speckle(x, n, seed, amp, size) {
  var rnd = mkRnd(seed);
  for (var i = 0; i < n; i++) {
    var sh = Math.round((rnd() * 2 - 1) * amp);
    x.fillStyle =
      "rgba(" +
      (128 + sh) +
      "," +
      (128 + sh) +
      "," +
      (128 + sh) +
      "," +
      (0.05 + rnd() * 0.12) +
      ")";
    x.fillRect(rnd() * 256, rnd() * 256, size || 2, size || 2);
  }
}
// wood grain lines inside a plank rect (clipped, so it wraps with the plank)
function grain(x, px, py, pw, ph, seed, alpha) {
  var rnd = mkRnd(seed);
  x.save();
  x.beginPath();
  x.rect(px, py, pw, ph);
  x.clip();
  x.strokeStyle = "rgba(96,64,32," + (alpha || 0.16) + ")";
  var lines = Math.max(3, Math.round(ph / 26));
  for (var i = 0; i < lines; i++) {
    var gy = py + ((i + 0.5) * ph) / lines + (rnd() * 8 - 4);
    x.lineWidth = 0.5 + rnd() * 1.2;
    x.beginPath();
    x.moveTo(px - 4, gy);
    x.bezierCurveTo(
      px + pw * 0.35,
      gy + (rnd() * 10 - 5),
      px + pw * 0.65,
      gy + (rnd() * 10 - 5),
      px + pw + 4,
      gy + (rnd() * 6 - 3),
    );
    x.stroke();
  }
  // a couple of knots so long planks are not perfectly uniform
  for (var k = 0; k < 2; k++) {
    if (rnd() > 0.45) continue;
    var kx = px + rnd() * pw,
      ky = py + rnd() * ph,
      kr = 2 + rnd() * 3;
    x.strokeStyle = "rgba(88,58,28,.3)";
    x.lineWidth = 1;
    x.beginPath();
    x.ellipse(kx, ky, kr, kr * 1.7, 0, 0, 7);
    x.stroke();
  }
  x.restore();
}
// horizontal plank floor (vertical run), shades cycled per row + brick offset
function planks(x, rows, shades, gap, seed, grainA) {
  var ph = 256 / rows,
    rnd = mkRnd(seed);
  for (var r = 0; r < rows; r++) {
    var py = r * ph;
    x.fillStyle = shades[r % shades.length];
    x.fillRect(0, py, 256, ph);
    grain(x, 0, py, 256, ph, seed + r * 7, grainA);
    // butt joint between two boards in the row (offset per row so it wraps)
    var jx = ((r * 97) % 256) + rnd() * 20;
    x.strokeStyle = "rgba(60,40,18,.45)";
    x.lineWidth = gap;
    x.beginPath();
    x.moveTo(jx, py + 0.5);
    x.lineTo(jx, py + ph - 0.5);
    x.stroke();
    // long edge groove (drawn on the row's top edge, so row 0 covers y=0/256)
    x.strokeStyle = "rgba(52,34,14,.5)";
    x.lineWidth = gap;
    x.beginPath();
    x.moveTo(0, py);
    x.lineTo(256, py);
    x.stroke();
  }
}
// square/rect tile grid with grout lines
function tileGrid(x, n, grout, groutW, faces, seed) {
  var ts = 256 / n,
    rnd = mkRnd(seed);
  x.fillStyle = grout;
  x.fillRect(0, 0, 256, 256);
  for (var a = 0; a < n; a++)
    for (var b = 0; b < n; b++) {
      x.fillStyle = faces[Math.floor(rnd() * faces.length)];
      x.fillRect(
        a * ts + groutW / 2,
        b * ts + groutW / 2,
        ts - groutW,
        ts - groutW,
      );
    }
}

var PAINT = {
  wood: function (x) {
    planks(x, 10, ["#b98e5a", "#c2975f", "#ad8252", "#bd9059", "#b5894f", "#c49a63", "#b08654"], 1.6, 11);
  },
  // wide, pale oak boards — the modern laminate look
  laminate: function (x) {
    planks(x, 8, ["#d8c3a0", "#e0cdac", "#d0b894", "#dcc7a6", "#d4bd99"], 1.3, 23, 0.1);
  },
  // dark walnut / smoked oak
  darkwood: function (x) {
    planks(x, 10, ["#6d5033", "#795839", "#63482e", "#735236", "#684c31", "#70512f", "#5f452b"], 1.6, 37, 0.22);
  },
  // herringbone parquet: two interlocking block orientations
  parquet: function (x) {
    x.fillStyle = "#8a6337";
    x.fillRect(0, 0, 256, 256);
    var bl = 64,
      bw = 32;
    var shades = ["#b8873f", "#c0904a", "#ab7c39", "#c69a55"];
    // draw over a 3x3 tile span so blocks crossing the edge appear on both sides
    for (var i = -2; i < 6; i++)
      for (var j = -2; j < 6; j++) {
        var ox = i * bw * 2,
          oy = j * bw * 2;
        [
          [ox, oy, bl, bw],
          [ox + bl - bw, oy + bw, bw, bl],
        ].forEach(function (b, k) {
          x.fillStyle = shades[(i + j * 3 + k) & 3];
          x.fillRect(b[0], b[1], b[2], b[3]);
          x.strokeStyle = "rgba(74,50,24,.55)";
          x.lineWidth = 1.2;
          x.strokeRect(b[0], b[1], b[2], b[3]);
          grain(x, b[0], b[1], b[2], b[3], 7 + i * 13 + j * 31 + k, 0.14);
        });
      }
  },
  // outdoor decking: boards with a visible shadow gap between them
  deck: function (x) {
    x.fillStyle = "#3b3229";
    x.fillRect(0, 0, 256, 256);
    var boards = 9,
      bh = 256 / boards;
    for (var r = 0; r < boards; r++) {
      var py = r * bh;
      x.fillStyle = ["#9c7b52", "#a68557", "#93724b", "#a07e54", "#997750"][r % 5];
      x.fillRect(0, py + 2, 256, bh - 4);
      grain(x, 0, py + 2, 256, bh - 4, 61 + r * 9, 0.2);
      // screw heads at both ends of each board
      [40, 216].forEach(function (sx) {
        x.fillStyle = "rgba(70,52,32,.55)";
        x.beginPath();
        x.arc(sx, py + bh / 2, 2.2, 0, 7);
        x.fill();
      });
    }
  },
  tiles: function (x) {
    tileGrid(x, 2, "#9aa0a4", 6, ["#e7ebee", "#dde2e6", "#e2e7ea"], 3);
  },
  // large-format porcelain: one big slab per tile, soft cloudy veining
  porcelain: function (x) {
    x.fillStyle = "#8f9498";
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#eceef0";
    x.fillRect(2, 2, 252, 252);
    var rnd = mkRnd(17);
    for (var i = 0; i < 9; i++) {
      var gx = rnd() * 256,
        gy = rnd() * 256;
      var gr = x.createRadialGradient(gx, gy, 2, gx, gy, 40 + rnd() * 50);
      gr.addColorStop(0, "rgba(206,210,214,.55)");
      gr.addColorStop(1, "rgba(206,210,214,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 256);
    }
  },
  // small square mosaic — bathroom / kitchen splash floor
  mosaic: function (x) {
    tileGrid(x, 8, "#c9ccce", 3, ["#8fb8c4", "#a6c7d0", "#7ba7b6", "#bcd6dc"], 29);
  },
  // classic checkerboard
  checker: function (x) {
    var ts = 128;
    for (var a = 0; a < 2; a++)
      for (var b = 0; b < 2; b++) {
        x.fillStyle = (a + b) % 2 ? "#2b2f33" : "#eceae4";
        x.fillRect(a * ts, b * ts, ts, ts);
      }
    speckle(x, 900, 41, 30, 2);
  },
  // hexagonal tiles (pointy-top rows, offset so they interlock and wrap)
  hexTile: function (x) {
    x.fillStyle = "#b9bcbe";
    x.fillRect(0, 0, 256, 256);
    var R = 32,
      hw = (Math.sqrt(3) / 2) * R, // half width
      rnd = mkRnd(53),
      faces = ["#eef0f1", "#e4e7e9", "#e9ebec", "#dfe3e5"];
    for (var row = -1; row < 7; row++)
      for (var col = -1; col < 7; col++) {
        var cx = col * hw * 2 + (row & 1 ? hw : 0),
          cy = row * R * 1.5;
        x.beginPath();
        for (var k = 0; k < 6; k++) {
          var an = (Math.PI / 180) * (60 * k - 90);
          var px = cx + (R - 1.6) * Math.cos(an),
            py = cy + (R - 1.6) * Math.sin(an);
          if (k === 0) x.moveTo(px, py);
          else x.lineTo(px, py);
        }
        x.closePath();
        x.fillStyle = faces[Math.floor(rnd() * faces.length)];
        x.fill();
      }
  },
  marble: function (x) {
    x.fillStyle = "#ece9e3";
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(150,150,160,.35)";
    for (var v = 0; v < 14; v++) {
      x.lineWidth = 0.6 + (v % 3);
      x.beginPath();
      var yy = v * 20 - 10;
      x.moveTo(-10, yy);
      x.bezierCurveTo(70, yy + 40, 150, yy - 40, 266, yy + 25);
      x.stroke();
    }
  },
  // dramatic dark marble with bright veins
  marbleDark: function (x) {
    x.fillStyle = "#26292e";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(67);
    for (var v = 0; v < 16; v++) {
      var yy = v * 17 - 8;
      x.strokeStyle = "rgba(230,233,238," + (0.22 + rnd() * 0.45) + ")";
      x.lineWidth = 0.5 + rnd() * 2.2;
      x.beginPath();
      x.moveTo(-10, yy);
      x.bezierCurveTo(
        60,
        yy + 30 * (rnd() - 0.5),
        170,
        yy - 30 * (rnd() - 0.5),
        266,
        yy + 18 * (rnd() - 0.5),
      );
      x.stroke();
    }
    speckle(x, 1400, 71, 40, 2);
  },
  // terrazzo: pale binder full of coloured chips
  terrazzo: function (x) {
    x.fillStyle = "#eae7e0";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(83),
      chips = ["#b8837a", "#7f8f74", "#c6b070", "#8d8f9c", "#5f5b56", "#d6cfc2"];
    for (var i = 0; i < 520; i++) {
      var cx = rnd() * 256,
        cy = rnd() * 256,
        r = 1.5 + rnd() * 4.5;
      x.fillStyle = chips[Math.floor(rnd() * chips.length)];
      x.beginPath();
      x.ellipse(cx, cy, r, r * (0.55 + rnd() * 0.6), rnd() * 3.14, 0, 7);
      x.fill();
      // wrap chips that cross an edge
      if (cx < r + 5) { x.beginPath(); x.ellipse(cx + 256, cy, r, r, 0, 0, 7); x.fill(); }
      if (cx > 251 - r) { x.beginPath(); x.ellipse(cx - 256, cy, r, r, 0, 0, 7); x.fill(); }
      if (cy < r + 5) { x.beginPath(); x.ellipse(cx, cy + 256, r, r, 0, 0, 7); x.fill(); }
      if (cy > 251 - r) { x.beginPath(); x.ellipse(cx, cy - 256, r, r, 0, 0, 7); x.fill(); }
    }
  },
  // dark speckled granite slab
  granite: function (x) {
    x.fillStyle = "#4c5054";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(97),
      chips = ["#2b2f33", "#6d7276", "#9aa0a4", "#3a3f43", "#b6a48c"];
    for (var i = 0; i < 4200; i++) {
      x.fillStyle = chips[Math.floor(rnd() * chips.length)];
      x.globalAlpha = 0.35 + rnd() * 0.5;
      x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    x.globalAlpha = 1;
  },
  // irregular riven slate flagstones
  slate: function (x) {
    x.fillStyle = "#3b4145";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(103),
      n = 4,
      cs = 256 / n;
    for (var a = 0; a < n; a++)
      for (var b = 0; b < n; b++) {
        var jx = 3 + rnd() * 3,
          jy = 3 + rnd() * 3;
        x.fillStyle = shade("#5a6166", (rnd() - 0.5) * 0.35);
        x.beginPath();
        x.moveTo(a * cs + jx, b * cs + jy);
        x.lineTo((a + 1) * cs - jx, b * cs + jy + (rnd() * 4 - 2));
        x.lineTo((a + 1) * cs - jx + (rnd() * 4 - 2), (b + 1) * cs - jy);
        x.lineTo(a * cs + jx, (b + 1) * cs - jy + (rnd() * 4 - 2));
        x.closePath();
        x.fill();
      }
    speckle(x, 2000, 107, 34, 2);
  },
  // clay brick pavers in a running bond
  brick: function (x) {
    x.fillStyle = "#8f8478";
    x.fillRect(0, 0, 256, 256);
    var rows = 8,
      bh = 256 / rows,
      bw = 64,
      rnd = mkRnd(109),
      faces = ["#9c5a45", "#a86550", "#8e4f3d", "#b07059", "#96543f"];
    for (var r = 0; r < rows; r++) {
      var off = r % 2 ? bw / 2 : 0;
      for (var cx = -bw; cx < 256 + bw; cx += bw) {
        x.fillStyle = faces[Math.floor(rnd() * faces.length)];
        x.fillRect(cx + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
      }
    }
    speckle(x, 1600, 113, 26, 2);
  },
  // river-pebble mosaic (wet-room / garden path)
  pebble: function (x) {
    x.fillStyle = "#8d8878";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(127),
      cols = ["#a9a294", "#8b8578", "#c0b9a8", "#767065", "#b3a894"];
    for (var i = 0; i < 260; i++) {
      var cx = rnd() * 256,
        cy = rnd() * 256,
        rx = 5 + rnd() * 6,
        ry = rx * (0.6 + rnd() * 0.4),
        an = rnd() * 3.14;
      for (var wx = -1; wx <= 1; wx++)
        for (var wy = -1; wy <= 1; wy++) {
          var px = cx + wx * 256,
            py = cy + wy * 256;
          if (px < -20 || px > 276 || py < -20 || py > 276) continue;
          var gr = x.createRadialGradient(px - rx * 0.3, py - ry * 0.3, 1, px, py, rx);
          var base = cols[Math.floor((i * 7) % cols.length)];
          gr.addColorStop(0, shade(base, 0.22));
          gr.addColorStop(1, shade(base, -0.25));
          x.fillStyle = gr;
          x.beginPath();
          x.ellipse(px, py, rx, ry, an, 0, 7);
          x.fill();
        }
    }
  },
  // cut-pile carpet: dense fibre noise, no seams
  carpet: function (x) {
    x.fillStyle = "#9c9382";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(131);
    for (var i = 0; i < 9000; i++) {
      var cx = rnd() * 256,
        cy = rnd() * 256,
        len = 1.5 + rnd() * 3,
        an = rnd() * 6.28;
      x.strokeStyle = shade("#9c9382", (rnd() - 0.5) * 0.42);
      x.lineWidth = 1.4;
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(an) * len, cy + Math.sin(an) * len);
      x.stroke();
    }
  },
  // low-pile loop carpet with a subtle woven grid
  carpetGrey: function (x) {
    x.fillStyle = "#7e8286";
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(137);
    for (var i = 0; i < 6000; i++) {
      x.fillStyle = shade("#7e8286", (rnd() - 0.45) * 0.45);
      x.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    x.strokeStyle = "rgba(0,0,0,.06)";
    x.lineWidth = 1;
    for (var k = 0; k < 32; k++) {
      x.beginPath();
      x.moveTo(k * 8, 0);
      x.lineTo(k * 8, 256);
      x.moveTo(0, k * 8);
      x.lineTo(256, k * 8);
      x.stroke();
    }
  },
  // luxury vinyl plank — grey wood print, tight seams
  vinyl: function (x) {
    planks(x, 4, ["#a9a8a4", "#b2b1ac", "#9e9d99", "#adaca7"], 1, 149, 0.08);
  },
  // poured epoxy: glassy, near-uniform with a faint swirl
  epoxy: function (x) {
    var gr = x.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, "#c3ccd2");
    gr.addColorStop(0.5, "#d3dadf");
    gr.addColorStop(1, "#c8d1d6");
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    var rnd = mkRnd(151);
    for (var i = 0; i < 7; i++) {
      x.strokeStyle = "rgba(255,255,255,.16)";
      x.lineWidth = 6 + rnd() * 14;
      x.beginPath();
      var yy = rnd() * 256;
      x.moveTo(-20, yy);
      x.bezierCurveTo(80, yy + 60 * (rnd() - 0.5), 180, yy - 60 * (rnd() - 0.5), 276, yy);
      x.stroke();
    }
  },
  // outdoor balcony/patio tile — grey stone-look pavers
  balcony: function (x) {
    tileGrid(x, 2, "#7c8083", 5, ["#a8acae", "#9fa3a6", "#a4a8ab"], 157);
    speckle(x, 2600, 163, 30, 2);
  },
  concrete: function (x) {
    x.fillStyle = "#cfcdc8";
    x.fillRect(0, 0, 256, 256);
    for (var n = 0; n < 2400; n++) {
      var gx = (n * 97) % 256,
        gy = (n * 53) % 256,
        sh = ((n * 29) % 24) - 12;
      x.fillStyle =
        "rgba(" + (190 + sh) + "," + (188 + sh) + "," + (182 + sh) + ",.5)";
      x.fillRect(gx, gy, 2, 2);
    }
  },
  // running-bond concrete pavers for porches, patios and the paving ring
  // round the house in the presentation plan
  pavers: function (x) {
    var rnd = mkRnd(71);
    x.fillStyle = "#9b958b";
    x.fillRect(0, 0, 256, 256);
    var rows = 4, ph = 256 / rows, pw = 128;
    for (var r = 0; r < rows; r++) {
      var off = r % 2 ? pw / 2 : 0;
      for (var c = -1; c < 3; c++) {
        var px = c * pw + off, py = r * ph;
        var k = rnd() * 0.16 - 0.08;
        x.fillStyle = shade("#b4ac9f", k);
        x.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        x.fillStyle = "rgba(255,255,255,.10)";
        x.fillRect(px + 2, py + 2, pw - 4, 3);
        x.fillStyle = "rgba(60,50,40,.10)";
        x.fillRect(px + 2, py + ph - 5, pw - 4, 3);
      }
    }
    speckle(x, 1400, 72, 30, 2);
  },
};

// every floor type the UI can offer (order = order in the pickers)
export const FLOOR_TYPES = Object.keys(PAINT);

/* A floor material, painted small enough for a picker tile.
   Generated from the SAME table the 3D floor uses, because the one bug a
   swatch must never have is lying about what it is offering — a separate set
   of preview images would drift the first time a pattern is retuned. */
var swatchCache = {};
export function floorSwatch(type, size) {
  var px = Math.max(32, Math.min(256, Math.round(size || 96)));
  var key = type + "@" + px;
  if (swatchCache[key]) return swatchCache[key];
  var c = document.createElement("canvas");
  c.width = c.height = px;
  var x = c.getContext("2d");
  if (!x) return "";
  /* Every painter draws into a fixed 256px frame and does its own wrapping
     arithmetic against those edges. Scaling the CONTEXT rather than asking for
     a different size keeps each pattern's proportions and its seams exactly as
     the floor renders them; a re-tuned tile count would not. */
  x.scale(px / 256, px / 256);
  (PAINT[type] || PAINT.concrete)(x);
  var url = c.toDataURL("image/png");
  swatchCache[key] = url;
  return url;
}

/* One painted tile of a floor material at `px` pixels, cached. The plan's
   presentation style fills rooms with these as canvas patterns and the 3D
   floor wraps the 256px one, so both views show the same planks. Painters
   are vector, so a 512px tile is crisp rather than an upscaled 256. */
var paintCache = {};
export function floorPaintCanvas(type, px) {
  if (typeof document === "undefined") return null;
  var size = Math.max(16, Math.min(512, Math.round(px || 256)));
  var key = (PAINT[type] ? type : "concrete") + "@" + size;
  if (paintCache[key]) return paintCache[key];
  var c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d");
  if (!x) return null;
  x.scale(size / 256, size / 256);
  (PAINT[type] || PAINT.concrete)(x);
  paintCache[key] = c;
  return c;
}

/* The average colour of a floor tile — what the pattern reads as from far
   enough away that its detail would only shimmer. */
var meanCache = {};
export function floorMeanColor(type) {
  if (meanCache[type]) return meanCache[type];
  var c = floorPaintCanvas(type, 16);
  var col = "#d0cec9";
  try {
    var d = c.getContext("2d").getImageData(0, 0, 16, 16).data,
      r = 0, g = 0, b = 0, n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    col = "rgb(" + Math.round(r / n) + "," + Math.round(g / n) + "," + Math.round(b / n) + ")";
  } catch (e) { /* no canvas readback (tests): keep the neutral fallback */ }
  meanCache[type] = col;
  return col;
}

export function floorTexture(type) {
  if (texCache[type]) return texCache[type];
  var c = document.createElement("canvas");
  c.width = c.height = 256;
  var x = c.getContext("2d");
  (PAINT[type] || PAINT.concrete)(x);
  var tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  tx.colorSpace = THREE.SRGBColorSpace;
  texCache[type] = tx;
  return tx;
}

// grass-like ground texture (deterministic noise so it looks the same every rebuild)
export function groundTexture() {
  if (texCache.__ground) return texCache.__ground;
  var c = document.createElement("canvas");
  c.width = c.height = 256;
  paintGround(c.getContext("2d"));
  var tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  tx.colorSpace = THREE.SRGBColorSpace;
  texCache.__ground = tx;
  return tx;
}
/* The lawn tile as a plain canvas (no three), for the presentation plan. */
export function groundPaintCanvas(px) {
  if (typeof document === "undefined") return null;
  var size = Math.max(16, Math.min(512, Math.round(px || 256)));
  var key = "__lawn@" + size;
  if (paintCache[key]) return paintCache[key];
  var c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d");
  x.scale(size / 256, size / 256);
  paintGround(x);
  paintCache[key] = c;
  return c;
}
/* Lawn: a mottled base of soft, wrapped clumps in several greens, then
   thousands of short blades. Seeded and edge-wrapped like every floor painter,
   so it tiles without the diagonal rows a fixed-stride stipple gives. */
function paintGround(x) {
  var rnd = mkRnd(97);
  x.fillStyle = "#86a05a";
  x.fillRect(0, 0, 256, 256);
  var clumps = ["rgba(118,148,74,.35)", "rgba(96,126,60,.30)", "rgba(142,166,90,.28)", "rgba(104,134,66,.32)"];
  for (var c = 0; c < 70; c++) {
    var cx = rnd() * 256, cy = rnd() * 256, r = 10 + rnd() * 26,
      ry = r * (0.6 + rnd() * 0.5), rot = rnd() * 3;
    x.fillStyle = clumps[c % clumps.length];
    for (var ox = -256; ox <= 256; ox += 256)
      for (var oy = -256; oy <= 256; oy += 256) {
        if (cx + ox + r < 0 || cx + ox - r > 256 || cy + oy + r < 0 || cy + oy - r > 256) continue;
        x.beginPath();
        x.ellipse(cx + ox, cy + oy, r, ry, rot, 0, 7);
        x.fill();
      }
  }
  for (var n = 0; n < 5200; n++) {
    var gx = rnd() * 256, gy = rnd() * 256, sh = Math.round((rnd() * 2 - 1) * 26),
      len = 1.5 + rnd() * 3, ang = -1.9 + rnd() * 0.8;
    x.strokeStyle = "rgba(" + (112 + sh) + "," + (150 + sh) + "," + (78 + sh) + "," + (0.35 + rnd() * 0.3) + ")";
    x.lineWidth = 0.8 + rnd() * 0.6;
    x.beginPath();
    x.moveTo(gx, gy);
    x.lineTo(gx + Math.cos(ang) * len, gy + Math.sin(ang) * len);
    x.stroke();
  }
}

/* ---- flat polygon geometry for floors / ceilings (in the XZ plane) ---- */
export function polyMesh(pts, y, tile, mat, holes) {
  if (pts.length < 3 || !fin(y) || !fin(tile) || tile === 0) return null;
  var i;
  for (i = 0; i < pts.length; i++)
    if (!fin(pts[i].x) || !fin(pts[i].z)) return null; // bail on any NaN vertex
  var contour = pts.map(function (p) {
    return new THREE.Vector2(p.x, p.z);
  });
  var holeContours = [];
  var allPts = pts.slice();
  (holes || []).forEach(function (hl) {
    if (!hl || hl.length < 3) return;
    for (i = 0; i < hl.length; i++)
      if (!fin(hl[i].x) || !fin(hl[i].z)) return;
    holeContours.push(hl.map(function (p) {
      return new THREE.Vector2(p.x, p.z);
    }));
    hl.forEach(function (p) { allPts.push(p); });
  });
  var tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holeContours);
  } catch (e) {
    tris = null;
  }
  if (!tris || !tris.length) {
    if (!holeContours.length) return null;
    // a bad hole must not erase the floor — fall back to a solid slab
    allPts = pts.slice();
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch (e2) {
      return null;
    }
    if (!tris || !tris.length) return null;
  }
  var pos = [],
    uv = [];
  allPts.forEach(function (p) {
    pos.push(p.x, y, p.z);
    uv.push(p.x / tile, p.z / tile);
  });
  var ix = [];
  tris.forEach(function (tr) {
    ix.push(tr[0], tr[1], tr[2]);
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  var na = g.attributes.normal.array;
  for (i = 0; i < na.length; i++)
    if (!isFinite(na[i])) {
      na[i] = i % 3 === 1 ? 1 : 0;
    } // fix degenerate normals
  var m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}
