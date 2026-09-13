// Piece-on-piece stacking (js/stack.js): the vertical axis of object snapping.
//
// stack.js measures a host's top from real built geometry (furniture_api), so
// the whole module hangs off `three`. Same loader shim the generator test uses
// to point the bare "three" specifier at the vendored build.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("stacking: attach, carry, turn, re-seat, orphan and heal", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { S } from "./js/state.js";
    import {
      findSupport, attach, detach, hostOf, childrenOf, descendantsOf,
      carryChildren, rotateWith, reseat, orphanChildren, refreshSupport,
      normalizeStacks, topOf, wouldCycle,
    } from "./js/stack.js";

    // a laundry corner: the machine on the floor, the dryer about to go on it
    function fixture() {
      S.snapObj = true;
      S.items = [
        { id: 1, type: "washer", x: 100, z: 100, w: 60, d: 60, h: 85, rot: 0 },
        { id: 2, type: "washer", x: 300, z: 300, w: 60, d: 60, h: 85, rot: 0 },
        { id: 3, type: "box",    x: 300, z: 300, w: 30, d: 30, h: 20, rot: 0 },
      ];
      return { machine: S.items[0], dryer: S.items[1], box: S.items[2] };
    }

    // --- a piece dropped over another lands on its top ---------------------
    {
      const { machine, dryer } = fixture();
      const host = findSupport(dryer, 100, 100);
      assert.equal(host, machine, "the piece under the drop point is the host");
      attach(dryer, host);
      assert.equal(dryer.on, machine.id);
      assert.equal(dryer.elev, topOf(machine), "bottom of the dryer = top of the machine");
      assert.ok(dryer.elev > 50, "a real washing machine is not 5 cm tall");
      assert.equal(hostOf(dryer), machine);
    }

    // --- the test is the CENTRE, so a flush neighbour is not a host --------
    {
      const { machine, dryer } = fixture();
      assert.equal(findSupport(dryer, machine.x + machine.w, machine.z), null,
        "cabinets side by side must not stack — that is the x/z snap's job");
      // and a piece whose top is effectively the floor is never a host
      S.items.push({ id: 4, type: "rug", x: 500, z: 500, w: 200, d: 140, h: 2, rot: 0 });
      assert.equal(findSupport(dryer, 500, 500), null, "a rug is not a host");
    }

    // --- dropping onto a pile lands on the pile, not inside it -------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine);
      dryer.x = machine.x; dryer.z = machine.z;
      assert.equal(findSupport(box, 100, 100), dryer, "highest top wins");
    }

    // --- a piece can never end up standing on itself -----------------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine);
      attach(box, dryer);
      assert.ok(wouldCycle(machine, box));
      assert.equal(findSupport(machine, box.x, box.z), null);
    }

    // --- refreshed references cannot bypass cycle protection --------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine); attach(box, dryer);
      S.items = S.items.map(it => ({ ...it }));
      assert.ok(wouldCycle(machine, S.items[2]), "refreshed parent references still identify their descendants");
      assert.equal(findSupport(machine, box.x, box.z), null);
      assert.equal(findSupport(machine, machine.x, machine.z), null, "a refreshed self is not a support");
      attach(machine, S.items[2]);
      assert.equal(machine.on, undefined, "direct attachment cannot introduce a cycle either");
      S.items[1].on = 3; S.items[2].on = 2;
      assert.ok(wouldCycle(machine, S.items[1]), "an existing corrupt cycle cannot accept a new member");
    }

    // --- moving a host carries its whole stack, exactly once ---------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine); dryer.x = 100; dryer.z = 100;
      attach(box, dryer);     box.x = 100;   box.z = 100;
      machine.x += 50;
      const moved = carryChildren(machine, 50, 0, new Set([machine]));
      assert.deepEqual(moved.map(m => m.id).sort(), [2, 3], "riders move to any depth");
      assert.equal(dryer.x, 150);
      assert.equal(box.x, 150);
      carryChildren(machine, 10, 0, new Set([machine, dryer]));
      assert.equal(dryer.x, 150, "a selection holding host AND rider must not move it twice");
    }

    // --- turning a host orbits its stack -----------------------------------
    {
      const { machine, dryer } = fixture();
      attach(dryer, machine);
      dryer.x = machine.x + 20; dryer.z = machine.z;
      rotateWith(machine, 90, new Set([machine]));
      assert.ok(Math.abs(dryer.x - machine.x) < 1e-9);
      assert.ok(Math.abs(dryer.z - (machine.z + 20)) < 1e-9);
      assert.equal(dryer.rot, 90, "the rider turns with the host, not just around it");
    }

    // --- raising a host raises everything on it, to any depth --------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine);
      attach(box, dryer);
      const before = box.elev;
      machine.h = 150;
      reseat(machine);
      assert.equal(dryer.elev, topOf(machine));
      assert.equal(box.elev, topOf(dryer));
      assert.ok(box.elev > before, "the top of the pile rose with the bottom of it");
    }

    // --- deleting a host drops its riders instead of hanging them ----------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine);
      attach(box, dryer);
      S.items = S.items.filter(i => i !== machine);
      const orphans = orphanChildren(null);
      assert.deepEqual(orphans.map(o => o.id), [2]);
      assert.equal(dryer.on, undefined);
      assert.equal(dryer.elev, undefined);
      assert.equal(hostOf(box), dryer, "a link to a piece that DID survive is untouched");
    }

    // --- a nudge is sticky until the centre actually leaves ----------------
    {
      const { machine, dryer } = fixture();
      attach(dryer, machine);
      dryer.x = machine.x; dryer.z = machine.z;
      dryer.x += 2;
      assert.equal(refreshSupport(dryer), false, "2 cm on the machine is still on the machine");
      assert.equal(dryer.on, machine.id);
      dryer.x += 100;
      assert.equal(refreshSupport(dryer), true);
      assert.equal(dryer.on, undefined);
    }

    // --- a loaded file heals dangling links, cycles and stale heights ------
    {
      fixture();
      S.items[1].on = 999;             // host that did not survive the load
      S.items[2].on = 1;
      S.items[2].elev = 4;             // a height the file claims, the model denies
      S.items[2].x = 100; S.items[2].z = 100;
      normalizeStacks();
      assert.equal(S.items[1].on, undefined, "dangling link dropped");
      assert.equal(S.items[2].on, 1);
      assert.equal(S.items[2].elev, topOf(S.items[0]), "height re-derived, not trusted");

      fixture();
      S.items[0].on = 2;
      S.items[1].on = 1;               // hand-made cycle
      normalizeStacks();
      assert.ok(S.items[0].on === undefined || S.items[1].on === undefined);
    }

    // --- the object-snap toggle governs the vertical axis too --------------
    {
      const { dryer } = fixture();
      S.snapObj = false;
      assert.equal(findSupport(dryer, 100, 100), null);
      S.snapObj = true;
    }

    // --- the stack reads back as built -------------------------------------
    {
      const { machine, dryer, box } = fixture();
      attach(dryer, machine);
      attach(box, dryer);
      assert.deepEqual(childrenOf(machine).map(c => c.id), [2]);
      assert.deepEqual(descendantsOf(machine, new Set(), []).map(c => c.id), [2, 3]);
      detach(dryer);
      assert.deepEqual(childrenOf(machine), []);
    }
  `;
  const result = spawnSync(
    process.execPath,
    ["--experimental-loader", loader, "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
