/* ==========================================================================
   MATERIAL LIBRARY (material_library.js)
   --------------------------------------------------------------------------
   One catalogue for every surface the planner can texture. Each entry is a
   baked image set under assets/materials/<id>/ produced by
   tools/textures/gen_codex.mjs (Codex image generation → source PNG) and
   tools/textures/bake_pbr.py (Blender: seam blend, tiers, normal + ORM maps,
   material-ball thumbnail).

   Pure data: importable in Node for tests and the bake tools, no DOM, no THREE.

   Fields
     id       folder name under assets/materials/
     group    "gallery" (Material Library presets) | "floor" (room floor
              types) | "detail" (near-neutral tintable surface detail for
              furniture, multiplied by the part's colour) | "surface"
              (roof, ground, ceiling, worktops, veneers)
     legacy   the key this replaces: "preset:<PRESET_TEXTURES id>",
              "floor:<PAINT key>", "pbr:<pbr_textures family>"
     subject  what Codex is asked to draw
     sizeCm   real-world edge length one tile covers (also stated in the prompt
              so the generated pattern has the right scale)
     rough    [min, max] roughness; the bake modulates within it by luminance
     metal    metalness 0..1
     kind     "opaque" | "clearcoat" (glazed tile, lacquer: glossy, keeps its
              relief) | "polished" (marble, quartz, epoxy: glossy and FLAT — a
              vein is colour, not a groove) | "fabric" | "metal" | "glass"
     tint     true → the colour map is neutral and multiplies a tint colour
   ========================================================================== */

function M(id, group, legacy, subject, sizeCm, rough, metal, kind, tint) {
  return Object.freeze({
    id: id, group: group, legacy: legacy, subject: subject, sizeCm: sizeCm,
    rough: Object.freeze(rough), metal: metal || 0, kind: kind || "opaque", tint: !!tint,
  });
}
function G(id, subject, sizeCm, rough, metal, kind) { return M(id, "gallery", "preset:" + id, subject, sizeCm, rough, metal, kind); }
function F(key, subject, sizeCm, rough, metal, kind) { return M("floor_" + key, "floor", "floor:" + key, subject, sizeCm, rough, metal, kind); }
function D(fam, subject, sizeCm, rough, metal, kind) { return M("detail_" + fam, "detail", "pbr:" + fam, subject, sizeCm, rough, metal, kind, true); }
function U(id, subject, sizeCm, rough, metal, kind) { return M(id, "surface", null, subject, sizeCm, rough, metal, kind); }

export const MATERIALS = Object.freeze([
  // ---- Material Library presets (textures.js PRESET_TEXTURES) ----
  G("oak_natural", "natural light oak wood floor planks, 20 cm wide boards with fine grain and a few small knots", 200, [0.45, 0.7]),
  G("walnut_dark", "dark American walnut wood planks, rich chocolate brown straight grain", 200, [0.45, 0.68]),
  G("herringbone_parquet", "honey oak herringbone parquet floor, 7 x 35 cm blocks", 240, [0.45, 0.7]),
  G("white_ash", "whitewashed pale ash wood planks with visible open grain", 200, [0.5, 0.75]),
  G("ebony_black", "black ebony stained wood planks with subtle dark grain", 200, [0.35, 0.6]),
  G("bamboo_light", "light natural strand bamboo flooring planks with node marks", 180, [0.45, 0.7]),
  G("teak_rustic", "rustic oiled teak wood planks, warm orange-brown, varied boards", 220, [0.5, 0.75]),
  G("maple_honey", "honey maple wood planks, warm golden tone with soft figure", 200, [0.4, 0.65]),
  G("chevron_parquet", "medium oak chevron parquet floor, 45 degree points, 9 x 45 cm blocks", 240, [0.45, 0.7]),
  G("reclaimed_wood", "reclaimed barn wood planks, weathered grey-brown with nail holes and saw marks", 220, [0.65, 0.9]),
  G("calacatta_gold", "polished Calacatta gold marble slab, bright white with bold grey and soft gold veins", 300, [0.08, 0.2], 0, "polished"),
  G("nero_marquina", "polished Nero Marquina marble slab, deep black with crisp white veins", 300, [0.08, 0.2], 0, "polished"),
  G("terrazzo_speckled", "light terrazzo floor, cream base with small grey, black and terracotta chips", 250, [0.2, 0.4]),
  G("granite_grey", "honed grey granite with black, white and grey crystals", 200, [0.25, 0.45]),
  G("travertine_beige", "honed beige travertine stone with horizontal bands and small pores", 280, [0.4, 0.6]),
  G("emerald_marble", "polished emerald green marble with white and dark green veins", 300, [0.08, 0.2], 0, "polished"),
  G("slate_dark", "dark grey natural cleft slate stone surface", 200, [0.55, 0.8]),
  G("limestone_cream", "honed cream limestone with faint fossil speckles", 200, [0.45, 0.65]),
  G("onyx_gold", "polished honey gold onyx stone with translucent swirling bands", 250, [0.06, 0.18], 0, "polished"),
  G("subway_white", "glossy white 7.5 x 15 cm subway wall tiles in running bond with light grey grout", 180, [0.08, 0.3], 0, "clearcoat"),
  G("hexagon_teal", "glazed teal hexagon ceramic tiles, 10 cm across, dark grout", 200, [0.1, 0.3], 0, "clearcoat"),
  G("checkerboard_bw", "black and white marble checkerboard floor tiles, 30 cm squares", 240, [0.12, 0.3]),
  G("terracotta_rustic", "rustic handmade terracotta floor tiles, 20 cm squares, uneven orange tones", 200, [0.6, 0.85]),
  G("mosaic_blue", "blue glass pool mosaic tiles, 2.5 cm squares, mixed blue shades, white grout", 150, [0.05, 0.25], 0, "clearcoat"),
  G("moroccan_zellige", "green Moroccan zellige tiles, 10 cm squares, glossy uneven handmade glaze", 150, [0.06, 0.3], 0, "clearcoat"),
  G("fish_scale_tiles", "glossy blue fish scale (scallop) ceramic tiles", 150, [0.08, 0.3], 0, "clearcoat"),
  G("large_format_white", "large format white porcelain floor tiles, 60 x 120 cm, very thin light grout lines", 300, [0.15, 0.35]),
  G("polished_microcement", "polished light grey microcement surface with soft trowel clouds", 250, [0.25, 0.45]),
  G("venetian_plaster_white", "white Venetian plaster wall with soft burnished trowel marks", 300, [0.25, 0.5]),
  G("raw_board_concrete", "board-formed architectural concrete, grey with horizontal wood plank imprints", 220, [0.7, 0.9]),
  G("dark_microcement", "dark charcoal microcement surface with subtle cloudy trowel texture", 250, [0.3, 0.5]),
  G("lime_wash", "warm off-white limewash painted wall with soft brushy mottling", 200, [0.75, 0.95]),
  G("natural_linen", "natural oatmeal linen upholstery fabric weave, close up", 150, [0.85, 1], 0, "fabric"),
  G("caramel_leather", "caramel brown full grain leather upholstery surface", 180, [0.35, 0.6], 0, "fabric"),
  G("tufted_velvet_navy", "navy blue cotton velvet upholstery fabric with soft pile sheen", 150, [0.6, 0.85], 0, "fabric"),
  G("boucle_cream", "cream boucle upholstery fabric with small curly loops", 140, [0.9, 1], 0, "fabric"),
  G("grey_wool", "mid grey woven wool upholstery fabric, tweed-like", 150, [0.85, 1], 0, "fabric"),
  G("cognac_leather", "cognac brown aniline leather upholstery surface with natural grain", 180, [0.35, 0.6], 0, "fabric"),
  G("red_heritage_brick", "red heritage brick wall, running bond, light mortar joints, 21 x 6.5 cm bricks", 200, [0.75, 0.95]),
  G("whitewashed_brick", "whitewashed painted brick wall, running bond, loft style", 200, [0.75, 0.95]),
  G("botanical_wallpaper", "elegant botanical wallpaper, green leaves on a pale sage background", 250, [0.6, 0.8]),
  G("slatwall_oak", "vertical oak wood slat wall cladding, 3 cm slats with dark recessed gaps", 180, [0.5, 0.7]),
  G("brushed_steel", "brushed stainless steel sheet with fine straight horizontal brushing", 150, [0.25, 0.4], 1, "metal"),
  G("polished_brass", "polished brass sheet metal with soft warm reflections", 150, [0.15, 0.3], 1, "metal"),
  G("reeded_glass", "clear reeded fluted glass panel, vertical ribs about 1 cm wide, seen flat", 120, [0.02, 0.08], 0, "glass"),
  G("green_grass", "lush green lawn grass seen from above", 300, [0.85, 1]),
  G("composite_decking", "dark brown composite decking boards with grooved wood grain", 220, [0.6, 0.8]),
  G("sandstone_paving", "beige sandstone paving slabs in random sizes with sand joints", 250, [0.7, 0.9]),
  G("pebble_grey", "grey river pebbles, rounded stones packed together", 150, [0.55, 0.8]),
  G("cork_natural", "natural cork tile surface with granular texture", 150, [0.75, 0.95]),

  // ---- Room floor types (primitives.js PAINT / state.js TILE) ----
  F("wood", "light oak floor planks, 20 cm wide and 2 m long", 200, [0.45, 0.7]),
  F("laminate", "light beige oak-look laminate floor planks, 22.5 cm wide", 180, [0.35, 0.55]),
  F("darkwood", "dark smoked oak floor planks, 20 cm wide", 200, [0.45, 0.68]),
  F("parquet", "classic oak herringbone parquet, 6 x 30 cm blocks", 120, [0.4, 0.65]),
  F("deck", "weathered hardwood outdoor deck boards, 15 cm wide with gaps", 150, [0.65, 0.85]),
  F("tiles", "light grey ceramic floor tiles, 30 cm squares with grout", 120, [0.25, 0.45]),
  F("porcelain", "smooth light warm-grey porcelain floor tiles, 60 cm squares, thin grout", 120, [0.15, 0.35]),
  F("mosaic", "small aqua and white ceramic mosaic tiles, 2.5 cm squares", 80, [0.15, 0.35]),
  F("checker", "grey and white checkerboard floor tiles, 25 cm squares", 100, [0.2, 0.4]),
  F("hexTile", "white matte hexagon floor tiles, 20 cm across, grey grout", 110, [0.25, 0.45]),
  F("marble", "honed white Carrara marble floor tiles with soft grey veins", 300, [0.12, 0.3], 0, "polished"),
  F("marbleDark", "polished dark grey marble floor with white veins", 300, [0.1, 0.25], 0, "polished"),
  F("terrazzo", "grey and white terrazzo floor with medium stone chips", 160, [0.2, 0.4]),
  F("granite", "dark grey speckled granite floor tiles", 200, [0.2, 0.4]),
  F("slate", "grey slate floor tiles with natural cleft surface, 40 cm squares", 180, [0.55, 0.8]),
  F("brick", "reclaimed brick floor laid in herringbone pattern", 200, [0.7, 0.9]),
  F("pebble", "pebble mosaic floor, small rounded stones set in mortar", 90, [0.5, 0.75]),
  F("carpet", "warm beige cut-pile wall to wall carpet", 130, [0.9, 1], 0, "fabric"),
  F("carpetGrey", "grey loop-pile wall to wall carpet", 140, [0.9, 1], 0, "fabric"),
  F("vinyl", "light grey stone-look vinyl sheet flooring", 280, [0.35, 0.55]),
  F("epoxy", "seamless glossy light grey epoxy resin floor with faint flecks", 400, [0.05, 0.2], 0, "polished"),
  F("balcony", "grey outdoor anti-slip porcelain balcony tiles, 40 cm squares", 200, [0.55, 0.8]),
  F("concrete", "smooth sealed grey poured concrete floor with subtle mottling", 320, [0.45, 0.7]),
  F("pavers", "grey concrete block pavers in a herringbone pattern with sand joints", 180, [0.7, 0.9]),

  // ---- Tintable furniture surface detail (pbr_textures.js families) ----
  D("linen", "plain woven linen fabric, very light neutral grey, no colour, close up weave", 10, [0.88, 1], 0, "fabric"),
  D("boucle", "boucle fabric with small curly loops, very light neutral grey, no colour", 14, [0.9, 1], 0, "fabric"),
  D("velvet", "crushed cotton velvet with soft pile variation, very light neutral grey, no colour", 60, [0.6, 0.85], 0, "fabric"),
  D("cotton", "soft cotton twill bedding fabric, very light neutral grey, no colour", 30, [0.85, 1], 0, "fabric"),
  D("leather", "full grain leather with natural pores and creases, very light neutral grey, no colour", 20, [0.35, 0.6], 0, "fabric"),
  D("oak", "rift sawn oak veneer grain, very light desaturated neutral tone, straight grain running horizontally", 80, [0.45, 0.7]),
  D("marble", "white marble with soft grey veins, neutral, no colour cast", 120, [0.1, 0.25], 0, "polished"),
  D("quartz", "engineered quartz worktop with fine speckles, very light neutral grey", 45, [0.1, 0.25], 0, "polished"),
  D("brushed", "brushed metal with fine straight horizontal brushing, light neutral grey", 25, [0.25, 0.4], 1, "metal"),
  D("plaster", "fine smooth painted plaster wall, light neutral grey, subtle surface variation", 80, [0.75, 0.95]),
  D("foliage", "dense green plant leaves seen close up, desaturated light green", 40, [0.6, 0.85]),
  D("lacquer", "satin painted MDF cabinet door surface with very faint brush and orange-peel texture, light neutral grey", 60, [0.2, 0.55], 0, "clearcoat"),
  D("ceramic", "glazed white sanitary ceramic surface with subtle glaze variation, neutral", 40, [0.05, 0.2], 0, "clearcoat"),
  D("plastic", "fine matte textured plastic surface (mold-tech grain), light neutral grey", 20, [0.45, 0.65]),

  // ---- Surfaces with no picker of their own ----
  U("worktop_quartz_light", "light grey-white engineered quartz worktop with tiny speckles", 120, [0.1, 0.25], 0, "polished"),
  U("worktop_granite_black", "polished black granite worktop with small silver flecks", 120, [0.08, 0.22], 0, "polished"),
  U("worktop_butcher_block", "oiled oak butcher block worktop, 4 cm wide edge-glued staves", 120, [0.45, 0.65]),
  U("worktop_concrete", "smooth grey concrete worktop with tiny air pores", 120, [0.45, 0.65]),
  U("veneer_oak", "natural oak cabinet veneer, crown cut grain running vertically", 120, [0.45, 0.68]),
  U("veneer_walnut", "dark walnut cabinet veneer, crown cut grain running vertically", 120, [0.45, 0.65]),
  U("veneer_birch", "pale birch plywood veneer, soft figure running vertically", 120, [0.5, 0.7]),
  U("roof_clay_tile", "terracotta clay roof tiles (Roman pan tiles) seen straight on, overlapping rows", 200, [0.6, 0.85]),
  U("roof_shingle", "dark grey asphalt roof shingles, overlapping rows", 200, [0.75, 0.95]),
  U("roof_standing_seam", "dark grey standing seam metal roof, vertical seams 50 cm apart", 200, [0.3, 0.5], 0.8, "metal"),
  U("ceiling_paint", "smooth matte white painted ceiling with very faint roller texture", 200, [0.88, 0.98]),
  U("ground_lawn", "natural garden lawn seen from above, mixed green blades with a few clover leaves", 300, [0.85, 1]),
  U("ground_asphalt", "dark grey asphalt road surface with small aggregate", 300, [0.8, 0.95]),
]);

/* Materials with no grid in them (stone, plaster, grass, carpet …). Only these
   get the stochastic anti-tiling shader: re-offsetting a tile or plank image
   per region would double the grout lines where two regions blend. */
const ORGANIC = new Set([
  "calacatta_gold", "nero_marquina", "terrazzo_speckled", "granite_grey", "travertine_beige", "emerald_marble",
  "slate_dark", "limestone_cream", "onyx_gold", "polished_microcement", "venetian_plaster_white",
  "dark_microcement", "lime_wash", "green_grass", "pebble_grey", "cork_natural",
  "floor_marble", "floor_marbleDark", "floor_terrazzo", "floor_granite", "floor_pebble", "floor_carpet",
  "floor_carpetGrey", "floor_vinyl", "floor_epoxy", "floor_concrete",
  "worktop_quartz_light", "worktop_granite_black", "worktop_concrete", "ceiling_paint", "ground_lawn", "ground_asphalt",
]);
export function isOrganic(id) {
  return ORGANIC.has(id);
}

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));
const BY_LEGACY = new Map(MATERIALS.filter((m) => m.legacy).map((m) => [m.legacy, m]));

/** The catalogue entry for an id, or null. */
export function materialById(id) {
  return BY_ID.get(id) || null;
}

/** The entry that replaces an old preset / floor painter / pbr family key. */
export function materialForLegacy(key) {
  return BY_LEGACY.get(key) || null;
}

/* Saved references are "mat:<id>". Anything else (data: URL, http URL,
   painter key) is a legacy value the caller keeps handling as before. */
export const MAT_PREFIX = "mat:";
export function isMaterialRef(value) {
  return typeof value === "string" && value.startsWith(MAT_PREFIX) && BY_ID.has(value.slice(MAT_PREFIX.length));
}
export function materialRef(id) {
  return MAT_PREFIX + id;
}
export function materialFromRef(value) {
  return isMaterialRef(value) ? BY_ID.get(value.slice(MAT_PREFIX.length)) : null;
}

export const MATERIAL_TIERS = Object.freeze(["2k", "1k"]);
export const MATERIAL_MAPS = Object.freeze(["color", "normal", "orm"]);

/** Relative URL of one baked map: map ∈ MATERIAL_MAPS, tier ∈ MATERIAL_TIERS.
    ORM (AO/roughness/metalness) is baked at 1k only — at 2k it would add
    ~22 MB of GPU memory per material for detail nobody can see — so any tier
    asked for "orm" resolves to the 1k file. */
export function materialUrl(id, map, tier) {
  const t = map === "orm" ? "1k" : tier;
  return "assets/materials/" + id + "/" + map + "_" + t + ".webp";
}
export function materialThumbUrl(id) {
  return "assets/materials/" + id + "/thumb.webp";
}

/** An image a UI chip can show for a saved texture value: the baked ball
    for a "mat:" ref, the value itself for any URL. */
export function previewUrlFor(value) {
  const m = materialFromRef(value);
  return m ? materialThumbUrl(m.id) : value;
}

/** Every file the bake must produce for one id (thumb included). */
export function materialFiles(id) {
  const out = new Set();
  for (const map of MATERIAL_MAPS) for (const tier of MATERIAL_TIERS) out.add(materialUrl(id, map, tier));
  out.add(materialThumbUrl(id));
  return [...out];
}

/* The prompt Codex gets. The scale sentence matters as much as the subject:
   the 3D side repeats one image every `sizeCm`, so a plank or tile drawn at
   the wrong size reads as a doll's-house floor. */
export function codexPrompt(m) {
  const neutral = m.tint
    ? " The colours must be neutral and very light (close to white) because the app multiplies this image by a colour; keep the surface detail visible."
    : "";
  return (
    "Use your image generation tool to create exactly one square image and do nothing else. " +
    "Subject: a seamless tileable texture of " + m.subject + ". " +
    "The image shows a " + m.sizeCm + " x " + m.sizeCm + " cm patch of the surface, so draw every element at that real-world scale. " +
    "Photographed straight on (orthographic, no perspective), flat even diffuse lighting, no shadows, no specular highlights, no vignette, " +
    "no text, no watermark, no border; the pattern fills the frame edge to edge and the left edge continues into the right edge and the top into the bottom." +
    neutral + " Reply only with the word DONE."
  );
}
