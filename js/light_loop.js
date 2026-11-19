import { openingCut, wallSolidPieces } from "./floor_stack.js";
import { normalizeWallProfile, pointAtWall, verticalSegments, wallCurveGeom, wallProfileHeight } from "./wall_curves.js";
import { openingTransmittance } from "./view3d/backdrop.js";
/* ---- one loop for the lights that cast no shadow ----
   three writes every light into every lit shader as its own copy of the
   lighting code (the light vector, its falloff, the room mask, the whole
   BRDF), and keys every lit shader on the set of lights: a large flat's
   fragment shader was ~140 KB, most of it the same block once per lamp, and
   adding or removing one lamp rebuilt every material in the house. The GPU
   compile of those shaders is what held the first 3D open for seconds.

   Here the point and spot lights that cast no shadow leave three's per-light
   list and are drawn by ONE loop over a uniform array instead; the shader
   holds the block once whatever their number, and their number is data, not
   part of any shader key. The lighting is the same: each iteration works out
   exactly what three's PointLightNode / SpotLightNode do (light vector from
   the view position three computes on the CPU, inverse-square falloff with
   the range window, the spot cone's smoothstep), times the room mask the
   planner's lights carry (js/room_bounce.js), and hands it to the material's
   own lighting model like any other direct light.

   Lights that cast stay three's own: each has its own shadow map, which a
   shader binds one texture at a time. A light with a projected map or a
   colour node also stays (the loop has no projector).

   The first half is plain arithmetic for Node tests; createLightLoop builds
   the three.js part. */

/* lights the loop carries; more fall back to three's own code. 192 × 5 vec4
   is 15 KB: inside WebGL2's smallest guaranteed uniform block (16 KB). A
   ~200-wall plan has ~140 lights that cast no shadow. */
export var LOOP_MAX = 192;
export var LOOP_STRIDE = 5; // vec4s per light

/* the lights the loop takes over: punctual, no shadow, nothing projected */
export function loopable(light) {
  if (!light || !(light.isPointLight || light.isSpotLight)) return false;
  if (light.castShadow) return false;
  if (light.isSpotLight && (light.map || light.colorNode)) return false;
  return true;
}

/* split a render's lights: three keeps `kept`, the loop draws `looped` */
export function splitLights(lights, kept, looped, max) {
  kept.length = 0;
  looped.length = 0;
  for (var i = 0; i < lights.length; i++) {
    var l = lights[i];
    if (looped.length < max && loopable(l)) looped.push(l);
    else kept.push(l);
  }
  // three adds lights in id order (sortLights), so the loop does too
  looped.sort(function (a, b) { return a.id - b.id; });
}

/* One light's slots, as the shader reads them:
     0  view-space position, range (light.distance)
     1  colour × intensity (linear), decay
     2  world position, 1 for a spot (0 for a point)
     3  world target position (spot), cos(angle)
     4  cos(angle·(1 − penumbra)), mask room, squared source radius
   viewPos is the light's position in the camera's view space (three
   computes it on the CPU per render, see lightViewPosition); target is the
   spot's target world position. */
export function packLight(out, o, light, viewPos, worldPos, target, maskRoom) {
  var spot = !!light.isSpotLight, k = light.intensity;
  out[o] = viewPos.x; out[o + 1] = viewPos.y; out[o + 2] = viewPos.z; out[o + 3] = light.distance;
  out[o + 4] = light.color.r * k; out[o + 5] = light.color.g * k; out[o + 6] = light.color.b * k; out[o + 7] = light.decay;
  out[o + 8] = worldPos.x; out[o + 9] = worldPos.y; out[o + 10] = worldPos.z; out[o + 11] = spot ? 1 : 0;
  out[o + 12] = spot ? target.x : 0; out[o + 13] = spot ? target.y : 0; out[o + 14] = spot ? target.z : 0;
  out[o + 15] = spot ? Math.cos(light.angle) : 0;
  out[o + 16] = spot ? Math.cos(light.angle * (1 - light.penumbra)) : 0;
  out[o + 17] = maskRoom;
  out[o + 18] = (light.userData?.sourceRadius || 0) ** 2; out[o + 19] = light.userData?.hemisphereSign || 0;
  return out;
}

/* ---- the three.js half ----
   opts.maskRoom(light, renderer) -> the mask room the light's own node
   would use this render; opts.lightOpen(maskNode) -> the shader's 0/1
   factor for it; opts.hoist() -> nodes to evaluate once before the loop
   (the room map read), so the loop body reuses them. */
export function createLightLoop(THREE, TSL, opts) {
  opts = opts || {};
  var V = THREE.Vector3;
  var vp = new V(), wp = new V(), tp = new V(), packed = new Float32Array(LOOP_STRIDE * 4);
  var weakNodes = new WeakMap();

  class LoopedLightsNode extends THREE.LightingNode {
    static get type() {
      return "LoopedLightsNode";
    }
    constructor(owner) {
      super();
      this.owner = owner; // the PlannerLightsNode whose lights it draws
      this.data = [];
      for (var i = 0; i < LOOP_MAX * LOOP_STRIDE; i++) this.data.push(new THREE.Vector4());
      this.lightsArray = TSL.uniformArray(this.data, "vec4").setGroup(TSL.renderGroup);
      this.count = TSL.uniform(0, "int").setGroup(TSL.renderGroup);
      /* Packed inside the array's own per-render update, right before it
         copies the elements into the buffer the GPU reads. As a separate
         node update it could run after that copy (three orders them by
         graph), and the loop drew the previous render's lights — the
         camera's last position, or last hour's set — with this one's count. */
      var self = this, copy = this.lightsArray.update;
      this.lightsArray.update = function (frame) {
        if (frame && frame.camera) self.pack(frame); // setup() fills the buffer once with no frame
        return copy.call(this, frame);
      };
    }
    pack(frame) {
      var looped = this.owner._looped, cam = frame.camera, r = frame.renderer, data = this.data;
      var n = Math.min(looped.length, LOOP_MAX);
      for (var i = 0; i < n; i++) {
        var l = looped[i];
        wp.setFromMatrixPosition(l.matrixWorld);
        vp.copy(wp).applyMatrix4(cam.matrixWorldInverse);
        if (l.isSpotLight) tp.setFromMatrixPosition(l.target.matrixWorld);
        packLight(packed, 0, l, vp, wp, tp, opts.maskRoom ? opts.maskRoom(l, r) : -1);
        for (var s = 0; s < LOOP_STRIDE; s++) {
          var q = s * 4;
          data[i * LOOP_STRIDE + s].set(packed[q], packed[q + 1], packed[q + 2], packed[q + 3]);
        }
      }
      this.count.value = n;
    }
    setup(builder) {
      var hoisted = opts.hoist ? opts.hoist() : [];
      hoisted.forEach(function (node) { node.toVar(); });
      var positionView = builder.context.positionView || TSL.positionView;
      var self = this, lightsArray = this.lightsArray;
      TSL.Loop(this.count, function (it) {
        var i = it.i, base = i.mul(LOOP_STRIDE);
        var s0 = lightsArray.element(base), s1 = lightsArray.element(base.add(1)),
          s2 = lightsArray.element(base.add(2)), s3 = lightsArray.element(base.add(3)),
          s4 = lightsArray.element(base.add(4));
        // as PointLightNode / SpotLightNode.setupDirect
        var lightVector = s0.xyz.sub(positionView);
        var lightDirection = lightVector.normalize();
        var lightDistance = lightVector.length();
        var attenuation = TSL.getDistanceAttenuation({ lightDistance: lightDistance, cutoffDistance: s0.w, decayExponent: s1.w });
        var angleCos = lightDirection.dot(TSL.cameraViewMatrix.transformDirection(s2.xyz.sub(s3.xyz)));
        var cone = TSL.select(s2.w.greaterThan(0.5), TSL.smoothstep(s3.w, s4.x, angleCos), TSL.float(1));
        const elevation = TSL.positionWorld.y.sub(s2.y).div(lightDistance.max(0.01));
        cone = cone.mul(TSL.select(s4.w.abs().greaterThan(0.5), elevation.mul(s4.w).max(0), 1));
        // The on-axis irradiance of a Lambertian disk is proportional
        // to 1/(d²+r²). Retain inverse square in the far field and a
        // finite near field for the shade, bulb, lens or glazed opening.
        var d2 = lightVector.dot(lightVector).max(0.0001);
        var lightColor = s1.xyz.mul(cone).mul(attenuation).mul(d2.div(d2.add(s4.z)));
        if (opts.lightOpen) lightColor = lightColor.mul(opts.lightOpen(s4.y, s2.xyz));
        builder.lightsNode.setupDirectLight(builder, self, { lightDirection: lightDirection, lightColor: lightColor });
      });
    }
  }

  /* three's LightsNode, minus the lights the loop draws. Its shader key
     covers only the lights it keeps, so lamps coming and going in the loop
     never rebuild a shader. getLights hands back the full list, which
     three's nested-render save/restore relies on. */
  class PlannerLightsNode extends THREE.LightsNode {
    static get type() {
      return "PlannerLightsNode";
    }
    constructor() {
      super();
      this._all = [];
      this._kept = [];
      this._looped = [];
      this._loopNode = new LoopedLightsNode(this);
      this.loopOn = true;
    }
    setLights(lights) {
      this._all = lights;
      if (this.loopOn) {
        splitLights(lights, this._kept, this._looped, LOOP_MAX);
        this._lights = this._kept;
      } else {
        this._looped.length = 0;
        this._lights = lights;
      }
      return this;
    }
    getLights() {
      return this._all;
    }
    customCacheKey() {
      return super.customCacheKey() + (this.loopOn ? 1 : 0);
    }
    setupLightsNode(builder) {
      var nodes = super.setupLightsNode(builder);
      if (this.loopOn) nodes.push(this._loopNode);
      return nodes;
    }
    get hasLights() {
      return this._all.length > 0;
    }
  }

  class PlannerLighting extends THREE.Lighting {
    createNode(lights) {
      return new PlannerLightsNode().setLights(lights || []);
    }
    getNode(scene) {
      if (scene.isScene !== true && scene.isGroup !== true) return super.getNode(scene);
      var node = weakNodes.get(scene);
      if (!node) {
        node = this.createNode();
        node.loopOn = lighting.loopOn;
        weakNodes.set(scene, node);
      }
      return node;
    }
  }

  var lighting = new PlannerLighting();
  lighting.loopOn = opts.on !== false;
  return { lighting: lighting };
}

/* A room mask alone cannot occlude the re-entrant corner of an L-shaped
   room, a freestanding partition, or a building between two outdoor points.
   Keep the intervening opaque wall spans in the existing room atlas. Convex
   rooms without internal partitions have an empty list. */

function shadowSpans(w, openings, state) {
  const geom = wallCurveGeom(w, state.nodes);
  if (!geom) return [];
  const cuts = [];
  for (const o of openings) {
    if (!(openingTransmittance(o) > 0)) continue;
    const cut = openingCut(o, w.height);
    // A closed glazed leaf transmits. A part-open opaque leaf reveals
    // only part of the rough opening in projection onto the wall.
    if (o.type === "door" && o.mat !== "glass" && o.mat !== "frosted") {
      const width = cut.width * openingTransmittance(o);
      cut.s += (String(o.swingDir || "R_IN").startsWith("L") ? 1 : -1) * (cut.width - width) / 2;
      cut.width = width;
    }
    cuts.push(cut);
  }
  const spans = [], profile = normalizeWallProfile(w);
  for (const band of verticalSegments(w, state.wallTypes)) {
    if (!band.solid) continue;
    for (const piece of wallSolidPieces(geom.length, band.bottom, band.top, cuts)) {
      const breaks = [piece.s0, ...profile.map(p => p.s).filter(s => s > piece.s0 && s < piece.s1), piece.s1];
      for (let j = 1; j < breaks.length; j++) {
        const begin = breaks[j - 1], length = breaks[j] - begin;
        const n = geom.kind === "arc" ? Math.max(1, Math.ceil(length / 10)) : 1;
        for (let i = 0; i < n; i++) {
          const s0 = begin + length * i / n, s1 = begin + length * (i + 1) / n;
          const a = pointAtWall(w, s0, state.nodes), b = pointAtWall(w, s1, state.nodes);
          const top = s => profile.length ? Math.min(piece.y1, wallProfileHeight(w, s, w.height)) : piece.y1;
          spans.push([a.x, a.z, b.x-a.x, b.z-a.z, piece.y0, top(s0), top(s1)]);
        }
      }
    }
  }
  return spans;
}

function couldCross(points, s) {
  const [x,z,dx,dz] = s;
  let left = false, right = false, before = true, after = true;
  const length2 = dx*dx + dz*dz, eps = 0.02 * Math.sqrt(length2);
  for (const p of points) {
    const u = p.x-x, v = p.z-z, cross = dx*v-dz*u, along = dx*u+dz*v;
    left ||= cross > eps;
    right ||= cross < -eps;
    before &&= along < 0;
    after &&= along > length2;
  }
  return left && right && !before && !after;
}

// The four header components are integer limbs exactly representable in
// binary16. A room with blockers also gets a split coordinate origin:
// remote site coordinates must not round a thin partition out of existence.
export function wallPathRecords(rooms, state) {
  const openings = new Map();
  for (const o of state.openings || []) {
    const id = String(o.wall);
    if (!openings.has(id)) openings.set(id, []);
    openings.get(id).push(o);
  }
  const all = (state.walls || []).flatMap(w => shadowSpans(w, openings.get(String(w.id)) || [], state));
  const lists = [all, ...rooms.map(r => all.filter(s => couldCross(r.pts, s)))];
  const records = new Array(lists.length * 4).fill(0);
  lists.forEach((list, id) => {
    if (!list.length) return;
    const offset = records.length / 4, count = list.length;
    records[id*4] = Math.floor(offset / 1024);
    records[id*4+1] = offset % 1024;
    records[id*4+2] = Math.floor(count / 1024);
    records[id*4+3] = count % 1024;
    const [x,z] = list[0];
    const hx = Math.trunc(x/4096), hz = Math.trunc(z/4096);
    records.push(hx,x-hx*4096,hz,z-hz*4096);
    for (const [ax,az,dx,dz,lo,hi0,hi1] of list) records.push(ax-x,az-z,dx,dz,lo,hi0,hi1,0);
  });
  return Float32Array.from(records);
}

const wallIntersections = new WeakMap();
function wallIntersection(TSL) {
  if (!wallIntersections.has(TSL)) {
    const cross = (a, b) => a.x.mul(b.y).sub(a.y.mul(b.x));
    const intersection = TSL.Fn(([ray, p, seg]) => {
      const diff = seg.xy.sub(p);
      const det = cross(ray, seg.zw);
      const inv = det.sign().div(det.abs().max(1e-6));
      return TSL.vec2(cross(diff, seg.zw).mul(inv), cross(diff, ray).mul(inv));
    }).setLayout({name: "plannerWallIntersection", type: "vec2", inputs: [
      {name: "ray", type: "vec2"}, {name: "p", type: "vec2"}, {name: "seg", type: "vec4"},
    ]});
    wallIntersections.set(TSL, intersection);
  }
  return wallIntersections.get(TSL);
}

export function wallPathVisibility(TSL, readRecord, roomId, receiver, emitter, levelY, header = readRecord(roomId)) {
  const start = header.r.mul(1024).add(header.g);
  const count = header.b.mul(1024).add(header.a);
  const open = TSL.float(1).toVar();
  TSL.If(count.greaterThan(0), () => {
    const origin = readRecord(start);
    const p = emitter.xz.sub(origin.xz.mul(4096)).sub(origin.yw);
    const ray = receiver.xz.sub(emitter.xz);
    TSL.Loop(TSL.int(count), ({i}) => {
      const k = start.add(1).add(TSL.float(i).mul(2));
      const hit = wallIntersection(TSL)(ray, p, readRecord(k));
      const t = hit.x, u = hit.y;
      TSL.If(t.greaterThan(0.00001).and(t.lessThan(0.99999)).and(u.greaterThanEqual(0)).and(u.lessThanEqual(1)), () => {
        const h = readRecord(k.add(1));
        const y = TSL.mix(emitter.y, receiver.y, t).sub(levelY);
        TSL.If(y.greaterThanEqual(h.x).and(y.lessThanEqual(TSL.mix(h.y, h.z, u))), () => {
          open.assign(0);
          TSL.Break();
        });
      });
    });
  });
  return open;
}

// The same shadow lights reach every lit material. Count distinct material
// textures per draw, including node-based PBR, before assigning shadow maps.
// The room atlas and PMREM use one binding each. r185 transmission adds two
// viewport bindings on the portable 16-texture fragment stage.
const fragmentMaps = [
  "map", "normalMap", "bumpMap", "aoMap", "emissiveMap", "metalnessMap", "roughnessMap",
  "lightMap", "alphaMap", "transmissionMap", "thicknessMap", "clearcoatMap",
  "clearcoatNormalMap", "clearcoatRoughnessMap", "specularColorMap", "specularIntensityMap",
  "iridescenceMap", "iridescenceThicknessMap", "sheenColorMap", "sheenRoughnessMap",
  "anisotropyMap",
];

export function sceneShadowBudget(roots, maximum) {
  const seen = new Set();
  let budget = maximum;
  function count(material) {
    if (!material || seen.has(material) || !(material.isMeshStandardMaterial ||
        material.isMeshStandardNodeMaterial || material.lights)) return;
    seen.add(material);
    const maps = new Set(material.plannerFragmentMaps || []);
    for (const key of fragmentMaps) if (material[key]?.isTexture) maps.add(material[key]);
    budget = Math.min(budget, 16 - 2 - maps.size - (material.transmission > 0 ? 2 : 0));
  }
  for (const root of roots) {
    if (!root || (root.parent && roots.includes(root.parent))) continue;
    root.traverse(object => {
      if (Array.isArray(object.material)) object.material.forEach(count);
      else count(object.material);
    });
  }
  return Math.max(0, budget);
}
