// Friends store — persistent list of people you can visit.
// Each friend: { id, name, code, address, lat, lon, floor, model }
//   code   — their friend code (from js/net.js identity) for online meetups;
//            optional: without it you can still drive to them and walk their
//            saved apartment, just not meet them live.
//   model  — their apartment as a scene JSON object (the app's own export
//            format), imported from a file they shared; null = none yet.
//            When the friend is ONLINE the live layout from their session
//            wins over this stored copy (see js/visit.js).

import { sanitizeDisplayName } from "./safe.js";

const LS_KEY = "home3d_friends";

export const FRIENDS = [];

function cleanFriend(f) {
  if (!f || typeof f !== "object") return null;
  const name = sanitizeDisplayName(f.name, 40);
  if (!name) return null;
  return {
    id: f.id || "f" + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
    name,
    code: String(f.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 16),
    address: sanitizeDisplayName(f.address, 120),
    lat: typeof f.lat === "number" && isFinite(f.lat) ? f.lat : null,
    lon: typeof f.lon === "number" && isFinite(f.lon) ? f.lon : null,
    floor: f.floor | 0,
    model: f.model || null,
  };
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(FRIENDS));
  } catch (e) {
    // a big apartment model can overflow the localStorage quota — keep the
    // friend but warn via console; callers surface a toast on failure
    console.warn("friends persist failed", e);
    return false;
  }
  return true;
}

export function loadFriends() {
  FRIENDS.length = 0;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr))
        arr.forEach((f) => {
          const cleaned = cleanFriend(f);
          if (cleaned) FRIENDS.push(cleaned);
        });
    }
  } catch (_) {}
  return FRIENDS;
}

export function addFriend(f) {
  const fr = cleanFriend(f);
  if (!fr) return null;
  FRIENDS.push(fr);
  persist();
  return fr;
}

export function updateFriend(id, patch) {
  const fr = FRIENDS.find((f) => f.id === id);
  if (!fr) return null;
  const next = cleanFriend(Object.assign({}, fr, patch, { id: fr.id }));
  if (!next) return null;
  Object.assign(fr, next);
  persist();
  return fr;
}

export function removeFriend(id) {
  const i = FRIENDS.findIndex((f) => f.id === id);
  if (i >= 0) {
    FRIENDS.splice(i, 1);
    persist();
  }
}

export function friendByCode(code) {
  if (!code) return null;
  return FRIENDS.find((f) => f.code === code) || null;
}
export function friendById(id) {
  return FRIENDS.find((f) => f.id === id) || null;
}

loadFriends();
