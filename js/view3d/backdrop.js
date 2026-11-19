import { pointInPoly, wallGeom, wallPointAt, wallTangentAt } from "../geometry.js";
import { spotFlux } from "../room_bounce.js";
import { legacyIntensity, PLANNER_FLUX_SCALE } from "../gpu.js";
import { srgbToLinear } from "../sky_model.js";
import { S } from "../state.js";
import { normalizeWallKind, normalizeWallProfile } from "../wall_curves.js";
import { wallThickness } from "../wall_types.js";
/* The 3D view's backdrop and light softness: "studio" (the default: a plain
   neutral cyclorama, no grass, no sky, a light grey floor that still catches
   the sun's shadows) or "site" (the grass ground, the sky dome and the
   time-of-day sky), and a "soft light" switch (on by default) that lowers the sun key and the exposure
   and widens the shadow edge, for interiors whose floor reads too bright.

   Both live on the document's workspace (S.workspace.backdrop,
   S.workspace.softLight), so a project opens the way it was presented.
   backdropLook() is pure (no THREE at module level) so Node tests the numbers;
   applyEnv()/applySite() in ./gizmo_env.js apply them. */

export var BACKDROPS = ["site", "studio"];

/* Studio and soft light are the defaults: a project with no choice stored
   (a new plan, or one saved before these settings existed) opens on them, and
   only an explicit "site" / softLight:false turns them off. */
export function backdropMode(workspace) {
  return workspace && workspace.backdrop === "site" ? "site" : "studio";
}
export function softLightOn(workspace) {
  return !(workspace && workspace.softLight === false);
}

/* What the backdrop and softness change, given whether the sun is up.
   Scales multiply the site rig's own values, so "site" without soft light is
   exactly 1 everywhere and the default look is untouched. Colours are hex
   numbers; null means "keep the site rig's colour". */
export function backdropLook(mode, soft, day) {
  var studio = mode === "studio";
  var look = {
    studio: studio,
    sky: !studio, // the gradient sky dome
    grass: !studio, // the procedural ground plane and its dressing
    studioFloor: studio,
    background: null,
    zenith: null,
    horizon: null,
    envGround: null, // hex string for the IBL's lower half
    ptGround: null, // [r,g,b] for the path tracer's ground
    sunScale: 1,
    envScale: 1,
    exposureScale: 1,
    shadowSoften: 0, // added to the sun shadow radius
  };
  if (studio) {
    // a neutral, slightly warm grey room: even fill from every side, no
    // green bounce from grass and no blue cast from a sky
    look.background = day ? 0xe7e5e0 : 0x2b2c2f;
    look.zenith = day ? 0xd4d5d7 : 0x1d1e21;
    look.horizon = day ? 0xebe9e4 : 0x2b2c2f;
    look.envGround = day ? "8e8a83" : "1a1a1c";
    look.ptGround = day ? [0.55, 0.54, 0.52] : [0.1, 0.1, 0.11];
    look.sunScale = 0.8;
    look.envScale = 1.15;
    look.shadowSoften = 2;
  }
  if (soft) {
    look.sunScale *= 0.62;
    look.envScale *= 1.12;
    look.exposureScale = 0.88;
    look.shadowSoften += 5;
  }
  return look;
}

/* The studio floor: one large light-grey disc just under the ground plane,
   which receives the sun's shadows so the model still sits on something.
   Built on first use, kept hidden in "site". */
var floorMesh = null;
export function studioFloor(THREE, scene, visible) {
  if (!floorMesh && visible) {
    floorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(6000, 64),
      new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.95, metalness: 0 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.6;
    floorMesh.receiveShadow = true;
    floorMesh.name = "studioFloor";
    floorMesh.userData.noPick = true;
    floorMesh.raycast = function () {};
    scene.add(floorMesh);
  }
  if (floorMesh) floorMesh.visible = !!visible;
  return floorMesh;
}

/* Irradiance is in the planner's scene-linear daylight units. Multiplying by
   an aperture area in cm² produces flux in the same units as I × steradians
   for a three light whose distance is in cm. */

export const WINDOW_ANGLE = Math.PI * 0.49;
export const WINDOW_PENUMBRA = 1;
// Nominal visible transmittance for the catalogue's clear residential glass.
export const CLEAR_GLASS = 0.8;
// PLANNER_FLUX_SCALE includes the conversion from m² to cm². Directional
// illuminance already contains its area denominator, so undo that factor.
const SCENE_PER_LUX = PLANNER_FLUX_SCALE / 10000;
function daylightY(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Reference is an unobstructed, one-metre-square nominal window in round 2.
const referenceGlass = clearWindowSize({ type: "window", width: 100, height: 100 }).area * CLEAR_GLASS;
const apertureDaylight = spotFlux(legacyIntensity(0.9, 660), Math.PI * 0.44, 1) * 0.6 / referenceGlass;
const apertureColour = [207, 226, 242].map(c => srgbToLinear(c / 255));

export function configurePlannerOutput(renderer, THREE) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
}

export function daylightCalibration(solar, zen, hor, look) {
  const lowSun = 1 - Math.min(1, Math.max(0, solar.elevation / 0.7));
  const sky = solar.sky;
  // Interior photographs keep a common working range for daylight and lamps.
  // Fade the original daytime rig over civil twilight to the moonlit rig.
  const dawn = Math.min(1, solar.day / 0.12);
  const direct = Math.PI * (0.45 * dawn + 1.4 * solar.day) * look.sunScale;
  const dayEnv = (0.53 + 0.21 * lowSun) * look.envScale;
  const horizontal = ["r", "g", "b"].map(k => Math.PI *
    (zen[k] * 0.55 * 2 / 2.55 + hor[k] * 0.6 * (1 - 2 / 2.55)));
  const moon = 0.05 * look.envScale * SCENE_PER_LUX / Math.max(1e-8, daylightY(horizontal));
  const envStrength = dayEnv * sky + moon * (1 - sky);
  const exposure = (1.1 + 0.18 * sky) * look.exposureScale;
  const backgroundScale = sky + (1 - sky) * 0.6 * envStrength;
  const twilightRGB = windowSkyRGB(zen, hor, envStrength);
  const windowRGB = apertureColour.map((c, i) => c * apertureDaylight * solar.day + twilightRGB[i] * (1 - sky));
  return { direct, envStrength, exposure, windowRGB, backgroundScale };
}

export function solarState(hour, north) {
  const phase = (hour - 6) * Math.PI / 12;
  const sine = Math.sin(phase);
  // At sunset sin(pi) rounds slightly above zero and keeps the solar pass active.
  const elevation = Math.abs(sine) < 1e-12 ? 0 : sine * 1.02;
  const azimuth = ((north || 0) + 90) * Math.PI / 180 + phase;
  const day = Math.min(1, Math.max(0, Math.sin(elevation) / 0.85));
  // The disc falls below the horizon before the sky stops lighting a window.
  const twilight = Math.min(1, Math.max(0, (elevation + Math.PI / 30) / (Math.PI / 15)));
  const sky = twilight * twilight * (3 - 2 * twilight);
  return { elevation, azimuth, day, sky };
}

// A straight wall is cut one jamb wider than the nominal leaf on each side
// (buildStraightWall); its jambs do not reduce the clear scheduled width.
// A sampled wall places both jambs inside the nominal opening instead.
export function clearWindowSize(o, frame = frameSpec(o), width = o.width + 2 * frame.jamb) {
  const w = Math.max(0, width - 2 * frame.jamb - frame.mull * frame.mullV);
  const h = Math.max(0, o.height - frame.head - frame.sillW - frame.mull * frame.mullH);
  return { w, h, area: w * h };
}

const doorLeaves = new WeakMap();

// Fraction of the clear opening projected along its normal. Swing/double
// leaves foreshorten by cos(angle); sliding leaves uncover their travel.
function doorFreeFraction(o) {
  const d = doorLeaves.get(o);
  if (!d) return o.open === true ? (o.isSliding || o.isPocket ? 0.9 : 1) : 0;
  if (d.userData.type === "slide") return Math.min(1, Math.abs(d.position.x) / o.width);
  const leaves = d.userData.leaves || [d];
  return leaves.reduce((free, leaf) => free + 1 - Math.abs(Math.cos(leaf.rotation.y)), 0) / leaves.length;
}

export function trackDaylightDoor(o, pivot) {
  if (pivot) doorLeaves.set(o, pivot);
  else doorLeaves.delete(o);
}

// A cutaway has two copies of a door, a short visible leaf and a full-height
// occluder on the shadow-only layer. Their local hinge/slide frames coincide.
export function followDoorShadow(live, caster) {
  if (!live || !caster) return;
  function follow(source, copy) {
    copy.updateMatrix = function () {
      source.updateMatrix();
      this.matrix.copy(source.matrix);
      this.matrixWorldNeedsUpdate = true;
    };
  }
  follow(live, caster);
  (caster.userData.leaves || []).forEach((copy, i) => follow(live.userData.leaves[i], copy));
}

export function openingTransmittance(o, fraction) {
  if (o.type === "window") return CLEAR_GLASS;
  if (o.type === "passage") return 1;
  if (o.type !== "door") return 0;
  const open = fraction ?? doorFreeFraction(o);
  // Only the sliding/pocket catalogue builders put glazing in a leaf.
  let closed = (o.isSliding || o.isPocket) ? ({ glass: 0.9, frosted: 0.8 }[o.mat] || 0) : 0;
  if (closed && o.isPocket)
    closed *= Math.max(0, 1 - 12 / o.width) * Math.max(0, 1 - 12 / o.height);
  return open + (1 - open) * closed;
}

export function exteriorWindow(o, wall, rooms, frame = frameSpec(o)) {
  if (!wall || !["window", "door", "passage"].includes(o.type) || o.paired?.length) return null;
  const gm = wallGeom(wall);
  if (!gm || !(gm.L > 1)) return null;
  const width = Math.min(o.width, gm.L), s = Math.max(width / 2, Math.min(gm.L - width / 2, o.s));
  const center = wallPointAt(wall, s), tangent = wallTangentAt(wall, s);
  const depth = wallThickness(wall, S), inset = depth / 2 + 4;
  let side = 0, room;
  for (const sign of [-1, 1]) {
    const x = center.x - sign * tangent.uz * inset, z = center.z + sign * tangent.ux * inset;
    const inside = rooms.find(r => pointInPoly(x, z, r.pts));
    if (inside) {
      if (side) return null; // internal glazing has no independent view of the sky
      side = sign;
      room = inside;
    }
  }
  if (!room) return null;
  const sampled = gm.kind === "arc" || normalizeWallKind(wall) !== "normal" || normalizeWallProfile(wall).length > 0;
  const roughWidth = sampled ? width : Math.min(gm.L, s + width / 2 + frame.jamb) - Math.max(0, s - width / 2 - frame.jamb);
  const framed = sampled ? { ...frame, mull: 0 } : frame;
  const { w, h, area } = clearWindowSize(o, framed, roughWidth);
  if (!(area > 0)) return null;
  const nx = -side * tangent.uz, nz = side * tangent.ux;
  const x = center.x + nx * inset, z = center.z + nz * inset;
  const y = (o.sill || 0) + (o.height - frame.head + frame.sillW) / 2;
  // Inverse-square range window differs from unity by <1% even at the
  // farthest corner. Walls/ceilings still stop the source at the boundary.
  const reach = 4 * Math.max(100, ...room.pts.map(p => Math.hypot(p.x - x, p.z - z, Math.max(y, (room.ceilH || 250) - y))));
  const transmission = openingTransmittance(o);
  const fullBaseI = area / spotFlux(1, WINDOW_ANGLE, WINDOW_PENUMBRA);
  return { x, y, z, nx, nz, room, area, w, h, depth, opening: o,
    transmission, fullBaseI, baseI: fullBaseI * transmission, reach };
}

let doorWasMoving = false, lastDoorFit = -Infinity, occlusionRevision = 0;
export function syncDoorDaylight(moving, time, lights, skyK, fitBounce) {
  if (!moving && !doorWasMoving) return;
  for (const light of lights) {
    const a = light.userData.aperture;
    if (a?.opening.type !== "door") continue;
    a.transmission = openingTransmittance(a.opening);
    light.userData.baseI = a.baseI = a.fullBaseI * a.transmission;
    light.intensity = a.baseI * (skyK || 0);
  }
  // Refit even for interior doors: opening the passage allows reflected
  // light to reach the neighbouring room. Always upload the settled result.
  if (!moving || time - lastDoorFit >= 100) {
    lastDoorFit = time;
    occlusionRevision++;
    fitBounce();
  }
  doorWasMoving = moving;
}

// Direct flux crossing the clear rectangle. Oblique incidence both foreshortens
// the collecting area and lets the jambs/head intercept the solar beam.
export function admittedSunFlux(aperture, toSun, intensity) {
  if (!aperture || !toSun || !(intensity > 0) || !(toSun.y > 0) || aperture.transmission === 0) return 0;
  const facing = -(aperture.nx * toSun.x + aperture.nz * toSun.z);
  if (!(facing > 0)) return 0;
  const run = aperture.depth / facing;
  const shiftX = run * (aperture.nx * toSun.z - aperture.nz * toSun.x), shiftY = run * toSun.y;
  const w = Math.max(0, aperture.w - Math.abs(shiftX)), h = Math.max(0, aperture.h - shiftY);
  if (!w || !h) return 0;
  const visible = aperture.sunVisibility ? aperture.sunVisibility(toSun, shiftX, shiftY, w, h) : 1;
  return w * h * (aperture.transmission ?? CLEAR_GLASS) * facing * intensity * visible;
}

// Nine equal-area samples on the outer face after clipping to the deep
// reveal. Use actual caster geometry, including cutaway stand-ins. The
// cached result survives lamp and paint edits until the building or sun moves.
export function bindWindowOccluders(ap, THREE, roots, storeyRoot) {
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), last = new THREE.Vector3();
  ray.layers.enableAll();
  const casters = [], hits = [], box = new THREE.Box3();
  let boundsRevision;
  function updateCandidates() {
    boundsRevision = occlusionRevision;
    casters.length = 0;
    const depth = ap.depth + 4.5;
    const face = new THREE.Vector3(ap.x - depth * ap.nx, ap.y - ap.h / 2, ap.z - depth * ap.nz);
    if (storeyRoot) storeyRoot.localToWorld(face);
    for (const root of roots) {
      if (!root) continue;
      root.updateWorldMatrix(true, true);
      root.traverse(o => {
        if (!o.isMesh || !o.castShadow) return;
        if (o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) {
          casters.push(o); // base-geometry bounds need not contain the rendered vertices
          return;
        }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        // Every ray starts on the outer face and travels up and out. Most
        // of a large building is behind this plane and needs no ray tests.
        const x = ap.nx > 0 ? box.min.x : box.max.x, z = ap.nz > 0 ? box.min.z : box.max.z;
        if (box.max.y >= face.y && (x - face.x) * ap.nx + (z - face.z) * ap.nz <= 1e-4) casters.push(o);
      });
    }
  }
  updateCandidates();
  function unobstructed(direction, along, up) {
    const depth = ap.depth + 4.5;
    origin.set(ap.x - depth * ap.nx - along * ap.nz, ap.y + up, ap.z - depth * ap.nz + along * ap.nx);
    if (storeyRoot) storeyRoot.localToWorld(origin);
    ray.set(origin, direction);
    for (const mesh of casters) {
      hits.length = 0;
      if (ray.intersectObject(mesh, false, hits).length) return false;
    }
    return true;
  }
  // Integrate the visible sky over the outward-facing vertical half-plane.
  // Uniform steps in sin(elevation) and azimuth have equal solid angle.
  // One stratified sample per direction on the overlap of the reveal's two
  // faces resolves lintels and overhangs without GPU queries or shadow maps.
  const dir = new THREE.Vector3();
  let total = 0, clearSky = 0;
  for (let row = 0; row < 4; row++) {
    const y = (row + 0.5) / 4, radius = Math.sqrt(1 - y * y);
    for (let col = 0; col < 6; col++) {
      const angle = Math.PI * ((col + 0.5) / 6 - 0.5);
      const facing = radius * Math.cos(angle), tangent = radius * Math.sin(angle);
      total += facing;
      const shift = ap.depth / facing, dx = tangent * shift, dy = y * shift;
      const w = ap.w - Math.abs(dx), h = ap.h - dy;
      if (w <= 0 || h <= 0) continue;
      dir.set(-ap.nx * facing - ap.nz * tangent, y, -ap.nz * facing + ap.nx * tangent);
      const along = dx / 2 + ((row + 0.5) / 4 - 0.5) * w;
      const up = dy / 2 + ((col + 0.5) / 6 - 0.5) * h;
      if (unobstructed(dir, along, up)) clearSky += facing * w * h / (ap.w * ap.h);
    }
  }
  ap.skyView = clearSky / total;
  if (ap.area > 0) {
    ap.fullBaseI = ap.area * ap.skyView / spotFlux(1, WINDOW_ANGLE, WINDOW_PENUMBRA);
    ap.baseI = ap.fullBaseI * ap.transmission;
  }
  let visibility, revision;
  ap.sunVisibility = function (direction, shiftX, shiftY, w, h) {
    if (revision === occlusionRevision && last.equals(direction)) return visibility;
    revision = occlusionRevision;
    last.copy(direction);
    if (boundsRevision !== revision) updateCandidates();
    else for (const root of roots) root?.updateWorldMatrix(true, true);
    let clear = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (unobstructed(direction, shiftX / 2 + i * w / 3, shiftY / 2 + j * h / 3)) clear++;
      }
    }
    visibility = clear / 9;
    return visibility;
  };
}

// Vertical-plane irradiance of the upper sky dome, approximated by a
// cosine-weighted angular mean of the PMREM sky gradient (upper hemisphere
// subtends π/2 projected steradians). This excludes the directional disc.
export function windowSkyRGB(zen, hor, envStrength, halo = 0, sunColor) {
  return ["r", "g", "b"].map(k => envStrength * (Math.PI / 2 * (0.55 * 0.58578 * zen[k] + 0.6 * 0.41422 * hor[k]) + halo * (sunColor?.[k] || 0)));
}

// Photo mode's worker multiplies incoming sky channels by SKY_SCALE=1.35.
// Give it the same linear zenith, horizon and nadir as the PMREM source.
export function plannerTracerSky(zen, hor, ground, envStrength, twilight) {
  const scale = envStrength / 1.35;
  return {
    zenith: [zen.r, zen.g, zen.b].map(c => c * 0.55 * scale),
    horizon: [hor.r, hor.g, hor.b].map(c => c * 0.6 * scale),
    ground: [ground.r * 0.9, ground.g, ground.b * 0.8].map(c => c * 0.75 * scale),
    night: 1 - twilight,
  };
}

/* Per-opening frame profile. Every field is optional on the opening object —
   an old scene (or one never touched in the inspector) falls back to the
   dimensions that used to be hard-coded here, so nothing shifts on load.
   jamb/head/sillW are the visible frame widths per direction (cm); depth is
   how far the frame stands proud of the wall (total extra thickness); mull is
   the divider (mullion) thickness with mullV/mullH counts. */
export function frameSpec(o) {
  var isWin = o.type === "window";
  var n = function (v, d) { return v != null && isFinite(v) ? Math.max(0, +v) : d; };
  return {
    jamb: n(o.frJamb, o.type === "door" || isWin ? 3 : 0),
    head: n(o.frHead, o.type === "door" || isWin ? 3 : 0),
    sillW: n(o.frSillW, isWin ? 3 : 0),
    depth: n(o.frDepth, 1.6),
    mull: n(o.frMull, isWin ? 2 : 0),
    mullV: o.frMullV != null ? Math.max(0, Math.round(o.frMullV)) : isWin ? 1 : 0,
    mullH: o.frMullH != null ? Math.max(0, Math.round(o.frMullH)) : 0,
  };
}
