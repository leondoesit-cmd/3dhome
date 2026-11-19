import test from "node:test";
import assert from "node:assert/strict";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

test("welding checks nearby corners in original pair order without scanning distant corners", () => {
  // Straddle grid boundaries on both axes, include the exact cutoff, and
  // interleave the keep/from indices across cells. Huge coordinates exercise
  // cells where adding one cannot be represented by a double.
  const coords = [[0, 0], [-1.9, 0], [2, 0], [0.2, -1.5], [1.3, 0], [1e40, 0], [1e40, 1], null];
  for (let i = 0; i < 400; i++) coords.push([i * 20 + 500, 100]);
  const idx = coords.map((_, i) => i).filter(i => i !== 3);
  let reads = 0;
  const nodes = coords.map(p => p && ({ get x() { reads++; return p[0]; }, z: p[1] }));
  const expected = [];
  for (const i of idx) for (const j of idx) {
    if (i < j && coords[i] && coords[j] &&
        Math.abs(coords[i][0] - coords[j][0]) < 2 && Math.abs(coords[i][1] - coords[j][1]) < 2)
      expected.push([i, j]);
  }
  const checked = [], welded = [];
  const source = sourceFunctionText(moduleSource("js/interaction.js"), "weldCoincidentNodes");
  Function("S", "usedNodes", "canWeld", "weldNodes", source + "\nweldCoincidentNodes();")(
    { nodes }, () => Object.fromEntries(idx.map(i => [i, true])),
    (i, j) => { checked.push([i, j]); return checked.length % 2 === 1; },
    (i, j) => welded.push([i, j]),
  );
  assert.deepEqual(checked, expected);
  assert.deepEqual(welded, expected.filter((_, i) => i % 2 === 0));
  assert.ok(reads < nodes.length * 10, `read x ${reads} times for ${nodes.length} sparse corners`);
});
