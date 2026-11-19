/* The cabinet designer's 3D pane is fitted to the piece and the pane's shape
   (js/cabinet/preview_fit.js). Measured by projecting the box with a real
   camera placed the way js/editor_view.js orbits it. */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.core.js";
import { cabinetFitDistance, PREVIEW_FILL } from "../js/cabinet/preview_fit.js";

function filled(size, fov, aspect, az, el) {
  const d = cabinetFitDistance(size, fov, aspect, PREVIEW_FILL, az, el);
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 10000);
  cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Vector3(sx * size.w / 2, sy * size.h / 2, sz * size.d / 2).project(cam);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { w: (x1 - x0) / 2, h: (y1 - y0) / 2, d };
}

const wardrobe = { w: 100, h: 200, d: 60 };

test("a tall Split pane: the cabinet fills about 75% of the limiting dimension", () => {
  const f = filled(wardrobe, 42, 393 / 603, 0.55, 0.28);
  const lim = Math.max(f.w, f.h);
  assert.ok(Math.abs(lim - 0.75) < 0.01, "limiting fill " + lim.toFixed(3));
  assert.ok(f.w <= 0.8 && f.h <= 0.8, "fits both ways");
});

test("a wide 3D pane: the height limits and fills about 75%", () => {
  const f = filled(wardrobe, 42, 1100 / 690, 0, 0);
  assert.ok(Math.abs(f.h - 0.75) < 0.01, "height fill " + f.h.toFixed(3));
  assert.ok(f.w < f.h);
});

test("the distance follows the pane's shape and the piece's size", () => {
  const tall = cabinetFitDistance(wardrobe, 42, 0.4, 0.75, 0.55, 0.28);
  const wide = cabinetFitDistance(wardrobe, 42, 1.6, 0.75, 0.55, 0.28);
  assert.ok(tall > wide, "a narrow pane pulls the camera back");
  const base = cabinetFitDistance({ w: 300, h: 90, d: 60 }, 42, 1.6, 0.75, 0, 0);
  const wider = cabinetFitDistance({ w: 400, h: 90, d: 60 }, 42, 1.6, 0.75, 0, 0);
  assert.ok(wider > base, "a wider base unit pulls the camera back");
  assert.ok(cabinetFitDistance(wardrobe, 42, 1, 0.5, 0, 0) > cabinetFitDistance(wardrobe, 42, 1, 0.75, 0, 0));
});
