/* In-page code for tools/perf_planner.mjs. Every function here runs INSIDE the
   page: the driver sends `(${fn})(${JSON.stringify(opts)})` through CDP
   Runtime.evaluate, so they may use only browser globals and dynamic import().
   Counters come from the wrappers in wraps.mjs (window.__pp). */

/* Installed with Page.addScriptToEvaluateOnNewDocument, before any module. */
export function pagePrelude() {
  const P = (window.__pp = { n: {}, ms: {}, max: {} });
  window.__pt = (name, t0) => {
    const d = performance.now() - t0;
    P.n[name] = (P.n[name] || 0) + 1;
    P.ms[name] = (P.ms[name] || 0) + d;
    if (d > (P.max[name] || 0)) P.max[name] = d;
  };
  window.__ppReset = () => { P.n = {}; P.ms = {}; P.max = {}; };
  window.__ppSnap = () => {
    const out = {};
    for (const k of Object.keys(P.n)) out[k] = { n: P.n[k], ms: +(P.ms[k] || 0).toFixed(2), max: +(P.max[k] || 0).toFixed(2) };
    return out;
  };
  window.__long = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push({ t: e.startTime, d: e.duration })))
      .observe({ type: "longtask", buffered: true });
  } catch (e) { /* no long-task API */ }
  if (window.GPUDevice) {
    for (const m of ["createRenderPipeline", "createRenderPipelineAsync", "createShaderModule"]) {
      const real = window.GPUDevice.prototype[m];
      window.GPUDevice.prototype[m] = function () {
        const c = this.__pc || (this.__pc = {});
        c[m] = (c[m] || 0) + 1;
        return real.apply(this, arguments);
      };
    }
  }
}

/* Helpers, installed once per page after boot. */
export async function pageHelpers() {
  const st = await import("/js/state.js");
  const plan2d = await import("/js/plan2d.js");
  const keyMod = await import("/js/plan_sprite_key.js");
  const fapi = await import("/js/furniture_api.js");
  const H = (window.__H = { st, plan2d, keyMod, fapi });
  H.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  H.raf = () => new Promise((r) => requestAnimationFrame(r));
  H.frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  H.stats = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    return { n: a.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
  };
  H.longIn = (t0, t1) => {
    const l = window.__long.filter((e) => e.t >= t0 && e.t <= t1).map((e) => Math.round(e.d));
    return { count: l.length, longestMs: l.length ? Math.max(...l) : 0, totalMs: l.reduce((a, b) => a + b, 0) };
  };
  H.canvas = () => document.getElementById("plan");
  H.ev = (type, x, z, extra) => {
    const cv = H.canvas(), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent(type, Object.assign({
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: "mouse", button: 0,
      buttons: type === "pointerup" ? 0 : 1, clientX: r.left + plan2d.sx(x), clientY: r.top + plan2d.sz(z),
    }, extra || {})));
  };
  /* Per-paint record of the presentation furniture: how many pieces asked
     for a picture, got one, got the exact one for this zoom, or fell back to
     the glyph although they want a picture. */
  H.trackPaints = false;
  H.paints = [];
  let cur = null;
  H.bakeLog = [];
  window.__ppre = (name, args) => {
    if (name === "drawPrepared") H.bakeLog.push({ type: args[1].it.type, start: performance.now(), end: null });
    if (H.trackPaints && name === "renderModel") cur = { t: performance.now(), calls: 0, pics: 0, exact: 0, missing: 0 };
  };
  window.__pret = (name, args, res) => {
    if (name === "drawPrepared") { const b = H.bakeLog.find((q) => q.type === args[1].it.type && q.end == null); if (b) b.end = performance.now(); }
    if (!H.trackPaints) return;
    if (name === "renderModel" && cur) { H.paints.push(cur); cur = null; return; }
    if (!cur) return;
    if (name === "itemSprite") {
      const it = args[0], dpr = args[2] || 1;
      cur.calls++;
      if (res) cur.pics++;
      const key = window.__spr.keyFor(it, keyMod.spriteBucket(Math.max(it.w || 0, it.d || 0) * args[1] * dpr));
      if (res && window.__spr.cache.get(key) === res) cur.exact++;
      else if (H.paints.length < 3) (cur.notExact || (cur.notExact = [])).push(it.type + (window.__spr.persisted.has(key) ? "(disk)" : "") + (res ? "(stand-in)" : ""));
    } else if (name === "drawItemPresentation" && res === false) {
      const it = args[0];
      let vs = null;
      try { vs = fapi.knownVSpan(it); } catch (e) { vs = null; }
      if (!vs || keyMod.spriteMode(it, { lamp: false, vspan: vs }) === "sprite") { cur.missing++; if (H.paints.length < 3) (cur.missingTypes || (cur.missingTypes = [])).push(it.type + (vs ? "" : "(no vspan)")); }
    }
  };
  H.spr = () => {
    const s = window.__spr;
    // pictures made ahead for the next zoom step are not waited for
    let queue = 0, ahead = 0;
    s.queue.forEach((q) => { if (q.ahead) ahead++; else queue++; });
    return { cache: s.cache.size, queue, ahead, baking: s.isBaking() && queue > 0, persisted: s.persisted.size,
      toPersist: s.toPersist.size, failed: s.failed.size, vspanPending: window.__vspan.toMeasure.size,
      cacheMB: +((s.pixels() * 4) / 1048576).toFixed(1) };
  };
  H.complete = (p) => p && p.calls > 0 && p.exact === p.calls && p.missing === 0;
  /* 3D helpers shared by the 3D scenarios. */
  H.view3dReady = async () => {
    const v = await import("/js/view3d.js");
    for (let i = 0; i < 600; i++) {
      const r = v.getRenderer();
      if (r && r.initialized && !st.S.dirty3D) break;
      await H.sleep(50);
    }
    return v;
  };
  H.settle3D = async (v) => {
    const r = v.getRenderer();
    await H.raf(); await H.raf();
    if (r.backend.isWebGPUBackend) await r.backend.device.queue.onSubmittedWorkDone();
  };
  H.countMeshes = (root) => {
    let meshes = 0, instanced = 0;
    if (root) root.traverse((o) => { if (o.isInstancedMesh) instanced++; else if (o.isMesh) meshes++; });
    return { meshes, instanced };
  };
  H.findRoot = (scene, layer) => {
    let hit = null;
    scene.traverse((o) => { if (!hit && o.userData && o.userData.layerRoot === layer) hit = o; });
    return hit;
  };
  /* The test house: the large generated apartment (seed 3) with its
     auto-generated infrastructure, optionally tiled `copies` times. */
  H.setupScene = async (copies, opts) => {
    const g = await import("/js/generator.js"), { executeCommand } = await import("/js/commands/executor.js");
    try {
      (await import("/js/smarthome.js")).ensureSmartHome().automations.forEach((a) => { a.enabled = false; });
    } catch (e) { /* no smart home */ }
    window.__setViewMode("plan");
    executeCommand(g.apartmentGenerateCommand, { size: "large", replace: true, replaceInfrastructure: true, infrastructure: true, seed: 3 },
      { domain: "planner", state: st.S }, { history: false });
    const S = st.S;
    if (copies > 1) {
      const xs = S.nodes.map((n) => n.x), zs = S.nodes.map((n) => n.z);
      const w = Math.max(...xs) - Math.min(...xs) + 300, cols = Math.ceil(Math.sqrt(copies));
      const d = Math.max(...zs) - Math.min(...zs) + 300;
      const base = { nodes: S.nodes.slice(), walls: S.walls.slice(), openings: S.openings.slice(), items: S.items.slice() };
      for (let c = 1; c < copies; c++) {
        const ox = (c % cols) * w, oz = Math.floor(c / cols) * d, n0 = S.nodes.length, wallId = {};
        base.nodes.forEach((n) => S.nodes.push(Object.assign(JSON.parse(JSON.stringify(n)), { x: n.x + ox, z: n.z + oz })));
        base.walls.forEach((wl) => {
          const nw = JSON.parse(JSON.stringify(wl));
          nw.id = st.uid(); wallId[wl.id] = nw.id; nw.a = wl.a + n0; nw.b = wl.b + n0;
          S.walls.push(nw);
        });
        base.openings.forEach((o) => { if (wallId[o.wall]) S.openings.push(Object.assign(JSON.parse(JSON.stringify(o)), { id: st.uid(), wall: wallId[o.wall] })); });
        base.items.forEach((it) => S.items.push(Object.assign(JSON.parse(JSON.stringify(it)), { id: st.uid(), x: it.x + ox, z: it.z + oz })));
      }
    }
    // --mep-copies: the tiled plan gets its own auto-generated infrastructure
    // (the panel's "auto-generate", timed), so the network grows with it
    let mepAutoMs = null;
    if (copies > 1 && opts && opts.mep) {
      const auto = await import("/js/mep_auto.js");
      const t0 = performance.now();
      auto.autoInfrastructure();
      mepAutoMs = Math.round(performance.now() - t0);
    }
    S.planStyle = "technical";
    S.dirty3D = true;
    plan2d.fitView();
    plan2d.render2D();
    const m = S.mep || {};
    return { walls: S.walls.length, items: S.items.length, mepNodes: (m.nodes || []).length, mepRuns: (m.runs || []).length, mepAutoMs };
  };
}

/* The flattened plan picture (planImageCanvas) once every presentation
   picture is exact: the A/B evidence that a change left the plan's pixels
   alone. Uses only exported API, so it runs on the committed sources too. */
export async function presCapture(opts) {
  const H = window.__H, S = H.st.S, ui = await import("/js/ui.js"), spr = await import("/js/plan_sprites.js");
  const walls = await import("/js/plan2d/walls.js");
  const scene = await H.setupScene(opts.copies || 1);
  S.mep.show = false;
  await H.sleep(1500);
  ui.setPlanStyle(opts.style);
  let settled = true;
  if (opts.style === "presentation") settled = await spr.spritesSettled(S.items, S.SC, walls.canvasDpr(), 90000);
  await H.sleep(800);
  // pictures baked while a texture was loading are replaced when it lands
  if (opts.style === "presentation") settled = (await spr.spritesSettled(S.items, S.SC, walls.canvasDpr(), 30000)) && settled;
  await H.frame();
  H.plan2d.render2DNow();
  const url = H.plan2d.planImageCanvas().toDataURL("image/png");
  return { scene, settled, bytes: url.length, url };
}

/* The 3D view with the infrastructure shown, from a fixed camera, read back
   right after a direct render (TRAA/GTAO history would differ run to run). */
export async function capture3D(opts) {
  const H = window.__H, S = H.st.S;
  const scene0 = await H.setupScene(1);
  S.mep.show = true; S.mep.show3D = true;
  if (opts.xray != null) S.mep.xray.floor = !!opts.xray;
  window.__setViewMode("3d");
  S.dirty3D = true;
  let v = await H.view3dReady();
  v.setOrbitCamera({ theta: opts.theta || 0.8, phi: opts.phi || 0.9, radius: opts.radius || 1500 });
  await H.sleep(opts.settleMs || 6000);
  v.stopShadowSetPrewarm();
  await H.sleep(500);
  const r = v.getRenderer(), scene = v.getMainScene(), cam = v.getMainCamera();
  for (let i = 0; i < 3; i++) { r.render(scene, cam); await H.settle3D(v); }
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  return { scene: scene0, url, bytes: url.length };
}

export async function compareImages(opts) {
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const [a, b] = await Promise.all([load(opts.a), load(opts.b)]);
  if (a.width !== b.width || a.height !== b.height) return { sameSize: false, a: [a.width, a.height], b: [b.width, b.height] };
  const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
  const da = px(a), db = px(b);
  let diff = 0, maxd = 0, first = null;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
    if (d) { diff++; if (d > maxd) maxd = d; if (!first) first = [(i / 4) % a.width, Math.floor(i / 4 / a.width)]; }
  }
  return { sameSize: true, size: [a.width, a.height], pixels: da.length / 4, differing: diff, maxChannelDiff: maxd, firstAt: first };
}

/* Technical plan → presentation: time to first picture and to all exact
   pictures, longest main-thread task in that window. */
export async function spritesSwitch(opts) {
  const H = window.__H, ui = await import("/js/ui.js");
  const S = H.st.S;
  await H.sleep(opts.waitMs);
  const before = H.spr();
  before.queued = [...window.__spr.queue.values()].map((q) => q.it.type + (window.__spr.persisted.has(q.key) ? "(disk)" : "") + (q.it.tex || q.it.texParts ? "(tex)" : ""));
  // pieces whose exact picture is already on disk at the moment of the switch
  let onDisk = 0, wanted = 0;
  const dpr = window.devicePixelRatio || 1;
  S.items.forEach((it) => {
    const key = window.__spr.keyFor(it, H.keyMod.spriteBucket(Math.max(it.w || 0, it.d || 0) * S.SC * dpr));
    wanted++;
    if (window.__spr.persisted.has(key)) onDisk++;
  });
  window.__ppReset();
  H.paints = []; H.trackPaints = true; H.bakeLog = [];
  const t0 = performance.now();
  ui.setPlanStyle("presentation");
  let first = null, all = null;
  const off = await import("/js/offscreen_gl.js"), trace = [];
  let lastSig = "";
  while (performance.now() - t0 < opts.timeoutMs) {
    await H.frame();
    const sp = H.spr(), sig = [sp.queue, sp.baking, !!off.offscreenGL(), off.offscreenPending(), sp.cache].join(",");
    if (sig !== lastSig && trace.length < 60) { trace.push(Math.round(performance.now() - t0) + ":" + sig); lastSig = sig; }
    const p = H.paints[H.paints.length - 1];
    if (first == null) { const f = H.paints.find((q) => q.pics > 0); if (f) first = f.t - t0; }
    const s = H.spr();
    if (H.complete(p) && !s.queue && !s.baking && !s.vspanPending) { all = p.t - t0; break; }
  }
  const t1 = performance.now();
  H.trackPaints = false;
  const last = H.paints[H.paints.length - 1] || null;
  return { waitMs: opts.waitMs, before, persistedAtSwitch: onDisk, itemsAtSwitch: wanted,
    firstPictureMs: first == null ? null : Math.round(first), allPicturesMs: all == null ? null : Math.round(all),
    timedOut: all == null, lastPaint: last, paints: H.paints.length, after: H.spr(),
    long: H.longIn(t0, t1), counters: window.__ppSnap(),
    firstPaints: H.paints.slice(0, 3), trace, bakes: H.bakeLog.map((b) => [b.type, Math.round(b.start - t0), b.end == null ? null : Math.round(b.end - t0)]) };
}

/* Wait until baking and disk writes are finished (for the warm reload). */
export async function spritesFlush(opts) {
  const H = window.__H, t0 = performance.now();
  while (performance.now() - t0 < opts.timeoutMs) {
    const s = H.spr();
    if (!s.queue && !s.baking && !s.toPersist) break;
    await H.sleep(250);
  }
  await H.sleep(1500); // the last IndexedDB transaction
  return { waitedMs: Math.round(performance.now() - t0), ...H.spr() };
}

/* Zoom in across two bucket boundaries (x4) with wheel events at the
   canvas centre; time until every picture is exact again. */
export async function spritesZoom(opts) {
  const H = window.__H, S = H.st.S, cv = H.canvas(), r = cv.getBoundingClientRect();
  const sc0 = S.SC, t0 = performance.now();
  window.__ppReset();
  H.paints = []; H.trackPaints = true;
  for (let i = 0; i < 60 && S.SC < sc0 * 4; i++) {
    cv.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    await H.frame();
  }
  const zoomed = performance.now();
  let all = null;
  while (performance.now() - t0 < opts.timeoutMs) {
    await H.frame();
    const p = H.paints[H.paints.length - 1], s = H.spr();
    if (p && p.t > zoomed && H.complete(p) && !s.queue && !s.baking) { all = p.t - zoomed; break; }
  }
  const t1 = performance.now();
  H.trackPaints = false;
  return { scFrom: +sc0.toFixed(3), scTo: +S.SC.toFixed(3), zoomGestureMs: Math.round(zoomed - t0),
    allExactAfterZoomMs: all == null ? null : Math.round(all), timedOut: all == null, after: H.spr(),
    long: H.longIn(t0, t1), counters: window.__ppSnap() };
}

/* One model paint, presentation vs technical, and model paints per pan move. */
export async function presPaint(opts) {
  const H = window.__H, S = H.st.S, ui = await import("/js/ui.js"), inter = await import("/js/interaction.js");
  const timePaints = async (style) => {
    ui.setPlanStyle(style);
    await H.frame(); await H.frame();
    H.plan2d.render2DNow();
    window.__ppReset();
    const t0 = performance.now();
    for (let i = 0; i < opts.paints; i++) H.plan2d.render2DNow();
    const ms = performance.now() - t0, c = window.__ppSnap();
    return { fullPaintMs: +(ms / opts.paints).toFixed(2), modelMs: +((c.renderModel?.ms || 0) / opts.paints).toFixed(2),
      hudMs: +((c.renderHUD?.ms || 0) / opts.paints).toFixed(2), drawItemPresentationMs: +((c.drawItemPresentation?.ms || 0) / opts.paints).toFixed(2) };
  };
  const technical = await timePaints("technical");
  const presentation = await timePaints("presentation");
  inter.setTool("select");
  const cv = H.canvas(), r = cv.getBoundingClientRect();
  const at = (x, y, type, buttons) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1,
    isPrimary: true, pointerType: "mouse", button: 1, buttons, clientX: r.left + x, clientY: r.top + y }));
  window.__ppReset();
  const moves = opts.moves, t0 = performance.now();
  at(300, 200, "pointerdown", 4);
  for (let i = 1; i <= moves; i++) { at(300 + (120 * i) / moves, 200 + (60 * i) / moves, "pointermove", 4); await H.frame(); }
  at(420, 260, "pointerup", 0);
  await H.frame();
  const t1 = performance.now(), c = window.__ppSnap();
  return { items: S.items.length, technical, presentation,
    pan: { moves, modelPaints: c.renderModel?.n || 0, modelPerMove: +((c.renderModel?.n || 0) / moves).toFixed(2),
      modelMsPerMove: +((c.renderModel?.ms || 0) / moves).toFixed(2), wallMs: Math.round(t1 - t0) }, long: H.longIn(t0, t1) };
}

/* MEP shown and animating, no input. */
export async function mepIdle(opts) {
  const H = window.__H, S = H.st.S, ui = await import("/js/ui.js");
  ui.setPlanStyle("technical");
  S.mep.show = true; S.mep.animate = true;
  H.plan2d.render2D(); H.plan2d.ensureMEPAnim();
  await H.sleep(1500);
  window.__ppReset();
  let frames = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < opts.ms) { await H.raf(); frames++; }
  const t1 = performance.now(), c = window.__ppSnap(), sec = (t1 - t0) / 1000;
  const per = (k) => (c[k] ? +(c[k].ms / Math.max(1, c.renderHUD?.n || 1)).toFixed(3) : 0);
  return { seconds: +sec.toFixed(2), rafFps: +(frames / sec).toFixed(1), hudPaintsPerSec: +((c.renderHUD?.n || 0) / sec).toFixed(1),
    hudMsPerPaint: per("renderHUD"), drawMEPMsPerPaint: per("drawMEP"), sigMsPerPaint: per("mepSignature"),
    modelPaints: c.renderModel?.n || 0, counters: c, long: H.longIn(t0, t1) };
}

/* Drag a wall, an MEP device and a bed with MEP shown. */
export async function mepDrag(opts) {
  const H = window.__H, S = H.st.S, inter = await import("/js/interaction.js");
  S.mep.show = true;
  S.workSet = "all"; S.workSetPinned = true; inter.setTool("select");
  H.plan2d.render2D(); await H.sleep(800);
  const len = (w) => Math.hypot(S.nodes[w.b].x - S.nodes[w.a].x, S.nodes[w.b].z - S.nodes[w.a].z);
  const clear = (w, s) => Math.min(Infinity, ...(S.openings || []).filter((o) => o.wall === w.id).map((o) => Math.abs(s - o.s) - (o.width || 0) / 2));
  const targets = {}, mepMod0 = await import("/js/mep.js"), mepHit = (x, z) => mepMod0.hitMEP(x, z);
  for (const w of S.walls.slice().sort((p, q) => len(q) - len(p))) {
    const L = len(w);
    const A = S.nodes[w.a], Z = S.nodes[w.b], ux = (Z.x - A.x) / L, uz = (Z.z - A.z) / L;
    // a point clear of openings AND of MEP on the wall (a press there grabs the run)
    let pick = null;
    for (let t = 0.1; t <= 0.9 && !pick; t += 0.02) {
      const sx = t * L, x = A.x + ux * sx, z = A.z + uz * sx;
      if (clear(w, sx) >= 40 && !mepHit(x, z)) pick = { x, z, dx: -uz, dz: ux };
    }
    if (pick) { targets.wall = pick; break; }
  }
  const mepMod = await import("/js/mep.js");
  const dev = S.mep.nodes.find((n) => n.wall == null) || S.mep.nodes[0];
  if (dev) { const p = mepMod.nodePos(dev); targets.device = { x: p.x, z: p.z, dx: 1, dz: 0 }; }
  const bed = S.items.find((it) => it.type === "bed");
  if (bed) targets.bed = { x: bed.x, z: bed.z, dx: 1, dz: 0 };
  const out = {};
  for (const name of Object.keys(targets)) {
    const tg = targets[name];
    await H.frame();
    window.__ppReset();
    const t0 = performance.now(), dt = [];
    H.ev("pointerdown", tg.x, tg.z);
    const grabbed = S.sel ? S.sel.kind : null;
    for (let i = 1; i <= opts.moves; i++) {
      const a = performance.now();
      H.ev("pointermove", tg.x + tg.dx * 2 * i, tg.z + tg.dz * 2 * i);
      await H.frame();
      dt.push(performance.now() - a);
    }
    H.ev("pointerup", tg.x + tg.dx * 2 * opts.moves, tg.z + tg.dz * 2 * opts.moves);
    await H.frame();
    const t1 = performance.now(), c = window.__ppSnap();
    const n = (k) => (c[k] ? c[k].n : 0), ms = (k) => (c[k] ? c[k].ms : 0);
    out[name] = { grabbed, moves: opts.moves, moveFrameMs: H.stats(dt),
      calls: { computeMEPClashes: n("computeMEPClashes"), computeMEPStatus: n("computeMEPStatus"), computeMEPFlow: n("computeMEPFlow"),
        makeRouter: n("makeRouter"), mepSignature: n("mepSignature"), renderPanel: n("renderPanel"), renderModel: n("renderModel") },
      msPerMove: { clashes: +(ms("computeMEPClashes") / opts.moves).toFixed(2), status: +(ms("computeMEPStatus") / opts.moves).toFixed(2),
        signature: +(ms("mepSignature") / opts.moves).toFixed(2), drawMEP: +(ms("drawMEP") / opts.moves).toFixed(2),
        model: +(ms("renderModel") / opts.moves).toFixed(2), hud: +(ms("renderHUD") / opts.moves).toFixed(2),
        panel: +(ms("renderPanel") / opts.moves).toFixed(2) },
      long: H.longIn(t0, t1) };
    // undo the drag so the next target starts from the generated house
    const hist = await import("/js/history.js");
    if (hist.undo) hist.undo();
    await H.frame();
  }
  S.workSet = "furniture"; S.workSetPinned = false;
  return out;
}

/* Drawing a route (wall-follow on): ms per pointermove. */
export async function mepRoute(opts) {
  const H = window.__H, S = H.st.S, inter = await import("/js/interaction.js"), mepMod = await import("/js/mep.js");
  const m = mepMod.ensureMEP();
  m.show = true; m.wallRoute = true;
  m.place = { sys: "power", kind: mepMod.MEP_RUN_KINDS.power[0].k, mode: "run" };
  inter.setTool("mepRoute");
  m.place = { sys: "power", kind: mepMod.MEP_RUN_KINDS.power[0].k, mode: "run" };
  const w = S.walls[0], A = S.nodes[w.a], Z = S.nodes[w.b];
  const sx = A.x + (Z.x - A.x) * 0.3, sz = A.z + (Z.z - A.z) * 0.3;
  H.ev("pointerdown", sx, sz); H.ev("pointerup", sx, sz);
  await H.frame();
  // across the house, so each move is a new wall path
  const xs = S.nodes.map((n) => n.x), zs = S.nodes.map((n) => n.z);
  const tx = (Math.min(...xs) + Math.max(...xs)) / 2, tz = (Math.min(...zs) + Math.max(...zs)) / 2;
  window.__ppReset();
  const dt = [], t0 = performance.now();
  for (let i = 1; i <= opts.moves; i++) {
    const a = performance.now(), f = i / opts.moves;
    H.ev("pointermove", sx + (tx - sx) * f, sz + (tz - sz) * f, { buttons: 0 });
    await H.frame();
    dt.push(performance.now() - a);
  }
  const t1 = performance.now(), c = window.__ppSnap();
  const started = !!m.route;
  m.route = null; inter.setTool("select");
  const n = (k) => (c[k] ? c[k].n : 0), ms = (k) => (c[k] ? c[k].ms : 0);
  return { started, moves: opts.moves, moveFrameMs: H.stats(dt),
    calls: { makeRouter: n("makeRouter"), wallPath: n("wallPath"), routeResolve: n("routeResolve"), renderModel: n("renderModel") },
    msPerMove: { makeRouter: +(ms("makeRouter") / opts.moves).toFixed(2), wallPath: +(ms("wallPath") / opts.moves).toFixed(2),
      routeResolve: +(ms("routeResolve") / opts.moves).toFixed(2), model: +(ms("renderModel") / opts.moves).toFixed(2),
      hud: +(ms("renderHUD") / opts.moves).toFixed(2) },
    long: H.longIn(t0, t1) };
}

/* MEP in 3D: draw calls, meshes, rebuild ms; toggle a system. */
export async function mep3d(opts) {
  const H = window.__H, S = H.st.S;
  S.mep.show = true; S.mep.show3D = true;
  window.__setViewMode("3d");
  S.dirty3D = true;
  let v = await H.view3dReady();
  await H.sleep(opts.settleMs);
  const r = v.getRenderer(), scene = v.getMainScene();
  // draw calls of a settled frame, read right after each render(): the
  // fewest over a few camera nudges (frames right after a rebuild also
  // redraw shadow maps)
  const frameCalls = async () => {
    await H.sleep(1500);
    const seen = [], real = r.render;
    r.render = function () { const out = real.apply(this, arguments); seen.push(this.info.render.drawCalls); return out; };
    try {
      for (let k = 0; k < 60 && (k < 6 || seen.length < 3); k++) {
        const cam = v.getOrbitCamera();
        v.setOrbitCamera(Object.assign({}, cam, { theta: cam.theta + 0.001 }));
        await H.raf(); await H.raf();
      }
      await H.settle3D(v);
    } finally { delete r.render; }
    return { drawCalls: seen.length ? Math.min(...seen) : null, renders: seen.length };
  };
  const withMEP = await frameCalls();
  // the same without the under-floor x-ray (transparent guides stay one mesh each)
  const xr = S.mep.xray.floor;
  S.mep.xray.floor = false; S.dirty3D = true;
  v = await H.view3dReady();
  const withMEPNoXray = await frameCalls();
  S.mep.xray.floor = xr; S.dirty3D = true;
  v = await H.view3dReady();
  const mepMeshes = H.countMeshes(H.findRoot(scene, "mep")), allMeshes = H.countMeshes(scene);
  const mepKinds = {};
  const mroot = H.findRoot(scene, "mep");
  if (mroot) mroot.children.forEach((o) => {
    if (!o.isMesh) return;
    const k = (o.material.transparent ? "transparent" : "opaque") + (o.userData.mepMerged ? "-merged" : "") + "/ro" + o.renderOrder;
    mepKinds[k] = (mepKinds[k] || 0) + 1;
  });
  mepMeshes.kinds = mepKinds;
  mepMeshes.xray = Object.assign({}, S.mep.xray);
  window.__ppReset();
  S.dirty3D = true;
  v = await H.view3dReady(); await H.settle3D(v);
  const rebuild = window.__ppSnap();
  // toggle one system off and on, as the panel's eye button does
  const sys = Object.keys(S.mep.vis).find((k) => S.mep.vis[k] !== false && S.mep.runs.some((run) => run.sys === k));
  // through the panel's own eye button (whatever 3D path it asks for)
  const toggle = async (on) => {
    window.__ppReset();
    const t0 = performance.now();
    const ui = await import("/js/ui_mep.js");
    ui.renderPanel();
    const main = document.querySelector('#mepPanel [data-mep="sys:' + sys + '"]');
    const eye = main && main.closest(".mep-chip") && main.closest(".mep-chip").querySelector(".mep-eye");
    let via = "button";
    if (eye) eye.click();
    else { via = "state"; S.mep.vis[sys] = on; S.dirty3D = true; }
    if (S.mep.vis[sys] !== on) { via += "+state"; S.mep.vis[sys] = on; S.dirty3D = true; }
    const r0 = v.getRenderer(), calls0 = r0.info.render.calls, renders = [], realR = r0.render;
    r0.render = function () { const a = performance.now(); try { return realR.apply(this, arguments); } finally { renders.push(+(performance.now() - a).toFixed(1)); } };
    let frames = 0;
    try {
      for (let i = 0; i < 600 && (S.dirty3D || S.mep3D || r0.info.render.calls === calls0); i++) { await H.raf(); frames++; }
      const tDrawn = performance.now() - t0;
      await H.settle3D(v);
      return { via, ms: Math.round(performance.now() - t0), drawnMs: Math.round(tDrawn), frames, renders: renders.slice(0, 8), counters: window.__ppSnap() };
    } finally { delete r0.render; }
  };
  const off = await toggle(false), on = await toggle(true);
  // an inspector edit (a run's diameter), through the panel's own input
  const inspectorEdit = async () => {
    const run = S.mep.runs.find((q) => q.pts && q.pts.length >= 2 && S.mep.vis[q.sys] !== false && !(q.sys === "hvac"));
    if (!run) return null;
    const ui = await import("/js/ui_mep.js");
    S.sel = { kind: "mepRun", ref: run };
    ui.fillMEP();
    const input = document.querySelector("#mepProps input[type=text]");
    if (!input) return { error: "no inspector input" };
    window.__ppReset();
    const t0 = performance.now();
    input.value = String(Math.round((run.dia || 2) + 1));
    input.dispatchEvent(new Event("change"));
    const r0 = v.getRenderer(), calls0 = r0.info.render.calls;
    let frames = 0;
    for (let i = 0; i < 600 && (S.dirty3D || S.mep3D || r0.info.render.calls === calls0); i++) { await H.raf(); frames++; }
    const drawnMs = Math.round(performance.now() - t0);
    await H.settle3D(v);
    S.sel = null;
    return { drawnMs, ms: Math.round(performance.now() - t0), frames, counters: window.__ppSnap() };
  };
  const inspector = await inspectorEdit();
  S.mep.show3D = false; S.dirty3D = true;
  v = await H.view3dReady(); await H.settle3D(v);
  const withoutMEP = await frameCalls();
  S.mep.show3D = true; S.dirty3D = true;
  window.__setViewMode("plan");
  return { system: sys, withMEP, withMEPNoXray, withoutMEP, mepMeshes, allMeshes, rebuild, toggleOff: off, toggleOn: on, inspector };
}

/* rebuild3D() split into items / MEP / the rest (structure), and pipelines. */
export async function plannerRebuild(opts) {
  const H = window.__H, S = H.st.S;
  window.__setViewMode("3d");
  let v = await H.view3dReady();
  await H.sleep(opts.settleMs);
  const dev = v.getRenderer().backend.device, pipelines = dev ? Object.assign({}, dev.__pc || {}) : null;
  const runs = [];
  for (let i = 0; i < opts.repeats; i++) {
    window.__ppReset();
    S.dirty3D = true;
    v = await H.view3dReady(); await H.settle3D(v);
    const c = window.__ppSnap(), ms = (k) => (c[k] ? c[k].ms : 0);
    runs.push({ rebuild3D: +ms("rebuild3D").toFixed(1), items: +ms("syncItems").toFixed(1), mep: +ms("buildMEP3D").toFixed(1),
      structure: +(ms("rebuild3D") - ms("syncItems") - ms("buildMEP3D")).toFixed(1), itemSig: c.itemSig || null });
  }
  const scene = v.getMainScene();
  window.__setViewMode("plan");
  return { items: S.items.length, pipelinesAfterFirstCompile: pipelines, meshes: H.countMeshes(scene),
    itemMeshes: H.countMeshes(H.findRoot(scene, "furniture")), runs };
}

/* --salt: a per-page salt in every WGSL/GLSL program that changes the compiled
   code, so neither Chrome's blob cache nor the GPU driver's shader cache (which
   survives fresh profiles) answers: a cold first compile on every run. */
export function saltPrelude() {
  const SALT = (Math.random() * 1e6 + 1).toFixed(3);
  window.__salt = SALT;
  window.__compile = { modules: 0, bytes: 0 };
  if (window.GPUDevice) {
    const csm = window.GPUDevice.prototype.createShaderModule;
    window.GPUDevice.prototype.createShaderModule = function (d) {
      if (d && typeof d.code === "string" && d.code.includes("output.m0")) {
        const at = d.code.lastIndexOf("\n\treturn output;");
        if (at > 0) d = Object.assign({}, d, { code: d.code.slice(0, at) + "\n\tif ( output.m0.x == " + SALT + " ) { output.m0.y += 1e-7; }" + d.code.slice(at) });
      } else if (d && typeof d.code === "string" && d.code.includes("@vertex") && d.code.includes("varyings.builtinClipSpace")) {
        const at = d.code.lastIndexOf("\n\treturn varyings;");
        if (at > 0) d = Object.assign({}, d, { code: d.code.slice(0, at) + "\n\tif ( varyings.builtinClipSpace.x == " + SALT + " ) { varyings.builtinClipSpace.y += 1e-7; }" + d.code.slice(at) });
      }
      window.__compile.modules++;
      window.__compile.bytes += d && d.code ? d.code.length : 0;
      return csm.call(this, d);
    };
  }
  if (window.WebGL2RenderingContext) {
    const ss = window.WebGL2RenderingContext.prototype.shaderSource;
    window.WebGL2RenderingContext.prototype.shaderSource = function (sh, src) {
      const at = src.lastIndexOf("}");
      if (at > 0 && /void main\s*\(/.test(src)) src = src.slice(0, at) + (src.includes("gl_Position") ? "\n\tif ( gl_Position.x == " + SALT + " ) gl_Position.y += 1e-7;\n" : "\n\tif ( gl_FragCoord.x == " + SALT + " ) discard;\n") + src.slice(at);
      return ss.call(this, sh, src);
    };
  }
}

/* The user's first 3D open: the apartment is made in the plan, `waitMs` pass,
   then 3D is opened; timed until the preparing overlay is down and a frame is
   drawn and finished on the GPU. Also counts what the first frame had to build. */
export async function firstOpen(opts) {
  const H = window.__H, S = H.st.S, v = await import("/js/view3d.js");
  const scene0 = await H.setupScene(1);
  await H.sleep(opts.waitMs);
  window.__ppReset();
  const prepShown = () => { const p = document.getElementById("v3dPrep"); return !!p && p.style.display !== "none" && getComputedStyle(p).display !== "none"; };
  const t0 = performance.now();
  window.__setViewMode("3d");
  let r = null, calls0 = 0, rebuiltAt = null;
  for (let i = 0; i < 3000; i++) {
    r = v.getRenderer();
    if (rebuiltAt == null && !S.dirty3D) rebuiltAt = Math.round(performance.now() - t0);
    if (r && r.initialized && !calls0) calls0 = r.info.render.calls || 0;
    if (r && r.initialized && !S.dirty3D && !prepShown() && (r.info.render.calls || 0) > calls0) break;
    await H.raf();
  }
  if (r && r.backend && r.backend.device) await r.backend.device.queue.onSubmittedWorkDone();
  const t1 = performance.now();
  const c = window.__ppSnap(), ms = (k) => (c[k] ? +c[k].ms.toFixed(1) : 0);
  const scene = v.getMainScene(), mats = new Set(), geos = new Set();
  scene.traverse((o) => { if (o.isMesh) { [].concat(o.material).forEach((m) => mats.add(m)); geos.add(o.geometry); } });
  const P = r && r._pipelines;
  return { scene: scene0, waitMs: opts.waitMs, firstOpenMs: Math.round(t1 - t0), rebuiltAt, long: H.longIn(t0, t1),
    rebuild3D: ms("rebuild3D"), syncItems: ms("syncItems"), meshes: H.countMeshes(scene), itemMeshes: H.countMeshes(H.findRoot(scene, "furniture")),
    materials: mats.size, geometries: geos.size, pipelines: P ? P.caches.size : null,
    shaderModules: window.__compile ? window.__compile.modules : null, salted: !!window.__salt };
}
