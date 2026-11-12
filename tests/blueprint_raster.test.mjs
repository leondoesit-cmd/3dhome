import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeRaster } from '../js/core/blueprint_raster.js';
import { convertCadToWalls } from '../js/cad_to_walls.js';

function drawing(color = [20, 20, 20]) {
  const width = 240, height = 240, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const rect = (x0, y0, x1, y1, rgb = color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...rgb, 255], (y * width + x) * 4);
  };
  rect(20, 20, 220, 27); rect(20, 213, 220, 220);
  rect(20, 20, 27, 220); rect(213, 20, 220, 220);
  rect(117, 20, 124, 80); rect(117, 110, 124, 220);
  // Detached inset and fine text must not turn into extra rooms/walls.
  rect(1, 1, 12, 2); rect(1, 1, 2, 12);
  for (let x = 45; x < 90; x += 5) rect(x, 55, x + 1, 60);
  return { width, height, data };
}

for (const [name, color] of [['black', [20, 20, 20]], ['gray', [185, 184, 190]]]) {
  test(`${name} raster becomes connected editable walls and a door without a service`, () => {
    const result = recognizeRaster(drawing(color), { widthCm: 800 });
    const graph = convertCadToWalls(result.cad);
    assert.equal(result.layout.rooms.length, 2);
    assert.equal(result.layout.w, 800);
    assert.ok(graph.walls.length >= 5);
    assert.ok(graph.openings.some(o => o.type === 'door'));
    assert.equal(graph.diagnostics.unpairedLines, 0);
    assert.equal(graph.diagnostics.rejectedOpenings.length, 0);
    assert.ok(graph.walls.every(w => w.thickness > 0 && w.height === 270));
  });
}

test('width calibration rescales geometry, preserving topology', () => {
  const small = recognizeRaster(drawing(), { widthCm: 600 });
  const big = recognizeRaster(drawing(), { widthCm: 1200 });
  assert.equal(small.cad.lines.length, big.cad.lines.length);
  for (let i = 0; i < small.cad.lines.length; i += 2) {
    for (const axis of ['x', 'z']) {
      const a = (small.cad.lines[i].a[axis] + small.cad.lines[i + 1].a[axis]) / 2;
      const b = (big.cad.lines[i].a[axis] + big.cad.lines[i + 1].a[axis]) / 2;
      assert.ok(Math.abs(b - a * 2) < 1e-9);
    }
  }
});

test('the same drawing at higher resolution retains its two-room topology', () => {
  const source = drawing([185, 184, 190]), width = source.width * 3, height = source.height * 3;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (Math.floor(y / 3) * source.width + Math.floor(x / 3)) * 4;
    data.set(source.data.subarray(i, i + 4), (y * width + x) * 4);
  }
  const result = recognizeRaster({ width, height, data });
  assert.equal(result.layout.rooms.length, 2);
  assert.ok(result.cad.doors.length > 0);
});

test('blank/corrupt images and invalid scale fail instead of importing an invented plan', () => {
  const blank = drawing(); blank.data.fill(255);
  assert.throws(() => recognizeRaster(blank), /No connected walls/);
  assert.throws(() => recognizeRaster({ width: 240, height: 240, data: [] }), /readable/);
  for (const widthCm of [0, NaN, -1, Infinity, 10001]) assert.throws(() => recognizeRaster(drawing(), { widthCm }), /width/);
});
