#!/usr/bin/env node
/* Desktop shell check (desktop/src-tauri): drives the running app's webview over
 * the DevTools protocol and reports each spike exit criterion as JSON.
 *
 *   # Windows, debug build only: expose DevTools to this script
 *   set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 *   cargo run --manifest-path desktop/src-tauri/Cargo.toml
 *   node tools/desktop_check.mjs [--cdp=http://127.0.0.1:9222] [--relay=ws://127.0.0.1:8792] [--phase=write|read]
 *
 * --phase=write stores an IndexedDB marker; restart the app and run
 * --phase=read to prove storage survives a restart under the desktop origin.
 * WKWebView (macOS) has no DevTools protocol: check it by hand (desktop/README.md).
 */
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const CDP = arg("cdp", "http://127.0.0.1:9222");
const RELAY = arg("relay", "");
const PHASE = arg("phase", "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attach() {
  const targets = await (await fetch(CDP + "/json/list")).json();
  const page = targets.find((t) => t.type === "page" && /^(http:\/\/mf\.localhost|mf:\/\/)/.test(t.url));
  if (!page) throw new Error("no ModelForge page among DevTools targets: " + targets.map((t) => t.url).join(", "));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("DevTools socket failed"));
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      errors.push(m.params.entry.text + (m.params.entry.url ? " " + m.params.entry.url : ""));
    }
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resolve) => pending.set(i, resolve));
  };
  const evaluate = async (expression, ms = 120000) => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      sleep(ms).then(() => ({ result: { result: { value: { ok: false, error: "timeout after " + ms + " ms" } } } })),
    ]);
    if (r.result?.exceptionDetails)
      return { ok: false, error: (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || "").slice(0, 400) };
    return r.result?.result?.value;
  };
  return { send, evaluate, errors, close: () => ws.close(), url: page.url };
}

// Each check is a page-side async function body returning { ok, ... }.
const CHECKS = {
  boot: `for (let i = 0; i < 150 && !window.__home3dBooted; i++) await new Promise((r) => setTimeout(r, 200));
    return { ok: !!window.__home3dBooted, origin: location.origin, secure: isSecureContext, desktop: window.__MF_DESKTOP__ || null };`,
  gpu: `const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    const tl = await import("/js/three_lazy.js"); await tl.loadThree();
    const g = await import("/js/gpu.js");
    const r = g.createRenderer({ canvas: document.createElement("canvas"), antialias: false });
    await g.ready(r); const backend = g.backendName(r); r.dispose();
    return { ok: !!adapter && backend === "WebGPU", backend,
      adapter: adapter ? { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture } : null };`,
  cadMainThread: `const t0 = performance.now();
    const oc = await (await import("/js/cad_kernel.js")).loadCadKernel();
    const box = new oc.BRepPrimAPI_MakeBox_2(10, 20, 30), props = new oc.GProp_GProps_1();
    oc.BRepGProp.VolumeProperties_1(box.Shape(), props, false, false, false);
    const volume = props.Mass(); box.delete(); props.delete();
    return { ok: Math.abs(volume - 6000) < 1e-6, volume, ms: Math.round(performance.now() - t0) };`,
  cadWorker: `const src = "import { loadCadKernel } from '" + location.origin + "/js/cad_kernel.js';" +
      "loadCadKernel().then((oc) => { const b = new oc.BRepPrimAPI_MakeBox_2(1, 2, 3); const ok = !b.Shape().IsNull(); b.delete(); postMessage({ ok }); }," +
      " (e) => postMessage({ ok: false, error: String(e) }));";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url, { type: "module" }), t0 = performance.now();
    const out = await new Promise((resolve) => { w.onmessage = (e) => resolve(e.data);
      w.onerror = (e) => resolve({ ok: false, error: e.message || "worker error" });
      setTimeout(() => resolve({ ok: false, error: "timeout" }), 90000); });
    w.terminate(); URL.revokeObjectURL(url);
    return { ...out, ms: Math.round(performance.now() - t0) };`,
  rapier: `const n = await import("/js/physics/native.js"); await n.initNative();
    return { ok: typeof n.RAPIER.World === "function", version: typeof n.RAPIER.version === "function" ? n.RAPIER.version() : null };`,
  tesseract: `const { default: T } = await import("/vendor/tesseract/tesseract.esm.min.js");
    const at = (p) => new URL(p, location.href).href;
    const w = await T.createWorker("eng", 1, { workerPath: at("/vendor/tesseract/worker.min.js"),
      corePath: at("/vendor/tesseract/core/"), langPath: at("/vendor/tesseract/lang/"), gzip: false });
    const c = document.createElement("canvas"); c.width = 260; c.height = 110;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 260, 110);
    x.fillStyle = "#000"; x.font = "bold 72px sans-serif"; x.fillText("42", 70, 85);
    const { data } = await w.recognize(c); await w.terminate();
    return { ok: /42/.test(data.text), text: data.text.trim() };`,
  // The real client against the Rust backup route: a ~20 MB record (a large
  // model) goes in, is listed, and comes back intact.
  modelBackup20MB: `const client = await import("/js/core/model_backup_client.js");
    const key = "cm_desktop_check", revision = Date.now(), filler = "x".repeat(20e6);
    const record = { key, name: "Desktop check", revision, sketches: [], features: [], note: filler };
    const t0 = performance.now();
    const sent = await client.backupModels([record]);
    const listed = await client.listDiskBackups();
    const back = await client.fetchDiskBackup(key);
    const models = (listed && (listed.models || listed)) || [];
    const model = back && (back.model || back);
    return { ok: !!model && model.revision === revision && model.note && model.note.length === filler.length && [].concat(models).some((m) => m && m.key === key),
      sent, listedCount: [].concat(models).length, ms: Math.round(performance.now() - t0) };`,
};

function idbCheck(phase) {
  return `const db = await new Promise((resolve, reject) => { const r = indexedDB.open("mf-desktop-check", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const store = (mode) => db.transaction("kv", mode).objectStore("kv");
    const done = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    ${phase === "write"
      ? `const marker = "written " + new Date().toISOString(); await done(store("readwrite").put(marker, "marker")); db.close(); return { ok: true, marker };`
      : `const marker = await done(store("readonly").get("marker")); db.close(); return { ok: typeof marker === "string", marker: marker || null };`}`;
}

function relayCheck(expected) {
  return `const net = await import("/js/net.js"); const url = net.serverURL();
    const ws = new WebSocket(url);
    const opened = await new Promise((resolve) => { ws.onopen = () => resolve(true); ws.onerror = () => resolve(false); setTimeout(() => resolve(false), 8000); });
    ws.close();
    return { ok: opened && url === ${JSON.stringify(expected)}, url, opened };`;
}

const page = await attach();
await page.send("Runtime.enable");
await page.send("Log.enable");
await page.send("Page.enable");
await page.send("Page.reload", { ignoreCache: true });
await sleep(500);
const results = { target: page.url };
const plan = { ...CHECKS };
if (PHASE) plan["indexedDB_" + PHASE] = idbCheck(PHASE);
if (RELAY) plan.relay = relayCheck(RELAY);
for (const [name, body] of Object.entries(plan)) {
  results[name] = await page.evaluate(`(async () => { ${body} })()`);
  process.stderr.write(`${results[name]?.ok ? "pass" : "FAIL"}  ${name}\n`);
}
results.consoleErrors = page.errors.slice(0, 40);
results.allPassed = Object.keys(plan).every((name) => results[name]?.ok) && !page.errors.length;
page.close();
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.allPassed ? 0 : 1;
