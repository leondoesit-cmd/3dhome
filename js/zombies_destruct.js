/* Night Shift destructible environment.
   ---------------------------------------------------------------------------
   The planner already ships a full destruction stack for walk mode (fp/tp):
   cannon-es rigid bodies + the geometry fracturer in fracture.js, driven from
   physics.js. This module is the thin adapter that lets the game drive that
   same stack from bullets, flame and grenades instead of a crosshair punch.

   Two things it owns beyond forwarding:
     * lifecycle — physics is lazy-loaded and enabled without blocking the
       game start, and put back exactly as the user had it on exit;
     * collision resync — once furniture has been blown apart, the game's 2D
       collision snapshot is stale, so rebuilds are requested (coalesced, they
       are not cheap) and the zombies start walking through the new gap.        */
import * as THREE from "three";
import { S } from "./state.js";
import { getMainScene, initPhysicsForScene } from "./view3d.js";
import {
  loadPhysics,
  togglePhysics,
  isPhysicsEnabled,
  clearDebris,
  hitAlongRay,
  explodeAt,
} from "./physics_facade.js";
import { Z } from "./zombies_state.js";

/* Contact profiles per damage source. stressBase is the contact stress in the
   same units physics.js uses for the hammer (180) and the punch (45): below a
   material's `ultimate` nothing happens, above `shatter` it fractures.

   `immune` lists material types the source cannot damage at all. Masonry is on
   every small-arms profile on purpose: the walls are the room the fight reads
   against, and when every stray round knocked a chunk of one loose the flat
   turned into a field of pale rubble within a wave — the player's own cover
   dissolving in their peripheral vision is noise, not tension. Structure now
   only opens up to a grenade (explodeWorld, which passes no profile). */
var STRUCTURE = ["masonry"];

export var HIT = {
  // a pistol/SMG round: tiny contact patch, punches through glass and board
  bullet: { radius: 10, stressBase: 95, shards: 4, immune: STRUCTURE },
  // buckshot arrives as one wide, hard slap — shreds panels, marks masonry
  buck: { radius: 26, stressBase: 165, shards: 6, immune: STRUCTURE },
  // melee: a bat through a cabinet door
  melee: { radius: 18, stressBase: 130, shards: 5, immune: STRUCTURE },
  // sustained flame weakens rather than punches
  burn: { radius: 22, stressBase: 70, shards: 4, immune: STRUCTURE },
};

var wanted = false,      // the game wants destruction on
  ready = false,         // physics is loaded + enabled
  prevEnabled = false,   // what the planner had before we touched it
  resyncT = 0,           // debounce timer for the collision rebuild
  pending = false;

export function destructReady() {
  return ready;
}

/* Enable without blocking the game's own start-up. Attach rigid bodies to
   existing furniture without tearing down and rebuilding the 3D scene. */
export function enableDestruction() {
  if (wanted) return;
  wanted = true;
  prevEnabled = isPhysicsEnabled();
  loadPhysics()
    .then(function () {
      if (!wanted) return;
      if (!isPhysicsEnabled()) togglePhysics(true);
      initPhysicsForScene(); // generates rigid bodies directly on existing meshes
      ready = true;
      Z.colDirty = true;
    })
    .catch(function () {
      ready = false;
    });
}

export function disableDestruction() {
  if (!wanted) return;
  wanted = false;
  ready = false;
  clearDebris();
  // Put the planner back the way we found it: the user's own physics toggle
  // stays on if they had it on, otherwise the flat goes back to pristine.
  if (!prevEnabled && isPhysicsEnabled()) {
    togglePhysics(false);
    S.dirty3D = true;
  }
}

/* Any hit that landed on the world rather than on a zombie. Returns true when
   something actually broke, so callers can add their own sparks/sound. */
export function damageWorld(origin, dir, kind) {
  if (!ready) return false;
  var broke = hitAlongRay(origin, dir, getMainScene(), HIT[kind] || HIT.bullet, 6000);
  if (broke) markDirty();
  return broke;
}

export function explodeWorld(center, radius, power) {
  if (!ready) return 0;
  var n = explodeAt(center, radius, power, getMainScene());
  if (n) markDirty();
  return n;
}

/* A rebuilt collision snapshot walks every mesh in the scene — far too heavy to
   run per shard. Coalesce: the world only needs to agree with what the player
   can see within a few hundred milliseconds. */
function markDirty() {
  pending = true;
}

export function stepDestruct(dt) {
  if (!pending) return;
  resyncT -= dt;
  if (resyncT > 0) return;
  resyncT = 0.6;
  pending = false;
  Z.colDirty = true;
}
