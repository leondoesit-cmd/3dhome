// UI-independent project brief. Geometry remains in the wall graph; checklist
// status is derived from the current faces, never cached as a second room list.
import { roomPreset } from "./room_presets.js";
import {PLANNING_UNITS} from './planning_units.js';

export const PROJECT_INTENTIONS = ["recreate", "design", "explore"];
export const PROPERTY_TYPES = ["unspecified", "apartment", "house", "other"];
const cleanText = (value, limit = 80) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function normalizePlanningGuide(value) {
  const source = value && typeof value === "object" ? value : {};
  const details = source.details || {};
  const seen = new Set(), assigned = new Set();
  const rooms = (Array.isArray(source.rooms) ? source.rooms : []).slice(0, 200).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = cleanText(entry.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const floorId = cleanText(entry.floorId);
    let roomHid = cleanText(entry.roomHid);
    const assignment = floorId + ":" + roomHid;
    if (!floorId || assigned.has(assignment)) roomHid = "";
    if (roomHid) assigned.add(assignment);
    const dimensions=Object.fromEntries(['width','depth'].filter(key=>Number.isFinite(entry[key])&&entry[key]>=20&&entry[key]<=10000).map(key=>[key,entry[key]]));
    return [{ id, ...dimensions, name: cleanText(entry.name), type: roomPreset(entry.type) ? entry.type : "bedroom",
      floorId, roomHid, skipped: !!entry.skipped && !roomHid }];
  });
  return {
    version: 1,
    intention: PROJECT_INTENTIONS.includes(source.intention) ? source.intention : "explore",
    enabled: source.enabled === true,
    details: {
      ...(Object.hasOwn(PLANNING_UNITS,details.displayUnit)&&details.displayUnit!=='cm'?{displayUnit:details.displayUnit}:{}),
      entrances: Object.fromEntries(Object.entries(details.entrances||{}).filter(([floor,id])=>floor.length<=80&&(typeof id==='string'||typeof id==='number')).map(([floor,id])=>[floor,String(id).slice(0,80)])),
      routeWidth: Number.isFinite(details.routeWidth)&&details.routeWidth>=30&&details.routeWidth<=200?details.routeWidth:60,
      propertyType: PROPERTY_TYPES.includes(details.propertyType) ? details.propertyType : "unspecified",
      usableAreaTarget: Number.isFinite(details.usableAreaTarget) && details.usableAreaTarget > 0 ? details.usableAreaTarget : null,
    },
    rooms,
  };
}

export function planningGuide(state) {
  return normalizePlanningGuide(state.workspace && state.workspace.guidance);
}

export function checklistStatus(state, faces) {
  const floorId = state.workspace && state.workspace.activeFloor || "floor-1";
  const meta = state.roomMeta || {};
  const live = new Map((faces || []).map((room) => [meta[room.key] && meta[room.key].hid, room]));
  return planningGuide(state).rooms.map((entry) => {
    const room = entry.floorId === floorId && entry.roomHid ? live.get(entry.roomHid) : null;
    const otherFloor = entry.roomHid && entry.floorId !== floorId &&
      (state.workspace.floors || []).some((floor) => floor.id === entry.floorId);
    return { ...entry, roomKey: room ? room.key : null,
      status: room ? "placed" : otherFloor ? "other_floor" : entry.skipped ? "skipped" : "unplaced" };
  });
}

export function assignChecklistRoom(state, entryId, roomKey) {
  const guide = planningGuide(state);
  const entry = guide.rooms.find((room) => room.id === entryId);
  const meta = state.roomMeta && state.roomMeta[roomKey];
  if (!entry || !meta) return { ok: false, reason: "ROOM_NOT_FOUND" };
  const floorId = state.workspace.activeFloor || "floor-1";
  if (meta.hid && guide.rooms.some((room) => room.id !== entryId && room.floorId === floorId && room.roomHid === meta.hid))
    return { ok: false, reason: "ROOM_ALREADY_ASSIGNED" };
  if (!meta.hid) meta.hid = "r" + state.idc++;
  entry.roomHid = meta.hid;
  entry.floorId = floorId;
  entry.skipped = false;
  meta.name = entry.name || roomPreset(entry.type).name;
  meta.roomType = entry.type;
  state.workspace.guidance = guide;
  return { ok: true };
}
