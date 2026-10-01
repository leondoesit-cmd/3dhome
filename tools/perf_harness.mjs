#!/usr/bin/env node
/* Performance measurement harness — MEASUREMENT ONLY, no optimisation.
 *
 *   node tools/perf_harness.mjs                    # full run -> perf-baseline.json + .md
 *   node tools/perf_harness.mjs --out my.json      # write somewhere else
 *   node tools/perf_harness.mjs --only=server,boot,paint,three
 *   node tools/perf_harness.mjs --repeats=3        # repeat the paint/3D probes
 *   node tools/perf_harness.mjs --moves=60         # pointermoves per scripted drag
 *
 * Four probes:
 *   (a) server   delivery of the heavy assets through server/relay.mjs, cold
 *                (fresh process, empty staticCache) and warm.
 *   (b) boot     request count / JS bytes / DOM size / time-to-interactive.
 *   (c) paint    model/HUD paint counts per scripted gesture.
 *   (d) three    idle FPS, draw calls/s and shadow passes/s in the 3D pane.
 *
 * IT MODIFIES NO SOURCE FILE. The paint/snap() counters for (c) are
 * injected by the harness's OWN static server as it serves js/plan2d.js and
 * js/history.js (see INSTRUMENT below), so the working tree is never touched
 * and nothing has to be reverted afterwards.
 *
 * Reuses tools/browser_harness.mjs for Chrome discovery and the CDP client;
 * it does NOT reuse openPage(), because this harness needs its own rewriting
 * server, the CDP Network domain, and — for (d) — a GPU-backed Chrome, which
 * openPage() deliberately disables.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { CDP, findChrome, waitForOpen, closeHarnessResources } from "./browser_harness.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/* ---- CLI ---------------------------------------------------------------- */
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.some((a) => a === "--" + name || a.startsWith("--" + name + "="));
const getArg = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith("--" + name + "="));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf("--" + name);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return dflt;
};
const arg = getArg;

const suiteArg = getArg("suite", null);
let defaultOnly = "server,boot,paint,three,modeler";
if (suiteArg === "modeler") defaultOnly = "modeler";
else if (suiteArg === "planner") defaultOnly = "server,boot,paint,three";
else if (suiteArg) defaultOnly = suiteArg;

const OUT = getArg("out", join(ROOT, "perf-baseline.json"));
const ONLY = new Set(String(getArg("only", defaultOnly)).split(",").map((s) => s.trim()));
const REPEATS = Math.max(1, parseInt(getArg("repeats", "1"), 10) || 1);
const BASELINE_CLEAN = hasFlag("baseline-clean");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gz": "application/gzip",
};

/* The assets deliverable (a) reports on. */
const DELIVERY_ASSETS = [
  "/index.html",
  "/vendor/three/three.webgpu.js",
  "/js/modeler.js",
  "/js/icon_theme_assets.js",
  "/js/i18n.js",
  "/js/view3d.js",
  "/css/styles.css",
];

/* Modules that are lazily imported by the game/extra modes. Anything matching
   these is reported separately and excluded from the boot totals. */
const GAME_RE = /\/(zombies[^/]*|drive[^/]*|rc_[^/]*|kart|track|race|lava[^/]*)\.js(\?|$)/;

/* ---- (0) instrumenting static server ------------------------------------ */
/* Counter injection. Each entry: file suffix -> [needle, insertion].
   The needle must appear EXACTLY once; the server throws if it does not, so a
   refactor that moves the function makes the harness fail loudly instead of
   silently reporting zero paints. */
const INSTRUMENT = [
  {
    /* THE paint counter. Since the canvas split, renderModel() is the only
       function that repaints the plan's document image — walls, rooms, items,
       MEP geometry — and it is what every paint target in the plan is about.
       The exported render2D() is NOT that: it only schedules a frame, so
       hooking it counts paint *requests*, and a request that lands on a HUD-only
       frame (or is coalesced away entirely) costs no model paint at all. */
    file: "/js/plan2d.js",
    needle: "function renderModel() {",
    inject:
      "function renderModel() { if (window.__perf) { window.__perf.model++; " +
      "window.__perf.mT0 = performance.now(); " +
      "if (window.__perfTrace) window.__perfTrace.push(new Error().stack); }",
  },
  {
    /* The overlay pass: selection chrome, guides, the drag proxy, and the three
       animation loops. Cheap per paint, but it is the only thing that should be
       running while a warning breathes, so it has to be counted separately or
       "0 model paints at idle" cannot be told apart from "nothing animating". */
    file: "/js/plan2d.js",
    needle: "function renderHUD() {",
    /* renderHUD() runs immediately after renderModel() in both painters
       (render2DNow and the scheduled frame), with nothing in between, so its
       entry timestamp is the model pass's end and closes the interval the
       renderModel hook opened. That is how the model half of a full paint is
       timed without wrapping either function's body. */
    inject:
      "function renderHUD() { if (window.__perf) { window.__perf.hud++; " +
      "if (window.__perf.mT0) { window.__perf.modelMs += performance.now() - window.__perf.mT0; " +
      "window.__perf.modelTimed++; window.__perf.mT0 = 0; } }",
  },
  {
    /* Requests, not paints. render2D() and requestRender2D() are the same
       coalescing entry under two names; both are counted into one number,
       because the interesting ratio is requests-asked vs. model-paints-served.
       Traced, since a paint's own stack always roots at the rAF callback and
       only the request says who wanted it. */
    file: "/js/plan2d.js",
    needle: "export function render2D() {",
    inject:
      "export function render2D() { if (window.__perf) { window.__perf.request2D++; " +
      "if (window.__perfTrace) window.__perfTrace.push(new Error().stack); }",
  },
  {
    file: "/js/plan2d.js",
    needle: "export function requestRender2D() {",
    inject:
      "export function requestRender2D() { if (window.__perf) { window.__perf.request2D++; " +
      "if (window.__perfTrace) window.__perfTrace.push(new Error().stack); }",
  },
  {
    file: "/js/plan2d.js",
    needle: "export function requestRenderHUD() {",
    inject: "export function requestRenderHUD() { if (window.__perf) window.__perf.requestHUD++;",
  },
  {
    file: "/js/history.js",
    needle: "function snap() {",
    inject: "function snap() { if (window.__perf) window.__perf.snap++;",
  },
  {
    file: "/js/modeler.js",
    needle: "function updatePreview() {",
    inject: "function updatePreview() { if (window.__perf) window.__perf.mdPreview++;",
  },
  {
    file: "/js/modeler.js",
    needle: "function buildPart(g, p, displayStyle) {",
    inject: "function buildPart(g, p, displayStyle) { if (window.__perf) window.__perf.mdBuildPart++;",
  },
  {
    file: "/js/core/mesh_projection.js",
    needle: "export function meshFeatureEdges(meshData, options = {}) {",
    inject: "export function meshFeatureEdges(meshData, options = {}) { if (window.__perf) window.__perf.mdEdgeScan++;",
  },
  {
    file: "/js/primitives.js",
    needle: "export function clearGroup(g) {",
    inject: "export function clearGroup(g) { if (window.__perf) window.__perf.mdDispose++;",
  },
  {
    file: "/js/modeler.js",
    needle: "function refreshAll(options = {}) {",
    inject: "function refreshAll(options = {}) { if (window.__perf) window.__perf.mdRefreshAll++;",
  },
  {
    file: "/js/core/parametric_rebuild.js",
    needle: "export function rebuildParametricDocument(source, overrides = {}, options = {}) {",
    inject: "export function rebuildParametricDocument(source, overrides = {}, options = {}) { if (window.__perf) window.__perf.mdRebuildDoc++;",
  },
  {
    file: "/js/core/schema.js",
    needle: "export function cloneDomain(value) {",
    inject: "export function cloneDomain(value) { if (window.__perf) window.__perf.mdClone++;",
  },
];

async function serveInstrumented() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(String(req.url).split("?")[0]);
    if (path.endsWith("/")) path += "index.html";
    const abs = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!abs.startsWith(ROOT)) return void res.writeHead(403).end("forbidden");
    try {
      let body = await readFile(abs);
      const patches = INSTRUMENT.filter((p) => path === p.file);
      if (patches.length) {
        let src = body.toString("utf8");
        for (const patch of patches) {
          const n = src.split(patch.needle).length - 1;
          if (n !== 1)
            throw new Error(
              `perf_harness: instrumentation anchor ${JSON.stringify(patch.needle)} ` +
                `appears ${n} times in ${patch.file} (expected 1). Update INSTRUMENT.`,
            );
          src = src.replace(patch.needle, patch.inject);
        }
        body = Buffer.from(src, "utf8");
      }
      res.writeHead(200, {
        "content-type": MIME[extname(abs).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch (err) {
      if (err && err.message && err.message.startsWith("perf_harness:")) {
        console.error(err.message);
        res.writeHead(500).end(err.message);
        return;
      }
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          server.closeAllConnections();
          reject(new Error("perf harness server did not close"));
        }, 5000);
        server.close((e) => { clearTimeout(timer); e ? reject(e) : resolve(); });
        server.closeAllConnections();
      }),
  };
}

/* ---- (0) the page object ------------------------------------------------ */

async function openPerfPage({ width = 1440, height = 900, gpu = true } = {}) {
  const bin = await findChrome();
  if (!bin) throw new Error("no Chrome found (set CHROME_PATH)");
  const app = await serveInstrumented();
  const profile = await mkdtemp(join(tmpdir(), "mf-perf-"));
  const flags = [
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=" + width + "," + height,
  ];
  if (gpu) {
    /* (d) needs a real GL/WebGPU context. New headless can reach the platform
       GPU; SwiftShader is the fallback and is flagged in the output, because a
       software rasteriser's FPS is NOT a hardware number. */
    flags.push("--enable-unsafe-swiftshader", "--enable-features=Vulkan,WebGPU");
  } else {
    flags.push("--disable-gpu");
  }
  flags.push("about:blank");

  const child = spawn(bin, flags, { stdio: ["ignore", "ignore", "pipe"] });
  let browser = null, pageWs = null, cdp = null, cleanupPromise = null;
  const cleanup = () =>
    (cleanupPromise ||= closeHarnessResources({ app, profile, child, browser, pageWs, cdp }));
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = "";
      const finish = (e, v) => {
        clearTimeout(timer);
        child.stderr.off("data", onData); child.off("exit", onExit); child.off("error", onErr);
        e ? reject(e) : resolve(v);
      };
      const timer = setTimeout(() => finish(new Error("chrome did not start")), 20000);
      const onData = (d) => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) finish(null, m[0]); };
      const onExit = (c) => finish(new Error("chrome exited early: " + c));
      const onErr = (e) => finish(new Error("chrome failed to start: " + e.message));
      child.stderr.on("data", onData); child.once("exit", onExit); child.once("error", onErr);
    });
    child.stderr.resume();

    browser = new CDP(new WebSocket(wsUrl));
    await waitForOpen(browser.ws, "browser devtools socket");
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    pageWs = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
    cdp = new CDP(pageWs);
    await waitForOpen(pageWs, "page devtools socket");
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false,
    });

    /* Network accounting for (b). requestWillBeSent gives the URL,
       loadingFinished gives the bytes actually on the wire (encodedDataLength,
       headers included); responseReceived carries the decoded body length. */
    const requests = new Map();
    pageWs.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.method === "Network.requestWillBeSent")
        requests.set(m.params.requestId, {
          url: m.params.request.url, type: m.params.type, transferred: 0, decoded: 0, mime: "",
          start: m.params.timestamp,
        });
      else if (m.method === "Network.responseReceived") {
        const r = requests.get(m.params.requestId);
        if (r) { r.mime = m.params.response.mimeType || ""; r.type = m.params.type || r.type; }
      } else if (m.method === "Network.loadingFinished") {
        const r = requests.get(m.params.requestId);
        if (r) { r.transferred = m.params.encodedDataLength || 0; r.done = true; }
      }
    });

    const page = {
      origin: app.origin,
      requests,
      consoleErrors: cdp.consoleErrors,
      cdp,
      async eval(fn, ...args) {
        const expr = "(" + fn.toString() + ")(" + args.map((a) => JSON.stringify(a)).join(",") + ")";
        const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
          expression: expr, awaitPromise: true, returnByValue: true,
        });
        if (exceptionDetails)
          throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
      },
      async goto(path = "/") {
        await cdp.send("Page.navigate", { url: app.origin + path });
        await new Promise((r) => {
          const timer = setTimeout(() => { pageWs.off("message", l); r(); }, 30000);
          const l = (raw) => {
            if (JSON.parse(raw).method === "Page.loadEventFired") {
              clearTimeout(timer); pageWs.off("message", l); r();
            }
          };
          pageWs.on("message", l);
        });
        await page.waitForBoot();
      },
      async waitForBoot(ms = 60000) {
        const deadline = Date.now() + ms;
        for (;;) {
          if (await page.eval(() => !!window.__home3dBooted)) break;
          if (Date.now() > deadline) throw new Error("app did not boot within " + ms + "ms");
          await new Promise((r) => setTimeout(r, 50));
        }
        await page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      },
      close: cleanup,
    };
    return page;
  } catch (e) {
    try { await cleanup(); } catch {}
    throw e;
  }
}

/* ---- (a) SERVER DELIVERY ------------------------------------------------ */

async function probeServer() {
  const port = 8000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [join(ROOT, "server/relay.mjs"), String(port)], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = "http://127.0.0.1:" + port;
  try {
    // wait for listen
    const t0 = Date.now();
    for (;;) {
      try {
        const r = await fetch(origin + "/api/ping");
        if (r.ok) { await r.text(); break; }
      } catch {}
      if (Date.now() - t0 > 15000) throw new Error("relay did not start on " + port);
      await new Promise((r) => setTimeout(r, 100));
    }

    /* node:http, not fetch(): undici transparently decompresses a br/gzip body,
       which would make `transferredBytes` the decoded size and hide the whole
       point of the measurement. The raw client counts what was on the wire. */
    const { request } = await import("node:http");
    const { stat } = await import("node:fs/promises");
    function timed(path) {
      return new Promise((resolve, reject) => {
        const started = process.hrtime.bigint();
        const req = request(
          origin + path,
          { headers: { "accept-encoding": "br, gzip", "cache-control": "no-cache" } },
          (res) => {
            let ttfb = null, bytes = 0;
            res.on("data", (c) => {
              if (ttfb === null) ttfb = Number(process.hrtime.bigint() - started) / 1e6;
              bytes += c.length;
            });
            res.on("end", async () => {
              const total = Number(process.hrtime.bigint() - started) / 1e6;
              resolve({
                path,
                status: res.statusCode,
                encoding: res.headers["content-encoding"] || "identity",
                ttfbMs: +(ttfb ?? total).toFixed(1),
                totalMs: +total.toFixed(1),
                transferredBytes: bytes,
                uncompressedBytes: await stat(join(ROOT, path.replace(/^\//, "")))
                  .then((s) => s.size).catch(() => null),
              });
            });
            res.on("error", reject);
          },
        );
        req.on("error", reject);
        req.end();
      });
    }

    const cold = [];
    for (const p of DELIVERY_ASSETS) cold.push(await timed(p));
    const warm = [];
    for (const p of DELIVERY_ASSETS) warm.push(await timed(p));
    for (const row of [...cold, ...warm]) row.uncompressedBytes = await row.uncompressedBytes;
    return {
      note:
        "cold = first request after a fresh `node server/relay.mjs` (empty staticCache); " +
        "cachedStatic() compresses the file on that first request (brotli quality 5, off-thread). " +
        "warm = second request, served from the in-process cache. " +
        "TTFB is measured from before fetch() to the first body chunk.",
      cold, warm,
      coldTotalMs: +cold.reduce((a, r) => a + r.totalMs, 0).toFixed(1),
      warmTotalMs: +warm.reduce((a, r) => a + r.totalMs, 0).toFixed(1),
    };
  } finally {
    try { child.kill("SIGKILL"); } catch {}
    for (const s of [child.stdout, child.stderr]) { try { s?.destroy(); } catch {} }
  }
}

/* ---- (b) BOOT COST ------------------------------------------------------ */

async function probeBoot() {
  const page = await openPerfPage({ gpu: false });
  try {
    page.requests.clear();
    const t0 = Date.now();
    await page.goto("/");
    const tti = Date.now() - t0;
    // let any late idle-time work settle
    await page.eval(() => new Promise((r) => setTimeout(r, 3000)));

    const reqs = [...page.requests.values()].filter((r) => r.url.startsWith("http"));
    const decoded = await page.eval(() =>
      performance.getEntriesByType("resource").map((e) => ({
        url: e.name, decoded: e.decodedBodySize, transfer: e.transferSize, kind: e.initiatorType,
      })),
    );
    const decodedBy = new Map(decoded.map((d) => [d.url, d]));

    const rows = reqs.map((r) => {
      const d = decodedBy.get(r.url) || {};
      const p = new URL(r.url).pathname;
      return {
        path: p,
        js: /\.m?js$/.test(p.split("?")[0]),
        game: GAME_RE.test(p),
        transferred: r.transferred || d.transfer || 0,
        decoded: d.decoded || 0,
      };
    });
    const app = rows.filter((r) => !r.game);
    const js = app.filter((r) => r.js);
    const dom = await page.eval(() => ({
      elements: document.getElementsByTagName("*").length,
      buttons: document.querySelectorAll("button").length,
      inputs: document.querySelectorAll("input,select,textarea").length,
      canvases: document.querySelectorAll("canvas").length,
      svgs: document.querySelectorAll("svg").length,
      listeners: null,
      nav: (() => {
        const n = performance.getEntriesByType("navigation")[0];
        return n ? {
          domContentLoadedMs: +n.domContentLoadedEventEnd.toFixed(1),
          loadEventMs: +n.loadEventEnd.toFixed(1),
          responseEndMs: +n.responseEnd.toFixed(1),
        } : null;
      })(),
      bootMarkMs: +performance.now().toFixed(1),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    }));
    const top = js.slice().sort((a, b) => b.decoded - a.decoded).slice(0, 15)
      .map((r) => ({ path: r.path, decoded: r.decoded, transferred: r.transferred }));

    return {
      note:
        "Served by the harness's own no-store static server (no brotli, no cache), so " +
        "`transferred` here is close to raw size and is NOT the relay's number — use (a) " +
        "for delivery. Game modules (zombies/drive/rc/kart/track/race/lava) are lazily " +
        "imported and did not load; they are excluded from every total below.",
      requestsTotal: rows.length,
      requestsExcludingGame: app.length,
      gameModulesLoaded: rows.filter((r) => r.game).length,
      jsRequests: js.length,
      jsDecodedBytes: js.reduce((a, r) => a + r.decoded, 0),
      jsTransferredBytes: js.reduce((a, r) => a + r.transferred, 0),
      allDecodedBytes: app.reduce((a, r) => a + r.decoded, 0),
      allTransferredBytes: app.reduce((a, r) => a + r.transferred, 0),
      timeToInteractiveMs: tti,
      dom,
      largestJs: top,
    };
  } finally {
    await page.close();
  }
}

/* ---- shared: build a known scene inside the page ------------------------ */

const installScenario = async (page) => {
  await page.eval(() => {
    const s = document.getElementById("start-screen");
    if (s) s.hidden = true;
  });
  await page.eval(async () => {
    const [state, inter, plan2d, geom, engine, cons, ui, view3d] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"), import("/js/plan2d.js"),
      import("/js/geometry.js"), import("/js/constraint_engine.js"),
      import("/js/wall_constraints.js"), import("/js/ui.js"), import("/js/view3d.js"),
    ]);
    const S = state.S;
    const canvas = document.getElementById("plan");
    window.__perf = window.__perf ||
      { model: 0, hud: 0, request2D: 0, requestHUD: 0, snap: 0, modelMs: 0, modelTimed: 0, mT0: 0,
        mdPreview: 0, mdBuildPart: 0, mdEdgeScan: 0, mdDispose: 0, mdRefreshAll: 0, mdRebuildDoc: 0, mdClone: 0 };
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    function ev(type, x, z, opts) {
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent(type, Object.assign({
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: "mouse",
        button: 0, buttons: type === "pointerup" ? 0 : 1,
        clientX: r.left + plan2d.sx(x), clientY: r.top + plan2d.sz(z),
      }, opts || {})));
    }
    window.__perfKit = {
      S, inter, plan2d, geom, engine, cons, ui, view3d, canvas, ev, frame,
      reset() {
        var P = window.__perf;
        P.model = 0; P.hud = 0; P.request2D = 0; P.requestHUD = 0; P.snap = 0;
        P.modelMs = 0; P.modelTimed = 0; P.mT0 = 0;
        P.mdPreview = 0; P.mdBuildPart = 0; P.mdEdgeScan = 0; P.mdDispose = 0;
        P.mdRefreshAll = 0; P.mdRebuildDoc = 0; P.mdClone = 0;
      },
      room() {
        S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
        S.walls = [1, 2, 3, 4].map((id, i) => ({
          id, a: i, b: (i + 1) % 4, thickness: 10, height: 270,
        }));
        S.openings = []; S.items = []; S.wallCons = []; S.roomCons = [];
        S.roomMeta = {}; S.markers = []; S.sel = null;
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
        inter.setTool("select");
        plan2d.fitView(); plan2d.render2D();
      },
    };
  });
};

/* ---- (c) 2D PAINT COUNT ------------------------------------------------- */

/* Every gesture dispatches the same number of pointermove events, one animation
   frame apart, because interaction.js throttles planMove with rAF: a
   synchronous burst collapses into one frame and no drag happens at all. */
const MOVES = Math.max(2, parseInt(arg("moves", "20"), 10) || 20);

async function probePaint() {
  const page = await openPerfPage({ gpu: false });
  try {
    await page.goto("/");
    await installScenario(page);
    const out = await page.eval(async (moves) => {
      const q = window.__perfKit, S = q.S, P = window.__perf;
      const results = {};
      const lerp = (a, b, t) => a + (b - a) * t;

      async function gesture(name, fn) {
        q.room();
        await q.frame();
        q.reset();
        q.after = null;
        const t0 = performance.now();
        await fn();
        await q.frame();
        /* Did the gesture actually do what it says? A drag that is refused
           still dispatches every event and still reports a plausible
           paints/move, so the row has to carry proof of the edit: movedBy is
           the displacement of the thing the gesture claims to have dragged,
           and a 0 there means the number above it is measuring a hover. */
        results[name] = {
          modelPaints: P.model,
          hudPaints: P.hud,
          paintRequests: P.request2D,
          hudRequests: P.requestHUD,
          historySnapshots: P.snap,
          pointermoveEvents: moves,
          modelPaintsPerMove: +(P.model / moves).toFixed(2),
          wallMs: +(performance.now() - t0).toFixed(1),
          ...(q.after ? q.after() : {}),
        };
      }

      /* 1. drag an existing wall (grab the south wall's midpoint, slide it down).
         The work set MUST be pinned to one that ranks structure 0. Under the
         default "furniture" work set canDrag() refuses a wall outright, the
         pointerdown falls into the blocked-drag path, and the 20 moves that
         follow are the idle hover path — which still reports a plausible
         paints/move number, so the row silently stops measuring a wall drag.
         "all" is used rather than "structure" so the scene is otherwise
         identical to the other gestures (nothing else ghosted or deranked). */
      await gesture("dragWall", async () => {
        S.workSet = "all";
        S.workSetPinned = true;
        q.inter.setTool("select");
        const z0 = S.nodes[2].z;
        q.after = () => ({ movedBy: +(S.nodes[2].z - z0).toFixed(1) });
        q.ev("pointerdown", 300, 400);
        for (let i = 1; i <= moves; i++) {
          q.ev("pointermove", 300, lerp(400, 460, i / moves));
          await q.frame();
        }
        q.ev("pointerup", 300, 460);
        await q.frame();
      });

      // 2. drag a furniture item across the room
      await gesture("dragItem", async () => {
        S.workSet = "furniture";
        S.workSetPinned = false;
        q.inter.setTool("select");
        q.ui.placeFurnAt("sofa", 200, 200);
        await q.frame();
        const x0 = S.items[0].x;
        q.after = () => ({ movedBy: +(S.items[0].x - x0).toFixed(1) });
        q.reset();
        q.ev("pointerdown", 200, 200);
        for (let i = 1; i <= moves; i++) {
          q.ev("pointermove", lerp(200, 420, i / moves), lerp(200, 300, i / moves));
          await q.frame();
        }
        q.ev("pointerup", 420, 300);
        await q.frame();
      });

      // 3. draw a new wall across the room
      await gesture("drawWall", async () => {
        q.inter.setTool("wall");
        q.ev("pointerdown", 100, 100); q.ev("pointerup", 100, 100);
        for (let i = 1; i <= moves; i++) {
          q.ev("pointermove", lerp(100, 500, i / moves), lerp(100, 320, i / moves), { buttons: 0 });
          await q.frame();
        }
        q.ev("pointerdown", 500, 320); q.ev("pointerup", 500, 320);
        q.inter.finishDraw();
        await q.frame();
        q.inter.setTool("select");
      });

      // 4. pan the plan (middle-button drag — the CAD navigation path)
      await gesture("panPlan", async () => {
        q.inter.setTool("select");
        q.ev("pointerdown", 300, 200, { button: 1, buttons: 4 });
        for (let i = 1; i <= moves; i++) {
          q.ev("pointermove", lerp(300, 420, i / moves), lerp(200, 260, i / moves), { button: 1, buttons: 4 });
          await q.frame();
        }
        q.ev("pointerup", 420, 260, { button: 1, buttons: 0 });
        await q.frame();
      });

      /* What one paint actually costs. The gesture rows above cannot answer
         this: their wall-clock is dominated by the one-animation-frame gap
         between synthetic pointermoves, which floors any 20-move gesture near
         MOVES x 16 ms regardless of paint work. So time the painter directly,
         synchronously, with no rAF in the loop — render2DNow() is model + HUD
         back to back, which is exactly what the old monolithic render2D() did.
         Measured on the 4-wall room and again on a 4x4 = 16-room grid, because
         the model pass scales with the plan and the HUD pass does not. */
      async function paintCost(name, build) {
        build();
        await q.frame();
        q.plan2d.render2DNow(); // warm: first paint pays for font/style caches
        q.reset();
        const runs = 60;
        const t0 = performance.now();
        for (let i = 0; i < runs; i++) q.plan2d.render2DNow();
        const full = (performance.now() - t0) / runs;
        const model = P.modelTimed ? P.modelMs / P.modelTimed : null;
        results[name] = {
          walls: S.walls.length,
          items: S.items.length,
          fullPaintMs: +full.toFixed(3),
          modelPaintMs: model == null ? null : +model.toFixed(3),
          hudPaintMs: model == null ? null : +(full - model).toFixed(3),
          paints: P.model,
        };
      }
      await paintCost("paintCostSmall", () => q.room());
      await paintCost("paintCostBig16Rooms", () => {
        q.room();
        S.nodes = []; S.walls = [];
        const idx = (i, j) => i * 5 + j;
        for (let i = 0; i < 5; i++)
          for (let j = 0; j < 5; j++) S.nodes.push({ x: j * 400, z: i * 300 });
        let id = 1;
        for (let i = 0; i < 5; i++)
          for (let j = 0; j < 4; j++)
            S.walls.push({ id: id++, a: idx(i, j), b: idx(i, j + 1), thickness: 10, height: 270 });
        for (let j = 0; j < 5; j++)
          for (let i = 0; i < 4; i++)
            S.walls.push({ id: id++, a: idx(i, j), b: idx(i + 1, j), thickness: 10, height: 270 });
        q.cons.ensureNodeIds();
        q.plan2d.fitView();
      });

      /* An idle measurement: sit still for 3 s and report what painted anyway.
         A non-zero MODEL number is a self-sustaining full repaint of the plan
         document with no input at all, so the stacks of whatever asked for it
         are captured alongside. */
      async function idle(name, setup) {
        q.room();
        if (setup) setup();
        await q.frame();
        await new Promise((r) => setTimeout(r, 500)); // let the last gesture settle
        q.reset();
        window.__perfTrace = [];
        await new Promise((r) => setTimeout(r, 3000));
        const traces = window.__perfTrace.map((s) =>
          String(s).split("\n").slice(1, 5).map((l) => l.trim()).join(" <- "));
        window.__perfTrace = null;
        const byStack = {};
        for (const t of traces) byStack[t] = (byStack[t] || 0) + 1;
        results[name] = {
          modelPaints: P.model,
          hudPaints: P.hud,
          paintRequests: P.request2D,
          hudRequests: P.requestHUD,
          historySnapshots: P.snap,
          callers: Object.entries(byStack)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([stack, n]) => ({ n, stack })),
        };
      }

      // 5. control: pure idle, nothing touched, nothing to animate.
      await idle("idle3000ms", null);

      /* 6. idle with an unresolved constraint warning on screen. This is the
         case the canvas split exists for and the control above cannot see: the
         three self-cancelling animation loops (MEP flow, warning glow, angle
         guide) only run when there is something live to animate, so a clean
         scene reports 0 no matter how expensive a breathing warning would be.
         A fifth node with a single wall arm is an "openEnd" warning
         (js/constraint_engine.js jointWarnings), which makes warnShouldAnimate()
         true and drives the glow at ~22 Hz for as long as it goes unresolved.
         Before the split each of those frames was a full plan repaint; the
         model column here should now read 0. */
      await idle("idleWarning3000ms", () => {
        S.nodes.push({ x: 300, z: 200 });
        S.walls.push({ id: 5, a: 0, b: S.nodes.length - 1, thickness: 10, height: 270 });
        q.cons.ensureNodeIds();
        q.plan2d.render2DNow();
      });
      results.idleWarning3000ms.activeWarnings = q.engine.activeWarnings().length;

      return { results, sceneSize: { walls: S.walls.length, items: S.items.length } };
    }, MOVES);
    return {
      note:
        "Paints counted by injected counters (see INSTRUMENT in this file — no source file " +
        "is modified). `modelPaints` is renderModel(), the plan document image; `hudPaints` " +
        "is renderHUD(), the overlay; `paintRequests` is render2D()+requestRender2D(), which " +
        "only schedule a frame. Each drag gesture dispatches " + MOVES + " pointermove " +
        "events, one animation frame apart, because interaction.js rAF-throttles planMove — " +
        "so a gesture's wall-clock has a hard floor of MOVES frames (~333 ms at 60 Hz) that " +
        "no amount of paint work can go under; read paints, not wallMs, for paint cost. " +
        "`dragWall` pins S.workSet to \"all\": under the default \"furniture\" work set a wall " +
        "is rank 1 and canDrag() refuses, so the gesture would measure a hover. " +
        "`historySnapshots` counts history.js snap() calls (the expensive JSON.stringify).",
      movesPerGesture: MOVES,
      ...out,
    };
  } finally {
    await page.close();
  }
}

/* ---- (d) 3D IDLE COST --------------------------------------------------- */

async function probeThree() {
  const page = await openPerfPage({ gpu: true });
  try {
    await page.goto("/");
    await installScenario(page);
    const out = await page.eval(async () => {
      const q = window.__perfKit;
      const v = q.view3d;
      q.room();
      // open the 3D pane
      if (window.__setViewMode) window.__setViewMode("3d");
      await new Promise((r) => setTimeout(r, 500));
      v.ensureBuilt && v.ensureBuilt();
      v.rebuild3D && v.rebuild3D();
      await new Promise((r) => setTimeout(r, 3000));

      const renderer = v.getRenderer && v.getRenderer();
      if (!renderer) return { error: "no renderer: getRenderer() returned nothing" };
      if (!renderer.initialized)
        return { error: "renderer backend never initialised (no WebGPU/WebGL2 context)" };

      const backend = (() => {
        try {
          return renderer.backend && renderer.backend.isWebGPUBackend ? "webgpu"
            : renderer.backend && renderer.backend.isWebGLBackend ? "webgl2"
            : renderer.isWebGPURenderer ? "webgpu(unknown backend)" : "unknown";
        } catch { return "unknown"; }
      })();

      /* Direct render counter. renderer.info.render.calls is cumulative, but
         the post-processing path may route through node-graph internals, so
         wrap the public entry points as well and take whichever is larger. */
      if (!renderer.__perfWrappedRender) {
        renderer.__perfRenders = 0;
        const orig = renderer.render.bind(renderer);
        renderer.render = function (...a) { renderer.__perfRenders++; return orig(...a); };
        renderer.__perfWrappedRender = true;
      }

      const readCalls = () => {
        const i = renderer.info || {};
        const r = i.render || {};
        return {
          calls: r.calls || 0,
          drawCalls: r.drawCalls || 0,
          frameCalls: r.frameCalls || 0,
          triangles: r.triangles || 0,
          wrapped: renderer.__perfRenders || 0,
        };
      };

      /* Shadow passes: renderer.shadowMap.needsUpdate is set by the animation
         loop when something dirty needs re-shadowing, then cleared by the
         renderer as it does the pass. Sampling the FLAG would miss passes, so
         wrap the property and count every assignment of `true`. */
      function armShadowCounter() {
        const sm = renderer.shadowMap;
        if (sm.__perfWrapped) { sm.__perfCount = 0; return; }
        let v2 = sm.needsUpdate;
        sm.__perfCount = 0;
        try {
          Object.defineProperty(sm, "needsUpdate", {
            configurable: true,
            get() { return v2; },
            set(nv) { if (nv && !v2) sm.__perfCount++; v2 = nv; },
          });
          sm.__perfWrapped = true;
        } catch { sm.__perfWrapped = "failed"; }
      }
      armShadowCounter();

      async function sample(ms, label) {
        // let the scene quiesce, then measure with nothing happening at all
        await new Promise((r) => setTimeout(r, 800));
        const before = readCalls();
        renderer.shadowMap.__perfCount = 0;
        let frames = 0;
        let stop = false;
        const tick = () => { if (!stop) { frames++; requestAnimationFrame(tick); } };
        requestAnimationFrame(tick);
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, ms));
        stop = true;
        const dt = (performance.now() - t0) / 1000;
        const after = readCalls();
        const rendered = Math.max(after.calls - before.calls, after.wrapped - before.wrapped);
        return {
          label,
          seconds: +dt.toFixed(2),
          rafFps: +(frames / dt).toFixed(1),
          /* Frames the app actually PAINTED. The rAF loop runs at the display
             rate regardless; view3d.js only calls renderScene() when
             needsRender / live / settle says the image changed. */
          renderedFramesPerSecond: +(rendered / dt).toFixed(2),
          renderedFramesTotal: rendered,
          drawCallsPerFrame: after.drawCalls,
          trianglesPerFrame: after.triangles,
          shadowPassesPerSecond: +(renderer.shadowMap.__perfCount / dt).toFixed(2),
          shadowPassesTotal: renderer.shadowMap.__perfCount,
          raw: { before, after },
        };
      }

      /* rafFps is the browser's frame budget, not the app's paint rate: the
         animation loop skips renderScene() when nothing is dirty. drawCalls/s
         is the number that says whether the idle scene is actually painting. */
      const noPeople = await sample(4000, "idle, no animated people");

      /* "Animated people" are ordinary furniture items whose build() calls
         HumanFactory.buildMesh (js/furniture_extra.js: man/woman/boy/...).
         updateHumans() animates every dyn child flagged isHuman and returns
         true while any exists, which pins `live` on in the animation loop —
         so the scene never reaches the idle gate. */
      const PEOPLE = ["man", "woman", "boy", "girl", "oldman", "oldwoman"];
      let peopleOn = 0;
      try {
        PEOPLE.forEach((type, i) => {
          q.ui.placeFurnAt(type, 80 + i * 80, 120 + (i % 2) * 120);
          peopleOn++;
        });
        q.S.dirty3D = true;
        v.rebuild3D && v.rebuild3D();
      } catch (e) { peopleOn = 0; }
      await new Promise((r) => setTimeout(r, 2500));
      const humansInScene = (() => {
        try {
          let n = 0;
          const dyn = v.getDynGroup && v.getDynGroup();
          dyn && dyn.traverse((o) => { if (o.userData && o.userData.isHuman) n++; });
          return n;
        } catch { return null; }
      })();
      const withPeople = peopleOn ? await sample(4000, "idle, animated people on") : null;

      return {
        backend,
        canvasSize: (() => {
          const c = renderer.domElement;
          return c ? { w: c.width, h: c.height } : null;
        })(),
        shadowCounterWrapped: renderer.shadowMap.__perfWrapped,
        peopleItemsPlaced: peopleOn,
        humanMeshesInScene: humansInScene,
        /* updateHumans() (js/view3d.js:3872) only looks at dyn's DIRECT
           children, so this is the count that actually keeps the loop live. */
        humansAsDirectDynChildren: (() => {
          try {
            const dyn = v.getDynGroup && v.getDynGroup();
            return dyn ? dyn.children.filter((c) => c.userData && c.userData.isHuman).length : null;
          } catch { return null; }
        })(),
        dynChildren: (() => {
          try { const d = v.getDynGroup && v.getDynGroup(); return d ? d.children.length : null; }
          catch { return null; }
        })(),
        sceneObjects: (() => {
          try { let n = 0; v.getMainScene().traverse(() => n++); return n; } catch { return null; }
        })(),
        samples: [noPeople, withPeople].filter(Boolean),
      };
    });
    return {
      note:
        "Headless Chrome; if `backend` is not \"webgpu\" the numbers came through a " +
        "software rasteriser and are relative-only. rafFps is the requestAnimationFrame " +
        "rate (a display/browser ceiling, ~60 or ~120) and says nothing about app cost — " +
        "view3d.js's loop runs every frame but only calls renderScene() when " +
        "needsRender/live/settle says the image changed. `renderedFramesPerSecond` is the " +
        "real idle cost: it counts renderer.info.render.calls (cumulative) and a wrapper " +
        "on renderer.render(), whichever moved more. Shadow passes are counted by " +
        "intercepting assignments of renderer.shadowMap.needsUpdate = true, because " +
        "polling the flag would miss passes the renderer clears in the same frame.",
      ...out,
    };
  } finally {
    await page.close();
  }
}

/* ---- (e) MODEL EDITOR PROBE --------------------------------------------- */

async function probeModeler() {
  const page = await openPerfPage({ width: 1440, height: 900, gpu: true });
  try {
    await page.goto("/");
    await page.eval(() => {
      const s = document.getElementById("start-screen");
      if (s) s.hidden = true;
    });

    const out = await page.eval(async (moves) => {
      const { openModeler, closeModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
      /* The legacy fixture is deliberately NOT parametric-v1, so
         isCanonicalAuthoring() is false and refreshAll() never reaches
         rebuildParametricDocument — which is why every rebuildDoc/cloneDomain
         row below used to read 0 and the parametric work went unmeasured. */
      const canonicalFixture = await (await fetch("/tests/fixtures/canonical_parametric.json")).json();

      const P = (window.__perf = window.__perf || {
        model: 0, hud: 0, request2D: 0, requestHUD: 0, snap: 0,
        mdPreview: 0, mdBuildPart: 0, mdEdgeScan: 0, mdDispose: 0,
        mdRefreshAll: 0, mdRebuildDoc: 0, mdClone: 0,
      });

      const resetPerf = () => {
        P.mdPreview = 0; P.mdBuildPart = 0; P.mdEdgeScan = 0;
        P.mdDispose = 0; P.mdRefreshAll = 0; P.mdRebuildDoc = 0; P.mdClone = 0;
      };

      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const settle = (ms) => new Promise((r) => setTimeout(r, ms));

      // Open model editor with the fixture
      openModeler(null, fixture, null);
      await settle(400);

      // Dismiss welcome modal if open
      const welcome = document.getElementById("mdWelcome");
      if (welcome) {
        const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
        if (c) c.click();
      }
      await frame();

      const results = {};

      async function gesture(name, fn, gestureMoves = moves) {
        await frame();
        resetPerf();
        const t0 = performance.now();
        await fn();
        await frame();
        results[name] = {
          mdPreview: P.mdPreview,
          mdBuildPart: P.mdBuildPart,
          mdEdgeScan: P.mdEdgeScan,
          mdDispose: P.mdDispose,
          mdRefreshAll: P.mdRefreshAll,
          mdRebuildDoc: P.mdRebuildDoc,
          mdClone: P.mdClone,
          pointermoveEvents: gestureMoves,
          wallMs: +(performance.now() - t0).toFixed(1),
        };
      }

      const canvas3d = document.getElementById("mdPrev");
      const canvas2d = document.getElementById("mdCanvas");
      const root = document.getElementById("modeler");

      // 1. hoverModel — pointermove across the body in 3D mode, no buttons (20 moves)
      const mode3dBtn = root.querySelector('[data-mode="3d"]');
      if (mode3dBtn) mode3dBtn.click();
      await frame();

      await gesture("hoverModel", async () => {
        const r = canvas3d.getBoundingClientRect();
        for (let i = 1; i <= moves; i++) {
          const x = r.left + r.width * (0.3 + 0.4 * (i / moves));
          const y = r.top + r.height * 0.5;
          canvas3d.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
            clientX: x, clientY: y, buttons: 0,
          }));
          await frame();
        }
      });

      // 2. selectFace — single click on a face in 3D mode
      await gesture("selectFace", async () => {
        const r = canvas3d.getBoundingClientRect();
        const x = r.left + r.width * 0.5;
        const y = r.top + r.height * 0.5;
        canvas3d.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: x, clientY: y, button: 0, buttons: 1,
        }));
        await frame();
        canvas3d.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: x, clientY: y, button: 0, buttons: 0,
        }));
        await frame();
      }, 0);

      // Switch to 2D mode for 2D sketch/body gestures
      const mode2dBtn = root.querySelector('[data-mode="2d"]');
      if (mode2dBtn) mode2dBtn.click();
      await frame();

      // 3. dragSketchPoint — pointerdown on a sketch point, 20 moves, pointerup
      await gesture("dragSketchPoint", async () => {
        const r = canvas2d.getBoundingClientRect();
        const startX = r.left + r.width * 0.4;
        const startY = r.top + r.height * 0.4;
        canvas2d.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: startX, clientY: startY, button: 0, buttons: 1,
        }));
        await frame();
        for (let i = 1; i <= moves; i++) {
          const x = startX + (i / moves) * 50;
          const y = startY + (i / moves) * 50;
          canvas2d.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
            clientX: x, clientY: y, buttons: 1,
          }));
          await frame();
        }
        canvas2d.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: startX + 50, clientY: startY + 50, button: 0, buttons: 0,
        }));
        await frame();
      });

      // 4. dragBody — 2D `move` drag of a part
      await gesture("dragBody", async () => {
        const r = canvas2d.getBoundingClientRect();
        const startX = r.left + r.width * 0.5;
        const startY = r.top + r.height * 0.5;
        canvas2d.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: startX, clientY: startY, button: 0, buttons: 1,
        }));
        await frame();
        for (let i = 1; i <= moves; i++) {
          const x = startX + (i / moves) * 40;
          const y = startY + (i / moves) * 40;
          canvas2d.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
            clientX: x, clientY: y, buttons: 1,
          }));
          await frame();
        }
        canvas2d.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: startX + 40, clientY: startY + 40, button: 0, buttons: 0,
        }));
        await frame();
      });

      // 5. openEditor — cold openModeler() on reference document
      closeModeler();
      await settle(100);
      await gesture("openEditor", async () => {
        openModeler(null, fixture, null);
        await settle(200);
      }, 0);

      // 6. openCanonical — the same, on a parametric-v1 document. This is the
      //    only row that exercises rebuildParametricDocument, so it is the one
      //    that can see the T10 clone work and the T11 double-rebuild fix.
      closeModeler();
      await settle(100);
      await gesture("openCanonical", async () => {
        openModeler(null, JSON.parse(JSON.stringify(canonicalFixture)), null);
        await settle(200);
      }, 0);

      // 7. selectCanonical — a selection click inside a canonical document.
      //    refreshAll() runs the parametric rebuild here; T9 is about making
      //    that stop happening for a pure selection change.
      await gesture("selectCanonical", async () => {
        const c = document.querySelector("#mdPrev");
        if (c) {
          const r = c.getBoundingClientRect();
          for (const type of ["pointerdown", "pointerup"]) {
            c.dispatchEvent(new PointerEvent(type, {
              bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
              clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
              button: 0, buttons: type === "pointerdown" ? 1 : 0,
            }));
          }
        }
        await settle(150);
      }, 0);

      return {
        results,
        note: "Model editor CAD gesture baseline: teardowns, part builds, edge scans, disposals, rebuilds.",
      };
    }, MOVES);

    return out;
  } finally {
    await page.close();
  }
}

/* ---- runner ------------------------------------------------------------- */

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

const out = {
  generatedAt: new Date().toISOString(),
  git: null,
  node: process.version,
  platform: process.platform + " " + process.arch,
  repeats: REPEATS,
};

try {
  const { execSync } = await import("node:child_process");
  out.git = {
    head: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
    dirtyFiles: execSync("git status --porcelain", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length,
  };
} catch {}

const step = async (name, fn) => {
  if (!ONLY.has(name)) return;
  process.stderr.write(`[perf] ${name} ...\n`);
  try {
    out[name] = await fn();
  } catch (e) {
    out[name] = { error: String(e && e.message || e) };
    process.stderr.write(`[perf] ${name} FAILED: ${e && e.message}\n`);
  }
};

await step("server", probeServer);
await step("boot", probeBoot);
await step("paint", async () => {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await probePaint());
  if (runs.length === 1) return runs[0];
  const merged = runs[0];
  for (const key of Object.keys(merged.results))
    for (const field of ["modelPaints", "hudPaints", "paintRequests", "hudRequests", "wallMs",
      "fullPaintMs", "modelPaintMs", "hudPaintMs"])
      if (merged.results[key][field] != null)
        merged.results[key][field] = median(runs.map((r) => r.results[key][field]));
  merged.runs = runs.length;
  return merged;
});
await step("three", async () => {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await probeThree());
  if (runs.length === 1) return runs[0];
  // report the last run in full and keep the others alongside for variance
  return Object.assign({}, runs[runs.length - 1], { allRuns: runs });
});
await step("modeler", async () => {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await probeModeler());
  if (runs.length === 1) return runs[0];
  const merged = runs[0];
  for (const key of Object.keys(merged.results))
    for (const field of [
      "mdPreview", "mdBuildPart", "mdEdgeScan", "mdDispose",
      "mdRefreshAll", "mdRebuildDoc", "mdClone", "wallMs", "pointermoveEvents",
    ])
  merged.runs = runs.length;
  return merged;
});

let finalJson = out;
if (!BASELINE_CLEAN) {
  try {
    const existingRaw = await readFile(OUT, "utf8");
    const existingJson = JSON.parse(existingRaw);
    finalJson = {
      ...existingJson,
      ...out,
      server: out.server ?? existingJson.server,
      boot: out.boot ?? existingJson.boot,
      paint: out.paint ?? existingJson.paint,
      three: out.three ?? existingJson.three,
      modeler: out.modeler ?? existingJson.modeler,
    };
  } catch {
    // File didn't exist or was invalid JSON
  }
}
await writeFile(OUT, JSON.stringify(finalJson, null, 2) + "\n");
process.stderr.write("[perf] wrote " + OUT + "\n");

/* ---- markdown summary --------------------------------------------------- */
const kb = (n) => (n == null ? "-" : (n / 1024).toFixed(1) + " KB");
const newSections = new Map();

if (out.server && !out.server.error) {
  const lines = [
    "## (a) Server delivery — `node server/relay.mjs`\n",
    "| asset | on disk | on wire | enc | cold TTFB | cold total | warm TTFB | warm total |",
    "|---|--:|--:|---|--:|--:|--:|--:|",
    ...out.server.cold.map((c, i) => {
      const w = out.server.warm[i];
      return `| \`${c.path}\` | ${kb(c.uncompressedBytes)} | ${kb(c.transferredBytes)} | ${c.encoding} | ${c.ttfbMs} ms | ${c.totalMs} ms | ${w.ttfbMs} ms | ${w.totalMs} ms |`;
    }),
    `| **total** | | | | | **${out.server.coldTotalMs} ms** | | **${out.server.warmTotalMs} ms** |`,
    "\n" + out.server.note + "\n",
  ];
  newSections.set("a", lines.join("\n"));
}
if (out.boot && !out.boot.error) {
  const b = out.boot;
  const lines = [
    "## (b) Boot cost (game modules excluded)\n",
    "| metric | value |",
    "|---|--:|",
    `| network requests (total) | ${b.requestsTotal} |`,
    `| network requests (excl. game modules) | ${b.requestsExcludingGame} |`,
    `| JS requests | ${b.jsRequests} |`,
    `| JS uncompressed | ${kb(b.jsDecodedBytes)} |`,
    `| JS transferred | ${kb(b.jsTransferredBytes)} |`,
    `| all resources uncompressed | ${kb(b.allDecodedBytes)} |`,
    `| time to interactive (nav -> __home3dBooted + 1 frame) | ${b.timeToInteractiveMs} ms |`,
    `| DOM elements at idle | ${b.dom.elements} |`,
    `| buttons at idle | ${b.dom.buttons} |`,
    `| form controls at idle | ${b.dom.inputs} |`,
    `| canvases at idle | ${b.dom.canvases} |`,
    `| JS heap at idle | ${b.dom.heapMB == null ? "-" : b.dom.heapMB + " MB"} |`,
    "\nLargest JS modules by uncompressed size:\n",
    "| module | uncompressed |",
    "|---|--:|",
    ...b.largestJs.map((r) => `| \`${r.path}\` | ${kb(r.decoded)} |`),
    "\n" + b.note + "\n",
  ];
  newSections.set("b", lines.join("\n"));
}
if (out.paint && !out.paint.error) {
  const lines = [
    "## (c) 2D paint count — model vs. HUD paints per gesture\n",
    "| gesture | pointermoves | model paints | model/move | HUD paints | paint requests | HUD requests | snap() calls | wall ms | moved by |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
  ];
  for (const [k, v] of Object.entries(out.paint.results)) {
    if (v.modelPaintsPerMove != null || k.startsWith("idle")) {
      lines.push(`| ${k} | ${v.pointermoveEvents ?? "-"} | ${v.modelPaints} | ${v.modelPaintsPerMove ?? "-"} | ${v.hudPaints} | ${v.paintRequests} | ${v.hudRequests} | ${v.historySnapshots} | ${v.wallMs ?? "-"} | ${v.movedBy ?? "-"} |`);
    }
  }
  const costRows = Object.entries(out.paint.results).filter(([, v]) => v.fullPaintMs != null);
  if (costRows.length) {
    lines.push("\n### What one paint costs (timed synchronously, no rAF in the loop)\n");
    lines.push("| scene | walls | full paint (model+HUD) | model pass | HUD pass |");
    lines.push("|---|--:|--:|--:|--:|");
    costRows.forEach(([k, v]) =>
      lines.push(`| ${k} | ${v.walls} | ${v.fullPaintMs} ms | ${v.modelPaintMs ?? "-"} ms | ${v.hudPaintMs ?? "-"} ms |`));
  }
  for (const key of ["idle3000ms", "idleWarning3000ms"]) {
    const idle = out.paint.results[key];
    if (idle && idle.callers && idle.callers.length) {
      lines.push(`\nWhat paints the MODEL canvas during \`${key}\` (no input at all):\n`);
      idle.callers.forEach((c) => lines.push("- " + c.n + "x `" + c.stack + "`"));
    }
  }
  lines.push("\n" + out.paint.note + "\n");
  newSections.set("c", lines.join("\n"));
}
if (out.three && !out.three.error) {
  const t = out.three;
  const lines = ["## (d) 3D idle cost\n"];
  if (t.error) lines.push("**not measured:** " + t.error + "\n");
  else {
    lines.push(`Backend: \`${t.backend}\` · canvas ${t.canvasSize ? t.canvasSize.w + "x" + t.canvasSize.h : "?"}\n`);
    lines.push(
      `Humans: ${t.peopleItemsPlaced} items placed, ${t.humanMeshesInScene} human meshes in the ` +
      `scene, ${t.humansAsDirectDynChildren} of them direct children of the dyn group ` +
      `(only those keep the loop live) · ${t.sceneObjects} objects in the scene graph\n`
    );
    lines.push("| sample | rAF fps | painted frames/s | draw calls/frame | tris/frame | shadow passes/s |");
    lines.push("|---|--:|--:|--:|--:|--:|");
    (t.samples || []).forEach((s) =>
      lines.push(`| ${s.label} | ${s.rafFps} | ${s.renderedFramesPerSecond} | ${s.drawCallsPerFrame} | ${s.trianglesPerFrame} | ${s.shadowPassesPerSecond} |`));
    lines.push("\n" + t.note + "\n");
  }
  newSections.set("d", lines.join("\n"));
}
if (out.modeler && !out.modeler.error) {
  const m = out.modeler;
  const lines = [
    "## (e) Modeler CAD performance — gesture counters & wall clock\n",
    "| gesture | moves | updatePreview | buildPart | meshFeatureEdges | clearGroup | refreshAll | rebuildDoc | cloneDomain | wall ms |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
    ...Object.entries(m.results).map(([k, v]) =>
      `| ${k} | ${v.pointermoveEvents ?? "-"} | ${v.mdPreview} | ${v.mdBuildPart} | ${v.mdEdgeScan} | ${v.mdDispose} | ${v.mdRefreshAll} | ${v.mdRebuildDoc} | ${v.mdClone} | ${v.wallMs ?? "-"} |`
    ),
    "\n" + m.note + "\n",
  ];
  newSections.set("e", lines.join("\n"));
}

const mdPath = OUT.replace(/\.json$/, "") + ".md";
let existingSections = new Map();
let preamble = null;

if (!BASELINE_CLEAN) {
  try {
    const existingMd = await readFile(mdPath, "utf8");
    const sectionSplits = existingMd.split(/(?=^## \([a-e]\))/m);
    if (sectionSplits.length > 0) {
      preamble = sectionSplits[0].trim();
      for (let i = 1; i < sectionSplits.length; i++) {
        const secText = sectionSplits[i];
        const match = secText.match(/^## \(([a-e])\)/m);
        if (match) {
          existingSections.set(match[1], secText.trim());
        }
      }
    }
  } catch {
    // Existing file didn't exist, ignore
  }
}

if (!preamble) {
  const preLines = [
    "# Performance baseline\n",
    `Generated ${out.generatedAt} · node ${out.node} · ${out.platform}`,
  ];
  if (out.git) preLines.push(`HEAD \`${out.git.head.slice(0, 10)}\` with ${out.git.dirtyFiles} modified/untracked files in the tree`);
  preLines.push("\nRegenerate with:\n\n```\nnode tools/perf_harness.mjs\n```\n");
  preamble = preLines.join("\n");
}

const finalSections = [];
for (const letter of ["a", "b", "c", "d", "e"]) {
  if (newSections.has(letter)) {
    finalSections.push(newSections.get(letter).trim());
  } else if (existingSections.has(letter)) {
    finalSections.push(existingSections.get(letter).trim());
  }
}

const finalMd = preamble + "\n\n" + finalSections.join("\n\n") + "\n";
await writeFile(mdPath, finalMd);
process.stderr.write("[perf] wrote " + mdPath + "\n");
