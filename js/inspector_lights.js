/* ---- the inspector preview's own lights that can cast ----
   The inspector preview (js/inspector_preview.js) is a second renderer that
   draws the planner's own scene. three r185 keeps ONE light node per light
   object for every renderer in the page (a module-level WeakMap), so each
   light's ShadowNode and its shadow render target are shared between the
   main view and the preview. That sharing broke both ways: the preview
   sampled maps only the main view had drawn (its own GPU copies were never
   drawn: no roof shadow under "Invisible roof"), and a shared shadow node
   being rebuilt or reset under one renderer destroyed the texture the other
   still had bound ("Destroyed texture [ShadowDepthTexture] used in a
   submit" from the main view after RC mode, rebuilds and the modeler).

   So the preview never draws a light that can cast (point, spot and
   directional lights), whether it casts now or not: the main view flips
   castShadow as it hands maps between lights (and on its idle shadow-set
   prewarm), and a shader the preview builds asynchronously reads the flag
   when it is built, not when it was asked for. For each such light it draws
   a stand-in of the same class (the same planner light node class, mask
   rule and shadow settings) with its own shadow, hiding the original for
   the length of its render; a stand-in's castShadow changes only here. The
   stand-ins are kept by slot, so a rebuild that
   makes new light objects reuses them (their ids, and so the preview's
   shader keys, stay put), and their maps are drawn only when the scene was
   rebuilt or a light or its shadow camera moved, not on every orbit frame.

   No three import here (the lights it is handed carry their classes), so
   Node tests run it against vendor/three/three.core.js. */

function canCast(o) {
  return !!(o.isLight && o.shadow);
}
function shownTo(o, camera) {
  for (var a = o; a; a = a.parent) if (!a.visible) return false;
  return !camera || o.layers.test(camera.layers);
}

var CAMERA_KEYS = ["left", "right", "top", "bottom", "near", "far", "zoom", "fov", "aspect"];
var SHADOW_KEYS = ["bias", "normalBias", "radius", "blurSamples", "intensity"];
var LIGHT_KEYS = ["intensity", "distance", "decay", "angle", "penumbra", "castShadow"];

/* a stand-in for `src` (a light that can cast), sharing nothing GPU-side with it */
function makeStandIn(src) {
  var ud = src.userData;
  src.userData = {}; // copy() round-trips userData through JSON; it is shared below
  var c;
  try {
    c = src.clone(false);
  } finally {
    src.userData = ud;
  }
  c.name = "inspector stand-in: " + (src.name || src.type);
  c.matrixAutoUpdate = false;
  c.matrixWorldAutoUpdate = false;
  if (c.target) {
    c.target.matrixAutoUpdate = false;
    c.target.matrixWorldAutoUpdate = false;
  }
  c.shadow.autoUpdate = false;
  c.shadow.needsUpdate = true;
  return c;
}

/* copy what the preview draws from `src` onto its stand-in `c`; returns the
   key whose change means the stand-in's shadow map must be drawn again */
function syncStandIn(c, src) {
  var key = [];
  c.matrix.copy(src.matrixWorld);
  c.matrixWorld.copy(src.matrixWorld);
  key.push.apply(key, src.matrixWorld.elements);
  if (c.target && src.target) {
    c.target.matrix.copy(src.target.matrixWorld);
    c.target.matrixWorld.copy(src.target.matrixWorld);
    key.push.apply(key, src.target.matrixWorld.elements);
  }
  c.color.copy(src.color);
  LIGHT_KEYS.forEach(function (k) {
    if (src[k] !== undefined) c[k] = src[k];
  });
  key.push(c.castShadow);
  if (src.map !== undefined) c.map = src.map;
  c.layers.mask = src.layers.mask;
  c.userData = src.userData; // the mask rule (maskRoom, maskRoomUnshadowed) is read, never written
  var s = src.shadow, d = c.shadow;
  SHADOW_KEYS.forEach(function (k) {
    if (s[k] !== undefined) d[k] = s[k];
  });
  d.mapSize.copy(s.mapSize);
  key.push(s.mapSize.x, s.mapSize.y);
  var sc = s.camera, dc = d.camera, projected = false;
  CAMERA_KEYS.forEach(function (k) {
    if (sc[k] === undefined) return;
    if (dc[k] !== sc[k]) { dc[k] = sc[k]; projected = true; }
    key.push(sc[k]);
  });
  if (projected) dc.updateProjectionMatrix();
  dc.layers.mask = sc.layers.mask;
  key.push(sc.layers.mask);
  return key.join(",");
}

export function createInspectorLights() {
  var slots = []; // stand-ins in scene order: slot i stands in for the i-th light that can cast
  var hidden = [], added = [], scene = null;
  var dirty = true, lastSet = "";

  function standInFor(i, src) {
    var c = slots[i];
    if (c && c.constructor !== src.constructor) {
      c.dispose(); // frees ITS shadow map (the preview's alone)
      c = null;
    }
    if (!c) {
      c = slots[i] = makeStandIn(src);
      c.__key = "";
    }
    return c;
  }

  return {
    /* the scene was rebuilt: every stand-in draws its map again */
    invalidate: function () {
      dirty = true;
    },
    /* Before the preview renders `sc` through `camera`: hide every shown
       light that can cast and put its stand-in in. swapOut() undoes it; call it
       in a finally right after the render (or compileAsync call). Returns
       true when the stand-ins are not the ones the last call put in (the
       renderer's cached lights keys are stale then). */
    swapIn: function (sc, camera) {
      if (scene) this.swapOut();
      scene = sc;
      var lights = [];
      sc.traverse(function (o) {
        if (canCast(o) && shownTo(o, camera)) lights.push(o);
      });
      for (var i = 0; i < lights.length; i++) {
        var src = lights[i], c = standInFor(i, src), key = syncStandIn(c, src);
        if (dirty || key !== c.__key) c.shadow.needsUpdate = true;
        c.__key = key;
        src.visible = false;
        hidden.push(src);
        sc.add(c);
        added.push(c);
      }
      while (slots.length > lights.length) slots.pop().dispose();
      dirty = false;
      var set = added.map(function (c) { return c.id + (c.castShadow ? "" : "-"); }).join(",");
      var changed = set !== lastSet;
      lastSet = set;
      return changed;
    },
    /* `drawn`: the render that just ran drew the maps it was asked for (a
       render with shadows on, not a compile). three leaves needsUpdate set
       after drawing these maps, so without this every orbit frame of the
       preview redrew them (a 4096² sun map among them). A stand-in that does
       not cast keeps its request for when it does. */
    swapOut: function (drawn) {
      for (var i = 0; i < added.length; i++) {
        if (drawn && added[i].castShadow) added[i].shadow.needsUpdate = false;
        if (scene) scene.remove(added[i]);
      }
      for (var j = 0; j < hidden.length; j++) hidden[j].visible = true;
      added.length = 0;
      hidden.length = 0;
      scene = null;
    },
    /* the stand-ins themselves (tests and console inspection) */
    standIns: function () {
      return slots.slice();
    },
    dispose: function () {
      this.swapOut();
      while (slots.length) slots.pop().dispose();
    },
  };
}
