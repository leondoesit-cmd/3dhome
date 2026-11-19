import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { installPlannerGpuPatches } from "../js/planner_gpu_patches.js";

// Browser import map for the real generator, catalogue meshes and light rig.
registerHooks({ resolve(name, context, next) {
  if (name !== "three" && !name.startsWith("three/")) return next(name, context);
  const path = name === "three" || name === "three/webgpu" ? "three.webgpu.js"
    : name === "three/tsl" ? "three.tsl.js" : name.slice(6);
  return { url: new URL("../vendor/three/" + path, import.meta.url).href, shortCircuit: true };
} });
globalThis.window = { addEventListener() {}, location: { search: "" } };
globalThis.location = window.location;
const v = await import("../js/view3d.js");
const { THREE, TSL, loadThree } = await import("../js/three_lazy.js");
await loadThree();
const { buildItem, buildWall, placeItem } = await import("../js/view3d/wall_build.js");
const { fitBounceLights, fitPracticalLights, itemBouncePlacement, roomContaining } = await import("../js/view3d/lighting.js");
const { createLightLoop } = await import("../js/light_loop.js");
const { S } = await import("../js/state.js");
const { detectRooms, wallById } = await import("../js/geometry.js");
const { exteriorWindow, WINDOW_ANGLE, WINDOW_PENUMBRA } = await import("../js/view3d/backdrop.js");
const { FURN } = await import("../js/furniture.js");
const { pointFlux, spotFlux } = await import("../js/room_bounce.js");
const { fixtureLamp, photoLampPower } = await import("../js/primitives.js");
const { PLANNER_FLUX_SCALE, legacyIntensity } = await import("../js/gpu.js");
const { apartmentGenerateCommand } = await import("../js/generator.js");
const { executeCommand } = await import("../js/commands/executor.js");

test("seed 3 has shadowed furniture under the same sources at 17:00 and after dusk", t => {
  const made = executeCommand(apartmentGenerateCommand, {
    size: "large", replace: true, replaceInfrastructure: true, infrastructure: true, seed: 3,
  }, { domain: "planner", state: S, itemCatalog: FURN }, { history: false });
  assert.ok(made.ok);
  const root = v.set_itemsRoot(new THREE.Group());
  const sun = v.set_sun(new THREE.DirectionalLight());
  sun.castShadow = true;
  v.set_renderer({ shadowMap: { enabled: true } });
  const fixtures = S.items.filter(it => FURN[it.type]?.lamp).map(it => buildItem(it));
  // Inward-facing window spots of the captured apartment, nine cm from
  // their respective wall centrelines. Each consumes a real shadow slot.
  const centers = [[991,650], [9,650], [800,9], [200,9], [500,9]];
  const windows = S.openings.filter(o => o.type === "window").map((o, i) => {
    const spot = new THREE.SpotLight();
    spot.position.set(centers[i][0], o.sill + o.height / 2, centers[i][1]);
    spot.distance = Math.max(o.width, o.height) * 4 + 260;
    spot.userData = { win: true, baseI: legacyIntensity(0.9, spot.distance) };
    return spot;
  });
  v.set_windowLights(windows);
  function casters(hour) {
    S.hour = hour;
    fitPracticalLights();
    return [sun, ...windows, ...fixtures.flatMap(g => g.children.filter(o => o.isLight))].filter(o => o.castShadow);
  }
  const casting = casters(17);
  assert.deepEqual(casting, casters(22));
  assert.equal(casting.length, 8);
  assert.deepEqual(windows.map(w => w.castShadow), [true, true, true, false, false]);
  const lamps = casting.filter(o => o.parent?.userData.item);
  assert.ok(lamps.some(l => ["ceilingLight", "pendant"].includes(l.parent.userData.item.type)));
  assert.ok(lamps.some(l => l.parent.userData.item.type === "floorLamp"));
  assert.ok(lamps.some(l => l.parent.userData.item.type === "tableLamp"));
  assert.ok(lamps.every(l => !l.userData.diffuseShade));

  const floorLamp = lamps.find(o => o.parent.userData.item.type === "floorLamp");
  const bulb = floorLamp.parent.children.find(o => o.material?.userData.glow);
  assert.ok(floorLamp.position.y < bulb.position.y && floorLamp.position.distanceTo(bulb.position) < 5,
    "lower aperture virtual source lies within the real bulb radius");
  assert.equal(floorLamp.decay, 2);
  assert.ok(floorLamp.isSpotLight && floorLamp.penumbra > 0.1);
  const overhead = lamps[0], source = overhead.getWorldPosition(new THREE.Vector3());
  const shadow = overhead.shadow;
  // Project into one face of the cube as r185 does. Even with both biases
  // a surface 1 cm in front of the floor must win the depth comparison.
  const project = cm => new THREE.Vector3(0, 0, -cm).applyMatrix4(shadow.camera.projectionMatrix).z * 0.5 + 0.5;
  assert.ok(project(250 - shadow.normalBias) + shadow.bias > project(249));
  for (const it of S.items.filter(i => ["sofa","armchair","coffee","table","chair"].includes(i.type))) {
    const group = buildItem(it);
    assert.equal(group.parent, root);
    group.updateMatrixWorld(true);
    // Project the seat/top towards the floor along the LIGHT ray. A side
    // chair's shadow can land beyond the vertical footprint of the chair.
    const mid = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    const ray = mid.sub(source);
    ray.multiplyScalar(-source.y / ray.y);
    const hits = new THREE.Raycaster(source, ray.clone().normalize(), 0, ray.length()).intersectObject(group);
    assert.ok(hits.some(h => h.object.castShadow && overhead.shadow.camera.layers.test(h.object.layers)), it.type);
  }

  const walls = v.set_structureRoot(new THREE.Group());
  v.set_scene(new THREE.Scene()).doors = [];
  for (const wall of S.walls) buildWall(wall);
  walls.updateMatrixWorld(true);
  function blocked(x, z, height, endX, endZ) {
    const start = new THREE.Vector3(x, height, z);
    const ray = new THREE.Vector3(endX - x, 0, endZ - z);
    return new THREE.Raycaster(start, ray.clone().normalize(), 0, ray.length())
      .intersectObject(walls).some(hit => hit.object.castShadow);
  }
  for (const height of [0.2, 7.1, 180, 245, 269.9]) {
    assert.ok(blocked(1020, 920, height, 970, 870), "solid exterior corner at " + height);
  }
  assert.ok(blocked(1020, 621, 245, 970, 621), "solid window head");
  assert.equal(blocked(1020, 621, 150, 970, 621), false, "daylight through glass");

  // The arc shade overhangs its base. If it crosses the partition, a
  // renderer without shadow maps must confine the light to the bulb's room.
  v.set_roomBounce({ rooms: detectRooms });
  const arc = buildItem({ ...floorLamp.parent.userData.item, id: null, variant: "arc", x: 390, z: 650, rot: 0 });
  fitPracticalLights();
  const sourceLight = arc.children.find(o => o.isLight);
  const tip = sourceLight.getWorldPosition(new THREE.Vector3());
  const rooms = detectRooms();
  const at = (x, z) => rooms.indexOf(roomContaining(x, z)) + 1;
  assert.notEqual(at(390, 650), at(tip.x, tip.z));
  assert.equal(sourceLight.userData.maskRoomUnshadowed, at(tip.x, tip.z));

  // Replay the same move both ways. A full fit is the reference for caster
  // ranking, world-space masks and the camera's finite range at each step.
  const group = floorLamp.parent, item = group.userData.item;
  const all = [...windows, ...fixtures.flatMap(g => g.fixture.lights), ...arc.fixture.lights];
  const { lighting } = createLightLoop(THREE, THREE.TSL);
  const node = lighting.getNode(v.scene);
  const start = { x: item.x, z: item.z };
  const other = rooms.filter(r => r !== roomContaining(start.x, start.z))
    .sort((a, b) => b.area - a.area)[0];
  const end = other.pts.reduce((p, q) => ({x: p.x + q.x / other.pts.length, z: p.z + q.z / other.pts.length}), {x: 0, z: 0});
  v.set_bounceRooms(rooms);
  let field;
  v.set_roomBounce({ rooms: () => rooms, setPathRecords() {}, setIrradiance(rgb) { field = rgb; } });
  function replay(incremental) {
    placeItem(group, { ...item, ...start });
    fitPracticalLights();
    fitBounceLights();
    let scans = 0, solves = 0;
    const traverse = v.scene.traverse;
    v.scene.traverse = function (visit) { scans++; return traverse.call(this, visit); };
    const frames = [];
    try {
      for (let i = 1; i <= 30; i++) {
        const k = i / 30;
        const before = itemBouncePlacement(group);
        placeItem(group, { ...item, x: start.x + k * (end.x - start.x), z: start.z + k * (end.z - start.z) });
        fitPracticalLights(incremental ? new Set([group]) : undefined);
        if (!incremental || before !== itemBouncePlacement(group)) { solves++; fitBounceLights(); }
        node.setLights(all);
        frames.push({ field, key: node.customCacheKey(), lights: all.map(l => [l.id, l.visible, l.castShadow,
          l.distance, l.shadow.camera.far, l.userData.maskRoom, l.userData.maskRoomUnshadowed]) });
      }
    } finally { v.scene.traverse = traverse; }
    return { scans, solves, frames };
  }
  const baseline = replay(false), moved = replay(true);
  assert.deepEqual(moved.frames, baseline.frames);
  assert.equal(baseline.scans, 30);
  assert.equal(baseline.solves, 30);
  assert.ok(moved.solves > 0 && moved.solves < 8, "irradiance changes when the lamp crosses rooms");
  assert.ok(moved.scans < 8, `a shadow-budget scan on ${moved.scans} / 30 frames`);
  const keys = new Set(moved.frames.map(f => f.key));
  assert.equal(keys.size, 1, "the generated floor lamp keeps the same casting set across rooms");
  const ranges = new Set(moved.frames.map(f => f.lights.filter(l => l[2]).map(l => l[4]).join("|")));
  t.diagnostic(`30 positions: scene scans ${baseline.scans} -> ${moved.scans}, irradiance solves ${baseline.solves} -> ${moved.solves}, ${keys.size} light key, ${ranges.size} caster range configurations`);
  const original = arc.userData.item;
  const signature = itemBouncePlacement(arc);
  for (const change of [{lightOn:false}, {lightI:0.2}, {lightColor:0x11aacc}, {elev:10}, {rot:180}]) {
    placeItem(arc, {...original, ...change});
    assert.notEqual(itemBouncePlacement(arc), signature, JSON.stringify(change));
    placeItem(arc, original);
  }
});

test("both PCF filters build one comparison graph and sample it five times", async t => {
  const { plannerPlanePCF, plannerCubePCF } = await import("../js/view3d/renderer_setup.js");
  for (const forceWebGL of [false, true]) for (const cube of [false, true]) {
    const depth = cube ? new THREE.CubeDepthTexture(512) : new THREE.DepthTexture(512, 512);
    depth.compareFunction = THREE.LessEqualCompare;
    const mat = new THREE.MeshBasicNodeMaterial();
    const filter = cube ? plannerCubePCF(TSL) : plannerPlanePCF(TSL);
    mat.colorNode = TSL.vec3(filter({
      depthTexture: depth, shadowCoord: TSL.positionWorld, bd3D: TSL.positionWorld.normalize(),
      dp: TSL.positionWorld.z, shadow: (cube ? new THREE.PointLight() : new THREE.DirectionalLight()).shadow,
    }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    const r = new THREE.WebGPURenderer({ canvas: { width: 1, height: 1, style: {} }, forceWebGL });
    // Code generation only. No adapter or graphics context is required.
    r.backend.renderer = r;
    r.hasFeature = () => false;
    r.hasCompatibility = feature => feature === THREE.Compatibility.TEXTURE_COMPARE;
    const b = r.backend.createNodeBuilder(mesh, r);
    b.scene = new THREE.Scene();
    b.camera = new THREE.PerspectiveCamera();
    let visits = 0;
    const getData = b.getDataFromNode;
    b.getDataFromNode = function (...args) { visits++; return getData.apply(this, args); };
    b.build();
    const compare = forceWebGL ? /texture\( \w+, vec[34]\(/g : /textureSampleCompare\(/g;
    const loop = b.fragmentShader.match(/^(\s*)for\s*\([^;]*= 0; i < 5; i \+\+ \) \{([\s\S]+?)^\1\}/m);
    assert.ok(loop, "five disk offsets in increasing order");
    assert.equal((loop[2].match(compare) || []).length, 1);
    assert.equal((b.fragmentShader.match(compare) || []).length, 1);
    const unrolledVisits = forceWebGL ? (cube ? 11483 : 6114) : (cube ? 12058 : 5045);
    assert.ok(visits < unrolledVisits * 0.8, `${visits} builder lookups for ${unrolledVisits} unrolled`);
    t.diagnostic(`${forceWebGL ? "GLSL" : "WGSL"} ${cube ? "cube" : "plane"}: ${unrolledVisits} -> ${visits} builder node-data lookups`);
  }
});

function makeFixture(type, variant) {
  const f = FURN[type];
  return buildItem({ type, variant, w: f.w, d: f.d, h: f.h, x: 0, z: 0, rot: 0 });
}
function emittedFlux(light) {
  if (light.userData.hemisphereSign) return light.intensity * Math.PI;
  return light.isSpotLight ? spotFlux(light.intensity, light.angle, light.penumbra) : pointFlux(light.intensity);
}

test("each built catalogue fitting distributes its own rated flux at its emitters", () => {
  v.set_itemsRoot(new THREE.Group());
  const cases = {
    floorLamp: ["column","tripod","drum","brass","arc","globe"],
    pendant: ["cone","dome","globe","drum","cage","brass","longDrop"],
    tableLamp: [null], wallLamp: [null], chandelier: [null], ceilingLight: [null],
    ceilingFan: [null], trackLight: [null], upper: [null], hood: [null], lightStrip: [null],
    aquarium: [null], fireplace: [null], led_grow_light: [null],
  };
  for (const [type, variants] of Object.entries(cases)) for (const variant of variants) {
    const group = makeFixture(type, variant), {lights, surfaces} = group.fixture;
    assert.ok(lights.length && surfaces.length, type);
    assert.ok(lights.every(l => l.decay === 2 && l.intensity > 0 && Number.isFinite(l.intensity)), type);
    const rated = fixtureLamp(FURN[type]).lumens * PLANNER_FLUX_SCALE;
    const escaped = lights.reduce((sum, l) => sum + emittedFlux(l), 0);
    const photoFlux = lights.reduce((sum,l) => sum + photoLampPower(l, 0.5), 0) * 4*Math.PI*Math.PI*70000;
    assert.ok(Math.abs(photoFlux - escaped*0.5) < 1e-6);
    assert.ok(escaped > 0 && escaped <= rated * 1.000001, type + " / " + variant);
    const shade = group.children.find(o => o.material?.userData.lampShade);
    const kind = shade?.material.userData.lampShade;
    if (kind === "linen") {
      const halo = lights.find(l => l.userData.diffuseShade);
      const fabric = surfaces.find(s => s.material === shade.material);
      assert.equal(lights.length, 3);
      assert.equal(halo.castShadow, false);
      const panel = group.children.find(o => o.material?.userData.lampShade === "opalPanel");
      assert.equal(lights.filter(l => l.isSpotLight && l.penumbra > 0.1).length, panel ? 1 : 2);
      if (panel) {
        assert.equal(lights[0].userData.hemisphereSign, -1);
        assert.ok(panel.material.emissiveIntensity > 0);
      } else assert.ok(lights[0].target.position.y < lights[0].position.y);
      assert.ok(lights[1].target.position.y > lights[1].position.y);
      assert.ok(Math.abs(Math.PI * fabric.area * fabric.material.emissiveIntensity - emittedFlux(halo)) < 1e-6);
      // Far-field illuminance on a facing wall from the fabric alone.
      const r = halo.userData.sourceRadius;
      assert.ok(halo.intensity / (40**2 + r*r) > 2.8 * halo.intensity / (80**2 + r*r));
    } else if (kind?.startsWith("opal")) {
      assert.ok(Math.abs(escaped / rated - 0.78) < 1e-8);
      assert.ok(shade.material.emissiveIntensity > 0);
    } else if (kind) {
      assert.equal(lights.length, 1);
      assert.ok(lights[0].isSpotLight && lights[0].target.position.y < lights[0].position.y);
      assert.equal(shade.material.emissive.getHex(), 0);
    } else {
      assert.ok(Math.abs(escaped / rated - 1) < 1e-8);
      if (type === "chandelier") assert.equal(lights.length, 6);
      if (type === "trackLight") assert.equal(lights.filter(l => l.isSpotLight).length, 3);
      if (type === "hood") assert.equal(lights.length, 2);
      if (type === "trackLight") assert.ok(surfaces.every(s => Math.abs(s.area - Math.PI * 2.5**2) < 0.5),
        "each emitting lens uses its visible disk area");
      if (type === "upper") assert.ok(lights.length > 1 && lights.every(l => l.userData.hemisphereSign === -1));
    }
    const it = group.userData.item, ids = lights.map(l => l.id);
    const base = lights.map(l => l.intensity), glow = surfaces.map(s => s.material.emissiveIntensity);
    for (const level of [0.2, 0, 1]) {
      placeItem(group, { ...it, lightI: level, lightOn: !!level, lightColor: 0xffaabb });
      assert.deepEqual(lights.map(l => l.id), ids);
      for (let i = 0; i < lights.length; i++) {
        assert.ok(Math.abs(lights[i].intensity - base[i] * level) < 1e-6);
        assert.equal(lights[i].visible, true);
      }
      surfaces.forEach((s, i) => assert.ok(Math.abs(s.material.emissiveIntensity - glow[i] * level) < 1e-6));
    }
  }
});

test("the full shadow budget, room map, PBR textures and finite emitters compile on both backends", async () => {
  const { createRoomBounce } = await import("../js/room_bounce.js");
  const { createLightLoop } = await import("../js/light_loop.js");
  const { plannerCubePCF, plannerPlanePCF } = await import("../js/view3d/renderer_setup.js");
  const { sceneShadowBudget } = await import("../js/light_loop.js");
  for (const forceWebGL of [false, true]) for (const kind of ["opaque", "glass", "packedGlass"]) {
    const r = new THREE.WebGPURenderer({ canvas: { width: 1, height: 1, style: {} }, forceWebGL });
    r.backend.renderer = r;
    r.hasFeature = () => false;
    r.hasCompatibility = f => f === THREE.Compatibility.TEXTURE_COMPARE;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene(), bounce = createRoomBounce(THREE, TSL);
    bounce.register(r);
    const loop = createLightLoop(THREE, TSL, bounce.loopMasks);
    r.lighting = loop.lighting;
    const mat = new THREE.MeshPhysicalNodeMaterial();
    mat.transmission = kind === "opaque" ? 0 : 0.72; // also bind the transmitted viewport colour on glass
    for (const name of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
      mat[name] = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    }
    if (kind === "packedGlass") mat.aoMap = mat.metalnessMap = mat.roughnessMap;
    const env = new THREE.DataTexture(new Uint16Array(4), 768, 1024, THREE.RGBAFormat, THREE.HalfFloatType);
    env.mapping = THREE.CubeUVReflectionMapping;
    scene.environment = env;
    bounce.confineSky(scene);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    mesh.receiveShadow = true;
    const lights = [bounce.light, new THREE.DirectionalLight()];
    scene.add(mesh);
    const budget = sceneShadowBudget([scene], 8);
    assert.equal(budget, kind === "glass" ? 7 : 8);
    for (let i = 1; i < budget; i++) lights.push(i % 2 ? new THREE.PointLight() : new THREE.SpotLight());
    for (const l of lights.slice(1)) {
      l.castShadow = true;
      l.shadow.filterNode = l.isPointLight ? plannerCubePCF(TSL) : plannerPlanePCF(TSL);
    }
    const halo = new THREE.PointLight(); halo.userData.sourceRadius = 15;
    lights.push(halo);
    scene.add(mesh, ...lights);
    const b = r.backend.createNodeBuilder(mesh, r);
    b.scene = scene;
    b.camera = new THREE.PerspectiveCamera();
    b.lightsNode = loop.lighting.getNode(scene).setLights(lights);
    b.environmentNode = scene.environmentNode;
    b.build();
    const shader = b.fragmentShader;
    const textures = shader.match(forceWebGL ? /uniform (?:highp |mediump |lowp )?sampler(?:2D|Cube)\w* /g : /: texture_(?:depth_|2d|cube)/g) || [];
    assert.ok(textures.length >= 14 && textures.length <= 16, textures.length + " sampled textures");
    assert.match(shader, /for\s*\(/, "unshadowed halo loop");
    const header = shader.match(/\bplannerWallHeader\s*=/g) || [];
    assert.equal(header.length, 1, "the entire fragment reads its wall record header once");
    const lightLoopStart = shader.search(/for\s*\([^;]+; i < (?!5;)/);
    assert.ok(shader.indexOf(header[0]) < lightLoopStart, "the header read precedes the loop over emitters");
    assert.match(shader, /plannerWallHeader\.z \+ plannerWallHeader\.w/, "an empty wall list bypasses ray traversal");
    assert.match(shader, forceWebGL ? /samplerCubeShadow/ : /texture_depth_cube/, "cube-shadow branch");
  }
});

test("a wall alongside the real linen shade has an unobstructed graded rim and a transmitted mid-band", () => {
  v.set_itemsRoot(new THREE.Group());
  for (const type of ["floorLamp", "tableLamp", "wallLamp"]) {
    const g = makeFixture(type), lights = g.fixture.lights;
    g.updateMatrixWorld(true);
    const shade = g.children.find(o => o.material?.userData.lampShade === "linen");
    const halo = lights.find(l => l.userData.diffuseShade);
    for (const beam of lights.filter(l => l.isSpotLight)) {
      const outer = beam.angle, inner = outer * (1 - beam.penumbra);
      const axis = beam.target.position.clone().sub(beam.position).normalize();
      const lateral = new THREE.Vector3(1, 0, 0);
      const rays = [inner, (inner + outer) / 2, outer - 1e-4].map(a =>
        axis.clone().multiplyScalar(Math.cos(a)).addScaledVector(lateral, Math.sin(a)));
      const distanceToWall = 60;
      const irradiance = rays.map(ray => {
        const distance = distanceToWall / ray.x;
        assert.equal(new THREE.Raycaster(beam.position, ray, 0, distance).intersectObject(shade).length, 0,
          type + " shade must not replace the graded lobe with a sharp silhouette");
        const t = Math.min(1, Math.max(0, (axis.dot(ray) - Math.cos(outer)) / (Math.cos(inner) - Math.cos(outer))));
        return t*t*(3-2*t) * beam.intensity * ray.x / (distance**2 + beam.userData.sourceRadius**2);
      });
      // Point-to-wall distance and incidence both vary along this cut.
      // Compare the profile after removing that known geometric factor.
      const profile = rays.map((ray, i) => irradiance[i] * ((distanceToWall / ray.x)**2 + beam.userData.sourceRadius**2) / (beam.intensity * ray.x));
      assert.ok(profile[0] > 0.99 && profile[1] > 0.2 && profile[1] < 0.8 && profile[2] < 0.001);
      assert.ok(distanceToWall * (1 / Math.tan(inner) - 1 / Math.tan(outer)) > 8,
        "penumbra spans centimetres on a wall, including without a shadow slot");
    }
    const midband = d => halo.intensity / (d*d + halo.userData.sourceRadius**2);
    assert.ok(midband(45) > 3 * midband(90));
  }
});

test("a drag invalidates shadow maps seeing the swept bounds or a changed source pose", () => {
  const scene = v.set_scene(new THREE.Scene());
  v.set_camera(new THREE.PerspectiveCamera());
  function spotlight(x, z, fixedWindow) {
    const spot = new THREE.SpotLight(0xffffff, 1, 200, Math.PI / 8);
    spot.position.set(0, 0, 0);
    spot.userData.win = fixedWindow;
    spot.userData.pooledLight = true;
    spot.castShadow = true;
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);
    scene.updateMatrixWorld();
    spot.shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
    spot.shadow.camera.near = 4;
    spot.shadow.updateMatrices(spot);
    spot.shadow.map = new THREE.RenderTarget(512, 512);
    v.drawnShadows.add(spot.shadow);
    return spot;
  }
  const windows = [[0,-1], [1,0], [0,1], [-1,0]].map(([x,z]) => spotlight(x, z, true));
  const movable = spotlight(0, 1, false);
  function boxAt(x, z, radius = 1) {
    return new THREE.Box3(new THREE.Vector3(x-radius, -radius, z-radius), new THREE.Vector3(x+radius, radius, z+radius));
  }
  function redraws(region) {
    v.syncShadowUpdates(false, region, false);
    return windows.map(spot => spot.shadow.autoUpdate);
  }
  const camera = windows[0].shadow.camera;
  const depth = z => new THREE.Vector3(0, 0, z).project(camera).z;
  assert.ok(depth(-1) < 0 && depth(-40) > 0 && depth(-40) < 1 && depth(-205) > 1);
  assert.deepEqual(redraws(boxAt(0, -40)), [true,false,false,false]);
  assert.equal(movable.shadow.autoUpdate, false, "a stationary fixture shares the same exclusion");
  movable.target.position.set(0, 0, -1);
  redraws(boxAt(0, -40));
  assert.equal(movable.shadow.autoUpdate, true, "an emitter turning in place redraws before testing its new cone");
  movable.position.x += 3;
  movable.target.position.set(3, 0, 1);
  redraws(boxAt(0, -40));
  assert.equal(movable.shadow.autoUpdate, true, "a translated emitter redraws even with the same orientation");
  assert.deepEqual(redraws(boxAt(0, -1, 0.1)), [false,false,false,false]);
  // A corner, but not the box center, is visible at the edge of the frustum.
  assert.deepEqual(redraws(boxAt(18, -40, 2)), [true,false,false,false]);
  // Leaving the beam must clear the shadow silhouette at the starting position.
  assert.deepEqual(redraws(boxAt(0, -40).union(boxAt(26, -40))), [true,false,false,false]);
  v.drawnShadows.delete(windows[1].shadow);
  assert.deepEqual(redraws(boxAt(0, -40)), [true,true,false,false], "a fresh or stale map still renders once");
  v.syncShadowUpdates(true, boxAt(0, -40), false);
  assert.ok(windows.every(spot => spot.shadow.autoUpdate), "whole-scene shadow refresh");
});

test("moving the seed-3 floor lamp leaves the two stationary table-lamp maps cached", () => {
  const built = executeCommand(apartmentGenerateCommand, {
    size: "large", replace: true, replaceInfrastructure: true, infrastructure: true, seed: 3,
  }, { domain: "planner", state: S, itemCatalog: FURN }, { history: false });
  assert.ok(built.ok);
  const scene = v.set_scene(new THREE.Scene());
  v.set_camera(new THREE.PerspectiveCamera());
  scene.add(v.set_itemsRoot(new THREE.Group()));
  const sun = v.set_sun(new THREE.DirectionalLight());
  sun.castShadow = true;
  scene.add(sun);
  v.set_roomBounce(null);
  v.set_renderer({ shadowMap: { enabled: true } });
  const rooms = detectRooms();
  const windows = S.openings.map(o => exteriorWindow(o, wallById(o.wall), rooms)).filter(Boolean).map(a => {
    const light = new THREE.SpotLight(0xffffff, a.baseI, a.reach, WINDOW_ANGLE, WINDOW_PENUMBRA);
    light.position.set(a.x, a.y, a.z);
    light.target.position.set(a.x + a.nx * 200, a.y - 70, a.z + a.nz * 200);
    light.userData = { win: true, baseI: a.baseI, aperture: a };
    scene.add(light, light.target);
    return light;
  });
  v.set_windowLights(windows);
  const groups = S.items.filter(it => fixtureLamp(FURN[it.type])).map(buildItem);
  fitPracticalLights();
  const group = groups.find(g => g.userData.item.type === "floorLamp"), item = group.userData.item;
  const tables = groups.filter(g => g.userData.item.type === "tableLamp");
  const spots = tables.flatMap(table => table.fixture.lights).filter(l => l.isSpotLight && l.castShadow);
  assert.equal(spots.length, 2);
  scene.updateMatrixWorld();
  for (const l of spots) {
    l.shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
    l.shadow.updateMatrices(l);
    l.shadow.map = new THREE.RenderTarget(512, 512);
    v.drawnShadows.add(l.shadow);
  }
  const from = roomContaining(item.x, item.z);
  const target = rooms.filter(r => r !== from).sort((a,b) => b.area-a.area)[0];
  const center = target.pts.reduce((p,q) => ({x:p.x+q.x/target.pts.length, z:p.z+q.z/target.pts.length}), {x:0,z:0});
  const start = {x:item.x, z:item.z};
  let withinRange = 0, scheduled = 0;
  for (let i = 1; i <= 30; i++) {
    const box = new THREE.Box3().setFromObject(group), k = i / 30;
    placeItem(group, {...item, x:start.x + (center.x-start.x)*k, z:start.z + (center.z-start.z)*k});
    box.union(new THREE.Box3().setFromObject(group));
    v.syncShadowUpdates(false, box, false);
    for (const light of spots) {
      if (!light.distance || box.distanceToPoint(light.getWorldPosition(new THREE.Vector3())) < light.distance) withinRange++;
      if (light.shadow.autoUpdate) scheduled++;
    }
  }
  assert.equal(withinRange, 60);
  assert.equal(scheduled, 0);
});

test("cached point shadows clear and render only affected faces on both backends", () => {
  for (const coordinateSystem of [THREE.WebGPUCoordinateSystem, THREE.WebGLCoordinateSystem]) {
    const scene = new THREE.Scene(), light = new THREE.PointLight();
    const shadow = light.shadow;
    const node = new THREE.PointLightNode(light).setupShadowNode();
    node.shadowMap = new THREE.CubeRenderTarget(512);
    node.shadowMap.depthTexture = new THREE.DepthTexture(512, 512);
    const faces = [], clears = [], matrices = [];
    let face;
    const renderer = { coordinateSystem, getClearColor() {}, getClearAlpha() {}, setClearColor() {},
      setRenderTarget(target, index) { face = index; }, clear() { clears.push(face); },
      render(scene, camera) { faces.push(face); matrices[face] = camera.matrixWorldInverse.toArray(); } };
    shadow.camera.coordinateSystem = coordinateSystem;
    installPlannerGpuPatches(THREE, renderer);
    shadow.camera.updateProjectionMatrix();
    shadow.plannerRegionRenderer = renderer;
    function draw() {
      faces.length = clears.length = 0;
      node.renderShadow({ scene, renderer });
      assert.deepEqual(clears, faces);
      return faces.slice();
    }
    assert.equal(draw().length, 6);
    const full = matrices.slice();
    shadow.plannerRegion = new THREE.Box3(new THREE.Vector3(-10,-10,-10), new THREE.Vector3(10,10,10));
    assert.equal(draw().length, 6);
    assert.deepEqual(matrices, full, "all six regional views match three's original cameras exactly");
    shadow.plannerRegion = new THREE.Box3(new THREE.Vector3(19,-1,-1), new THREE.Vector3(21,1,1));
    assert.deepEqual(draw(), [0]);
    shadow.plannerRegion.max.y = 21;
    assert.deepEqual(draw(), [0, coordinateSystem === THREE.WebGPUCoordinateSystem ? 3 : 2]);
    light.position.x++;
    light.updateMatrixWorld();
    assert.equal(draw().length, 6);
    light.distance = 800;
    assert.equal(draw().length, 6);
    shadow.plannerRegion = null;
    assert.equal(draw().length, 6);
  }
});

test("a moving fixture's changing reach respects the region cadence and release drains the maps", () => {
  const scene = v.set_scene(new THREE.Scene());
  const root = v.set_itemsRoot(new THREE.Group());
  scene.add(root);
  v.set_windowLights([]);
  v.set_roomBounce(null);
  v.set_renderer({ shadowMap: { enabled: true } });
  v.set_camera(new THREE.PerspectiveCamera());
  S.nodes = [[0,0],[2000,0],[2000,700],[0,700]].map(([x,z]) => ({x,z}));
  S.walls = [[0,1],[1,2],[2,3],[3,0]].map(([a,b],i) => ({id:i+1,a,b,thick:10,height:250}));
  const lamp = { type:"floorLamp", id:"paced", x:50, z:350, rot:0, w:28, d:28, h:145 };
  S.items = [lamp];
  const g = buildItem(lamp), moved = new Set([g]);
  const sunlight = v.set_sun(new THREE.DirectionalLight());
  sunlight.castShadow = true;
  scene.add(sunlight);
  fitPracticalLights();
  const spot = g.fixture.lights.find(l => l.castShadow);
  assert.ok(spot?.isSpotLight);
  spot.shadow.map = new THREE.RenderTarget(512,512);
  v.syncShadowUpdates(true, null, false);
  const ranges = new Set(), counts = [0,0];
  let region = new THREE.Box3();
  for (let i=1; i<=30; i++) {
    region.union(new THREE.Box3().setFromObject(g));
    lamp.x += 8;
    placeItem(g,lamp);
    region.union(new THREE.Box3().setFromObject(g));
    fitPracticalLights(moved);
    ranges.add(spot.distance);
    const batch = i%6 === 0;
    v.syncShadowUpdates(false, batch ? region : null, false, true);
    if (batch) region = new THREE.Box3();
    const draws = [spot,sunlight].map(l => Number(l.shadow.autoUpdate));
    assert.ok(draws[0]+draws[1] <= 1);
    counts[0] += draws[0]; counts[1] += draws[1];
    if (draws[0]) spot.shadow.updateMatrices(spot);
  }
  v.syncShadowUpdates(false,null,false,false);
  counts[0] += Number(spot.shadow.autoUpdate); counts[1] += Number(sunlight.shadow.autoUpdate);
  assert.equal(ranges.size,30);
  assert.deepEqual(counts,[5,5]);
});
