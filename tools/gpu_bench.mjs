#!/usr/bin/env node
/* WebGPU vs WebGL2 benchmark across the app's 3D surfaces — MEASUREMENT ONLY.
 *
 *   npm start                                  # the app on :8765 (or pass --url)
 *   node tools/gpu_bench.mjs                   # 2 rounds per backend -> perf-gpu-bench.{json,md}
 *   node tools/gpu_bench.mjs --rounds=3 --frames=400 --only=planner_day,modeler_orbit
 *
 * Unlike tools/perf_harness.mjs (headless, SwiftShader: relative numbers only)
 * this drives a REAL windowed Chrome on this machine's GPU, because comparing
 * backends on a software rasteriser measures the rasteriser. Every backend run
 * is a fresh browser profile; rounds alternate WebGPU / WebGL2 so thermal and
 * cache drift land on both. vsync and the frame-rate limiter are off, so frame
 * rate is throughput (bounded by CPU submit or GPU, whichever is slower)
 * instead of the display's refresh cap.
 *
 * WebGL2 here is three's WebGPURenderer on its WebGL2 fallback backend
 * (?forceWebGL) — the path real users without WebGPU get, not the retired
 * classic WebGLRenderer.
 *
 * Windows note: the window must stay un-occluded for rAF to keep running; the
 * occlusion/backgrounding flags below handle that, a visible window pops up.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { findChrome } from "./browser_harness.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const URL_BASE = arg("url", "http://localhost:8765/");
const ROUNDS = Math.max(1, parseInt(arg("rounds", "2"), 10) || 2);
const FRAMES = Math.max(60, parseInt(arg("frames", "300"), 10) || 300);
const OUT = arg("out", join(ROOT, "perf-gpu-bench.json"));
const ONLY = arg("only", "") ? new Set(arg("only", "").split(",")) : null;
// Order matters: init builds and disposes extra renderers over the planner's
// own scene graph, which measurably slows the main view afterwards, so it
// runs last; the cabinet runs after Night Shift because on the WebGL2
// fallback (ANGLE/D3D11) its first compile can reset the GPU process and take
// every context in the page down with it (reported as contextLost).
const SCENARIOS = ["planner_day", "planner_night", "modeler_orbit", "night_shift", "cabinet_orbit", "init"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- browser ------------------------------------------------------------ */
async function launch() {
  const chrome = await findChrome();
  if (!chrome) throw new Error("Chrome not found");
  const profile = mkdtempSync(join(tmpdir(), "mf-gpubench-"));
  const child = spawn(chrome, [
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
    "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--disable-gpu-vsync", "--disable-frame-rate-limit",
    "--window-size=1500,1000", "--window-position=30,30", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    child.stderr.on("data", (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) res(m[0]); });
    setTimeout(() => rej(new Error("Chrome did not expose a devtools socket")), 20000);
  });
  child.stderr.resume();
  let id = 0;
  const pending = new Map();
  const logs = [];
  const connect = (u) => new Promise((res) => {
    const ws = new WebSocket(u);
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method === "Runtime.exceptionThrown") logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    });
    ws.on("open", () => res(ws));
  });
  const send = (ws, method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
  const browser = await connect(wsUrl);
  const { result: { targetId } } = await send(browser, "Target.createTarget", { url: "about:blank" });
  const page = await connect(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
  await send(page, "Page.enable");
  await send(page, "Runtime.enable");
  await send(page, "Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, ms = 180000) => {
    const r = await Promise.race([
      send(page, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      sleep(ms).then(() => ({ result: { result: { value: { error: "timeout after " + ms + "ms" } } } })),
    ]);
    if (r.result?.exceptionDetails) return { error: (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || "").slice(0, 400) };
    return r.result?.result?.value;
  };
  const close = () => { try { child.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  const version = (await send(browser, "Browser.getVersion")).result?.product;
  return { evaluate, navigate: (url) => send(page, "Page.navigate", { url }), close, logs, version };
}

/* ---- in-page helpers (installed once per page) -------------------------- */
const PAGE_HELPERS = `(async () => {
  const tl = await import("/js/three_lazy.js"); await tl.loadThree();
  const THREE = tl.THREE;
  const B = window.__bench = { cpu: 0, depth: 0, last: new Map() };
  // Top-level CPU time inside render()/RenderPipeline.render(): nested pass
  // renders are counted once, through their outermost caller.
  const wrap = (proto, record) => {
    const orig = proto.render;
    proto.render = function () {
      if (record && this.domElement) B.last.set(this.domElement.id || "anon", { r: this, scene: arguments[0], camera: arguments[1], orig });
      const t0 = performance.now(); B.depth++;
      try { return orig.apply(this, arguments); }
      finally { B.depth--; if (B.depth === 0) B.cpu += performance.now() - t0; }
    };
  };
  wrap(THREE.WebGPURenderer.prototype, true);
  if (THREE.RenderPipeline) wrap(THREE.RenderPipeline.prototype, false);
  const stats = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    return { n: a.length, mean: +mean.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), p99: +q(0.99).toFixed(3) };
  };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  // Sample N frames. perFrame(i) runs at the top of each rAF (move the
  // camera, or render directly); the interval between rAFs is the frame time.
  // The warm-up replays the exact same N camera poses first, so pipelines for
  // everything the path reveals are compiled before measuring; what hitches
  // remain show up in p99, and fpsMedian (1000 / p50 frame) ignores them.
  B.frames = async (n, perFrame, warm) => {
    const warmN = warm == null ? n : warm;
    for (let i = 0; i < warmN; i++) { if (perFrame) perFrame(i % n); await raf(); }
    const dt = [], cpu = []; let prev = await raf();
    for (let i = 0; i < n; i++) {
      B.cpu = 0;
      if (perFrame) perFrame(i);
      const now = await raf();
      dt.push(now - prev); cpu.push(B.cpu); prev = now;
    }
    const f = stats(dt);
    return { fps: +(1000 / f.mean).toFixed(1), fpsMedian: +(1000 / f.p50).toFixed(1), frameMs: f, renderCpuMs: stats(cpu) };
  };
  B.stats = stats;
  B.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // GPU-complete wait (three r185 removed renderer.waitForGPU()).
  B.gpuDone = async (r) => {
    if (r.backend.isWebGPUBackend) await r.backend.device.queue.onSubmittedWorkDone();
    else { const gl = r.backend.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
  };
  // dispose() frees three's resources but a WebGL context lingers until GC,
  // and Chrome evicts the OLDEST context past ~16 — the app's own main view.
  B.release = (r) => {
    const gl = !r.backend.isWebGPUBackend && r.backend.gl;
    r.dispose();
    const lose = gl && gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  };
  B.backend = (r) => (r && r.initialized ? (r.backend.isWebGPUBackend ? "WebGPU" : "WebGL2") : "pending");
  return "ok";
})()`;

/* ---- scenarios ---------------------------------------------------------- */
const SCENARIO_CODE = {
  // Backend bring-up and cold pipeline compile of the full planner scene.
  init: `(async () => {
    const B = window.__bench, gpu = await import("/js/gpu.js"), v = await import("/js/view3d.js");
    const inits = [];
    for (let i = 0; i < 3; i++) {
      const cv = document.createElement("canvas"); cv.width = cv.height = 256;
      const t0 = performance.now(); const r = gpu.createRenderer({ canvas: cv, antialias: true }); await gpu.ready(r);
      inits.push(performance.now() - t0); B.release(r);
    }
    const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720;
    const r = gpu.createRenderer({ canvas: cv, antialias: true }); await gpu.ready(r); r.setSize(1280, 720, false);
    r.shadowMap.enabled = true;
    const scene = v.getMainScene(), cam = v.getMainCamera(), env = scene.environment; scene.environment = null;
    let compileMs = null, firstFrameMs = null, secondFrameMs = null;
    try {
      let t0 = performance.now(); await r.compileAsync(scene, cam); compileMs = performance.now() - t0;
      t0 = performance.now(); r.render(scene, cam); await B.gpuDone(r); firstFrameMs = performance.now() - t0;
      const warm = [];
      for (let i = 0; i < 10; i++) { t0 = performance.now(); r.render(scene, cam); await B.gpuDone(r); warm.push(performance.now() - t0); }
      secondFrameMs = B.stats(warm).p50;
    } finally { scene.environment = env; B.release(r); }
    return { backend: B.backend(v.getRenderer()), rendererInitMs: B.stats(inits), sceneCompileMs: +compileMs.toFixed(1),
      firstFrameMs: +firstFrameMs.toFixed(1), secondFrameMs: +secondFrameMs.toFixed(1) };
  })()`,

  planner_day: plannerOrbit(13),
  planner_night: plannerOrbit(22),


  modeler_orbit: `(async () => {
    const B = window.__bench, { openModeler, closeModeler } = await import("/js/modeler.js");
    const parts = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++)
      parts.push({ id: "p" + i + "_" + j, kind: "box", x0: i * 14, x1: i * 14 + 10, y0: 0, y1: 8 + ((i * 7 + j * 3) % 20), z0: j * 14, z1: j * 14 + 10 });
    openModeler(null, { key: "bench", name: "Bench", parts }, null);
    for (let i = 0; i < 80 && !(B.last.get("mdPrev") && B.last.get("mdPrev").r.initialized); i++) await B.sleep(100);
    await B.sleep(2500);
    const res = await directOrbit(B, "mdPrev", ${FRAMES});
    closeModeler(); window.__setViewMode("3d"); await B.sleep(800);
    return res;
  })()`,

  cabinet_orbit: `(async () => {
    const B = window.__bench, st = await import("/js/state.js"), { makeSpec } = await import("/js/cabinet.js");
    const cab = await import("/js/ui_cabinet.js");
    const item = { id: "cab-bench", type: "cabsys", x: 0, z: 0, rot: 0, w: 240, d: 60, h: 240, variant: "sage", cab: makeSpec("w_classic", 240, 240, 60) };
    st.S.items.push(item); cab.openCabinet(item); (await import("/js/ui_cabinet_view.js")).setMode("3d");
    for (let i = 0; i < 80 && !(B.last.get("cbPrev") && B.last.get("cbPrev").r.initialized); i++) await B.sleep(100);
    await B.sleep(2000);
    const res = await directOrbit(B, "cbPrev", ${FRAMES});
    if (cab.closeCabinet) cab.closeCabinet();
    st.S.items = st.S.items.filter((i) => i !== item); await B.sleep(800);
    return res;
  })()`,

  // The game's own loop renders; we only sample its frame times.
  night_shift: `(async () => {
    const B = window.__bench, z = await import("/js/zombies_game.js");
    window.__setViewMode("3d"); z.toggleZombies(true); await B.sleep(5000);
    const go = document.querySelector("#zResume"); if (go) go.click();
    await B.sleep(2500);
    const res = await B.frames(${FRAMES}, null, 30);
    res.live = !!(res.renderCpuMs && res.renderCpuMs.p50 > 0);
    z.toggleZombies(false); await B.sleep(1000);
    return res;
  })()`,
};

function plannerOrbit(hour) {
  return `(async () => {
    const B = window.__bench, st = await import("/js/state.js"), v = await import("/js/view3d.js");
    window.__setViewMode("3d"); st.S.hour = ${hour}; v.applyEnv();
    // setOrbitCamera only requests a redraw. (S.dirty3D would rebuild the whole
    // house every frame and measure that instead.) Let the hour change settle.
    const base = v.getOrbitCamera(); await B.sleep(2500);
    const res = await B.frames(${FRAMES}, (i) => { v.setOrbitCamera({ theta: base.theta + i * 0.012, phi: 0.95, radius: 1500 }); });
    const r = v.getRenderer();
    res.backend = B.backend(r); res.drawCalls = r.info && r.info.render ? r.info.render.drawCalls ?? r.info.render.calls : null;
    return res;
  })()`;
}

// Editors render on demand; drive their renderer directly with an orbiting
// copy of the last camera they used.
const DIRECT_ORBIT = `window.directOrbit = async function (B, id, n) {
  const hit = B.last.get(id); if (!hit) return { error: "no renderer for #" + id };
  const cam = hit.camera.clone(), target = new hit.camera.position.constructor(0, 0, 0);
  const radius = Math.max(hit.camera.position.length(), 50), y = hit.camera.position.y;
  const res = await B.frames(n, (i) => {
    const a = i * 0.012; cam.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius); cam.lookAt(target); cam.updateMatrixWorld();
    hit.r.render(hit.scene, cam);
  });
  res.backend = B.backend(hit.r);
  res.contextLost = !!(hit.r.backend.gl && hit.r.backend.gl.isContextLost());
  res.drawCalls = hit.r.info && hit.r.info.render ? hit.r.info.render.drawCalls ?? hit.r.info.render.calls : null;
  return res;
}; "ok"`;

/* ---- one backend run ---------------------------------------------------- */
async function runBackend(backend) {
  const b = await launch();
  const out = { backend, chrome: b.version, scenarios: {}, errors: [] };
  try {
    const sep = URL_BASE.includes("?") ? "&" : "?";
    await b.navigate(URL_BASE + sep + "lang=en" + (backend === "webgl2" ? "&forceWebGL" : ""));
    for (let i = 0; i < 120 && !(await b.evaluate("!!window.__home3dBooted", 5000)); i++) await sleep(500);
    await b.evaluate(`[...document.querySelectorAll("button")].find(b=>/Continue with/.test(b.textContent))?.click()`);
    await sleep(500);
    await b.evaluate(PAGE_HELPERS);
    await b.evaluate(DIRECT_ORBIT);
    // The catalog-thumbnail warm-up renders every model in the background on
    // the main thread, and each first-seen material is a shader compile of up
    // to seconds. Let it finish (its duration is itself the cold-compile
    // number) so it does not land inside another scenario's frames.
    out.thumbPrewarm = await b.evaluate(`(async () => {
      const th = await import("/js/thumbs.js"), { FURN } = await import("/js/furniture.js");
      const types = Object.keys(FURN), t0 = performance.now();
      while (performance.now() - t0 < 900000 && !types.every((t) => th.hasThumb(t))) await new Promise((r) => setTimeout(r, 500));
      return { models: types.length, done: types.filter((t) => th.hasThumb(t)).length, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
    })()`, 960000);
    console.log(`  ${backend} thumbnail prewarm`, JSON.stringify(out.thumbPrewarm));
    out.gpu = await b.evaluate(`(async () => {
      const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      const c = document.createElement("canvas").getContext("webgl2"), x = c && c.getExtension("WEBGL_debug_renderer_info");
      return { adapter: a ? { vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description } : null,
        webgl: c ? c.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : c.RENDERER) : null };
    })()`);
    // a realistic, repeatable house: the large generated apartment, seed 3
    out.scene = await b.evaluate(`(async () => {
      const g = await import("/js/generator.js"), st = await import("/js/state.js"), { executeCommand } = await import("/js/commands/executor.js");
      const r = executeCommand(g.apartmentGenerateCommand, { size: "large", replace: true, replaceInfrastructure: true, infrastructure: false, seed: 3 }, { domain: "planner", state: st.S }, { history: false });
      window.__setViewMode("3d"); st.S.dirty3D = true; await new Promise((res) => setTimeout(res, 4000));
      const v = await import("/js/view3d.js"); let meshes = 0; v.getMainScene().traverse((o) => { if (o.isMesh) meshes++; });
      return { ok: r.ok, items: st.S.items.length, meshes, mainBackend: window.__bench.backend(v.getRenderer()) };
    })()`);
    for (const name of SCENARIOS) {
      if (ONLY && !ONLY.has(name)) continue;
      const before = b.logs.length;
      const t0 = Date.now();
      out.scenarios[name] = await b.evaluate(SCENARIO_CODE[name]);
      const errs = b.logs.slice(before);
      if (errs.length) out.errors.push({ scenario: name, errors: errs.slice(0, 5) });
      console.log(`  ${backend} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`, JSON.stringify(out.scenarios[name]).slice(0, 160));
    }
  } finally {
    b.close();
  }
  return out;
}

/* ---- aggregation + report ----------------------------------------------- */
const median = (a) => { const s = a.filter((x) => typeof x === "number").sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pick = (run, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), run);

const METRICS = [
  ["_prewarm", "seconds", "Catalog thumbnail warm-up, all models, cold (s)", "lower"],
  ["init", "rendererInitMs.p50", "Renderer init (ms, p50)", "lower"],
  ["init", "sceneCompileMs", "Planner scene pipeline compile (ms)", "lower"],
  ["init", "firstFrameMs", "First frame after compile (ms)", "lower"],
  ["init", "secondFrameMs", "Warm full frame, GPU-complete, 1280x720 (ms, p50)", "lower"],
  ["planner_day", "fpsMedian", "Planner 3D day orbit (fps, median frame)", "higher"],
  ["planner_day", "fps", "Planner 3D day orbit (fps, mean incl. hitches)", "higher"],
  ["planner_day", "frameMs.p95", "Planner 3D day frame p95 (ms)", "lower"],
  ["planner_day", "renderCpuMs.p50", "Planner 3D day render CPU p50 (ms)", "lower"],
  ["planner_night", "fpsMedian", "Planner 3D night orbit (fps, median frame)", "higher"],
  ["planner_night", "fps", "Planner 3D night orbit (fps, mean incl. hitches)", "higher"],
  ["planner_night", "frameMs.p95", "Planner 3D night frame p95 (ms)", "lower"],
  ["planner_night", "renderCpuMs.p50", "Planner 3D night render CPU p50 (ms)", "lower"],
  ["modeler_orbit", "fpsMedian", "CAD modeler orbit, 36 parts (fps, median frame)", "higher"],
  ["modeler_orbit", "renderCpuMs.p50", "CAD modeler render CPU p50 (ms)", "lower"],
  ["cabinet_orbit", "fpsMedian", "Cabinet designer orbit (fps, median frame)", "higher"],
  ["cabinet_orbit", "renderCpuMs.p50", "Cabinet render CPU p50 (ms)", "lower"],
  ["night_shift", "fpsMedian", "Night Shift gameplay (fps, median frame)", "higher"],
  ["night_shift", "frameMs.p95", "Night Shift frame p95 (ms)", "lower"],
];

function report(runs) {
  const by = { webgpu: runs.filter((r) => r.backend === "webgpu"), webgl2: runs.filter((r) => r.backend === "webgl2") };
  const rows = METRICS.map(([sc, path, label, better]) => {
    // a Night Shift run whose game never went live measured an idle page
    const src = (r) => (sc === "_prewarm" ? r.thumbPrewarm
      : sc === "night_shift" && !(r.scenarios.night_shift || {}).live ? null
      : (r.scenarios[sc] || {}).contextLost ? null : r.scenarios[sc]);
    const g = median(by.webgpu.map((r) => pick(src(r), path)));
    const l = median(by.webgl2.map((r) => pick(src(r), path)));
    let delta = null;
    if (g != null && l != null && l !== 0) delta = better === "higher" ? (g / l - 1) * 100 : (l / g - 1) * 100;
    return { scenario: sc, metric: label, webgpu: g, webgl2: l, webgpuAdvantagePct: delta == null ? null : +delta.toFixed(1) };
  });
  const first = runs[0] || {};
  const fmt = (x) => (x == null ? "—" : typeof x === "number" ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : String(x));
  const md = [
    "# WebGPU vs WebGL2 — app benchmark",
    "",
    `Generated by \`node tools/gpu_bench.mjs\` on ${new Date().toISOString().slice(0, 10)}. ${ROUNDS} round(s) per backend, ${FRAMES} sampled frames per orbit, fresh browser per run, vsync off.`,
    "",
    `- Chrome: ${first.chrome || "?"}`,
    `- WebGPU adapter: ${first.gpu?.adapter ? [first.gpu.adapter.vendor, first.gpu.adapter.architecture, first.gpu.adapter.description].filter(Boolean).join(" / ") : "none"}`,
    `- WebGL renderer: ${first.gpu?.webgl || "?"}`,
    `- Scene: generated large apartment (seed 3), ${first.scene?.items ?? "?"} items, ${first.scene?.meshes ?? "?"} meshes`,
    "",
    "Both columns are three r185 `WebGPURenderer`; WebGL2 is its fallback backend (`?forceWebGL`). Medians across rounds. **WebGPU advantage** is how much better WebGPU is (positive) or worse (negative) on that metric.",
    "",
    "| Metric | WebGPU | WebGL2 | WebGPU advantage |",
    "|---|---:|---:|---:|",
    ...rows.map((r) => `| ${r.metric} | ${fmt(r.webgpu)} | ${fmt(r.webgl2)} | ${r.webgpuAdvantagePct == null ? "—" : (r.webgpuAdvantagePct > 0 ? "+" : "") + r.webgpuAdvantagePct.toFixed(1) + "%"} |`),
    "",
  ];
  const lost = runs.filter((r) => Object.values(r.scenarios).some((x) => x && x.contextLost));
  if (lost.length) md.push("## Invalid samples", "", ...lost.map((r) => `- ${r.backend}: ${Object.entries(r.scenarios).filter(([, x]) => x && x.contextLost).map(([k]) => k).join(", ")} lost its GL context (GPU process reset); excluded, shown as —.`), "");
  const errs = runs.flatMap((r) => r.errors.map((e) => `- ${r.backend} / ${e.scenario}: ${e.errors.join(" | ").slice(0, 300)}`));
  if (errs.length) md.push("## Console errors during runs", "", ...errs, "");
  return { rows, md: md.join("\n") };
}

/* ---- main --------------------------------------------------------------- */
const runs = [];
for (let round = 0; round < ROUNDS; round++) {
  const order = round % 2 === 0 ? ["webgpu", "webgl2"] : ["webgl2", "webgpu"];
  for (const backend of order) {
    console.log(`round ${round + 1}/${ROUNDS}: ${backend}`);
    runs.push(await runBackend(backend));
  }
}
const { rows, md } = report(runs);
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), rounds: ROUNDS, frames: FRAMES, summary: rows, runs }, null, 2));
writeFileSync(OUT.replace(/\.json$/, ".md"), md);
console.log("\n" + md);
console.log("wrote", OUT, "and", OUT.replace(/\.json$/, ".md"));
process.exit(0);
