import test from "node:test";
import assert from "node:assert/strict";
import { wallPathRecords } from "../js/light_loop.js";
import { createRoomBounce } from "../js/room_bounce.js";

const room = pts => ({ key: "1,2,3,4", pts: pts.map(([x,z]) => ({x,z})) });
function building(polygon, partition) {
  const pts = polygon.pts;
  const nodes = pts.map((p, i) => ({...p, id: i}));
  const walls = pts.map((_, i) => ({id:i+1, a:i, b:(i+1)%pts.length, height:250}));
  if (partition) {
    const n = nodes.length;
    nodes.push({id:n, x:100, z:0}, {id:n+1, x:100, z:200});
    walls.push({id:"screen", a:n, b:n+1, height:140});
  }
  return {nodes, walls, openings:[]};
}

// Decode the exact records consumed by the two generated shader backends.
function blocks(data, roomId, from, to) {
  const [sh,sl,ch,cl] = data.slice(roomId*4, roomId*4+4);
  const start = sh*1024+sl, count = ch*1024+cl;
  const [hx,lx,hz,lz] = data.slice(start*4,start*4+4);
  const rx = to[0]-from[0], rz = to[2]-from[2];
  for (let i=0;i<count;i++) {
    const k = (start+1+2*i)*4;
    const [ax,az,dx,dz,lo,ha,hb] = data.slice(k,k+7);
    const x = ax+hx*4096+lx-from[0], z = az+hz*4096+lz-from[2];
    const det = rx*dz-rz*dx;
    if (!det) continue;
    const t = (x*dz-z*dx)/det, u=(x*rz-z*rx)/det;
    const y = from[1]+t*(to[1]-from[1]);
    if (t>0 && t<1 && u>=0 && u<=1 && y>=lo && y<=ha+u*(hb-ha)) return true;
  }
  return false;
}

test("unshadowed paths respect a concave corner even with both endpoints in one room", () => {
  const r = room([[0,0],[400,0],[400,140],[140,140],[140,400],[0,400]]);
  const data = wallPathRecords([r],building(r));
  assert.ok(blocks(data,1,[340,90,80],[80,90,340]));
  assert.ok(!blocks(data,1,[340,90,80],[80,90,80]));
  assert.ok(blocks(data,0,[-30,90,100],[430,90,100]), "an outdoor lamp cannot shine through the whole building");
});
test("a partition admits rays over its top or through a doorway", () => {
  const r=room([[0,0],[400,0],[400,400],[0,400]]), state=building(r,true);
  const packed=()=>wallPathRecords([r],state);
  assert.ok(blocks(packed(),1,[40,80,100],[220,80,100]));
  assert.ok(!blocks(packed(),1,[40,180,100],[220,180,100]));
  state.openings.push({type:"door",wall:"screen",s:100,width:60,height:100,open:true});
  assert.ok(!blocks(packed(),1,[40,80,100],[220,80,100]));
  assert.ok(blocks(packed(),1,[40,120,100],[220,120,100]));
  state.openings[0].open=false;
  assert.ok(blocks(packed(),1,[40,80,100],[220,80,100]));
  const empty=wallPathRecords([r],building(r));
  assert.equal(empty[7],0,"a convex room with no partition has zero ray tests");
});

test("shadowless receivers share wall-intersection and emitter arithmetic", async t => {
  const THREE = await import("../vendor/three/three.webgpu.js");
  for (const forceWebGL of [false, true]) {
    const renderer = new THREE.WebGPURenderer({canvas: {width: 1, height: 1, style: {}}, forceWebGL});
    renderer.backend.renderer = renderer;
    renderer.hasFeature = () => false;
    renderer.hasCompatibility = f => f === THREE.Compatibility.TEXTURE_COMPARE;
    const bounce = createRoomBounce(THREE, THREE.TSL);
    bounce.register(renderer);
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial());
    const lights = Array.from({length: 6}, () => new THREE.PointLight());
    scene.add(mesh, ...lights);
    const builder = renderer.backend.createNodeBuilder(mesh, renderer);
    builder.lightsNode = new THREE.LightsNode().setLights(lights);
    builder.scene = scene;
    builder.camera = new THREE.PerspectiveCamera();
    let lookups = 0;
    const getData = builder.getDataFromNode;
    builder.getDataFromNode = function (...args) { lookups++; return getData.apply(this, args); };
    builder.build();
    const inlineLookups = forceWebGL ? 96948 : 90700;
    assert.ok(lookups < 0.90 * inlineLookups, `${lookups} node-data lookups for six lights`);
    for (const name of ["plannerWallIntersection", "plannerPathRecordUV", "plannerEmitterColor"]) {
      const definitions = new RegExp(`(?:fn|vec[23]) ${name}\\s*\\(`, "g");
      assert.equal(builder.fragmentShader.match(definitions)?.length, 1, name);
      assert.ok(builder.fragmentShader.split(name + "(").length > lights.length, name);
    }
    t.diagnostic(`${forceWebGL ? "GLSL" : "WGSL"} six-light builder lookups: ${inlineLookups} -> ${lookups}`);
  }
});
