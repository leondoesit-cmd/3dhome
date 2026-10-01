import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';

const gpu = process.env.MF_BROWSER_GPU === '1' ? { timeout: 90000 } : { skip: 'Run with MF_BROWSER_GPU=1 for hardware rendering' };

test('cabinet canvas reuse preserves every projection and thumbnail pixel across repeated draws', async () => {
  const page = await openPage({ width: 1365, height: 901, lang: 'en' });
  try {
    const results = await page.eval(async () => {
      const { S } = await import('/js/state.js'), { makeSpec } = await import('/js/cabinet.js');
      const { openCabinet } = await import('/js/ui_cabinet.js'), { E, AXES } = await import('/js/ui_cabinet_ctx.js');
      const { draw, sizeCanvas, setAxis, setMode, drawElevThumb } = await import('/js/ui_cabinet_view.js');
      const item = { id: 'canvas-reuse', type: 'cabsys', x: 0, z: 0, rot: 0, w: 137.3, h: 241.7, d: 61.2,
        cab: makeSpec('w_classic', 137.3, 241.7, 61.2), runtimeState: { cabinetOpen: .43 } };
      S.items = [item]; openCabinet(item); await document.fonts.ready;
      const results = [];
      for (const dpr of [1, 1.25, 2]) {
        Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
        for (const axis of Object.keys(AXES)) {
          setAxis(axis); sizeCanvas(); draw();
          // Repeated draws must not depend on the context reset caused by a
          // same-size width assignment, including state left by another axis.
          for (let repeat = 0; repeat < 3; repeat++) { sizeCanvas(); draw(); }
          const image = E.cv.toDataURL(), dimensions = [E.cv.width, E.cv.height];
          E.cv.width = E.cv.width; sizeCanvas(); draw();
          results.push({ axis, dpr, exact: image === E.cv.toDataURL(), dimensions });
        }
        setMode('3d'); drawElevThumb(); drawElevThumb();
        const thumb = E.host.querySelector('#cbElevThumb canvas'), image = thumb.toDataURL();
        thumb.width = thumb.width; drawElevThumb();
        results.push({ axis: 'thumbnail', dpr, exact: image === thumb.toDataURL(), dimensions: [thumb.width, thumb.height] });
      }
      return results;
    });
    assert.ok(results.length > 20);
    assert.ok(results.every(result => result.exact), JSON.stringify(results.filter(result => !result.exact)));
    assert.ok(results.every(result => result.dimensions.every(value => Number.isInteger(value) && value > 0)));
  } finally { await page.close(); }
});

test('cabinet runtime preview retains meshes and materials with identical pixels and bounds', gpu, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: 'en' });
  try {
    await page.goto('/?forceWebGL');
    await page.eval(async () => {
      const { S } = await import('/js/state.js'), { makeSpec } = await import('/js/cabinet.js');
      const { openCabinet } = await import('/js/ui_cabinet.js'), { E } = await import('/js/ui_cabinet_ctx.js');
      const { loadThree } = await import('/js/three_lazy.js'); await loadThree();
      const item = { id: 'cab-runtime-perf', type: 'cabsys', x: 0, z: 0, rot: 0, w: 120, d: 60, h: 240,
        variant: 'sage', cab: makeSpec('w_classic', 120, 240, 60), runtimeState: { cabinetOpen: .4 } };
      S.items = [item]; openCabinet(item);
      (await import('/js/ui_cabinet_view.js')).setMode('3d');
      window.cabPerf = { E, item };
    });
    await page.waitUntil(() => !!window.cabPerf?.E.pv?.rr?.initialized);
    const result = await page.eval(async () => {
      const { E, item } = window.cabPerf, { updatePreview } = await import('/js/ui_cabinet_view.js');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const settle = async () => { await E.pv.rr.compileAsync(E.pv.sc, E.pv.cam); E.pv.render(); await frame(); E.pv.render(); };
      await settle();
      const meshes = []; E.pv.grp.traverse(object => { if (object.isMesh) meshes.push(object); });
      const geometries = meshes.map(mesh => mesh.geometry), materials = meshes.map(mesh => mesh.material);
      let disposals = 0, rebuilds = 0;
      for (const geometry of geometries) geometry.addEventListener('dispose', () => disposals++);
      const rebuild = E.pv.rebuild; E.pv.rebuild = function (fn) { rebuilds++; return rebuild(fn); };
      item.runtimeState.cabinetOpen = .45; item.cab.open = .45;
      updatePreview({ runtime: true }); await settle();
      const incremental = E.pv.rr.domElement.toDataURL('image/png');
      const current = new Set(); E.pv.grp.traverse(object => current.add(object));
      const retained = meshes.every((mesh, i) => current.has(mesh) && mesh.geometry === geometries[i] && mesh.material === materials[i]);
      const bounds = E.pv.pickBounds.toArray ? E.pv.pickBounds.toArray() : { center: E.pv.pickBounds.center.toArray(), radius: E.pv.pickBounds.radius };
      const incrementalWork = { rebuilds, disposals };
      updatePreview(); await settle();
      return { retained, count: meshes.length, incrementalWork, equalPixels: incremental === E.pv.rr.domElement.toDataURL('image/png'),
        bounds, rebuiltBounds: { center: E.pv.pickBounds.center.toArray(), radius: E.pv.pickBounds.radius }, draws: E.pv.rr.info.render.calls };
    });
    assert.ok(result.count > 20); assert.ok(result.draws > 0);
    assert.equal(result.retained, true, JSON.stringify(result)); assert.deepEqual(result.incrementalWork, { rebuilds: 0, disposals: 0 });
    assert.deepEqual(result.bounds, result.rebuiltBounds); assert.equal(result.equalPixels, true, JSON.stringify(result));
  } finally { await page.close(); }
});

test('cabinet slider coalesces a burst and updates only its planner item without authoring history', async () => {
  const page = await openPage({ width: 1280, height: 900, lang: 'en' });
  try {
    const result = await page.eval(async () => {
      const { S } = await import('/js/state.js'), { makeSpec } = await import('/js/cabinet.js');
      const { openCabinet, closeCabinet } = await import('/js/ui_cabinet.js'), { E } = await import('/js/ui_cabinet_ctx.js');
      const item = { id: 'slider-coalesce', type: 'cabsys', x: 0, z: 0, rot: 0, w: 120, d: 60, h: 240, cab: makeSpec('w_classic', 120, 240, 60) };
      S.items = [item]; openCabinet(item);
      let rebuilds = 0, frames = 0;
      E.pv = { grp: {}, frame() { frames++; }, rebuild() { rebuilds++; } };
      S.dirty3D = false; S.items3D.clear();
      const definition = JSON.stringify(S.parametric.definitions[item.definitionId]);
      const undo = document.querySelector('#cbUndo').disabled;
      const input = document.querySelector('#cbOpen');
      for (let value = 40; value <= 60; value++) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const beforeFrame = rebuilds;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const result = { beforeFrame, rebuilds, frames, fullSceneDirty: S.dirty3D, operations: [...S.items3D],
        opening: item.runtimeState.cabinetOpen, unchangedDefinition: definition === JSON.stringify(S.parametric.definitions[item.definitionId]),
        unchangedUndo: undo === document.querySelector('#cbUndo').disabled };
      input.value = 100; input.dispatchEvent(new Event('input', { bubbles: true }));
      closeCabinet(); await new Promise(resolve => requestAnimationFrame(resolve));
      result.rebuildsAfterClose = rebuilds;
      return result;
    });
    assert.equal(result.beforeFrame, 0); assert.equal(result.rebuilds, 1); assert.equal(result.frames, 1);
    assert.equal(result.fullSceneDirty, false); assert.deepEqual(result.operations, [['slider-coalesce', 'build']]);
    assert.equal(result.opening, .6); assert.equal(result.unchangedDefinition, true); assert.equal(result.unchangedUndo, true);
    assert.equal(result.rebuildsAfterClose, 1);
  } finally { await page.close(); }
});

test('planner cabinet motion and unchanged item updates retain structure and match rebuilt geometry exactly', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900, lang: 'en' });
  try {
    await page.goto('/?forceWebGL');
    await page.eval(async () => {
      const { S } = await import('/js/state.js'), { makeSpec } = await import('/js/cabinet.js');
      S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
      S.walls = S.nodes.map((_, i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
      S.openings = []; S.roomMeta = {}; S.sel = null;
      const cabinet = { id: 'planner-runtime-cab', type: 'cabsys', x: 100, z: 80, rot: 12, w: 120, h: 240, d: 60,
        cab: makeSpec('w_classic', 120, 240, 60), variant: 'white', runtimeState: { cabinetOpen: .4 } };
      const sofa = { id: 'planner-unchanged-sofa', type: 'sofa', x: 220, z: 180, rot: 0, w: 180, d: 80, h: 80 };
      S.items = [cabinet, sofa]; S.dirty3D = true;
      const view = await import('/js/view3d.js'); await view.init3D();
      await (await import('/js/gpu.js')).ready(view.getRenderer());
      window.plannerPerf = { S, view, cabinet, sofa };
    });
    await page.waitUntil(() => !window.plannerPerf.S.dirty3D && !!window.plannerPerf.view.getDynGroup()?.children.some(group => group.userData.layerRoot === 'furniture'));
    const result = await page.eval(async () => {
      const { S, view, cabinet, sofa } = window.plannerPerf, { touchItem3D } = await import('/js/state.js');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const furniture = view.getDynGroup().children.find(group => group.userData.layerRoot === 'furniture');
      const structure = view.getDynGroup().children.find(group => group.userData.layerRoot === 'structure');
      const cabGroup = furniture.children.find(group => group.userData.item?.id === cabinet.id);
      const sofaGroup = furniture.children.find(group => group.userData.item?.id === sofa.id);
      const geometries = []; view.getDynGroup().traverse(object => { if (object.geometry) geometries.push(object.geometry); });
      let disposals = 0; geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposals++));
      cabinet.runtimeState.cabinetOpen = .45; cabinet.cab.open = .45;
      touchItem3D(cabinet, 'build'); touchItem3D(sofa, 'build');
      await frame(); await frame();
      const snapshot = group => {
        group.updateWorldMatrix(true, true);
        const meshes = [];
        group.traverse(object => { if (object.isMesh) meshes.push({ matrix: object.matrixWorld.toArray(),
          positions: Array.from(object.geometry.attributes.position.array), normals: Array.from(object.geometry.attributes.normal?.array || []),
          color: object.material.color?.toArray(), roughness: object.material.roughness, metalness: object.material.metalness,
          opacity: object.material.opacity, transparent: object.material.transparent, castShadow: object.castShadow }); });
        return JSON.stringify(meshes);
      };
      const retained = furniture.children.includes(cabGroup) && furniture.children.includes(sofaGroup) && structure.parent === view.getDynGroup();
      const runtimeSnapshot = snapshot(cabGroup), work = { disposals, fullSceneDirty: S.dirty3D, queued: S.items3D.size };
      const { THREE } = await import('/js/three_lazy.js'), { buildItem } = await import('/js/furniture.js');
      const rebuiltCab = new THREE.Group();
      rebuiltCab.position.copy(cabGroup.position); rebuiltCab.quaternion.copy(cabGroup.quaternion); rebuiltCab.scale.copy(cabGroup.scale);
      buildItem(rebuiltCab, cabinet); view.getDynGroup().add(rebuiltCab);
      const exactGeometry = runtimeSnapshot === snapshot(rebuiltCab);
      view.getDynGroup().remove(rebuiltCab); (await import('/js/primitives.js')).clearGroup(rebuiltCab);
      return { retained, work, exactGeometry, meshCount: JSON.parse(runtimeSnapshot).length };
    });
    assert.ok(result.meshCount > 20); assert.equal(result.retained, true, JSON.stringify(result));
    assert.deepEqual(result.work, { disposals: 0, fullSceneDirty: false, queued: 0 }); assert.equal(result.exactGeometry, true);
  } finally { await page.close(); }
});

test('all cabinet presets preserve fresh-build geometry and invalidate runtime reuse conservatively', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900, lang: 'en' });
  try {
    const result = await page.eval(async () => {
      const { loadThree, THREE } = await import('/js/three_lazy.js'); await loadThree();
      const { makeSpec, PRESETS } = await import('/js/cabinet.js');
      const { buildItem } = await import('/js/furniture.js');
      const { updateCabinetRuntimeMesh } = await import('/js/cabinet_mesh.js');
      const { clearGroup } = await import('/js/primitives.js');
      const snapshot = group => {
        group.updateWorldMatrix(true, true);
        const meshes = [];
        group.traverse(object => { if (object.isMesh) meshes.push({ matrix: object.matrixWorld.toArray(),
          attributes: Object.fromEntries(Object.entries(object.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])),
          index: Array.from(object.geometry.index?.array || []), groups: object.geometry.groups,
          color: object.material.color?.toArray(), roughness: object.material.roughness, metalness: object.material.metalness,
          opacity: object.material.opacity, transparent: object.material.transparent, castShadow: object.castShadow, receiveShadow: object.receiveShadow }); });
        return JSON.stringify(meshes);
      };
      const presets = [];
      for (const preset of PRESETS) {
        const name = preset.id;
        const item = { id: name, type: 'cabsys', x: 0, z: 0, rot: 0, w: 120, h: 240, d: 60,
          variant: 'white', cab: makeSpec(name, 120, 240, 60), runtimeState: { cabinetOpen: .4 } };
        const group = new THREE.Group(); buildItem(group, item);
        item.runtimeState.cabinetOpen = .5; item.cab.open = .5;
        const reused = updateCabinetRuntimeMesh(group, item);
        if (!reused) { clearGroup(group); buildItem(group, item); }
        const fresh = new THREE.Group(); buildItem(fresh, item);
        presets.push({ name, reused, exact: snapshot(group) === snapshot(fresh) });
        clearGroup(group); clearGroup(fresh);
      }
      const item = { id: 'guard', type: 'cabsys', x: 0, z: 0, rot: 0, w: 120, h: 240, d: 60,
        cab: makeSpec('w_classic', 120, 240, 60), runtimeState: { cabinetOpen: .4 } };
      const group = new THREE.Group();
      const rebuild = () => { clearGroup(group); buildItem(group, item); };
      rebuild(); item.runtimeState.cabinetOpen = .1; item.cab.open = .1;
      const topologyRejected = !updateCabinetRuntimeMesh(group, item); rebuild();
      item.w += 1e-10; const dimensionRejected = !updateCabinetRuntimeMesh(group, item); rebuild();
      const { S } = await import('/js/state.js');
      S.parametric.definitions[item.definitionId].revision++;
      const definitionRejected = !updateCabinetRuntimeMesh(group, item); rebuild();
      window.dispatchEvent(new CustomEvent('catalogUpdated'));
      const catalogRejected = !updateCabinetRuntimeMesh(group, item); rebuild();
      window.dispatchEvent(new CustomEvent('customTextureLoaded'));
      const textureEventRejected = !updateCabinetRuntimeMesh(group, item); rebuild();
      item.tex = 'loading-texture'; const customTextureRejected = !updateCabinetRuntimeMesh(group, item); delete item.tex;
      clearGroup(group); const clearedMeshRejected = !updateCabinetRuntimeMesh(group, item);
      return { presets, topologyRejected, dimensionRejected, definitionRejected, catalogRejected, textureEventRejected, customTextureRejected, clearedMeshRejected };
    });
    assert.ok(result.presets.length > 10); assert.ok(result.presets.some(preset => preset.reused));
    assert.ok(result.presets.every(preset => preset.exact), JSON.stringify(result.presets));
    for (const [key, value] of Object.entries(result)) if (key !== 'presets') assert.equal(value, true, key);
  } finally { await page.close(); }
});
