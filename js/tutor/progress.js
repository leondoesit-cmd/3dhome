const STORAGE_KEY = "modelforge_tutor_mastery_v1";
const SKILLS = Object.freeze(["wall", "opening", "item", "room", "precision", "constraints"]);

function storageOf(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch (_) { return null; }
}
function load(storage) {
  try {
    var parsed = JSON.parse(storageOf(storage).getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) { return {}; }
}
function save(data, storage) {
  try { storageOf(storage).setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}
function inferred(skill, state) {
  var walls = (state.walls || []).length, openings = (state.openings || []).length;
  var items = (state.items || []).length, rooms = Object.keys(state.roomMeta || {}).length;
  if (skill === "wall") return Math.min(0.8, walls / 40);
  if (skill === "opening") return Math.min(0.75, openings / 16);
  if (skill === "item") return Math.min(0.75, items / 24);
  if (skill === "room") return Math.min(0.75, rooms / 8);
  if (skill === "constraints") return Math.min(0.7, ((state.wallCons || []).length + (state.roomCons || []).length) / 12);
  if (skill === "precision") return Math.min(0.65, (state.planVars || []).length / 8);
  return 0;
}

export function recordSkillOutcome(skill, success, options = {}) {
  if (!SKILLS.includes(skill)) return null;
  var data = load(options.storage), now = options.now || Date.now();
  var prior = data[skill] || { attempts: 0, successes: 0, mastery: 0 };
  prior.attempts++;
  if (success) prior.successes++;
  var observed = success ? 1 : 0;
  prior.mastery = Math.max(0, Math.min(1, prior.mastery * 0.8 + observed * 0.2));
  prior.lastUsed = now;
  data[skill] = prior;
  save(data, options.storage);
  return prior;
}

export function tutorProgressSnapshot(state = {}, options = {}) {
  var data = load(options.storage), now = options.now || Date.now();
  var skills = {};
  SKILLS.forEach(function (skill) {
    var entry = data[skill] || { attempts: 0, successes: 0, mastery: 0, lastUsed: null };
    var days = entry.lastUsed ? Math.max(0, (now - entry.lastUsed) / 86400000) : Infinity;
    var decay = entry.lastUsed ? Math.max(0.3, Math.exp(-days / 90)) : 0;
    var effective = Math.max(inferred(skill, state), Number(entry.mastery || 0) * decay);
    skills[skill] = {
      attempts: entry.attempts || 0,
      successes: entry.successes || 0,
      mastery: Math.round(effective * 100) / 100,
      lastUsed: entry.lastUsed || null,
      inferredFromProject: !entry.attempts,
    };
  });
  return { skills: skills };
}

export function resetTutorProgress(storage) {
  try { storageOf(storage).removeItem(STORAGE_KEY); } catch (_) {}
}

