import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("automatic apartments keep essential furniture, clear openings, and collision-free floor items", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { S } from "./js/state.js";
    import { generateApartment, apartmentGenerateCommand } from "./js/generator.js";
    import { executeCommand } from "./js/commands/executor.js";
    import { detectRooms, pointInPoly, wallGeom } from "./js/geometry.js";

    const overlay = new Set(["rug", "ceilingLight", "pendant", "trackLight", "lightStrip", "art", "mirror", "wallMirror", "ac", "hood", "acDiffuser", "acReturn", "acCassette", "acDucted", "tvWall", "tableLamp", "laptop"]);
    function half(it) {
      const r = ((it.rot || 0) % 180 + 180) % 180;
      return r >= 45 && r < 135 ? [it.d / 2, it.w / 2] : [it.w / 2, it.d / 2];
    }
    function box(it) {
      const h = half(it);
      return { x0: it.x - h[0], x1: it.x + h[0], z0: it.z - h[1], z1: it.z + h[1] };
    }
    function overlaps(a, b) {
      return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
    }
    function audit(size) {
      generateApartment(size, true);
      detectRooms().forEach(room => {
        const name = S.roomMeta[room.key] && S.roomMeta[room.key].name;
        const roomItems = S.items.filter(it => pointInPoly(it.x, it.z, room.pts));
        const types = roomItems.map(it => it.type);
        const required = name === "Living / Kitchen" ? ["sofa", "tv", "fridge", "sink", "cooktop", "table"]
          : name === "Living Room" ? ["sofa", "tv"]
          : name === "Kitchen" ? ["fridge", "sink", "cooktop"]
          : name === "Bedroom" || name === "Master Bedroom" ? ["bed"]
          : name === "Bathroom" ? ["shower", "toilet"] : [];
        required.forEach(type => assert.ok(types.includes(type), name + " is missing " + type));

        const sofa = roomItems.find(it => it.type === "sofa");
        const tv = roomItems.find(it => it.type === "tv");
        if (sofa && tv) {
          const dx = tv.x - sofa.x, dz = tv.z - sofa.z, L = Math.hypot(dx, dz);
          const rad = sofa.rot * Math.PI / 180;
          const sofaFront = [-Math.sin(rad), Math.cos(rad)];
          const tvRad = tv.rot * Math.PI / 180;
          const screenFront = [Math.sin(tvRad), -Math.cos(tvRad)];
          assert.ok((dx / L) * sofaFront[0] + (dz / L) * sofaFront[1] > 0.999, "sofa must point directly at TV");
          assert.ok((-dx / L) * screenFront[0] + (-dz / L) * screenFront[1] > 0.999, "TV screen must face sofa");
          assert.equal(sofa.facesId, tv.id);
          assert.equal(tv.facesId, sofa.id);
        }

        const table = roomItems.find(it => it.type === "table" && it.functionalZone === "dining");
        const diningChairs = roomItems.filter(it => it.type === "chair" && it.facesId === (table && table.id));
        if (name === "Living / Kitchen") assert.ok(diningChairs.length >= 2, "open-plan dining table needs at least two chairs");
        diningChairs.forEach(chair => {
          const dx = table.x - chair.x, dz = table.z - chair.z, L = Math.hypot(dx, dz);
          const rad = chair.rot * Math.PI / 180;
          const front = [-Math.sin(rad), Math.cos(rad)];
          assert.ok((dx / L) * front[0] + (dz / L) * front[1] > 0.999, "every dining chair must face the table");
        });

        const kitchen = roomItems.filter(it => it.functionalZone === "kitchen");
        if (kitchen.length) {
          const fridge = kitchen.find(it => it.type === "fridge");
          const xs = room.pts.map(p => p.x), zs = room.pts.map(p => p.z), H = half(fridge);
          const wallDistance = Math.min(
            Math.abs(fridge.x - H[0] - Math.min(...xs)), Math.abs(Math.max(...xs) - (fridge.x + H[0])),
            Math.abs(fridge.z - H[1] - Math.min(...zs)), Math.abs(Math.max(...zs) - (fridge.z + H[1]))
          );
          assert.ok(wallDistance <= 7, "fridge must be flush with a kitchen wall");
          assert.ok(kitchen.every(it => it.groupId === kitchen[0].groupId), "open-plan kitchen must stay in one continuous group");
        }

        const xs = room.pts.map(p => p.x), zs = room.pts.map(p => p.z);
        const roomBox = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
        roomItems.filter(it => it.type === "art" || it.type === "wallMirror").forEach(decor => {
          const b = box(decor);
          const wallDistance = Math.min(
            Math.abs(b.x0 - roomBox.x0), Math.abs(roomBox.x1 - b.x1),
            Math.abs(b.z0 - roomBox.z0), Math.abs(roomBox.z1 - b.z1)
          );
          assert.ok(decor.mounted && wallDistance <= 7, decor.type + " must be attached to a wall");
        });

        if (name === "Bathroom") {
          const fixtures = roomItems.filter(it => ["shower", "toilet", "vanity", "washer"].includes(it.type));
          fixtures.forEach(fixture => {
            assert.ok(fixture.useZone, fixture.type + " needs a clear approach zone");
            assert.ok(fixture.useZone.x0 >= roomBox.x0 && fixture.useZone.x1 <= roomBox.x1 && fixture.useZone.z0 >= roomBox.z0 && fixture.useZone.z1 <= roomBox.z1,
              fixture.type + " approach zone must remain inside the bathroom");
            fixtures.filter(other => other !== fixture).forEach(other => {
              assert.equal(overlaps(fixture.useZone, box(other)), false, other.type + " blocks the use zone of " + fixture.type);
            });
          });
          const toilet = fixtures.find(it => it.type === "toilet");
          if (toilet) {
            const along = toilet.rot % 180 === 0 ? toilet.x : toilet.z;
            const lo = toilet.rot % 180 === 0 ? roomBox.x0 : roomBox.z0;
            const hi = toilet.rot % 180 === 0 ? roomBox.x1 : roomBox.z1;
            assert.ok(along - lo >= 38 && hi - along >= 38, "toilet centre needs 38cm side clearance");
          }
          assert.equal(fixtures.some(it => it.type === "washer"), false, "bathroom generator must not insert laundry without a dedicated niche");
        }
      });
      S.openings.forEach(opening => {
        const wall = S.walls.find(w => w.id === opening.wall);
        assert.ok(wall, "opening must reference a wall");
        const L = wallGeom(wall).L;
        assert.ok(opening.s - opening.width / 2 >= 0 && opening.s + opening.width / 2 <= L, "opening must fit its wall");
      });
      const floor = S.items.filter(it => !overlay.has(it.type));
      for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
        const a = floor[i], b = floor[j], A = half(a), B = half(b);
        const overlaps = Math.abs(a.x - b.x) < A[0] + B[0] - 0.1 && Math.abs(a.z - b.z) < A[1] + B[1] - 0.1;
        assert.equal(overlaps, false, a.type + " overlaps " + b.type);
      }
    }
    audit("small");
    audit("large");
    for (let i = 0; i < 40; i++) audit("random");

    generateApartment("small", true);
    const old = S.items.map(it => ({ id: it.id, x: it.x, z: it.z, rot: it.rot }));
    generateApartment("small", false);
    old.forEach(before => {
      const after = S.items.find(it => it.id === before.id);
      assert.deepEqual({ id: after.id, x: after.x, z: after.z, rot: after.rot }, before, "append must preserve existing furniture");
    });

    const keys = ["nodes", "walls", "openings", "items", "roomMeta", "idc"];
    const snap = () => structuredClone(Object.fromEntries(keys.map(key => [key, S[key]])));
    const restore = value => keys.forEach(key => { S[key] = structuredClone(value[key]); });
    const beforeFailedGeneration = snap();
    let transactionSnapshot = null, commits = 0;
    const history = {
      current: () => 42,
      begin: () => { transactionSnapshot = snap(); return { id: 42 }; },
      commit: () => { commits += 1; transactionSnapshot = null; },
      abort: () => { restore(transactionSnapshot); transactionSnapshot = null; },
    };
    const failed = executeCommand(apartmentGenerateCommand, {
      size: "large", replace: true, seed: 3,
    }, { domain: "planner", state: S, history, version: { current: () => 42 } }, {
      postValidate: () => ({ ok: false, reason: "TEST_LATE_FAILURE" }),
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "TEST_LATE_FAILURE");
    assert.equal(commits, 0);
    assert.deepEqual(snap(), beforeFailedGeneration, "late generator failure must restore the whole document");
  `;
  const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
