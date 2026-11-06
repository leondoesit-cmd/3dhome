/* The 3D view's shadow walls, layer roots, ghosts, furniture cache and item
   sync, split out of js/view3d.js. It shares the editor's state through live
   imports from ../view3d.js. */
import { buildBlueprintUnderlay3D } from "../blueprint_3d.js";
import { updateCabinetRuntimeMesh } from "../cabinet_mesh.js";
import { createPreciseBoundsCache } from "../core/precise_bounds_cache.js";
import { refreshRuntimePlacements } from "../core/runtime.js";
import { createWallBuildKeys } from "../core/wall_build_key.js";
import { FURN } from "../furniture.js";
import { contentBounds, detectRooms, hiddenSets, roomByKey, roomFloor, roomHidden, roomName, wallById, wallGeom, wallPointAt, wallTangentAt } from "../geometry.js";
import { legacyIntensity } from "../gpu.js";
import { isLayerGhosted, isLayerVisible, layerRank } from "../layers.js";
import { buildMEP3D } from "../mep.js";
import { legacyFloorKey, legacyTextureUrl, materialById, pbrEntryFor, textureMisses } from "../pbr_material.js";
import { clearPhysics, isPhysicsEnabled } from "../physics_facade.js";
import { box, floorTexture, groundTexture, polyMesh, worldUVs } from "../primitives.js";
import { roofMeshTriangles } from "../roof.js";
import { holesForRoom, openingCorners, slabOpenings } from "../slab_openings.js";
import { FLOOR, S, TILE, WALLC, WALL_T, clamp } from "../state.js";
import { buildSurveyGeometry } from "../survey_mesh.js";
import { getTexturePresetBumpUrl } from "../textures.js";
import { THREE } from "../three_lazy.js";
import { itemUserVis } from "../user_layers.js";
import { applySite } from "../view3d/gizmo_env.js";
import { buildBounceLights, fitPracticalLights, initPhysicsForScene, roomContaining, roomReach, schedulePrewarm } from "../view3d/lighting.js";
import { settleSeeFades, updateSeeThrough, warmFadePipelines } from "../view3d/see_through.js";
import { cutH, cutH0, makeShadowOnly } from "../view3d/site_cutaway.js";
import { buildSiteDressing, mepXray } from "../view3d/walk_mode.js";
import { buildItem, buildWall, hasHeightMismatchedJoin, placeItem, releaseItemLights, releaseLight, takeLight } from "../view3d/wall_build.js";
import { normalizeWallKind, normalizeWallProfile } from "../wall_curves.js";
import { ensureWallTypes } from "../wall_types.js";
import {
  GHOST_OPACITY, catalogRev, dyn, gameRendererLock, itemCache, itemsRoot,
  markShadowRegion, mepRoot, plannerShadowsEnabled, ready3D, renderer,
  retireGroup, reusableWalls, scene, seeStubs, selectionBoundsCache,
  set_buildingShadowWalls, set_drawingHoverObj, set_drawingWalls,
  set_groundPlaneRef, set_itemsRoot, set_mepRoot, set_needsRender,
  set_reusableWalls, set_selectionBoundsCache, set_shadowRoot,
  set_shadowStandIns, set_shadowsDirty, set_shadowsFromRebuild,
  set_structureRoot, set_stubRoot, set_wallBuildArgs, set_windowLights,
  shadowRoot, structureRoot, stubRoot, surfaceMaterial, svBox, wallBuildArgs,
  windowLights,
} from "../view3d.js";

/* Rebuild the walls a dollhouse cut lowered at their full height, into
   shadowRoot. The builders add straight to structureRoot and register door
   pivots, so both are redirected for the duration. */
function buildShadowWalls(hid) {
  var keepRoot = structureRoot, doorCount = scene.doors ? scene.doors.length : 0;
  var tmp = new THREE.Group();
  set_structureRoot(tmp);
  set_buildingShadowWalls(true);
  try {
    S.walls.forEach(function (w) {
      if (hid.walls[w.id] || !(w.height > cutH0())) return;
      buildWall(w, WALLC, null);
    });
  } finally {
    set_buildingShadowWalls(false);
    set_structureRoot(keepRoot);
    if (scene.doors) scene.doors.length = doorCount;
  }
  tmp.children.slice().forEach(function (g) { shadowRoot.add(makeShadowOnly(g)); });
}

/* Which layer id each root answers to. Kept as a function rather than a table
   because the roots are re-created on every rebuild and a captured reference
   would go stale after the first one. */
function layerRoots() {
  return [
    { id: "structure", root: structureRoot },
    { id: "furniture", root: itemsRoot },
    { id: "mep", root: mepRoot },
  ];
}

/* The roots a planner ray may touch at exactly this rank — 0 for the work set,
   1 for everything else the user can currently see. Rank Infinity (ghosted or
   hidden) is never returned by either call, and that exclusion has to happen
   HERE rather than through `root.visible`: THREE.Raycaster does not test
   `visible` at all — `intersect()` in vendor/three/three.core.js checks only
   `object.layers` before calling `raycast`, then recurses into every child
   regardless — which is why the hit loops below filter `h.object.visible` by
   hand, and why an invisible root would otherwise still return hits. */
function pickableRoots(rank) {
  var out = [];
  layerRoots().forEach(function (e) {
    if (e.root && layerRank(e.id) === rank) out.push(e.root);
  });
  return out;
}

function ghostSwap(root, on) {
  if (!root) return;
  root.traverse(function (o) {
    if (!o.material) return;
    var base = o.userData.ghostBase;
    if (on) {
      if (base) return; // already ghosted — never clone a clone
      o.userData.ghostBase = o.material;
      var ghosts = [].concat(o.material).map(function (m) {
        var c = m.clone();
        c.transparent = true;
        c.opacity = Math.min(c.opacity, GHOST_OPACITY);
        // a ghost that writes depth hides whatever it is meant to be revealing
        c.depthWrite = false;
        return c;
      });
      o.material = Array.isArray(o.userData.ghostBase) ? ghosts : ghosts[0];
    } else {
      if (!base) return;
      [].concat(o.material).forEach(function (m) {
        m.dispose();
      });
      o.material = base;
      delete o.userData.ghostBase;
    }
  });
}

/* The same swap, but remembering on the root itself which way round it already
   is. applyLayers3D() runs on every piecewise item update — the per-frame path
   a 3D drag takes — and an unconditional traverse of the whole model there
   would hand back with one hand what the layer split just saved with the
   other. `ghostHeld` makes the overwhelmingly common no-op case a flag read.

   Only ROOTS carry the flag. The one caller that works on a subtree instead
   (dropItem) reaches for ghostSwap() directly, because there is no flag to
   consult there and the traverse is a single item group wide. */
function ghostRoot(root, on) {
  if (!root) return;
  on = !!on;
  if (!!root.userData.ghostHeld === on) return;
  // a near wall mid-fade wears clones of its own: hand them back first
  if (root === structureRoot) settleSeeFades();
  ghostSwap(root, on);
  root.userData.ghostHeld = on;
}

/* Push the layer table's visibility onto the three roots. Hidden hides the
   whole subtree; ghosted still draws, faintly. Neither state is pickable —
   layerRank returns Infinity for both and pickableRoots drops the root — so
   this function only has to get the PICTURE right.

   Exported because the layer UI has to call it: nothing here polls, and the
   scene is rendered on demand. rebuild3D calls it too, since structureRoot and
   mepRoot are new objects after every rebuild and start out plain. */
export function applyLayers3D() {
  layerRoots().forEach(function (e) {
    if (!e.root) return;
    e.root.visible = isLayerVisible(e.id) || isLayerGhosted(e.id);
    ghostRoot(e.root, isLayerGhosted(e.id));
  });
  // a ghost swap hands a faded near wall's clones back: fade it again
  updateSeeThrough(true);
  // ...and un-ghosting the Furniture layer hands back a faded user layer's
  itemCache.forEach(function (c) {
    if (c.g.userData.userGhost || (c.g.userData.item && c.g.userData.item.ulayer)) syncUserGhost(c.g);
  });
  set_needsRender(true);
}

function selected3DBox() {
  if (!S.sel || !dyn) return null;
  var box = new THREE.Box3(), found = false;
  function addObject(o) {
    if (!o) return;
    if (!selectionBoundsCache) set_selectionBoundsCache(createPreciseBoundsCache(THREE));
    box.union(selectionBoundsCache.bounds(o));
    found = true;
  }
  if (S.sel.kind === "item") {
    var one = itemCache.get(S.sel.ref && S.sel.ref.id);
    addObject(one && one.g);
  } else if (S.sel.kind === "items") {
    (S.sel.refs || []).forEach(function (it) {
      var c = itemCache.get(it && it.id);
      addObject(c && c.g);
    });
  } else if (S.sel.kind === "walls") {
    var selectedWalls = new Set(S.sel.refs || []);
    dyn.traverse(function (o) {
      if (o.userData && selectedWalls.has(o.userData.wall)) addObject(o);
    });
  } else if (S.sel.kind === "wall" || S.sel.kind === "opening") {
    var field = S.sel.kind, ref = S.sel.ref;
    dyn.traverse(function (o) {
      if (o.userData && o.userData[field] === ref) addObject(o);
    });
  } else if (S.sel.kind === "room") {
    var room = roomByKey(S.sel.ref), pts = room && room.nidx && room.nidx.map(function (i) { return S.nodes[i]; }).filter(Boolean);
    if (pts && pts.length) {
      var minx = Math.min.apply(null, pts.map(function (p) { return p.x; })),
        maxx = Math.max.apply(null, pts.map(function (p) { return p.x; })),
        minz = Math.min.apply(null, pts.map(function (p) { return p.z; })),
        maxz = Math.max.apply(null, pts.map(function (p) { return p.z; }));
      box.set(new THREE.Vector3(minx, 2, minz), new THREE.Vector3(maxx, 8, maxz));
      found = true;
    }
  }
  if (!found || box.isEmpty()) return null;
  return box.expandByScalar(2);
}

function itemSig(it) {
  try {
    // Canonical definitions can change independently of their placed item.
    // Include their complete data so an explicit build request cannot retain
    // stale geometry, derived bounds or rules after a definition edit.
    return catalogRev + "|" + JSON.stringify({ item: it, definition: S.parametric?.definitions?.[it.definitionId] }, function (k, v) {
      // only the piece's OWN placement is transform-only. A nested x/z inside a
      // custom model's part list genuinely changes its shape, so `this === it`
      // keeps the exclusion to the top level.
      return this === it && (k === "x" || k === "z" || k === "rot") ? 0 : v;
    });
  } catch (e) {
    return null; // unserialisable -> never matches, so it always rebuilds
  }
}

function disposeSubtree(o) {
  o.traverse(function (c) {
    if (c.geometry) c.geometry.dispose();
    if (c.material)
      [].concat(c.material).forEach(function (m) {
        m.dispose();
      });
  });
}

function dropItem(id) {
  var c = itemCache.get(id);
  if (!c) return;
  // same trap as rebuild3D: while the furniture layer is ghosted every mesh
  // here points at a clone, and disposing that would strand the original
  ghostSwap(c.g, false);
  itemsRoot.remove(c.g);
  releaseItemLights(c.g);
  disposeSubtree(c.g);
  itemCache.delete(id);
}

// Rebuild one piece and (re)cache it. The signature is taken AFTER the build so
// that a builder which annotates its item doesn't make the entry miss forever.
function buildAndCache(it) {
  dropItem(it.id);
  var missed = textureMisses();
  var g = buildItem(it);
  if (g) itemCache.set(it.id, { g: g, sig: itemSig(it), catalogRev: catalogRev, missedTexture: textureMisses() !== missed });
  return g;
}

// Reconcile itemsRoot against S.items: build what is new or changed, drop what
// is gone or hidden, and merely re-transform everything else.
function syncItems(hid) {
  var live = {};
  S.items.forEach(function (it) {
    if (hid.items[it.id]) return;
    live[it.id] = 1;
    var c = itemCache.get(it.id);
    if (c && c.sig != null && c.sig === itemSig(it)) {
      placeItem(c.g, it);
      syncUserGhost(c.g);
      return;
    }
    var g = buildAndCache(it);
    if (g) syncUserGhost(g);
  });
  Array.from(itemCache.keys()).forEach(function (id) {
    if (!live[id]) dropItem(id);
  });
}

/* A piece on a faded user layer (js/user_layers.js) is ghosted on its own,
   with the same clone-and-park swap the Furniture layer's ghost uses. The two
   share the meshes: the layer ghost skips a mesh that is already ghosted, and
   un-ghosting the layer hands every clone back, so applyLayers3D() runs this
   again for every cached piece afterwards. */
function syncUserGhost(g) {
  var it = g && g.userData.item;
  var want = !!(it && it.ulayer && itemUserVis(it) === "ghost");
  if (want) {
    ghostSwap(g, true);
    g.userData.userGhost = true;
  } else if (g && g.userData.userGhost) {
    g.userData.userGhost = false;
    if (!(itemsRoot && itemsRoot.userData.ghostHeld)) ghostSwap(g, false);
  }
}

/* Drain S.items3D — the cheap path a drag or an inspector edit uses instead of
   S.dirty3D. Anything it cannot do piecewise escalates to a full rebuild. */
function applyItemOps() {
  schedulePrewarm(); // new or changed pieces: their shaders for the other shadow sets
  // nothing has been built yet — there is no cached group to update
  if (!itemsRoot) {
    S.items3D.clear();
    S.dirty3D = true;
    return;
  }
  var byId = {};
  S.items.forEach(function (it) {
    byId[it.id] = it;
  });
  var escalate = false, region = new THREE.Box3(), lampMoved = false;
  S.items3D.forEach(function (mode, id) {
    var it = byId[id],
      c = itemCache.get(id);
    // no live item, or nothing cached to update (e.g. the piece is inside a
    // hidden room) — only the full path knows what to do
    if (!it || !c) {
      escalate = true;
      return;
    }
    // where the piece was and where it lands: both shadows change
    region.union(new THREE.Box3().setFromObject(c.g));
    if (FURN[it.type] && FURN[it.type].lamp) lampMoved = true;
    if (mode === "move") placeItem(c.g, it);
    else {
      var signature = itemSig(it);
      if (signature != null && signature === c.sig) placeItem(c.g, it);
      else if (c.catalogRev === catalogRev && updateCabinetRuntimeMesh(c.g, it)) {
        placeItem(c.g, it);
        c.sig = itemSig(it);
      } else if (!buildAndCache(it)) escalate = true;
    }
    var now = itemCache.get(id);
    if (now) region.union(new THREE.Box3().setFromObject(now.g));
  });
  S.items3D.clear();
  /* A lamp carried into another room, or out of the house, takes its range
     clip and its shadow with it: left alone it kept the old room's settings
     and lit the rooms through the walls from outside. */
  if (lampMoved) fitPracticalLights();
  markShadowRegion(region);
  set_needsRender(true);
  /* A piece rebuilt on this path arrives with fresh, solid materials, so a
     ghosted furniture layer has to be re-applied over it. ghostRoot's flag
     already reads "ghosted", so go through ghostSwap — it skips every mesh
     that still holds a ghostBase and therefore only touches the new ones. */
  if (isLayerGhosted("furniture")) ghostSwap(itemsRoot, true);
  // physics owns item transforms while it runs, and bodies are built per
  // rebuild — hand back to the full path rather than desyncing them
  if (escalate || isPhysicsEnabled()) S.dirty3D = true;
}

// Zero opacity keeps the camera and AO pass clear. The renderer's shadow
// override uses opaque depth for these untextured, double-sided surfaces.
function plannerCeilingMaterial(xray) {
  // An opaque ceiling gets the baked paint (polyMesh uv: one unit per 160 cm).
  if (S.showCeiling && !xray) {
    var paint = surfaceMaterial(materialById("ceiling_paint"), {
      repeat: [160 / 200, 160 / 200], tint: 0xf3efe6, side: THREE.DoubleSide,
    });
    if (paint) return paint;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xf3efe6, roughness: 0.96, side: THREE.DoubleSide,
    transparent: !S.showCeiling || xray,
    opacity: xray ? 0.18 : S.showCeiling ? 1 : 0,
    depthWrite: !!S.showCeiling && !xray,
  });
}

function renewWallMaterials(group) {
  // Opaque draws sort by material id. Retaining old ids between newly built
  // walls changes coplanar edge/depth ordering and therefore GTAO/TRAA pixels.
  // Allocate materials in builder order, retaining the costly vertex buffers.
  // Park originals on the retired parent until the replacements have drawn,
  // preserving the shader cache lifetime used by the full rebuild path.
  var retiredMaterials = new THREE.Object3D();
  retiredMaterials.material = [];
  group.traverse(function (object) {
    if (!object.material) return;
    var originals = [].concat(object.material);
    retiredMaterials.material.push.apply(retiredMaterials.material, originals);
    var replacements = originals.map(function (material) { return material.clone(); });
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
  });
  group.parent.add(retiredMaterials);
}
function reusableWallKey(w, color, texture, keyForWall) {
  // Openings, framing, curved/profiled walls, live physics and textured finishes
  // retain the established builder until their additional lifecycles are covered.
  if (isPhysicsEnabled() || gameRendererLock || texture ||
      normalizeWallKind(w) !== 'normal' || wallGeom(w).kind !== 'line' ||
      normalizeWallProfile(w).length || hasHeightMismatchedJoin(w) ||
      S.openings.some(function (o) { return String(o.wall) === String(w.id); })) return null;
  var type = S.wallTypes.find(function (entry) { return entry.id === w.wallTypeId; });
  var bands = w.layers && w.layers.length ? w.layers : type && type.layers;
  if (!bands) return null;
  if (bands.some(function (band) { return band.framing || band.role === 'glazing' || /glass/i.test(String(band.material)); })) return null;
  return keyForWall(w, { color: color, cut: String(cutH()), xray: mepXray('walls') });
}
export function rebuild3D() {
  if (!ready3D) return;
  refreshRuntimePlacements(S);
  // Normalize every arm before forming dependency keys (builders normalize too).
  ensureWallTypes(S);
  if (!gameRendererLock) renderer.shadowMap.enabled = plannerShadowsEnabled || !!S.invisibleRoof;
  // geometry is changing — the shadow map and the frame both need a redraw
  // (paced, see rebuildShadowT in the loop)
  set_shadowsDirty(true);
  set_shadowsFromRebuild(true);
  set_needsRender(true);
  S.items3D.clear(); // a full rebuild subsumes every queued per-item update
  clearPhysics();
  if (!itemsRoot) set_itemsRoot(new THREE.Group());
  /* Hand the ghosted materials back before anything is disposed. clearGroup
     disposes what it finds on `o.material`, which while ghosting is a CLONE —
     the original would survive as an orphan. Only the two roots clearGroup is
     about to take are un-ghosted: itemsRoot survives the disposal intact, and
     re-cloning every catalogue material on it once per rebuild would be pure
     churn. applyLayers3D() at the end puts the other two back. */
  settleSeeFades(); // the same goes for a near wall caught mid-fade
  ghostRoot(structureRoot, false);
  ghostRoot(mepRoot, false);
  dyn.remove(itemsRoot); // keep the furniture subtree out of the disposal below
  retireGroup(dyn); // takes the previous structureRoot and mepRoot with it
  set_structureRoot(new THREE.Group());
  set_stubRoot(new THREE.Group());
  stubRoot.userData.physicsRole = "ignore";
  stubRoot.userData.exportSkip = true;
  structureRoot.add(stubRoot);
  set_wallBuildArgs({});
  set_mepRoot(new THREE.Group());
  set_shadowRoot(new THREE.Group());
  shadowRoot.userData.physicsRole = "ignore";
  shadowRoot.userData.exportSkip = true;
  set_shadowStandIns(new WeakMap());
  dyn.add(shadowRoot);
  /* Which layer each root IS, as data rather than as a module-local variable.
     js/blender_export.js walks `dyn` from the outside and has to know where the
     three roots end and the individual walls, slabs and pieces begin; matching
     on "a Group whose children look structural" would break the first time a
     root came back empty. */
  structureRoot.userData.layerRoot = "structure";
  itemsRoot.userData.layerRoot = "furniture";
  mepRoot.userData.layerRoot = "mep";
  dyn.add(structureRoot);
  scene.doors = [];
  var bb = contentBounds();
  /* The lawn grows in 10 m steps, not with every wall move: its texture repeat
     is part of the material, so each new size was a new shader (the lit one
     and one per shadow pass, ~200 ms of every rebuild while a wall was
     dragged). It still reaches at least 4.5 m past the content on every side. */
  var GROUND_STEP_CM = 1000;
  var gw = Math.ceil((bb.w + 900) / GROUND_STEP_CM) * GROUND_STEP_CM,
    gd = Math.ceil((bb.d + 900) / GROUND_STEP_CM) * GROUND_STEP_CM,
    gt = groundTexture();
  gt.repeat.set(gw / 160, gd / 160);
  var lawn = materialById("ground_lawn");
  var gp = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    surfaceMaterial(lawn, { repeat: [gw / lawn.sizeCm, gd / lawn.sizeCm] }) ||
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.97, metalness: 0 }),
  );
  gp.rotation.x = -Math.PI / 2;
  gp.position.set(bb.cx, -2.5, bb.cz);
  gp.receiveShadow = true;
  var st = typeof S !== "undefined" && S.site ? S.site : {};
  var showSV = st.enabled && st.streetView && svBox;
  // Under-floor runs sit below this plane. A transparent room slab alone is
  // insufficient: the opaque site ground would still depth-occlude every pipe.
  gp.visible = !showSV && !mepXray("floor");
  
  gp.userData.role = "ground";
  set_groundPlaneRef(gp); // Save reference for toggling in applySite
  dyn.add(gp);
  buildSiteDressing(showSV);
  var rooms = detectRooms(),
    hid = hiddenSets(rooms),
    matCache = {};
  function fmatFor(t, customTex, customBump) {
    var key = customTex ? "custom_" + customTex : t;
    if (!matCache[key]) {
      // Library material first: a "mat:<id>" finish, or the baked version of
      // this floor type. Not ready yet → the procedural floor below, which a
      // finished load replaces on the rebuild it triggers.
      var floorPbr = customTex ? pbrEntryFor(customTex) : pbrEntryFor("floor:" + t);
      if (floorPbr) {
        var pbrFloor = surfaceMaterial(floorPbr, { side: THREE.DoubleSide, envMapIntensity: 0.7 });
        if (pbrFloor) {
          matCache[key] = pbrFloor;
          return pbrFloor;
        }
        if (customTex) {
          var legacyKey = legacyFloorKey(floorPbr);
          if (legacyKey) { t = legacyKey; customTex = null; }
          else customTex = legacyTextureUrl(floorPbr);
        }
      }
      // per-material sheen so polished floors reflect the environment (IBL) like a showroom
      var FLOOR_ROUGH = {
        epoxy: 0.12,
        marble: 0.18,
        marbleDark: 0.2,
        porcelain: 0.28,
        granite: 0.3,
        // oiled/matte boards: a lacquer-bright sky reflection seen from above
        // bleaches the grain out of a wood floor
        wood: 0.62,
        laminate: 0.6,
        darkwood: 0.58,
        parquet: 0.55,
        tiles: 0.25,
        terrazzo: 0.25,
        slate: 0.62,
        pebble: 0.7,
        brick: 0.8,
        deck: 0.8,
        concrete: 0.75,
        pavers: 0.85,
        balcony: 0.7,
        carpet: 0.95,
        carpetGrey: 0.95,
      };
      var mat = new THREE.MeshStandardMaterial({
        roughness: customTex ? 0.55 : FLOOR_ROUGH[t] != null ? FLOOR_ROUGH[t] : 0.65,
        metalness: 0.04,
        envMapIntensity: 0.7,
        side: THREE.DoubleSide,
      });
      var bumpScale = customBump != null ? customBump : 0.20;

      if (customTex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[customTex]) {
          var tx = new THREE.TextureLoader().load(customTex, function() { S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
          S.customTexCache[customTex] = tx;
        }
        mat.map = S.customTexCache[customTex];
        mat.color.setHex(0xffffff);

        try {
          var bumpUrl = getTexturePresetBumpUrl(customTex);
          if (bumpUrl) {
            if (!S.customBumpCache) S.customBumpCache = {};
            if (!S.customBumpCache[bumpUrl]) {
              var bloader = new THREE.TextureLoader();
              bloader.setCrossOrigin("anonymous");
              var btx = bloader.load(bumpUrl, function() { S.repaint3D = true; });
              btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
              S.customBumpCache[bumpUrl] = btx;
            }
            mat.bumpMap = S.customBumpCache[bumpUrl];
            mat.bumpScale = bumpScale;
          }
        } catch (e) {
          console.warn("Custom texture bump load error:", e);
        }
      } else {
        mat.map = floorTexture(t);
        try {
          var bUrl2 = getTexturePresetBumpUrl(t);
          if (bUrl2) {
            if (!S.customBumpCache) S.customBumpCache = {};
            if (!S.customBumpCache[bUrl2]) {
              var bloader2 = new THREE.TextureLoader();
              bloader2.setCrossOrigin("anonymous");
              var btx2 = bloader2.load(bUrl2, function() { S.repaint3D = true; });
              btx2.wrapS = btx2.wrapT = THREE.RepeatWrapping;
              S.customBumpCache[bUrl2] = btx2;
            }
            mat.bumpMap = S.customBumpCache[bUrl2];
            mat.bumpScale = bumpScale;
          }
        } catch (e) {
          console.warn("Floor bump load error:", e);
        }
      }
      matCache[key] = mat;
    }
    return matCache[key];
  }
  var xrayFloor = mepXray("floor");
  var xrayCeiling = mepXray("ceiling");
  var xrayWalls = mepXray("walls");
  if (rooms.length) {
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var t = roomFloor(r.key);
      var cTex = S.roomMeta[r.key] && S.roomMeta[r.key].floorTex;
      var cScale = S.roomMeta[r.key] && S.roomMeta[r.key].floorScale;
      var cBump = S.roomMeta[r.key] && S.roomMeta[r.key].floorBump;
      var cEntry = cTex && pbrEntryFor(cTex);
      var scaleVal = cScale ? cScale : (cEntry ? cEntry.sizeCm : cTex ? 200 : (TILE[t] || 240));
      var fmat = fmatFor(t, cTex, cBump);
      if (xrayFloor) {
        fmat = fmat.clone();
        fmat.transparent = true;
        fmat.opacity = 0.18;
        fmat.depthWrite = false;
      }
      var holes = holesForRoom(r.pts);
      var m = polyMesh(r.pts, 0, scaleVal, fmat, holes);
      if (m) {
        m.receiveShadow = !xrayFloor;
        m.castShadow = !xrayFloor;
        // named so an export can say WHICH room's floor this is (blender_names.js)
        m.userData.role = "floor";
        m.userData.roomLabel = roomName(r.key) || "";
        m.userData.finish = t || "";
        structureRoot.add(m);
      }
    });
    // Seamless passages: two adjacent rooms (e.g. a corridor and a room) each
    // stop their floor slab at their own wall centerline, leaving a bare strip
    // between them that reads as a dark seam. For a passage that has been made
    // seamless (full overlap width, full wall height, no sill) bridge that strip
    // with a floor patch so the surface is visually continuous.
    var wallToRoomKey = {};
    rooms.forEach(function (r) {
      r.key.split(",").forEach(function (id) { wallToRoomKey[id] = r.key; });
    });
    var bridged = {};
    S.openings.forEach(function (o) {
      if (o.overlapL == null) return;
      if (hid.walls[o.wall]) return;
      var w = wallById(o.wall);
      if (!w) return;
      var seamless =
        Math.abs(o.width - o.overlapL) < 2 &&
        (o.sill || 0) <= 1;
      if (!seamless) return;
      // Find the mate opening: one corridor drag can create openings on MANY
      // walls (one per connected room) sharing a single `paired` array, so
      // don't take the first opening on another wall — it may belong to a
      // different connection across the plan. Pick the physically closest
      // opening on a nearby PARALLEL wall.
      var g1 = wallGeom(w);
      var s1 = clamp(o.s, o.width / 2, g1.L - o.width / 2);
      var P1 = wallPointAt(w, s1), T1 = wallTangentAt(w, s1);
      var P1x = P1.x, P1z = P1.z;
      var o2 = null, w2 = null, g2 = null, s2 = 0, P2x = 0, P2z = 0, bestD = Infinity;
      (o.paired || []).forEach(function (pid) {
        if (pid === o.id) return;
        var c = S.openings.find(function (x) { return x.id === pid; });
        if (!c || c.wall === o.wall) return;
        var cw = wallById(c.wall);
        if (!cw) return;
        var cg = wallGeom(cw);
        var cs = clamp(c.s, c.width / 2, cg.L - c.width / 2);
        var CT = wallTangentAt(cw, cs);
        if (Math.abs(T1.ux * CT.ux + T1.uz * CT.uz) < 0.999) return; // not parallel
        var CP = wallPointAt(cw, cs), cx = CP.x, cz = CP.z;
        var d = Math.hypot(cx - P1x, cz - P1z);
        // only bridge across a real adjacency: wall gap plus a small tolerance
        if (d > (w.thickness + cw.thickness) / 2 + 12 || d >= bestD) return;
        bestD = d;
        o2 = c; w2 = cw; g2 = cg; s2 = cs; P2x = cx; P2z = cz;
      });
      if (!o2) return;
      // draw one patch per connection, not once per opening
      var pairKey = [o.id, o2.id].sort(function (a, b) { return a - b; }).join("-");
      if (bridged[pairKey]) return;
      bridged[pairKey] = 1;
      var hw = Math.min(o.width, o2.width) / 2;
      // align wall 2's direction to wall 1 so the quad winds consistently
      var T2 = wallTangentAt(w2, s2), u2x = T2.ux, u2z = T2.uz;
      if (T1.ux * u2x + T1.uz * u2z < 0) { u2x = -u2x; u2z = -u2z; }
      var pts = [
        { x: P1x - T1.ux * hw, z: P1z - T1.uz * hw },
        { x: P1x + T1.ux * hw, z: P1z + T1.uz * hw },
        { x: P2x + u2x * hw, z: P2z + u2z * hw },
        { x: P2x - u2x * hw, z: P2z - u2z * hw },
      ];
      var rk = wallToRoomKey[o.wall] || wallToRoomKey[o2.wall];
      var ft = rk ? roomFloor(rk) : "tiles";
      var cTex = rk && S.roomMeta[rk] && S.roomMeta[rk].floorTex;
      var cScale = rk && S.roomMeta[rk] && S.roomMeta[rk].floorScale;
      var bmEntry = cTex && pbrEntryFor(cTex);
      var scaleVal = cScale ? cScale : (bmEntry ? bmEntry.sizeCm : cTex ? 200 : (TILE[ft] || 240));
      var bmMat = fmatFor(ft, cTex);
      if (xrayFloor) {
        bmMat = bmMat.clone();
        bmMat.transparent = true;
        bmMat.opacity = 0.18;
        bmMat.depthWrite = false;
      }
      var bm = polyMesh(pts, 0, scaleVal, bmMat);
      if (bm) {
        bm.receiveShadow = !xrayFloor;
        bm.castShadow = !xrayFloor;
        bm.userData.role = "floorBridge";
        bm.userData.roomLabel = (rk && roomName(rk)) || "";
        structureRoot.add(bm);
      }
      // Bridge the wall jambs too: between the two cut walls there is a strip
      // (wall gap + any lateral offset of the paired openings) that exposes the
      // raw wall ends. Cover each side with a vertical wall-colored panel so
      // the reveal reads as one continuous jamb.
      var jH = Math.min(w.height || 270, w2.height || 270);
      var meta1 = S.roomMeta[wallToRoomKey[o.wall]], meta2 = S.roomMeta[wallToRoomKey[o2.wall]];
      var jCol = (meta1 && meta1.wall != null) ? meta1.wall
        : (meta2 && meta2.wall != null) ? meta2.wall
        : S.wallColor;
      var jMat = new THREE.MeshStandardMaterial({ color: jCol, roughness: 0.9 });
      if (xrayWalls) {
        jMat.transparent = true;
        jMat.opacity = 0.18;
        jMat.depthWrite = false;
      }
      var t1 = w.thickness || 10, t2 = w2.thickness || 10;
      // lateral offset between the two paired opening edges (walls dragged imprecisely)
      var loff = Math.abs((P2x - P1x) * T1.ux + (P2z - P1z) * T1.uz);
      // wide enough to swallow the corner overcut when the opening sits at a wall end, but perfectly flush
      var jT = Math.max(t1, t2) + loff;
      [-1, 1].forEach(function (sgn) {
        var ax = P1x + T1.ux * hw * sgn, az = P1z + T1.uz * hw * sgn;
        var bx = P2x + u2x * hw * sgn, bz = P2z + u2z * hw * sgn;
        var len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) return; // edges already flush
        // run the jamb from wall1's far face to wall2's far face so it plugs
        // the corner cube left empty when the through-wall was fully cut away
        var dx = (bx - ax) / len, dz = (bz - az) / len;
        ax -= dx * (t1 / 2 + 0.2); az -= dz * (t1 / 2 + 0.2);
        bx += dx * (t2 / 2 + 0.2); bz += dz * (t2 / 2 + 0.2);
        len = Math.hypot(bx - ax, bz - az);
        var jm = new THREE.Mesh(new THREE.BoxGeometry(len, jH + 2.5, jT), jMat);
        jm.position.set((ax + bx) / 2, (jH - 2.5) / 2, (az + bz) / 2);
        jm.rotation.y = -Math.atan2(bz - az, bx - ax);
        jm.receiveShadow = !xrayWalls;
        jm.castShadow = !xrayWalls;
        jm.userData.role = "jamb";
        structureRoot.add(jm);
      });
      // Cover passage bridges as well as the enclosed rooms. Built even with
      // ceilings off (at opacity 0, like the rooms'): it still shades the floor.
      {
        var cMat = plannerCeilingMaterial(xrayCeiling);
        var cm = polyMesh(pts, jH, 160, cMat);
        if (cm) {
          cm.receiveShadow = S.showCeiling && !xrayCeiling;
          cm.castShadow = !xrayCeiling;
          cm.userData.role = S.showCeiling || xrayCeiling ? "ceiling" : "ceilingHidden";
          structureRoot.add(cm);
        }
      }
    });
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var rmat = plannerCeilingMaterial(xrayCeiling);
      /* A void cuts the FLOOR SLAB it sits on, not the ceiling above it. Only
         the active storey renders, so punching the ceiling too opened the room
         to empty sky instead of to the floor above. Floor-only is the honest
         cut until stacked storeys render together. */
      var m = polyMesh(r.pts, r.ceilH, 160, rmat);
      if (m) {
        // hidden or not, the ceiling is what keeps the noon sun off the floor
        m.castShadow = !xrayCeiling;
        m.receiveShadow = S.showCeiling && !xrayCeiling;
        /* With ceilings switched off this slab is still built, at opacity 0, so
           the room keeps a surface for rays and physics. Say so, rather than
           leaving an export to guess from the material why a ceiling it can see
           in the outliner is invisible in the viewport. */
        m.userData.role = S.showCeiling || xrayCeiling ? "ceiling" : "ceilingHidden";
        m.userData.roomLabel = roomName(r.key) || "";
        structureRoot.add(m);
      }
    });
  } else {
    var fBoxOpt = { cast: !xrayFloor, rough: 0.9 };
    if (xrayFloor) {
      fBoxOpt.trans = true;
      fBoxOpt.opacity = 0.18;
    }
    var slab = [
      { x: bb.minx - 40, z: bb.minz - 40 },
      { x: bb.maxx + 40, z: bb.minz - 40 },
      { x: bb.maxx + 40, z: bb.maxz + 40 },
      { x: bb.minx - 40, z: bb.maxz + 40 },
    ];
    /* Without a closed room there is no room polygon to punch, and the void
       used to be a silent no-op on the flat fallback slab. Cut the fallback
       too, so a stairwell drawn before the walls close still reads as a hole. */
    var fallbackHoles = holesForRoom(slab);
    if (fallbackHoles.length) {
      var fmatFlat = new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.9 });
      if (xrayFloor) {
        fmatFlat.transparent = true;
        fmatFlat.opacity = 0.18;
        fmatFlat.depthWrite = false;
      }
      var fm = polyMesh(slab, 0, 240, fmatFlat, fallbackHoles);
      if (fm) {
        fm.castShadow = !xrayFloor;
        fm.receiveShadow = !xrayFloor;
        fm.userData.role = "floor";
        structureRoot.add(fm);
      }
    } else {
      var fbox = box(
        structureRoot,
        bb.minx - 40,
        bb.maxx + 40,
        -3,
        0,
        bb.minz - 40,
        bb.maxz + 40,
        FLOOR,
        fBoxOpt,
      );
      if (fbox) fbox.userData.role = "floor";
    }
  }
  /* The curb around each well. Outside the rooms branch so a void on an
     unclosed plan still gets its edge. */
  var rimMat = new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 0.92 });
  slabOpenings().forEach(function (o) {
    var cs = openingCorners(o), ri, a, b, len, rim;
    for (ri = 0; ri < 4; ri++) {
      a = cs[ri]; b = cs[(ri + 1) % 4];
      len = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(len > 2)) continue;
      rim = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 3.2), rimMat);
      rim.position.set((a.x + b.x) / 2, 3, (a.z + b.z) / 2);
      rim.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      rim.castShadow = false;
      rim.receiveShadow = true;
      rim.userData.role = "curb";
      structureRoot.add(rim);
    }
  });
  // per-room wall color overrides (a wall shared by two painted rooms takes the last one's color)
  var wallColorMap = {};
  rooms.forEach(function (r) {
    var c = S.roomMeta[r.key] && S.roomMeta[r.key].wall;
    if (c != null)
      r.key.split(",").forEach(function (id) {
        wallColorMap[id] = c;
      });
  });
  set_drawingWalls(S.walls.filter(function (w) { return !hid.walls[w.id]; }));
  set_drawingHoverObj(null); // its meshes were just disposed
  var nextReusableWalls = new Map();
  var keyForWall = createWallBuildKeys(S);
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    wallBuildArgs[w.id] = [wallColorMap[w.id] != null ? wallColorMap[w.id] : S.wallColor, w.tex];
    var args = wallBuildArgs[w.id], key = reusableWallKey(w, args[0], args[1], keyForWall);
    var cached = reusableWalls.get(w.id);
    if (key && cached && cached.wall === w && cached.key === key &&
        cached.group.parent && !cached.group.userData.seeThrough && !seeStubs.has(cached.group)) {
      renewWallMaterials(cached.group);
      structureRoot.add(cached.group);
      nextReusableWalls.set(w.id, cached);
    } else {
      var count = structureRoot.children.length;
      buildWall(w, args[0], args[1]);
      // Only the single-group straight-wall builder is eligible.
      if (key && structureRoot.children.length === count + 1) {
        nextReusableWalls.set(w.id, { wall: w, key: key, group: structureRoot.children[count] });
      }
    }
  });
  set_reusableWalls(nextReusableWalls);
  // the walls a dollhouse cut lowered still throw their full-height shadows
  if (isFinite(cutH())) buildShadowWalls(hid);
  // an invisible roof is still built, as a shadow caster only
  if (S.roof) {
    var roofTriangles = roofMeshTriangles(S.roof), roofPositions = [];
    roofTriangles.forEach(function (triangle) { triangle.forEach(function (p) { roofPositions.push(p.x, p.y, p.z); }); });
    if (roofPositions.length) {
      var roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(roofPositions, 3));
      roofGeo.computeVertexNormals();
      var roofEntry = materialById(S.roof.finish) || materialById("roof_clay_tile");
      worldUVs(roofGeo, roofEntry.sizeCm);
      var roofMesh = new THREE.Mesh(roofGeo, surfaceMaterial(roofEntry, { side: THREE.DoubleSide }) ||
        new THREE.MeshStandardMaterial({ color: 0x725b50, roughness: 0.82, side: THREE.DoubleSide }));
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      roofMesh.userData.role = "roof";
      if (S.invisibleRoof) shadowRoot.add(makeShadowOnly(roofMesh));
      else structureRoot.add(roofMesh);
    }
  }
  // daylight through each WINDOW (soft sky light at the opening, scaled by daylight)
  windowLights.forEach(releaseLight); // same lights back, same shaders (see takeLight)
  set_windowLights([]);
  S.openings.forEach(function (o) {
    if (o.type !== "window") return;
    if (hid.walls[o.wall]) return;
    var w = wallById(o.wall);
    if (!w) return;
    var gm = wallGeom(w);
    var s = clamp(o.s, o.width / 2, gm.L - o.width / 2),
      y = o.sill + o.height / 2;
    var winDist = Math.max(o.width, o.height) * 4 + 260;
    var wp = wallPointAt(w, s);
    // Sky light pours IN through the glass: a wide spot just inside the room
    // the window serves, aimed into it and slightly down, with its throw
    // stopped at that room (its far corner, and while it does not cast, the
    // room mask: see fitLightMasks). A point light on the wall centre line lit the
    // facade and the room behind a partition as much as the room with the
    // window, and pulled inside it burned a hotspot onto the window wall.
    var inset = (w.thickness || WALL_T) / 2 + 4, lightRoom = null, lx = wp.x, lz = wp.z, nx = 0, nz = 0;
    [1, -1].some(function (side) {
      var px = wp.x - gm.uz * inset * side, pz = wp.z + gm.ux * inset * side;
      lightRoom = roomContaining(px - gm.uz * 30 * side, pz + gm.ux * 30 * side);
      if (lightRoom) { lx = px; lz = pz; nx = -gm.uz * side; nz = gm.ux * side; }
      return !!lightRoom;
    });
    var throwCm = lightRoom ? Math.min(winDist, roomReach(lightRoom, lx, lz, y)) : winDist;
    var pl = lightRoom
      ? takeLight("SpotLight", 0xcfe2f2, legacyIntensity(0.9, winDist) * S.dayK, throwCm, 2, Math.PI * 0.44, 1)
      : takeLight("PointLight", 0xcfe2f2, legacyIntensity(0.9, winDist) * S.dayK, winDist, 2);
    windowLights.push(pl);
    pl.position.set(lx, y, lz);
    if (lightRoom) {
      pl.target.position.set(lx + nx * 200, y - 70, lz + nz * 200);
      dyn.add(pl.target);
    }
    pl.userData.baseI = legacyIntensity(0.9, winDist);
    pl.userData.win = true;
    /* Daylight is LIGHTING, not structure: it hangs off `dyn` rather than
       structureRoot so that ghosting the walls to read the plan through them
       does not also plunge the rooms into artificial-light-only gloom. */
    dyn.add(pl);
  });
  dyn.add(itemsRoot);
  syncItems(hid);
  fitPracticalLights();
  buildBounceLights(rooms);
  // MEP conduits + device markers embedded in the model. buildMEP3D takes its
  // parent, and returns early on its own m.show / m.show3D flags — those stay
  // as filters ON TOP of the mep layer, which owns the root's visibility.
  dyn.add(mepRoot);
  buildMEP3D(mepRoot, THREE);
  buildSurveyGeometry(structureRoot,THREE,S.surveyFeatures);
  if(isLayerVisible("underlay"))buildBlueprintUnderlay3D(dyn,THREE,S.blueprintTrace);

  if (isPhysicsEnabled()) {
    initPhysicsForScene();
  }
  applySite(); // reposition the aerial overlay for the new content bounds
  // a cut house has no ceiling to look down through, but its rooms are still
  // roofed against the sun: the ceilings and roof go shadow-only
  if (isFinite(cutH()))
    structureRoot.children.filter(function (o) {
      return o.userData && (o.userData.role === "ceiling" || o.userData.role === "roof");
    }).forEach(function (o) {
      if (o.castShadow) shadowRoot.add(makeShadowOnly(o));
      else o.visible = false;
    });
  // the wall groups are brand new: re-apply the cut as it stood, without a fade
  updateSeeThrough(true);
  warmFadePipelines();
  applyLayers3D(); // the roots are brand new too: re-apply hide/ghost to them
  // external modes (RC race) rebuild their collision snapshot off this event
  window.dispatchEvent(new Event("scene3d:rebuilt"));
}

export { applyItemOps, ghostSwap, layerRoots, pickableRoots, selected3DBox };
