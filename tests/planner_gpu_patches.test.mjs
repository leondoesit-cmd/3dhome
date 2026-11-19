import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installPlannerGpuPatches } from "../js/planner_gpu_patches.js";

test("every vendored three file is byte-identical to HEAD", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const git = args => execFileSync("git", args, { cwd, maxBuffer: 16 * 1024 ** 2 });
  const tracked = git(["ls-tree", "-rz", "--name-only", "HEAD", "vendor/three"]).toString().split("\0").filter(Boolean);
  function files(dir) {
    return readdirSync(new URL("../" + dir + "/", import.meta.url), { withFileTypes: true }).flatMap(entry => {
      const path = dir + "/" + entry.name;
      return entry.isDirectory() ? files(path) : [path];
    });
  }
  assert.deepEqual(files("vendor/three").sort(), tracked.sort());
  for (const path of tracked) {
    assert.ok(readFileSync(new URL("../" + path, import.meta.url)).equals(git(["show", "HEAD:" + path])), path);
  }
});

test("missing flags or internals delegate to the original method with its receiver and arguments", () => {
  const calls = [];
  function original(...args) { calls.push([this, ...args]); return 17; }
  class PointShadowNode {}
  PointShadowNode.prototype.renderShadow = original;
  const backend = { isWebGPUBackend: true, get() {} };
  const utils = backend.textureUtils = { backend, updateTexture: original };
  const renderer = { backend }, T = { REVISION: "186", PointShadowNode };
  installPlannerGpuPatches(T, renderer);
  assert.equal(PointShadowNode.prototype.renderShadow, original);
  assert.equal(utils.updateTexture, original);
  installPlannerGpuPatches({ ...T, REVISION: "185" }, renderer);
  const node = new PointShadowNode(), frame = { renderer };
  for (const shadow of [{}, { plannerRegionRenderer: renderer }, { plannerRegionRenderer: {} }]) {
    node.shadow = shadow;
    assert.equal(node.renderShadow(frame), 17);
    assert.deepEqual(calls.pop(), [node, frame]);
  }
  for (const texture of [{}, { plannerRoomAtlas: {} }]) {
    assert.equal(utils.updateTexture(texture, {}), 17);
    assert.deepEqual(calls.pop(), [utils, texture, {}]);
  }
});
