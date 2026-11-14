/* Counters for tools/perf_planner.mjs, injected as the browser fetches the
   module — no source file is edited (the same rule as tools/perf_harness.mjs).

   Each listed function is renamed NAME__p and a wrapper takes its name:
     globalThis.__ppre(name, args)            before the call
     globalThis.__pt(name, t0)                call count + synchronous ms
     globalThis.__pret(name, args, result)    after the call (sync result, or
                                              the resolved value for `async`)
   The hooks are installed by PAGE_PRELUDE (scenarios.mjs) before any module
   runs. `append` is extra module text, used to expose module state the
   scenarios read (sprite cache, vspan queue). */

export const WRAPS = {
  "js/plan_sprites.js": {
    fns: ["itemSprite", "bakeBatch", "drawPrepared"],
    append:
      "globalThis.__spr = { cache, queue, persisted, toPersist, failed, keyFor, isBaking: () => baking, " +
      "pixels: () => pixels };",
  },
  "js/plan2d/items.js": { fns: ["drawItemPresentation"] },
  "js/device_budget.js": { fns: ["noteBakeMs"] },
  "js/plan_sprite_prewarm.js": { fns: ["prewarmPlanSprites", "prewarmOrder"] },
  "js/furniture_api.js": {
    fns: ["baseVSpan"],
    append: "globalThis.__vspan = { cache: vSpanCache, toMeasure };",
  },
  "js/plan2d.js": { fns: ["renderModel", "renderHUD"] },
  "js/mep/clashes.js": { fns: ["mepSignature", "computeMEPClashes", "getMEPState", "drawMEP", "wallPath", "routeResolve"] },
  "js/mep/routing.js": { fns: ["computeMEPStatus", "computeMEPFlow"] },
  "js/mep_route.js": { fns: ["makeRouter"] },
  "js/mep/drawing.js": { fns: ["buildMEP3D"] },
  "js/ui_mep.js": { fns: ["renderPanel"] },
  "js/view3d/items_layers.js": { fns: ["rebuild3D", "itemSig", "syncItems", "rebuildMEP3D"] },
};

/* Rename `function NAME(args) {` (optionally `export`/`async`) and put a
   timing wrapper in its place. Throws when the header is not found exactly
   once, so a refactor breaks the harness loudly instead of measuring nothing. */
export function wrapFunction(src, name, file) {
  const re = new RegExp("^([ \\t]*)(export )?(async )?function " + name + "\\(([^)]*)\\) \\{", "gm");
  const hits = src.match(re) || [];
  if (hits.length !== 1) throw new Error(`perf_planner: ${file}: header of ${name} found ${hits.length} times`);
  return src.replace(re, (_m, indent, exp, asy, args) => {
    const isAsync = !!asy;
    const call = `${name}__p.apply(this, __a)`;
    const wrapper =
      `${indent}${exp || ""}${asy || ""}function ${name}(...__a) {` +
      ` const __g = globalThis; if (__g.__ppre) __g.__ppre(${JSON.stringify(name)}, __a);` +
      ` const __t = performance.now(); let __r;` +
      ` try { __r = ${isAsync ? "await " : ""}${call}; return __r; }` +
      ` finally { if (__g.__pt) __g.__pt(${JSON.stringify(name)}, __t); if (__g.__pret) __g.__pret(${JSON.stringify(name)}, __a, __r); } }\n` +
      `${indent}${asy || ""}function ${name}__p(${args}) {`;
    return wrapper;
  });
}

export function patchSource(file, src) {
  const spec = WRAPS[file];
  if (!spec) return src;
  for (const name of spec.fns) src = wrapFunction(src, name, file);
  if (spec.append) src += "\n;" + spec.append + "\n";
  return src;
}
