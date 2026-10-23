// js/gpu.js retainShaderCaches: a shader three releases stays a cache hit
// until `cap` newer ones have been released, so the planner's dusk and dawn
// shadow handoffs stop rebuilding every material each time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { retainShaderCaches } from "../js/gpu.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const three = (await readFile(join(root, "vendor/three/three.webgpu.js"), "utf8")).replace(/\r\n/g, "\n");
const UPGRADE = "three changed under js/gpu.js retainShaderCaches — re-verify the patch against this version";

/* The release paths of three's NodeManager and Pipelines, as r185 has them. */
function fakeRenderer() {
  const freed = [];
  const nodes = {
    nodeBuilderCache: new Map(),
    get(key) { const s = this.nodeBuilderCache.get(key); if (s) s.usedTimes++; return s; },
    release(key) { const s = this.nodeBuilderCache.get(key); s.usedTimes--; if (s.usedTimes === 0) this.nodeBuilderCache.delete(key); },
  };
  const pipes = {
    caches: new Map(),
    programs: { vertex: new Map(), fragment: new Map(), compute: new Map() },
    _releasePipeline(p) { this.caches.delete(p.cacheKey); freed.push(p); },
    _releaseProgram(p) { this.programs[p.stage].delete(p.code); freed.push(p); },
    release(p) {
      p.usedTimes--; if (p.usedTimes === 0) this._releasePipeline(p);
      p.vertexProgram.usedTimes--; if (p.vertexProgram.usedTimes === 0) this._releaseProgram(p.vertexProgram);
    },
  };
  return { _nodes: nodes, _pipelines: pipes, freed };
}
const state = (r, key) => { const s = { usedTimes: 1 }; r._nodes.nodeBuilderCache.set(key, s); return s; };
function pipeline(r, key) {
  const vertexProgram = { stage: "vertex", code: "v" + key, usedTimes: 1 };
  const p = { cacheKey: key, usedTimes: 1, vertexProgram };
  r._pipelines.caches.set(key, p);
  r._pipelines.programs.vertex.set(vertexProgram.code, vertexProgram);
  return p;
}

test("a released shader state is still a cache hit", () => {
  const r = fakeRenderer();
  assert.equal(retainShaderCaches(r, 8), true);
  const s = state(r, "day");
  r._nodes.release("day");
  assert.equal(r._nodes.get("day"), s);
  assert.equal(s.usedTimes, 1);
});

test("only the least recently released beyond the cap are freed", () => {
  const r = fakeRenderer();
  retainShaderCaches(r, 2);
  for (const k of ["a", "b", "c"]) { state(r, k); r._nodes.release(k); }
  assert.deepEqual([...r._nodes.nodeBuilderCache.keys()], ["b", "c"]);
});

test("an entry back in use is not freed when it ages out", () => {
  const r = fakeRenderer();
  retainShaderCaches(r, 1);
  state(r, "day"); r._nodes.release("day");
  r._nodes.get("day"); // the morning: in use again
  state(r, "night"); r._nodes.release("night");
  assert.ok(r._nodes.nodeBuilderCache.has("day"));
  assert.ok(r._nodes.nodeBuilderCache.has("night"));
});

test("pipelines and programs are retired the same way", () => {
  const r = fakeRenderer();
  retainShaderCaches(r, 2);
  const day = pipeline(r, "day");
  r._pipelines.release(day);
  assert.equal(r._pipelines.caches.get("day"), day);
  assert.equal(r._pipelines.programs.vertex.get("vday"), day.vertexProgram);
  assert.deepEqual(r.freed, []);
  r._pipelines.release(pipeline(r, "night"));
  // four retired entries, cap 2: the day pipeline and its program go
  assert.deepEqual(r.freed, [day, day.vertexProgram]);
  assert.ok(!r._pipelines.caches.has("day"));
  assert.ok(r._pipelines.caches.has("night"));
});

test("a three without these internals is left alone", () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(retainShaderCaches({ _nodes: {}, _pipelines: {} }), false);
    assert.equal(retainShaderCaches(null), false);
  } finally {
    console.warn = warn;
  }
});

function classBody(name) {
  const i = three.indexOf("\nclass " + name + " ");
  assert.ok(i >= 0, UPGRADE + " (class " + name + " is gone)");
  const j = three.indexOf("\nclass ", i + 1);
  return three.slice(i, j < 0 ? undefined : j);
}

test("three still frees a node-builder state through nodeBuilderCache.delete", () => {
  const body = classBody("NodeManager");
  assert.match(body, /if \( nodeBuilderState\.usedTimes === 0 \) \{\s*this\.nodeBuilderCache\.delete\( this\.getForRenderCacheKey\( object \) \);/, UPGRADE);
  assert.match(body, /nodeBuilderState = nodeBuilderCache\.get\( cacheKey \);/, UPGRADE);
});

test("three still frees pipelines and programs through _releasePipeline / _releaseProgram", () => {
  const body = classBody("Pipelines");
  assert.match(body, /_releasePipeline\( pipeline \) \{\s*this\.caches\.delete\( pipeline\.cacheKey \);\s*\}/, UPGRADE);
  assert.match(body, /_releaseProgram\( program \) \{\s*const code = program\.code;\s*const stage = program\.stage;\s*this\.programs\[ stage \]\.delete\( code \);/, UPGRADE);
  assert.match(body, /let pipeline = this\.caches\.get\( cacheKey \);/, UPGRADE);
  assert.match(body, /let stageVertex = this\.programs\.vertex\.get\( nodeBuilderState\.vertexShader \);/, UPGRADE);
});

test("the planner renderer retains its shaders once the backend is up", async () => {
  const view3d = (await readFile(join(root, "js/view3d.js"), "utf8")).replace(/\r\n/g, "\n");
  assert.match(view3d, /renderer\.init\(\)\.then\(function \(\) \{[^]*?retainShaderCaches\(renderer\);/);
});
