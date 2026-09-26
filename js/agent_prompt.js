// In-app assistant instructions, spatial digest, and recovery of dumped commands.
// Kept free of app/runtime imports so Node tests can load it directly.

import { partCode } from "./part_codes.js"; // pure, like this file

export function itemPlanBounds(it) {
  if (!it) return null;
  var a = ((Number(it.rot) || 0) * Math.PI) / 180,
    hw = Math.max(1, Number(it.w) || 1) / 2,
    hd = Math.max(1, Number(it.d) || 1) / 2,
    ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hd,
    ez = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hd,
    x = Number(it.x), z = Number(it.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { minx: x - ex, maxx: x + ex, minz: z - ez, maxz: z + ez };
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function pointOf(node) {
  if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.z))) return null;
  return { x: round1(node.x), z: round1(node.z) };
}

function planBounds(nodes) {
  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  (nodes || []).forEach(function (node) {
    if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.z))) return;
    minx = Math.min(minx, node.x); maxx = Math.max(maxx, node.x);
    minz = Math.min(minz, node.z); maxz = Math.max(maxz, node.z);
  });
  if (!Number.isFinite(minx)) return { minx: 0, maxx: 0, minz: 0, maxz: 0, width: 0, depth: 0 };
  return { minx: round1(minx), maxx: round1(maxx), minz: round1(minz), maxz: round1(maxz),
    width: round1(maxx - minx), depth: round1(maxz - minz) };
}

function wallRecord(wall, nodes) {
  if (!wall) return null;
  var from = pointOf(nodes && nodes[wall.a]), to = pointOf(nodes && nodes[wall.b]);
  if (!from || !to) return null;
  var dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
  return {
    id: wall.id,
    code: partCode("wall", wall.id),
    from: from,
    to: to,
    length: round1(length),
    thickness: Number(wall.thickness) || 10,
    axis: Math.abs(dx) >= Math.abs(dz) ? "x" : "z",
  };
}

export function spatialDigest(state, options) {
  options = options || {};
  var limit = Math.max(1, Math.min(5000, options.limit || 250));
  var labelOf = typeof options.labelOf === "function" ? options.labelOf : function (it) { return it && it.type; };
  var nodes = state && state.nodes || [];
  var walls = (state && state.walls || []).map(function (wall) {
    return wallRecord(wall, nodes);
  }).filter(Boolean).slice(0, limit);
  var bounds = planBounds(nodes);
  var items = (state && state.items || []).slice(0, limit).map(function (it) {
    if (!it) return null;
    var box = itemPlanBounds(it);
    return {
      id: it.id, code: partCode("item", it.id), type: it.type, label: labelOf(it) || it.type,
      x: round1(it.x), z: round1(it.z),
      w: Number(it.w) || 0, d: Number(it.d) || 0, h: Number(it.h) || 0,
      rot: Number(it.rot) || 0,
      front: itemFront(Number(it.rot) || 0),
      bounds: box && { minx: round1(box.minx), maxx: round1(box.maxx), minz: round1(box.minz), maxz: round1(box.maxz) },
    };
  }).filter(Boolean);
  return {
    units: "cm",
    axes: {
      x: "increases to the right of the 2D plan",
      z: "increases toward the bottom of the 2D plan (away from the top wall)",
    },
    itemPosition: "x,z is the CENTER of the item footprint, not a corner",
    planBounds: bounds,
    walls: walls,
    items: items,
  };
}

function itemFront(rot) {
  var rad = (Number(rot) || 0) * Math.PI / 180;
  return { x: round1(-Math.sin(rad)), z: round1(Math.cos(rad)) };
}
export const AGENT_WORKFLOW = [
  "You are the ModelForge in-app planner assistant. The live document is truth.",
  "",
  "How you act:",
  "- Snap, beside, face, or rotate furniture with preview_item_snap. The app computes coordinates. Do not invent x/z/rot for those requests.",
  "- Wall snaps without an explicit facing: call preview_item_snap with face omitted (defaults to both). The UI asks A keep each item's facing, B rotate only those items to face into the room against THEIR host wall, then re-flush so they stay on that wall.",
  "- \"face the room\" / \"face west|east|north|south\": one preview_item_snap with that face. Compass: west=left/-x, east=right/+x, north=top/-z, south=bottom/+z.",
  "- \"to the right of cooktop\": preview_item_snap beside that item. Join the cooktop's wall run (flush to the same wall, same rot). Do not apply right-wall rotation to a top-wall run.",
  "- Other create/draw commands still use preview_model_command. Independent actions in one user message become multiple tool calls in the same turn.",
  "- Never paste command JSON, markdown code fences, or proposedOperations arrays into the visible reply.",
  "- Do not narrate coordinates or call get_app_context before a snap preview. context.spatial is descriptive only; it is never placement authority.",
  "- After previews succeed, reply with JSON only: {\"mode\":\"propose\",\"message\":\"\",\"question\":\"\",\"options\":[],\"evidence\":[{\"type\":\"preview\",\"detail\":\"short reason\"}],\"confidence\":1,\"proposedOperations\":[]}. Keep message and question empty.",
  "- Never claim the plan already changed. Preview is non-mutating; the user confirms in the UI.",
  "- Ask one short multiple-choice question only when no valid preview can be prepared.",
  "",
  "Coordinates:",
  "- Units are centimetres. Item x,z is the CENTER. rot 0 faces +z (down the page / south). Front is (-sin(rot°), cos(rot°)).",
  "- spatial.items[].front is the current facing. spatial walls and bounds are descriptive; never derive snap coordinates from them.",
  "",
  "Names:",
  "- Walls, openings and items carry a short code: W wall, D door, WN window, O other opening, F furniture, then the id (W12 is wall 12, F13 is item 13). The user reads these codes on the plan and may type them.",
  "- Name objects to the user by label and code (\"Sofa F12\", \"wall W3\"). Command params still take the plain numeric id.",
  "",
  "Commands (only if preview_item_snap does not apply):",
  "- item.move: only when the user supplied exact numeric x,z/delta values. Never use it to infer snap, beside, wall, or facing geometry.",
  "- item.place: type (catalog id), x, z, optional rot.",
  "- item.duplicate: sourceIds. wall.draw / room.create / opening.place as listed in context.commands.",
].join("\n");

export function buildAgentSystemPrompt(context) {
  return AGENT_WORKFLOW + "\n\nLive project context:\n" + JSON.stringify(context == null ? {} : context);
}

function isOperation(entry) {
  return !!(entry && typeof entry === "object" && typeof entry.commandId === "string" &&
    entry.params && typeof entry.params === "object" && !Array.isArray(entry.params));
}

export function structuredAssistantContent(content) {
  var text = String(content || "").trim();
  if (!text) return null;
  var candidates = [text];
  var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.unshift(fence[1].trim());
  var first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (var i = 0; i < candidates.length; i++) {
    try {
      var parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {}
  }
  return null;
}

export function operationsFromAssistantContent(content) {
  var text = String(content || "").trim();
  if (!text) return [];
  var structured = structuredAssistantContent(text);
  var candidates = structured ? [structured] : [];
  if (!candidates.length) {
    try { candidates.push(JSON.parse(text)); } catch (_) {}
  }
  for (var i = 0; i < candidates.length; i++) {
    var parsed = candidates[i];
    var list = Array.isArray(parsed) ? parsed
      : parsed && Array.isArray(parsed.proposedOperations) ? parsed.proposedOperations
      : parsed && parsed.commandId ? [parsed]
      : [];
    var ops = list.filter(isOperation);
    if (ops.length) return ops.map(function (entry) {
      return { commandId: entry.commandId, params: entry.params };
    });
  }
  return [];
}
