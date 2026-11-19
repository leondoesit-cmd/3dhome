import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { createHistory } from "../js/edit_history.js";
import { configureFloorIO } from "../js/floors.js";
import { normalizeSlabOpenings, stairVoidFields } from "../js/slab_openings.js";
import {
  cutStairVoidAbove, removeStairVoids, findStairsForVoid, designNewStairs, applyStairVariant, riseToFloorAbove,
} from "../js/stair_floors.js";
import { voidDisplayName } from "../js/stair_strings.js";
import { stairLayout } from "../js/stair_layout.js";
import { planForCodeCheck } from "../js/code_check_plan.js";
import { checkCode } from "../js/code_check.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const stairs = { id: 7, type: "stairs", x: 100, z: 150, w: 100, d: 250, h: 300, rot: 0 };

// the same interning as history.js: stored scenes pooled by identity
function setup(upper) {
  S.items = [clone(stairs)];
  S.slabOpenings = [];
  S.workspace = { activeFloor: "ground", floors: [
    { id: "ground", name: "Ground", elevation: 0, scene: {} },
    { id: "upper", name: "Upper", elevation: 300, scene: upper || { slabOpenings: [] } },
  ] };
  configureFloorIO({ sceneObject: () => ({ items: S.items, slabOpenings: S.slabOpenings }), applyData: () => true });
  const tokens = new WeakMap(), pool = new Map();
  return createHistory({
    get() {
      return JSON.stringify({ items: S.items, slabOpenings: S.slabOpenings, ws: { ...S.workspace, floors: S.workspace.floors.map((f) => {
        if (f.id === S.workspace.activeFloor) return { ...f, scene: null };
        let token = tokens.get(f.scene);
        if (!token) { token = "@floor:" + pool.size; tokens.set(f.scene, token); pool.set(token, f.scene); }
        return { ...f, scene: token };
      }) } });
    },
    set(snapshot) {
      const s = JSON.parse(snapshot);
      S.items = s.items;
      S.slabOpenings = s.slabOpenings;
      S.workspace = s.ws;
      for (const f of S.workspace.floors) if (pool.has(f.scene)) f.scene = clone(pool.get(f.scene));
    },
  });
}
const upperVoids = () => S.workspace.floors[1].scene.slabOpenings || [];

test("cutting the stairwell twice re-seats the one void instead of stacking a second", () => {
  setup();
  const first = cutStairVoidAbove(S.items[0]);
  assert.equal(first.reseated, false);
  assert.equal(upperVoids().length, 1);
  S.items[0].x = 180;
  const again = cutStairVoidAbove(S.items[0]);
  assert.equal(again.reseated, true);
  assert.equal(upperVoids().length, 1, "still one Stairwell");
  assert.equal(upperVoids()[0].x, 180, "and it follows the flight");
  // with nothing above there is nothing to cut
  S.workspace.activeFloor = "upper";
  assert.equal(cutStairVoidAbove(S.items[0]), null);
});

test("loading drops a second void bound to the same flight", () => {
  const a = stairVoidFields(stairs), b = Object.assign(stairVoidFields(stairs), { x: 500 }), free = { id: 3, x: 0, z: 0, w: 80, d: 80 };
  const out = normalizeSlabOpenings([a, b, free]);
  assert.equal(out.length, 2);
  assert.equal(out[0].x, stairs.x);
  assert.equal(out[1].id, 3);
});

test("deleting the stairs removes its void on the storey above; undo brings both back", () => {
  const history = setup({ slabOpenings: [stairVoidFields(stairs)], spatial: { slabOpenings: [stairVoidFields(stairs)] } });
  S.slabOpenings = [Object.assign(stairVoidFields(stairs), { id: "own" }), { id: "free", x: 0, z: 0, w: 60, d: 60 }];
  history.push("Delete stairs");
  const gone = S.items[0];
  S.items = [];
  assert.equal(removeStairVoids([gone]), true);
  assert.equal(upperVoids().length, 0);
  assert.equal(S.workspace.floors[1].scene.spatial.slabOpenings.length, 0);
  assert.deepEqual(S.slabOpenings.map((o) => o.id), ["free"], "only the flight's own voids go");
  history.undo();
  assert.equal(S.items.length, 1);
  assert.equal(upperVoids().length, 1);
  assert.equal(S.slabOpenings.length, 2);
  // a piece that is not a stair touches nothing
  assert.equal(removeStairVoids([{ id: 1, type: "sofa" }]), false);
});

test("a void finds its flight on another storey, and shows its name translated", () => {
  setup();
  const vo = stairVoidFields(S.items[0]);
  const hit = findStairsForVoid(vo);
  assert.equal(hit.item.id, 7);
  assert.equal(hit.active, true);
  // from the upper storey, the flight is in the stored ground scene
  S.workspace.floors[0].scene = { items: [clone(stairs)] };
  S.workspace.activeFloor = "upper";
  S.items = [];
  const far = findStairsForVoid(vo);
  assert.equal(far.floor.id, "ground");
  assert.equal(far.active, false);
  assert.equal(findStairsForVoid({ id: 1, x: 0, z: 0 }), null);
  assert.equal(voidDisplayName(vo), "Stairwell");
  assert.equal(voidDisplayName({ name: "Stairwell" }), "Stairwell");
  assert.equal(voidDisplayName({ name: "Atrium", stairsId: 7 }), "Atrium");
});

test("a new flight is designed for the floor above; variants reshape it", () => {
  setup();
  assert.equal(riseToFloorAbove(), 300);
  const it = designNewStairs({ id: 11, type: "stairs", x: 0, z: 0, w: 100, d: 250, h: 260, rot: 0 });
  const cfg = it.configuration.stair;
  assert.ok(cfg && cfg.autoRise && cfg.autoSteps);
  assert.equal(it.h, 300);
  const lay = stairLayout(it);
  assert.ok(lay.riser <= 17.5 + 1e-9 || lay.riser <= 7.75 * 2.54 + 1e-9);
  assert.equal(it.d, lay.d);
  assert.equal(applyStairVariant(it, "lShape"), true);
  assert.equal(it.configuration.stair.runs.length, 2);
  assert.equal(applyStairVariant(it, "dark"), false, "a finish keeps the design");
  assert.equal(applyStairVariant(it, "curved"), true);
  assert.equal(it.configuration.stair, undefined);
  assert.equal(applyStairVariant(it, "wood"), true, "back from curved: designed again");
  // no storey above: a 300 cm default
  S.workspace.activeFloor = "upper";
  assert.equal(riseToFloorAbove(), null);
  assert.equal(designNewStairs({ id: 12, type: "stairs", x: 0, z: 0, w: 100, d: 250, h: 260 }).h, 300);
});

test("the code check measures a designed flight from its layout", () => {
  setup();
  S.workspace.codeProfile = "il";
  const it = designNewStairs({ id: 13, type: "stairs", x: 0, z: 0, w: 100, d: 250, h: 260 });
  it.configuration.stair = Object.assign({}, it.configuration.stair, { going: 22 });
  S.items = [it];
  S.walls = []; S.nodes = []; S.openings = [];
  const plan = planForCodeCheck(S);
  assert.equal(plan.stairs.length, 1);
  assert.equal(plan.stairs[0].tread, 22, "the designed going, not depth / steps");
  assert.ok(Math.abs(plan.stairs[0].riser - stairLayout(it).riser) < 1e-9);
  assert.ok(checkCode(plan, "il").findings.some((f) => f.rule === "stairMinTread"));
  // a legacy straight flight with no step count now uses the builder's 14
  S.items = [{ id: 14, type: "stairs", x: 0, z: 0, w: 100, d: 280, h: 280 }];
  assert.equal(planForCodeCheck(S).stairs[0].riser, 20);
  assert.equal(planForCodeCheck(S).stairs[0].tread, 20);
});
