import test from "node:test";
import assert from "node:assert/strict";
import { createPlanFollower, createPlanSyncTriggers } from "../js/plan_sync.js";

function setup(options = {}) {
  let time = 0, hellos = 0, paints = 0, release;
  const applied = [], scenes = [];
  const follower = createPlanFollower({
    applyScene: options.pending ? scene => { scenes.push(scene); return new Promise(resolve => { release = resolve; }); }
      : async scene => { scenes.push(scene); return options.sceneResult !== false; },
    applyOp: op => { applied.push(op); return op.ok !== false; },
    sendHello: () => hellos++, paint: () => paints++, now: () => time,
    ...(options.maxBuffered ? { maxBuffered: options.maxBuffered } : {}),
  });
  return { follower, applied, scenes, get hellos() { return hellos; }, get paints() { return paints; },
    advance: ms => { time += ms; }, release: result => release(result) };
}
const op = (rev, name = String(rev), ok = true) => ({ rev, op: { name, ok } });

test("sync buffers edits through transfer and async scene apply, then replays once", async () => {
  const h = setup({ pending: true }), f = h.follower;
  assert.equal(f.request(), true); assert.equal(h.hellos, 1);
  f.op(op(4)); f.transfer({ state: "start" }); f.op(op(5));
  h.advance(30000); assert.equal(f.request(), false);
  const pending = f.snapshot({ rev: 5, scene: { snapshot: true } }, "host");
  f.op(op(6)); f.op(op(undefined, "legacy")); f.op(op(7));
  assert.deepEqual(h.applied, []); assert.equal(f.request(), false);
  h.release(true); assert.equal(await pending, true);
  assert.deepEqual(h.applied.map(o => o.name), ["6", "legacy", "7"]);
  assert.equal(f.rev, 7); assert.equal(f.syncing, false); assert.equal(h.paints, 1); assert.equal(h.hellos, 1);
});

test("a buffered gap or failed apply stops replay and asks once", async () => {
  for (const fail of [false, true]) {
    const h = setup(), f = h.follower;
    f.request(); f.op(op(2, "first", !fail)); f.op(op(fail ? 3 : 4)); f.op(op(5));
    await f.snapshot({ rev: 1, scene: {} }, "host");
    assert.equal(h.hellos, 2); assert.equal(f.syncing, true);
    assert.equal(f.request(), false); assert.equal(h.hellos, 2);
    assert.deepEqual(h.applied.map(o => o.name), ["first"]); assert.equal(h.paints, 1);
  }
});

test("overflow stops replay and requests a fresh snapshot", async () => {
  const h = setup({ maxBuffered: 2 }), f = h.follower;
  f.request(); f.op(op(1)); f.op(op(2)); f.op(op(3));
  await f.snapshot({ rev: 0, scene: {} });
  assert.equal(h.hellos, 2); assert.equal(f.syncing, true); assert.deepEqual(h.applied, []);
});

test("transfer failure discards buffered edits before requesting again", async () => {
  const h = setup(), f = h.follower;
  f.request(); f.transfer({ state: "start" }); f.op(op(50));
  f.transfer({ state: "failed" }); assert.equal(h.hellos, 2);
  await f.snapshot({ rev: 0, scene: {} });
  assert.equal(f.syncing, false); assert.equal(h.hellos, 2); assert.deepEqual(h.applied, []);
});

test("a refused scene leaves syncing without requesting again", async () => {
  const h = setup({ sceneResult: false }), f = h.follower;
  f.request(); f.op(op(1));
  assert.equal(await f.snapshot({ rev: 0, scene: {} }), false);
  assert.equal(f.syncing, false); assert.equal(h.hellos, 1); assert.equal(h.paints, 0);
  f.op(op(1)); assert.equal(h.applied.length, 1);
});

test("waiting expires lazily after 15s but a live transfer does not", () => {
  const h = setup(), f = h.follower;
  f.request(); h.advance(14999); assert.equal(f.request(), false);
  h.advance(2); f.op(op(10)); assert.equal(h.hellos, 2);
  f.transfer({ state: "start" }); h.advance(60000); assert.equal(f.request(), false);
  assert.equal(h.hellos, 2);
});

test("direct ops apply and paint; a sequence gap suppresses repeated hellos", () => {
  const h = setup(), f = h.follower;
  f.op(op(1)); assert.equal(f.rev, 1); assert.equal(h.paints, 1);
  f.op(op(4)); f.op(op(5)); f.request(); assert.equal(h.hellos, 1); assert.equal(h.applied.length, 1);
});

test("reset invalidates a pending snapshot completion", async () => {
  const h = setup({ pending: true }), f = h.follower;
  f.request(); const pending = f.snapshot({ rev: 10, scene: {} });
  f.reset(); h.release(true);
  assert.equal(await pending, false); assert.equal(f.rev, 0); assert.equal(f.syncing, false);
});

test("roster broadcasts trigger only guest transitions; peer joins trigger only the owner", () => {
  let room = null, calls = 0, changes = 0;
  const triggers = createPlanSyncTriggers({ guestRoom: () => room, owner: () => "host", request: () => calls++, changed: () => changes++ });
  triggers.room(); assert.equal(calls, 0);
  room = "apt:host"; triggers.room(); assert.equal(calls, 1);
  for (let i = 0; i < 10; i++) triggers.room();
  triggers.peerJoin({ code: "visitor" }); assert.equal(calls, 1);
  triggers.peerJoin({ code: "host" }); assert.equal(calls, 2);
  room = null; triggers.room(); triggers.peerJoin({ code: "host" }); assert.equal(calls, 2);
  room = "apt:host"; triggers.room(); assert.equal(calls, 3);
  room = "apt:other"; triggers.room(); assert.equal(calls, 4); assert.equal(changes, 4);
});