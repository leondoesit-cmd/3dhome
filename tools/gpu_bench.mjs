#!/usr/bin/env node
/* WebGPU vs WebGL2 benchmark across the app's 3D surfaces — MEASUREMENT ONLY.
 *
 *   npm start                                  # the app on :8765 (or pass --url)
 *   node tools/gpu_bench.mjs                   # 2 rounds per backend -> perf-gpu-bench.{json,md}
 *   node tools/gpu_bench.mjs --rounds=3 --frames=400 --only=planner_day,modeler_orbit
 *   node tools/gpu_bench.mjs --attach=http://127.0.0.1:9333 --url=http://mf.localhost/ --backends=webgpu
 *
 * --attach measures a browser started elsewhere (the desktop shell's WebView2,
 * desktop/README.md) through its DevTools endpoint: its one page is reused for
 * every run and never closed, so it is not a fresh profile per run. Start it
 * with the same vsync/occlusion flags as launch() below, or frame times are
 * capped at the display's refresh rate.
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
const ATTACH = arg("attach", "");
// Idle time before stall_hour: the app pre-compiles the other shadow sets while
// idle, so a short settle measures "right after an edit", a long one steady state.
const STALL_SETTLE = Math.max(0, parseInt(arg("stall-settle", "3000"), 10) || 0);
// first_open: how long the plan is left alone before 3D is opened
// --plan-copies=N tiles the generated apartment N times (fresh ids, no shared
// walls) for a big-plan run: 11 copies is ~200 walls with their openings and
// furniture. 1 (the default) keeps reports comparable with earlier ones.
const PLAN_COPIES = Math.max(1, parseInt(arg("plan-copies", "1"), 10) || 1);
const FIRST_OPEN_WAIT = Math.max(0, parseInt(arg("first-open-wait", "2000"), 10) || 0);
const BACKENDS = arg("backends", "webgpu,webgl2").split(",").filter((b) => b === "webgpu" || b === "webgl2");
// Order matters: init builds and disposes extra renderers over the planner's
// own scene graph, which measurably slows the main view afterwards, so it
// runs last; the cabinet runs after Night Shift because on the WebGL2
// fallback (ANGLE/D3D11) its first compile can reset the GPU process and take
// every context in the page down with it (reported as contextLost).
const SCENARIOS = ["planner_day", "planner_night", "modeler_orbit", "night_shift", "cabinet_orbit",
  "stall_hour", "stall_add_item", "wall_drag_plan", "wall_drag_split", "door_drag_plan", "init"];
// Edit-stall probes change the scene (hours, new items, a dragged wall), so they
// run only when named in --only; the default run stays comparable with old reports.
const OPT_IN = new Set(["stall_hour", "stall_add_item", "wall_drag_plan", "wall_drag_split", "door_drag_plan"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- browser ------------------------------------------------------------ */
async function launch() {
  if (ATTACH) return attachTo(ATTACH);
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
  return devtools(wsUrl, null, () => {
    try { child.kill(); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  });
}

// A browser started elsewhere: drive its existing page and leave it running.
async function attachTo(endpoint) {
  const { webSocketDebuggerUrl } = await (await fetch(endpoint + "/json/version")).json();
  const page = (await (await fetch(endpoint + "/json/list")).json()).find((t) => t.type === "page");
  if (!page) throw new Error("no page target at " + endpoint);
  return devtools(webSocketDebuggerUrl, page.webSocketDebuggerUrl, null);
}

async function devtools(wsUrl, pageUrl, closeBrowser) {
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
  let page;
  if (pageUrl) page = await connect(pageUrl);
  else {
    const { result: { targetId } } = await send(browser, "Target.createTarget", { url: "about:blank" });
    page = await connect(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
  }
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
  const close = () => {
    if (closeBrowser) closeBrowser();
    else { browser.close(); page.close(); }
  };
  const version = (await send(browser, "Browser.getVersion")).result?.product;
  const cdp = (method, params) => send(page, method, params);
  return { evaluate, navigate: (url) => send(page, "Page.navigate", { url }), cdp, close, logs, version };
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

  // Time-of-day steps across dusk: castShadow handoffs and environment refills.
  stall_hour: `(async () => {
    const B = window.__bench, st = await import("/js/state.js"), v = await import("/js/view3d.js");
    window.__setViewMode("3d"); st.S.hour = 14; v.applyEnv();
    // what the idle shadow-set prewarm built while we waited (async pipelines)
    const dev = v.getRenderer().backend.device, idleBuilt = { asyncPipelines: 0, shaderModules: 0, renders: 0 }, realA = dev.createRenderPipelineAsync, realM = dev.createShaderModule;
    // any frame drawn while idle postpones the prewarm by a second
    const rIdle = v.getRenderer(), realR = rIdle.render;
    idleBuilt.renderCallers = {};
    rIdle.render = function () {
      idleBuilt.renders++;
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 12;
      const key = String(new Error().stack).split("\\n").slice(2, 6).map((l) => l.trim().replace(/^at /, "").replace(/https?:\\/\\/[^/]+\\//, "")).join(" < ").slice(0, 300);
      Error.stackTraceLimit = limit;
      idleBuilt.renderCallers[key] = (idleBuilt.renderCallers[key] || 0) + 1;
      return realR.apply(this, arguments);
    };
    // who asks for those frames: repaint requests (texture loads and the like), with a sample caller
    let repaint = st.S.repaint3D; idleBuilt.repaintRequests = 0; idleBuilt.repaintCallers = {};
    Object.defineProperty(st.S, "repaint3D", { configurable: true, get: () => repaint, set: (value) => {
      if (value) { idleBuilt.repaintRequests++; const at = String(new Error().stack).split("\\n")[2] || ""; const key = at.trim().replace(/^at /, "").replace(/\\?.*?:/, ":").slice(0, 140);
        idleBuilt.repaintCallers[key] = (idleBuilt.repaintCallers[key] || 0) + 1; }
      repaint = value; } });
    if (dev) { dev.createRenderPipelineAsync = function () { idleBuilt.asyncPipelines++; return realA.apply(this, arguments); };
      dev.createShaderModule = function () { idleBuilt.shaderModules++; return realM.apply(this, arguments); }; }
    await B.sleep(${STALL_SETTLE});
    if (dev) { dev.createRenderPipelineAsync = realA; dev.createShaderModule = realM; }
    rIdle.render = realR;
    delete st.S.repaint3D; st.S.repaint3D = repaint;
    const steps = [];
    for (let h = 15; h <= 22; h += 0.5) steps.push({ hour: h, ...(await stallProbe(B, () => { st.S.hour = h; v.applyEnv(); })) });
    return { idleBuilt, steps, ...stallSummary(B, steps) };
  })()`,

  // Furniture types the scene has not drawn yet: new materials, new shaders.
  stall_add_item: profiled(`(async () => {
    const B = window.__bench, st = await import("/js/state.js"), ui = await import("/js/ui.js"), { FURN } = await import("/js/furniture.js");
    window.__setViewMode("3d"); await B.sleep(2000);
    const used = new Set(st.S.items.map((i) => i.type)), anchor = st.S.items[0] || { x: 300, z: 300 };
    const types = Object.keys(FURN).filter((t) => !used.has(t)).slice(0, 6), adds = [];
    for (const [k, type] of types.entries())
      adds.push({ type, ...(await stallProbe(B, () => ui.placeFurnAt(type, anchor.x + 40 * (k + 1), anchor.z))) });
    return { adds, ...stallSummary(B, adds) };
  })()`),

  wall_drag_plan: wallDrag("plan"),
  wall_drag_split: wallDrag("split"),
  door_drag_plan: wallDrag("plan", "door"),


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

// One user action, then the frames that carry its cost. actionMs is the action
// itself; renderCpuMs is three's JS time inside render() over the next two
// frames (node/shader building, encoding); gpuWaitMs is the wait for the GPU
// queue after them (driver pipeline compiles plus GPU work).
const STALL_HELPERS = `window.stallProbe = async function (B, action) {
  const v = await import("/js/view3d.js"), r = v.getRenderer();
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  const long = [], keep = (list) => list.forEach((e) => long.push(e.duration));
  const po = new PerformanceObserver((list) => keep(list.getEntries()));
  try { po.observe({ type: "longtask" }); } catch (_) {}
  await raf(); await B.gpuDone(r);
  // New GPU objects created for this action: a warm transition should create none.
  const device = r.backend && r.backend.device, made = { shaderModules: 0, pipelines: 0, asyncPipelines: 0 };
  const restore = [];
  if (device) for (const [name, key] of [["createShaderModule", "shaderModules"], ["createRenderPipeline", "pipelines"], ["createRenderPipelineAsync", "asyncPipelines"]]) {
    const real = device[name];
    device[name] = function () { made[key]++; return real.apply(this, arguments); };
    restore.push(() => { device[name] = real; });
  }
  const t0 = performance.now();
  await action();
  const actionMs = performance.now() - t0;
  B.cpu = 0; await raf(); await raf();
  const renderCpuMs = B.cpu, g0 = performance.now();
  await B.gpuDone(r);
  const gpuWaitMs = performance.now() - g0, totalMs = performance.now() - t0;
  await raf(); keep(po.takeRecords()); po.disconnect();
  restore.forEach((undo) => undo());
  const r1 = (x) => +x.toFixed(1);
  return { totalMs: r1(totalMs), actionMs: r1(actionMs), renderCpuMs: r1(renderCpuMs), gpuWaitMs: r1(gpuWaitMs), made,
    longTasks: long.length, longestTaskMs: long.length ? r1(Math.max(...long)) : 0 };
};
window.stallSummary = function (B, rows) {
  const sum = (k) => +rows.reduce((s, row) => s + row[k], 0).toFixed(1);
  return { worst: rows.reduce((a, b) => (b.totalMs > a.totalMs ? b : a), rows[0]), totalMs: B.stats(rows.map((row) => row.totalMs)),
    sums: { totalMs: sum("totalMs"), actionMs: sum("actionMs"), renderCpuMs: sum("renderCpuMs"), gpuWaitMs: sum("gpuWaitMs") } };
}; "ok"`;

// 30 pointer moves, one frame apart (interaction.js rAF-throttles planMove),
// under the CPU profiler. target "wall": the longest wall, grabbed at the spot
// farthest from its openings (a press on a door selects the door), dragged
// sideways. target "door": the first door, slid along its wall.
function wallDrag(mode, target = "wall") {
  return async (b) => {
    await b.evaluate(`(async () => {
      const st = await import("/js/state.js"), inter = await import("/js/interaction.js"), plan2d = await import("/js/plan2d.js");
      window.__setViewMode(${JSON.stringify(mode)}); st.S.workSet = "all"; st.S.workSetPinned = true; inter.setTool("select");
      await window.__bench.sleep(2500); plan2d.fitView();
      // tiled big plan: frame the first copy (where the probe's wall and door
      // are) at the zoom of a single apartment, so a 2 cm step is a real drag
      const copies = ${PLAN_COPIES}, own = st.S.nodes.slice(0, st.S.nodes.length / copies);
      if (copies > 1) plan2d.frameBounds({ minx: Math.min(...own.map((n) => n.x)), maxx: Math.max(...own.map((n) => n.x)),
        minz: Math.min(...own.map((n) => n.z)), maxz: Math.max(...own.map((n) => n.z)) });
      plan2d.render2D(); return "ok";
    })()`);
    return profileWhile(b, `(async () => {
      const B = window.__bench, S = (await import("/js/state.js")).S, plan2d = await import("/js/plan2d.js");
      const canvas = document.getElementById("plan");
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const ev = (type, x, z) => { const r = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: "mouse", button: 0,
        buttons: type === "pointerup" ? 0 : 1, clientX: r.left + plan2d.sx(x), clientY: r.top + plan2d.sz(z) })); };
      const len = (w) => Math.hypot(S.nodes[w.b].x - S.nodes[w.a].x, S.nodes[w.b].z - S.nodes[w.a].z);
      const openingsOn = (w) => (S.openings || []).filter((o) => o.wall === w.id);
      // clearance of position s (cm from node a) from every opening on the wall
      const clear = (w, s) => Math.min(Infinity, ...openingsOn(w).map((o) => Math.abs(s - o.s) - (o.width || 0) / 2));
      let wall, s, dir;
      if (${JSON.stringify(target)} === "door") {
        const door = (S.openings || []).find((o) => o.type === "door");
        wall = S.walls.find((w) => w.id === door.wall); s = door.s; dir = "along";
      } else {
        for (const w of S.walls.slice().sort((p, q) => len(q) - len(p))) {
          const L = len(w); let best = null;
          for (let t = 0.15; t <= 0.85; t += 0.05) if (!best || clear(w, t * L) > best.c) best = { s: t * L, c: clear(w, t * L) };
          if (best.c >= 40) { wall = w; s = best.s; break; }
        }
        dir = "across";
      }
      const A = S.nodes[wall.a], Z = S.nodes[wall.b], L = len(wall);
      const ux = (Z.x - A.x) / L, uz = (Z.z - A.z) / L, step = dir === "along" ? [ux, uz] : [-uz, ux];
      const px = A.x + ux * s, pz = A.z + uz * s;
      const before = JSON.stringify([S.nodes[wall.a], S.nodes[wall.b], openingsOn(wall).map((o) => o.s)]);
      const moves = 30, dt = [];
      // canvas readbacks wait for the whole GPU process; count who asks for one
      const readbacks = { count: 0, firstCaller: null }, realToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        readbacks.count++;
        if (!readbacks.firstCaller) {
          const limit = Error.stackTraceLimit; Error.stackTraceLimit = 40;
          readbacks.firstCaller = String(new Error().stack).split("\\n").slice(2, 30).map((l) => l.trim()).join(" < ");
          Error.stackTraceLimit = limit;
        }
        return realToDataURL.apply(this, arguments);
      };
      ev("pointerdown", px, pz);
      const grabbed = S.sel ? S.sel.kind : null;
      for (let i = 1; i <= moves; i++) {
        const t0 = performance.now(); ev("pointermove", px + step[0] * 2 * i, pz + step[1] * 2 * i); await frame(); dt.push(performance.now() - t0);
      }
      ev("pointerup", px + step[0] * 2 * moves, pz + step[1] * 2 * moves); await frame();
      HTMLCanvasElement.prototype.toDataURL = realToDataURL;
      const changed = JSON.stringify([S.nodes[wall.a], S.nodes[wall.b], openingsOn(wall).map((o) => o.s)]) !== before;
      // a hidden 3D pane may hold its rebuild during the gesture; it must land after
      await B.sleep(600);
      const rebuiltAfter = !S.dirty3D && !S.items3D.size;
      S.workSet = "furniture"; S.workSetPinned = false;
      return { mode: ${JSON.stringify(mode)}, target: ${JSON.stringify(target)}, grabbed, changed, rebuiltAfter, readbacks,
        walls: S.walls.length, moves, moveFrameMs: B.stats(dt) };
    })()`);
  };
}

function profiled(code) {
  return (b) => profileWhile(b, code);
}

// V8 CPU profile of the page while `code` runs, reduced to self time by file
// and by function (idle excluded).
async function profileWhile(b, code) {
  await b.cdp("Profiler.enable");
  await b.cdp("Profiler.setSamplingInterval", { interval: 250 });
  await b.cdp("Profiler.start");
  const res = await b.evaluate(code);
  const stop = await b.cdp("Profiler.stop");
  if (res && typeof res === "object" && stop.result?.profile) res.profile = summarizeProfile(stop.result.profile);
  return res;
}

function summarizeProfile(profile, top = 12) {
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0) / 1000));
  const byFile = new Map(), byFn = new Map();
  let busy = 0, idle = 0, gc = 0;
  for (const node of profile.nodes) {
    const ms = self.get(node.id) || 0;
    if (!ms) continue;
    const f = node.callFrame;
    if (f.functionName === "(idle)") { idle += ms; continue; }
    if (f.functionName === "(garbage collector)") gc += ms;
    busy += ms;
    const file = (f.url || "").replace(/^[a-z]+:\/\/[^/]+\//, "") || f.functionName;
    const fn = (f.functionName || "(anonymous)") + " " + file + ":" + (f.lineNumber + 1);
    byFile.set(file, (byFile.get(file) || 0) + ms);
    byFn.set(fn, (byFn.get(fn) || 0) + ms);
  }
  const topOf = (m) => [...m].sort((a, c) => c[1] - a[1]).slice(0, top).map(([k, v]) => [k, +v.toFixed(1)]);
  return { busyMs: +busy.toFixed(1), idleMs: +idle.toFixed(1), gcMs: +gc.toFixed(1), topFiles: topOf(byFile), topFunctions: topOf(byFn) };
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
    await b.evaluate(STALL_HELPERS);
    // The catalog-thumbnail warm-up renders every model in the background on
    // the main thread, and each first-seen material is a shader compile of up
    // to seconds. Let it finish (its duration is itself the cold-compile
    // number) so it does not land inside another scenario's frames.
    // A user's first 3D open in a fresh profile: the apartment is made in Plan view,
    // FIRST_OPEN_WAIT ms pass (the hidden pane prepares in the background), then 3D
    // is opened. Measured until "Preparing the 3D view" is down and the frame drawn.
    if (ONLY && ONLY.has("first_open")) out.firstOpen = await b.evaluate(`(async () => {
      const g = await import("/js/generator.js"), st = await import("/js/state.js"), { executeCommand } = await import("/js/commands/executor.js");
      const v = await import("/js/view3d.js");
      window.__setViewMode("plan");
      executeCommand(g.apartmentGenerateCommand, { size: "large", replace: true, replaceInfrastructure: true, infrastructure: false, seed: 3 }, { domain: "planner", state: st.S }, { history: false });
      await new Promise((r) => setTimeout(r, ${FIRST_OPEN_WAIT}));
      const long = [], po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(Math.round(e.duration))));
      po.observe({ type: "longtask" });
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const prepShown = () => { const p = document.getElementById("v3dPrep"); return !!p && p.style.display !== "none" && getComputedStyle(p).display !== "none"; };
      const t0 = performance.now();
      window.__setViewMode("3d");
      let r = null, calls0 = 0, sawPrep = false, rebuiltAt = null, firstRenderAt = null, wrapped = null;
      for (let i = 0; i < 3000; i++) {
        r = v.getRenderer();
        if (r && !wrapped) { wrapped = r; const real = r.render; r.render = function () { if (firstRenderAt == null) firstRenderAt = Math.round(performance.now() - t0); return real.apply(this, arguments); }; }
        if (rebuiltAt == null && !st.S.dirty3D) rebuiltAt = Math.round(performance.now() - t0);
        if (r && r.initialized && !calls0) calls0 = r.info.render.calls || 0;
        if (prepShown()) sawPrep = true;
        if (r && r.initialized && !st.S.dirty3D && !prepShown() && (r.info.render.calls || 0) > calls0) break;
        await raf();
      }
      if (r && r.backend && r.backend.device) await r.backend.device.queue.onSubmittedWorkDone();
      const ms = Math.round(performance.now() - t0);
      long.push(...po.takeRecords().map((e) => Math.round(e.duration))); po.disconnect();
      if (wrapped) delete wrapped.render;
      return { waitedMs: ${FIRST_OPEN_WAIT}, firstOpenMs: ms, rebuiltAt, firstRenderAt, sawPrepOverlay: sawPrep, longTasks: long.length, longestTaskMs: long.length ? Math.max(...long) : 0, totalLongMs: long.reduce((a, b) => a + b, 0) };
    })()`, 300000);
    if (out.firstOpen) console.log(`  ${backend} first 3D open`, JSON.stringify(out.firstOpen));
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
      const copies = ${PLAN_COPIES};
      if (copies > 1) {
        const S = st.S, { uid } = st, xs = S.nodes.map((n) => n.x), zs = S.nodes.map((n) => n.z);
        const w = Math.max(...xs) - Math.min(...xs) + 300, d = Math.max(...zs) - Math.min(...zs) + 300, cols = Math.ceil(Math.sqrt(copies));
        const base = { nodes: S.nodes.slice(), walls: S.walls.slice(), openings: S.openings.slice(), items: S.items.slice() };
        for (let c = 1; c < copies; c++) {
          const dx = (c % cols) * w, dz = Math.floor(c / cols) * d, off = S.nodes.length, wallId = new Map();
          base.nodes.forEach((n) => S.nodes.push({ ...structuredClone(n), x: n.x + dx, z: n.z + dz }));
          base.walls.forEach((wall) => { const id = uid(); wallId.set(wall.id, id); S.walls.push({ ...structuredClone(wall), id, a: wall.a + off, b: wall.b + off }); });
          base.openings.forEach((o) => S.openings.push({ ...structuredClone(o), id: uid(), wall: wallId.get(o.wall) }));
          base.items.forEach((it) => { if (it.supportId != null) return; S.items.push({ ...structuredClone(it), id: uid(), x: it.x + dx, z: it.z + dz }); });
        }
      }
      window.__setViewMode("3d"); st.S.dirty3D = true; await new Promise((res) => setTimeout(res, 4000));
      const v = await import("/js/view3d.js"); let meshes = 0; v.getMainScene().traverse((o) => { if (o.isMesh) meshes++; });
      return { ok: r.ok, copies, walls: st.S.walls.length, items: st.S.items.length, meshes, mainBackend: window.__bench.backend(v.getRenderer()) };
    })()`);
    for (const name of SCENARIOS) {
      if (ONLY ? !ONLY.has(name) : OPT_IN.has(name)) continue;
      const before = b.logs.length;
      const t0 = Date.now();
      const code = SCENARIO_CODE[name];
      out.scenarios[name] = typeof code === "function" ? await code(b) : await b.evaluate(code);
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
  const order = (round % 2 === 0 ? ["webgpu", "webgl2"] : ["webgl2", "webgpu"]).filter((b) => BACKENDS.includes(b));
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
