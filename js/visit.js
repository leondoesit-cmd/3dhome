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

export function startVisit(friend) {
  if (!friend) return;
  if (!VISIT.friend) VISIT.homeSnapshot = serialize();
  VISIT.friend = friend;

  // apply the stored apartment right away (offline-friendly)…
  let applied = false;
  if (friend.model) {
    try {
      applyData(friend.model);
      applied = true;
    } catch (e) {
      console.error("stored friend model failed to load", e);
    }
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
}

export function goHome() {
  if (!VISIT.friend) return;
  VISIT.friend = null;
  if (VISIT.homeSnapshot) {
    try {
      applyData(JSON.parse(VISIT.homeSnapshot));
    } catch (e) {
      console.error("home restore failed", e);
    }
    VISIT.homeSnapshot = null;
  }
  net.goHomeRoom(); // offline-safe: records the room for the next (re)connect
  flash(t("fr_backHome"), "success");
  window.dispatchEvent(new CustomEvent("visit:change"));
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
        try {
          applyData(JSON.parse(data.json));
          flash(t("fr_liveScene", { name: VISIT.friend.name }));
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
