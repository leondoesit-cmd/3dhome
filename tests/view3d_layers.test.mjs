/* Source contracts for the 3D half of the work-set layers (LAYERS_PERF_PLAN P5).
 *
 * js/view3d.js cannot be imported here — it pulls in three through
 * js/three_lazy.js and there is no WebGL context in `node --test` anyway — so
 * everything below is asserted against the FILE, with its comments blanked
 * (tests/source.mjs). That matters more than usual in this file: the comments
 * quote the very calls these tests forbid.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const view3d = stripComments(await readFile(new URL("../js/view3d.js", import.meta.url), "utf8"));
const zombiesGame = stripComments(await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8"));
const lavaWorld = stripComments(await readFile(new URL("../js/lava_world.js", import.meta.url), "utf8"));
const damage = stripComments(await readFile(new URL("../js/physics/damage.js", import.meta.url), "utf8"));

function slice(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `missing marker: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `missing end marker: ${end}`);
  return source.slice(a, b);
}

test("the planner raycasts no longer test the whole dyn subtree", () => {
  // the bug: a TV standing against a wall lost every pick to the wall's
  // triangles, because both planner rays walked walls, floors and ceilings too
  assert.doesNotMatch(view3d, /intersectObjects\(\s*\[\s*dyn\s*\]/);
  const pick = slice(view3d, "function pickEditTarget(", "function pxScaleAt(");
  assert.match(pick, /pickableRoots\(rank\)/);
  assert.match(pick, /for \(var rank = 0; rank <= 1; rank\+\+\)/);
  // depth order decides within a rank, so each rank is its own sorted raycast
  assert.match(pick, /ray\.intersectObjects\(roots, true\)/);
  // the winning rank rides along on the result — editDown needs it
  assert.match(pick, /rank: rank/);
});

test("a rank-1 hit answers the pick but never starts an edit drag", () => {
  const down = slice(view3d, "function editDown(", "function editMove(");
  assert.match(down, /if \(hit\.rank !== 0\)/);
  assert.match(down, /layers:blocked-drag/);
  // declining lets the press fall through to the orbit, not into a dead click
  assert.match(down, /if \(hit\.rank !== 0\)[\s\S]{0,900}?return false;/);
  // the detail shape is shared with the 2D chain (js/interaction.js blockedDrag)
  assert.match(down, /sel: \{ kind: hit\.kind, ref: hit\.ref \}/);
  assert.match(down, /where: "3d"/);
});

test("pickableRoots excludes rank-Infinity rather than trusting root.visible", async () => {
  const roots = slice(view3d, "function pickableRoots(", "var GHOST_OPACITY");
  assert.match(roots, /layerRank\(e\.id\) === rank/);
  /* The exclusion has to be the root LIST, not root.visible: three's raycast
     walks straight through an invisible object into its children. That is a
     claim about the vendored copy, so check it rather than assert it — if a
     three upgrade ever starts honouring `visible`, this stops being belt and
     braces and the comment in view3d.js needs rewriting. */
  const core = await readFile(new URL("../vendor/three/three.core.js", import.meta.url), "utf8");
  const at = core.indexOf("function intersect( object, raycaster, intersects, recursive )");
  assert.ok(at > 0, "three.core.js still has the recursive intersect helper");
  const body = core.slice(at, core.indexOf("\n}", at));
  assert.doesNotMatch(body, /visible/);
});

test("focusAt keeps rank 1 — it frames the view, it does not select", () => {
  const focus = slice(view3d, "function focusAt(", "function targetOf(");
  assert.match(focus, /pickableRoots\(0\), pickableRoots\(1\)/);
  // the ground plane and the window lights hang outside all three roots and
  // still have to be framable, so they are added back by hand
  assert.match(focus, /c !== structureRoot && c !== itemsRoot && c !== mepRoot/);
});

test("targetOf skips unreachable items and locked openings", () => {
  const target = slice(view3d, "function targetOf(", "function pickEditTarget(");
  assert.match(target, /layerRank\("furniture"\) === Infinity \? null/);
  assert.match(target, /layerRank\("structure"\) === Infinity \|\| o\.userData\.opening\.locked/);
  // bare walls stay skipped: the ray must carry on to the piece behind them
  assert.match(target, /if \(o\.userData\.wall\) return \{ kind: "wall"/);
});

test("MEP is built into its own root, not into dyn", () => {
  assert.match(view3d, /dyn\.add\(mepRoot\);\s*\n\s*buildMEP3D\(mepRoot, THREE\);/);
  assert.doesNotMatch(view3d, /buildMEP3D\(dyn/);
});

test("structure geometry goes to structureRoot and the ground stays out of it", () => {
  const build = slice(view3d, "export function rebuild3D()", "function tagItemPhysicsRole(");
  assert.match(build, /structureRoot = new THREE\.Group\(\)/);
  assert.match(build, /mepRoot = new THREE\.Group\(\)/);
  // ground plane and daylight are not layer-governed: hiding the structure
  // layer must not take the floor or the sunlight with it
  assert.match(build, /dyn\.add\(gp\)/);
  assert.match(build, /pl\.userData\.win = true;[\s\S]{0,400}dyn\.add\(pl\)/);
  // walls, their framing and the room slabs all land on structureRoot
  assert.match(view3d, /addWallFraming\(structureRoot, w, xray\)/);
  assert.match(view3d, /g\.userData\.physicsRole = "static";\s*\n\s*structureRoot\.add\(g\)/);
});

test("the plan's matrixAutoUpdate freeze was cut and stays cut", () => {
  assert.doesNotMatch(view3d, /structureRoot\.matrixAutoUpdate/);
});

test("the two direct dyn.children walks were flattened over the new roots", () => {
  const phys = slice(view3d, "export function initPhysicsForScene()", "function hangWindowCloth(");
  assert.match(phys, /c !== itemsRoot && c !== structureRoot && c !== mepRoot/);
  assert.match(phys, /\.concat\(structureRoot \? structureRoot\.children : \[\]\)/);
  assert.match(phys, /\.concat\(mepRoot \? mepRoot\.children : \[\]\)/);
  const see = slice(view3d, "function updateSeeThrough()", "export function frameView()");
  assert.match(see, /structureRoot\.children\.forEach/);
  assert.doesNotMatch(see, /dyn\.children/);
});

test("ghosting clones the material and hands the original back", () => {
  const ghost = slice(view3d, "function ghostSwap(", "function ghostRoot(");
  // floor materials are shared per texture and catalogue meshes share theirs:
  // mutating in place would ghost unrelated geometry permanently
  assert.match(ghost, /o\.userData\.ghostBase = o\.material/);
  assert.match(ghost, /m\.clone\(\)/);
  assert.match(ghost, /c\.opacity = Math\.min\(c\.opacity, GHOST_OPACITY\)/);
  assert.match(ghost, /o\.material = base/);
  assert.match(ghost, /m\.dispose\(\)/);
  assert.match(ghost, /delete o\.userData\.ghostBase/);
  assert.match(view3d, /var GHOST_OPACITY = 0\.35/);
  // and every path that disposes ghosted geometry restores it first
  const drop = slice(view3d, "function dropItem(", "function buildAndCache(");
  assert.match(drop, /ghostSwap\(c\.g, false\);[\s\S]{0,60}itemsRoot\.remove\(c\.g\)/);
  const ops = slice(view3d, "function applyItemOps()", "export function rebuild3D()");
  assert.match(ops, /if \(isLayerGhosted\("furniture"\)\) ghostSwap\(itemsRoot, true\)/);
});

test("the ghost flag keeps applyLayers3D off the hot path", () => {
  // applyLayers3D runs per piecewise item update; an unconditional traverse of
  // the whole model there would spend what the root split just saved
  const wrap = slice(view3d, "function ghostRoot(root, on)", "export function applyLayers3D()");
  assert.match(wrap, /if \(!!root\.userData\.ghostHeld === on\) return;/);
  assert.match(wrap, /root\.userData\.ghostHeld = on;/);
});

test("rebuild3D un-ghosts before it disposes, or the originals leak", () => {
  const build = slice(view3d, "export function rebuild3D()", "scene.doors = []");
  const unghost = build.indexOf("ghostRoot(structureRoot, false)");
  const clear = build.indexOf("clearGroup(dyn)");
  assert.ok(unghost >= 0 && clear > unghost, "restore materials before disposing them");
});

test("root visibility is driven by the layer table and re-applied per rebuild", () => {
  const apply = slice(view3d, "export function applyLayers3D()", "if (typeof window");
  assert.match(apply, /isLayerVisible\(e\.id\) \|\| isLayerGhosted\(e\.id\)/);
  assert.match(apply, /ghostRoot\(e\.root, isLayerGhosted\(e\.id\)\)/);
  const build = slice(view3d, "export function rebuild3D()", "function tagItemPhysicsRole(");
  assert.match(build, /applyLayers3D\(\)/);
});

test("the game and physics raycasts still see the whole dyn tree", () => {
  // RC, zombies, lava, drive and the destruction pass all walk `dyn` (or the
  // scene) recursively — the layer split must be invisible to them
  assert.match(view3d, /export function getDynGroup\(\) \{\s*\n\s*return dyn;/);
  assert.match(zombiesGame, /if \(dyn\) list\.push\(dyn\)/);
  assert.match(zombiesGame, /_rc\.intersectObjects\(list, true\)/);
  assert.match(lavaWorld, /dyn\.traverse\(/);
  assert.match(damage, /raycaster\.intersectObjects\(scene\.children, true\)/);
});
