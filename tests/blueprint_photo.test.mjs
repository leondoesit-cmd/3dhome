// Phone photos of coloured permit plans: red/blue wall fill, windows drawn as
// thin lines, tilt/keystone, and the plan-width field accepting e.g. 807 cm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recognizeRaster, pocheInk, windowLines, wallFill, sheetWallMaterials } from '../js/core/blueprint_raster.js';
import { planRectification, warpImage, applyHomography, scaleRectification } from '../js/core/blueprint_rectify.js';
import { compileVisionBlueprint, blueprintDimensionScale } from '../js/core/blueprint_vision.js';
import { wallPairDimensions } from '../js/core/blueprint_text.js';
import { convertCadToWalls } from '../js/cad_to_walls.js';
import { sourceFunctionText } from './helpers/source_function.mjs';

const RED = [155, 60, 28], BLUE = [51, 147, 215], LINE = [40, 40, 40];

function sheet(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const rect = (x0, y0, x1, y1, rgb) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) data.set([...rgb, 255], (y * width + x) * 4);
  };
  return { width, height, data, rect };
}

// Two rooms. Outer walls are red block with a blue concrete piece, outlined
// in thin dark lines; the left wall has a window drawn as two hairlines.
function colouredPlan() {
  const s = sheet(500, 420);
  const wall = (x0, y0, x1, y1, rgb) => { s.rect(x0, y0, x1, y1, LINE); s.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, rgb); };
  wall(40, 40, 460, 48, RED); wall(40, 372, 460, 380, RED);
  wall(452, 40, 460, 380, BLUE);
  wall(40, 40, 48, 150, RED); wall(40, 250, 48, 380, RED);
  s.rect(40, 150, 41, 250, LINE); s.rect(47, 150, 48, 250, LINE); s.rect(43, 150, 45, 250, LINE);
  wall(250, 40, 258, 170, BLUE); wall(250, 230, 258, 380, BLUE);
  // grid / dimension lines run through the sheet
  for (let x = 20; x < 500; x += 60) s.rect(x, 0, x + 1, 420, [120, 120, 120]);
  for (let y = 20; y < 420; y += 70) s.rect(0, y, 500, y + 1, [120, 120, 120]);
  return s;
}

test('red block and blue concrete fills count as wall ink; pale tints do not', () => {
  for (const rgb of [RED, BLUE, [144, 42, 20], [129, 75, 57], [14, 48, 137]]) assert.equal(pocheInk(...rgb), true, rgb.join());
  for (const rgb of [[255, 255, 255], [234, 237, 244], [200, 220, 240], [120, 120, 120], [60, 160, 60], [250, 200, 190]]) assert.equal(pocheInk(...rgb), false, rgb.join());
});

test('a coloured permit plan becomes connected walls with its hairline window', () => {
  const plan = colouredPlan();
  const result = recognizeRaster(plan, { widthCm: 840 });
  assert.equal(result.layout.rooms.length, 2);
  assert.equal(result.cad.windows.length, 1, 'the hairline window in the left wall');
  const window = result.cad.windows[0], cmPerPx = 840 / (result.bounds.x1 - result.bounds.x0);
  assert.ok(Math.abs(window.center.z - (200 - result.bounds.y0) * cmPerPx) < 15, 'window centred on its hairlines');
  assert.ok(Math.abs(window.width - 100 * cmPerPx) < 20, 'window spans the hairline stretch');
  const left = result.segments.filter(s => s.vertical && Math.abs(s.c - 44) < 6);
  assert.equal(left.length, 1, 'left wall is one run through the window');
  assert.ok(left[0].a <= 50 && left[0].b >= 370);
});

test('a wall interrupted by several windows keeps its full length', () => {
  // Outline runs top to bottom; the red fill stops at three windows, so each
  // fill piece is shorter than a stroke. A median over the column runs used
  // to keep just one middle piece of this wall.
  const s = sheet(400, 420);
  s.rect(40, 40, 360, 56, RED); s.rect(40, 364, 360, 380, RED); s.rect(344, 40, 360, 380, RED);
  s.rect(40, 40, 42, 380, LINE); s.rect(54, 40, 56, 380, LINE);
  for (const [a, b] of [[40, 75], [125, 165], [215, 255], [305, 380]]) s.rect(42, a, 54, b, RED);
  for (const [a, b] of [[75, 125], [165, 215], [255, 305]]) { s.rect(45, a, 46, b, LINE); s.rect(50, a, 51, b, LINE); }
  const result = recognizeRaster(s, { widthCm: 800 });
  const left = result.segments.filter(q => q.vertical && q.c < 70);
  assert.equal(left.length, 1);
  assert.ok(left[0].a <= 50 && left[0].b >= 370, `left wall ${left[0].a}-${left[0].b}`);
  assert.equal(result.cad.windows.length, 3);
  assert.equal(result.layout.rooms.length, 1);
});

test('window evidence needs lines along the wall, not open floor', () => {
  const plan = colouredPlan();
  assert.equal(windowLines(plan, true, 44, 8, 152, 248), true);
  assert.equal(windowLines(plan, true, 254, 8, 172, 228), false, 'a door gap is open floor');
});

test('a keystoned, tilted photo is straightened back to axis-aligned walls', () => {
  const plan = colouredPlan();
  const tilt = 2 * Math.PI / 180, cos = Math.cos(tilt), sin = Math.sin(tilt);
  // rotation about the centre plus perspective, then shifted into frame
  let H = [cos, -sin, 0, sin, cos, 0, 0.00012, 0.00004, 1];
  const corners = [[0, 0], [500, 0], [0, 420], [500, 420]].map(([x, y]) => applyHomography(H, x, y));
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
  H = [H[0] - minX * H[6], H[1] - minX * H[7], -minX, H[3] - minY * H[6], H[4] - minY * H[7], -minY, H[6], H[7], 1];
  const photo = warpImage(plan, { H, width: 520, height: 440 });
  assert.throws(() => recognizeRaster(photo, { widthCm: 840 }), /No connected walls/, 'the tilt alone defeats recognition');
  const measured = planRectification(photo);
  assert.ok(measured && measured.maxMove > 5, 'the distortion is detected');
  const straight = warpImage(photo, measured);
  assert.equal(planRectification(straight), null, 'the result is already straight');
  const result = recognizeRaster(straight, { widthCm: 840 });
  assert.equal(result.layout.rooms.length, 2);
  // The correction measured on a half-size copy applies to the full image.
  const half = scaleRectification(measured, 2);
  assert.equal(half.width, measured.width * 2);
  const p = applyHomography(measured.H, 100, 100), q = applyHomography(half.H, 200, 200);
  assert.ok(Math.abs(q.x - p.x * 2) < 1e-6 && Math.abs(q.y - p.y * 2) < 1e-6);
});

test('a straight scan is left untouched', () => {
  assert.equal(planRectification(colouredPlan()), null);
});

test('blue fill reads as load-bearing concrete, red as block infill, only when the sheet uses both', () => {
  const plan = colouredPlan();
  const result = recognizeRaster(plan, { widthCm: 840 });
  const right = result.segments.findIndex(s => s.vertical && Math.abs(s.c - 456) < 6);
  const top = result.segments.findIndex(s => !s.vertical && Math.abs(s.c - 44) < 6);
  assert.equal(result.wallMaterials[right], 'concrete');
  assert.equal(result.wallMaterials[top], 'block');
  assert.equal(result.wallTypeByLayer['raster-' + right], 'concrete');
  assert.ok(result.warnings.some(w => /blue = reinforced concrete/.test(w)));
  // The walls-only path turns those into wall types through the CAD adapter.
  const graph = convertCadToWalls(result.cad, { wallTypeByLayer: result.wallTypeByLayer });
  assert.ok(graph.walls.some(w => w.wallTypeId === 'concrete') && graph.walls.some(w => w.wallTypeId === 'block'));
  // A sheet that is red throughout says nothing about structure.
  const allRed = colouredPlan();
  for (let i = 0; i < allRed.data.length; i += 4) if (pocheInk(allRed.data[i], allRed.data[i + 1], allRed.data[i + 2])) allRed.data.set(RED, i);
  assert.deepEqual(sheetWallMaterials(allRed, result.segments), result.segments.map(() => null));
  assert.equal(wallFill(plan, { vertical: true, c: 300, a: 100, b: 300, thickness: 8 }), null, 'bare paper is no material');
});

test('the automatic path keeps measured materials on the compiled walls', () => {
  const walls = [[80, 70, 720, 70, 10], [720, 70, 720, 530, 10], [720, 530, 80, 530, 10], [80, 530, 80, 70, 10]];
  const compiled = compileVisionBlueprint({ walls, wallMaterials: ['block', 'concrete', null, 'bogus'], doors: [], windows: [], rooms: [], furniture: [], dimensions: [], warnings: [] },
    { width: 800, height: 600, widthCm: 1000 });
  const bySource = n => compiled.reconstruction.walls.filter(w => w.sourceLayer === 'vision-' + n);
  assert.ok(bySource(0).every(w => w.wallTypeId === 'block' && w.layers[0].material === 'concrete-block' && w.layers[0].structural === false));
  assert.ok(bySource(1).every(w => w.wallTypeId === 'concrete' && w.layers[0].material === 'reinforced-concrete' && w.layers[0].structural === true));
  assert.ok([...bySource(2), ...bySource(3)].every(w => w.wallTypeId !== 'concrete' && w.wallTypeId !== 'block' && w.layers[0].material === 'generic-masonry'));
  const server = readFileSync(new URL('../server/blueprint_vision.mjs', import.meta.url), 'utf8');
  assert.match(server, /analysis\.wallMaterials=payload\.wallMaterials\.map\(m=>m==='concrete'\|\|m==='block'\?m:null\)/);
});

test('manual tracing straightens photos but renders PDFs as they are', () => {
  const source = readFileSync(new URL('../js/blueprint_trace.js', import.meta.url), 'utf8');
  assert.match(sourceFunctionText(source, 'rasterizeImage'), /straightenCanvas\(canvas\)/);
  assert.doesNotMatch(sourceFunctionText(source, 'rasterizePdf'), /straightenCanvas/);
  const modal = readFileSync(new URL('../js/ui_blueprint_trace.js', import.meta.url), 'utf8');
  assert.match(modal, /straightNote\.hidden = !raster\.straightened;/);
});

test('printed numbers without a traceable line are scaled by the walls around them', () => {
  // Rooms at 2 cm/px; walls 10 px thick, numbers give interior sizes.
  const walls = [[0, 0, 600, 0, 10], [0, 400, 600, 400, 10], [0, 0, 0, 400, 10], [600, 0, 600, 400, 10], [300, 0, 300, 400, 10], [0, 200, 300, 200, 10]];
  const box = (x, y, vertical = false) => vertical ? { x0: x - 8, y0: y - 20, x1: x + 8, y1: y + 20 } : { x0: x - 20, y0: y - 8, x1: x + 20, y1: y + 8 };
  const numbers = [
    { text: '580', valueCm: 580, bbox: box(150, 100) },              // 290 px face to face
    { text: '580', valueCm: 580, bbox: box(450, 300) },
    { text: '380', valueCm: 380, bbox: box(80, 100, true) },         // 190 px, upper room height
    { text: '780', valueCm: 780, bbox: box(450, 200, true) },        // 390 px, right room height
    { text: '238', valueCm: 238, bbox: box(150, 300) },              // OCR misread of 580
  ];
  const dims = wallPairDimensions(numbers, walls);
  assert.deepEqual(dims.map(d => d.valueCm).sort(), [380, 580, 580, 780]);
  for (const d of dims) assert.ok(Math.abs(d.valueCm / Math.hypot(d.x2 - d.x1, d.y2 - d.y1) - 2) < .02);
  assert.equal(blueprintDimensionScale(dims).strong, true);
  // Two agreeing numbers are not enough evidence for a scale.
  assert.deepEqual(wallPairDimensions(numbers.slice(0, 2), walls), []);
});

test('the plan width field accepts any centimetre value such as 807', () => {
  const source = readFileSync(new URL('../js/ui_blueprint.js', import.meta.url), 'utf8');
  assert.match(source, /widthIn\.step = "any";/);
  assert.doesNotMatch(source, /widthIn\.step = "10"/);
});
