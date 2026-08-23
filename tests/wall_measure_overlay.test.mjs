import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const planSource = await readFile(new URL("../js/plan2d.js", import.meta.url), "utf8");
const interactionSource = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const measureSource = await readFile(new URL("../js/measure.js", import.meta.url), "utf8");
const cadHudSource = await readFile(new URL("../js/cad_hud.js", import.meta.url), "utf8");

test("the wall tool tracks a live preview point before the first click", () => {
  assert.match(
    interactionSource,
    /if \(S\.tool === "wall"\) \{[\s\S]*The four-way overlay[\s\S]*snapPoint\(px, pz, null\)/,
  );
  assert.match(interactionSource, /S\.tool === "arcwall"\) \{\s*var ap = snapPoint\(px, pz, null\)/);
  assert.match(interactionSource, /S\.tool === "rect" \|\| S\.tool === "slabvoid"\) \{\s*var rrp = snapPoint\(px, pz, null\)/);
});

test("the plan overlay measures from the wall-tool cursor even before drawing", () => {
  const overlay = planSource.slice(
    planSource.indexOf("function drawMeasureOverlay"),
    planSource.indexOf("function drawLiveMeasureCross"),
  );
  assert.match(
    overlay,
    /\(S\.tool === "wall" \|\| S\.tool === "arcwall" \|\| S\.tool === "rect" \|\| S\.tool === "slabvoid"\) && S\.previewPt/,
  );
  assert.doesNotMatch(overlay, /S\.drawing && S\.previewPt/);
  assert.match(planSource, /function drawLiveMeasureCross\(/);
  assert.match(
    planSource,
    /target: drafting && target === "nearest" \? "both" : target/,
  );
});

test("measure4 can report the nearest wall and the nearest item on the same ray", () => {
  assert.match(measureSource, /var both = target === "both"/);
  assert.match(measureSource, /pushHit\(wallT, "wall"\)/);
  assert.match(measureSource, /pushHit\(itemT, "item"\)/);
  assert.match(planSource, /r\.kind === "item"/);
});

test("the CAD snap readout is live while the wall tool is armed", () => {
  assert.match(
    cadHudSource,
    /live = S\.tool === "wall" \|\| S\.tool === "arcwall" \|\| S\.tool === "rect"/,
  );
});
