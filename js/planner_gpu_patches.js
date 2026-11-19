// Narrow r185 renderer hooks. Only the planner opts in after backend selection.
const plannerRenderers = new WeakSet();
const shadowPrototypes = new WeakSet();
const textureUtilities = new WeakSet();

export function installPlannerGpuPatches(three, renderer) {
  if (three.REVISION !== "185" || !renderer) return;
  plannerRenderers.add(renderer);
  const proto = three.PointShadowNode?.prototype;
  if (typeof proto?.renderShadow === "function" && !shadowPrototypes.has(proto)) {
    installPointShadows(three, proto);
    shadowPrototypes.add(proto);
  }
  const utils = renderer.backend?.textureUtils;
  if (renderer.backend?.isWebGPUBackend && typeof utils?.updateTexture === "function" &&
      typeof utils.backend?.get === "function" && !textureUtilities.has(utils)) {
    installAtlasUpdates(three, utils);
    textureUtilities.add(utils);
  }
}

function installPointShadows(T, proto) {
  const original = proto.renderShadow, poses = new WeakMap();
  proto.renderShadow = function (frame) {
    const { shadow, shadowMap, light } = this;
    const r = frame?.renderer, cam = shadow?.camera;
    if (!plannerRenderers.has(r) || shadow?.plannerRegionRenderer !== r ||
        !cam?.projectionMatrix?.isMatrix4 || !cam.layers || !shadow.mapSize ||
        !shadowMap?.depthTexture || !light?.matrixWorld?.isMatrix4 ||
        typeof shadow._frustum?.intersectsBox !== "function" ||
        ![T.WebGPUCoordinateSystem, T.WebGLCoordinateSystem].includes(r.coordinateSystem)) {
      poses.delete(this);
      return original.apply(this, arguments);
    }
    const pos = new T.Vector3().setFromMatrixPosition(light.matrixWorld);
    const p = poses.get(this), region = shadow.plannerRegion;
    if (region?.isBox3 && !shadow.needsUpdate && p?.renderer === r && p.map === shadowMap &&
        p.width === shadow.mapSize.width && p.width === shadowMap.width && p.width === shadowMap.height &&
        p.depth === shadowMap.depthTexture && p.version === p.depth.version &&
        p.pos.equals(pos) && p.layers === cam.layers.mask && p.near === cam.near &&
        p.far === cam.far && p.far === (light.distance || cam.far) && p.projection.equals(cam.projectionMatrix) &&
        p.system === r.coordinateSystem && p.cameraSystem === cam.coordinateSystem && p.reversed === cam.reversedDepth) {
      return renderRegion(T, this, frame, pos, region);
    }
    poses.delete(this);
    const result = original.apply(this, arguments);
    poses.set(this, { renderer: r, map: shadowMap, width: shadowMap.width, depth: shadowMap.depthTexture,
      version: shadowMap.depthTexture.version, pos, layers: cam.layers.mask, near: cam.near, far: cam.far,
      system: r.coordinateSystem, cameraSystem: cam.coordinateSystem, reversed: cam.reversedDepth,
      projection: cam.projectionMatrix.clone() });
    return result;
  };
}

// Same camera orientation, projection and clear state as r185 PointShadowNode.
// The camera and frustum end on face five even when that face is retained.
function renderRegion(T, node, { renderer, scene }, pos, region) {
  const { shadow, shadowMap, light } = node, cam = shadow.camera;
  const gpu = renderer.coordinateSystem === T.WebGPUCoordinateSystem;
  const target = new T.Vector3(), matrix = new T.Matrix4();
  const auto = renderer.autoClear, color = renderer.getClearColor(new T.Color());
  const alpha = renderer.getClearAlpha(), name = scene.name;
  renderer.autoClear = false;
  renderer.setClearColor(shadow.clearColor, shadow.clearAlpha);
  try {
    shadow.matrix.makeTranslation(-pos.x, -pos.y, -pos.z);
    for (let face = 0; face < 6; face++) {
      const axis = Math.floor(face / 2), sign = face % 2 ? -1 : 1;
      target.copy(pos).setComponent(axis, pos.getComponent(axis) + (axis === 1 && gpu ? -sign : sign));
      if (axis === 1) cam.up.set(0, 0, gpu ? -sign : sign);
      else cam.up.set(0, -1, 0);
      cam.position.copy(pos);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      shadow._frustum.setFromProjectionMatrix(matrix, cam.coordinateSystem, cam.reversedDepth);
      if (!shadow._frustum.intersectsBox(region)) continue;
      renderer.setRenderTarget(shadowMap, face);
      renderer.clear();
      scene.name = `Point Light Shadow [ ${light.name || "ID: " + light.id} ] - Face ${face + 1}`;
      renderer.render(scene, cam);
    }
  } finally {
    scene.name = name;
    renderer.autoClear = auto;
    renderer.setClearColor(color, alpha);
  }
}

function installAtlasUpdates(T, utils) {
  const original = utils.updateTexture, uploads = new WeakMap();
  utils.updateTexture = function (texture, options) {
    const atlas = texture?.plannerRoomAtlas;
    if (!atlas || !texture.isDataTexture || texture.isRenderTargetTexture || texture.flipY ||
        texture.generateMipmaps || texture.mipmaps?.length !== 0 || options?.needsMipmaps ||
        texture.type !== T.HalfFloatType || texture.format !== T.RGBAFormat) {
      uploads.delete(texture);
      return original.apply(this, arguments);
    }
    const state = this.backend.get(texture), desc = state?.textureDescriptorGPU, img = options?.image;
    const queue = this.backend.device?.queue;
    if (!state?.texture || desc?.format !== "rgba16float" || desc.mipLevelCount !== 1 ||
        !img || desc.size?.width !== img.width || desc.size?.height !== img.height ||
        !(img.data instanceof Uint16Array) || img.data.length !== 4 * img.width * img.height ||
        typeof queue?.writeTexture !== "function") {
      uploads.delete(texture);
      return original.apply(this, arguments);
    }
    const previous = uploads.get(texture);
    uploads.delete(texture);
    if (previous === state.texture && state.version === texture.version - 1 && atlas.version === texture.version &&
        Array.isArray(atlas.regions) && atlas.regions.length && atlas.regions.every(rect => rect &&
          [rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) && rect.x >= 0 && rect.y >= 0 &&
          rect.width > 0 && rect.height > 0 && rect.x + rect.width <= img.width && rect.y + rect.height <= img.height)) {
      for (const { x, y, width, height } of atlas.regions) {
        const packed = new Uint16Array(4 * width * height);
        for (let row = 0; row < height; row++) {
          const start = 4 * ((y + row) * img.width + x);
          packed.set(img.data.subarray(start, start + 4 * width), 4 * row * width);
        }
        queue.writeTexture({ texture: state.texture, origin: { x, y } }, packed, { bytesPerRow: width * 8 }, { width, height });
      }
      state.version = texture.version;
    } else {
      original.apply(this, arguments);
    }
    uploads.set(texture, state.texture);
  };
}
