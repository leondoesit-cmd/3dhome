// Drive-mode world streaming: road ribbons + surface index, aerial ground
// tiles, OSM buildings/roads, procedural + Street View facades, OSRM routing.
//
// Owns no rebindable module state of its own — everything mutable lives on `D`
// and the containers in drive_state.js. The one thing it needs from the
// traffic side (parking cars along a freshly streamed street) arrives through
// setWorldHooks(), keeping the import graph acyclic.
import * as THREE from "three";
import { gkey } from "./site.js";
import {
  Z, llToM, mToLL, llToTile, tileNW, elevIsReady, sampleElevM,
} from "./drive_geo.js";
import {
  D, car, player, groundTiles, tileColors, bldChunks, bldById, roadById,
  roadGrid, texLoader, ROAD_Y, CAR_Y, RG,
} from "./drive_state.js";
import { isNight } from "./drive_sky.js";
import { fetchRoadRoute } from "./road_route.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const hooks = { dressWay: () => {} };
export function setWorldHooks(h) {
  Object.assign(hooks, h);
}

// _link variants match via prefix in the Overpass regex and reuse the base
// class here (motorway_link → startsWith motorway).
const ROAD_W = {
  motorway: 15, trunk: 13, primary: 11, secondary: 9.5, tertiary: 8.5,
  unclassified: 6.5, residential: 6.5, living_street: 5.5,
  service: 4.2, pedestrian: 5,
};
export function roadWidth(hw) {
  if (!hw) return 0;
  if (ROAD_W[hw]) return ROAD_W[hw];
  for (const k in ROAD_W) if (hw.indexOf(k) === 0) return ROAD_W[k] * 0.7; // links
  return 0;
}

// procedural asphalt: crisp texture over the blurry satellite ground.
// Dashed variant carries a center lane line + edge lines; plain is for
// narrow service/pedestrian ways. UV.y runs along the road (12 m / repeat).
let roadMatDashed = null,
  roadMatPlain = null;
export function roadMaterial(dashed) {
  let m = dashed ? roadMatDashed : roadMatPlain;
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#35383d";
  ctx.fillRect(0, 0, 64, 256);
  // subtle speckle so the asphalt isn't a flat slab
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.09)";
    ctx.fillRect(Math.random() * 64, Math.random() * 256, 1.6, 1.6);
  }
  if (dashed) {
    ctx.fillStyle = "rgba(245,242,230,0.92)";
    ctx.fillRect(30, 8, 4, 88); // 12 m repeat → two ~4 m dashes
    ctx.fillRect(30, 136, 4, 88);
    ctx.fillStyle = "rgba(245,242,230,0.55)"; // solid edge lines
    ctx.fillRect(2, 0, 2, 256);
    ctx.fillRect(60, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Lit, so building and car shadows land on the asphalt: buildRoadMesh gives
  // the ribbon an explicit +Y normal and winds it face-up for this.
  // DoubleSide keeps it visible from underneath (crest tears, flyovers).
  m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  if (dashed) roadMatDashed = m;
  else roadMatPlain = m;
  return m;
}

// road ribbon along a polyline, draped over the terrain, with length-based
// UVs for the dashes. ROAD_Y keeps asphalt just above the ground skin —
// low enough that the car (riding at CAR_Y) sits ON the surface, not in it.

// Road-surface index: every ribbon segment is bucketed into a coarse grid
// with its EXACT ribbon end heights, so the car can ride the asphalt surface
// instead of the raw terrain (the two disagree by ±30 cm on slopes — that
// was the "car sunk in / floating over the road" artifact).
export function indexRoadSegment(ax, az, ay, bx, bz, by, half) {
  const idx = D.roadSegs.length;
  D.roadSegs.push({ ax, az, ay, bx, bz, by, half: half + 0.35 });
  const r = half + 0.35;
  const gx0 = Math.floor((Math.min(ax, bx) - r) / RG),
    gx1 = Math.floor((Math.max(ax, bx) + r) / RG),
    gz0 = Math.floor((Math.min(az, bz) - r) / RG),
    gz1 = Math.floor((Math.max(az, bz) + r) / RG);
  for (let gx = gx0; gx <= gx1; gx++)
    for (let gz = gz0; gz <= gz1; gz++) {
      const k = gx + "_" + gz;
      let arr = roadGrid.get(k);
      if (!arr) roadGrid.set(k, (arr = []));
      arr.push(idx);
    }
}
// asphalt height at (x,z), or null when not on a road (max over overlaps)
export function roadYAt(x, z) {
  const arr = roadGrid.get(Math.floor(x / RG) + "_" + Math.floor(z / RG));
  if (!arr) return null;
  let best = null;
  for (let i = 0; i < arr.length; i++) {
    const s = D.roadSegs[arr[i]];
    const dx = s.bx - s.ax,
      dz = s.bz - s.az;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = s.ax + dx * t,
      pz = s.az + dz * t;
    if (Math.hypot(x - px, z - pz) > s.half) continue;
    const y = s.ay + (s.by - s.ay) * t;
    if (best == null || y > best) best = y;
  }
  return best;
}
// the surface the car actually rides: asphalt when on a road, terrain otherwise
export function surfaceY(x, z) {
  const t = sampleElevM(x, z);
  const r = roadYAt(x, z);
  return r != null ? Math.max(t, r) : t;
}
export function buildRoadMesh(rawPts, width) {
  // resample to ≤12 m steps: OSM straights carry few vertices, and a long
  // segment would cut straight through terrain bumps instead of draping
  const pts = [rawPts[0]];
  for (let i = 1; i < rawPts.length; i++) {
    const a = rawPts[i - 1],
      b = rawPts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(seg / 12));
    for (let k = 1; k <= n; k++)
      pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  const half = width / 2,
    pos = [],
    uv = [],
    idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l,
      nz = dx / l;
    if (i) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    // Lift the whole cross-section above the HIGHEST terrain under the road's
    // full width (center + both edges), not just the centerline. On a
    // cross-slope the uphill edge's terrain would otherwise poke up through the
    // flat ribbon and blot out half the lane. Keeping both edges at one height
    // makes the road ignore the cross-slope — flat across its width, floating
    // on the low side rather than buried on the high side.
    const cx = pts[i].x,
      cz = pts[i].z;
    const y =
      Math.max(
        sampleElevM(cx, cz),
        sampleElevM(cx + nx * half, cz + nz * half),
        sampleElevM(cx - nx * half, cz - nz * half),
      ) + ROAD_Y;
    pos.push(pts[i].x + nx * half, y, pts[i].z + nz * half);
    pos.push(pts[i].x - nx * half, y, pts[i].z - nz * half);
    uv.push(0, dist / 12, 1, dist / 12);
    if (i) {
      const k = i * 2;
      // wound face-UP (the ribbon used to wind toward -Y, which read as an
      // unlit slab once the material became a lit one)
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
      // feed the drive-surface index with the exact ribbon heights
      indexRoadSegment(
        pts[i - 1].x, pts[i - 1].z, pos[(i - 1) * 6 + 1],
        pts[i].x, pts[i].z, y, half,
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // flat +Y normals: the ribbon is a drape, and computed normals on a strip
  // this thin only produce shading noise along the seams
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, roadMaterial(width >= 6));
  mesh.receiveShadow = true;
  return mesh;
}
// junction filler: plain-asphalt disc under a way endpoint. Ways meet at
// shared end nodes, so discs there patch the wedge gaps at intersections
// and sharp corners.
const discGeo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
export function junctionDisc(p, width) {
  const m = new THREE.Mesh(discGeo, roadMaterial(false));
  m.scale.set(width * 0.52, 1, width * 0.52);
  m.position.set(p.x, sampleElevM(p.x, p.z) + ROAD_Y - 0.015, p.z);
  m.receiveShadow = true;
  return m;
}

// audio (engine + blips) lives in drive_audio.js
// ---- ground tiles ----------------------------------------------------------
// 32×32 pixel copies of loaded aerial tiles, for sampling real-world colors
// real satellite color under a local point, or null if that tile isn't in yet
export function aerialColorAt(x, z) {
  const ll = mToLL(x, z);
  const n = Math.pow(2, Z);
  const s = Math.sin((ll.lat * Math.PI) / 180);
  const gx = ((ll.lon + 180) / 360) * n,
    gy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const d = tileColors.get(Math.floor(gx) + "_" + Math.floor(gy));
  if (!d) return null;
  const px = Math.min(31, Math.floor((gx - Math.floor(gx)) * 32)),
    py = Math.min(31, Math.floor((gy - Math.floor(gy)) * 32));
  const i = (py * 32 + px) * 4;
  return new THREE.Color(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
}

// world streaming centers on whoever moves: the car, or your feet
export function focusPos() {
  return player.onFoot ? player : car;
}
export function syncTiles() {
  const fp = focusPos();
  const ll = mToLL(fp.x, fp.z);
  const c = llToTile(ll.lat, ll.lon);
  const R = 4; // 9×9 tiles ≈ 1 km of ground — enough headroom at ~220 km/h
  const want = new Set();
  for (let tx = c.tx - R; tx <= c.tx + R; tx++)
    for (let ty = c.ty - R; ty <= c.ty + R; ty++) {
      const key = tx + "_" + ty;
      want.add(key);
      if (groundTiles.has(key)) continue;
      const nw = tileNW(tx, ty),
        se = tileNW(tx + 1, ty + 1);
      const p0 = llToM(nw.lat, nw.lon),
        p1 = llToM(se.lat, se.lon);
      const w = p1.x - p0.x,
        d = p1.z - p0.z;
      // segmented plane displaced by the terrain heightfield (flat while the
      // elevation tile loads; loop() clears+rebuilds tiles once it's in)
      const geo = new THREE.PlaneGeometry(w, d, 16, 16);
      geo.rotateX(-Math.PI / 2);
      const cx0 = p0.x + w / 2,
        cz0 = p0.z + d / 2;
      if (elevIsReady()) {
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++)
          pa.setY(i, sampleElevM(cx0 + pa.getX(i), cz0 + pa.getZ(i)));
        geo.computeVertexNormals();
      }
      // placeholder tone until the aerial tile decodes — dark enough that a
      // slow tile doesn't flash a blown-out white slab
      const mat = new THREE.MeshLambertMaterial({ color: 0x6d7269 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.position.set(cx0, 0, cz0);
      D.scene.add(mesh);
      groundTiles.set(key, mesh);
      texLoader.load(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" +
          Z + "/" + ty + "/" + tx,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
          // keep a 32×32 pixel copy for real-color lookups (building tints)
          if (!tileColors.has(key) && tex.image) {
            try {
              const cc = document.createElement("canvas");
              cc.width = cc.height = 32;
              const cctx = cc.getContext("2d");
              cctx.drawImage(tex.image, 0, 0, 32, 32);
              tileColors.set(key, cctx.getImageData(0, 0, 32, 32).data);
              if (tileColors.size > 260)
                tileColors.delete(tileColors.keys().next().value);
            } catch (_) {}
          }
        },
      );
    }
  groundTiles.forEach((mesh, key) => {
    if (!want.has(key)) {
      D.scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
      groundTiles.delete(key);
    }
  });
}

// ---- buildings + roads (OSM Overpass, best-effort, one fetch per chunk) ----
export function chunkKey(x, z) {
  return Math.round(x / 500) + "_" + Math.round(z / 500);
}
// Chunk streaming. `bldChunks` maps key → {state, tries, retryAt}: a chunk that
// FAILED must be retryable. The first version added the key before the fetch and
// only removed it in the catch, so a rate-limited Overpass reply (valid JSON,
// no `elements`) marked the chunk done forever and you drove the rest of the
// session through an empty grey city.
const CHUNK_BACKOFF = 4000,
  CHUNK_BACKOFF_MAX = 60000,
  CHUNK_INFLIGHT = 2;
function chunkState(key) {
  return bldChunks.get(key) || null;
}
function chunkReady(key, now) {
  const c = chunkState(key);
  if (!c) return true; // never tried
  if (c.state === "done" || c.state === "pending") return false;
  return now >= c.retryAt;
}
export function chunkBBox(key) {
  const [kx, kz] = key.split("_").map(Number);
  const ll = mToLL(kx * 500, kz * 500);
  const dLat = 400 / 111320,
    dLon = 400 / (111320 * Math.cos((ll.lat * Math.PI) / 180));
  return (
    (ll.lat - dLat) + "," + (ll.lon - dLon) + "," + (ll.lat + dLat) + "," + (ll.lon + dLon)
  );
}
export function chunkQuery(bbox) {
  // highways FIRST in the union: the element cap truncates from the end, and
  // losing a few buildings beats losing the roads entirely
  return (
    "[out:json][timeout:20];(" +
    'way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian)"](' +
    bbox + ");way[building](" + bbox + "););out geom tags 1400;"
  );
}
export function buildChunkElements(elements) {
  elements.forEach((w) => {
    if (w.type !== "way" || !w.geometry) return;
    const tags = w.tags || {};
    // road way → asphalt ribbon draped on the terrain + junction end discs
    if (tags.highway) {
      if (roadById.has(w.id)) return;
      roadById.add(w.id);
      const wid = roadWidth(tags.highway);
      if (!wid) return;
      const rpts = w.geometry.map((g) => llToM(g.lat, g.lon));
      if (rpts.length >= 2) {
        const m = buildRoadMesh(rpts, wid);
        m.position.y = (w.id % 7) * 0.004; // de-fight overlapping ways
        D.roadGroup.add(m);
        D.roadGroup.add(junctionDisc(rpts[0], wid));
        D.roadGroup.add(junctionDisc(rpts[rpts.length - 1], wid));
        // drivable lane for the AI traffic, before the way is dressed
        D.ways.push({ id: w.id, pts: rpts, wid });
        hooks.dressWay(rpts, wid, w.id); // parked cars, lamps, trees, people
      }
      return;
    }
    if (bldById.has(w.id)) return;
    bldById.add(w.id);
    const pts = w.geometry.map((g) => llToM(g.lat, g.lon));
    if (pts.length < 3) return;
    buildBuilding(pts, tags, w.id);
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    pts.forEach((p) => {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
    });
    D.bldPolys.push({ poly: pts, minx, maxx, minz, maxz });
  });
  flushBuildingBatch();
}
async function loadChunk(key) {
  const prev = chunkState(key);
  const tries = prev ? prev.tries : 0;
  bldChunks.set(key, { state: "pending", tries, retryAt: 0 });
  const fail = () => {
    const n = tries + 1;
    bldChunks.set(key, {
      state: "failed",
      tries: n,
      retryAt: performance.now() + Math.min(CHUNK_BACKOFF_MAX, CHUNK_BACKOFF * Math.pow(2, n - 1)),
    });
  };
  // a cached chunk skips the network entirely — repeat drives cost nothing
  const cached = await chunkGet(key);
  if (cached && cached.length) {
    if (!D.running) return fail();
    bldChunks.set(key, { state: "done", tries, retryAt: 0 });
    buildChunkElements(cached);
    return;
  }
  let j;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(chunkQuery(chunkBBox(key))),
    });
    j = await r.json();
  } catch (_) {
    return fail();
  }
  // a rate-limited reply parses fine and carries no elements: that is a FAILURE
  if (!j || !Array.isArray(j.elements)) return fail();
  if (!D.running) return fail();
  bldChunks.set(key, { state: "done", tries, retryAt: 0 });
  chunkPut(key, j.elements);
  buildChunkElements(j.elements);
}
export async function syncBuildings() {
  if (!elevIsReady()) return; // roads/buildings drape on terrain — wait for it
  const now = performance.now();
  const fp = focusPos();
  const want = [chunkKey(fp.x, fp.z)];
  // prefetch what we are driving into: at 200 km/h you outrun a streamer that
  // only ever asks for the chunk you are standing in
  const sp = Math.hypot(car.vx, car.vz);
  if (sp > 6) {
    const ahead = chunkKey(fp.x + (car.vx / sp) * 460, fp.z + (car.vz / sp) * 460);
    if (ahead !== want[0]) want.push(ahead);
  }
  let inflight = 0;
  bldChunks.forEach((c) => {
    if (c.state === "pending") inflight++;
  });
  for (const key of want) {
    if (inflight >= CHUNK_INFLIGHT) break;
    if (!chunkReady(key, now)) continue;
    inflight++;
    loadChunk(key);
  }
}

// ---- buildings: real-data facades ------------------------------------------
// Walls are hand-built quads (one per footprint edge) with meter-true UVs:
// u = one window column per 3.4 m, v = one floor per 3.1 m — so the window
// grid matches the building's REAL floor count (building:levels / height).
// Tint comes from OSM building:colour when tagged; texture style from the
// building type (offices/commercial get glass bands, the rest punched windows).
// facade styles — one 128×128 canvas per window cell:
//   0 punched window  1 tall window + shutter  2 balcony band (residential)
//   3 ribbon glazing  4 grid curtain wall      (office/commercial)
const facadeTexs = {};
export function facadeTexture(style) {
  if (facadeTexs[style]) return facadeTexs[style];
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = ["#e4e1da", "#e8e2d6", "#e0ddd8", "#dcdfe2", "#d8dde1"][style];
  ctx.fillRect(0, 0, 128, 128);
  const glass = ctx.createLinearGradient(0, 18, 0, 100);
  glass.addColorStop(0, style >= 3 ? "#3c5464" : "#4a5c6e");
  glass.addColorStop(0.55, style >= 3 ? "#93aec2" : "#95a9ba");
  glass.addColorStop(1, style >= 3 ? "#5a7284" : "#5e7080");
  ctx.fillStyle = glass;
  if (style === 0) {
    ctx.fillRect(36, 28, 56, 66);
    ctx.strokeStyle = "#f2efe8";
    ctx.lineWidth = 5;
    ctx.strokeRect(36, 28, 56, 66);
    ctx.fillStyle = "rgba(30,34,40,0.28)";
    ctx.fillRect(30, 96, 68, 6); // sill shadow
  } else if (style === 1) {
    ctx.fillRect(22, 18, 42, 88); // tall french window
    ctx.strokeStyle = "#f2efe8";
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 18, 42, 88);
    ctx.fillStyle = "#8b8478"; // closed shutter beside it
    ctx.fillRect(74, 18, 32, 88);
    ctx.strokeStyle = "rgba(60,56,48,0.5)";
    ctx.lineWidth = 2;
    for (let y = 24; y < 104; y += 8) {
      ctx.beginPath();
      ctx.moveTo(75, y);
      ctx.lineTo(105, y);
      ctx.stroke();
    }
  } else if (style === 2) {
    ctx.fillRect(38, 14, 52, 64); // balcony door
    ctx.strokeStyle = "#f2efe8";
    ctx.lineWidth = 4;
    ctx.strokeRect(38, 14, 52, 64);
    ctx.fillStyle = "rgba(24,28,33,0.45)"; // balcony recess shadow
    ctx.fillRect(10, 78, 108, 8);
    ctx.fillStyle = "rgba(58,62,66,0.85)"; // railing
    ctx.fillRect(8, 84, 112, 3);
    for (let x = 12; x < 118; x += 11) ctx.fillRect(x, 86, 2.5, 26);
    ctx.fillStyle = "rgba(30,34,40,0.5)"; // slab
    ctx.fillRect(4, 112, 120, 8);
  } else if (style === 3) {
    ctx.fillRect(0, 22, 128, 68); // ribbon glazing
    ctx.fillStyle = "rgba(240,244,246,0.55)";
    for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 22, 2.5, 68);
    ctx.fillStyle = "rgba(30,36,42,0.35)";
    ctx.fillRect(0, 92, 128, 10); // slab shadow
  } else {
    ctx.fillRect(0, 0, 128, 104); // full curtain wall
    ctx.fillStyle = "rgba(238,242,244,0.5)";
    for (let x = 0; x < 128; x += 26) ctx.fillRect(x, 0, 2, 104);
    ctx.fillRect(0, 50, 128, 2);
    ctx.fillStyle = "rgba(38,46,52,0.55)"; // spandrel band
    ctx.fillRect(0, 104, 128, 24);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeTexs[style] = tex;
  return tex;
}
// After dark the same window grid becomes an EMISSIVE mask: the glass glows,
// the wall stays dark. (Reusing the day texture as the mask lit the wall and
// left the windows black — exactly backwards.)
const facadeNightTexs = {};
export function facadeNightTexture(style) {
  if (facadeNightTexs[style]) return facadeNightTexs[style];
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#fff4dd";
  if (style === 0) ctx.fillRect(38, 30, 52, 62);
  else if (style === 1) ctx.fillRect(24, 20, 38, 84);
  else if (style === 2) ctx.fillRect(40, 16, 48, 60);
  else if (style === 3) {
    ctx.fillStyle = "#cfe0ea"; // office floors: cooler, dimmer strip lighting
    ctx.fillRect(0, 24, 128, 64);
    ctx.fillStyle = "#000";
    for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 24, 4, 64);
  } else {
    ctx.fillStyle = "#c6d8e6";
    ctx.fillRect(0, 2, 128, 100);
    ctx.fillStyle = "#000";
    for (let x = 0; x < 128; x += 26) ctx.fillRect(x, 0, 3, 104);
    ctx.fillRect(0, 48, 128, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeNightTexs[style] = tex;
  return tex;
}
const facadeMats = {},
  roofMats = {};
// every building material, so a time-of-day switch can light the windows
export const bldMats = [];
export function trackBldMat(m, style) {
  m.userData.nightStyle = style; // undefined on Street-View photo walls
  bldMats.push(m);
  applyNightMat(m, isNight());
  return m;
}
export function applyNightMat(m, on) {
  const s = m.userData.nightStyle;
  if (!on) {
    m.emissive.setHex(0x000000);
    m.emissiveMap = null;
  } else if (s != null) {
    m.emissiveMap = facadeNightTexture(s);
    m.emissive.setHex(s >= 3 ? 0x6f7d88 : 0xd08b3c);
    // not every block turns in at the same hour: dim whole buildings by a
    // hash of their tint so the skyline isn't one flat wall of lit windows
    const k = m.color.getHex() % 5;
    m.emissive.multiplyScalar(k === 0 ? 0.25 : k === 1 ? 0.5 : k === 2 ? 0.75 : 1);
  } else {
    m.emissiveMap = null;
    m.emissive.setHex(0x181208); // photo facades: just enough not to go pitch black
  }
  m.needsUpdate = true;
}
export function facadeMaterial(style, tint) {
  const key = style + tint.getHexString();
  if (!facadeMats[key]) {
    facadeMats[key] = trackBldMat(
      new THREE.MeshLambertMaterial({
        map: facadeTexture(style),
        color: tint,
        side: THREE.DoubleSide, // OSM ring winding is not guaranteed
      }),
      style,
    );
  }
  return facadeMats[key];
}
// ---- batched facades -------------------------------------------------------
// A city block used to be ~1000 draw calls: two meshes per building, each with
// its own material (the per-id tint jitter made the material cache useless).
// The tint now rides in a vertex-colour attribute instead, so every building of
// one facade STYLE shares a material and merges into a single mesh per chunk —
// ~5 wall meshes and one roof mesh per chunk instead of hundreds.
const facadeBatchMats = {};
export function facadeBatchMaterial(style) {
  if (!facadeBatchMats[style])
    facadeBatchMats[style] = trackBldMat(
      new THREE.MeshLambertMaterial({
        map: facadeTexture(style),
        vertexColors: true,
        side: THREE.DoubleSide, // OSM ring winding is not guaranteed
      }),
      style,
    );
  return facadeBatchMats[style];
}
let roofBatchMat = null;
export function roofBatchMaterial() {
  if (!roofBatchMat)
    roofBatchMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
  return roofBatchMat;
}
function paintGeometry(geo, tint) {
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
function batchBin() {
  if (!D.bldBatch) D.bldBatch = { walls: {}, roofs: [] };
  return D.bldBatch;
}
// merge one bin into a single mesh and hand every building back the vertex
// range it landed in, so a Street View photo can still take one building out
function mergeBin(entries, material, castShadow) {
  if (!entries.length) return;
  const merged = mergeGeometries(entries.map((e) => e.geo), false);
  entries.forEach((e) => e.geo.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  D.bldGroup.add(mesh);
  let start = 0;
  entries.forEach((e) => {
    if (e.rec) e.rec.batch = { mesh, start, count: e.count };
    start += e.count;
  });
}
export function flushBuildingBatch() {
  const bin = batchBin();
  for (const style in bin.walls) {
    mergeBin(bin.walls[style], facadeBatchMaterial(Number(style)), true);
    delete bin.walls[style];
  }
  mergeBin(bin.roofs, roofBatchMaterial(), true);
  bin.roofs.length = 0;
}
// Take one building's vertices out of its batch by collapsing them to a point.
// Cheaper and far less error-prone than re-merging the whole chunk, and the
// degenerate triangles cost nothing to raster.
export function hideFromBatch(rec) {
  if (!rec.batch) return;
  const pos = rec.batch.mesh.geometry.getAttribute("position");
  const from = rec.batch.start * 3,
    to = (rec.batch.start + rec.batch.count) * 3;
  for (let i = from; i < to; i++) pos.array[i] = 0;
  pos.needsUpdate = true;
  rec.batch = null;
}
export function roofMaterial2(tint) {
  const key = tint.getHexString();
  if (!roofMats[key]) {
    roofMats[key] = new THREE.MeshLambertMaterial({
      color: tint,
      side: THREE.DoubleSide,
    });
  }
  return roofMats[key];
}
// wall quads for a footprint: meter-true window-grid UVs, or (photo mode)
// u/v 0..1 per wall so one street photo covers each face
export function wallGeometry(pts, base, hEff, photo) {
  const vRep = Math.max(1, Math.round(hEff / 3.1));
  const pos = [],
    uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.3) continue;
    const uR = photo ? 1 : Math.max(1, Math.round(len / 3.4));
    const vR = photo ? 1 : vRep;
    const y0 = base,
      y1 = base + hEff;
    pos.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z);
    pos.push(a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z);
    uv.push(0, 0, uR, 0, uR, vR);
    uv.push(0, 0, uR, vR, 0, vR);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

// ---- Street View facades (optional; uses the Site panel's Google key) ------
// Real photos of the actual street mapped onto building walls. Fetched as a
// slow trickle (≥1.5 s apart, ≤60 NEW photos per session, nearest buildings
// first) and cached FOREVER in IndexedDB keyed by OSM way id — so repeat
// drives through known streets cost zero API calls. Pano lookups use the
// free metadata endpoint before any billed image request.
export function idb() {
  return new Promise((res) => {
    if (D.svDB) return res(D.svDB);
    if (!window.indexedDB) return res(null);
    const rq = indexedDB.open("home3d_svcache", 2);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("sv")) db.createObjectStore("sv");
      // v2: streamed OSM chunks, so a second drive through a city already seen
      // is instant and survives Overpass being down or rate-limiting us
      if (!db.objectStoreNames.contains("chunk")) db.createObjectStore("chunk");
    };
    rq.onsuccess = () => {
      D.svDB = rq.result;
      res(D.svDB);
    };
    rq.onerror = () => res(null);
  });
}
export function svGet(key) {
  return idb().then(
    (db) =>
      new Promise((res) => {
        if (!db) return res(null);
        try {
          const rq = db.transaction("sv").objectStore("sv").get(key);
          rq.onsuccess = () => res(rq.result || null);
          rq.onerror = () => res(null);
        } catch (_) {
          res(null);
        }
      }),
  );
}
export function svPut(key, val) {
  idb().then((db) => {
    if (!db) return;
    try {
      db.transaction("sv", "readwrite").objectStore("sv").put(val, key);
    } catch (_) {}
  });
}
// ---- streamed-chunk cache --------------------------------------------------
const CHUNK_TTL = 14 * 24 * 3600 * 1000; // OSM moves slowly; a fortnight is plenty
export function chunkGet(key) {
  return idb().then(
    (db) =>
      new Promise((res) => {
        if (!db) return res(null);
        try {
          const rq = db.transaction("chunk").objectStore("chunk").get(key);
          rq.onsuccess = () => {
            const rec = rq.result;
            res(rec && Date.now() - rec.at < CHUNK_TTL ? rec.data : null);
          };
          rq.onerror = () => res(null);
        } catch (_) {
          res(null);
        }
      }),
  );
}
export function chunkPut(key, data) {
  idb().then((db) => {
    if (!db) return;
    try {
      db.transaction("chunk", "readwrite").objectStore("chunk").put({ at: Date.now(), data }, key);
    } catch (_) {}
  });
}
export function applySVPhoto(rec, dataUrl) {
  const img = new Image();
  img.onload = () => {
    if (rec.sv || !D.running) return;
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = wallGeometry(rec.pts, rec.base, rec.hEff, true);
    const mat = trackBldMat(
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }),
      null,
    );
    if (rec.mesh) {
      // already standalone (a second photo for the same building)
      rec.mesh.geometry.dispose();
      rec.mesh.geometry = geo;
      rec.mesh.material = mat;
    } else {
      // photographed buildings leave the batch and get their own mesh
      hideFromBatch(rec);
      rec.mesh = new THREE.Mesh(geo, mat);
      rec.mesh.castShadow = true;
      rec.mesh.receiveShadow = true;
      D.bldGroup.add(rec.mesh);
    }
    rec.sv = true;
  };
  img.src = dataUrl;
}
async function fetchSVFor(rec) {
  const k = gkey();
  const ll = mToLL(rec.cx, rec.cz);
  // nearest outdoor pano (metadata request — free tier, no image billed)
  const meta = await (
    await fetch(
      "https://maps.googleapis.com/maps/api/streetview/metadata?location=" +
        ll.lat + "," + ll.lon + "&radius=60&source=outdoor&key=" + k,
    )
  ).json();
  if (!meta || meta.status !== "OK") return;
  const plat = meta.location.lat,
    plon = meta.location.lng;
  // bearing pano → building centroid (small-distance approximation)
  const hdg =
    ((Math.atan2(
      (ll.lon - plon) * Math.cos((ll.lat * Math.PI) / 180),
      ll.lat - plat,
    ) * 180) / Math.PI + 360) % 360;
  D.svBudget--;
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src =
      "https://maps.googleapis.com/maps/api/streetview?size=640x400&location=" +
      plat + "," + plon + "&fov=80&heading=" + Math.round(hdg) +
      "&pitch=10&source=outdoor&key=" + k;
  });
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  c.getContext("2d").drawImage(img, 0, 0, 512, 320);
  const dataUrl = c.toDataURL("image/jpeg", 0.72);
  svPut("b" + rec.id, dataUrl);
  applySVPhoto(rec, dataUrl);
}
// called every frame: at most one in-flight fetch, nearest building first
export function svTick(now) {
  if (D.svBusy || !elevIsReady() || D.svBudget <= 0 || !gkey()) return;
  if (now - D.svLastFetch < 1500) return;
  let best = null,
    bd = 1e9;
  for (let i = 0; i < D.bldRegistry.length; i++) {
    const r = D.bldRegistry[i];
    if (r.sv || r.svTried) continue;
    const d = Math.hypot(r.cx - focusPos().x, r.cz - focusPos().z);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  if (!best || bd > 260) return;
  D.svLastFetch = now;
  best.svTried = true;
  D.svBusy = true;
  fetchSVFor(best)
    .catch(() => {})
    .finally(() => (D.svBusy = false));
}

const BLD_PALETTE = [
  0xd9d2c4, 0xcfc9bd, 0xdad0be, 0xc9bfae, 0xd3ccc2,
  0xe0d6c2, 0xc2b8a6, 0xd8cfc8, 0xcac4b2, 0xdedacb,
];
const ROOF_TILE = [0xa85f43, 0x96543c, 0xb06a4a]; // terracotta for low houses
const ROOF_FLAT = [0x9a978f, 0x807d76, 0x6e6c66]; // gravel/concrete grays
export function buildBuilding(pts, tags, id) {
  const levels = parseFloat(tags["building:levels"]);
  const h = tags.height
    ? parseFloat(tags.height)
    : (levels || 2 + (id % 3)) * 3.1;
  // foundation follows the terrain: sink to the lowest corner, keep the roof
  // a constant height above the highest one
  let minS = Infinity,
    maxS = -Infinity;
  pts.forEach((p) => {
    const e = sampleElevM(p.x, p.z);
    if (e < minS) minS = e;
    if (e > maxS) maxS = e;
  });
  const base = minS - 0.4,
    hEff = h + (maxS - minS) + 0.4;
  let tint = null;
  if (tags["building:colour"]) {
    try {
      tint = new THREE.Color(tags["building:colour"]);
    } catch (_) {}
  }
  if (!tint) {
    // palette pick + deterministic per-building hue/lightness jitter, so a
    // whole block never reads as copies of one material
    tint = new THREE.Color(BLD_PALETTE[id % BLD_PALETTE.length]);
    tint.offsetHSL(((id % 13) - 6) * 0.004, ((id % 7) - 3) * 0.015, ((id % 11) - 5) * 0.014);
  }
  const office =
    /office|commercial|retail|hotel|industrial|warehouse/.test(tags.building || "") ||
    h > 28;
  const style = office ? 3 + (id % 2) : id % 3;

  // ground the tint in reality: blend toward the actual satellite color
  // under this building (untagged buildings only — explicit tags win)
  let cx = 0,
    cz = 0;
  pts.forEach((p) => {
    cx += p.x;
    cz += p.z;
  });
  cx /= pts.length;
  cz /= pts.length;
  const ac = aerialColorAt(cx, cz);
  if (ac && !tags["building:colour"]) tint.lerp(ac, 0.35);

  // walls go into this chunk's batch for its facade style; the tint travels as
  // a vertex colour so one material covers the whole style
  const wallGeo = paintGeometry(wallGeometry(pts, base, hEff, false), tint);
  // register for Street View facades; a cached photo applies immediately
  const rec = { id, mesh: null, batch: null, pts, base, hEff, cx, cz, sv: false, svTried: false };
  D.bldRegistry.push(rec);
  const bin = batchBin();
  (bin.walls[style] = bin.walls[style] || []).push({
    geo: wallGeo,
    count: wallGeo.getAttribute("position").count,
    rec,
  });
  svGet("b" + id).then((durl) => {
    if (durl && !rec.sv) applySVPhoto(rec, durl);
  });

  // roof: tagged colour > terracotta for low houses > varied flat grays
  let roofC = null;
  if (tags["roof:colour"]) {
    try {
      roofC = new THREE.Color(tags["roof:colour"]);
    } catch (_) {}
  }
  if (!roofC && ac) roofC = ac.clone().multiplyScalar(0.92); // real roof color
  if (!roofC)
    roofC = new THREE.Color(
      h <= 13 && !office
        ? ROOF_TILE[id % ROOF_TILE.length]
        : ROOF_FLAT[id % ROOF_FLAT.length],
    );
  const shape = new THREE.Shape();
  pts.forEach((p, i) => (i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)));
  const roofGeo = new THREE.ShapeGeometry(shape);
  roofGeo.rotateX(-Math.PI / 2);
  roofGeo.translate(0, base + hEff, 0); // baked in: a merged mesh has no per-roof transform
  paintGeometry(roofGeo, roofC);
  bin.roofs.push({ geo: roofGeo, count: roofGeo.getAttribute("position").count, rec: null });
}

export function insideBuilding(x, z) {
  for (let i = 0; i < D.bldPolys.length; i++) {
    const b = D.bldPolys[i];
    if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue;
    let inside = false;
    const p = b.poly;
    for (let a = 0, c = p.length - 1; a < p.length; c = a++) {
      if (
        p[a].z > z !== p[c].z > z &&
        x < ((p[c].x - p[a].x) * (z - p[a].z)) / (p[c].z - p[a].z) + p[a].x
      )
        inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// ---- OSRM routing ----------------------------------------------------------
// pointsLL = [{lat,lon}, ...] (2+). The rich form keeps OSRM's snapped
// waypoints so starts and checkpoint beacons can sit on the same roads as the
// guide ribbon. The compact wrapper preserves the existing callers.
export async function fetchRouteData(pointsLL) {
  const route = await fetchRoadRoute(pointsLL);
  if (!route) return null;
  return {
    points: route.points.map((p) => llToM(p.lat, p.lon)),
    waypoints: route.waypoints.map((p) => llToM(p.lat, p.lon)),
    distanceM: route.distanceM,
    durationS: route.durationS,
  };
}
export async function fetchRoute(pointsLL) {
  const route = await fetchRouteData(pointsLL);
  return route && route.points;
}
export function setRouteRibbon(pts) {
  if (D.routeMesh) {
    D.scene.remove(D.routeMesh);
    D.routeMesh.geometry.dispose();
    D.routeMesh.material.dispose();
    D.routeMesh = null;
  }
  if (!pts || pts.length < 2) return;
  const W = 2.2,
    pos = [],
    idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x,
      dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l,
      nz = dx / l;
    // drape above the road surface (ROAD_Y) so the guide stays visible; take the
    // max terrain over the ribbon width so a cross-slope can't bury an edge
    const ry =
      Math.max(
        sampleElevM(pts[i].x, pts[i].z),
        sampleElevM(pts[i].x + nx * W, pts[i].z + nz * W),
        sampleElevM(pts[i].x - nx * W, pts[i].z - nz * W),
      ) +
      ROAD_Y +
      0.09;
    pos.push(pts[i].x + nx * W, ry, pts[i].z + nz * W);
    pos.push(pts[i].x - nx * W, ry, pts[i].z - nz * W);
    if (i) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  D.routeMesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: 0x7850ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide, // strip winds -Y — see roadMaterial
    }),
  );
  D.scene.add(D.routeMesh);
}
