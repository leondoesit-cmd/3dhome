import * as THREE from "three";
import { ctx } from "./registry.js";
import { createClothState, stepClothState } from "./cloth_sim.js";

export { createClothState, stepClothState };

function makeGeometry(cloth) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cloth.points.length * 3);
  const idx = [];
  for (let row = 0; row < cloth.rows - 1; row++) {
    for (let col = 0; col < cloth.cols - 1; col++) {
      const a = row * cloth.cols + col;
      const b = a + 1;
      const c = a + cloth.cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  writePositions(cloth, geo);
  geo.computeVertexNormals();
  return geo;
}

function writePositions(cloth, geo) {
  const arr = geo.attributes.position.array;
  for (let i = 0; i < cloth.points.length; i++) {
    const p = cloth.points[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

export function spawnHangingCloth(parent, opts) {
  if (!parent || !opts) return null;
  const state = createClothState(opts);
  const geo = makeGeometry(state);
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color != null ? opts.color : 0xc4b39a,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.physicsRole = "ignore";
  parent.add(mesh);
  const entry = { state, mesh, geo, mat };
  ctx.cloth = ctx.cloth || [];
  ctx.cloth.push(entry);
  return entry;
}

export function stepCloth(dt) {
  if (!ctx.cloth || !ctx.cloth.length) return;
  ctx.cloth.forEach(entry => {
    stepClothState(entry.state, dt);
    writePositions(entry.state, entry.geo);
  });
}

export function clearCloth() {
  if (!ctx.cloth) return;
  ctx.cloth.forEach(entry => {
    if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
    entry.geo.dispose();
    entry.mat.dispose();
  });
  ctx.cloth = [];
}
