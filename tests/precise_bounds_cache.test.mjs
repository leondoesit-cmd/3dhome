import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import { createPreciseBoundsCache } from '../js/core/precise_bounds_cache.js';

test('cached bounds match precise vertices under nested transforms and edits', () => {
  const root = new THREE.Group(), parent = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16));
  root.add(parent); parent.add(mesh);
  parent.rotation.set(.3, .8, .1); parent.scale.set(2, 1, .7);
  const cache = createPreciseBoundsCache(THREE);
  function compare() {
    const actual = cache.bounds(root).clone();
    root.updateWorldMatrix(true, true);
    assert.deepEqual(actual, new THREE.Box3().expandByObject(root, true));
  }
  compare(); compare(); assert.equal(cache.stats.scans, 1);
  mesh.position.x = 5; compare();
  root.rotation.y = .2; compare();
  const pos = mesh.geometry.attributes.position;
  pos.setXYZ(0, 50, 40, 30); pos.needsUpdate = true; compare();
  mesh.geometry = new THREE.BoxGeometry(20, 30, 40); compare();
  parent.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))); compare();
  parent.remove(mesh); compare(); compare();
  assert.equal(cache.stats.hits, 2);
});

test('morphs and custom vertex readers are never served stale', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry());
  let shift = 0;
  mesh.getVertexPosition = function (index, target) {
    THREE.Mesh.prototype.getVertexPosition.call(this, index, target);
    target.x += shift; return target;
  };
  const cache = createPreciseBoundsCache(THREE);
  const first = cache.bounds(mesh).clone(); shift = 10;
  assert.equal(cache.bounds(mesh).min.x, first.min.x + 10);
  assert.equal(cache.stats.hits, 0);
});

test('interleaved position buffer updates invalidate bounds', () => {
  const data = new THREE.InterleavedBuffer(new Float32Array([0,0,0,1,1,1]), 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
  const mesh = new THREE.Mesh(geometry), cache = createPreciseBoundsCache(THREE);
  cache.bounds(mesh); data.array[0] = -20; data.needsUpdate = true;
  assert.equal(cache.bounds(mesh).min.x, -20);
});

test('morph animation and instancing retain Three precise-bound semantics', () => {
  const geometry = new THREE.BoxGeometry();
  const target = geometry.attributes.position.clone();
  for (let i=0;i<target.count;i++) target.setX(i,target.getX(i)+10);
  geometry.morphAttributes.position=[target];
  const mesh=new THREE.Mesh(geometry),cache=createPreciseBoundsCache(THREE);
  const first=cache.bounds(mesh).clone();mesh.morphTargetInfluences[0]=1;
  assert.equal(cache.bounds(mesh).min.x,first.min.x+10);
  assert.equal(cache.stats.hits,0);
  const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2);
  instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(10,0,0));instances.computeBoundingBox();
  assert.deepEqual(cache.bounds(instances),new THREE.Box3().setFromObject(instances,true));
  instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(30,0,0));instances.computeBoundingBox();
  assert.deepEqual(cache.bounds(instances),new THREE.Box3().setFromObject(instances,true));
});
