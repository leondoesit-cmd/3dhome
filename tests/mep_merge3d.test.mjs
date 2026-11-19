import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.core.js";
import { mergeMEPMeshes } from "../js/mep/merge3d.js";

function pipe(mat, x1, y1, z1, x2, y2, z2) {
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, len, 8), mat);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize());
  return m;
}
// world-space triangles of a group, as sorted strings (order-free comparison)
function triangles(group) {
  group.updateMatrixWorld(true);
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const tri = [0, 1, 2].map((k) => {
        const v = new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
        return [v.x, v.y, v.z].map((c) => c.toFixed(3)).join(",");
      });
      out.push(o.material.uuid + ":" + tri.join("|"));
    }
  });
  return out.sort();
}

test("MEP meshes merge per material into the same world-space triangles", () => {
  const red = new THREE.MeshStandardMaterial({ color: 0xff0000 }), blue = new THREE.MeshStandardMaterial({ color: 0x0000ff });
  const xray = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9 });
  const lone = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const g = new THREE.Group();
  g.add(pipe(red, 0, 240, 0, 300, 240, 0), pipe(red, 300, 240, 0, 300, 240, 200), pipe(red, 300, 240, 200, 300, 40, 200));
  const box = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 2.2), blue);
  box.position.set(50, 30, 4); box.rotation.y = 0.7;
  g.add(box, pipe(blue, 0, 10, 0, 0, 10, 250));
  const x1 = pipe(xray, 0, -5, 0, 100, -5, 0), x2 = pipe(xray, 100, -5, 0, 100, -5, 90);
  x1.renderOrder = x2.renderOrder = 20;
  g.add(x1, x2, pipe(lone, 10, 10, 10, 20, 20, 20));
  const before = triangles(g);
  const folded = mergeMEPMeshes(g, THREE);
  assert.equal(folded, 3, "3 red become 1, 2 blue become 1");
  assert.equal(g.children.length, 5, "red, blue, two x-ray guides and the lone mesh");
  assert.ok(g.children.includes(x1) && g.children.includes(x2), "transparent guides keep their own meshes");
  assert.deepEqual(triangles(g), before, "same triangles, same places, same materials");
  const merged = g.children.find((o) => o.material === red);
  assert.equal(merged.userData.mepMerged, 3);
  assert.ok(merged.geometry.boundingSphere, "culling bounds are ready");
});

test("normals are carried through each mesh's rotation", () => {
  const mat = new THREE.MeshStandardMaterial();
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat), b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  b.rotation.z = Math.PI / 2; b.position.x = 10;
  g.add(a, b);
  mergeMEPMeshes(g, THREE);
  const n = g.children[0].geometry.attributes.normal, p = g.children[0].geometry.attributes.position;
  // every normal is unit length and points away from its box's centre
  for (let i = 0; i < n.count; i++) {
    const nv = new THREE.Vector3().fromBufferAttribute(n, i), pv = new THREE.Vector3().fromBufferAttribute(p, i);
    assert.ok(Math.abs(nv.length() - 1) < 1e-6);
    const c = pv.x > 5 ? new THREE.Vector3(10, 0, 0) : new THREE.Vector3();
    assert.ok(nv.dot(pv.sub(c)) > 0);
  }
});
