/* The AR capture path has no unit-testable surface: it lives inside a WebXR
   session, a DOM overlay and a WebGL context. The centimetre math is covered
   in room_scan.test.mjs; what is covered here is everything that only exists
   once a session is running — the tap target, the session teardown, and the
   state that has to be reset between attempts. A stand-in XRSession is enough,
   because the bugs these guard against were all in our own bookkeeping. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage } from "../tools/browser_harness.mjs";

const SETUP = function () {
  const M = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const state = { ended: 0, failAfterStart: false, hit: { x: 0, y: 0, z: 0 },
    hitQuat: { x: 0, y: 0, z: 0, w: 1 }, raf: null, floorSpace: true };
  window.__xr = state;
  const session = {
    renderState: { baseLayer: { framebuffer: null, getViewport: () => ({ x:0,y:0,width:390,height:844 }) } },
    updateRenderState(s) { if (s.baseLayer) this.renderState.baseLayer = Object.assign(this.renderState.baseLayer, s.baseLayer); },
    async requestReferenceSpace(kind) {
      if (state.failAfterStart) throw Object.assign(new Error("no"), { name: "NotSupportedError" });
      if (kind === "local-floor" && !state.floorSpace) throw new Error("no floor");
      return {};
    },
    requestHitTestSource: async () => ({ cancel() {} }),
    requestAnimationFrame(cb) { state.raf = cb; return 1; },
    addEventListener(k, f) { if (k === "end") state.onEnd = f; },
    async end() { state.ended++; if (state.onEnd) state.onEnd(); },
  };
  state.frame = {
    getHitTestResults: () => [{ getPose: () => ({ transform: { position: state.hit, orientation: state.hitQuat } }) }],
    getViewerPose: () => ({
      transform: { position: { x: 1, y: 1.5, z: 1 }, orientation: { x:0,y:0,z:0,w:1 } },
      views: [{ projectionMatrix: M, transform: { inverse: { matrix: M } } }],
    }),
  };
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getAttribLocation: () => 0, getUniformLocation: () => ({}),
    makeXRCompatible: async () => {},
    getExtension: (name) => (name === "WEBGL_lose_context" ? { loseContext() { state.lost = true; } } : null),
  }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, opts) {
    if (kind === "webgl" && this.classList.contains("roomscan-xr-canvas")) return gl;
    return real.call(this, kind, opts);
  };
  Object.defineProperty(navigator, "xr", { configurable: true,
    value: { isSessionSupported: async () => true, requestSession: async () => session } });
  window.XRWebGLLayer = function () { return { framebuffer: null, getViewport: () => ({ x:0,y:0,width:390,height:844 }) }; };
};

async function arPage() {
  const page = await openPage({ width: 390, height: 844, lang: "en" });
  if (!page) return null;
  await page.goto("/");
  await page.eval(function () { return new Promise((r) => setTimeout(r, 3000)); });
  await page.eval(SETUP);
  await page.eval(async function () {
    const mod = await import("./js/ui_room_scan.js");
    mod.openRoomScanModal();
    await new Promise((r) => setTimeout(r, 400));
    window.__startAR = async function () {
      const overlay = document.querySelector(".roomscan-overlay");
      overlay.querySelector(".roomscan-help").click();
      overlay.querySelector('[data-tutorial="start"]').click();
      await new Promise((r) => setTimeout(r, 350));
      return !!overlay.querySelector(".roomscan-ar-stage");
    };
    window.__step = async function (x, y, z) {
      window.__xr.hit = { x, y, z };
      window.__xr.raf(performance.now(), window.__xr.frame);
      await new Promise((r) => setTimeout(r, 40));
    };
  });
  return page;
}

test("a tap on the crosshair adds a corner", async (t) => {
  const page = await arPage();
  if (!page) return t.skip("chrome not installed");
  try {
    const out = await page.eval(async function () {
      await window.__startAR();
      const stage = document.querySelector(".roomscan-ar-stage");
      await window.__step(0, 0, 0);
      // the reticle sits dead centre, exactly where a one-handed user taps
      const centre = document.elementFromPoint(195, 422);
      const owner = centre && centre.closest("[data-xr]");
      centre.click();
      await window.__step(4, 0, 0);
      return {
        target: owner ? owner.getAttribute("data-xr") : "none",
        corners: stage.querySelector(".roomscan-count").textContent,
      };
    });
    assert.equal(out.target, "tap", "the crosshair must not swallow its own tap");
    assert.match(out.corners, /1/);
  } finally { await page.close(); }
});

test("the controls still take their own taps", async (t) => {
  const page = await arPage();
  if (!page) return t.skip("chrome not installed");
  try {
    const out = await page.eval(async function () {
      await window.__startAR();
      const stage = document.querySelector(".roomscan-ar-stage");
      const box = stage.querySelector('[data-xr="capture"]').getBoundingClientRect();
      const on = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { owner: on && on.closest("[data-xr]") ? on.closest("[data-xr]").getAttribute("data-xr") : "none" };
    });
    assert.equal(out.owner, "capture");
  } finally { await page.close(); }
});

test("a start that fails after the session opens still ends it", async (t) => {
  const page = await arPage();
  if (!page) return t.skip("chrome not installed");
  try {
    const out = await page.eval(async function () {
      window.__xr.failAfterStart = true;
      await window.__startAR();
      await new Promise((r) => setTimeout(r, 300));
      const overlay = document.querySelector(".roomscan-overlay");
      return {
        ended: window.__xr.ended,          // the camera is on until end() runs
        lost: !!window.__xr.lost,          // and the GL context until this does
        stage: !!overlay.querySelector(".roomscan-ar-stage"),
        status: overlay.querySelector(".roomscan-status").textContent,
      };
    });
    assert.equal(out.ended, 1, "the opened session must be ended, not just forgotten");
    assert.equal(out.lost, true, "the WebGL context must be handed back");
    assert.equal(out.stage, false, "the AR stage must not be left on screen");
    assert.ok(out.status.length > 0, "and the user must be told why");
  } finally { await page.close(); }
});

test("restarting AR does not resume the abandoned trace", async (t) => {
  const page = await arPage();
  if (!page) return t.skip("chrome not installed");
  try {
    const out = await page.eval(async function () {
      await window.__startAR();
      const stage = document.querySelector(".roomscan-ar-stage");
      const tap = stage.querySelector('[data-xr="tap"]');
      await window.__step(0, 0, 0); tap.click();
      await window.__step(4, 0, 0); tap.click();
      await window.__step(4, 0, 3); tap.click();
      const first = stage.querySelector(".roomscan-count").textContent;
      stage.querySelector('[data-xr="cancel"]').click();
      await new Promise((r) => setTimeout(r, 300));
      await window.__startAR();
      const next = document.querySelector(".roomscan-ar-stage");
      await window.__step(9, 0, 9);
      return {
        first,
        again: next.querySelector(".roomscan-count").textContent,
        undo: next.querySelector('[data-xr="undo"]').disabled,
        finish: next.querySelector('[data-xr="finish"]').disabled,
      };
    });
    assert.match(out.first, /3/);
    assert.match(out.again, /0/, "a new scan starts empty");
    assert.equal(out.undo, true);
    assert.equal(out.finish, true);
  } finally { await page.close(); }
});

test("a corner cannot be dropped on a table top", async (t) => {
  const page = await arPage();
  if (!page) return t.skip("chrome not installed");
  try {
    const out = await page.eval(async function () {
      await window.__startAR();
      const stage = document.querySelector(".roomscan-ar-stage");
      const capture = stage.querySelector('[data-xr="capture"]');
      const hint = stage.querySelector(".roomscan-ar-hint");
      await window.__step(0, 0, 0);
      const floor = { disabled: capture.disabled };
      // a horizontal plane 75 cm up is furniture, not the floor
      await window.__step(1, 0.75, 1);
      await new Promise((r) => setTimeout(r, 1200));
      await window.__step(1, 0.75, 1);
      const table = { disabled: capture.disabled, hint: hint.textContent };
      // a vertical plane is still allowed: at the wall-to-floor junction the
      // nearest plane genuinely is often the wall
      window.__xr.hitQuat = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
      await window.__step(1, 0, 1);
      await new Promise((r) => setTimeout(r, 1200));
      await window.__step(1, 0, 1);
      const wall = { disabled: capture.disabled, hint: hint.textContent };
      return { floor, table, wall };
    });
    assert.equal(out.floor.disabled, false);
    assert.equal(out.table.disabled, true, "a raised surface must not accept a corner");
    assert.match(out.table.hint, /raised surface/i);
    assert.equal(out.wall.disabled, false, "a wall hit warns but still commits");
    assert.match(out.wall.hint, /wall or an object/i);
  } finally { await page.close(); }
});
