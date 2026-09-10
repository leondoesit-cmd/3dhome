/* Naming rules for the Blender export (js/blender_export.js).
   Kept free of every import so the rules are testable in plain node — the
   exporter itself cannot be, because it pulls in the WebGPU three build.

   Blender does not sanitize what a glTF hands it: whatever string sits in
   node.name becomes the object name in the outliner, so a name with a newline
   or a 200-character furniture label lands in the .blend as-is and is then
   painful to search, select or drive from a script. Everything that reaches
   the exporter goes through here first. */

// Blender's own limit on an ID name (64 bytes including the terminator).
export var MAX_NAME = 63;

/* Collections, in outliner order. `id` is what classify() returns, `name` is
   what the empty is called in the file. Blender's glTF importer builds an
   Empty per group node, so these arrive as parents, not as real collections —
   selecting one and pressing `]` (select hierarchy) still gathers the layer. */
export var COLLECTIONS = [
  { id: "walls", name: "Walls" },
  { id: "floors", name: "Floors" },
  { id: "ceilings", name: "Ceilings" },
  { id: "structure", name: "Structure" },
  { id: "furniture", name: "Furniture" },
  { id: "mep", name: "MEP" },
  { id: "lights", name: "Lights" },
  { id: "site", name: "Site" },
];

/* Latin letters, digits, space and the three punctuation marks Blender itself
   uses in generated names, plus the Hebrew/Arabic blocks the UI is translated
   into. Everything else — including the directional marks that ride along with
   a pasted Hebrew room name, and the commas inside a room key — becomes "_",
   so a name is always safe in a Python selector (bpy.data.objects["..."]). */
var SAFE = /[^A-Za-z0-9 _.\-À-ɏ֐-׿؀-ۿ]/g;

export function sanitizeBlenderName(raw, fallback) {
  var s = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(SAFE, "_")
    .replace(/\s+/g, " ")
    .replace(/_{2,}/g, "_")
    .trim();
  if (!s || s === "_") s = String(fallback == null ? "Object" : fallback);
  if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME).trim();
  return s;
}

/* Blender's own collision rule: the second "Chair" becomes "Chair.001". Doing
   it here rather than leaving it to the importer means the names in the .glb
   already match the names in the .blend, which is what lets a companion Python
   script (select every "Wall_*") work against either end. */
export function uniqueNamer() {
  var used = Object.create(null);
  return function (raw, fallback) {
    var base = sanitizeBlenderName(raw, fallback);
    if (used[base] == null) {
      used[base] = 0;
      return base;
    }
    var n = used[base],
      out;
    do {
      n++;
      var suffix = "." + String(n).padStart(3, "0");
      out = base.slice(0, MAX_NAME - suffix.length) + suffix;
    } while (used[out] != null);
    used[base] = n;
    used[out] = 0;
    return out;
  };
}

/* One top-level object in the live 3D scene -> the collection it belongs in and
   the name it carries. `ud` is the object's userData; `role` is the tag the
   builder puts on the meshes it makes (see js/view3d.js), and wall/item/opening
   are the three live-object back-references that were already there. */
export function classify(ud) {
  ud = ud || {};
  if (ud.item) {
    var it = ud.item;
    return {
      collection: "furniture",
      kind: "furniture",
      name: labelFor(it.type) + (it.id != null ? "_" + it.id : ""),
      extras: {
        home3d_kind: "furniture",
        home3d_type: String(it.type || ""),
        home3d_id: it.id != null ? String(it.id) : "",
        width_cm: num(it.w),
        depth_cm: num(it.d),
        height_cm: num(it.h),
        rotation_deg: num(it.rot),
      },
    };
  }
  if (ud.wall) {
    var w = ud.wall;
    return {
      collection: "walls",
      kind: "wall",
      name: "Wall_" + (w.id != null ? w.id : "0"),
      extras: {
        home3d_kind: "wall",
        home3d_id: w.id != null ? String(w.id) : "",
        thickness_cm: num(w.thickness),
        height_cm: num(w.height),
        wall_type: String(w.type || w.kind || "normal"),
      },
    };
  }
  if (ud.opening) {
    var o = ud.opening;
    return {
      collection: "walls",
      kind: "opening",
      name: labelFor(o.type || o.kind || "opening") + (o.id != null ? "_" + o.id : ""),
      extras: {
        home3d_kind: "opening",
        home3d_id: o.id != null ? String(o.id) : "",
        width_cm: num(o.width),
        height_cm: num(o.height),
        sill_cm: num(o.sill),
      },
    };
  }
  var role = ud.role;
  if (role === "floor" || role === "floorBridge")
    return {
      collection: "floors",
      kind: "floor",
      name: ud.roomLabel ? "Floor_" + labelFor(ud.roomLabel) : "Floor",
      extras: clean({ home3d_kind: "floor", home3d_room: ud.roomLabel || "", home3d_finish: ud.finish || "" }),
    };
  if (role === "ceiling")
    return {
      collection: "ceilings",
      kind: "ceiling",
      name: ud.roomLabel ? "Ceiling_" + labelFor(ud.roomLabel) : "Ceiling",
      extras: clean({ home3d_kind: "ceiling", home3d_room: ud.roomLabel || "" }),
    };
  if (role === "ground") return { collection: "site", kind: "ground", name: "Ground", extras: { home3d_kind: "ground" } };
  if (role === "site") return { collection: "site", kind: "site", name: "Site_Overlay", extras: { home3d_kind: "site" } };
  if (role === "jamb") return { collection: "structure", kind: "jamb", name: "Jamb", extras: { home3d_kind: "jamb" } };
  if (role === "curb") return { collection: "structure", kind: "curb", name: "Void_Curb", extras: { home3d_kind: "curb" } };
  if (ud.mep || role === "mep") return { collection: "mep", kind: "mep", name: "MEP_Run", extras: { home3d_kind: "mep" } };
  return { collection: "structure", kind: "structure", name: "Structure", extras: { home3d_kind: "structure" } };
}

/* "diningTable" / "dining_table" / "dining table" all become "DiningTable":
   one word per token, so a Blender search for "Table" finds every one of them
   regardless of which convention the catalogue entry was written in. */
export function labelFor(type) {
  var s = String(type == null ? "" : type)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim();
  if (!s) return "Object";
  return s
    .split(/\s+/)
    .map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("");
}

/* A material name a human can read in Blender's shader editor. Colour is part
   of it because the catalogue reuses one role across many finishes, and two
   materials both called "Wood" that are not the same wood is exactly the kind
   of thing that gets merged by hand and then breaks the next re-import. */
export function materialName(kind, hex, opts) {
  var parts = [labelFor(kind || "Material")];
  if (hex) parts.push(String(hex).replace("#", "").toUpperCase());
  if (opts && opts.transparent) parts.push("Glass");
  if (opts && opts.emissive) parts.push("Emissive");
  return sanitizeBlenderName(parts.join("_"), "Material");
}

function num(v) {
  return typeof v === "number" && isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
}
function clean(o) {
  Object.keys(o).forEach(function (k) {
    if (o[k] === "") delete o[k];
  });
  return o;
}
