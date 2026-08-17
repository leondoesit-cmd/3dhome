// Shared simulation timing for every real-time mode in the app.
// Browsers can deliver invalid or very large frame deltas after a tab switch,
// debugger pause or overloaded frame. Keeping that time out of the simulation
// prevents tunnelling, explosive impulses and one-frame camera jumps.
export const MAX_FRAME_SECONDS = 0.05;
export const MAX_KINEMATIC_STEP = 1 / 60;

export function safeDeltaSeconds(deltaMs, fallbackSeconds, maxSeconds) {
  const fallback = Number.isFinite(fallbackSeconds) ? Math.max(0, fallbackSeconds) : 1 / 60;
  const ceiling = Number.isFinite(maxSeconds) ? Math.max(0, maxSeconds) : MAX_FRAME_SECONDS;
  const ms = Number(deltaMs);
  if (!Number.isFinite(ms)) return Math.min(fallback, ceiling);
  if (ms <= 0) return 0;
  return Math.min(ceiling, ms / 1000);
}

export function safeDeltaMilliseconds(deltaMs, fallbackMs, maxMs) {
  return safeDeltaSeconds(
    deltaMs,
    (Number.isFinite(fallbackMs) ? fallbackMs : 1000 / 60) / 1000,
    (Number.isFinite(maxMs) ? maxMs : MAX_FRAME_SECONDS * 1000) / 1000,
  ) * 1000;
}

// Run movement/collision integration in bounded slices while preserving the
// exact elapsed time. Three 16.7ms slices are substantially more reliable than
// one 50ms leap and are cheap enough for the JS gameplay engines.
export function forEachPhysicsStep(totalSeconds, callback, maxStep, maxSteps) {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  if (!total || typeof callback !== "function") return 0;
  const limit = Number.isFinite(maxStep) && maxStep > 0 ? maxStep : MAX_KINEMATIC_STEP;
  const budget = Number.isFinite(maxSteps) && maxSteps > 0 ? Math.floor(maxSteps) : 4;
  const count = Math.min(budget, Math.max(1, Math.ceil(total / limit)));
  const dt = total / count;
  for (let i = 0; i < count; i++) callback(dt, i, count);
  return count;
}

// Frame-rate-independent response factor for steering, suspension and camera
// smoothing. Exponential damping behaves the same at 30, 60 and 144 Hz.
export function dampingFactor(rate, dt) {
  if (!(rate > 0) || !(dt > 0)) return 0;
  return 1 - Math.exp(-rate * dt);
}
