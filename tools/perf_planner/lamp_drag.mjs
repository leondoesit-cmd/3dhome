/* Browser-side expression for node tools/perf_planner.mjs --eval=tools/perf_planner/lamp_drag.mjs
   Add --capture=drop.txt to save the settled pane. Repeat with --full-drop
   --capture=full.txt for the full-scene rebuild at the same pose, then
   compare with --compare=full.txt,drop.txt. */
(async () => {
  const H = window.__H, S = H.st.S;
  await H.setupScene(1);
  if (S.mep) S.mep.show = S.mep.show3D = false;
  window.__setViewMode("3d");
  S.dirty3D = true;
  const v = await H.view3dReady();
  const { THREE } = await import("/js/three_lazy.js");
  const { detectRooms, pointInPoly } = await import("/js/geometry.js");
  const orbit = { theta: 0.8, phi: 0.9, radius: 1200 };
  v.setOrbitCamera(orbit);
  await H.sleep(10000);
  const renderer = v.getRenderer(), backend = renderer.backend;
  if (!renderer.initialized || !backend.isWebGPUBackend || !v.usePost) throw new Error("Expected initialized WebGPU and the planner post chain");
  const canvas = renderer.domElement, camera = v.getMainCamera(), rect = canvas.getBoundingClientRect();
  const type = window.__dragItemType || "floorLamp", scene = v.getMainScene();
  const dragged = S.items.find(item => item.type === type);
  if (!dragged) throw new Error("Generated apartment has no " + type);
  const rooms = detectRooms(), roomAt = p => rooms.findIndex(room => pointInPoly(p.x, p.z, room.pts));
  // Never annotate the model for telemetry: extra own fields change itemSig.
  const start = { x: dragged.x, z: dragged.z }, from = roomAt(start);
  const target = rooms.map((room, index) => ({
    index, area: room.area, x: room.pts.reduce((n, p) => n + p.x, 0) / room.pts.length,
    z: room.pts.reduce((n, p) => n + p.z, 0) / room.pts.length,
  })).filter(room => room.index !== from && roomAt(room) === room.index).sort((a, b) => b.area - a.area)[0];
  if (!target) throw new Error("No cross-room drag destination");
  function pointer(type, x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
      button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: rect.left + (1 + p.x) * rect.width / 2, clientY: rect.top + (1 - p.y) * rect.height / 2,
    }));
  }
  function snapshot() {
    const meshes = new Set(), materials = new Set(), lights = new Map();
    scene.traverse(object => {
      if (object.isMesh) {
        meshes.add(object);
        for (const m of [].concat(object.material)) materials.add(m);
      }
      if (object.isLight) lights.set(object, [object.castShadow, object.visible, object.shadow?.map]);
    });
    const ln = v.lightLoop.lighting.getNode(scene), rig = v.itemCache.get(dragged.id)?.g.fixture;
    return { meshes, materials, lights, lightKey: ln.customCacheKey(),
      post: [v.post, v.prewarmPass, v.aoPass, v.traaPass, v.post.outputNode, v.post._quadMesh.material.fragmentNode],
      exposure: renderer.toneMappingExposure,
      lightUniforms: [ln._loopNode?.count, ln._loopNode?.lightsArray, v.roomBounce, v.velUniforms],
      shade: (rig?.surfaces || []).map(s => s.material), itemGroup: v.itemCache.get(dragged.id)?.g };
  }
  function changes(a, b) {
    const changed = (prev, next) => prev.length === next.length && prev.every((v, i) => v === next[i]) ? 0 : 1;
    const added = (prev, next) => [...next].filter(value => !prev.has(value)).length;
    const retained = [...a.lights.keys()].filter(light => b.lights.has(light));
    return { newMeshes: added(a.meshes, b.meshes), newMaterials: added(a.materials, b.materials),
      lightSetAdded: added(a.lights, b.lights.keys()), lightSetRemoved: added(b.lights, a.lights.keys()),
      traversalOrderChanged: changed([...a.lights.keys()], [...b.lights.keys()]),
      castShadowChanges: retained.filter(l => a.lights.get(l)[0] !== b.lights.get(l)[0]).length,
      visibleChanges: retained.filter(l => a.lights.get(l)[1] !== b.lights.get(l)[1]).length,
      shadowMapChanges: retained.filter(l => a.lights.get(l)[2] !== b.lights.get(l)[2]).length,
      lightCacheKey: [a.lightKey, b.lightKey], postChainChanged: changed(a.post, b.post), exposureChange: b.exposure - a.exposure,
      lightUniformsChanged: changed(a.lightUniforms, b.lightUniforms), shadeMaterialsChanged: changed(a.shade, b.shade),
      itemGroupChanged: Number(a.itemGroup !== b.itemGroup) };
  }
  function section() {
    return { resizes: 0, renderObjects: 0, builders: 0, builds: {}, otherWebGPUBuilders: 0, otherWebGPUBuilds: {}, lightKeyChanges: 0,
      shadowUpdatesByLight: {}, shadowUpdatesByType: {}, textureUploadsBySize: {}, roomAtlasBytes: 0, gaps: [], renderFrames: [] };
  }
  const drag = section(), drop = section(), undo = [];
  let sectionNow = drag, ticking = true, lastFrame, upTime;
  let renderFrame, parentRender;
  function beginRenderFrame(action) {
    renderFrame = { action, calls: { shadow: 0, scene: 0, other: 0 },
      cpuMs: { shadow: 0, scene: 0, other: 0 }, shadowUpdatesByType: {} };
  }
  function finishRenderFrame() {
    const cpu = renderFrame.cpuMs;
    renderFrame.renderCpuMs = +(cpu.shadow + cpu.scene + cpu.other).toFixed(3);
    for (const pass of Object.keys(cpu)) cpu[pass] = +cpu[pass].toFixed(3);
    sectionNow.renderFrames.push(renderFrame);
    renderFrame = null;
  }
  const increment = (bins, key) => { bins[key] = (bins[key] || 0) + 1; };
  function wrap(obj, name, makeWrapper) {
    const orig = obj[name], own = Object.hasOwn(obj, name);
    obj[name] = makeWrapper(orig);
    undo.push(() => { if (own) obj[name] = orig; else delete obj[name]; });
  }
  const before = snapshot(), deviceCounts = () => ({ ...backend.device.__pc });
  let lastLightKey = before.lightKey;
  try {
    wrap(renderer, "render", orig => function (object, camera) {
      if (!renderFrame) return orig.apply(this, arguments);
      const pass = object?.overrideMaterial?.isShadowPassMaterial ? "shadow" : object === scene ? "scene" : "other";
      renderFrame.calls[pass]++;
      const parent = parentRender, call = { nestedMs: 0 };
      parentRender = call;
      const startTime = performance.now();
      try {
        return orig.apply(this, arguments);
      } finally {
        const duration = performance.now() - startTime;
        // A post pass can contain a scene draw, which can contain six cube
        // face draws. Charge each interval to its innermost renderer.render.
        renderFrame.cpuMs[pass] += duration - call.nestedMs;
        if (parent) parent.nestedMs += duration;
        parentRender = parent;
      }
    });
    wrap(renderer, "setSize", orig => function (...args) {
      sectionNow.resizes++;
      return orig.apply(this, args);
    });
    wrap(renderer._objects, "createRenderObject", orig => function (...args) {
      sectionNow.renderObjects++;
      return orig.apply(this, args);
    });
    // The inspector and sprite baker can draw in this window too. Keep their
    // WGSL builds visible even if a release leaves the main scene untouched.
    wrap(Object.getPrototypeOf(backend), "createNodeBuilder", orig => function (...args) {
      const main = this === backend;
      if (main) sectionNow.builders++;
      else sectionNow.otherWebGPUBuilders++;
      const builder = orig.apply(this, args);
      for (const name of ["build", "buildAsync"]) {
        const run = builder[name];
        builder[name] = function (...args) {
          const m = this.material;
          increment(main ? sectionNow.builds : sectionNow.otherWebGPUBuilds, m?.isShadowPassMaterial ? "shadow" : m?.type || "compute");
          return run.apply(this, args);
        };
      }
      return builder;
    });
    wrap(THREE.ShadowNode.prototype, "updateShadow", orig => function (frame) {
      if (frame.renderer === renderer) {
        const light = this.light, type = light.isPointLight ? "point" : light.isSpotLight ? "spot" : light.isDirectionalLight ? "directional" : light.type;
        increment(sectionNow.shadowUpdatesByLight, light.id);
        increment(sectionNow.shadowUpdatesByType, type);
        if (renderFrame) increment(renderFrame.shadowUpdatesByType, type);
      }
      return orig.call(this, frame);
    });
    let writingRoomAtlas = false;
    wrap(backend.device.queue, "writeTexture", orig => function (target, data) {
      if (writingRoomAtlas) sectionNow.roomAtlasBytes += data.byteLength;
      return orig.apply(this, arguments);
    });
    wrap(backend, "updateTexture", orig => function (texture, options) {
      const img = texture.image;
      increment(sectionNow.textureUploadsBySize, (img?.width || 0) + "x" + (img?.height || 0));
      writingRoomAtlas = !!texture.plannerRoomAtlas;
      try { return orig.call(this, texture, options); }
      finally { writingRoomAtlas = false; }
    });
    const startDevice = deviceCounts();
    lastFrame = await H.raf();
    const t0 = performance.now();
    requestAnimationFrame(function tick(t) {
      if (!ticking) return;
      if (lastFrame !== undefined) sectionNow.gaps.push(t - lastFrame);
      lastFrame = t;
      const lightKey = v.lightLoop.lighting.getNode(scene).customCacheKey();
      if (lastLightKey !== lightKey) sectionNow.lightKeyChanges++;
      lastLightKey = lightKey;
      requestAnimationFrame(tick);
    });
    window.__ppReset();
    beginRenderFrame("grab");
    pointer("pointerdown", start.x, 40, start.z);
    if (S.sel?.ref !== dragged || S.action !== "item") throw new Error("The 3D pointer did not grab " + type);
    let lastMoveFrame = await H.raf();
    finishRenderFrame();
    for (let i = 1; i <= 30; i++) {
      const k = i / 30;
      beginRenderFrame("move");
      pointer("pointermove", start.x + (target.x - start.x) * k, 0, start.z + (target.z - start.z) * k);
      const drawn = await H.raf();
      renderFrame.frameMs = drawn - lastMoveFrame;
      lastMoveFrame = drawn;
      finishRenderFrame();
    }
    drag.app = window.__ppSnap();
    drag.moveFrameMs = H.stats(drag.renderFrames.filter(f => f.action === "move").map(f => f.frameMs));
    const beforeDrop = snapshot();
    const upDevice = deviceCounts();
    sectionNow = drop;
    beginRenderFrame("release");
    requestAnimationFrame(function dropFrame() {
      if (!ticking) return;
      finishRenderFrame();
      beginRenderFrame("settle");
      requestAnimationFrame(dropFrame);
    });
    window.__ppReset();
    upTime = performance.now();
    pointer("pointerup", target.x, 0, target.z);
    if (window.__fullDropReference) S.dirty3D = true;
    const upSyncMs = performance.now() - upTime;
    await H.sleep(3000);
    ticking = false;
    if (Object.values(renderFrame.calls).some(n => n > 0)) finishRenderFrame();
    const endTime = performance.now();
    drop.app = window.__ppSnap();
    const endDevice = deviceCounts(), after = snapshot();
    const deltas = (a, b) => Object.fromEntries(Object.keys(b).map(k => [k, b[k] - (a[k] || 0)]));
    drag.gpuCreates = deltas(startDevice, upDevice); drop.gpuCreates = deltas(upDevice, endDevice);
    for (const phase of [drag, drop]) {
      phase.frameMs = H.stats(phase.gaps);
      phase.framesOver50ms = phase.gaps.filter(n => n > 50).length;
      // Keep the grab in the trace but summarize the requested 30 moves.
      const frames = phase.renderFrames.filter(f => f.action !== "grab");
      phase.peakShadowFacesPerFrame = frames.reduce((peak, f) => Math.max(peak, f.calls.shadow), 0);
      phase.renderCpuMsPerFrame = H.stats(frames.map(f => f.renderCpuMs));
      delete phase.gaps;
    }
    const end = { x: dragged.x, z: dragged.z }, endRoom = roomAt(end), clip = canvas.getBoundingClientRect();
    return { itemType: type, validCrossRoomDrop: endRoom >= 0 && from >= 0 && endRoom !== from && S.action == null && v.usePost,
      usePostAfterDrop: v.usePost,
      start, end, from, targetRoom: target.index, endRoom, orbit, dragMs: upTime - t0, upSyncMs,
      longTasks: window.__long.filter(e => e.t >= t0 && e.t <= endTime).map(e => ({ msFromRelease: e.t - upTime, durationMs: e.d })),
      fullDropReference: !!window.__fullDropReference, drag, drop,
      identitiesDuringDrag: changes(before, beforeDrop), identitiesAfterRelease: changes(beforeDrop, after),
      captureClip: { x: clip.left + window.scrollX, y: clip.top + window.scrollY, width: clip.width, height: clip.height, scale: 1 } };
  } finally {
    ticking = false;
    for (const restore of undo.reverse()) restore();
  }
})()
