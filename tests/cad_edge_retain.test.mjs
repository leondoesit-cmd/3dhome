// Hover-only refreshes of the CAD editor's pick edges keep the edge Lines and
// restyle them (js/modeler/edge_retain.js + addTopologyPickEdges). The result
// must match a full rebuild exactly; anything else falls back to the rebuild.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as THREE from "../vendor/three/three.core.js";
import * as retain from "../js/modeler/edge_retain.js";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText, withSetters } from "./helpers/source_function.mjs";

const {
  canRestylePickEdges, pickEdgeOrderSafe, pickEdgePointsMatch, pickEdgeSettings,
  pickEdgeSignature, pickEdgeSignaturesConflict, pickEdgeStyle,
} = retain;

const colors = { selected: 0x2266ff, hover: 0xff8800, edge: 0x202020 };

test("per-edge style equals the expressions addTopologyPickEdges always used", () => {
  for (const selected of [false, true]) for (const hovered of [false, true])
  for (const finish of [false, true]) for (const show of [false, true]) {
    const style = pickEdgeStyle(selected, hovered, finish, show, colors);
    assert.equal(style.color, selected ? colors.selected : hovered ? colors.hover : finish ? 0xf2d27a : colors.edge);
    assert.equal(style.opacity, selected || hovered ? .98 : finish ? .9 : .95);
    assert.equal(style.visible, show || finish || selected || hovered);
    assert.equal(style.renderOrder, selected || hovered ? 22 : 20);
    assert.equal(style.glow, selected || hovered || finish);
  }
});

test("restyle is allowed only for the exact lines of the last build under the same settings", () => {
  const settings = pickEdgeSettings(true, false, colors, "part");
  const a = {}, b = {};
  const record = { lineSeq: 1, lines: [a, b], signature: {}, settings };
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, false, colors, "part")), true);
  assert.equal(canRestylePickEdges(null, [a, b], settings), false, "never built here");
  assert.equal(canRestylePickEdges(record, [b, a], settings), false, "reordered");
  assert.equal(canRestylePickEdges(record, [a], settings), false, "a line went away");
  assert.equal(canRestylePickEdges(record, [], settings), false);
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(false, false, colors, "part")), false, "showModelEdges");
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, true, colors, "part")), false, "finish command");
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, false, { ...colors, edge: 1 }, "part")), false, "edge colour");
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, false, { ...colors, hover: 1 }, "part")), false, "hover colour");
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, false, { ...colors, selected: 1 }, "part")), false, "selected colour");
  assert.equal(canRestylePickEdges(record, [a, b], pickEdgeSettings(true, false, colors, "assembly")), false, "document type");
});

test("geometry check matches what setFromPoints stores", () => {
  const points = [{ x: 0.1, y: 2, z: -3.3 }, { x: 4, y: 5 }];
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, p.z)));
  assert.equal(pickEdgePointsMatch(geometry.attributes.position.array, points), true);
  assert.equal(pickEdgePointsMatch(geometry.attributes.position.array, [points[0], { x: 4, y: 5.001 }]), false);
  assert.equal(pickEdgePointsMatch(geometry.attributes.position.array, points.slice(0, 1)), false);
});

test("draw order: a kept line must already be newer than any body it could blend differently with", () => {
  const normal = pickEdgeStyle(false, false, false, true, colors);
  const hovered = pickEdgeStyle(false, true, false, true, colors);
  const selected = pickEdgeStyle(true, false, false, true, colors);
  const plain = pickEdgeSignature([normal, normal]);
  const withHover = pickEdgeSignature([normal, hovered]);
  const withSelect = pickEdgeSignature([selected, normal]);
  assert.equal(pickEdgeSignaturesConflict(plain, plain), false, "one shared style blends the same in any order");
  assert.equal(pickEdgeSignaturesConflict(withHover, plain), false);
  assert.equal(pickEdgeSignaturesConflict(withHover, withSelect), true);
  assert.equal(pickEdgeSignaturesConflict(withHover, withHover), false);
  const mine = { lineSeq: 5 };
  assert.equal(pickEdgeOrderSafe(mine, withHover, [{ lineSeq: 9, signature: plain }]), true);
  assert.equal(pickEdgeOrderSafe(mine, withHover, [{ lineSeq: 9, signature: withSelect }]), false);
  assert.equal(pickEdgeOrderSafe(mine, withHover, [{ lineSeq: 3, signature: withSelect }]), true);
  assert.equal(pickEdgeOrderSafe(mine, withHover, [null, mine]), true);
  // Hidden lines never draw, so they never conflict.
  const hidden = pickEdgeSignature([pickEdgeStyle(false, false, false, false, colors)]);
  assert.deepEqual(hidden, {});
});

/* ---- the real refreshDecorations / addTopologyPickEdges on vendored three ---- */

const source = modelerSource();
const functionNames = [
  "refreshDecorations", "isEntryAffectedByHover", "addTopologyPickEdges", "restyleTopologyPickEdges",
  "addPickEdgeGlow", "pickEdgeMesh", "pickEdgeColors",
];
const code = withSetters([
  ...functionNames.map(name => sourceFunctionText(source, name)),
  sourceFunctionText(readFileSync(new URL("../js/primitives.js", import.meta.url), "utf8"), "clearGroup"),
  sourceFunctionText(readFileSync(new URL("../js/modeler_mesh_geometry.js", import.meta.url), "utf8"), "hexNum"),
].join("\n"));

function makeParts() {
  // Two bodies sharing a face: edge a:e0 and b:e0 coincide, as in an assembly.
  const parts = [];
  for (const id of ["a", "b"]) {
    const entries = [];
    for (let i = 0; i < 12; i++) {
      const points = i === 5
        ? Array.from({ length: 9 }, (_, k) => ({ x: Math.cos(k / 8 * Math.PI) * 3, y: Math.sin(k / 8 * Math.PI) * 3, z: 1 }))
        : [{ x: i, y: 0, z: 0 }, { x: i, y: 10, z: id === "a" ? 0 : 0.5 * i }];
      entries.push({ kind: "edge", persistentId: id + ":e" + i, ownerFeatureId: "f:" + id, descriptor: { curve: "polyline", endpoints: points }, displayPoints: i % 2 ? points : undefined });
    }
    parts.push({ id, entries });
  }
  return parts;
}

function makeWorld(options = {}) {
  const counts = { lineGeometry: 0, lineMaterial: 0 };
  class CountingGeometry extends THREE.BufferGeometry { constructor() { super(); counts.lineGeometry++; } }
  class CountingMaterial extends THREE.LineBasicMaterial { constructor(p) { super(p); counts.lineMaterial++; } }
  const T = { ...THREE, BufferGeometry: CountingGeometry, LineBasicMaterial: CountingMaterial };
  const E = {
    pv: { render() {} }, docType: "part", topologySelection: [], hoverTopology: null,
    edgeColor: "#202020", hoverColor: "#ff8800", selectedEdgeColor: "#2266ff", selectedFaceColor: "#3355ff", showModelEdges: true,
  };
  const parts = makeParts();
  const decoGroups = parts.map(part => ({ part, mesh: { isMesh: true, userData: { cadPart: part.id } }, group: new THREE.Group(), component: null, dirty: true }));
  const ctx = {
    E, THREE: T, decoGroups, lastDecoratedHover: null, decoratedWorldPerPixel: 0, Set,
    retainExactPreview: () => false,
    finishCommandActive: () => !!E.finish,
    partBounds: () => ({ x0: 0, x1: 12, y0: 0, y1: 10, z0: 0, z1: 6 }),
    overlayEntriesForPart: part => part.entries,
    edgePoints: descriptor => descriptor.endpoints,
    topologySelected: id => E.topologySelection.some(ref => ref.persistentId === id),
    topologyHovered: id => !!E.hoverTopology && E.hoverTopology.persistentId === id,
    decorationWorldPerPixel: () => 0.25,
    addFaceHighlights(group, part) {
      for (const ref of [...E.topologySelection, E.hoverTopology]) {
        if (!ref || ref.kind !== "face" || ref.partId !== part.id) continue;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: .4 }));
        face.renderOrder = 18;
        group.add(face);
      }
    },
    addTemporaryAxes() {},
    ...retain,
  };
  // The reference world never finds a record, so every refresh takes the old full rebuild.
  if (options.rebuildAlways) ctx.pickEdgeRecord = () => null;
  runInNewContext(code, ctx);
  return { ctx, E, counts, decoGroups };
}

function snapshot(world) {
  return world.decoGroups.map(entry => entry.group.children.map(child => ({
    type: child.type,
    renderOrder: child.renderOrder,
    visible: child.visible,
    color: child.material.color.getHex(),
    opacity: child.material.opacity,
    transparent: child.material.transparent,
    depthTest: child.material.depthTest,
    depthWrite: child.material.depthWrite,
    positions: Array.from(child.geometry.attributes.position.array),
    raycastsOff: child.raycast !== THREE.Line.prototype.raycast && child.raycast !== THREE.Mesh.prototype.raycast,
    userData: {
      cadPart: child.userData.cadPart, cadFeatureId: child.userData.cadFeatureId,
      cadTopology: child.userData.cadTopology && child.userData.cadTopology.persistentId,
      cadPickVisible: child.userData.cadPickVisible,
    },
  })));
}

/* Painter order of visible transparent objects of one renderOrder at equal
   depth is object id. Record, for every pair whose styles differ, which draws
   first; the kept lines must give the same answers as a rebuild. */
function drawOrder(world) {
  const items = [];
  world.decoGroups.forEach(entry => entry.group.children.forEach(child => {
    if (!child.visible) return;
    items.push({ key: (child.userData.cadTopology ? child.userData.cadTopology.persistentId : "glow") + "#" + child.type + "#" + entry.part.id,
      order: child.renderOrder, style: child.material.color.getHex() + "/" + child.material.opacity, id: child.id });
  }));
  const pairs = {};
  for (const a of items) for (const b of items) {
    if (a === b || a.order !== b.order || a.style === b.style || a.key > b.key) continue;
    pairs[a.key + "|" + b.key] = a.id < b.id;
  }
  return pairs;
}

test("hover transitions keep the edge lines and match a full rebuild child for child", () => {
  const kept = makeWorld(), rebuilt = makeWorld({ rebuildAlways: true });
  const worlds = [kept, rebuilt];
  const step = (label, change) => {
    worlds.forEach(world => { change(world.E, world.decoGroups); world.ctx.refreshDecorations(); });
    assert.deepEqual(snapshot(kept), snapshot(rebuilt), label + ": children differ");
    assert.deepEqual(drawOrder(kept), drawOrder(rebuilt), label + ": draw order differs");
  };
  const edgesPerBody = 12, edgesTotal = 24;

  step("first build", () => {});
  assert.equal(kept.counts.lineGeometry, edgesTotal);
  assert.equal(rebuilt.counts.lineGeometry, edgesTotal);

  // Edge to edge within a, then across to b, then to a face of b, then off the model.
  let before = kept.counts.lineGeometry;
  for (let i = 0; i < 6; i++) step("hover a:e" + i, E => { E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e" + i }; });
  step("hover b:e3", E => { E.hoverTopology = { kind: "edge", partId: "b", persistentId: "b:e3" }; });
  step("hover a face of b", E => { E.hoverTopology = { kind: "face", partId: "b", persistentId: "b:f1" }; });
  step("hover nothing", E => { E.hoverTopology = null; });
  assert.equal(kept.counts.lineGeometry, before, "hover-only refreshes created no edge geometry");
  assert.equal(kept.counts.lineMaterial, before, "hover-only refreshes created no edge material");
  assert.ok(rebuilt.counts.lineGeometry >= before + 9 * edgesPerBody, "the old path rebuilt every edge each time");

  // A selection change is not hover-only: full rebuild of the body it touches.
  before = kept.counts.lineGeometry;
  step("select a:e0", E => { E.topologySelection = [{ kind: "edge", partId: "a", persistentId: "a:e0" }]; });
  assert.equal(kept.counts.lineGeometry, before + edgesPerBody);

  // b's lines are older than a's selected line, which a hovered line in b
  // draws differently against: the first hover in b must rebuild, the next
  // ones may keep the (now newer) lines.
  before = kept.counts.lineGeometry;
  step("hover b:e0 beside a selected edge", E => { E.hoverTopology = { kind: "edge", partId: "b", persistentId: "b:e0" }; });
  assert.equal(kept.counts.lineGeometry, before + edgesPerBody, "order-unsafe restyle fell back to a rebuild");
  before = kept.counts.lineGeometry;
  step("hover b:e1", E => { E.hoverTopology = { kind: "edge", partId: "b", persistentId: "b:e1" }; });
  step("hover b:e2", E => { E.hoverTopology = { kind: "edge", partId: "b", persistentId: "b:e2" }; });
  assert.equal(kept.counts.lineGeometry, before);
  // Back into a, which holds the selection and older lines than b's hover-free ones.
  step("hover a:e4", E => { E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e4" }; });
  step("hover a:e0 (selected and hovered)", E => { E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e0" }; });

  // Settings a line was built with: always the rebuild path, even when not marked dirty.
  before = kept.counts.lineGeometry;
  step("edge colour change", E => { E.edgeColor = "#404040"; E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e2" }; });
  assert.equal(kept.counts.lineGeometry, before + edgesPerBody);
  before = kept.counts.lineGeometry;
  step("finish command", E => { E.finish = true; E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e3" }; });
  assert.equal(kept.counts.lineGeometry, before + edgesPerBody);
  step("finish hover", E => { E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e4" }; });
  step("finish off", E => { E.finish = false; E.hoverTopology = null; });
  before = kept.counts.lineGeometry;
  step("model edges off", E => { E.showModelEdges = false; E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e1" }; });
  assert.equal(kept.counts.lineGeometry, before + edgesPerBody);
  before = kept.counts.lineGeometry;
  step("model edges off, hover", E => { E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e2" }; });
  assert.equal(kept.counts.lineGeometry, before);

  // Dirty (a zoom re-bake, a colour input) always rebuilds.
  before = kept.counts.lineGeometry;
  step("dirty", (E, groups) => { groups.forEach(entry => { entry.dirty = true; }); });
  assert.equal(kept.counts.lineGeometry, before + edgesTotal);
});

test("a body whose edges changed under a kept group rebuilds instead of restyling", () => {
  const kept = makeWorld(), rebuilt = makeWorld({ rebuildAlways: true });
  for (const world of [kept, rebuilt]) world.ctx.refreshDecorations();
  for (const world of [kept, rebuilt]) {
    const entry = world.decoGroups[0].part.entries[2];
    entry.displayPoints = [{ x: 2, y: 0, z: 0 }, { x: 2, y: 11, z: 0 }];
    world.E.hoverTopology = { kind: "edge", partId: "a", persistentId: "a:e7" };
  }
  const before = kept.counts.lineGeometry;
  for (const world of [kept, rebuilt]) world.ctx.refreshDecorations();
  assert.equal(kept.counts.lineGeometry, before + 12);
  assert.deepEqual(snapshot(kept), snapshot(rebuilt));
});
