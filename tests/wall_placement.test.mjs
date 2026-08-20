import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { nearestWallLanding } from "../js/geometry.js";

const interaction = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const state = await readFile(new URL("../js/state.js", import.meta.url), "utf8");

test("committing a wall carries its endpoint into a continuous placement run", () => {
  const body = interaction.slice(
    interaction.indexOf("export function wallPoint(p)"),
    interaction.indexOf("export function wallPointPolar"),
  );

  assert.match(body, /S\.drawFrom\s*=\s*nb/);
  assert.match(body, /S\.drawing\s*=\s*true/);
  assert.match(body, /S\.previewPt\s*=\s*\{\s*x:\s*S\.nodes\[nb\]\.x/);
  assert.doesNotMatch(body, /setTool\("select"\)/);
});

test("the first wall supports a drag-release commit without removing click-click", () => {
  assert.match(state, /wallPress:\s*null/);
  assert.match(interaction, /var wasDrawing = S\.drawing;[\s\S]*S\.wallPress = \{ pointerId:/);
  assert.match(
    interaction,
    /e\.type === "pointerup"[\s\S]*Math\.hypot\(wox - wp\.x, woy - wp\.y\) > 5[\s\S]*wallPoint\(snapWallPoint[\s\S]*finishDraw\(\)/,
  );
});

test("finishing a run clears every placement transient", () => {
  const body = interaction.slice(
    interaction.indexOf("export function finishDraw()"),
    interaction.indexOf("export function wallPoint(p)"),
  );

  for (const field of ["drawing", "drawFrom", "drawStart", "drawFromSplit", "drawWalls", "wallPress", "previewPt"])
    assert.match(body, new RegExp(`S\\.${field}\\s*=`));
});

test("ending a run repairs only loose endpoints created by that run", () => {
  assert.match(interaction, /function healDrawnWallEnds\(\)/);
  assert.match(interaction, /var ids = S\.drawWalls \|\| \[\]/);
  assert.match(interaction, /if \(degree !== 1\) return/);
  assert.match(interaction, /nearestWallLanding\(n\.x, n\.z, joinTol, \[ni\]\)/);
  assert.match(interaction, /weldNodes\(target, ni\)/);
});

test("a near-miss endpoint projects onto a wall for a real T-junction", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 0, z: 400 }, { x: 200, z: 100 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];

  const hit = nearestWallLanding(24, 250, 30, [2]);

  assert.ok(hit);
  assert.equal(hit.wall.id, 1);
  assert.equal(hit.x, 0);
  assert.equal(hit.z, 250);
  assert.equal(hit.s, 250);
});

test("auto-join never folds a segment back onto a wall at its active origin", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 0, z: 400 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];

  assert.equal(nearestWallLanding(20, 20, 30, [0]), null);
});

/* Chief Architect snaps wall SURFACES. Drawing off an opening's jamb therefore
   has to land the new wall's face on the jamb, which means the centreline goes
   half a wall thickness back into the solid side — otherwise half the wall sits
   inside the passage and an 86 cm opening becomes a 76 cm way through. The
   cursor keeps being measured against the jamb itself, so the target is still
   the line the user is aiming at. */
test("a wall drawn off a jamb lands its face on the jamb, not its centreline", () => {
  const body = interaction.slice(
    interaction.indexOf("A wall can terminate at an opening jamb"),
    interaction.indexOf("8. wall extension line"),
  );

  assert.match(body, /faceBack = drawFaceBack\(\)/);
  assert.match(body, /\[\[o\.s - half, -1\], \[o\.s \+ half, 1\]\]/);
  assert.match(body, /clamp\(s \+ jamb\[1\] \* faceBack, 0, g\.L\)/);
  // committed at the setback, but measured from the jamb (offer's `aim`)
  assert.match(body, /var backed = wallPointAt\(w, sc\), jambPoint = wallPointAt\(w, s\)/);
  assert.match(body, /offer\("jamb", backed\.x, backed\.z, \{ wall: w, s: sc \}, jambPoint\)/);
  assert.match(interaction, /function offer\(kind, x, z, extra, aim\)/);
  assert.match(interaction, /var ax = aim \? aim\.x : x/);
});

/* Both candidates are offered at the cursor's own projection onto the wall, so
   at the jamb they tie on distance and the bonus decides. The warning used to
   win there, which made the one legal landing report "cannot connect inside an
   opening". Out of snapping range of a jamb it still wins, which is its job. */
test("the jamb target outranks the blocked-opening warning it borders", () => {
  const bonus = interaction.slice(
    interaction.indexOf("const SNAP_BONUS"),
    interaction.indexOf("function overrideKind"),
  );
  const read = (k) => Number(new RegExp(`${k}:\\s*(\\d+)`).exec(bonus)[1]);

  assert.ok(read("jamb") > read("openingBlocked"));
  assert.ok(read("openingBlocked") > read("wall"));
});

test("alignment inference includes opening jambs and is preserved during ORTHO mode", () => {
  assert.match(interaction, /var alignTargets = \[\];/);
  assert.match(interaction, /alignTargets\.push\(wallPointAt\(w, sc\)\);/);
  assert.match(interaction, /if\s*\(snapOn\("align"\)\)/);
});
