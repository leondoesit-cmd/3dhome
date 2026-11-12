import test from "node:test";
import assert from "node:assert/strict";
import * as cab from "../js/cabinet.js";
import {
  moveColumn, moveSection, evenColumnWidths, columnsEven, mirrorLayout, neighbourSelection,
  setExactSize, sizeEntryChanged,
} from "../js/cabinet_layout_ops.js";

function mk(preset, w, d, h) {
  const it = { id: "ops", type: "cabsys", w, d, h, x: 0, z: 0, rot: 0, room: null };
  it.cab = cab.makeSpec(preset, w, h, d);
  it.cab.auto = false; // the designer marks every structural edit hand-made
  return it;
}

test("moving a column carries its contents, door and identity with it", () => {
  const it = mk("w_classic", 200, 60, 240);
  const ids = it.cab.cols.map((c) => c.hid);
  const middle = JSON.stringify(it.cab.cols[1]);
  assert.equal(moveColumn(it.cab, 1, -1), 0);
  assert.equal(JSON.stringify(it.cab.cols[0]), middle);
  assert.deepEqual(it.cab.cols.map((c) => c.hid), [ids[1], ids[0], ids[2]]);
  assert.equal(moveColumn(it.cab, 0, -1), -1, "nothing left of the first column");
  assert.equal(moveColumn(it.cab, 2, 1), -1, "nothing right of the last column");
  // the cabinet still adds up to its width after the re-fit
  cab.specOf(it);
  const L = cab.layoutCab(it);
  assert.ok(Math.abs(L.cols[L.cols.length - 1].x1 - L.cols[0].x0 - (200 - 2 * it.cab.panel)) < 0.2);
});

test("moving a compartment swaps it with its neighbour and keeps the column height", () => {
  const it = mk("w_classic", 200, 60, 240);
  const col = it.cab.cols[1];
  const types = col.secs.map((s) => s.t);
  const total = col.secs.reduce((n, s) => n + s.h, 0);
  assert.equal(moveSection(it.cab, 1, 0, 1), 1);
  assert.deepEqual(col.secs.slice(0, 2).map((s) => s.t), [types[1], types[0]]);
  assert.equal(moveSection(it.cab, 1, 0, -1), -1);
  assert.equal(moveSection(it.cab, 1, col.secs.length - 1, 1), -1);
  cab.specOf(it);
  assert.ok(Math.abs(col.secs.reduce((n, s) => n + s.h, 0) - total) < 0.5);
});

test("even widths shares the ordinary columns' room equally and leaves fillers alone", () => {
  const it = mk("w_classic", 240, 60, 240);
  it.cab.cols[0].w = 40;
  it.cab.cols[0].fixed = true;
  it.cab.cols.push({ w: 6, kind: "filler", secs: [{ t: "shelves", h: 100 }], door: { t: "none" } });
  cab.specOf(it);
  assert.equal(columnsEven(it.cab), false);
  const fillerBefore = it.cab.cols[3].w;
  assert.equal(evenColumnWidths(it.cab), 3);
  cab.specOf(it);
  const plain = it.cab.cols.filter((c) => !c.kind || c.kind === "normal").map((c) => c.w);
  assert.ok(Math.max(...plain) - Math.min(...plain) < 0.2, JSON.stringify(plain));
  assert.ok(Math.abs(it.cab.cols[3].w - fillerBefore) < 0.11, "the filler keeps its width");
  assert.equal(columnsEven(it.cab), true);
  assert.equal(evenColumnWidths({ cols: [{ w: 60 }] }), 0, "one column has nothing to even out");
});

test("mirroring reverses the columns and rehangs every single leaf", () => {
  const it = mk("w_classic", 200, 60, 240);
  const before = it.cab.cols.map((c) => [c.hid, c.door.hinge]);
  assert.equal(mirrorLayout(it.cab), true);
  const flip = { L: "R", R: "L" };
  assert.deepEqual(
    it.cab.cols.map((c) => [c.hid, c.door.hinge]),
    before.slice().reverse().map(([hid, h]) => [hid, flip[h]]),
  );
  assert.equal(mirrorLayout(it.cab), true);
  assert.deepEqual(it.cab.cols.map((c) => [c.hid, c.door.hinge]), before, "twice is the original");
  assert.equal(mirrorLayout({ cols: [{ w: 60, door: { t: "none" } }] }), false);
  // a single leaf with no side recorded hangs right, so its mirror hangs left
  const single = { cols: [{ w: 60, door: { t: "hinged" } }] };
  assert.equal(mirrorLayout(single), true);
  assert.equal(single.cols[0].door.hinge, "L");
  const it2 = { id: "one", type: "cabsys", w: 60, d: 60, h: 200, cab: { fam: "free", cols: [{ w: 56, secs: [{ t: "shelves", h: 150 }], door: { t: "hinged" } }] } };
  const hingeX = (item) => cab.layoutCab(item).parts.filter((p) => p.role === "hinge").map((p) => Math.sign(p.x));
  assert.ok(hingeX(it2).every((s) => s > 0), "unrecorded side hangs right");
  mirrorLayout(it2.cab);
  assert.ok(hingeX(it2).every((s) => s < 0), "the mirror hangs left");
});

test("arrow keys keep the selection's level and its height", () => {
  const it = mk("w_classic", 200, 60, 240);
  const L = cab.layoutCab(it);
  // from the top compartment of column 0, right lands on the top one of column 1
  const top0 = L.cols[0].secs.length - 1;
  const r = neighbourSelection(L, { col: 0, sec: top0 }, "ArrowRight");
  assert.equal(r.col, 1);
  assert.equal(r.sec, L.cols[1].secs.length - 1);
  // a selected column stays a column
  assert.deepEqual(neighbourSelection(L, { col: 1, sec: null }, "ArrowLeft"), { col: 0, sec: null });
  // the ends clamp
  assert.equal(neighbourSelection(L, { col: 0, sec: null }, "ArrowLeft").col, 0);
  // up walks bottom-up; from a column, up enters at the bottom and down at the top
  assert.deepEqual(neighbourSelection(L, { col: 1, sec: 0 }, "ArrowUp"), { col: 1, sec: 1 });
  assert.deepEqual(neighbourSelection(L, { col: 1, sec: null }, "ArrowUp"), { col: 1, sec: 0 });
  assert.deepEqual(neighbourSelection(L, { col: 1, sec: null }, "ArrowDown"), { col: 1, sec: L.cols[1].secs.length - 1 });
});

test("an exact compartment height sticks even when the rest of the column is rigid", async () => {
  const { setExactSize } = await import("../js/cabinet_layout_ops.js");
  const it = mk("w_classic", 200, 60, 240);
  const col = it.cab.cols[1]; // drawers / shelves / top box: only the shelves flex
  cab.specOf(it);
  const total = col.secs.reduce((n, s) => n + s.h, 0);
  const si = col.secs.findIndex((s) => s.t === "shelves");
  const minOf = (s) => Math.max(cab.STD.minSec, cab.SEC[s.t].min);
  const flexOf = (s) => !s.fixed && !!cab.SEC[s.t].flex;
  assert.equal(setExactSize(col.secs, si, 50, { key: "h", minOf, flexOf }), 50);
  cab.specOf(it);
  assert.ok(Math.abs(col.secs[si].h - 50) < 0.11, "the typed size is the built size: " + col.secs[si].h);
  assert.ok(Math.abs(col.secs.reduce((n, s) => n + s.h, 0) - total) < 0.5, "the column still fills the cabinet");
  // growing past what the others can give stops at their minimums
  const got = setExactSize(col.secs, si, 5000, { key: "h", minOf, flexOf });
  assert.ok(got < 5000 && got > 50);
  assert.ok(col.secs.every((s, j) => j === si || s.h >= minOf(s) - 1e-9));
});

test("an exact column width takes the difference from a free neighbour, not a pinned one", async () => {
  const { setExactSize } = await import("../js/cabinet_layout_ops.js");
  const it = mk("w_classic", 200, 60, 240);
  cab.specOf(it);
  const [a, b, c] = it.cab.cols.map((x) => x.w);
  it.cab.cols[2].fixed = true; // set by hand earlier
  const minOf = () => cab.STD.minCol;
  assert.equal(setExactSize(it.cab.cols, 1, b + 10, { key: "w", minOf }), b + 10);
  assert.ok(Math.abs(it.cab.cols[0].w - (a - 10)) < 1e-9, "the free column gave way");
  assert.equal(it.cab.cols[2].w, c, "the pinned column kept its width");
  cab.specOf(it);
  assert.ok(Math.abs(it.cab.cols[1].w - (b + 10)) < 0.11);
  assert.equal(setExactSize([{ w: 60 }], 0, 80, { key: "w", minOf }), 60, "a single column fills the cabinet");
});

test("size entry comparison ignores surrounding whitespace, not changed digits or units", () => {
  assert.equal(sizeEntryChanged("23.3", " 23.3 "), false);
  assert.equal(sizeEntryChanged("23.3", "23.30"), true);
  assert.equal(sizeEntryChanged("23.3", "59.3cm"), true);
  assert.equal(sizeEntryChanged("23.3", ""), true);
});

const widthOptions = {
  key: "w",
  minOf: c => !c.kind || c.kind === "normal" ? cab.STD.minCol : c.w,
  canGrow: c => !c.kind || c.kind === "normal",
};

test("shrinking past an unpinned filler gives freed width to an ordinary column", () => {
  const cols = [{ w: 60 }, { w: 5, kind: "filler" }, { w: 60, kind: "normal" }];
  assert.equal(setExactSize(cols, 0, 25, widthOptions), 25);
  assert.deepEqual(cols, [{ w: 25, fixed: true }, { w: 5, kind: "filler" }, { w: 95, kind: "normal" }]);
});

test("only fillers or blind corners next to a shrinking column leave the run and pins unchanged", () => {
  const cols = [{ w: 5, kind: "filler" }, { w: 60 }, { w: 20, kind: "blind" }];
  const before = structuredClone(cols);
  assert.equal(setExactSize(cols, 1, 25, widthOptions), 60);
  assert.deepEqual(cols, before);
});

test("growing a column never takes from a filler or blind corner", () => {
  const cols = [{ w: 60 }, { w: 5, kind: "filler" }, { w: 60 }, { w: 20, kind: "blind" }];
  assert.equal(setExactSize(cols, 0, 80, widthOptions), 80);
  assert.deepEqual(cols.map(c => c.w), [80, 5, 40, 20]);
  assert.equal(setExactSize(cols, 0, 200, widthOptions), 90);
  assert.deepEqual(cols.map(c => c.w), [90, 5, cab.STD.minCol, 20]);
  const blocked = [{ w: 60 }, { w: 5, kind: "filler" }];
  const before = structuredClone(blocked);
  assert.equal(setExactSize(blocked, 0, 80, widthOptions), 60);
  assert.deepEqual(blocked, before);
});

test("freed width goes to flexible eligible neighbours first, then nearest pinned ones", () => {
  const cols = [{ w: 60 }, { w: 5, kind: "filler" }, { w: 60, fixed: true }, { w: 60 }];
  setExactSize(cols, 0, 25, widthOptions);
  assert.deepEqual(cols.map(c => c.w), [25, 5, 60, 95]);
  const pinned = [{ w: 60, fixed: true }, { w: 60 }, { w: 5, kind: "filler" }, { w: 60, fixed: true }];
  setExactSize(pinned, 1, 25, widthOptions);
  assert.deepEqual(pinned.map(c => c.w), [95, 25, 5, 60]);
  const tied = [{ w: 60 }, { w: 60 }, { w: 60 }];
  setExactSize(tied, 1, 25, widthOptions);
  assert.deepEqual(tied.map(c => c.w), [60, 25, 95], "next wins at the same distance");
});

test("section-style size edits without canGrow still give room to rigid neighbours", () => {
  const secs = [{ h: 60 }, { h: 40, fixed: true }, { h: 30, fixed: true }];
  const opts = { key: "h", minOf: () => 12, flexOf: s => !s.fixed };
  assert.equal(setExactSize(secs, 0, 25, opts), 25);
  assert.deepEqual(secs, [{ h: 25, fixed: true }, { h: 75, fixed: true }, { h: 30, fixed: true }]);
});

test("setting the current size leaves an unpinned member unpinned", () => {
  const cols = [{ w: 60 }, { w: 60 }];
  assert.equal(setExactSize(cols, 0, 60, widthOptions), 60);
  assert.deepEqual(cols, [{ w: 60 }, { w: 60 }]);
});

test("single-column non-handed fronts have no mirror and retain their hinge field", () => {
  for (const [t, w, leaves] of [
    ["sliding", 60], ["lift", 60], ["hinged", cab.STD.maxDoor + 1],
    ["hinged", 60, 2], ["glass", 60, 2], ["mirror", 60, 2], ["folding", 60, 2],
    ["none", 60], ["drawer", 60],
  ]) {
    const spec = { cols: [{ w, door: { t, leaves, hinge: "R" } }] };
    const before = structuredClone(spec);
    assert.equal(mirrorLayout(spec), false, `${t}, w=${w}, leaves=${leaves}`);
    assert.deepEqual(spec, before);
  }
});

test("single effective hinged, glass, mirror and folding leaves flip sides", () => {
  for (const t of ["hinged", "glass", "mirror", "folding"]) {
    for (const [w, leaves] of [[60, undefined], [cab.STD.maxDoor, undefined], [100, 1]]) {
      const spec = { cols: [{ w, door: { t, leaves, hinge: "L" } }] };
      assert.equal(mirrorLayout(spec), true, t);
      assert.equal(spec.cols[0].door.hinge, "R");
      assert.equal(mirrorLayout(spec), true);
      assert.equal(spec.cols[0].door.hinge, "L");
    }
  }
});

test("multiple columns reverse even with no handed doors, preserving unhanded hinge fields", () => {
  const a = { w: 60, door: { t: "sliding", hinge: "L" } };
  const b = { w: 60, door: { t: "lift", hinge: "R" } };
  const spec = { cols: [a, b] };
  assert.equal(mirrorLayout(spec), true);
  assert.deepEqual(spec.cols, [b, a]);
  assert.equal(a.door.hinge, "L");
  assert.equal(b.door.hinge, "R");
});

test("mirror uses the normalized width used to build the actual door", () => {
  const it = { type: "cabsys", w: 100, h: 200, d: 60,
    cab: { fam: "wardrobe", auto: false, cols: [{ w: 60, door: { t: "hinged" }, secs: [{ t: "shelves", h: 150 }] }] } };
  const layout = cab.layoutCab(it);
  assert.ok(it.cab.cols[0].w > cab.STD.maxDoor);
  assert.equal(layout.cols[0].w, it.cab.cols[0].w);
  assert.equal(layout.cols[0].doorLeaves, 2);
  assert.equal(mirrorLayout(it.cab), false);
});
