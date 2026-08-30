// Visit flow — enter a friend's apartment and meet them there.
//
// Scene authority: the room owner's live session. On joining a friend's room
// we ask the owner for their current layout (scene_req → scene); the stored
// model from the friend card is applied immediately as a fallback so offline
// friends' apartments still work. While visiting, my own home is snapshotted
// and restored on "go home" — visiting NEVER touches the visited data.
import { S } from "./state.js";
import { t } from "./i18n.js";
import { serialize, applyData, flash } from "./ui.js";
import { isWalk } from "./view3d.js";
import * as net from "./net.js";
import { friendByCode } from "./friends.js";

export const VISIT = {
  friend: null, // the friend whose apartment I'm in (null = home)
  homeSnapshot: null,
};
let visitGeneration = 0;

export function isVisiting() {
  return !!VISIT.friend;
}

function enterWalk(on) {
  // go through the topbar button so every walk-UI sync in ui.js runs
  if (isWalk() !== on) {
    const b = document.getElementById("walkBtn");
    if (b) b.click();
  }
}

function friendRoomId(friend) {
  return "apt:" + (friend.code || friend.id);
}

/* async because applyData() may have to fetch the model builder before a
   friend's apartment can be applied — `applied` below must not be set until it
   really has. Callers ignore the return value. */
export async function startVisit(friend) {
  if (!friend) return;
  const generation = ++visitGeneration;
  if (!VISIT.friend) VISIT.homeSnapshot = serialize();
  VISIT.friend = friend;

  // apply the stored apartment right away (offline-friendly)…
  let applied = false;
  if (friend.model) {
    try {
      applied = !!(await applyData(friend.model));
    } catch (e) {
      console.error("stored friend model failed to load", e);
    }
  }
  if (generation !== visitGeneration || VISIT.friend !== friend) return false;
  if (friend.model && !applied) {
    VISIT.friend = null;
    flash(t("fr_noModel"), "error");
    window.dispatchEvent(new CustomEvent("visit:change"));
    return false;
  }
  // …and ask the live owner for the real thing if they're on the relay
  // always record the room switch — joinRoom is offline-safe (it stores the
  // desired room; a later (re)connect joins it), so no connectivity guard here
  const ownerOnline =
    friend.code && net.NET.roster.some((u) => u.code === friend.code);
  net.joinRoom(friendRoomId(friend));
  if (ownerOnline) net.sendData({ k: "scene_req" }, friend.code);
  if (!applied && !ownerOnline) flash(t("fr_noModel"), "error");

  enterWalk(true);
  flash(t("fr_visiting", { name: friend.name }), "success");
  window.dispatchEvent(new CustomEvent("visit:change"));
  return true;
}

/* async for the same reason startVisit is: applyData may have to fetch the
   model builder before it can apply.

   This snapshot was serialized from THIS session, so in practice its custom
   models are already registered and the apply is synchronous. That argument is
   almost certainly sound — and it is exactly the kind of "it cannot happen
   here" reasoning that already hid one silent data loss in this file's
   neighbours, so awaiting costs a microtask and removes the need to be right. */
export async function goHome() {
  if (!VISIT.friend) return;
  const friend = VISIT.friend;
  const generation = ++visitGeneration;
  VISIT.friend = null;
  if (VISIT.homeSnapshot) {
    try {
      const applied = await applyData(JSON.parse(VISIT.homeSnapshot));
      if (generation !== visitGeneration) return false;
      if (!applied) { VISIT.friend = friend; return false; }
    } catch (e) {
      console.error("home restore failed", e);
      if (generation === visitGeneration) VISIT.friend = friend;
      return false;
    }
    VISIT.homeSnapshot = null;
  }
  if (generation !== visitGeneration) return false;
  net.goHomeRoom(); // offline-safe: records the room for the next (re)connect
  flash(t("fr_backHome"), "success");
  window.dispatchEvent(new CustomEvent("visit:change"));
  return true;
}

export function initVisit() {
  net.on("data", ({ from, data }) => {
    if (data.k === "scene_req") {
      // I'm the owner being asked for my layout — only answer with MY home
      // (never re-share someone else's apartment I happen to be visiting)
      if (!isVisiting()) net.sendData({ k: "scene", json: serialize() }, from);
    } else if (data.k === "scene") {
      // live layout from the room owner I'm visiting
      if (VISIT.friend && from === VISIT.friend.code) {
        const friend = VISIT.friend;
        const generation = visitGeneration;
        try {
          /* A peer's layout can use custom models this browser has never seen,
             so applyData may fetch the builder first — announce it only once it
             has actually landed. */
          Promise.resolve(applyData(JSON.parse(data.json))).then(function (applied) {
            if (!applied || generation !== visitGeneration || VISIT.friend !== friend) return;
            flash(t("fr_liveScene", { name: friend.name }));
          }, function (e) { console.error("live scene failed to load", e); });
        } catch (e) {
          console.error("live scene failed to load", e);
        }
      }
    }
  });

  // if the friend I'm visiting redecorates live, they push updates
  net.on("peer-join", ({ code }) => {
    // someone entered MY home — greet with a toast so I notice
    if (!isVisiting()) {
      const fr = friendByCode(code);
      flash(t("fr_guestArrived", { name: (fr && fr.name) || net.peerName(code) }), "success");
    }
  });
}
