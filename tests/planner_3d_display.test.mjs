/* The 3D pane's Display popover (walls see-through + tool preview), the
   see-through walls' crease edges, the Plan view's flat north indicator,
   chain numbers stepping off MEP badges, and the view-named tab title. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../vendor/three/three.core.js";
import { setLang } from "../js/i18n.js";
import { buildText } from "../js/build3d_strings.js";
import { setWallXray, wallXrayOn } from "../js/wall_xray.js";
import { XRAY_EDGE_ANGLE, addXrayEdges, isXrayMaterial } from "../js/view3d/xray_edges.js";
import { northIndicatorDeg, northText, showFlatNorth } from "../js/plan_north.js";
import { dimLabelShift } from "../js/plan2d/stamp_slots.js";
import { pageTitle } from "../js/view_modes.js";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

async function inLang(lang, fn) {
  const prev = globalThis.document;
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  try {
    await setLang(lang);
    return fn();
  } finally {
    await setLang("en");
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

test("the button is Display, with Walls and Tool preview sections, in English and Hebrew", async () => {
  await inLang("en", () => {
    assert.equal(buildText("preview"), "Display");
    assert.equal(buildText("previewTip"), "How the 3D view shows walls and tool previews");
    assert.equal(buildText("sectionWalls"), "Walls");
    assert.equal(buildText("sectionPreview"), "Tool preview");
    assert.equal(buildText("wallsSolid"), "Solid");
    assert.equal(buildText("wallsXray"), "See-through");
    // the tool preview modes keep their names
    assert.deepEqual(["modeGhost", "modeSolid", "modeOutline"].map((k) => buildText(k)), ["Transparent", "Solid", "Outline"]);
  });
  await inLang("he", () => {
    for (const k of ["preview", "previewTip", "sectionWalls", "sectionPreview", "wallsSolid", "wallsXray"])
      assert.match(buildText(k), /[֐-׿]/, k + " has a Hebrew string");
  });
});

test("the popover's Walls switch and the Services panel share S.mep.xray.walls", () => {
  const state = { mep: { xray: { walls: false, floor: true, ceiling: false } } };
  assert.equal(wallXrayOn(state), false);
  assert.equal(setWallXray(state, true), true);
  assert.deepEqual(state.mep.xray, { walls: true, floor: true, ceiling: false }, "floor and ceiling untouched");
  assert.equal(wallXrayOn(state), true);
  assert.equal(setWallXray(state, true), false, "no change, nothing to rebuild");
  assert.equal(setWallXray(state, false), true);
  assert.equal(wallXrayOn(state), false);
  // the legacy boolean form reads and upgrades
  const legacy = { mep: { xray: true } };
  assert.equal(wallXrayOn(legacy), true);
  assert.equal(setWallXray(legacy, false), true);
  assert.deepEqual(legacy.mep.xray, { walls: false, floor: false, ceiling: false });
  assert.equal(wallXrayOn({}), false);
  assert.equal(setWallXray({}, true), false, "no services block: the caller runs ensureMEP first");
});

test("see-through walls hold whatever the services layer shows; floor and ceiling still follow it", () => {
  const fn = sourceFunctionText(moduleSource("js/view3d.js"), "mepXray");
  assert.match(fn, /if \(part === "walls"\) return wallXrayOn\(S\);[\s\S]*isLayerVisible\("mep"\)/);
  const ui = readFileSync(new URL("../js/build3d_ui.js", import.meta.url), "utf8");
  const setWalls = sourceFunctionText(ui, "setWalls");
  assert.match(setWalls, /ensureMEP\(\)[\s\S]*setWallXray\(S,[\s\S]*S\.dirty3D = true[\s\S]*refreshMEPPanel\(\)/);
  // the popover reads the flag every time it opens
  assert.match(sourceFunctionText(ui, "syncPopover"), /wallXrayOn\(S\)/);
  assert.match(sourceFunctionText(ui, "openPopover"), /syncPopover\(\)/);
});

function wallGroup() {
  const g = new THREE.Group();
  const xray = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.18, depthWrite: false });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(300, 250, 20), xray);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  const glass = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1),
    new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.18, depthWrite: false, transmission: 0.9 }));
  g.add(wall, frame, glass);
  return { g, wall, frame, glass };
}

test("x-ray walls get crease lines; opaque parts and glass do not", () => {
  const { g, wall, frame, glass } = wallGroup();
  assert.equal(addXrayEdges(THREE, g), 1);
  const lines = wall.children.find((c) => c.userData.xrayEdges);
  assert.ok(lines && lines.isLineSegments, "LineSegments, no custom shader");
  assert.ok(lines.material.isLineBasicMaterial);
  assert.equal(lines.geometry.type, "EdgesGeometry");
  assert.equal(lines.geometry.parameters.thresholdAngle, XRAY_EDGE_ANGLE);
  // a box has 12 crease edges: the triangle diagonals on its faces are left out
  assert.equal(lines.geometry.getAttribute("position").count, 24);
  assert.equal(frame.children.length, 0);
  assert.equal(glass.children.length, 0);
  assert.equal(lines.castShadow, false);
  const hits = [];
  lines.raycast(new THREE.Raycaster(), hits);
  assert.equal(hits.length, 0, "picking keeps hitting the wall");
  assert.equal(addXrayEdges(THREE, g), 0, "a second pass adds nothing");
  // freed with the wall: clearGroup / disposeSubtree traverse into the lines
  let disposed = 0;
  lines.geometry.addEventListener("dispose", () => disposed++);
  lines.material.addEventListener("dispose", () => disposed++);
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
  assert.equal(disposed, 2);
  assert.equal(isXrayMaterial(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.42, depthWrite: false })), false, "framing keeps its look");
});

test("every wall built while x-ray is on goes through the edge pass", () => {
  const src = moduleSource("js/view3d.js");
  assert.match(sourceFunctionText(src, "buildWall"), /mepXray\("walls"\)[\s\S]*addXrayEdges\(THREE, root\.children\[i\]\)/);
  // the reusable-wall cache already keys on the x-ray flag
  assert.match(sourceFunctionText(src, "reusableWallKey"), /xray: mepXray\('walls'\)/);
});

test("the Plan view's north arrow turns with the site north and the plan rotation", () => {
  assert.equal(northIndicatorDeg({}), 0);
  assert.equal(northIndicatorDeg({ northAngle: 30 }), 30);
  assert.equal(northIndicatorDeg({ northAngle: 30, planRot: 90 }), 120);
  assert.equal(northIndicatorDeg({ northAngle: -45 }), 315);
  assert.equal(northIndicatorDeg({ northAngle: 350, planRot: 20 }), 10);
  assert.equal(showFlatNorth("plan", "top"), true);
  assert.equal(showFlatNorth("plan", undefined), true);
  assert.equal(showFlatNorth("plan", "front"), false, "an elevation keeps the sphere, the way back");
  for (const mode of ["3d", "dollhouse", "split", "drawing"]) assert.equal(showFlatNorth(mode, "top"), false, mode);
  assert.equal(northText("north", "en"), "North");
  assert.match(northText("northTip", "he"), /[֐-׿]/);
});

test("a chain number slides along its line off an MEP badge, or stays faint", () => {
  const along = [1, 0];
  const label = { x: 200, y: 100, w: 30, h: 13 };
  assert.equal(dimLabelShift(label, null, along, 40), 0, "no badges outside the Services work set");
  assert.equal(dimLabelShift(label, [{ x: 400, y: 100, w: 24, h: 24 }], along, 40), 0, "clear stays put");
  const badge = { x: 205, y: 104, w: 24, h: 24 };
  const s = dimLabelShift(label, [badge], along, 60);
  assert.ok(s && Math.abs(s) <= 60);
  assert.ok(Math.abs(label.x + s - badge.x) >= (label.w + badge.w) / 2 + 2, "the badge reads");
  assert.equal(dimLabelShift(label, [badge], along, 0), null, "no room in its segment: draw it faint");
  // a column chain slides vertically
  const col = { x: 100, y: 200, w: 13, h: 30 };
  const sv = dimLabelShift(col, [{ x: 100, y: 205, w: 24, h: 24 }], [0, 1], 60);
  assert.ok(sv && Math.abs(col.y + sv - 205) >= (30 + 24) / 2 + 2);
});

test("the dimension chains ask for the badges once per paint and place every number through them", () => {
  const src = moduleSource("js/plan2d.js");
  assert.match(sourceFunctionText(src, "drawDimChains"), /mepStampObstacles\(\)/);
  const draw = sourceFunctionText(src, "drawChain");
  assert.equal((draw.match(/chainLabelPlace\(/g) || []).length, 2);
});

test("the tab title names the project and the view", () => {
  assert.equal(pageTitle("ModelForge", "3D", "Beach house"), "Beach house — 3D · ModelForge");
  assert.equal(pageTitle("ModelForge", "", "Beach house"), "Beach house · ModelForge");
  assert.equal(pageTitle("ModelForge", "Plan", "  "), "ModelForge · Plan", "a blank name is no name");
  assert.equal(pageTitle("ModelForge", "Plan"), "ModelForge · Plan");
});
