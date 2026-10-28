import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';

const gpu = process.env.MF_BROWSER_GPU === '1' ? { timeout: 180000 } : { skip: 'Run with MF_BROWSER_GPU=1' };

/* The shadow-set warm-up builds the dusk and night shaders while the view is
   idle. A time change in the middle of it used to end it for good (only a
   rebuild re-armed it), so the 18:00 handoff then built ~12 lit pipelines on
   the spot: a 4-6 s freeze. */
test('an interrupted shadow-set warm-up resumes, so dusk does not build its shaders on the spot', gpu, async () => {
  const page = await openPage({ width: 1280, height: 900 });
  try {
    await page.goto('/');
    await page.eval(async () => {
      const g = await import('/js/generator.js'), { S } = await import('/js/state.js');
      const { executeCommand } = await import('/js/commands/executor.js');
      executeCommand(g.apartmentGenerateCommand, { size: 'large', replace: true, replaceInfrastructure: true, infrastructure: false, seed: 3 },
        { domain: 'planner', state: S }, { history: false });
      window.__setViewMode('3d');
      return true;
    });
    await page.waitUntil(async () => {
      const v = await import('/js/view3d.js'), { S } = await import('/js/state.js');
      return v.has3D() && v.getRenderer()?.initialized && !S.dirty3D;
    }, { ms: 60000, what: 'apartment built in 3D' });
    // Short evaluations (the harness caps each one); counters live on window.
    await page.eval(async () => {
      const v = await import('/js/view3d.js'), { S } = await import('/js/state.js');
      const device = v.getRenderer().backend.device, made = { async: 0, sync: 0 };
      const realAsync = device.createRenderPipelineAsync, realSync = device.createRenderPipeline;
      device.createRenderPipelineAsync = function () { made.async++; return realAsync.apply(this, arguments); };
      device.createRenderPipeline = function () { made.sync++; return realSync.apply(this, arguments); };
      window.__duskProbe = { made, restore() { device.createRenderPipelineAsync = realAsync; device.createRenderPipeline = realSync; } };
      S.hour = 13; v.applyEnv();
      return true;
    });
    await page.waitUntil(() => window.__duskProbe.made.async >= 1, { ms: 60000, what: 'the warm-up started' });
    // Anything that wants a frame ends a run: here an orbit nudge.
    const atInterrupt = await page.eval(async () => {
      const v = await import('/js/view3d.js'), cam = v.getOrbitCamera();
      v.setOrbitCamera({ theta: cam.theta + 0.02, phi: cam.phi, radius: cam.radius });
      window.__duskProbe.atInterrupt = window.__duskProbe.made.async;
      return window.__duskProbe.atInterrupt;
    });
    await page.waitUntil(() => window.__duskProbe.made.async >= window.__duskProbe.atInterrupt + 4,
      { ms: 90000, what: 'the warm-up resumed after the interruption (built ' + atInterrupt + ' before it)' });
    await new Promise((r) => setTimeout(r, 20000)); // let it finish the sets
    const result = await page.eval(async () => {
      const v = await import('/js/view3d.js'), { S } = await import('/js/state.js');
      const frame = () => new Promise(requestAnimationFrame), probe = window.__duskProbe;
      try {
        const warmed = probe.made.async;
        probe.made.sync = 0;
        for (const h of [16, 17, 17.5, 18]) { S.hour = h; v.applyEnv(); for (let i = 0; i < 3; i++) await frame(); }
        await v.getRenderer().backend.device.queue.onSubmittedWorkDone();
        return { warmed, builtAtDusk: probe.made.sync };
      } finally { probe.restore(); }
    });
    assert.ok(result.warmed >= 8, `the warm-up resumed after the interruption (${result.warmed} pipelines built ahead)`);
    assert.ok(result.builtAtDusk <= 3, `dusk built ${result.builtAtDusk} pipelines on the spot`);
  } finally { await page.close(); }
});
