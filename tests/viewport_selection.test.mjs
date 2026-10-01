import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, Color } from '../vendor/three/three.core.js';
import { syncViewportSelectionMaterial } from '../js/core/viewport_selection.js';

test('selection retains geometry and restores every changed material value without colour quantization', () => {
  const original = new MeshStandardMaterial({ emissive: new Color(.123456789, .234567891, .345678912),
    emissiveIntensity: .4321, opacity: .6789, transparent: true, depthWrite: true });
  const mesh = new Mesh(new BoxGeometry(), original), geometry = mesh.geometry;
  syncViewportSelectionMaterial(mesh);
  syncViewportSelectionMaterial(mesh, { partSelected: true });
  const owned = mesh.material;
  assert.notEqual(owned, original);
  assert.equal(owned.emissive.getHex(), 0x3f2508);
  syncViewportSelectionMaterial(mesh, { dependencyHighlight: true });
  assert.equal(mesh.material.opacity, .2); assert.equal(mesh.material.depthWrite, false);
  syncViewportSelectionMaterial(mesh, { dependency: 'upstream', dependencyHighlight: true });
  assert.equal(mesh.material.emissive.getHex(), 0x063a5a); assert.equal(mesh.material.emissiveIntensity, .85);
  syncViewportSelectionMaterial(mesh, { componentSelected: true, dependency: 'focus' });
  assert.equal(mesh.material.emissive.getHex(), 0x4b2800);
  syncViewportSelectionMaterial(mesh);
  assert.equal(mesh.material, owned); assert.equal(mesh.geometry, geometry);
  assert.deepEqual(mesh.material.emissive, original.emissive);
  for (const key of ['emissiveIntensity', 'opacity', 'transparent', 'depthWrite']) assert.equal(mesh.material[key], original[key]);
  original.dispose(); owned.dispose(); geometry.dispose();
});

test('selecting one instance cannot tint or dim another instance sharing its material', () => {
  const material = new MeshStandardMaterial({ emissive: 0x123456 });
  const geometry = new BoxGeometry(), a = new Mesh(geometry, material), b = new Mesh(geometry, material);
  syncViewportSelectionMaterial(a, { componentSelected: true });
  syncViewportSelectionMaterial(b);
  assert.equal(a.material.emissive.getHex(), 0x4b2800);
  assert.equal(b.material, material); assert.equal(b.material.emissive.getHex(), 0x123456);
  syncViewportSelectionMaterial(a, { dependencyHighlight: true });
  assert.equal(b.material.opacity, 1); assert.equal(b.material.depthWrite, true);
  a.material.dispose(); material.dispose(); geometry.dispose();
});

test('owned per-face materials keep their explicit opacity while following body and dependency tints', () => {
  const material = new MeshStandardMaterial({ opacity: .65, transparent: true, depthWrite: false });
  const mesh = new Mesh(new BoxGeometry(), material);
  const options = { materialOwned: true, preserveAppearanceOpacity: true };
  syncViewportSelectionMaterial(mesh, { ...options, partSelected: true });
  assert.equal(mesh.material, material, 'a uniquely owned material must not be abandoned after rendering');
  assert.equal(material.emissive.getHex(), 0x3f2508);
  syncViewportSelectionMaterial(mesh, { ...options, dependencyHighlight: true });
  assert.equal(material.opacity, .65); assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  syncViewportSelectionMaterial(mesh, { ...options, dependency: 'downstream', dependencyHighlight: true });
  assert.equal(material.emissive.getHex(), 0x42135f); assert.equal(material.emissiveIntensity, .85);
  syncViewportSelectionMaterial(mesh, options);
  assert.equal(material.emissive.getHex(), 0); assert.equal(material.emissiveIntensity, 1);
  assert.equal(material.opacity, .65); material.dispose(); mesh.geometry.dispose();
});
