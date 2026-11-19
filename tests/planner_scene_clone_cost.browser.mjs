import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';

const gpu = process.env.MF_BROWSER_GPU === '1' ? { timeout: 120000 } : { skip: 'Run with MF_BROWSER_GPU=1' };

// The large generated apartment, in the 3D view, with every pending rebuild drained.
async function apartment(page, mode) {
  await page.goto('/');
  await page.eval(async (viewMode) => {
    const g = await import('/js/generator.js'), { S } = await import('/js/state.js');
    const { executeCommand } = await import('/js/commands/executor.js');
    executeCommand(g.apartmentGenerateCommand, { size: 'large', replace: true, replaceInfrastructure: true, infrastructure: false, seed: 3 },
      { domain: 'planner', state: S }, { history: false });
    window.__setViewMode(viewMode);
    return true;
  }, mode);
  await page.waitUntil(async () => {
    const v = await import('/js/view3d.js'), { S } = await import('/js/state.js');
    return v.has3D() && v.getRenderer()?.initialized && !S.dirty3D && !S.items3D.size;
  }, { ms: 60000, what: 'apartment built in 3D' });
}

test('planner scene objects keep no three objects in userData, so cloning a wall stays cheap', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await apartment(page, '3d');
    const result = await page.eval(async () => {
      const v = await import('/js/view3d.js');
      const frame = () => new Promise(requestAnimationFrame);
      for (let i = 0; i < 10; i++) await frame(); // near-wall cutaway builds its stubs
      // Object3D.copy deep-copies userData through JSON: a scene object kept
      // there is serialized whole, textures as PNG data URLs.
      const held = [];
      const scan = (value, path, depth, owner) => {
        if (!value || typeof value !== 'object' || depth > 4) return;
        if (value.isObject3D || value.isMaterial || value.isTexture || value.isBufferGeometry) { held.push(owner + ' userData.' + path); return; }
        for (const key of Object.keys(value)) scan(value[key], path ? path + '.' + key : key, depth + 1, owner);
      };
      const walls = [];
      v.getMainScene().traverse((o) => {
        scan(o.userData, '', 0, o.type);
        if (o.isGroup && o.userData.wall) walls.push(o);
      });
      let readbacks = 0;
      const real = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () { readbacks++; return real.apply(this, arguments); };
      const t0 = performance.now();
      try { walls.forEach((w) => w.clone(true)); } finally { HTMLCanvasElement.prototype.toDataURL = real; }
      return { held: [...new Set(held)], walls: walls.length, readbacks, cloneMs: performance.now() - t0 };
    });
    assert.ok(result.walls > 10, 'the apartment has walls to clone');
    assert.deepEqual(result.held, []);
    assert.equal(result.readbacks, 0, 'cloning walls must not serialize textures');
  } finally { await page.close(); }
});

test('the first selection of a session draws its inspector preview without freezing the page', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await apartment(page, 'plan');
    await new Promise((r) => setTimeout(r, 4000)); // let background 3D settle
    const result = await page.eval(async () => {
      const { S } = await import('/js/state.js'), { select } = await import('/js/ui_props.js');
      const preview = await import('/js/inspector_preview.js');
      const frame = () => new Promise(requestAnimationFrame);
      const tasks = [];
      const po = new PerformanceObserver((list) => list.getEntries().forEach((e) => tasks.push(Math.round(e.duration))));
      po.observe({ type: 'longtask' });
      const len = (w) => Math.hypot(S.nodes[w.b].x - S.nodes[w.a].x, S.nodes[w.b].z - S.nodes[w.a].z);
      select({ kind: 'wall', ref: S.walls.slice().sort((p, q) => len(q) - len(p))[0] });
      const t0 = performance.now();
      while (!preview.inspectorOverlayBounds() && performance.now() - t0 < 20000) await frame();
      await new Promise((r) => setTimeout(r, 300));
      tasks.push(...po.takeRecords().map((e) => Math.round(e.duration)));
      po.disconnect();
      return { drawn: !!preview.inspectorOverlayBounds(), longest: tasks.length ? Math.max(...tasks) : 0, tasks };
    });
    assert.equal(result.drawn, true, 'the preview drew the selection');
    // its own GPU device used to build every shader in one task (0.5 s warm, 2+ s cold)
    assert.ok(result.longest < 300, `longest main-thread task ${result.longest} ms (${result.tasks.join(', ')})`);
  } finally { await page.close(); }
});

test('the inspector preview shows the rebuilt wall after a plan-only drag, not the build it held', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await apartment(page, 'plan');
    const result = await page.eval(async () => {
      const { S } = await import('/js/state.js'), v = await import('/js/view3d.js');
      const { select } = await import('/js/ui_props.js'), preview = await import('/js/inspector_preview.js');
      const frame = () => new Promise(requestAnimationFrame);
      const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
      const press = (type) => window.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, isPrimary: true }));
      const len = (w) => Math.hypot(S.nodes[w.b].x - S.nodes[w.a].x, S.nodes[w.b].z - S.nodes[w.a].z);
      const wall = S.walls.slice().sort((p, q) => len(q) - len(p))[0];
      select({ kind: 'wall', ref: wall });
      const w0 = performance.now(); // the preview's own renderer initializes asynchronously
      while (!preview.inspectorOverlayBounds() && performance.now() - w0 < 20000) await frame();
      const before = preview.inspectorOverlayBounds();
      press('pointerdown');
      S.nodes[wall.a].z -= 50; S.nodes[wall.b].z -= 50; S.dirty3D = true;
      await frames(4);
      press('pointerup');
      const t0 = performance.now();
      while (S.dirty3D && performance.now() - t0 < 3000) await frame();
      await frames(6);
      const box = v.getSelectionBox3D(), host = document.getElementById('inspectorPreview');
      const rect = host && host.getBoundingClientRect();
      return { before, after: preview.inspectorOverlayBounds(), scene: box && { min: box.min.toArray(), max: box.max.toArray() },
        host: host ? { hidden: host.hidden, w: rect.width, h: rect.height, cls: host.className, panelOpen: !!host.offsetParent } : null, sel: S.sel && S.sel.kind };
    });
    assert.ok(result.before && result.after && result.scene, 'preview and scene both have the wall: ' + JSON.stringify(result));
    // the scene's selection box is padded 2 cm for its outline
    const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 2.5);
    assert.ok(Math.abs(result.after.min[2] - result.before.min[2]) > 40, 'the preview moved with the wall');
    assert.ok(near(result.after.min, result.scene.min) && near(result.after.max, result.scene.max),
      `preview ${JSON.stringify(result.after)} matches the rebuilt scene ${JSON.stringify(result.scene)}`);
  } finally { await page.close(); }
});

test('with the 3D pane visible, a plan drag is followed at a few rebuilds a second, not on every move', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await apartment(page, 'split');
    const result = await page.eval(async () => {
      const { S } = await import('/js/state.js');
      const frame = () => new Promise(requestAnimationFrame);
      const plan = document.getElementById('plan');
      const at = (type) => plan.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 11, isPrimary: true, buttons: type === 'pointerup' ? 0 : 1 }));
      // One rebuild first: it ends any idle shader warm-up in flight and pushes
      // the next one 3 s out, so the window below measures only the drag.
      S.dirty3D = true;
      for (let i = 0; i < 600 && S.dirty3D; i++) await frame();
      at('pointerdown');
      let rebuilds = 0, frames = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) {
        S.dirty3D = true; // what each move of a wall drag asks for
        await frame(); frames++;
        if (!S.dirty3D) rebuilds++;
      }
      at('pointerup');
      const r0 = performance.now();
      S.dirty3D = true;
      while (S.dirty3D && performance.now() - r0 < 5000) await frame();
      return { rebuilds, frames, settled: !S.dirty3D };
    });
    assert.ok(result.rebuilds >= 6, `the 3D view kept following the drag (${result.rebuilds} rebuilds in 1.5 s)`);
    assert.ok(result.rebuilds < result.frames / 2, `not on every move (${result.rebuilds} rebuilds over ${result.frames} frames)`);
    assert.equal(result.settled, true, 'the release rebuilds at once');
  } finally { await page.close(); }
});

test('a hidden 3D pane holds rebuilds during a gesture and catches up after it; a visible one never holds', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await apartment(page, 'plan');
    const result = await page.eval(async () => {
      const { S } = await import('/js/state.js');
      const frame = () => new Promise(requestAnimationFrame);
      const press = (type) => window.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, isPrimary: true }));
      const dirtyAfterFrames = async (n) => { for (let i = 0; i < n; i++) await frame(); return S.dirty3D; };
      press('pointerdown');
      S.dirty3D = true;
      const heldHidden = await dirtyAfterFrames(6);
      press('pointerup');
      const t0 = performance.now();
      while (S.dirty3D && performance.now() - t0 < 10000) await frame();
      const caughtUpMs = performance.now() - t0, caughtUp = !S.dirty3D;
      // A release can be lost (outside the window, focus moved away): a move
      // that reports no buttons, or a blur, must end the hold too.
      // generous bounds: under a loaded suite frames can be slow; the hold itself is 300 ms
      const settles = async () => { const s0 = performance.now(); while (S.dirty3D && performance.now() - s0 < 10000) await frame(); return !S.dirty3D; };
      press('pointerdown'); S.dirty3D = true;
      const heldBeforeLostRelease = await dirtyAfterFrames(4);
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, isPrimary: true, buttons: 0 }));
      const lostReleaseSettles = await settles();
      press('pointerdown'); S.dirty3D = true;
      window.dispatchEvent(new Event('blur'));
      const blurSettles = await settles();
      window.__setViewMode('3d');
      await frame(); await frame();
      press('pointerdown');
      S.dirty3D = true;
      const heldVisible = await dirtyAfterFrames(3);
      press('pointerup');
      return { heldHidden, caughtUp, caughtUpMs, heldVisible, heldBeforeLostRelease, lostReleaseSettles, blurSettles };
    });
    assert.equal(result.heldBeforeLostRelease, true);
    assert.equal(result.lostReleaseSettles, true, 'a buttonless move ends a press whose release was missed');
    assert.equal(result.blurSettles, true, 'losing focus ends the press');
    assert.equal(result.heldHidden, true, 'no rebuild while the plan-only gesture is in progress');
    assert.equal(result.caughtUp, true, 'the held rebuild lands after the gesture');
    assert.ok(result.caughtUpMs < 5000, `caught up in ${result.caughtUpMs} ms`);
    assert.equal(result.heldVisible, false, 'a visible 3D view rebuilds as before');
  } finally { await page.close(); }
});
