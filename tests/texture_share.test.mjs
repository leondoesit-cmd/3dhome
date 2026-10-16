// WebGPURenderer uploads one GPU texture per Texture OBJECT, on both of its
// backends: unlike classic WebGLRenderer it does not share the upload between
// clones of one Source. A clone per material therefore costs a full upload per
// mesh. On the generated large apartment that was ~650 copies of 18 library
// images (11 GB), and opening the cabinet designer on the WebGL2 fallback then
// ran the GPU process out of memory and lost every context in the page.
// sharedRepeat() hands out one texture per image and repeat; these tests pin
// that contract and keep the 3D builders from going back to cloning.
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
    "js/modeler.js": readFileSync(join(root, "js/modeler.js"), "utf8"),
    "js/view3d.js": readFileSync(join(root, "js/view3d.js"), "utf8"),
  };
  for (const [file, src] of Object.entries(sources)) {
    assert.doesNotMatch(src, /custom(?:Tex|Bump)Cache\[[^\]]+\]\.clone\(\)/, file + " clones a cached texture per material");
  }
  const apply = sources["js/pbr_material.js"].match(/export function applyPbrMaps[\s\S]*?\n}\n/);
  assert.ok(apply, "applyPbrMaps exists");
  assert.doesNotMatch(apply[0], /\.clone\(\)/, "applyPbrMaps clones the library maps per material");
  assert.match(apply[0], /mat\.map = (?:repeated|sharedRepeat)\(/);
});
