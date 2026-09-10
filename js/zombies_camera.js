/* One lightweight lens pass; independent of the planner's AO/temporal stack. */
import { THREE, TSL } from "./three_lazy.js";
export function createBodyCamera(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = TSL.pass(scene, camera, { samples: 0 });
  const color = scenePass.getTextureNode("output");
  const strength = TSL.uniform(0.045), clock = TSL.uniform(0), exposure = TSL.uniform(1);
  const uv = TSL.uv(), p = uv.sub(0.5), r2 = TSL.dot(p, p);
  // Fixed center preserves hitscan alignment; a small inset avoids black borders.
  const warped = p.mul(TSL.float(1).add(r2.mul(strength))).mul(0.97).add(0.5).clamp(0.001, 0.999);
  const rgb = color.sample(warped).rgb;
  const fringe = p.mul(r2).mul(strength).mul(0.035);
  const sensor = TSL.fract(TSL.sin(TSL.dot(uv, TSL.vec2(127.1, 311.7)).add(clock)).mul(43758.5453)).sub(0.5).mul(strength).mul(0.12);
  const vignette = TSL.float(1).sub(r2.mul(strength).mul(5));
  pipeline.outputNode = TSL.vec4(TSL.vec3(color.sample(warped.add(fringe)).r, rgb.g, color.sample(warped.sub(fringe)).b).mul(vignette).mul(exposure).add(sensor), 1);
  let lastTime = 0;
  return {
    render(settings, time, blackout) {
      strength.value = settings.lens * 0.07;
      clock.value = time * 19;
      // Slow exposure adaptation to the power state, without per-frame readback.
      const target = blackout ? 1.13 : 1;
      const dt = Math.max(0, Math.min(0.1, time - lastTime));
      lastTime = time;
      exposure.value += ((1 + (target - 1) * settings.flashes) - exposure.value) * (1 - Math.exp(-1.5 * dt));
      pipeline.render();
    },
    dispose() { pipeline.dispose(); scenePass.dispose(); },
  };
}
