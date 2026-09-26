// Short part codes: W12 is wall 12, D7 door 7, F13 the armchair with id 13.
//
// The owner's decision (2026-09-26): a code is a letter for the kind plus the
// object's real id — never a per-floor renumbering. Ids come from one counter
// (S.idc) shared by every kind, so the number alone is already unique and a
// code never changes while the object exists; deleting a part leaves a gap
// instead of renaming its neighbours under the AI and the history.
//
// Pure: no imports, so the tests and the agent's context use the same table.

export var PART_LETTERS = {
  wall: "W",
  door: "D",
  window: "WN",
  opening: "O",
  item: "F", // every piece, cabinets too: converting one must not rename it
};

// the kind a code's letters stand for, longest letters first (WN before W)
var BY_LETTERS = Object.keys(PART_LETTERS)
  .map(function (kind) { return { kind: kind, letters: PART_LETTERS[kind] }; })
  .sort(function (a, b) { return b.letters.length - a.letters.length; });

/* The letter a selection kind carries; an opening is named for what it is. */
export function partKind(kind, ref) {
  if (kind === "opening") return ref && (ref.type === "door" || ref.type === "window") ? ref.type : "opening";
  return PART_LETTERS[kind] ? kind : null;
}
var OPENINGS = { door: 1, window: 1, opening: 1 };

/* "W12" for partCode("wall", 12); "" for anything without a code (a room is
   named by its walls, not by an id anyone would read). */
export function partCode(kind, id, ref) {
  var k = partKind(kind, ref);
  if (!k || id == null || id === "" || !isFinite(Number(id))) return "";
  return PART_LETTERS[k] + Number(id);
}

/* What someone typed — "W12", "wn 9", "#13", "13" — as { kind, id }. The kind
   is null for a bare number: the id alone still finds the object. Returns null
   for anything that is not a code. */
export function parsePartCode(text) {
  var s = String(text == null ? "" : text).trim().toUpperCase().replace(/\s+/g, "");
  var m = /^#?(\d{1,7})$/.exec(s);
  if (m) return { kind: null, id: Number(m[1]) };
  for (var i = 0; i < BY_LETTERS.length; i++) {
    var e = BY_LETTERS[i];
    if (s.indexOf(e.letters) !== 0) continue;
    m = /^#?(\d{1,7})$/.exec(s.slice(e.letters.length));
    if (m) return { kind: e.kind, id: Number(m[1]) };
  }
  return null;
}

/* Find what a code names in a plan: { kind, ref } with the selection kind the
   planner uses ("wall", "opening", "item"), or null. A code whose letters do
   not match what the id actually is (D12 when 12 is a wall) finds nothing,
   so a typo never selects the wrong thing — though a door that became a
   window still answers to D, since only its letter moved. */
export function findPartByCode(plan, text) {
  var code = parsePartCode(text);
  if (!code || !plan) return null;
  var lists = [["wall", plan.walls], ["opening", plan.openings], ["item", plan.items]];
  for (var i = 0; i < lists.length; i++) {
    var list = lists[i][1] || [];
    for (var j = 0; j < list.length; j++) {
      var ref = list[j];
      if (!ref || Number(ref.id) !== code.id) continue;
      var kind = lists[i][0];
      var own = partKind(kind, ref);
      if (code.kind && own !== code.kind && !(OPENINGS[own] && OPENINGS[code.kind])) return null;
      return { kind: kind, ref: ref };
    }
  }
  return null;
}
