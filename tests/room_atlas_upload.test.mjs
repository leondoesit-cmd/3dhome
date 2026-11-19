import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.webgpu.js";
import { createRoomBounce, GRID } from "../js/room_bounce.js";
import { installPlannerGpuPatches } from "../js/planner_gpu_patches.js";

// Exercise the vendored WebGPU texture utility. The queue records the size
// of the supplied BufferSource and replays its origin/stride into GPU storage.
function recordingRenderer(map) {
  const renderer = new THREE.WebGPURenderer({canvas: {width: 1, height: 1, style: {}}});
  const backend = renderer.backend;
  let bytes = 0;
  backend.device = {queue: {writeTexture(destination, data, layout, extent) {
    const storage = destination.texture, {width, height} = extent;
    const {x = 0, y = 0} = destination.origin;
    assert.ok(x >= 0 && y >= 0 && x + width <= map.image.width && y + height <= map.image.height);
    assert.equal(layout.bytesPerRow, width * 8);
    assert.equal(data.buffer.byteLength, data.byteLength, "partial transfers own a compact buffer");
    bytes += data.byteLength;
    for (let row = 0; row < height; row++) {
      const src = ((layout.offset || 0) + row * layout.bytesPerRow) / 2;
      const dst = 4 * ((y + row) * map.image.width + x);
      storage.set(data.subarray(src, src + 4 * width), dst);
    }
  }}};
  const state = backend.get(map);
  function replaceStorage() {
    state.texture = new Uint16Array(map.image.data.length);
    state.textureDescriptorGPU = {format: "rgba16float", mipLevelCount: 1, size: map.image};
  }
  replaceStorage();
  installPlannerGpuPatches(THREE, renderer);
  return {
    replaceStorage,
    upload() {
      bytes = 0;
      backend.updateTexture(map, {image: map.image});
      const actual = Buffer.from(state.texture.buffer), expected = Buffer.from(map.image.data.buffer);
      assert.equal(Buffer.compare(actual, expected), 0, "every atlas byte matches a fresh complete upload");
      return bytes;
    },
  };
}

test("WebGPU patches field-only atlas versions after a complete upload to the same storage", t => {
  const bounce = createRoomBounce(THREE, THREE.TSL);
  const room = i => ({pts: [{x: i, z: 0}, {x: i + 1, z: 0}, {x: i + 1, z: 1}, {x: i, z: 1}]});
  const rooms = Array.from({length: GRID + 4}, (_, i) => room(i));
  const stacked = [{rooms: [room(0)], dy: 250, place: new THREE.Vector4()}];
  bounce.setRooms(rooms, 250, stacked);
  bounce.setPathRecords([Float32Array.of(1, 1, 1, 1)]);
  const fields = rooms.map(() => [1, 0.2, 0.5]), upper = [[[0.4, 0.7, 0.9]]];
  bounce.setIrradiance(fields, upper);
  const map = bounce.loopMasks.hoist()[0].value;
  const a = recordingRenderer(map), b = recordingRenderer(map);
  const full = map.image.data.byteLength;
  assert.equal(a.upload(), full);
  assert.equal(b.upload(), full);

  const version = map.version;
  bounce.setIrradiance(fields, upper);
  assert.equal(map.version, version, "equal encoded fields queue no upload");
  let fiveTransfers = 0;
  for (let i = 0; i < 5; i++) {
    fields[GRID + 2][0]++;
    upper[0][0][2]++;
    bounce.setIrradiance(fields, upper);
    fiveTransfers += a.upload();
  }
  assert.equal(fiveTransfers, 5 * 2 * 8);
  t.diagnostic(`five two-storey field updates: ${5 * full} -> ${fiveTransfers} submitted bytes`);
  assert.equal(b.upload(), full, "preview that skipped versions catches up");

  fields[0][2]++;
  bounce.setIrradiance(fields, upper);
  a.replaceStorage();
  assert.equal(a.upload(), full, "replacement GPU allocation receives geometry and wall records too");
  assert.equal(b.upload(), 8);

  fields[1][0]++;
  fields[GRID + 3][2]++;
  bounce.setIrradiance(fields, upper);
  assert.equal(a.upload(), 2 * 3 * 8, "multi-column rectangle repacked from strided atlas rows");
  assert.equal(b.upload(), 2 * 3 * 8);

  bounce.setPathRecords([Float32Array.of(2, 1, 1, 1)]);
  assert.equal(a.upload(), full, "a wall record changed at the same width");
  fields[1][2]++;
  bounce.setIrradiance(fields, upper);
  assert.equal(a.upload(), 8);
  assert.equal(b.upload(), full, "unseen wall edit followed by a field edit");
  bounce.setRooms(rooms, 275, stacked);
  bounce.setIrradiance(fields, upper);
  assert.equal(a.upload(), full, "room geometry and RGB changed together");
  bounce.setPathRecords([new Float32Array(4 * (GRID + 1)).fill(2)]);
  a.replaceStorage();
  fields[1][0]++;
  bounce.setIrradiance(fields, upper);
  assert.ok(map.image.data.byteLength > full);
  assert.equal(a.upload(), map.image.data.byteLength, "grown wall atlas");
});
