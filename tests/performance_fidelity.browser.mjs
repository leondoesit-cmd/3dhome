import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tools/browser_harness.mjs';
import { installModelerDraftFixture, recoverLegacyModelerDraftFixture } from './browser_modeler_fixture.mjs';

test('GPU per-face appearances retain opacity, buffers and identical selection pixels',
  process.env.MF_BROWSER_GPU === '1' ? { timeout: 60000 } : { skip: 'Run with MF_BROWSER_GPU=1 for hardware rendering' }, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: 'en' });
  try {
    await page.goto('/');
    await page.eval(async () => {
      const { openModeler } = await import('/js/modeler.js');
      const { THREE, loadThree } = await import('/js/three_lazy.js');
      await loadThree();
      const geometry = new THREE.BoxGeometry(10, 8, 6).toNonIndexed();
      const meshData = { positions: Array.from(geometry.attributes.position.array), normals: Array.from(geometry.attributes.normal.array),
        faceRanges: [{ persistentId: 'feature:part:painted:face', triangleStart: 0, triangleCount: 2 }] };
      geometry.dispose();
      openModeler(null, { key: 'painted-performance', name: 'Painted exact mesh',
        parts: [{ id: 'painted', kind: 'box', x0: -5, x1: 5, y0: -4, y1: 4, z0: -3, z1: 3, meshData }],
        appearances: [{ kind: 'face', persistentId: 'feature:part:painted:face', color: '#d13355', metal: .3, rough: .6, opacity: .65 }] }, null);
      const welcome = document.getElementById('mdWelcome');
      if (welcome && !welcome.hidden) (welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector('.md-welcome-close'))?.click();
    });
    const result = await page.eval(async () => {
      const view = window.cadPreviewView, { ready } = await import('/js/gpu.js');
      await ready(view.rr);
      // The pre-change baseline also toggles line-helper pixels when rebuilding
      // this transparent fixture. Compare the actual painted surfaces here;
      // the other GPU cases compare the complete viewport including helpers.
      const hideHelpers = () => view.sc.traverse(object => {
        if (object.isLine || object.userData?.cadDeco || object.userData?.instant3d) object.visible = false;
      });
      const entry = window.cadDecoGroups.find(entry => entry.part.id === 'painted');
      const surfaces = entry.mesh.children.filter(child => child.isMesh);
      const geometries = surfaces.map(mesh => mesh.geometry), materials = surfaces.map(mesh => mesh.material);
      const topology = entry.group.children.find(child => child.userData?.cadTopology)?.userData.cadTopology;
      const before = window.cadPreviewWorkSnapshot();
      if (!topology?.persistentId || !window.cadSelectTopologyById(topology.persistentId)) throw new Error('Painted part has no selectable topology');
      const after = window.cadPreviewWorkSnapshot();
      const retained = surfaces.every((mesh, index) => mesh.parent && mesh.geometry === geometries[index] && mesh.material === materials[index]);
      const appearance = surfaces.find(mesh => mesh.material.opacity === .65);
      hideHelpers(); view.render(); const incremental = view.rr.domElement.toDataURL('image/png');
      window.cadUpdatePreview(); hideHelpers(); view.render();
      const rebuilt = view.rr.domElement.toDataURL('image/png');
      return { count: surfaces.length, before, after, retained, equalPixels: incremental === rebuilt,
        selection: window.cadSelectionSnapshot(),
        appearance: appearance && { opacity: appearance.material.opacity, transparent: appearance.material.transparent,
          depthWrite: appearance.material.depthWrite, emissive: appearance.material.emissive.getHex(), castShadow: appearance.castShadow } };
    });
    assert.equal(result.count, 2); assert.equal(result.retained, true); assert.equal(result.equalPixels, true, JSON.stringify(result));
    assert.equal(result.after.builds, result.before.builds); assert.equal(result.after.drawingToken, result.before.drawingToken);
    assert.deepEqual(result.appearance, { opacity: .65, transparent: true, depthWrite: false, emissive: 0x3f2508, castShadow: false });
  } finally { await page.close(); }
});

test('GPU selection retains solid buffers and matches a complete viewport rebuild pixel for pixel',
  process.env.MF_BROWSER_GPU === '1' ? { timeout: 60000 } : { skip: 'Run with MF_BROWSER_GPU=1 for hardware rendering' }, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: 'en' });
  try {
    await page.goto('/');
    await page.eval(async () => {
      const { openModeler } = await import('/js/modeler.js');
      const fixture = await (await fetch('/tests/fixtures/legacy_feature_manager.json')).json();
      openModeler(null, fixture, null);
    });
    await page.waitUntil(() => !!window.cadPreviewView?.rr && !!window.cadDecoGroups?.length);
    await page.eval(() => {
      const welcome = document.getElementById('mdWelcome');
      if (welcome && !welcome.hidden) (welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector('.md-welcome-close'))?.click();
    });
    const result = await page.eval(async () => {
      const view = window.cadPreviewView, { ready } = await import('/js/gpu.js');
      await ready(view.rr);
      const entries = window.cadDecoGroups.filter(entry => !entry.part.previewOnly);
      const meshes = entries.map(entry => entry.mesh), identities = meshes.map(mesh => mesh.geometry);
      const last = entries.at(-1);
      const reference = last.group.children.find(object => object.userData?.cadTopology)?.userData.cadTopology;
      const before = window.cadPreviewWorkSnapshot();
      if (!reference?.persistentId || !window.cadSelectTopologyById(reference.persistentId)) throw new Error('No real selectable topology');
      view.render();
      const incremental = view.rr.domElement.toDataURL('image/png');
      const retained = meshes.every((mesh, index) => mesh.parent && mesh.geometry === identities[index]);
      const after = window.cadPreviewWorkSnapshot();
      const draws = view.rr.info.render.calls;
      window.cadUpdatePreview();
      view.render();
      const rebuilt = view.rr.domElement.toDataURL('image/png');
      return { retained, builds: after.builds - before.builds, sameDrawingToken: after.drawingToken === before.drawingToken,
        equalPixels: incremental === rebuilt, imageLength: incremental.length, draws, meshCount: meshes.length };
    });
    assert.ok(result.meshCount > 0); assert.ok(result.draws > 0); assert.ok(result.imageLength > 1000);
    assert.equal(result.retained, true); assert.equal(result.builds, 0);
    assert.equal(result.sameDrawingToken, true); assert.equal(result.equalPixels, true);
    await page.screenshot(fileURLToPath(new URL('../scratch/performance-preserve/selection-gpu.png', import.meta.url)));
  } finally { await page.close(); }
});

test('GPU assembly selection preserves component geometry, solved poses and instance highlighting',
  process.env.MF_BROWSER_GPU === '1' ? { timeout: 60000 } : { skip: 'Run with MF_BROWSER_GPU=1 for hardware rendering' }, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: 'en' });
  try {
    await page.eval(async () => {
      const { writeModelerDraft } = await import('/js/modeler_draft.js');
      const { topologyReference } = await import('/js/cad_mates.js');
      const a = { id: 'instance-a', name: 'Grounded', grounded: true, transform: { x: 12, y: 3, z: 4, rx: 0, ry: 0, rz: 0 },
        def: { name: 'Block', parts: [{ id: 'box', kind: 'box', x0: 0, x1: 2, y0: 0, y1: 3, z0: 0, z1: 4 }] } };
      const b = { ...structuredClone(a), id: 'instance-b', name: 'Mated', grounded: false, transform: { ...a.transform, x: 17 } };
      const plane = { surface: 'plane', origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
      const mate = { id: 'distance', type: 'distance', value: 5, aligned: true,
        a: topologyReference(a.id, 'face', 'fa', plane), b: topologyReference(b.id, 'face', 'fb', plane) };
      writeModelerDraft(localStorage, { docType: 'assembly', assembly: { id: 'performance-assembly', name: 'Performance assembly',
        components: [a, b], mates: [], topologyMates: [mate] } });
    });
    await page.goto('/');
    await installModelerDraftFixture(page);
    await page.eval(async () => { const { openModeler } = await import('/js/modeler.js'); openModeler(); });
    await recoverLegacyModelerDraftFixture(page);
    await page.waitUntil(() => !!document.querySelector('#mdDecision [data-decision="accept"]'));
    await page.eval(() => document.querySelector('#mdDecision [data-decision="accept"]').click());
    await page.waitUntil(() => document.querySelector('#modeler')?.classList.contains('md-assembly') && !!window.cadPreviewView?.rr);
    const result = await page.eval(async () => {
      const { ready } = await import('/js/gpu.js'), view = window.cadPreviewView;
      await ready(view.rr);
      const groups = view.grp.children.filter(child => child.userData?.cadComponent);
      const poses = groups.map(group => ({ position: group.position.toArray(), rotation: group.rotation.toArray() }));
      const entries = window.cadDecoGroups.filter(entry => entry.component);
      const meshes = entries.map(entry => entry.mesh), geometries = meshes.map(mesh => mesh.geometry);
      const before = window.cadPreviewWorkSnapshot();
      if (!window.cadSelectComponentFace('instance-b', { surface: 'plane' })) throw new Error('Component has no selectable face');
      const after = window.cadPreviewWorkSnapshot();
      view.render(); const incremental = view.rr.domElement.toDataURL('image/png');
      const selected = entries.find(entry => entry.component.id === 'instance-b');
      const other = entries.find(entry => entry.component.id === 'instance-a');
      const highlights = { selected: selected.mesh.material.emissive.getHex(), other: other.mesh.material.emissive.getHex() };
      const retained = meshes.every((mesh, index) => mesh.parent && mesh.geometry === geometries[index]);
      const posesAfter = groups.map(group => ({ position: group.position.toArray(), rotation: group.rotation.toArray() }));
      window.cadUpdatePreview(); view.render();
      return { before, after, retained, poses, posesAfter, highlights, meshes: meshes.length,
        equalPixels: incremental === view.rr.domElement.toDataURL('image/png'), draws: view.rr.info.render.calls };
    });
    assert.equal(result.meshes, 2); assert.ok(result.draws > 0); assert.equal(result.retained, true);
    assert.equal(result.after.builds, result.before.builds); assert.equal(result.after.mateSolves, result.before.mateSolves);
    assert.equal(result.after.drawingToken, result.before.drawingToken); assert.deepEqual(result.posesAfter, result.poses);
    assert.equal(result.highlights.selected, 0x4b2800); assert.notEqual(result.highlights.other, 0x4b2800);
    assert.equal(result.equalPixels, true);
  } finally { await page.close(); }
});
