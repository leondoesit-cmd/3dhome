/* ---- light that bounces: the room fills itself ----
   A real room is lit mostly by light that has already hit something: the sky
   through the window and the lamps land on the floor and walls, which pass
   about half of it on, again and again, into every corner. Pro interior
   renderers spend their global illumination on exactly that. Without it a
   room under its ceiling got only the window spots and the sky map, and from
   above (the dollhouse cut) read as dark grey boxes.

   The stand-in here is the lighting designer's split-flux (lumen-method)
   interreflection: the flux Φ that ENTERS a room through its windows and from
   its lamps, on interior surfaces of area A with mean reflectance ρ, settles
   into an indirect irradiance of Φ·ρ / (A·(1−ρ)), spread evenly over the
   room. Each room keeps its own value: walls block it exactly, a room with no
   window and no lamp stays dark, and nothing reaches a neighbour (the user's
   rule — no light through a wall).

   On the GPU it is ONE light for the whole house: a custom light node that
   adds the irradiance of the room each fragment sits in, read from a map of
   the plan (one texel ≈ a few cm). Point lights per room could not stop at a
   wall (their range is a sphere, and a sphere that fills the corners crosses
   the walls), cost every pixel one more light each, and toggling one changed
   the light set every material's shader is keyed on — the whole house
   recompiled. This light is always on and never casts, so the light set never
   changes; refitting only rewrites the map.

   The first half of this module is plain arithmetic, so Node tests can check
   it; createRoomBounce builds the three.js part once three has loaded. */
import { pointInPoly } from "./geometry.js";

export var GRID = 512; // fixed, so the GPU texture is never reallocated
var PAD_CM = 40; // margin round the house: the map's edge texels are "outside"

/* Luminous flux of three's lights, in the units of their intensity (candela
   against centimetre throws: irradiance = I / d²). A spot's cone fades by a
   smoothstep from cos(angle·(1−penumbra)) out to cos(angle); the smoothstep
   averages ½ over its band. */
export function pointFlux(I) {
  return 4 * Math.PI * Math.max(0, I || 0);
}
export function spotFlux(I, angle, penumbra) {
  var outer = Math.cos(angle),
    inner = Math.cos(angle * (1 - Math.min(1, Math.max(0, penumbra || 0))));
  return 2 * Math.PI * Math.max(0, I || 0) * (1 - inner + 0.5 * (inner - outer));
}

export function roomArea(pts) {
  var a = 0;
  for (var i = 0, n = pts.length; i < n; i++) {
    var p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}
function perimeter(pts) {
  var s = 0;
  for (var i = 0, n = pts.length; i < n; i++) {
    var p = pts[i], q = pts[(i + 1) % n];
    s += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return s;
}
/* floor + ceiling + walls: every surface the light bounces between */
export function roomSurface(room, wallH) {
  return 2 * roomArea(room.pts) + perimeter(room.pts) * (room.ceilH || wallH || 250);
}
export function splitFluxIrradiance(flux, surface, rho) {
  if (!(flux > 0) || !(surface > 0)) return 0;
  return (flux * rho) / (surface * (1 - rho));
}

/* Which room each texel of the plan belongs to: 0 outside, i + 1 for
   rooms[i]. Even-odd scanline fill, one row at a time (a point-in-polygon
   test per texel was ~20 M edge tests for a flat). Square texels over the
   padded bounds of every room, so the shader maps x and z the same way. */
export function rasterRooms(rooms, size) {
  size = size || GRID;
  var minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  rooms.forEach(function (r) {
    r.pts.forEach(function (p) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
  });
  var index = new Uint16Array(size * size);
  if (!rooms.length || !isFinite(minX)) return { size: size, x0: 0, z0: 0, cell: 1, index: index };
  var span = Math.max(maxX - minX, maxZ - minZ) + 2 * PAD_CM;
  var cell = span / size;
  var x0 = (minX + maxX) / 2 - span / 2,
    z0 = (minZ + maxZ) / 2 - span / 2;
  var xs = [];
  rooms.forEach(function (r, ri) {
    var pts = r.pts, n = pts.length;
    for (var j = 0; j < size; j++) {
      var z = z0 + (j + 0.5) * cell;
      xs.length = 0;
      for (var a = 0, b = n - 1; a < n; b = a++) {
        var p = pts[a], q = pts[b];
        if ((p.z > z) !== (q.z > z)) xs.push(p.x + ((z - p.z) * (q.x - p.x)) / (q.z - p.z));
      }
      if (xs.length < 2) continue;
      xs.sort(function (u, v) { return u - v; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)),
          i1 = Math.min(size - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
        for (var i = i0; i <= i1; i++) index[j * size + i] = ri + 1;
      }
    }
  });
  return { size: size, x0: x0, z0: z0, cell: cell, index: index };
}
/* the room (index into the rasterised list) at a plan point, or -1 */
export function roomAt(grid, x, z) {
  var i = Math.floor((x - grid.x0) / grid.cell),
    j = Math.floor((z - grid.z0) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -1;
  return grid.index[j * grid.size + i] - 1;
}

/* Indirect irradiance per room, as linear RGB. `sources` are the lights that
   put flux into the house: { x, z, flux, color: [r, g, b] }; a source counts
   for the room it stands in (none outside every room). */
export function roomIrradiance(rooms, sources, rho, wallH) {
  var flux = rooms.map(function () { return [0, 0, 0]; });
  sources.forEach(function (s) {
    if (!(s.flux > 0)) return;
    for (var i = 0; i < rooms.length; i++) {
      if (!pointInPoly(s.x, s.z, rooms[i].pts)) continue;
      var c = s.color || [1, 1, 1];
      flux[i][0] += s.flux * c[0];
      flux[i][1] += s.flux * c[1];
      flux[i][2] += s.flux * c[2];
      return;
    }
  });
  return rooms.map(function (r, i) {
    var A = roomSurface(r, wallH);
    return flux[i].map(function (f) { return splitFluxIrradiance(f, A, rho); });
  });
}

/* ---- the same map stops the lights that cannot cast ----
   A light with a shadow map is stopped by the walls it sees. One without is a
   sphere: it lit the room behind a partition as brightly as its own (a floor
   lamp beside a wall lit a sealed bedroom at night). The sky was worse: the
   environment map and the hemisphere light reach every surface, so a room
   with no window was lit through its hidden ceiling. The plan map also holds,
   per texel, which room it is (0 outside every room), and the GPU half reads
   it per fragment, just as the bounce does:
     - a light that does not cast lights only the surfaces of its own room
       (a light outside every room, only what is outside);
     - the sky lights only what is outside every room or above the ceilings,
       and so does the sun while it has no shadow map (shadows off).
   A surface's room is read a little way out along its normal, so the two
   faces of a wall belong to the two sides they face. Both rules only ever
   take light away where a wall or a ceiling stands; daylight still comes in
   through the windows, carried by the window spots and the bounce. */
export var NORMAL_REACH_CM = 15; // a wall face samples 15 cm out along its normal: its own room
export var UNMASKED = -1; // a light that casts: its shadow map stops it at the walls
export var SKY_ONLY = -2; // a light from the sky: it reaches what the sky reaches

/* the room number (rooms[i] -> i + 1, 0 outside every room) at a plan point */
export function roomNumberAt(rooms, x, z) {
  for (var i = 0; i < rooms.length; i++) if (pointInPoly(x, z, rooms[i].pts)) return i + 1;
  return 0;
}
/* the room whose surfaces a light may reach: its own, or any if it casts */
export function lightMaskRoom(rooms, x, z, casts) {
  return casts ? UNMASKED : roomNumberAt(rooms, x, z);
}
/* the room number the map gives a surface at (x, z) facing along (nx, nz) */
export function facingRoom(grid, x, z, nx, nz) {
  return roomAt(grid, x + (nx || 0) * NORMAL_REACH_CM, z + (nz || 0) * NORMAL_REACH_CM) + 1;
}
/* the two rules the shaders below apply per fragment: is the surface under
   the open sky, and does a light with this mask room reach it */
export function skyAdmits(room, y, ny, ceilTop) {
  return room === 0 || y + (ny || 0) * NORMAL_REACH_CM > ceilTop;
}
export function maskAdmits(maskRoom, room, underSky) {
  if (maskRoom === SKY_ONLY) return !!underSky;
  return maskRoom === UNMASKED || maskRoom === room;
}
/* the highest ceiling: a surface above it is under the open sky */
export function ceilingTop(rooms, wallH) {
  var top = 0;
  rooms.forEach(function (r) { top = Math.max(top, r.ceilH || wallH || 250); });
  return top || wallH || 250;
}
/* the map's texels: RGB the room's bounce irradiance, A its room number */
export function packPlanMap(grid, perRoom, toHalf, out) {
  var zero = toHalf(0), idx = grid.index;
  var texel = perRoom.map(function (e, i) { return [toHalf(e[0]), toHalf(e[1]), toHalf(e[2]), toHalf(i + 1)]; });
  for (var t = 0, n = idx.length; t < n; t++) {
    var h = idx[t] ? texel[idx[t] - 1] : null, o = t * 4;
    out[o] = h ? h[0] : zero;
    out[o + 1] = h ? h[1] : zero;
    out[o + 2] = h ? h[2] : zero;
    out[o + 3] = h ? h[3] : zero;
  }
  return out;
}

/* ---- the three.js half ----
   opts.masks(): false while a game's own grade holds the view (lava glowing
   up from the floors), which turns both masks off. */
export function createRoomBounce(THREE, TSL, opts) {
  opts = opts || {};
  var data = new Uint16Array(GRID * GRID * 4);
  var map = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat, THREE.HalfFloatType);
  // nearest: the alpha is a room number, and a blend of rooms 3 and 5 would
  // read as room 4 (the irradiance is one value per room anyway)
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = false;
  map.colorSpace = THREE.NoColorSpace; // irradiance, already linear
  map.needsUpdate = true;
  var origin = TSL.uniform(new THREE.Vector2(0, 0));
  var span = TSL.uniform(1);
  var ceilTop = TSL.uniform(250);
  var masksOn = TSL.uniform(1).onRenderUpdate(function () { return opts.masks && !opts.masks() ? 0 : 1; });
  var one = TSL.float(1);

  // every read is the same texture, so a material binds it once; always mip
  // 0, which the environment pass would otherwise replace with its roughness
  // level (the map has no other mips: they read as "outside every room")
  function planTexel() {
    var p = TSL.positionWorld.xz.add(TSL.normalWorld.xz.mul(NORMAL_REACH_CM));
    return TSL.texture(map, p.sub(origin).div(span)).level(0);
  }
  function masked(open) {
    return one.sub(masksOn.mul(one.sub(open)));
  }
  // 1 where the sky reaches the fragment (skyAdmits), 0 under a ceiling
  function underSky() {
    var inRoom = TSL.step(0.5, planTexel().a);
    var above = TSL.step(ceilTop, TSL.positionWorld.y.add(TSL.normalWorld.y.mul(NORMAL_REACH_CM)));
    return TSL.max(one.sub(inRoom), above);
  }
  function skyOpen() {
    return masked(underSky());
  }
  // 1 where a light with this mask room reaches the fragment (maskAdmits)
  function lightOpen(maskRoom) {
    var sky = one.sub(TSL.step(SKY_ONLY + 0.5, maskRoom));
    var any = TSL.step(SKY_ONLY + 0.5, maskRoom).mul(one.sub(TSL.step(UNMASKED + 0.5, maskRoom)));
    var same = one.sub(TSL.step(0.5, TSL.abs(planTexel().a.sub(maskRoom))));
    return masked(TSL.max(TSL.max(any, same), sky.mul(underSky())));
  }
  // light.userData.maskRoom picks the rule; a light without one is stock
  function maskedLightNode(Base) {
    return class extends Base {
      constructor(light) {
        super(light);
        this.maskRoomNode = TSL.uniform(UNMASKED).setGroup(TSL.renderGroup);
      }
      update(frame) {
        super.update(frame);
        var m = this.light.userData.maskRoom;
        this.maskRoomNode.value = m == null ? UNMASKED : m;
      }
      setupDirect(builder) {
        var d = super.setupDirect(builder);
        if (d && d.lightColor) d.lightColor = d.lightColor.mul(lightOpen(this.maskRoomNode));
        return d;
      }
    };
  }
  // the stock HemisphereLightNode.setup, times its mask
  class SkyHemisphereLightNode extends maskedLightNode(THREE.HemisphereLightNode) {
    setup(builder) {
      var w = TSL.normalWorld.dot(this.lightDirectionNode).mul(0.5).add(0.5);
      var e = TSL.mix(this.groundColorNode, this.colorNode, w);
      builder.context.irradiance.addAssign(e.mul(lightOpen(this.maskRoomNode)));
    }
  }

  class RoomBounceLight extends THREE.Light {
    constructor() {
      super(0xffffff, 1);
      this.isRoomBounceLight = true;
      this.type = "RoomBounceLight";
    }
  }
  class RoomBounceLightNode extends THREE.AnalyticLightNode {
    static get type() {
      return "RoomBounceLightNode";
    }
    setup(builder) {
      builder.context.irradiance.addAssign(this.colorNode.mul(planTexel().rgb));
    }
  }

  var light = new RoomBounceLight();
  light.userData.bounce = true; // exporters skip it: Blender does its own GI
  var grid = rasterRooms([]), rooms = [];

  return {
    light: light,
    register: function (renderer) {
      renderer.library.addLight(RoomBounceLightNode, RoomBounceLight);
      // the stock classes are already in this renderer's library and
      // addLight will not redefine one; a light with no mask room set
      // (anything a game adds) renders exactly as the stock node
      var nodes = renderer.library.lightNodes;
      nodes.set(THREE.PointLight, maskedLightNode(THREE.PointLightNode));
      nodes.set(THREE.SpotLight, maskedLightNode(THREE.SpotLightNode));
      nodes.set(THREE.DirectionalLight, maskedLightNode(THREE.DirectionalLightNode));
      nodes.set(THREE.HemisphereLight, SkyHemisphereLightNode);
    },
    /* The scene's environment, stopped at the ceilings: the PMREM three
       makes of scene.environment, times skyOpen. A getter, so a game that
       nulls scene.environment for its own grade still turns it off, and a
       new sky texture swaps into the same node. */
    confineSky: function (scene) {
      var pmrem = null, node = null;
      Object.defineProperty(scene, "environmentNode", {
        configurable: true,
        get: function () {
          var env = scene.environment;
          if (!env || !env.isTexture) return null;
          if (!pmrem) {
            pmrem = TSL.pmremTexture(env);
            node = pmrem.mul(skyOpen());
          } else if (pmrem.value !== env) pmrem.value = env;
          return node;
        },
      });
    },
    /* the rooms whose light it carries; the map follows on the next fit */
    setRooms: function (shown, wallH) {
      rooms = shown;
      grid = rasterRooms(shown);
      origin.value.set(grid.x0, grid.z0);
      span.value = grid.cell * grid.size;
      ceilTop.value = ceilingTop(shown, wallH);
    },
    /* the rooms the map numbers, in order: a light's mask room indexes them */
    rooms: function () {
      return rooms;
    },
    /* irradiance per room (linear RGB), in the order given to setRooms */
    setIrradiance: function (perRoom) {
      packPlanMap(grid, perRoom, THREE.DataUtils.toHalfFloat, data);
      map.needsUpdate = true;
      light.userData.irradiance = perRoom; // for inspection from the console
    },
  };
}
