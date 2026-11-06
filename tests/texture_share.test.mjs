// WebGPURenderer uploads one GPU texture per Texture OBJECT, on both of its
// backends: unlike classic WebGLRenderer it does not share the upload between
// clones of one Source. A clone per material therefore costs a full upload per
// mesh. On the generated large apartment that was ~650 copies of 18 library
// images (11 GB), and opening the cabinet designer on the WebGL2 fallback then
// ran the GPU process out of memory and lost every context in the page.
// sharedRepeat() hands out one texture per image and repeat; these tests pin
// that contract and keep the 3D builders from going back to cloning.
import { modelerSource } from "./helpers/modeler_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("sharedRepeat: one texture per image and repeat, never a clone per material", () => {
  const three = pathToFileURL(join(root, "vendor/three/three.webgpu.js")).href;
  const tsl = pathToFileURL(join(root, "vendor/three/three.tsl.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three"||s==="three/webgpu")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s==="three/tsl")return{url:${JSON.stringify(tsl)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { loadThree, THREE } from "./js/three_lazy.js";
    await loadThree();
    const { sharedRepeat } = await import("./js/pbr_material.js");
    const base = new THREE.Texture({ width: 4, height: 4 });
    base.wrapS = base.wrapT = THREE.RepeatWrapping;

    // the repeat the texture already has is the texture itself
    assert.equal(sharedRepeat(base, 1, 1), base);

    // any other repeat: one clone per value, shared by every caller
    const a = sharedRepeat(base, 2.5, 3);
    assert.notEqual(a, base);
    assert.equal(a.source, base.source);
    assert.deepEqual([a.repeat.x, a.repeat.y], [2.5, 3]);
    assert.equal(a.wrapS, THREE.RepeatWrapping);
    assert.equal(sharedRepeat(base, 2.5, 3), a);
    assert.notEqual(sharedRepeat(base, 3, 2.5), a);
    assert.deepEqual([base.repeat.x, base.repeat.y], [1, 1], "the shared image keeps its own repeat");

    // size-driven repeats are remembered as a short most-recent list: a
    // recently used one survives a run of new values, an old one is forgotten
    // (handed out fresh next time) rather than disposed under a live material
    const kept = sharedRepeat(base, 7, 7);
    for (let i = 0; i < 200; i++) {
      sharedRepeat(base, 10 + i, 1);
      if (i % 10 === 0) assert.equal(sharedRepeat(base, 7, 7), kept);
    }
    assert.notEqual(sharedRepeat(base, 2.5, 3), a, "an old repeat falls off the list");
    let disposed = 0;
    a.addEventListener("dispose", () => disposed++);
    for (let i = 0; i < 200; i++) sharedRepeat(base, 500 + i, 1);
    assert.equal(disposed, 0, "a forgotten clone is never disposed by the cache");

    // other images keep their own lists
    const other = new THREE.Texture({ width: 4, height: 4 });
    assert.notEqual(sharedRepeat(other, 7, 7), kept);

    // with owner materials, a clone that fell off the list is freed when its
    // last owner is disposed (a renderer keeps every uploaded texture alive
    // until it is disposed, so forgetting it alone leaked its GPU copy)
    const img = new THREE.Texture({ width: 4, height: 4 });
    const m1 = new THREE.MeshStandardMaterial(), m2 = new THREE.MeshStandardMaterial();
    const c = sharedRepeat(img, 3, 3, m1);
    assert.equal(sharedRepeat(img, 3, 3, m2), c);
    let freed = 0;
    c.addEventListener("dispose", () => freed++);
    for (let i = 0; i < 60; i++) sharedRepeat(img, 100 + i, 1, new THREE.MeshStandardMaterial());
    assert.equal(freed, 0, "off the list but still held by two materials");
    m1.dispose();
    assert.equal(freed, 0, "still held by one material");
    m2.dispose();
    assert.equal(freed, 1, "freed with its last owner");
    // a clone whose owners are gone stays cached while on the list, and is
    // freed when it falls off
    const lone = new THREE.MeshStandardMaterial(), d = sharedRepeat(img, 9, 9, lone);
    let dFreed = 0;
    d.addEventListener("dispose", () => dFreed++);
    lone.dispose();
    assert.equal(dFreed, 0, "kept while it is still a recent repeat");
    assert.equal(sharedRepeat(img, 9, 9, new THREE.MeshStandardMaterial()), d, "and reused");
    for (let i = 0; i < 60; i++) sharedRepeat(img, 300 + i, 1, new THREE.MeshStandardMaterial());
    assert.equal(dFreed, 0, "the reuse's owner still holds it");
    const gone = new THREE.MeshStandardMaterial(), e = sharedRepeat(img, 11, 11, gone);
    let eFreed = 0;
    e.addEventListener("dispose", () => eFreed++);
    gone.dispose();
    for (let i = 0; i < 60; i++) sharedRepeat(img, 600 + i, 1, new THREE.MeshStandardMaterial());
    assert.equal(eFreed, 1, "a clone nobody holds is freed as it falls off the list");

    // a material clone copies the maps, and counts as their owner too: the
    // original's disposal does not free a map its clone still draws, and the
    // clone's disposal releases its share
    const orig = new THREE.MeshStandardMaterial();
    const f = sharedRepeat(img, 13, 13, orig);
    orig.normalMap = f; // the same texture in two slots counts once
    let fFreed = 0;
    f.addEventListener("dispose", () => fFreed++);
    const twin = orig.clone();
    for (let i = 0; i < 60; i++) sharedRepeat(img, 900 + i, 1, new THREE.MeshStandardMaterial());
    orig.dispose();
    assert.equal(fFreed, 0, "the clone still holds it");
    twin.dispose();
    assert.equal(fFreed, 1, "freed with the clone, its last holder");

    // everything handed out is marked shared; a private texture is not
    const { isSharedTexture } = await import("./js/pbr_material.js");
    assert.ok(isSharedTexture(c) && isSharedTexture(img) && isSharedTexture(base));
    assert.ok(!isSharedTexture(new THREE.Texture()));
  `;
  const result = spawnSync(
    process.execPath,
    ["--experimental-loader", loader, "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the vertical-span probe disposes the piece it builds, releasing its texture shares", () => {
  // baseVSpan builds a piece only to measure it. Left undisposed, its
  // materials stayed counted owners of their texture repeats, so a repeat
  // that fell off the recent list was never freed (nor its GPU copy).
  const three = pathToFileURL(join(root, "vendor/three/three.webgpu.js")).href;
  const tsl = pathToFileURL(join(root, "vendor/three/three.tsl.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three"||s==="three/webgpu")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s==="three/tsl")return{url:${JSON.stringify(tsl)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { loadThree, THREE } from "./js/three_lazy.js";
    await loadThree();
    const { sharedRepeat } = await import("./js/pbr_material.js");
    const { FURN } = await import("./js/furniture_models.js");
    const { itemVSpan, clearVSpanCache } = await import("./js/furniture_api.js");
    const img = new THREE.Texture({ width: 4, height: 4 });
    const probeMaterials = [];
    FURN.__probe_test = {
      w: 50, d: 50, h: 80,
      build(g) {
        const m = new THREE.MeshStandardMaterial();
        m.map = sharedRepeat(img, 2, 2, m);
        probeMaterials.push(m);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(50, 80, 50), m));
      },
    };
    const { isSharedTexture } = await import("./js/pbr_material.js");
    let probeDisposed = 0;
    const realDispose = THREE.Material.prototype.dispose;
    THREE.Material.prototype.dispose = function () { if (probeMaterials.includes(this)) probeDisposed++; return realDispose.apply(this, arguments); };
    clearVSpanCache();
    const span = itemVSpan({ type: "__probe_test", w: 50, d: 50, h: 80 });
    THREE.Material.prototype.dispose = realDispose;
    assert.ok(span.hi > span.lo, "it measured the piece");
    assert.equal(probeMaterials.length, 1);
    assert.equal(probeDisposed, 1, "the probe's material was disposed");
    assert.ok(isSharedTexture(probeMaterials[0].map), "the probe used the shared repeat");
    // the probe released its share: with the one rendered owner gone, the
    // repeat is freed as it falls off the recent list
    const shown = new THREE.MeshStandardMaterial();
    const c = sharedRepeat(img, 2, 2, shown);
    let freed = 0;
    c.addEventListener("dispose", () => freed++);
    shown.dispose();
    for (let i = 0; i < 60; i++) sharedRepeat(img, 100 + i, 1, new THREE.MeshStandardMaterial());
    assert.equal(freed, 1, "freed: the probe no longer holds it");
    delete FURN.__probe_test;
  `;
  const result = spawnSync(
    process.execPath,
    ["--experimental-loader", loader, "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("3D builders share cached textures instead of cloning them per material", () => {
  // Each of these used to take `<cache>[url].clone()` (or clone the library
  // maps) for every part it textured.
  const sources = {
    "js/pbr_material.js": readFileSync(join(root, "js/pbr_material.js"), "utf8"),
    "js/primitives.js": readFileSync(join(root, "js/primitives.js"), "utf8"),
    "js/modeler.js": modelerSource(),
    "js/view3d.js": moduleSource("js/view3d.js"),
  };
  for (const [file, src] of Object.entries(sources)) {
    assert.doesNotMatch(src, /custom(?:Tex|Bump)Cache\[[^\]]+\]\.clone\(\)/, file + " clones a cached texture per material");
  }
  const apply = sources["js/pbr_material.js"].match(/export function applyPbrMaps[\s\S]*?\n}\n/);
  assert.ok(apply, "applyPbrMaps exists");
  assert.doesNotMatch(apply[0], /\.clone\(\)/, "applyPbrMaps clones the library maps per material");
  assert.match(apply[0], /mat\.map = (?:repeated|sharedRepeat)\(/);
});
