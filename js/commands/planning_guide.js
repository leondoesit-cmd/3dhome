import { normalizePlanningGuide, planningGuide, assignChecklistRoom, PROJECT_INTENTIONS, PROPERTY_TYPES } from "../planning_guide.js";
import { roomPreset } from "../room_presets.js";
import {PLANNING_UNITS} from '../planning_units.js';

export const planningGuideCommand = Object.freeze({
  id: "project.guide",
  prepare(params, env) {
    const state = env.state;
    if (state.workspace && state.workspace.role === "viewer") return { ok: false, reason: "READ_ONLY" };
    const guide = planningGuide(state);
    const action = params.action;
    let roomKey = null;
    const entry = guide.rooms.find((room) => room.id === params.id);
    if (action === "settings") {
      if(params.displayUnit!==undefined){
        if(!Object.hasOwn(PLANNING_UNITS,params.displayUnit))return {ok:false,reason:'INVALID_UNITS'};
        guide.details.displayUnit=params.displayUnit;
      }
      if(params.entranceOpeningId!==undefined){
        const id=String(params.entranceOpeningId);
        if(id&&!state.openings.some(o=>String(o.id)===id&&o.type!=='window'&&(o.sill||0)<=0))return {ok:false,reason:'INVALID_ENTRANCE'};
        guide.details.entrances[state.workspace.activeFloor]=id;
      }
      if(params.routeWidth!==undefined){
        if(!Number.isFinite(params.routeWidth)||params.routeWidth<30||params.routeWidth>200)return {ok:false,reason:'INVALID_ROUTE_WIDTH'};
        guide.details.routeWidth=params.routeWidth;
      }
      if (params.intention != null) {
        if (!PROJECT_INTENTIONS.includes(params.intention)) return { ok: false, reason: "INVALID_INTENTION" };
        guide.intention = params.intention;
      }
      if (params.enabled != null) guide.enabled = !!params.enabled;
      if (params.propertyType != null) {
        if (!PROPERTY_TYPES.includes(params.propertyType)) return { ok: false, reason: "INVALID_PROPERTY_TYPE" };
        guide.details.propertyType = params.propertyType;
      }
      if (params.usableAreaTarget !== undefined) {
        if (params.usableAreaTarget !== null && !(Number.isFinite(params.usableAreaTarget) && params.usableAreaTarget > 0))
          return { ok: false, reason: "INVALID_AREA_TARGET" };
        guide.details.usableAreaTarget = params.usableAreaTarget;
      }
    } else if (action === "add") {
      if (typeof params.id !== "string" || !params.id || params.id.length > 80 || entry || guide.rooms.length >= 200 || !roomPreset(params.type))
        return { ok: false, reason: "INVALID_CHECKLIST_ENTRY" };
      guide.enabled = true;
      guide.rooms.push({ id: params.id, name: String(params.name || "").slice(0, 80), type: params.type, floorId: "", roomHid: "", skipped: false });
    } else {
      if (!entry) return { ok: false, reason: "ENTRY_NOT_FOUND" };
      if (action === "edit") {
        for(const key of ['width','depth'])if(params[key]!==undefined){
          if(params[key]===null)delete entry[key];
          else if(Number.isFinite(params[key])&&params[key]>=20&&params[key]<=10000)entry[key]=params[key];
          else return {ok:false,reason:'INVALID_ROOM_SIZE'};
        }
        // Editing an assignment on another floor requires opening that floor,
        // so both the semantic room and its requirement change in one command.
        if (entry.roomHid && entry.floorId !== state.workspace.activeFloor &&
            (state.workspace.floors || []).some((floor) => floor.id === entry.floorId)) return { ok: false, reason: "OPEN_ASSIGNED_FLOOR" };
        if (params.name != null) entry.name = String(params.name).trim().slice(0, 80);
        if (params.type != null) {
          if (!roomPreset(params.type)) return { ok: false, reason: "INVALID_ROOM_TYPE" };
          entry.type = params.type;
        }
        const faces = env.services.detectRooms();
        roomKey = faces.find((room) => state.roomMeta[room.key]?.hid === entry.roomHid)?.key || null;
      } else if (action === "assign") {
        const room = env.services.detectRooms().find((face) => face.key === params.roomKey);
        if (!room) return { ok: false, reason: "ROOM_NOT_FOUND" };
        roomKey = room.key;
        const hid = state.roomMeta[roomKey]?.hid;
        if (hid && guide.rooms.some((other) => other.id !== entry.id && other.roomHid === hid && other.floorId === state.workspace.activeFloor))
          return { ok: false, reason: "ROOM_ALREADY_ASSIGNED" };
      } else if (action === "unassign" || action === "skip") {
        entry.roomHid = "";
        entry.floorId = "";
        entry.skipped = action === "skip" ? !entry.skipped : false;
      } else if (action === "remove") guide.rooms = guide.rooms.filter((room) => room.id !== entry.id);
      else if (action === "move") {
        const index = guide.rooms.indexOf(entry);
        const next = Math.max(0, Math.min(guide.rooms.length - 1, index + (params.direction === -1 ? -1 : 1)));
        guide.rooms.splice(index, 1);
        guide.rooms.splice(next, 0, entry);
      } else return { ok: false, reason: "INVALID_GUIDE_ACTION" };
    }
    return { ok: true, plan: { command: "project.guide", params: {
      guide: normalizePlanningGuide(guide), roomKey, entryId: params.id || "",
    } }, targets: [{ kind: "project", id: state.workspace.id }, ...(roomKey ? [{ kind: "room", id: roomKey }] : [])] };
  },
  apply(plan, env) {
    const { guide, roomKey, entryId } = plan.params;
    env.state.workspace.guidance = normalizePlanningGuide(guide);
    if (roomKey) {
      env.state.roomMeta[roomKey] ||= {};
      const result = assignChecklistRoom(env.state, entryId, roomKey);
      if (!result.ok) return result;
    }
    return { ok: true, changed: [{ kind: "project", id: env.state.workspace.id }], effects: { refreshTree: true, refreshInspector: true } };
  },
});
