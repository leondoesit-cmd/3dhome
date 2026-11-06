/* The 3D view's game renderer quality, avatar and walk mode, split out of
   js/view3d.js. It shares the editor's state through live imports from
   ../view3d.js. */
import { createCameraSweep } from "../camera_sweep.js";
import { switchFloorAndWait } from "../floors.js";
import { contentBounds, detectRooms, usedNodes, wallById, wallPointAt } from "../geometry.js";
import { isLayerGhosted, isLayerVisible } from "../layers.js";
import { moveSurveyWalker, navigationFloorTransition, navigationPosition } from "../navigation_geometry.js";
import { cameraRetraction, navigationProfile } from "../navigation_profile.js";
import { materialById } from "../pbr_material.js";
import { box, cyl, floorTexture, polyMesh, sph } from "../primitives.js";
import { siteLayout } from "../site_dressing.js";
import { hitSlabOpening } from "../slab_openings.js";
import { S, clamp, fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import { setSize } from "../view3d/gizmo_env.js";
import { layerRoots } from "../view3d/items_layers.js";
import { fitPracticalLights } from "../view3d/lighting.js";
import { upd } from "../view3d/see_through.js";
import { cutH, houseBounds } from "../view3d/site_cutaway.js";
import {
  EYE_H, avatar, camera, cameraAt, cameraBoom, cameraSweep, dyn, freeMove,
  keys, pitch, ready3D, renderer, requestShadowUpdate, scene,
  setGameRenderEffect, set_EYE_H, set_avatar, set_cameraAt, set_cameraBoom,
  set_cameraSweep, set_freeMove, set_gameRendererLock, set_keys,
  set_needsRender, set_pitch, set_siteDressRef, set_tpDist, set_usePost,
  set_walk, set_walkFloorPending, set_walkPos, set_walkView, set_yaw,
  structureRoot, surfaceMaterial, touchMove, tpDist, walk, walkControls,
  walkFloorPending, walkPos, walkView, yaw,
} from "../view3d.js";

// Night Shift (and any other live first-person mode) cannot reuse the CAD
// quality stack. A 14" M2 Pro panel is ~3024×1964 CSS pixels; 2× DPR + GTAO +
// TRAA + a 4096² sun map is a still-view budget, and it freezes the moment
// dozens of articulated rigs start moving. Cap pixel ratio, skip post, and
// only pay for shadows the flashlight actually casts.
export function setGameRendererQuality(quality) {
  set_gameRendererLock(true);
  if (!renderer) return;
  quality = Math.round(Math.max(0, Math.min(2, Number(quality) || 0)));
  var ratio = quality >= 2 ? 1.25 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  renderer.shadowMap.enabled = quality > 0;
  set_usePost(false);
  var canvas = renderer.domElement;
  setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  fitPracticalLights(); // a game redraws every casting light each frame
  requestShadowUpdate();
}

export function clearGameRendererQuality() {
  setGameRenderEffect(null);
  set_gameRendererLock(false);
  fitPracticalLights();
}

// simple stylized human, built once and parented to the scene (not `dyn`,
// so it survives geometry rebuilds). Local +Z is "forward".
function buildAvatar() {
  if (avatar || !scene) return;
  set_avatar(new THREE.Group());
  var skin = 0xe8b48c,
    shirt = 0x3d6ea5,
    pants = 0x394a5a,
    hair = 0x3a2c22;
  // legs
  cyl(avatar, -6, 24, 0, 6, 48, pants, { rough: 0.85, metal: 0 });
  cyl(avatar, 6, 24, 0, 6, 48, pants, { rough: 0.85, metal: 0 });
  // torso (tapered a touch at the shoulders)
  cyl(avatar, 0, 78, 0, 15, 60, shirt, { rough: 0.8, metal: 0, r2: 17 });
  // arms
  cyl(avatar, -19, 78, 0, 4.5, 54, shirt, { rough: 0.8, metal: 0 });
  cyl(avatar, 19, 78, 0, 4.5, 54, shirt, { rough: 0.8, metal: 0 });
  // head + hair + a small nose to read facing direction
  sph(avatar, 0, 122, 0, 12, skin, { rough: 0.7 });
  sph(avatar, 0, 128, -2, 12.5, hair, { rough: 0.9 });
  sph(avatar, 0, 120, 12, 2.6, skin, { rough: 0.7 });
  avatar.visible = false;
  scene.add(avatar);
}

function walkLook() {
  const profile=navigationProfile(S);
  set_EYE_H(profile.eyeHeight);
  set_needsRender(true);
  // mirror the pose for the 2D plan's you-are-here indicator (plan2d listens
  // for walk:look and repaints, rAF-throttled)
  S.walk2D = walk
    ? { x: walkPos.x, z: walkPos.z, yaw: yaw, tp: walkView === "tpv" }
    : null;
  window.dispatchEvent(new Event("walk:look"));
  var lookDist = 400,
    dx = Math.cos(pitch) * Math.sin(yaw),
    dy = Math.sin(pitch),
    dz = Math.cos(pitch) * Math.cos(yaw);
  var eyeX = walkPos.x,
    eyeY = walkPos.y + EYE_H,
    eyeZ = walkPos.z;
  if (avatar) {
    avatar.visible = walk && walkView === "tpv";
    avatar.position.set(walkPos.x, walkPos.y, walkPos.z);
    avatar.rotation.y = yaw; // local +Z faces (sin yaw, cos yaw)
  }
  if (walk && walkView === "tpv") {
    // orbit the camera behind the avatar, aiming at its torso and sitting a bit
    // above the sightline for a nice over-the-shoulder framing of the whole body;
    // retract against physical geometry along the camera boom
    var pX = walkPos.x,
      pY = walkPos.y + 95, // torso pivot
      pZ = walkPos.z;
    var elev = 45; // lift the camera above the sightline
    var cx = pX - dx * tpDist,
      cy = pY - dy * tpDist + elev,
      cz = pZ - dz * tpDist;
    const pivot=new THREE.Vector3(pX,pY,pZ), desired=new THREE.Vector3(cx,cy,cz);
    const direction=desired.clone().sub(pivot), desiredDistance=direction.length();
    direction.normalize();
    let allowed=desiredDistance;
    if(!freeMove&&dyn){
      cameraSweep || (set_cameraSweep(createCameraSweep(THREE)));
      allowed=cameraSweep.distance(layerRoots().map(e=>e.root),pivot,direction,desiredDistance,profile.cameraRadius);
    }
    const now=performance.now();
    set_cameraBoom(cameraRetraction(cameraBoom,allowed,desiredDistance,Math.min(.1,(now-cameraAt)/1000)));set_cameraAt(now);
    const safe=pivot.addScaledVector(direction,cameraBoom);cx=safe.x;cy=safe.y;cz=safe.z;
    S.cameraObstructed=allowed<desiredDistance-1;
    camera.position.set(cx, cy, cz);
    camera.lookAt(pX, pY, pZ);
  } else {
    S.cameraObstructed=false;
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(eyeX + dx * lookDist, eyeY + dy * lookDist, eyeZ + dz * lookDist);
  }
}
function moveWalk(dt) {
  if(document.documentElement.dataset.plannerViewport==='plan'||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){for(const key of Object.keys(keys))keys[key]=false;return;}
  const profile=navigationProfile(S);
  set_tpDist(profile.cameraDistance);
  var spd = profile.speed * Math.min(.05,Math.max(0,dt||0)),
    fx = Math.sin(yaw),
    fz = Math.cos(yaw),
    rx = -Math.cos(yaw),
    rz = Math.sin(yaw),
    mx = 0,
    mz = 0;
  if (keys.fwd) {
    mx += fx;
    mz += fz;
  }
  if (keys.back) {
    mx -= fx;
    mz -= fz;
  }
  if (keys.right) {
    mx += rx;
    mz += rz;
  }
  if (keys.left) {
    mx -= rx;
    mz -= rz;
  }
  if (touchMove.z || touchMove.x) {
    mx += fx * -touchMove.z + rx * touchMove.x;
    mz += fz * -touchMove.z + rz * touchMove.x;
  }
  if ((mx || mz) && !walkFloorPending) {
    var l = Math.hypot(mx, mz) || 1;
    var dx = (mx / l) * spd;
    var dz = (mz / l) * spd;
    var curX = walkPos.x, curZ = walkPos.z, nx, nz;
    const next=freeMove?{x:curX+dx,y:walkPos.y,z:curZ+dz}:moveSurveyWalker(S,walkPos,dx,dz,profile,detectRooms());
    nx=next.x;nz=next.z;walkPos.y=next.y;
    walkPos.x = nx;
    walkPos.z = nz;
    const landing=freeMove?null:navigationFloorTransition(S,walkPos,profile);
    if(landing){
      set_walkFloorPending(true);
      switchFloorAndWait(landing.floorId).then(floor=>{
        if(floor&&walk){set_walkPos(landing.position);S.dirty3D=true;walkLook();}
      }).catch(error=>console.error("Walking floor transition failed",error))
        .finally(()=>{set_walkFloorPending(false);});
    }
    walkLook();
  } else if(walkView==='tpv')walkLook();
}
// the walker's body stops at the curb, not with its centre over the drop
function voidBlocked(x, z) {
  if (freeMove) return false;
  return !!hitSlabOpening(x, z, 16);
}
// bounds of the wall footprint from centerlines only (no furniture padding,
// unlike contentBounds) — this is the interior the person/camera must stay in
function interiorBounds() {
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !fin(n.x) || !fin(n.z)) continue;
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  if (!any || maxx - minx < 1 || maxz - minz < 1) return null;
  return { minx: minx, minz: minz, maxx: maxx, maxz: maxz };
}
// keep the person inside the building footprint (walls block; furniture never
// does). In free-move / no-clip the person can pass through walls too.
function clampWalk() {
  if (freeMove) return;
  var bb = interiorBounds();
  if (!bb) return;
  var m = 22;
  walkPos.x = clamp(walkPos.x, bb.minx + m, bb.maxx - m);
  walkPos.z = clamp(walkPos.z, bb.minz + m, bb.maxz - m);
}
export function isWalk() {
  return walk;
}
export function isFreeMove() {
  return freeMove;
}
export function toggleFreeMove() {
  set_freeMove(!freeMove);
  return freeMove;
}
export function walkViewMode() {
  return walkView;
}
export function toggleWalkView() {
  if (!walk) return walkView;
  set_walkView(walkView === "fpv" ? "tpv" : "fpv");
  walkLook();
  return walkView;
}
export function toggleWalk(on) {
  if (!ready3D) return false;
  set_walk(on == null ? !walk : !!on);
  // walking needs full-height walls; leaving walk puts the dollhouse cut back
  if (S.cutaway && S.cutaway.on) S.dirty3D = true;
  set_keys({}); // drop any keys held from before (prevents "stuck" movement)
  touchMove.x = touchMove.z = 0;
  if (walkControls) walkControls.hidden = !walk;
  if (walk) {
    buildAvatar();
    var ib = interiorBounds(),
      bb = contentBounds();
    set_walkPos(ib
      ? { x: (ib.minx + ib.maxx) / 2, y: 0, z: (ib.minz + ib.maxz) / 2 }
      : { x: bb.cx, y: 0, z: bb.cz });
    if(!navigationPosition(S,walkPos,navigationProfile(S),detectRooms()).clear){
      const rooms=detectRooms();let found=null;
      for(const room of rooms){for(const p of room.pts){const candidate={x:(p.x+room.cx)/2,y:0,z:(p.z+room.cz)/2};if(navigationPosition(S,candidate,navigationProfile(S),rooms).clear){found=candidate;break;}}if(found)break;}
      if(found)set_walkPos(found);
    }
    const support=navigationPosition(S,walkPos,navigationProfile(S),detectRooms());
    if(support.clear)walkPos.y=support.y;
    set_yaw(Math.PI);
    set_pitch(0);
    set_tpDist(navigationProfile(S).cameraDistance);
    walkLook();
  } else {
    if (avatar) avatar.visible = false;
    S.walk2D = null;
    window.dispatchEvent(new Event("walk:look"));
    upd();
  }
  return walk;
}

/* MEP X-ray (see-through walls/floor/ceiling) exists to show the services
   buried in them, so it applies only while the services layer is shown: with
   the layer hidden it would just leave the floors glass over the lawn. */
function mepXray(part) {
  var x = S.mep && S.mep.xray;
  if (!x || !(isLayerVisible("mep") || isLayerGhosted("mep"))) return false;
  if (part === "walls") return typeof x === "object" ? !!x.walls : !!x;
  return typeof x === "object" && !!x[part];
}

function buildSiteDressing(streetView) {
  set_siteDressRef(null);
  // applySite() hides it again under an aerial photo
  if (!isFinite(cutH()) || streetView) return;
  var hb = houseBounds();
  if (!hb) return;
  var doors = [];
  S.openings.forEach(function (o) {
    if (o.type !== "door" && o.type !== "passage") return;
    var w = wallById(o.wall), p = w && wallPointAt(w, o.s);
    if (p) doors.push({ x: p.x, z: p.z });
  });
  var lay = siteLayout(hb, doors), g = new THREE.Group();
  g.userData.role = "site";
  var pv = lay.paving,
    pm = polyMesh([{ x: pv.x0, z: pv.z0 }, { x: pv.x1, z: pv.z0 }, { x: pv.x1, z: pv.z1 }, { x: pv.x0, z: pv.z1 }],
      -1.2, 180, surfaceMaterial(materialById("floor_pavers")) ||
        new THREE.MeshStandardMaterial({ map: floorTexture("pavers"), roughness: 0.88, metalness: 0 }));
  if (pm) {
    pm.receiveShadow = true;
    pm.castShadow = false;
    pm.userData.role = "site";
    g.add(pm);
  }
  var HEDGE_C = 0x4d6b33, LEAF_C = 0x5b7a3c;
  lay.hedges.forEach(function (h) {
    var m = box(g, h.x0, h.x1, -2.5, 70, h.z0, h.z1, HEDGE_C, { rough: 0.95 });
    if (m) m.userData.role = "site";
    // a clipped hedge is not a slab: lumps along its top
    var along = h.x1 - h.x0 >= h.z1 - h.z0, len = along ? h.x1 - h.x0 : h.z1 - h.z0,
      n = Math.max(1, Math.round(len / 40)), r = Math.min(h.x1 - h.x0, h.z1 - h.z0) * 0.5;
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n,
        x = along ? h.x0 + len * f : (h.x0 + h.x1) / 2,
        z = along ? (h.z0 + h.z1) / 2 : h.z0 + len * f;
      var sp = sph(g, x, 64, z, r, i % 2 ? HEDGE_C : LEAF_C, { rough: 0.95 });
      if (sp) sp.userData.role = "site";
    }
  });
  var L = lay.lawn;
  [[L.x0 + 150, L.z0 + 150], [L.x1 - 150, L.z0 + 150], [L.x0 + 150, L.z1 - 150], [L.x1 - 150, L.z1 - 150]].forEach(function (c, i) {
    var t = cyl(g, c[0], 95, c[1], 12, 190, 0x5a4432, { rough: 0.9 });
    if (t) t.userData.role = "site";
    [[0, 230, 0, 95], [-45, 200, 30, 70], [40, 205, -25, 72], [10, 285, 15, 62]].forEach(function (b) {
      var s = sph(g, c[0] + b[0], b[1], c[1] + b[2], b[3] * (0.9 + 0.1 * (i % 2)), i % 2 ? 0x587a3a : 0x4e7033, { rough: 0.95 });
      if (s) s.userData.role = "site";
    });
  });
  structureRoot.add(g);
  set_siteDressRef(g);
}

export { buildSiteDressing, mepXray, moveWalk, walkLook };
