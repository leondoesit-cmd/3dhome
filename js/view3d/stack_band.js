/* MEP-only rebuilds and the whole-house floor stack. rebuildMEP3D swaps the
   services and nothing else, yet its "scene3d:rebuilt" sent the floor stack
   (js/view3d/floor_stack.js) through a full sync that threw away and rebuilt
   the live storey's wall band and slab. The event keeps its name, so every
   other listener still gets it; it now says it was MEP-only, and the band,
   which reads walls, rooms and levels but no MEP state, is kept when the
   levels it was built for still hold. No three.js import, so Node tests it
   (tests/stack_band.test.mjs). */

export function mepRebuiltEvent() {
  return new CustomEvent("scene3d:rebuilt", { detail: { mepOnly: true } });
}

export function isMepOnlyRebuild(event) {
  return !!(event && event.detail && event.detail.mepOnly === true);
}

/* built: what the live band was built for ({ rise, depth, wallColor }), or
   null when there is none. Anything but an MEP-only sync rebuilds it, as
   every full rebuild may have moved a wall. */
export function keepActiveBand(built, mepOnly, rise, depth, wallColor) {
  return !!(mepOnly && built && Object.is(built.rise, rise) && Object.is(built.depth, depth) &&
    Object.is(built.wallColor, wallColor));
}
