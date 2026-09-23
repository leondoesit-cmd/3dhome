// Every catalogue model builds in plain Node (the loader shim points the bare
// three specifiers at the vendored WebGPU build), stays inside its footprint,
// keeps a sane triangle budget, and never hands the same material instance to
// two builds — the 3D view disposes materials per rebuilt group, so a shared
// one would be disposed out from under another piece.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("furniture: every model builds, fits its footprint, and owns its materials", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const three = pathToFileURL(join(root, "vendor/three/three.webgpu.js")).href;
  const tsl = pathToFileURL(join(root, "vendor/three/three.tsl.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three"||s==="three/webgpu")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s==="three/tsl")return{url:${JSON.stringify(tsl)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { loadThree, THREE } from "./js/three_lazy.js";
    await loadThree();
    const { FURN, buildItem } = await import("./js/furniture.js");
    const MAX_TRIS = 20000, MAX_OVERHANG = 15;
    // people are posed and dressed at random on every build (human.js DNA):
    // their reach is not a footprint, so only the other checks apply to them
    const PEOPLE = new Set(["man", "woman", "boy", "girl", "oldman", "oldwoman"]);
    let built = 0;
    for (const type of Object.keys(FURN)) {
      const f = FURN[type];
      if (!f.build) continue;
      const it = { type, w: f.w || 60, d: f.d || 60, h: f.h || 80, x: 0, z: 0, rot: 0 };
      const a = new THREE.Group(), b = new THREE.Group();
      buildItem(a, it);
      buildItem(b, it);
      let tris = 0;
      const mats = new Set();
      a.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        [].concat(o.material).forEach((m) => mats.add(m));
      });
      b.traverse((o) => {
        if (o.isMesh) [].concat(o.material).forEach((m) => assert.ok(!mats.has(m), type + " shares a material between builds"));
      });
      assert.ok(tris <= MAX_TRIS, type + " has " + tris + " triangles");
      const box = new THREE.Box3().setFromObject(a);
      if (box.isEmpty() || PEOPLE.has(type)) continue;
      for (const v of [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z]) assert.ok(Number.isFinite(v), type + " bbox");
      assert.ok(box.max.x - it.w / 2 <= MAX_OVERHANG && -box.min.x - it.w / 2 <= MAX_OVERHANG, type + " overhangs its width");
      assert.ok(box.max.z - it.d / 2 <= MAX_OVERHANG && -box.min.z - it.d / 2 <= MAX_OVERHANG, type + " overhangs its depth");
      built++;
    }
    assert.ok(built > 100, "built " + built);
  `;
  const result = spawnSync(
    process.execPath,
    ["--experimental-loader", loader, "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
