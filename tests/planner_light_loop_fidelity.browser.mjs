// js/light_loop.js draws the planner's unshadowed lights in one shader loop
// instead of one block of code each. It must not change the picture: on a
// real flat (the large generated apartment, seed 3: window light, ceiling
// lamps, table and floor lamps, several rooms) a page with the loop is
// compared pixel for pixel with a page on three's own per-light code, by day
// (sun and windows cast), at dusk (sun and ceiling lamps) and at night (lamps
// only), on both backends. A second page on three's path is the control: the
// comparison only counts if three's path renders the same twice. The lit
// render is compared (renderer.render, no post): the post chain's GTAO/TRAA
// noise differs from page to page on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';
import { servePlannerPerformance } from './helpers/planner_performance_server.mjs';

const HOURS = [13, 17.5, 22];

async function renderHours(server, backend, loop) {
  const page = await openPage({ width: 1280, height: 900, lang: 'en' });
  try {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('home3d_start_done','1');" });
    await page.send('Page.navigate', { url: server.origin + '/?lightLoop=' + (loop ? 1 : 0) + (backend === 'webgl2' ? '&forceWebGL' : '') });
    await page.waitUntil(new Function('return location.origin === ' + JSON.stringify(server.origin) + ' && !!window.__home3dBooted'), { ms: 60000 });
    await page.eval(async () => {
      const { S } = await import('/js/state.js'), view = await import('/js/view3d.js');
      const g = await import('/js/generator.js'), { executeCommand } = await import('/js/commands/executor.js');
      window.__setViewMode('3d'); await view.init3D();
      executeCommand(g.apartmentGenerateCommand, { size: 'large', replace: true, replaceInfrastructure: true, infrastructure: false, seed: 3 },
        { domain: 'planner', state: S }, { history: false });
      // The house's smart-home rules change the lamps on their own clock
      // (every 20 s, e.g. "Sunset Lights" dims them to 60 % once the hour
      // rounds to 18): a capture would race that tick, not test the lighting.
      (await import('/js/smarthome.js')).ensureSmartHome().automations.forEach((a) => { a.enabled = false; });
      S.dirty3D = false; view.rebuild3D(); view.applyEnv(); view.frameView();
      const r = view.getRenderer(), scene = view.getMainScene(), cam = view.getMainCamera();
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const gpuDone = async () => {
        if (r.backend.device) await r.backend.device.queue.onSubmittedWorkDone();
        else { const gl = r.backend.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
      };
      const settle = async () => { view.requestShadowUpdate(); for (let i = 0; i < 60; i++) { view.requestRender(); await frame(); } await gpuDone(); };
      const shot = () => { r.render(scene, cam); return r.domElement.toDataURL('image/png'); };
      // a handoff draws its new shadow maps over a few frames: wait for two equal frames
      window.loopHour = async (hour) => {
        S.hour = hour; view.applyEnv(); await settle();
        let direct = shot(), tries = 0;
        for (let next; tries < 20 && (next = (await settle(), shot())) !== direct; tries++) direct = next;
        const casting = [], unshadowed = [];
        scene.traverse((o) => {
          if (o.isLight && o.castShadow) casting.push(o.isDirectionalLight ? 'sun' : o.isSpotLight ? 'window' : 'lamp');
          else if (o.isPointLight || o.isSpotLight) unshadowed.push(o.id);
        });
        return { hour, direct, settled: tries < 20, casting: casting.join(','), unshadowed: unshadowed.length };
      };
      window.loopBiggestLitKb = () => Math.round(Math.max(0, ...[...r._pipelines.programs.fragment.keys()].map((c) => c.length)) / 1024);
      window.loopBackend = () => (r.initialized ? (r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2') : null);
    });
    await page.waitUntil(() => window.loopBackend && window.loopBackend(), { ms: 60000 });
    const hours = [];
    // one evaluation per hour: the harness caps each at 180 s
    for (const hour of HOURS) hours.push(await page.evalWithTimeout(180000, (h) => window.loopHour(h), hour));
    return { backend: await page.eval(() => window.loopBackend()), biggestLitKb: await page.eval(() => window.loopBiggestLitKb()),
      hours, errors: page.consoleErrors.slice() };
  } finally { await page?.close(); }
}

async function diffPng(a, b) {
  const page = await openPage({ width: 200, height: 200, lang: 'en' });
  try {
    return await page.evalWithTimeout(60000, async (x, y) => {
      const decode = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const p = await decode(x), q = await decode(y);
      if (p.length !== q.length) return { differing: -1, max: -1 };
      let n = 0, max = 0;
      for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - q[i]); if (d) n++; if (d > max) max = d; }
      return { differing: n, max };
    }, a, b);
  } finally { await page?.close(); }
}

for (const backend of ['webgpu', 'webgl2']) test(`the light loop renders day, dusk and night exactly as three's per-light code (${backend})`,
  process.env.MF_BROWSER_GPU === '1' ? { timeout: 900000 } : { skip: 'Requires MF_BROWSER_GPU=1 and hardware browser' }, async () => {
  const server = await servePlannerPerformance();
  try {
    const stock = await renderHours(server, backend, false);
    const looped = await renderHours(server, backend, true);
    const control = await renderHours(server, backend, false);
    for (const run of [stock, looped, control]) {
      assert.equal(run.backend, backend);
      assert.deepEqual(run.errors, []);
    }
    const sets = looped.hours.map((h) => h.casting);
    assert.ok(sets[0].includes('sun') && sets[0].includes('window'), 'day: the sun and the windows cast ' + sets[0]);
    assert.ok(sets[1].includes('sun') && sets[1].includes('lamp'), 'dusk: the sun and the lamps cast ' + sets[1]);
    assert.ok(!sets[2].includes('sun') && sets[2].includes('lamp'), 'night: the lamps cast ' + sets[2]);
    assert.ok(looped.hours.every((h) => h.unshadowed >= 5), 'the flat has lamps the loop draws');
    assert.ok(looped.biggestLitKb < stock.biggestLitKb, `the lit shaders shrink: ${stock.biggestLitKb} -> ${looped.biggestLitKb} KB`);
    for (let i = 0; i < HOURS.length; i++) {
      const h = HOURS[i];
      assert.ok(stock.hours[i].settled && looped.hours[i].settled && control.hours[i].settled, `the frame at ${h} h settles`);
      assert.equal(looped.hours[i].casting, stock.hours[i].casting, `the same lights cast at ${h} h`);
      const ctl = await diffPng(stock.hours[i].direct, control.hours[i].direct);
      assert.equal(ctl.differing, 0, `three's own path renders ${h} h the same twice: ${JSON.stringify(ctl)}`);
      const d = await diffPng(stock.hours[i].direct, looped.hours[i].direct);
      console.log(backend, h, 'h:', JSON.stringify(d), stock.biggestLitKb, '->', looped.biggestLitKb, 'KB');
      assert.equal(d.differing, 0, `lit render at ${h} h: ${JSON.stringify(d)}`);
    }
  } finally { await server.close(); }
});
