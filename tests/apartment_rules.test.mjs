// The apartment rulebook (js/apartment_rules.js): every generated apartment
// must come out with zero rule errors, and the audit must actually catch the
// mistakes it claims to — a checker that never fires proves nothing.
import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;

function run(script) {
  const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const prelude = String.raw`
  import assert from "node:assert/strict";
  import { S } from "./js/state.js";
  import { apartmentGenerateCommand } from "./js/generator.js";
  import { executeCommand } from "./js/commands/executor.js";
  import { auditApartment } from "./js/apartment_rules.js";
  function generate(size, seed) {
    const result = executeCommand(apartmentGenerateCommand, { size, replace: true, replaceInfrastructure: true, infrastructure: false, seed },
      { domain: "planner", state: S }, { history: false });
    assert.ok(result.ok, size + "/" + seed + " failed to generate: " + result.reason);
  }
  const errorsOf = audit => audit.violations.filter(v => v.severity === "error");
`;

test("every generated apartment passes the rulebook with zero errors", () => {
  run(prelude + String.raw`
    const runs = [["small", 1], ["large", 1], ["showcase", 1]];
    for (let i = 1; i <= 40; i++) runs.push(["random", i * 7919]);
    for (const [size, seed] of runs) {
      generate(size, seed);
      const errors = errorsOf(auditApartment(S));
      assert.deepEqual(errors.map(v => v.rule + ": " + v.message), [], size + "/" + seed + " breaks apartment rules");
    }
  `);
});

test("generated furniture keeps its back on the wall and its composition rules", () => {
  run(prelude + String.raw`
    import { detectRooms, pointInPoly } from "./js/geometry.js";
    import { itemBox, frontVector } from "./js/apartment_rules.js";
    for (const seed of [7919, 15838, 23757, 31676, 39595]) {
      generate("random", seed);
      const warnings = auditApartment(S).violations.filter(v => ["against-wall", "tv-sightline", "nightstand", "coffee-table", "lighting"].includes(v.rule));
      assert.deepEqual(warnings.map(v => v.message), [], "random/" + seed);
      // bedside lamps stand on nightstands, desk lamps on desks
      S.items.filter(it => it.type === "tableLamp").forEach(lamp => {
        const support = S.items.find(it => it.id === lamp.supportId);
        assert.ok(support && ["nightstand", "desk"].includes(support.type), "a table lamp needs a table");
      });
      // every bedroom with a bed has at least one bedside lamp
      detectRooms().forEach(room => {
        const here = S.items.filter(it => pointInPoly(it.x, it.z, room.pts));
        if (here.some(it => it.type === "bed")) assert.ok(here.some(it => it.type === "tableLamp"), "bed without a bedside lamp");
      });
    }
  `);
});

test("the audit catches broken plans", () => {
  run(prelude + String.raw`
    import { detectRooms, pointInPoly } from "./js/geometry.js";
    const rules = () => new Set(errorsOf(auditApartment(S)).map(v => v.rule));

    // the large layout has a living room with sofa, TV and a dining table
    generate("large", 1);
    assert.equal(errorsOf(auditApartment(S)).length, 0);
    const sofa = S.items.find(it => it.type === "sofa"), tv = S.items.find(it => it.type === "tv");
    const table = S.items.find(it => it.type === "table" && it.functionalZone === "dining");
    const saved = { x: table.x, z: table.z };
    const chairs = S.items.filter(it => it.type === "chair" && it.facesId === table.id);
    S.items = S.items.filter(it => !chairs.includes(it));
    table.x = (sofa.x + tv.x) / 2; table.z = (sofa.z + tv.z) / 2;
    assert.ok(rules().has("tv-sightline"), "a table between sofa and TV must be reported");
    assert.ok(rules().has("dining"), "a table without chairs must be reported");
    Object.assign(table, saved);
    S.items.push(...chairs);

    // nightstand halfway down the bed
    const bed = S.items.find(it => it.type === "bed");
    const stand = S.items.find(it => it.type === "nightstand");
    const before = { x: stand.x, z: stand.z };
    const front = { x: -Math.sin(bed.rot * Math.PI / 180), z: Math.cos(bed.rot * Math.PI / 180) };
    stand.x += front.x * 70; stand.z += front.z * 70;
    assert.ok(rules().has("nightstand"), "a nightstand away from the headboard must be reported");
    Object.assign(stand, before);

    // a wardrobe dropped onto the bed
    const wardrobe = S.items.find(it => it.type === "wardrobe");
    const kept = { x: wardrobe.x, z: wardrobe.z };
    wardrobe.x = bed.x; wardrobe.z = bed.z;
    assert.ok(rules().has("overlap"));
    Object.assign(wardrobe, kept);

    // a bedroom without its ceiling light (bedside lamps are not general light)
    const bedroom = detectRooms().find(room => pointInPoly(bed.x, bed.z, room.pts));
    const light = S.items.find(it => it.type === "ceilingLight" && pointInPoly(it.x, it.z, bedroom.pts));
    S.items = S.items.filter(it => it !== light);
    assert.ok(rules().has("lighting"));
    S.items.push(light);

    // reachability: an apartment with only passages and no doors
    const openings = S.openings.slice();
    S.openings = S.openings.filter(o => o.type !== "door");
    assert.ok(rules().has("reachable") || rules().has("entrance"));
    S.openings = openings;

    // a habitable room without a window
    S.openings = S.openings.filter(o => o.type !== "window");
    assert.ok(rules().has("daylight"));
    S.openings = openings;
    assert.equal(errorsOf(auditApartment(S)).length, 0, "restored plan is clean again");
  `);
});

test("the 3D view keeps lamps in their own room and lets daylight in through the glass", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = moduleSource("js/view3d.js");
  const rebuild = sourceFunctionText(src, "rebuild3D");
  assert.match(rebuild, /syncItems\(hid\);\s*fitPracticalLights\(\);/, "practical ranges are fitted after every rebuild");
  const env = sourceFunctionText(src, "applyEnv");
  assert.match(env, /fitPracticalLights\(\)/, "a change of hour re-fits practical shadows");
  assert.match(env, /scene\.environmentIntensity =/, "the sky map is fill, balanced under the sun");
  assert.match(rebuild, /takeLight\("SpotLight", 0xcfe2f2/, "window daylight is aimed into its room");
  assert.match(src, /var d = o\.userData\.throwCm \|\| o\.distance/, "path-tracer power ignores the room clip");
});
