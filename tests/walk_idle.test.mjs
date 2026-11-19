// Third-person walk, standing still: walkLook (boom sweep over the scene, a
// paint, a walk:look event) is skipped while it would repeat the frame before.
// The skip must leave every frame exactly as the always-run look did, keep
// easing the boom, pick up a scene change the render loop reports, and still
// get the final pose past net.js's 80 ms pose throttle.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText, withSetters } from "./helpers/source_function.mjs";
import { cameraRetraction } from "../js/navigation_profile.js";
import { WALK_IDLE_TRAIL_MS, createWalkIdle, sameWalkIdleKey } from "../js/view3d/walk_idle.js";

test("createWalkIdle skips only a settled, unchanged, trailed look", () => {
  const idle = createWalkIdle(), key = () => [1, "tpv", 2, 3];
  assert.equal(idle.canSkip(key(), 300, false, 0.016), false, "nothing recorded yet");
  idle.record(key(), 300, 300, 300, 1000);
  assert.equal(idle.canSkip(key(), 300, false, 0.016), false, "the pose just changed: walk:look still trails");
  idle.record(key(), 300, 300, 300, 1000 + WALK_IDLE_TRAIL_MS);
  assert.equal(idle.canSkip(key(), 300, false, 0.016), true);
  assert.equal(idle.canSkip(key(), 300, true, 0.016), false, "the scene may have moved");
  assert.equal(idle.canSkip(key(), 300, undefined, 0.016), false, "no word from the loop counts as moved");
  assert.equal(idle.canSkip([1, "tpv", 2, 4], 300, false, 0.016), false, "an input changed");
  assert.equal(idle.canSkip(key(), 299, false, 0.016), false, "someone else moved the boom");
  idle.invalidate();
  assert.equal(idle.canSkip(key(), 300, false, 0.016), false, "a rebuild forgets the last look");
  // the boom still easing toward an unobstructed target: never skipped
  idle.record(key(), 200, 300, 300, 0);
  idle.record(key(), 200, 300, 300, 500);
  assert.equal(idle.canSkip(key(), 200, false, 0.016), false);
  // at a fixed point for this dt, but a longer frame would still move it
  let boom = 200;
  for (let i = 0; i < 5000; i++) boom = cameraRetraction(boom, 300, 300, 0.016);
  idle.record(key(), boom, 300, 300, 0);
  idle.record(key(), boom, 300, 300, 500);
  assert.equal(idle.canSkip(key(), boom, false, 0.016), true);
  assert.equal(idle.canSkip(key(), boom, false, 0.1), cameraRetraction(boom, 300, 300, 0.1) === boom);
  assert.equal(sameWalkIdleKey([NaN, -0], [NaN, -0]), true);
  assert.equal(sameWalkIdleKey([0], [-0]), false);
});

// moveWalk / walkLook / walkIdleKey as written, against stubbed state
const walkSrc = readFileSync(new URL("../js/view3d/walk_mode.js", import.meta.url), "utf8");
const walkCode = withSetters(["walkIdleKey", "walkLook", "moveWalk"].map((n) => sourceFunctionText(walkSrc, n)).join("\n"));
class V {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new V(this.x, this.y, this.z); }
  sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
}
function walker(sweep) {
  const clock = { t: 1000 }, events = [], roots = [{ root: {} }, { root: {} }, { root: {} }];
  const camera = {
    position: new V(), quaternion: { x: 0, y: 0, z: 0, w: 1 },
    lookAt(x, y, z) { const q = this.quaternion; q.x = x - this.position.x; q.y = y - this.position.y; q.z = z - this.position.z; q.w = q.x + q.y; },
  };
  const deps = {
    navigationProfile: () => ({ eyeHeight: 160, cameraRadius: 20, cameraDistance: 300, speed: 200 }),
    cameraRetraction, createWalkIdle, THREE: { Vector3: V }, layerRoots: () => roots,
    createCameraSweep: () => ({ distance: (r, pivot, dir, limit) => { api.sweeps++; return Math.min(limit, sweep()); } }),
    window: { dispatchEvent: (e) => events.push({ type: e.type, t: clock.t, pose: api.pose() }) },
    document: { documentElement: { dataset: {} }, activeElement: null },
    performance: { now: () => clock.t }, camera,
  };
  const make = new Function("deps", `
    const { navigationProfile, cameraRetraction, createWalkIdle, THREE, layerRoots, createCameraSweep,
      window, document, performance, camera } = deps;
    var S = {}, walk = true, walkView = "tpv", walkPos = { x: 10, y: 0, z: 20 }, yaw = 0.3, pitch = -0.1,
      EYE_H = 0, tpDist = 0, avatar = { visible: false, position: new THREE.Vector3(), rotation: { y: 0 } }, freeMove = false, dyn = {}, cameraSweep = null, cameraBoom = 0,
      cameraAt = 0, needsRender = false, keys = {}, touchMove = { x: 0, z: 0 }, walkFloorPending = false;
    const walkIdle = createWalkIdle();
    ${walkCode}
    return {
      moveWalk, setYaw: (v) => { yaw = v; },
      frame: () => ({ boom: cameraBoom, p: [camera.position.x, camera.position.y, camera.position.z],
        q: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w], obstructed: S.cameraObstructed }),
      pose: () => S.walk2D && { x: S.walk2D.x, z: S.walk2D.z, yaw: S.walk2D.yaw },
    };`);
  const api = Object.assign(make(deps), { sweeps: 0, clock, events });
  return api;
}
// net.js sendPose's throttle, fed by the walk:look events
function sentPoses(events) {
  let lastAt = 0, lastJSON = "";
  const sent = [];
  for (const e of events) {
    const j = JSON.stringify(e.pose);
    if (j === lastJSON || e.t - lastAt < 80) continue;
    lastAt = e.t; lastJSON = j; sent.push(e.pose);
  }
  return sent;
}

test("idle third person: same frames as running the look every frame, far fewer sweeps", () => {
  // an obstruction that clears (the boom eases out), then a door swinging into
  // the boom at frame 400 (the loop reports it), then the user turns at 600
  let frameNo = 0;
  const sweep = () => (frameNo < 30 ? 120 : frameNo < 400 ? Infinity : 200);
  const always = walker(sweep), skipping = walker(sweep);
  const a = [], b = [];
  for (frameNo = 0; frameNo < 900; frameNo++) {
    if (frameNo === 600) { always.setYaw(1.1); skipping.setYaw(1.1); }
    for (const w of [always, skipping]) w.clock.t += 16;
    always.moveWalk(0.016); // the old call: no word from the loop, so a full look
    skipping.moveWalk(0.016, frameNo === 400 || frameNo === 401 || frameNo === 600);
    a.push(always.frame());
    b.push(skipping.frame());
  }
  assert.deepEqual(b, a, "every frame identical");
  assert.equal(always.sweeps, 900);
  assert.ok(skipping.sweeps < 900 / 2, `swept ${skipping.sweeps} times`);
  const sentA = sentPoses(always.events), sentB = sentPoses(skipping.events);
  assert.deepEqual(sentB.at(-1), { x: 10, z: 20, yaw: 1.1 }, "the final pose reaches peers");
  assert.deepEqual(sentB, sentA);
});

test("the render loop tells moveWalk whether the scene may have moved", () => {
  const loop = stripComments(moduleSource("js/view3d.js"));
  assert.match(loop, /var walkMoved = walk && \(needsRender \|\| walkStill < 2 \|\| isPhysicsBusy\(\)\);\s*syncPhysicsToThree\(delta\);\s*if \(walk\) moveWalk\(delta \/ 1000, walkMoved\);/);
  assert.match(loop, /walkStill = doorsMoving \|\| humansLive \|\| physicsLive \|\| extTick \? 0 : walkStill \+ 1;/);
  const walk = stripComments(walkSrc);
  assert.match(walk, /window\.addEventListener\("scene3d:rebuilt",\(\)=>walkIdle\.invalidate\(\)\)/);
});
