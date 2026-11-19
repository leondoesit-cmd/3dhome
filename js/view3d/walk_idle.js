/* Third-person walk's idle skip. Standing still in tpv used to re-run
   walkLook every frame: a camera-boom sweep over every layer root, a paint and
   a walk:look event, each repeating the frame before. This holds the decision
   whether this frame's walkLook would change nothing, with no three.js import
   so Node can test it (tests/walk_idle.test.mjs).

   A frame may skip only when ALL of these hold:
   - nothing in the scene may have moved (the render loop's hint: a requested
     paint, a live animation in the last two frames, busy physics) and no
     rebuild landed since the last full look (invalidate());
   - every input of the look (pose, view, profile, camera and avatar as left by
     the last look, layer roots) is exactly what the last full look saw;
   - the boom easing would not move with this frame's dt (its fixed point);
   - a full look already ran WALK_IDLE_TRAIL_MS after the pose last changed, so
     net.js's 80 ms pose throttle has let the final pose through to peers. */
import { cameraRetraction } from "../navigation_profile.js";

export const WALK_IDLE_TRAIL_MS = 120;

export function sameWalkIdleKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

export function createWalkIdle() {
  var memo = null;
  return {
    // after every full third-person look: its inputs/outputs and the boom
    record: function (key, boom, allowed, desired, now) {
      var changedAt = memo && sameWalkIdleKey(memo.key, key) ? memo.changedAt : now;
      memo = {
        key: key, boom: boom, allowed: allowed, desired: desired, changedAt: changedAt,
        trailed: now - changedAt >= WALK_IDLE_TRAIL_MS,
      };
    },
    invalidate: function () { memo = null; },
    // dt: the boom step this frame's look would take (walkLook's own clamp)
    canSkip: function (key, boom, sceneMoved, dt) {
      if (!memo || sceneMoved !== false || !memo.trailed) return false;
      if (!Object.is(boom, memo.boom) || !sameWalkIdleKey(memo.key, key)) return false;
      return Object.is(cameraRetraction(boom, memo.allowed, memo.desired, dt), boom);
    },
  };
}
