// Micro RC truck racing inside the home model.
// Split for maintainability:
//   rc_state.js  — shared session state + tuning
//   rc_world.js  — collision, cars, track, water, audio
//   rc_game.js   — HUD, race flow, simulation, input, toggle
// This file is the stable public entry (lazy-imported from ui.js).
export { rcActive } from "./rc_state.js";
export { rcDebug, toggleRC } from "./rc_game.js";
