// The planner's indirect light (js/room_bounce.js): split-flux interreflection
// per room, drawn into a plan map that the one bounce light reads. Behaviour,
// not source text: what lands in which room.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.core.js";
import { diffuseReflectance, roomSurfaceFinishes } from "../js/room_bounce.js";
import {
  GRID,
  pointFlux,
  spotFlux,
  roomArea,
  roomSurface,
  splitFluxIrradiance,
  rasterRooms,
  roomAt,
  roomIrradiance,
  UNMASKED,
  SKY_ONLY,
  roomNumberAt,
  lightMaskRoom,
  facingRoom,
  maskAdmits,
  skyAdmits,
  ceilingTop,
  createRoomBounce,
  volumeRoom,
  ROOM_ATLAS_WIDTH,
  packPlanMap,
  planBounds,
  STOREY_LAYERS,
  effectiveMaskRoom,
} from "../js/room_bounce.js";

const rect = (x0, z0, x1, z1, ceilH = 250) => ({
  pts: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }],
  ceilH,
});
// two 4 × 4 m rooms sharing the wall at x = 400
const lounge = rect(0, 0, 400, 400);
const bath = rect(400, 0, 800, 400);
const WHITE = [1, 1, 1];

test("texture-average reflectance decodes sRGB, multiplies tint and removes metal reflection", () => {
  const data = new Uint8Array([0, 128, 255, 255, 255, 128, 0, 255]);
  const map = new THREE.DataTexture(data, 2, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({map, metalness: 0.25});
  mat.color.setRGB(0.5, 0.25, 1);
  const expected = [0.1875, 0.25 * 0.75 * ((128 / 255 + 0.055) / 1.055) ** 2.4, 0.375];
  diffuseReflectance(mat).forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-8));
  mat.bounceMap = map;
  mat.bounceTint = new THREE.Color().setRGB(0, 1, 0);
  assert.equal(diffuseReflectance(mat)[0], 0, "node-material tint");
  data.fill(255); map.needsUpdate = true;
  assert.equal(diffuseReflectance(mat)[1], 0.9 * 0.75, "changed pixels and capped white albedo");
});

function surfaceFixture() {
  const a = {...rect(0, 0, 100, 100, 100), key: "1,2,3,4"};
  const b = {...rect(100, 0, 200, 100, 100), key: "2,5,6,7"};
  const nodes = [...a.pts, ...b.pts.slice(1, 3)];
  const state = {roomMeta: {}, wallColor: 0, nodes, openings: [],
    walls: [[0,1],[1,2],[2,3],[3,0],[1,4],[4,5],[5,2]].map(([a,b], i) => ({id:i+1,a,b,height:100}))};
  const structure = new THREE.Group(), items = new THREE.Group(), rooms = [a,b];
  const paint = new THREE.MeshStandardMaterial({color: 0});
  for (const r of rooms) for (const role of ["floor", "ceilingHidden"]) {
    const mesh = new THREE.Mesh(undefined, paint);
    Object.assign(mesh.userData,{role,roomKey:r.key});
    structure.add(mesh);
  }
  const finishes = () => roomSurfaceFinishes(rooms, structure, items, state, THREE, 100);
  return {rooms,state,items,structure,finishes};
}

test("repainting a wall changes RGB bounce, transferred only through an actual opening", () => {
  const {rooms,state,structure,finishes} = surfaceFixture();
  const group = new THREE.Group(); group.userData.wall = state.walls[0];
  const surface = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial());
  surface.userData.wallLayer = {layerId:"paint"}; group.add(surface); structure.add(group);
  surface.material.color.setRGB(0.75, 0, 0);
  const source = [{x: 50, z: 50, flux: 60000}];
  let f = finishes();
  assert.deepEqual(f[0].rho, [0.125,0,0], "one of six equal-area surfaces");
  assert.deepEqual(roomIrradiance(rooms, source, f), [[1/7,0,0],[0,0,0]]);
  surface.material.color.setRGB(0, 0, 0.75);
  state.openings.push({type:"door", wall:2, width:80,height:80, frHead:0, frJamb:0, open:true});
  f = finishes();
  const [near,far] = roomIrradiance(rooms,source,f);
  assert.ok(near[2] > far[2] && far[2] > 0);
  assert.equal(far[0]+far[1],0);
  assert.ok(Math.abs(far[2] - near[2] * (6400/60000)) < 1e-7,
    "flux through the door is proportional to its open area");
  state.openings[0].open = false;
  assert.deepEqual(roomIrradiance(rooms,source,finishes())[1], [0,0,0]);
});

test("a rug replaces its floor footprint and its upper pile sets the reflected colour", () => {
  const {rooms,state,items,structure,finishes} = surfaceFixture();
  structure.children[0].material = new THREE.MeshStandardMaterial({color: 0x0000ff});
  const g = new THREE.Group();
  g.position.set(50,0,50); g.userData.item = {x:50, z:50, type:"rug"}; items.add(g);
  for (const [y, color] of [[0.5,0x0000ff],[1.5,0xff0000]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(100,1,100),new THREE.MeshStandardMaterial({color}));
    m.position.y = y; g.add(m);
  }
  const entry = finishes()[0];
  assert.ok(Math.abs(entry.area - 60800) < 1e-6);
  assert.ok(Math.abs(entry.rho[0] - 10400 * 0.9/60800) < 1e-6);
  assert.ok(Math.abs(entry.rho[2] - 400 * 0.9/60800) < 1e-6);
  g.userData.item.x = 150;
  const moved = roomSurfaceFinishes(rooms, structure, items, state, THREE, 100);
  assert.deepEqual(moved[0].rho, [0,0,0.15], "moving the piece uncovers the blue floor");
  assert.ok(moved[1].rho[0] > 0, "its new room receives the red bounce");
});

test("a corridor's paired passages exchange flux only across touching wall runs", () => {
  const {rooms, state, finishes} = surfaceFixture();
  // A second run bounds the room on the far side of the adjoining walls.
  rooms[1].key = "5,6,7,8";
  state.nodes.push({x:112,z:0}, {x:112,z:100});
  state.walls.push({id:8, a:6, b:7, height:100, thickness:12});
  state.openings = [
    {id:10,type:"passage",wall:2,width:60,height:80,s:50,paired:[10,11]},
    {id:11,type:"passage",wall:8,width:60,height:80,s:60,paired:[10,11]},
  ];
  assert.deepEqual(finishes()[0].portals, [{room:1,area:50*80}]);
  state.nodes[6].x = state.nodes[7].x = 300;
  assert.deepEqual(finishes()[0].portals, [], "far walls sharing pair IDs are never coupled");
});

test("light entering one room never reaches the room behind its wall", () => {
  const rooms = [lounge, bath];
  const window = { x: 10, z: 200, flux: spotFlux(5e6, Math.PI * 0.44, 1), color: WHITE };
  const [inLounge, inBath] = roomIrradiance(rooms, [window], 0.5);
  assert.ok(inLounge[0] > 0, "the room with the window is lit");
  assert.deepEqual(inBath, [0, 0, 0], "the windowless room beside it stays dark");
});

test("the plan map gives each texel to the room it lies in, walls exactly", () => {
  const grid = rasterRooms([lounge, bath]);
  assert.equal(grid.size, GRID);
  assert.equal(roomAt(grid, 200, 200), 0);
  assert.equal(roomAt(grid, 600, 200), 1);
  // Points on either side of the shared wall land in their own room.
  assert.equal(roomAt(grid, 400 - 15, 200), 0);
  assert.equal(roomAt(grid, 400 + 15, 200), 1);
  // the padded margin round the house is outside every room
  assert.equal(roomAt(grid, -20, 200), -1);
  assert.equal(roomAt(grid, 820, 200), -1);
});

test("an L-shaped room is filled along its outline, not its bounding box", () => {
  const L = {
    pts: [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 300 }, { x: 300, z: 300 }, { x: 300, z: 600 }, { x: 0, z: 600 }],
    ceilH: 250,
  };
  const grid = rasterRooms([L]);
  assert.equal(roomAt(grid, 150, 450), 0);
  assert.equal(roomAt(grid, 450, 150), 0);
  assert.equal(roomAt(grid, 450, 450), -1, "the notch is not part of the room");
});

test("a 30 m house still fits the fixed-size map", () => {
  const grid = rasterRooms([rect(0, 0, 3000, 1200), rect(0, 1200, 900, 2000)]);
  assert.equal(grid.size, GRID);
  assert.equal(grid.index.length, GRID * GRID);
  assert.ok(grid.cell < 7, "a few centimetres per texel");
  assert.equal(roomAt(grid, 2900, 100), 0);
  assert.equal(roomAt(grid, 800, 1900), 1);
});

test("split-flux: Φρ / (A(1−ρ)) over floor, ceiling and walls", () => {
  assert.equal(roomArea(lounge.pts), 160000);
  assert.equal(roomSurface(lounge), 2 * 160000 + 1600 * 250);
  const A = roomSurface(lounge);
  assert.equal(splitFluxIrradiance(1000, A, 0.5), 1000 / A);
  assert.equal(splitFluxIrradiance(0, A, 0.5), 0);
  const [e] = roomIrradiance([lounge], [{ x: 200, z: 200, flux: 1000, color: [1, 0.5, 0] }], 0.5);
  assert.deepEqual(e, [1000 / A, 500 / A, 0], "the bounce keeps the colour of the light that came in");
});

test("flux of three's lights: 4πI for a point, the smoothstep cone for a spot", () => {
  assert.equal(pointFlux(10), 40 * Math.PI);
  assert.equal(pointFlux(-1), 0);
  // a hard-edged spot: the full cone
  const a = Math.PI / 3;
  assert.ok(Math.abs(spotFlux(1, a, 0) - 2 * Math.PI * (1 - Math.cos(a))) < 1e-12);
  // penumbra 1: numeric integral of smoothstep(cos a, 1, cos θ) over the sphere
  const n = 20000;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) / n) * a, x = (Math.cos(t) - Math.cos(a)) / (1 - Math.cos(a));
    sum += x * x * (3 - 2 * x) * Math.sin(t) * (a / n);
  }
  assert.ok(Math.abs(spotFlux(1, a, 1) - 2 * Math.PI * sum) < 1e-4);
});

test("a source outside every room lights none of them", () => {
  const out = roomIrradiance([lounge, bath], [{ x: -300, z: 200, flux: 1e6, color: WHITE }], 0.5);
  assert.deepEqual(out, [[0, 0, 0], [0, 0, 0]]);
});

/* ---- the masks: the plan map stops what has no shadow map ----
   A surface is a point and the normal of the face it lies on; the map gives
   it a room number (0 outside), as each fragment reads it on the GPU. */
const WALL_T = 12;
const twoRooms = [lounge, bath];
const grid2 = rasterRooms(twoRooms);
const surface = (x, z, nx = 0, nz = 0, y = 100, ny = 0) => ({ room: facingRoom(grid2, x, z, nx, nz), y, ny });
const reaches = (maskRoom, s) => maskAdmits(maskRoom, s.room, skyAdmits(s.room, s.y, s.ny, ceilingTop(twoRooms)));
// the faces of the shared wall at x = 400, and of the lounge's outer wall at x = 0
const loungeSide = surface(400 - WALL_T / 2, 200, -1, 0);
const bathSide = surface(400 + WALL_T / 2, 200, 1, 0);
const facade = surface(-WALL_T / 2, 200, -1, 0);
const loungeInside = surface(WALL_T / 2, 200, 1, 0);

test("a lamp without a shadow lights its own room and stops at the wall", () => {
  // a floor lamp 35 cm from the partition: its sphere of light crosses it
  const mask = lightMaskRoom(twoRooms, 365, 200, false);
  assert.equal(mask, 1);
  assert.ok(reaches(mask, surface(200, 200, 0, 0, 0, 1)), "the lounge floor");
  assert.ok(reaches(mask, loungeSide), "its own face of the partition");
  assert.ok(!reaches(mask, bathSide), "not the bathroom's face of it");
  assert.ok(!reaches(mask, surface(450, 200, 0, 0, 0, 1)), "nor the bathroom floor just behind it");
  assert.ok(!reaches(mask, facade), "nor the house's outside");
});

test("a light that casts is left to its shadow map", () => {
  const mask = lightMaskRoom(twoRooms, 365, 200, true);
  assert.equal(mask, UNMASKED);
  // the shadow stops it at the wall and lets it through a doorway; the mask must not do either
  assert.ok(reaches(mask, bathSide));
});

test("a lamp in the garden lights the facade, not the rooms behind it", () => {
  const mask = lightMaskRoom(twoRooms, -120, 200, false);
  assert.equal(mask, 0);
  assert.ok(reaches(mask, facade));
  assert.ok(!reaches(mask, loungeInside), "the inner face of the same wall stays dark");
});

test("the sky reaches only what no ceiling covers", () => {
  const top = ceilingTop(twoRooms);
  assert.equal(top, 250);
  const sky = (s) => reaches(SKY_ONLY, s);
  assert.ok(!sky(surface(600, 200, 0, 0, 0, 1)), "a windowless room's floor, under its hidden ceiling");
  assert.ok(!sky(bathSide), "or its walls");
  assert.ok(!sky(surface(600, 200, 0, 0, 250, -1)), "or the underside of its ceiling");
  assert.ok(!sky(surface(600, 200, 0, 0, 249, 1)), "a shelf just below the ceiling stays indoors");
  assert.ok(sky(surface(600, 200, 0, 0, 250, 1)), "the top of a flat roof is under the sky");
  assert.ok(sky(surface(600, 200, 0, 0, 330, 0)), "and so is everything above the ceilings");
  assert.ok(sky(facade), "an outer wall face");
  assert.ok(sky(surface(-200, 200, 0, 0, 0, 1)), "the garden");
  // A chair back 1 cm from the plaster faces the wall. Its normal cannot
  // carry the lookup right through the wall centreline into the bathroom.
  assert.equal(surface(400 - WALL_T / 2 - 1, 200, 1, 0).room, 1);
});

test("a taller room raises the line the sky starts at", () => {
  assert.equal(ceilingTop([lounge, rect(400, 0, 800, 400, 320)]), 320);
  assert.equal(ceilingTop([], 250), 250);
});

test("slab and roof faces share XY but only their room-facing side receives a practical or bounce", () => {
  const top = 232.3753, tall = 320;
  for (const [y, ny, inside, sky] of [
    [-1,1,false,false], [0,-1,false,false], [0,1,true,false],
    [top-0.5,1,true,false], [top,-1,true,false], [top,1,false,true],
    [top+0.5,-1,false,true],
  ]) {
    assert.equal(volumeRoom(1,y,ny,top) === 1, inside);
    assert.equal(maskAdmits(1,volumeRoom(1,y,ny,top),skyAdmits(1,y,ny,top)), inside);
    assert.equal(skyAdmits(1,y,ny,top),sky);
  }
  assert.equal(volumeRoom(2,top+0.5,1,tall),2, "the taller adjacent room retains its field at that height");
});

test("bounce and mask node graphs share one atlas binding with accurate per-storey ceiling heights", async () => {
  const gpu = await import("../vendor/three/three.webgpu.js");
  const bounce = createRoomBounce(gpu,gpu.TSL);
  const shown = [rect(0,0,400,400,232.3753),rect(400,0,800,400,309.937)];
  const upper = [{...shown[0],ceilH:277.1234}];
  const place = new gpu.Vector4();
  bounce.setRooms(shown,250,[{rooms:upper,place,dy:310}]);
  bounce.setIrradiance([[1,2,3],[4,5,6]],[[[7,8,9]]]);
  const plan = bounce.loopMasks.hoist()[0], map = plan.value, image = map.image;
  assert.equal(image.width, ROOM_ATLAS_WIDTH);
  assert.deepEqual(place.toArray(), [1,310,2,1]);
  const read = (x,z) => {
    const off = (z * image.width + x) * 4;
    return Array.from(image.data.subarray(off,off+4), gpu.DataUtils.fromHalfFloat);
  };
  const bounds = planBounds([shown,upper]);
  for (const [x,layer,local,top,rgb] of [
    [200,0,1,232.3753,[1,2,3]],[600,0,2,309.937,[4,5,6]],[200,1,1,277.1234,[7,8,9]]
  ]) {
    const col = Math.floor((x-bounds.x0)*GRID/bounds.span);
    const row = Math.floor((200-bounds.z0)*GRID/bounds.span);
    const [lo,hi,coarse,fine] = read(col,row+layer*GRID);
    assert.equal(lo+hi*256,local);
    assert.ok(Math.abs(coarse*4+fine-top)<0.002);
    assert.deepEqual(read(GRID+Math.floor(local/GRID),layer*GRID+local%GRID).slice(0,3),rgb);
    assert.deepEqual(read(GRID,layer*GRID).slice(0,3),[0,0,0], "exterior field zero in every layer");
  }
  let LightNode, irradiance;
  bounce.register({library:{lightNodes:new Map(),addLight(cls){LightNode=cls;}}});
  new LightNode(bounce.light).setup({context:{irradiance:{addAssign(node){irradiance=node;}}}});
  const nodes = [bounce.loopMasks.lightOpen(gpu.TSL.float(1)), irradiance];
  for (const node of nodes) {
    const maps = new Set();
    node.traverse(child => { if (child.isTextureNode) maps.add(child.value); });
    assert.deepEqual([...maps],[map], "shared texture even where both plan and field are sampled");
  }
  const activeRecords = new Float32Array((GRID+2)*4);
  activeRecords.set([2,9,0,3],0);
  activeRecords.set([14,15,16,17],(GRID+1)*4);
  bounce.setPathRecords([activeRecords,Float32Array.from([21,22,23,24])]);
  assert.equal(plan.value,map,"width growth retains the same texture and graph");
  assert.equal(map.image.width,ROOM_ATLAS_WIDTH+2);
  const grownRead = (x,y) => {
    const k = (y * map.image.width + x) * 4;
    return Array.from(map.image.data.subarray(k,k+4),gpu.DataUtils.fromHalfFloat);
  };
  assert.deepEqual(grownRead(ROOM_ATLAS_WIDTH,0),[2,9,0,3]);
  assert.deepEqual(grownRead(ROOM_ATLAS_WIDTH+1,1),[14,15,16,17]);
  assert.deepEqual(grownRead(ROOM_ATLAS_WIDTH,GRID),[21,22,23,24]);
  assert.deepEqual(grownRead(GRID,GRID+1).slice(0,3),[7,8,9],"existing room fields survive growth");
  bounce.setIrradiance([[2,3,4],[5,6,7]],[[[8,9,10]]]);
  assert.deepEqual(grownRead(GRID,GRID+1).slice(0,3),[8,9,10],"relight respects the new row stride");
  assert.deepEqual(grownRead(ROOM_ATLAS_WIDTH+1,1),[14,15,16,17],"relight preserves wall path records");
  const storage = map.image, layout = storage.data;
  let disposals = 0;
  map.addEventListener("dispose", () => { disposals++; });
  const atRoom = (x,z) => grownRead(Math.floor((x-bounds.x0)*GRID/bounds.span), Math.floor((z-bounds.z0)*GRID/bounds.span));
  const geometryBefore = atRoom(600,200);
  bounce.setPathRecords([Float32Array.from([4,3,2,1]),new Float32Array()]);
  assert.equal(map.image,storage);
  assert.equal(map.image.data,layout);
  assert.equal(disposals,0,"changing records within capacity retains allocated texture storage");
  assert.deepEqual(atRoom(600,200),geometryBefore);
  assert.deepEqual(grownRead(GRID,GRID+1).slice(0,3),[8,9,10],"record-only edit leaves the irradiance strip intact");
  assert.deepEqual(grownRead(ROOM_ATLAS_WIDTH,0),[4,3,2,1]);
  const version = map.version;
  bounce.setPathRecords([Float32Array.from([4,3,2,1]),new Float32Array()]);
  bounce.setIrradiance([[2,3,4],[5,6,7]],[[[8,9,10]]]);
  assert.equal(map.version,version,"identical packed fields and wall records reuse the GPU texture");
  bounce.setIrradiance([[2,3,4],[5,6,7]],[[[8,9,11]]]);
  assert.ok(map.version > version,"a change confined to an upper floor still uploads");
  assert.ok(bounce.loopMasks.lightOpen(gpu.TSL.float(1),gpu.TSL.vec3(10,80,20)).isNode);
});

test("the map's alpha is the room number the lights are masked to", () => {
  const out = packPlanMap(grid2, [[1, 2, 3], [4, 5, 6]], (v) => v, new Float32Array(GRID * GRID * 4));
  const at = (x, z) => {
    const i = Math.floor((x - grid2.x0) / grid2.cell), j = Math.floor((z - grid2.z0) / grid2.cell);
    return Array.from(out.slice((j * GRID + i) * 4, (j * GRID + i) * 4 + 4));
  };
  assert.deepEqual(at(200, 200), [1, 2, 3, roomNumberAt(twoRooms, 200, 200)]);
  assert.deepEqual(at(600, 200), [4, 5, 6, roomNumberAt(twoRooms, 600, 200)]);
  assert.deepEqual(at(-20, 200), [0, 0, 0, 0], "outside every room: no bounce, room 0");
  assert.equal(roomNumberAt(twoRooms, 600, 200), 2);
  assert.equal(roomNumberAt(twoRooms, -20, 200), 0);
});

test("a casting light falls back to its room where no shadow map is drawn", () => {
  // the lamp beside the partition casts in the main view...
  const casting = lightMaskRoom(twoRooms, 365, 200, true), own = lightMaskRoom(twoRooms, 365, 200, false);
  assert.equal(effectiveMaskRoom(casting, own, true), UNMASKED, "its shadow map stops it");
  // ...but the inspector preview draws no shadows: there it is masked to its room
  const preview = effectiveMaskRoom(casting, own, false);
  assert.equal(preview, 1);
  assert.ok(!reaches(preview, bathSide), "so it does not light the bathroom side of the wall");
  // the sun: shadowed in the main view, sky-only without its map
  assert.equal(effectiveMaskRoom(UNMASKED, SKY_ONLY, false), SKY_ONLY);
  // a light the planner never masked (a game's, the preview's studio lights) stays stock
  assert.equal(effectiveMaskRoom(undefined, undefined, false), UNMASKED);
  assert.equal(effectiveMaskRoom(2, 2, false), 2);
});

test("each storey keeps its own rooms in its own layer of the map", () => {
  // a ground floor of two rooms and, over it, one storey that is a single room
  const upstairs = [rect(0, 0, 800, 400)];
  const b = planBounds([twoRooms, upstairs]);
  const ground = rasterRooms(twoRooms, GRID, b), upper = rasterRooms(upstairs, GRID, b);
  assert.equal(ground.x0, upper.x0, "one square for every storey: the shader maps x and z once");
  assert.equal(ground.cell, upper.cell);
  assert.ok(STOREY_LAYERS >= 2);
  const out = new Float32Array(GRID * GRID * STOREY_LAYERS * 4);
  packPlanMap(ground, [[1, 1, 1], [0, 0, 0]], (v) => v, out);
  packPlanMap(upper, [[5, 5, 5]], (v) => v, out, twoRooms.length, GRID * GRID);
  const at = (layer, x, z) => {
    const i = Math.floor((x - b.x0) / ground.cell), j = Math.floor((z - b.z0) / ground.cell);
    const t = (layer * GRID * GRID + j * GRID + i) * 4;
    return Array.from(out.slice(t, t + 4));
  };
  // the dark bathroom downstairs stays dark, the lit room over it stays lit
  assert.deepEqual(at(0, 600, 200), [0, 0, 0, 2]);
  assert.deepEqual(at(1, 600, 200), [5, 5, 5, 3], "numbered after the storey below: no lamp mask matches across a slab");
  assert.notEqual(at(1, 600, 200)[3], lightMaskRoom(twoRooms, 600, 200, false),
    "a lamp in the bathroom does not light the room over it");
});
