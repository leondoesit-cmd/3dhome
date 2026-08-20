import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { welcomeGlyph, WELCOME_GLYPH_KEYS } from "../js/modeler_welcome_glyphs.js";

const ARTS = [
  "blank", "assembly", "box", "cyl", "sph",
  "sketch", "cube", "flower", "mates", "screw",
  "gear", "studball", "dreidel", "pattern",
];

test("each start-gallery art key has a distinct CAD silhouette", () => {
  assert.deepEqual([...WELCOME_GLYPH_KEYS].sort(), [...ARTS].sort());
  const svgs = ARTS.map(welcomeGlyph);
  for (const svg of svgs) {
    assert.match(svg, /^<svg class="md-cad-glyph"/);
    assert.match(svg, /viewBox="0 0 80 56"/);
    assert.match(svg, /stroke="currentColor"/);
  }
  assert.equal(new Set(svgs).size, svgs.length);
});

test("the modeler start screen wires those glyphs and drops the missing cubes-three icon", async () => {
  const modeler = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
  const commands = await readFile(new URL("../js/modeler_commands.js", import.meta.url), "utf8");
  assert.match(modeler, /import \{ welcomeGlyph \} from "\.\/modeler_welcome_glyphs\.js"/);
  assert.match(modeler, /welcomeGlyph\(card\.art\)/);
  assert.match(modeler, /art:"mates"/);
  assert.doesNotMatch(modeler, /ph-cubes-three/);
  assert.doesNotMatch(commands, /ph-cubes-three/);
});
