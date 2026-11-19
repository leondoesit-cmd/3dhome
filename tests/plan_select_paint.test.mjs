import test from "node:test";
import assert from "node:assert/strict";

// Record real model and HUD passes. Canvas drawing primitives are inert.
const frames = [], paints = { plan: 0, "plan-hud": 0 };
let drawing = null;
function canvas(id) {
  const noop = () => {};
  const ctx = new Proxy({
    clearRect() { if (id) paints[id]++; },
    measureText: (s) => ({ width: String(s).length * 6 }),
    createRadialGradient: () => ({ addColorStop: noop }),
  }, {
    get(o, k) {
      const v = o[k] ?? noop;
      if (!drawing || typeof v !== "function") return v;
      return (...args) => { drawing.push([k, ...args]); return v(...args); };
    },
    set(o, k, v) { if (drawing) drawing.push([k, v]); o[k] = v; return true; },
  });
  return {
    width: 800, height: 600, offsetParent: {}, style: {}, getContext: () => ctx,
    classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}
const canvases = { plan: canvas("plan"), "plan-hud": canvas("plan-hud") };
globalThis.document = {
  documentElement: { dataset: {}, getAttribute: () => null },
  getElementById: (id) => canvases[id] || null, createElement: () => canvas(),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  body: { classList: { add() {}, remove() {} } },
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: "http://localhost/" },
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};
globalThis.CustomEvent = class {};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#fff" });
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
globalThis.cancelAnimationFrame = () => {};

const { S } = await import("../js/state.js");
const { wirePlanMove } = await import("../js/interaction/plan_move.js");
const { interactionLocals } = await import("../js/interaction.js");
const { requestRenderHUDVisual, render2DNow } = await import("../js/plan2d.js");
const { drawWall } = await import("../js/plan2d/overlays.js");
const { drawHUDWalls } = await import("../js/plan2d/wall_ink_draw.js");
interactionLocals.trackLongPress = () => {};
interactionLocals.planPrecisionPoint = (e, x, y) => ({ x, y });
wirePlanMove();
const frame = () => frames.splice(0).forEach((fn) => fn(16));
function move(x, y) {
  interactionLocals.planMove({ offsetX: x, offsetY: y, pointerType: "mouse", shiftKey: false });
  frame();
}
function loadRoom() {
  Object.assign(S, {
    nodes: [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }],
    walls: [0, 1, 2, 3].map((i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 })),
    openings: [], items: [], markers: [], roomMeta: {}, sel: null, action: null, tool: "select",
    SC: 1, OX: 0, OY: 0, CW: 800, CH: 600, hoverPt: null, hoverItem: null, hoverWall: null, showDims: true,
  });
  frame();
  render2DNow();
}

test("idle select repaints only the HUD until a room or dimension-chain target changes", () => {
  loadRoom();
  move(100, 100);
  const model = paints.plan, hud = paints["plan-hud"];
  move(150, 150);
  assert.equal(paints.plan, model, "the pointer stayed inside the same room");
  assert.equal(paints["plan-hud"], hud + 1);
  move(710, 350);
  assert.equal(paints.plan, model + 1, "restore the room label on leaving");
  move(300, 0);
  assert.equal(paints.plan, model + 2, "light the wall's dimension chain");
  move(350, 0);
  assert.equal(paints.plan, model + 2, "the wall probe moved along the same wall");
  move(600, 210);
  assert.equal(paints.plan, model + 3, "light a different wall");
});

test("multi-wall HUD paint groups openings once and keeps per-wall ink identical", () => {
  loadRoom();
  let scans = 0;
  S.openings = [
    { id: 7, type: "door", wall: 1, s: 90, width: 80, height: 200 },
    // Grouping the whole opening pool reads even an unrelated opening's sill.
    { wall: 999, get sill() { scans++; return 0; } },
  ];
  const selected = [S.walls[2], S.walls[0], S.walls[1]];
  S.showDims = false;
  S.sel = { kind: "wall", ref: selected[1] };
  requestRenderHUDVisual();
  frame();
  const oneWall = scans;
  scans = 0;
  S.sel = { kind: "walls", refs: selected };
  requestRenderHUDVisual();
  frame();
  assert.equal(scans, oneWall, "as many whole-opening reads as a single wall");

  // Compare every canvas operation, including style changes, between the
  // old per-wall entry point and a batch with one hidden wall and a stale ref.
  const expected = [];
  try {
    drawing = expected;
    drawWall(selected[0]);
    drawWall(selected[2]);
    drawing = [];
    scans = 0;
    drawHUDWalls([...selected, { id: 123 }], { [selected[1].id]: true });
    assert.equal(scans, 1, "one ink pass");
    assert.deepEqual(drawing, expected);
  } finally {
    drawing = null;
  }
});
