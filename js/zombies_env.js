/* Night Shift exterior: what is outside the user's windows.
   ---------------------------------------------------------------------------
   The planner models a flat, not the world it sits in, so through a window you
   used to see the void. This builds a random surrounding each session — the
   same floor plan reads as a suburban house one night and a tower block the
   next — which is most of what sells the place as somewhere real.

   Everything is built into Z.grp, so the game's existing teardown disposes it;
   everything is placed outside the interior bounds, so it never intrudes on
   playable space; and the piece count is deliberately small, because the
   exponential fog eats anything past ~10m anyway.                             */
import * as THREE from "three";
import { legacyIntensity } from "./gpu.js";
import { Z, rr, pick, rnd } from "./zombies_state.js";
import { interiorBounds } from "./zombies_world.js";
import {
  tex,
  normalTex,
  roughTex,
  roughBoost,
  detailTex,
  detailBoost,
} from "./zombies_tex.js";
import { buildCarMesh, CAR_TYPES } from "./drive_car_mesh.js";

export var ENV_THEMES = ["garden", "neighbor", "street"];

var EMAT = {};

// How much relief each exterior surface actually has. Bark and a brick wall
// are deep; a car panel and a painted lamp housing are all but flat, and
// giving them the same normal strength as a hedge is what makes a procedural
// derived map look like noise instead of a surface.
var ENV_RELIEF = {
  "assets/textures/env_bark.jpg": 3.0,
  "assets/textures/env_hedge.jpg": 2.6,
  "assets/textures/env_grass.jpg": 2.2,
  "assets/textures/env_wall.jpg": 2.4,
  "assets/textures/env_tarmac.jpg": 1.8,
  "assets/textures/env_deck.jpg": 2.0,
  "assets/textures/env_car.jpg": 0.5,
  "assets/textures/env_lamp.jpg": 0.6,
};

/* Fake moonlight. The horror grade deliberately kills every scene light so
   the flashlight is the only thing you see by — but that also leaves the
   world outside the window pitch black, which reads as a void rather than as
   a place, so the exterior lights itself. Three things were wrong with how it
   did that, and together they bleached the whole garden:

     1. The emissive ignored the map, so it was a flat slab of colour laid
        over the texture. A bark trunk showed no bark at all — the one thing
        the exterior surfaces are actually textured for.
     2. It lerped half-way to a fixed blue, so brown bark, green hedge, red
        brick and near-black asphalt all converged on the same washed-out
        grey-blue and the place lost every bit of local colour.
     3. Nothing capped it: a #101012 surface self-illuminated to about 49%
        grey, i.e. the darkest material in the scene came out mid-tone.

   Now the moonlight is the surface's OWN colour, cooled rather than replaced,
   ceilinged so nothing bleaches, floored by a faint blue rim so silhouettes
   stay readable — and shaped by detailTex(), which carries the texture's
   pattern without carrying its (very low) average brightness. */
var MOON_TINT = new THREE.Color(0.85, 0.95, 1.3), // cools, keeps the hue
  MOON_RIM = new THREE.Color(0.018, 0.023, 0.036), // never a pure void
  MOON_MAX = 0.3, // luminance the rolloff approaches but never reaches
  MOON_VAR = 0.45, // how hard the texture modulates the moonlight
  ALBEDO_VAR = 0.5, // and how hard it modulates the diffuse colour
  envLightCount = 0;

function envLightCap() {
  return (Z.renderQuality || 0) >= 2 ? 8 : (Z.renderQuality || 0) >= 1 ? 1 : 0;
}
function addEnvLight(g, light) {
  if (envLightCount >= envLightCap()) return;
  envLightCount++;
  g.add(light);
}

function moonlight(mat, hex, opts, mapUrl, rep) {
  var c = new THREE.Color(hex).multiply(MOON_TINT);
  var lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  // Rolloff, not a hard ceiling: a clamp would flatten every mid-to-pale
  // surface onto exactly MOON_MAX and bring back the convergence this is
  // meant to cure. x*max/(x+max) is asymptotic — bright surfaces are pulled
  // back hard, dark ones are left nearly untouched, and the ordering across
  // the palette survives (a pale fence still reads ~5x a near-black wall).
  c.multiplyScalar(MOON_MAX / (lum + MOON_MAX));
  mat.emissive = c.add(MOON_RIM);

  var moon = opts && opts.moon != null ? opts.moon : 0.9;
  if (!mapUrl) {
    mat.emissiveIntensity = moon;
    return;
  }
  mat.emissiveMap = detailTex(mapUrl, { rep: rep, amount: MOON_VAR });
  mat.emissiveIntensity = moon * detailBoost(MOON_VAR);
}

function em(hex, rough, metal, opts) {
  // The repeat is part of the identity of a material: env_hedge is used at
  // repeat 2 for a hedge and repeat 3 for tree foliage, and leaving it out of
  // the key handed the second caller the first one's tiling.
  var k =
    hex + "|" + rough + "|" + metal +
    "|" + ((opts && opts.k) || "") +
    "|" + ((opts && opts.moon) || "") +
    "|" + ((opts && opts.mapUrl) || "") +
    "|" + ((opts && opts.rep) || 1);
  if (!EMAT[k]) {
    var params = {
      color: hex,
      roughness: rough == null ? 0.85 : rough,
      metalness: metal || 0,
    };
    if (opts && opts.mapUrl) {
      var rep = opts.rep || 1;
      /* The photo supplies pattern; `hex` supplies the colour. Feeding the
         raw albedo in as `map` multiplied two dark things together and left
         the tarmac reflecting half a percent of the light that hit it — which
         is why the sodium lamps appeared not to work at all. A normalised
         detail map keeps the grain and hands the brightness back to `color`. */
      params.map = detailTex(opts.mapUrl, { rep: rep, amount: ALBEDO_VAR });
      params.color = new THREE.Color(hex).multiplyScalar(detailBoost(ALBEDO_VAR));
      params.normalMap = normalTex(opts.mapUrl, {
        rep: rep,
        strength: ENV_RELIEF[opts.mapUrl] == null ? 2 : ENV_RELIEF[opts.mapUrl],
      });
      params.normalScale = new THREE.Vector2(1, 1);
      // Ground planes are the surfaces the moon beams graze, so a varied
      // roughness is what stops tarmac and decking reading as one flat sheet.
      if (opts.rough !== false) {
        params.roughnessMap = roughTex(opts.mapUrl, { rep: rep, lo: 0.7 });
        params.roughness = Math.min(1, params.roughness * roughBoost(0.7));
      }
    }
    EMAT[k] = new THREE.MeshStandardMaterial(params);
    if (opts && opts.emissive) {
      EMAT[k].emissive = new THREE.Color(opts.emissive);
      // Same trap on the lamp housings: gating the glow through a dark photo
      // is why a lit sodium head read as an unlit grey box.
      EMAT[k].emissiveIntensity = (opts.ei == null ? 1 : opts.ei) * detailBoost(MOON_VAR);
      if (opts.mapUrl)
        EMAT[k].emissiveMap = detailTex(opts.mapUrl, { rep: rep, amount: MOON_VAR });
    } else {
      moonlight(EMAT[k], hex, opts, opts && opts.mapUrl, (opts && opts.rep) || 1);
    }
  }
  return EMAT[k];
}
function box(g, w, h, d, x, y, z, mat, ry) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = false;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function cyl(g, r1, r2, h, x, y, z, mat, seg) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 8), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// Exterior props must never be shot at or walked into as if they were indoors:
// they sit past the walls, and the raycast/collision snapshot ignores them.
function decorate(g) {
  g.traverse(function (o) {
    o.userData.env = true;
    if (o.isMesh) o.frustumCulled = true;
  });
  return g;
}

/* --- 1. garden: fence, hedges, trees, a shed, a moonlit lawn --------------- */
function buildGarden(g, b, pad) {
  var lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w + pad * 2, b.d + pad * 2),
    em(0x1e3418, 0.96, 0, { moon: 0.3, mapUrl: "assets/textures/env_grass.jpg", rep: 8 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(b.cx, -1.5, b.cz);
  lawn.receiveShadow = true;
  g.add(lawn);

  var fenceMat = em(0x4a3826, 0.9, 0),
    postMat = em(0x3a2c1e, 0.9, 0);
  // picket fence along the property line
  var fx0 = b.minx - pad, fx1 = b.maxx + pad, fz0 = b.minz - pad, fz1 = b.maxz + pad;
  [[fx0, fz0, fx1, fz0], [fx0, fz1, fx1, fz1], [fx0, fz0, fx0, fz1], [fx1, fz0, fx1, fz1]].forEach(
    function (e) {
      var dx = e[2] - e[0], dz = e[3] - e[1], L = Math.hypot(dx, dz), n = Math.max(2, (L / 22) | 0);
      for (var i = 0; i < n; i++) {
        var t = i / n;
        box(g, 7, rr(88, 104), 3.5, e[0] + dx * t, 48, e[1] + dz * t, fenceMat, Math.atan2(dx, dz));
      }
      // two rails
      var ang = Math.atan2(dx, dz);
      box(g, 4, 5, L, (e[0] + e[2]) / 2, 70, (e[1] + e[3]) / 2, postMat, ang);
      box(g, 4, 5, L, (e[0] + e[2]) / 2, 36, (e[1] + e[3]) / 2, postMat, ang);
    }
  );

  // hedges hugging the walls, with gaps
  var hedge = em(0x1d3a1c, 0.95, 0, { mapUrl: "assets/textures/env_hedge.jpg", rep: 2 });
  for (var h = 0; h < 10; h++) {
    if (rnd() < 0.3) continue;
    var side = h % 4,
      t2 = 0.12 + (h / 10) * 0.76,
      hx, hz;
    if (side === 0) { hx = b.minx + b.w * t2; hz = b.minz - pad * 0.42; }
    else if (side === 1) { hx = b.maxx + pad * 0.42; hz = b.minz + b.d * t2; }
    else if (side === 2) { hx = b.minx + b.w * t2; hz = b.maxz + pad * 0.42; }
    else { hx = b.minx - pad * 0.42; hz = b.minz + b.d * t2; }
    box(g, rr(60, 130), rr(55, 85), rr(45, 70), hx, 30, hz, hedge, rnd() * 3);
  }

  // trees: trunk + a couple of canopy blobs, kept sparse
  var bark = em(0x2e2318, 0.95, 0, { mapUrl: "assets/textures/env_bark.jpg", rep: 2 }),
    leaf = em(0x16301a, 0.95, 0, { mapUrl: "assets/textures/env_hedge.jpg", rep: 3 });
  for (var t3 = 0; t3 < 5; t3++) {
    var a = rnd() * Math.PI * 2,
      rad = pad * rr(0.55, 0.95),
      tx = b.cx + Math.cos(a) * (b.w / 2 + rad),
      tz = b.cz + Math.sin(a) * (b.d / 2 + rad),
      hgt = rr(240, 420);
    cyl(g, 9, 13, hgt, tx, hgt / 2, tz, bark, 7);
    for (var c = 0; c < 3; c++) {
      var blob = new THREE.Mesh(new THREE.SphereGeometry(rr(55, 90), 9, 7), leaf);
      blob.position.set(tx + rr(-40, 40), hgt + rr(-20, 60), tz + rr(-40, 40));
      blob.scale.y = 0.8;
      g.add(blob);
    }
  }

  // a shed in one corner + a path of slabs to the nearest wall
  var sx = b.maxx + pad * rr(0.5, 0.75),
    sz = b.maxz + pad * rr(0.5, 0.75);
  box(g, 210, 190, 170, sx, 95, sz, em(0x3d3125, 0.92, 0));
  box(g, 226, 16, 186, sx, 196, sz, em(0x2a2119, 0.9, 0));
  box(g, 60, 130, 6, sx - 40, 65, sz - 88, em(0x241c14, 0.9, 0));
  var slab = em(0x4a4a44, 0.9, 0);
  for (var p = 0; p < 7; p++)
    box(g, 42, 3, 34, b.maxx + 40 + p * 52, 0.6, b.maxz + 30 + p * 40, slab, rr(-0.1, 0.1));

  // one warm porch lamp — the only practical out here
  var lamp = new THREE.PointLight(0xffb964, legacyIntensity(2.6, 520), 520, 2);
  lamp.position.set(b.maxx + 60, 210, b.cz + rr(-100, 100));
  addEnvLight(g, lamp);
  box(g, 14, 18, 14, lamp.position.x, 212, lamp.position.z, em(0x2a2a2a, 0.6, 0.4));
  return "garden";
}

/* --- 2. neighbor: the opposite block, lit windows, walkway ---------------- */
function buildNeighbor(g, b, pad) {
  var deck = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w + pad * 2, b.d + pad * 2),
    em(0x24262a, 0.95, 0, { moon: 0.3, mapUrl: "assets/textures/env_deck.jpg", rep: 4 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(b.cx, -1.5, b.cz);
  deck.receiveShadow = true;
  g.add(deck);

  var concrete = em(0x33353a, 0.93, 0, { mapUrl: "assets/textures/env_wall.jpg", rep: 4 }),
    rail = em(0x4a4d52, 0.7, 0.5),
    lit = em(0x2a2418, 0.6, 0, { emissive: 0xffcc77, ei: 1.4, k: "lit" }),
    dark = em(0x0d0f14, 0.35, 0.2, { k: "dark" });

  // Facing blocks on every side — whichever window you look out of, there is
  // a neighbour looking back. One side gets the walkway you could climb in by.
  var openSide = (rnd() * 4) | 0;
  for (var side = 0; side < 4; side++) {
    var horiz = side === 0 || side === 2,
      sign = side === 1 || side === 2 ? 1 : -1,
      dist = pad * (side === openSide ? 0.98 : 0.86),
      bw = (horiz ? b.w : b.d) + pad * 1.2,
      ry = horiz ? 0 : Math.PI / 2,
      bx2 = horiz ? b.cx : sign > 0 ? b.maxx + dist : b.minx - dist,
      bz2 = horiz ? (sign > 0 ? b.maxz + dist : b.minz - dist) : b.cz,
      // the near face of this block, pointing back at us
      nx = horiz ? 0 : -sign,
      nz = horiz ? -sign : 0;
    box(g, bw, 880, 120, bx2, 440, bz2, concrete, ry);

    var cols = Math.max(3, (bw / 190) | 0);
    for (var fl = 0; fl < 4; fl++) {
      for (var cI = 0; cI < cols; cI++) {
        var on = rnd() < 0.45,
          off = -bw / 2 + 90 + cI * ((bw - 180) / Math.max(1, cols - 1)),
          wy = 130 + fl * 200,
          lx = bx2 + (horiz ? off : nx * 62),
          lz = bz2 + (horiz ? nz * 62 : off);
        box(g, horiz ? 96 : 8, 118, horiz ? 8 : 96, lx, wy, lz, on ? lit : dark, 0);
        // only a couple actually cast light; the rest are free emissive panels
        if (on && rnd() < 0.22) {
          var wl = new THREE.PointLight(0xffc07a, legacyIntensity(1.6, 520), 520, 2);
          wl.position.set(lx + nx * 45, wy, lz + nz * 45);
          addEnvLight(g, wl);
        }
      }
    }
    // AC boxes clinging to the facade
    for (var ac = 0; ac < 3; ac++) {
      var aoff = rr(-bw / 2, bw / 2);
      box(g, 58, 42, 34, bx2 + (horiz ? aoff : nx * 76), rr(160, 620), bz2 + (horiz ? nz * 76 : aoff), em(0x54575c, 0.8, 0.35));
    }

    // the walkway side: a shared deck and railing right outside our windows
    if (side === openSide) {
      var wdist = pad * 0.4,
        wx2 = horiz ? b.cx : sign > 0 ? b.maxx + wdist : b.minx - wdist,
        wz2 = horiz ? (sign > 0 ? b.maxz + wdist : b.minz - wdist) : b.cz;
      box(g, horiz ? bw : 150, 12, horiz ? 150 : bw, wx2, 4, wz2, concrete, 0);
      for (var r = 0; r < 16; r++) {
        var t4 = r / 15 - 0.5;
        cyl(g, 3, 3, 92, wx2 + (horiz ? t4 * bw : -nx * 60), 46, wz2 + (horiz ? -nz * 60 : t4 * bw), rail, 6);
      }
      box(g, horiz ? bw : 6, 6, horiz ? 6 : bw, wx2 + (horiz ? 0 : -nx * 60), 92, wz2 + (horiz ? -nz * 60 : 0), rail, 0);
      var tube = new THREE.PointLight(0x9fd8ff, legacyIntensity(1.2, 620), 620, 2);
      tube.position.set(wx2, 235, wz2);
      addEnvLight(g, tube);
      if (tube.parent) Z.envFlicker = tube; // stepped in stepEnv for a sick stairwell strobe
    }
  }
  return "neighbor";
}

/* The sodium pool a street lamp throws on the road, as an additive disc lying
   just above the tarmac. Same trick the drive mode uses for headlights: it is
   unlit and unfogged, so it survives the horror grade's exposure and reads at
   a distance where a point light's own falloff has already gone to nothing. */
var POOL_MAT = null;
function poolMat() {
  if (POOL_MAT) return POOL_MAT;
  var c = document.createElement("canvas");
  c.width = c.height = 128;
  var x = c.getContext("2d");
  var gr = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  gr.addColorStop(0, "rgba(255,193,120,0.44)");
  gr.addColorStop(0.35, "rgba(255,170,90,0.20)");
  gr.addColorStop(0.72, "rgba(255,150,70,0.06)");
  gr.addColorStop(1, "rgba(255,140,60,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  POOL_MAT = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  return POOL_MAT;
}

function lampPool(g, px, pz, r) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), poolMat());
  m.rotation.x = -Math.PI / 2;
  m.position.set(px, 1.2, pz);
  m.raycast = function () {}; // light is not a hitbox
  g.add(m);
  return m;
}

/* --- 3. street: parking lot, cars, sodium lamps --------------------------- */
function buildStreet(g, b, pad) {
  var tarmac = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w + pad * 2, b.d + pad * 2),
    em(0x1a1b1e, 0.94, 0, { moon: 0.25, mapUrl: "assets/textures/env_tarmac.jpg", rep: 8 })
  );
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.set(b.cx, -1.5, b.cz);
  tarmac.receiveShadow = true;
  g.add(tarmac);

  var paint = em(0xb8b49a, 0.85, 0),
    pole = em(0x2e3034, 0.7, 0.4),
    carCols = [0x6a2020, 0x1c2a44, 0x2a2a2e, 0x3d4a3a, 0x5a5a60, 0x704820];

  /* Parked cars are the drive mode's vehicles. What used to stand in the bays
     was three boxes and four cylinders wearing a masonry photo, which read as
     a stack of bricks; drive_car_mesh already builds proper bodies — sedan,
     hatch, SUV, van, pickup, sport — with glass, arches, bumpers, plates,
     mirrors and spoked wheels, and it imports nothing but three.

     Two things to mind. It works in METRES with the nose at -Z, so the group
     is scaled by 100 and turned a quarter across the old rotation. And its
     geometry lives in a Map shared with drive mode, so every mesh has to be
     flagged shared — clearWorld() disposes anything it doesn't know is
     borrowed, and it would have pulled the geometry out from under the
     drive/RC modes the next time the user went for a lap. */
  var CAR_M = 100;

  function parkCar(cx2, cz2, ry, lit) {
    var car = buildCarMesh(pick(carCols), (rnd() * CAR_TYPES.length) | 0);
    car.scale.setScalar(CAR_M);
    car.position.set(cx2, 0, cz2);
    car.rotation.y = ry + Math.PI / 2 + (rnd() < 0.5 ? Math.PI : 0);
    car.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry) o.geometry.userData.shared = true;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    var L = car.userData.lamps;
    if (L) {
      // A dead lot: lamps off, except the one car left running with its
      // headlights on. Its additive beam cones and ground pool are unfogged,
      // so they carry across the tarmac and give the place a second source.
      L.head.emissiveIntensity = lit ? 0.9 : 0;
      L.tail.emissiveIntensity = lit ? 0.35 : 0;
      L.glows.forEach(function (x) {
        x.sp.visible = !!lit;
      });
      L.beams.visible = !!lit;
    }
    g.add(car);
    return car;
  }

  // Bays down all four edges: every window looks onto the lot, and the row
  // of parked cars gives the zombies something to shamble out from behind.
  for (var side = 0; side < 4; side++) {
    var horiz = side === 0 || side === 2,
      sign = side === 1 || side === 2 ? 1 : -1,
      // The lot was laid out around the old 168cm box-cars: bays pitched at
      // 78cm with a 210cm stripe. Real vehicles are 4.5m long and 1.9m wide,
      // so the pitch goes to a proper 2.6m bay and the stripe to 5m, and the
      // row stands further off the wall or the noses would be inside it.
      lineX = horiz ? b.cx : sign > 0 ? b.maxx + pad * 0.75 : b.minx - pad * 0.75,
      lineZ = horiz ? (sign > 0 ? b.maxz + pad * 0.75 : b.minz - pad * 0.75) : b.cz,
      span = (horiz ? b.w : b.d) + pad,
      bays = Math.max(3, (span / 260) | 0);
    for (var m2 = 0; m2 <= bays; m2++) {
      var off = -span / 2 + m2 * (span / bays);
      box(
        g, horiz ? 8 : 500, 1.4, horiz ? 500 : 8,
        lineX + (horiz ? off : 0), 0.4, lineZ + (horiz ? 0 : off), paint
      );
      if (m2 < bays && rnd() < 0.62)
        parkCar(
          lineX + (horiz ? off + span / bays / 2 : rr(-26, 26)),
          lineZ + (horiz ? rr(-26, 26) : off + span / bays / 2),
          horiz ? Math.PI / 2 : 0,
          side === 0 && m2 === 1 // exactly one car left running
        );
    }
    // one sodium lamp per side, on the corner
    var px = lineX + (horiz ? span * 0.42 : sign * 60),
      pz = lineZ + (horiz ? sign * 60 : span * 0.42);
    cyl(g, 8, 10, 520, px, 260, pz, pole, 8);
    box(g, 90, 8, 8, px, 516, pz, pole);
    /* The lamp hangs 5m up, so its throw has to clear that before it reaches
       anything: at the old distance of 940 the falloff had already eaten 78%
       of it by the time it hit the tarmac. Widened and brightened, and paired
       with the additive pool below — a point light alone renders as a smooth
       gradient that the fog flattens, whereas the pool gives the hard-edged
       ellipse that actually reads as a working street light. */
    var lamp2 = new THREE.PointLight(0xffb15a, legacyIntensity(9, 2100), 2100, 2);
    lamp2.position.set(px, 500, pz);
    addEnvLight(g, lamp2);
    lampPool(g, px, pz, 520);
    box(g, 40, 12, 22, px, 505, pz, em(0x3a2a16, 0.5, 0.2, { emissive: 0xffa244, ei: 2.4, k: "sod", mapUrl: "assets/textures/env_lamp.jpg", rep: 2 }));
    // A bin against the kerb — pushed outward past the stripe rather than
    // jittered around the pole, which with full-size cars in the bays landed
    // it on a bonnet.
    cyl(
      g, 26, 22, 92,
      px + (horiz ? rr(80, 150) : sign * 140),
      46,
      pz + (horiz ? sign * 140 : rr(80, 150)),
      em(0x24402c, 0.9, 0.1), 10
    );
  }
  return "street";
}

/* --- public -------------------------------------------------------------- */
export function buildExterior(theme) {
  if (!Z.grp) return null;
  var b0 = interiorBounds();
  if (!b0) return null;
  var b = {
    minx: b0.minx, maxx: b0.maxx, minz: b0.minz, maxz: b0.maxz,
    w: b0.maxx - b0.minx, d: b0.maxz - b0.minz,
    cx: (b0.minx + b0.maxx) / 2, cz: (b0.minz + b0.maxz) / 2,
  };
  // stand-off: far enough that nothing clips the walls, close enough that the
  // fog hasn't eaten it by the time you look out
  var pad = Math.max(420, Math.min(900, Math.max(b.w, b.d) * 0.55));
  var g = new THREE.Group();
  envLightCount = 0;
  var pickTheme = theme || pick(ENV_THEMES);
  var built =
    pickTheme === "garden" ? buildGarden(g, b, pad) :
    pickTheme === "neighbor" ? buildNeighbor(g, b, pad) :
    buildStreet(g, b, pad);
  decorate(g);
  Z.grp.add(g);
  Z.env = { theme: built, grp: g, t: 0 };
  return built;
}

export function stepEnv(dt) {
  var E = Z.env;
  if (!E) return;
  E.t += dt;
  // the neighbour's stairwell tube is on its last legs
  if (Z.envFlicker) {
    var f = Math.sin(E.t * 21) * Math.sin(E.t * 7.3);
    Z.envFlicker.intensity = legacyIntensity(f > 0.1 ? 1.3 : f > -0.4 ? 0.35 : 0.05, Z.envFlicker.distance);
  }
}

export function clearEnv() {
  Z.env = null;
  Z.envFlicker = null;
}

// Exterior materials are cached across restarts (a new theme every run reuses
// the same surfaces), so only leaving the mode — or a texel-budget change —
// drops them. The meshes are gone by then; the group they lived in was
// removed by clearWorld().
export function resetEnvMats() {
  for (var k in EMAT) EMAT[k].dispose();
  EMAT = {};
}
