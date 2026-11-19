import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.core.js";
import { mergeItemMeshes, sameMaterial } from "../js/view3d/item_merge.js";

const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ color: 0x8a6a4a, roughness: 0.6, metalness: 0.1 }, o));
function part(g, mat, x, y, z, opts = {}) {
  const geo = opts.cyl ? new THREE.CylinderGeometry(1, 1.5, 10, 8) : new THREE.BoxGeometry(4, 6, 2).toNonIndexed();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.scale) m.scale.set(...opts.scale);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  m.userData.physicsProps = opts.phys || WOOD;
  g.add(m);
  return m;
}
const WOOD = { type: "wood" }, STEEL = { type: "steel" };

// world-space triangles keyed by what draws them (material by value), order-free
function triangles(group) {
  group.updateMatrixWorld(true);
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const tag = [o.material.color.getHexString(), o.material.roughness, o.material.transparent, o.castShadow, o.userData.physicsProps.type].join("/");
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index, n = idx ? idx.count : pos.count;
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      const tri = [0, 1, 2].map((k) => {
        const j = idx ? idx.getX(i + k) : i + k;
        const v = new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld);
        const w = new THREE.Vector3().fromBufferAttribute(nor, j).applyMatrix3(nm).normalize();
        return [v.x, v.y, v.z, w.x, w.y, w.z].map((c) => (Math.abs(c) < 5e-4 ? 0 : c).toFixed(3)).join(",");
      });
      out.push(tag + ":" + tri.join("|"));
    }
  });
  return out.sort();
}
const meshes = (g) => g.children.filter((o) => o.isMesh);

test("an item's parts that draw alike become one mesh with the same world triangles", () => {
  const g = new THREE.Group();
  g.position.set(120, 0, -40); g.rotation.y = 0.4;
  // four legs and a top: five equal materials, five separate objects
  part(g, std(), -10, 3, -5); part(g, std(), 10, 3, -5); part(g, std(), -10, 3, 5, { ry: 0.3 }); part(g, std(), 10, 3, 5, { cyl: true });
  part(g, std(), 0, 8, 0, { scale: [6, 0.2, 3] });
  part(g, std({ color: 0x222222, metalness: 0.85 }), 0, 9, 4, { phys: STEEL }); // handle: another finish
  part(g, std({ color: 0x222222, metalness: 0.85 }), 3, 9, 4, { phys: STEEL });
  const glassA = std({ transparent: true, opacity: 0.3 }), glassB = std({ transparent: true, opacity: 0.3 });
  part(g, glassA, 0, 5, 6); part(g, glassB, 0, 5, 7); // transparent: blended per object
  part(g, std(), 0, 1, 0, { cast: false }); // casts no shadow: its own draw in the shadow pass
  part(g, std(), 0, 2, 0, { phys: STEEL }); // another physics class
  const before = triangles(g);
  const folded = mergeItemMeshes(g, THREE);
  assert.equal(folded, 4 + 1);
  // wood (5 → 1), handles (2 → 1), two glass panes, non-casting, steel-class
  assert.equal(meshes(g).length, 6);
  assert.deepEqual(triangles(g), before);
  const glass = meshes(g).filter((o) => o.material.transparent);
  assert.deepEqual(glass.map((o) => o.material), [glassA, glassB]);
  const wood = meshes(g).find((o) => o.userData.itemMerged === 5);
  assert.equal(wood.userData.physicsProps, WOOD);
  assert.equal(wood.castShadow, true);
  assert.equal(wood.receiveShadow, true);
});

test("a mirrored part, a part with children, and items with pivots are left as built", () => {
  const g = new THREE.Group();
  part(g, std(), 0, 0, 0); const mirrored = part(g, std(), 5, 0, 0, { scale: [-1, 1, 1] });
  const parent = part(g, std(), 9, 0, 0); parent.add(new THREE.Object3D());
  assert.equal(mergeItemMeshes(g, THREE), 0);
  assert.ok(g.children.includes(mirrored));

  const cab = new THREE.Group(), pivot = new THREE.Group();
  part(cab, std(), 0, 0, 0); part(cab, std(), 4, 0, 0); cab.add(pivot);
  assert.equal(mergeItemMeshes(cab, THREE), 0, "a cabinet's unit pivots are moved by the runtime update");

  const person = new THREE.Group(); person.userData.isHuman = true;
  part(person, std(), 0, 0, 0); part(person, std(), 4, 0, 0);
  assert.equal(mergeItemMeshes(person, THREE), 0);
});

test("materials compare by value, maps by identity", () => {
  const tex = new THREE.Texture(), other = new THREE.Texture();
  assert.ok(sameMaterial(std({ map: tex }), std({ map: tex })));
  assert.ok(!sameMaterial(std({ map: tex }), std({ map: other })));
  assert.ok(!sameMaterial(std(), std({ roughness: 0.61 })));
  assert.ok(!sameMaterial(std(), std({ side: THREE.DoubleSide })));
  assert.ok(!sameMaterial(std(), std({ shadowSide: THREE.FrontSide })));
  const glow = std(); glow.userData.glow = true;
  assert.ok(!sameMaterial(std(), glow));
  assert.ok(!sameMaterial(std(), new THREE.MeshPhysicalMaterial({ color: 0x8a6a4a, roughness: 0.6, metalness: 0.1 })));
  const a = std(), b = std(); a.normalScale.set(0.7, 0.7);
  assert.ok(!sameMaterial(a, b));
});

test("the 3D view merges a piece only outside the physics sandbox, and rebuilds it when that changes", async () => {
  const { moduleSource } = await import("./helpers/module_source.mjs");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  const src = moduleSource("js/view3d.js");
  const build = sourceFunctionText(src, "buildItem");
  assert.match(build, /g\.userData\.partsMerged = !isPhysicsEnabled\(\);\s*if \(g\.userData\.partsMerged\) mergeItemMeshes\(g, THREE\);/);
  // Measure individual emitter positions before the bake, install their lights afterward.
  assert.ok(build.indexOf("fixtureOptics") < build.indexOf("mergeItemMeshes"));
  assert.ok(build.indexOf("mergeItemMeshes") < build.indexOf("installFixture"));
  assert.match(sourceFunctionText(src, "syncItems"), /!!c\.g\.userData\.partsMerged === !isPhysicsEnabled\(\)/);
});
