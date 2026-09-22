import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import { createPlannerDrawing } from '../js/planner_drawing.js';

function fixture() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  root.add(mesh);
  return { root, mesh, drawing: createPlannerDrawing(THREE) };
}

test('drawing preserves crease edges, reuses geometry and follows parent transforms', () => {
  const { root, mesh, drawing } = fixture();
  drawing.sync([root]);
  const line = drawing.group.children[0], geometry = line.geometry;
  assert.equal(geometry.attributes.position.count, 24, '12 box edges, without triangle diagonals');
  root.position.set(12, 3, 8);
  mesh.position.x = 7;
  drawing.sync([root]);
  assert.equal(line.geometry, geometry);
  assert.equal(line.matrix.elements[12], 19);
  assert.equal(line.matrix.elements[13], 3);
  assert.equal(root.children.length, 1, 'model graph is unchanged');
  assert.equal(line.material.depthTest, true);
  assert.equal(line.material.depthWrite, false);
  drawing.dispose();
});

test('drawing shares edge geometry and disposes only after its last visible user disappears', () => {
  const { root, mesh, drawing } = fixture();
  const clone = mesh.clone();
  root.add(clone);
  drawing.sync([root]);
  const geometry = drawing.group.children[0].geometry;
  assert.equal(drawing.group.children[1].geometry, geometry);
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  mesh.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 1);
  assert.equal(disposed, 0);
  root.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  assert.equal(disposed, 1);
  drawing.dispose();
});

test('drawing skips transparent roofs and frees replaced geometry', () => {
  const { root, mesh, drawing } = fixture();
  mesh.material.transparent = true;
  mesh.material.opacity = 0;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  mesh.material.opacity = 1;
  drawing.sync([root]);
  const old = drawing.group.children[0].geometry;
  let disposed = false;
  old.addEventListener('dispose', () => disposed = true);
  mesh.geometry = new THREE.BoxGeometry(20, 20, 20);
  drawing.sync([root]);
  assert.notEqual(drawing.group.children[0].geometry, old);
  assert.equal(disposed, true);
  drawing.dispose();
});

test('turning drawing off releases its resources without disposing model resources', () => {
  const { root, mesh, drawing } = fixture();
  const scene = new THREE.Scene();
  scene.add(root, drawing.group);
  let modelDisposed = false;
  mesh.geometry.addEventListener('dispose', () => modelDisposed = true);
  drawing.sync([root]);
  drawing.dispose();
  assert.equal(scene.children.length, 1);
  assert.equal(drawing.group.children.length, 0);
  assert.equal(modelDisposed, false);
});

test('drawing refreshes edited vertex buffers and respects hidden ancestors', () => {
  const { root, mesh, drawing } = fixture();
  const scene = new THREE.Scene();
  scene.add(root);
  drawing.sync([root]);
  const old = drawing.group.children[0].geometry;
  mesh.geometry.attributes.position.setX(0, 8);
  mesh.geometry.attributes.position.needsUpdate = true;
  drawing.sync([root]);
  assert.notEqual(drawing.group.children[0].geometry, old);
  scene.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  drawing.dispose();
});
