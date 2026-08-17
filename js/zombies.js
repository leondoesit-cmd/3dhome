/* ===========================================================================
   NIGHT SHIFT — survival-horror FPS played inside the user's own floor plan.
   ---------------------------------------------------------------------------
   Split for maintainability:
     zombies_state.js  — shared session state + tuning
     zombies_world.js  — collision, textures, FX, horror, zombie AI
     zombies_game.js   — weapons, HUD, player, waves, input, toggle
   This file is the stable public entry (lazy-imported from ui.js).
   =========================================================================== */
export { zActive, zDebug } from "./zombies_state.js";
export { zSpawnTest, toggleZombies } from "./zombies_game.js";
