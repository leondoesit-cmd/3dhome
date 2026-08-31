// Shared application state + constants + tiny helpers.
// All mutable cross-module state lives on the single object `S` so any module can read/write it.
import { refreshRuntimePlacement } from "./core/runtime.js";
import { installSpatialProject } from "./core/spatial_project.js";
import { ensureWallTypes } from "./wall_types.js";

export const WALL_H = 270,
  WALL_T = 10,
  MOUNTH = 248; // wall defaults + ceiling-fixture hang height

export const SNAP_GRID = 5; // grid snapping interval in cm

// texture tile size (cm) — how much floor one 256px texture tile covers.
// Keyed by the same names as the PAINT table in primitives.js.
export const TILE = {
  wood: 240,
  laminate: 320,
  darkwood: 240,
  parquet: 180,
  deck: 260,
  tiles: 120,
  porcelain: 120,
  mosaic: 80,
  checker: 100,
  hexTile: 110,
  marble: 300,
  marbleDark: 300,
  terrazzo: 160,
  granite: 200,
  slate: 180,
  brick: 200,
  pebble: 90,
  carpet: 130,
  carpetGrey: 140,
  vinyl: 280,
  epoxy: 400,
  balcony: 200,
  concrete: 320,
};

export const FILL2D = {
  wood: "#dcc6a0",
  laminate: "#e5d5b8",
  darkwood: "#7a5c3c",
  parquet: "#c79753",
  deck: "#a58459",
  tiles: "#dde3e6",
  porcelain: "#e8eaec",
  mosaic: "#a8c8d2",
  checker: "#bcbab5",
  hexTile: "#e3e6e8",
  marble: "#e8e6e0",
  marbleDark: "#3a3d42",
  terrazzo: "#e2ded4",
  granite: "#5c6165",
  slate: "#565d62",
  brick: "#a3624c",
  pebble: "#a8a294",
  carpet: "#9a9080",
  carpetGrey: "#8c9094",
  vinyl: "#adaca7",
  epoxy: "#ccd4d9",
  balcony: "#9a9c9e",
  concrete: "#d0cec9",
}; // 2D floor tints

// 3D material colors
export const CAB = 0xcebfa4,
  ISL = 0xb89a6e,
  TOP = 0xe8e1d3,
  STEEL = 0xb4bcc1,
  DARK = 0x222a2e,
  GLASS = 0x9fc4d6,
  HANDLE = 0x8a8f92,
  WALLC = 0xefe9dd,
  FLOOR = 0xc9b48f,
  GROUND = 0xd8c8a8,
  FABRIC = 0x9aa6a8,
  WOOD = 0x9c7a4e,
  BEDC = 0xece7dd,
  TVB = 0x15191c,
  GREEN = 0x6f8f5a,
  RUGC = 0xb88f7a,
  PVC_WHITE = 0xf2f5f7,
  BLACK_PLASTIC = 0x222222,
  ALUMINUM = 0xb0b3b5,
  WATER = 0x76b6c4,
  TUFF = 0x6e5245,
  SKIN = 0xe8b48c,
  SHIRT = 0x3d6ea5,
  PANTS = 0x394a5a,
  HAIR = 0x3a2c22;

// Real-world-inspired material behavior. Units are calibrated to the stress
// model in physics.js where a direct crosshair hit produces stress ~50-150 on
// the struck part (falling off with distance and rising for small parts).
// - glass/ceramic are brittle: yield≈ultimate≈shatter, so they crack straight
//   into shards instead of bending or detaching whole.
// - metal is ductile: bends at low stress but practically never shatters.
// - fabric/foam tears off but can never fracture into rigid shards.
export const MAT_PROPS = {
  glass:   { yield: 8,  ultimate: 9,   shatter: 10,  type: "glass" },
  ceramic: { yield: 12, ultimate: 14,  shatter: 16,  type: "ceramic" },
  steel:   { yield: 60, ultimate: 250, shatter: 800, type: "metal" },
  alu:     { yield: 40, ultimate: 150, shatter: 500, type: "metal" },
  wood:    { yield: 35, ultimate: 55,  shatter: 90,  type: "wood" },
  board:   { yield: 22, ultimate: 35,  shatter: 55,  type: "wood" }, // particle board / MDF
  plastic: { yield: 25, ultimate: 45,  shatter: 70,  type: "plastic" },
  fabric:  { yield: 15, ultimate: 30,  shatter: 1e9, type: "fabric" },
  masonry: { yield: 50, ultimate: 60,  shatter: 70,  type: "masonry" }, // walls: a punch thuds, a hammer bites
};

export const PHYSICS_MATS = {
  // mapped by hex color
  [GLASS]: MAT_PROPS.glass,
  [WATER]: MAT_PROPS.glass,
  [STEEL]: MAT_PROPS.steel,
  [ALUMINUM]: MAT_PROPS.alu,
  [HANDLE]: MAT_PROPS.steel,
  [DARK]: MAT_PROPS.steel,
  [WOOD]: MAT_PROPS.wood,
  [TUFF]: MAT_PROPS.wood,
  [CAB]: MAT_PROPS.board,
  [ISL]: MAT_PROPS.board,
  [TOP]: MAT_PROPS.ceramic, // countertop: stone/ceramic slab
  [FABRIC]: MAT_PROPS.fabric,
  [BEDC]: MAT_PROPS.fabric,
  [RUGC]: MAT_PROPS.fabric,
  [SHIRT]: MAT_PROPS.fabric,
  [PANTS]: MAT_PROPS.fabric,
  [GREEN]: MAT_PROPS.fabric, // plants: soft, tear not shatter
  [BLACK_PLASTIC]: MAT_PROPS.plastic,
  [PVC_WHITE]: MAT_PROPS.plastic,
  [TVB]: MAT_PROPS.plastic,
  default: MAT_PROPS.board // most furniture carcass is engineered board
};

/* The five work-set layers, in the order the UI lists them. `underlay` is last
   because it is scenery — an imported blueprint or satellite trace — that you
   dim and hide but never edit. js/layers.js re-exports this list; the policy
   lives there, the data lives here, and neither file imports the other's
   half. */
export const LAYER_IDS = ["structure", "furniture", "mep", "annotations", "underlay"];

/* A fresh layer table at its defaults.

   `vis` is three-state rather than a boolean because "ghost" is the useful
   middle: geometry you can still see yourself working against but that no
   click can reach. `pickOverride`/`snapOverride` are per-layer escape hatches —
   null follows the work set, true/false pin the answer. `autoLock` re-locks a
   layer when it stops being the work set, which is wanted for furniture and
   MEP (dense, easy to shove by accident) and pointedly not for structure. */
export function defaultLayers() {
  var t = {};
  LAYER_IDS.forEach(function (id) {
    t[id] = {
      vis: "show",
      locked: false,
      pickOverride: null,
      snapOverride: null,
      autoLock: id === "furniture" || id === "mep",
    };
  });
  return t;
}

export const S = {
  // model
  nodes: [],
  walls: [],
  /* Reusable architectural wall assemblies.  The catalogue is populated by
     wall_types.js on first use; keeping it in project state makes user-defined
     assemblies portable with the drawing instead of browser-local presets. */
  wallTypes: [],
  wallDrawDefaults: {
    typeId: "generic",
    kind: "normal",
    datum: "center",
    loc: "center",
    dimSide: 0,
    from: "center",
    phase: "new",
    offsetDist: 120,
  },
  openings: [],
  items: [],
  // placeholder points on the plan (see js/markers.js): a marked spot that
  // always shows its four clearances and can hold one catalogue piece,
  // -> [{id,x,z,name,itemId}]
  markers: [],
  /* Stairwell / slab cuts on THIS storey (js/slab_openings.js). A void punches
     the floor (and ceiling) of the storey it lives on — typically the floor
     above a flight of stairs stored as ordinary furniture on the storey below. */
  slabOpenings: [],
  /* Explicit user-authored dimensions BETWEEN pieces of geometry — distances
     from another corner or reference point, joint angles, parallel offsets.
     See js/wall_constraints.js; anchors are wall-id + end, never node indices. */
  wallCons: [],
  roomMeta: {}, // roomMeta: key(sorted wall ids) -> {name,floor,locked}
  /* Room-level requirements — area, minimum dimension, squared-up (see
     js/room_cons.js). Keyed by the same sorted-wall-id room key as roomMeta.
     Mostly CHECKS rather than drivers: there is no defensible answer to which
     corner should move to make a room two square metres bigger. */
  roomCons: [],
  /* Named parameters the plan's dimensions can be written in terms of, e.g.
     `corridor = 120` driving three constraints at once (js/plan_params.js).
     Expressions go through the sketcher's parser, never eval. */
  planVars: [],
  /* Constraint-engine warnings the user has acknowledged (see
     js/constraint_engine.js). Map of warning key -> 1; a key names a wall END
     ("end:<wallId>:a") or a PAIR of walls meeting at a joint ("ang:<id>-<id>"),
     never a node index — node indices are array slots that welding reuses, so
     an acknowledgement keyed on one would drift onto an unrelated corner. */
  ignoredWarnings: {},
  // selection + dirty flag
  sel: null,
  dirty3D: true,
  snapObj: true,
  /* Automatic facing for a dropped/dragged piece (js/item_orient.js): a sink
     looks out of the counter, a bed puts its head on the wall, a chair faces
     the table. Off = every piece arrives at 0° the way it always did. */
  autoFace: true,
  /* transient, one gesture only: Alt held during an item drag, which suspends
     the automatic facing so the piece keeps the angle it has. endAction()
     clears it — "just this once" must not become a setting. */
  orientHold: false,
  // how far one press of the rotate buttons / the R key turns: 15, 45 or 90
  rotStep: 15,
  /* Drafting aids, CAD-style and individually toggleable from the plan status
     bar (F3 / F8 / F9). They gate snapPoint(), which is the single resolver
     every drawing and corner-drag gesture goes through:
       osnap  - snap onto existing corners / points along a wall
       ortho  - constrain a new segment to 90° increments only
       gsnap  - round to the SNAP_GRID; off = free placement at cursor
     Without an off switch a precise-but-unaligned point was simply not
     drawable, which is the usual reason people abandon a plan editor. */
  osnap: true,
  ortho: false,
  gsnap: true,
  /* How HARD the aids pull, and which of them pull at all.
     `snapStrength` multiplies every tolerance in snapPoint() at once — the
     pick radius for corners and on-wall points, the angular gates, and the
     alignment-inference window. 1 is the tuned default; below it the cursor
     has to be nearly on the target, above it the snap reaches further.
     `snapKinds` splits what used to be the single OSNAP switch into the six
     snaps that actually exist, because they fail differently: the wall-
     direction snap fires off EVERY wall in the plan, so on a busy plan it can
     latch almost everywhere, while endpoint snapping is nearly always wanted.
     Turning one off must not cost you the other five. */
  snapStrength: 1,
  snapKinds: {
    corner: true, // existing corners
    marker: true, // placeholder reference points (they are datums)
    midpoint: true, // midpoint of a wall
    onwall: true, // a point along a wall (splits it)
    item: true, // corners and centre of a furniture footprint
    perpendicular: true, // perpendicular foot from the active corner
    intersection: true, // real/virtual wall-line intersections
    extension: true, // continuation of a wall line beyond its end
    bisector: true, // angle bisectors at a multi-arm joint
    inc: true, // 15° increments
    walldir: true, // parallel/continuation of an existing wall
    align: true, // slide along the ray to line up with a corner
    symmetry: true, // equal angles at both ends of a translated wall
  },
  /* transient, one gesture only: force snapPoint() to consider a SINGLE kind
     (`snapOnly`), or step past the top-ranked candidate to the next one
     (`snapCycle`, bumped by Tab). Both are the answer to a snap that is
     grabbing the wrong thing RIGHT NOW — reaching for the preference chips to
     fix one click is a modal cure for a momentary problem, and the setting
     then stays wrong for everything afterwards. Cleared at endAction(). */
  snapOnly: null,
  snapCycle: 0,
  /* transient: the ranked alternatives under the cursor, so the HUD can say
     how many there are and Tab has something to cycle through. */
  snapAlts: [],
  /* transient, one gesture only: Alt held during a drag, which suspends the
     dimension solver so a corner can be pulled where a constraint forbids.
     endAction() clears it and runs a full solve, so the escape hatch cannot
     leave the drawing disagreeing with its own dimensions. */
  conOverride: false,
  /* transient: the next equal-angle authored from the corner palette is a
     REFERENCE dimension (compare, do not equalise). Set for the duration of
     one action by the "Compare angles" button. */
  nodePairReport: false,
  /* transient: the wall an item drag last snapped flush against. Read once at
     endAction to turn the snap into a standing hold (js/item_align.js). */
  itemSnapWall: null,
  /* transient: what the last snapPoint() actually latched onto, for the HUD
     readout and the on-canvas glyph -> { type, x, z, ang } | null.
     type: corner | wall | angle | align | grid | free */
  /* transient: a dimension being authored from the wall inspector, waiting
     for its far side to be clicked on the plan (see startConPick) ->
     { kind:"dist"|"angle"|"offset", wall:<wallId>, end:"a"|"b" } | null */
  conPick: null,
  snapInfo: null,
  /* transient: typed length/angle entry while the wall tool is rubber-banding
     -> { len:"", ang:"", field:"len" } | null. See js/cad_hud.js. */
  numEntry: null,
  /* Work-set layers. `layers` holds one record per id in LAYER_IDS and
     `workSet` names the layer being edited ("all" focuses every layer at
     once); js/layers.js turns the pair into the rank/drag/snap policy that the
     plan, the hit tests and the 3D raycasts all consult. The table lives here
     rather than in layers.js so that S is well-formed for anything that reads
     it, whether or not layers.js has been imported.

     These are view PREFERENCES, not part of the drawing: they persist through
     localStorage (initLayers/saveLayers) and stay out of history.snap(), which
     whitelists model fields and deliberately excludes display flags. Undo must
     never un-hide a layer.

     `workSetPinned` is the user pinning the work set by hand, which stops
     setTool() from moving it for them. */
  layers: defaultLayers(),
  workSet: "furniture",
  workSetPinned: false,
  // 3D edit mode: left-drag in the 3D view moves the piece under the cursor
  edit3D: false,
  // the piece a drag is about to drop ONTO (js/stack.js) — highlighted in the
  // plan while the pointer is down, cleared when the drag ends
  stackHost: null,
  // display / environment settings
  showDims: true,
  /* Wall dimensions are INTERIOR measurements (js/constraint_engine.js): the
     number drawn, labelled and typed is the clear span between the inside
     faces, and a wall that later gains a neighbour at a corner grows outward to
     keep that span. Turning this off restores the old centreline behaviour,
     where attaching a 10 cm wall to each end of a 300 cm wall left 290 cm. */
  interiorDims: true,
  showCeiling: false,
  floorTex: "wood",
  wallColor: 0xefe9dd,
  hour: 13,
  northAngle: 0,
  dayK: 1,
  artK: 0.25,
  // transient: smart-alignment guide coordinates while dragging
  alignX: null,
  alignZ: null,
  // transient: the wall under the cursor + how far along it we are, as the two
  // distances start→cursor and cursor→end (js/interaction.js updateWallProbe)
  wallProbe: null,
  // transient: the piece that just clicked into a snap, blinking for 300 ms.
  // snapFlashKey is what it snapped TO, so holding a snap does not strobe.
  snapFlash: null,
  snapFlashKey: null,
  // true only while a finger is dragging: gates the snap haptic (a mouse drag
  // has the blink and needs no buzz)
  touchDrag: false,
  // transient: direct finger contact and visual precision-aid state. Creation
  // modes may refine separately, but selection never receives an offset point.
  touchContact: null,
  // transient: drafting guides while drawing/dragging a wall corner.
  // [{ x1,z1, x2,z2 }] — a dashed line from the corner being aligned WITH to
  // the point being placed, so "square with that corner over there" is visible.
  snapGuides: [],
  // transient: walk-mode (fpv/tpv) camera pose mirrored for the 2D plan
  // indicator — {x,z,yaw,tp} in world cm / radians, or null when not walking
  walk2D: null,
  // transient: request a 3D repaint WITHOUT a scene rebuild (e.g. a texture
  // finished loading). S.dirty3D triggers a full rebuild3D — far heavier.
  repaint3D: false,
  // transient: per-item 3D updates that skip the full rebuild3D. Map of
  // item id -> "move" (only the piece's x/z/rot changed, so its existing group
  // is just re-transformed) or "build" (its geometry/materials changed, so only
  // that one group is torn down and rebuilt). Drained by the 3D loop, which
  // falls back to a full rebuild for anything it can't do piecewise.
  // S.dirty3D always wins over this.
  items3D: new Map(),
  // real-world site / mapping overlay (see js/site.js). null image caches are
  // rebuilt at runtime — only the params below are persisted.
  site: {
    enabled: false,
    lat: null,
    lon: null,
    zoom: 19, // web-mercator zoom of the fetched aerial tile
    label: "", // resolved address string, for display
    groundRot: 0, // extra rotation of the aerial under the model (deg)
    offX: 0, // nudge of the aerial center vs. content center (cm)
    offZ: 0,
    opacity: 0.85,
    show2D: true,
    show3D: true,
    streetView: false,
    floor: 0, // apartment floor in the real building (0=ground) — lowers the
    // street-view skybox + aerial ground so window views match the height
    provider: "osm", // footprint provider: osm | govmap
    mapProvider: "esri", // picker-map base imagery: esri | google (google needs a key)
    footprint: null, // { polygonLL:[[lat,lon]...], levels, heightM } once fetched
  },
  // Calibrated floor-plan raster drawn under the 2D model while tracing.
  // Plain JSON + a data URL makes the reference local-first and portable.
  blueprintTrace: null,
  // 2D view transform
  SC: 1,
  OX: 0,
  OY: 0,
  CW: 0,
  CH: 0,
  planRot: 0, // 2D plan view rotation in degrees (CAD-style N/E/S/W-up)
  viewAxis: "top", // 2D projection: top (plan) | front | back | left | right (elevations)
  // interaction state
  tool: "select",
  action: null,
  /* Wall placement is a connected run, like Chief Architect's continuous
     wall mode. `drawFrom` is carried to the end of each committed segment;
     right-click, double-click or Escape ends the run. `wallPress` makes the
     first segment work as click-drag as well as click-click without changing
     the topology path both gestures eventually use. */
  freshWall: null, // legacy transient; cleared when tools change
  wallPress: null, // {pointerId,x,y}: possible first-segment click-drag
  wallDrag: null, // whole-wall translation: {wall, sx, sz, orig:[{i,x,z}]}
  /* transient guide shown while a wall with one neighbour at each end is
     translated near the equal-end-angle position.  interaction.js owns the
     geometry; plan2d.js only renders the two arcs + correction indicator. */
  wallAngleGuide: null,
  hoverItem: null, // item under the cursor (select tool, not dragging) -> distance overlay
  hoverPt: null, // {x,z} world cursor position -> always-on distance overlay
  eraseHover: null, // {kind, ref} object the eraser is about to delete
  // placeholder point under the cursor -> its clearances plus a small info card
  // in the plan, so a point can be read without selecting it
  hoverMarker: null,
  hoverNode: null, // corner under the cursor -> its own read-out card
  // which half of the selected wall a typed length/angle edit grows or shrinks:
  // "a" | "b" (that end moves, the other stays put) | "mid" (both, symmetric) |
  // null = auto (move the freer end). Set by hovering/clicking a half in 2D.
  wallEditEnd: null,
  wallHoverHalf: null, // half of the selected wall under the cursor, for the hint
  // constraint warnings: the key under the cursor (plan hover OR list hover)
  // and the one picked in either place. Both drive the SAME highlight on the
  // canvas and in the warning list, which is what makes the two views feel
  // like one thing.
  warnHover: null,
  warnSel: null,
  // id of the explicit dimension/relation currently under the pointer. The
  // canvas and every constraint list share this field, so hovering either one
  // highlights the same geometry in the plan.
  conHover: null,
  // transient: an endpoint drag that resizes ONE wall and lets its neighbours
  // keep their locked dimensions -> { node, wall } (wall id, or null for a
  // plain joint move)
  nodeDrag: null,
  // how many joints the last gesture released, so it can be reported once when
  // the gesture ends instead of on every frame of it
  jointsReleased: 0,
  drawing: false,
  // first node of the current wall polyline — auto-close magnets back to it
  drawStart: null,
  // parallel-offset tool: { hostId, dist, side }
  offsetDraft: null,
  // join-walls tool: first wall waiting for its collinear partner
  joinPick: null,
  // three-click curved-wall placement (start, end, point on arc)
  arcDraft: null,
  // two-click rectangle-room placement: first corner, then opposite corner
  rectDraft: null,
  // library item armed for click-to-place on the plan (modern chrome)
  placeType: null,
  drawFrom: null,
  drawFromSplit: false,
  drawWalls: [], // ids committed in the current wall-placement run
  previewPt: null,
  // Live four-way clearance targets while drawing: nearest obstacle, items
  // only, walls only, or a hand-picked set of walls.
  measureTarget: "nearest",
  measureWalls: [],
  // transient: snapped position of the next placeholder point, while the point
  // tool is armed and the cursor is over the plan
  markerPreview: null,
  dragRoom: null,
  mepDrag: null, // transient: active MEP node/vertex/run drag
  dragOff: { x: 0, z: 0 },
  panStart: null,
  segPreview: null,
  // id counter
  idc: 1,
  // Project-level capabilities. Each floor stores a plain scene snapshot
  // without another workspace object, preventing recursive saves.
  workspace: {
    id: "project-default",
    name: "Home project",
    activeFloor: "floor-1",
    referenceFloor: null,
    showReferenceFloor: false,
    floors: [],
    constraints: [],
    comments: [],
    role: "owner",
    quality: "auto",
  },
  // Canonical reusable definitions plus generated planner/runtime views.
  // `items` are the spatial instances and link here through definitionId.
  parametric: {
    schemaVersion: 2,
    definitions: {},
    derived: {},
    runtime: {},
    revision: 1,
  },
};

installSpatialProject(S);
ensureWallTypes(S);

/* Global structure lock: with it on, the plan still selects walls, corners and
   rooms but refuses to DRAG them. Panning the drawing or nudging a piece of
   furniture over a wall is the common gesture; shoving the wall itself is
   almost never what was meant, and it is only noticed much later.

   It is no longer a field of its own — it is a live alias of the structure
   layer's lock, so the `L` shortcut, the toolbar's lock button and the layer
   chip cannot drift apart. Enumerable, because it was a plain property before
   and anything walking S should still see it.

   The default stays `false`. Under a work set, a default-on structure lock is
   pure friction: while furnishing, structure is already undraggable by rank so
   the lock changes nothing, and the moment the work set switches TO structure
   the lock is guaranteed to be in the way — making "unlock" the mandatory
   first step of every structural edit. A lock is worth having only where it
   was explicitly asked for. */
Object.defineProperty(S, "lockStruct", {
  configurable: true,
  enumerable: true,
  get: function () {
    return !!(S.layers && S.layers.structure && S.layers.structure.locked);
  },
  set: function (v) {
    if (!S.layers) S.layers = defaultLayers();
    S.layers.structure.locked = !!v;
  },
});

export function uid() {
  return S.idc++;
}
/* Queue a piece for the cheap per-item 3D path instead of a whole-scene
   rebuild. Dragging a sofa used to set S.dirty3D on every pointermove, and
   rebuild3D re-generates EVERY wall, floor and piece of furniture from scratch
   (~180 ms on a 37-piece flat, most of it furniture) — so a drag ran at a few
   frames a second. mode "move" only re-transforms the existing group; "build"
   regenerates that one piece. "build" wins if both are queued for the same id. */
export function touchItem3D(it, mode) {
  if (!it) return;
  refreshRuntimePlacement(S, it);
  if (mode === "build" || S.items3D.get(it.id) === "build")
    S.items3D.set(it.id, "build");
  else S.items3D.set(it.id, "move");
}
export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
export function fin(v) {
  return typeof v === "number" && isFinite(v);
}
export function hexStr(n) {
  return "#" + ("000000" + ((n >>> 0) & 0xffffff).toString(16)).slice(-6);
}
export function throttle(fn) {
  let p = false;
  return (...args) => {
    if (!p) {
      p = true;
      requestAnimationFrame(() => { fn(...args); p = false; });
    }
  };
}

/* Cancel every in-progress plan gesture and drop every transient reference INTO
   the model — the corner a rubber band is drawn from, the wall under the
   cursor, the piece mid-snap-flash, the drop target.

   Two callers replace the model wholesale: undo/redo restoring a snapshot, and
   switching to another storey. Both kept their own copy of this list, and the
   copies drifted — which is the bug twice over. A draft holds NODE INDICES into
   the model it was started in, so one that outlives the swap either completes a
   rectangle begun on another floor (editing the wrong storey) or makes the next
   render dereference a corner that no longer exists.

   The TOOL is deliberately left armed: the user picked it and nothing about a
   state swap says otherwise. Only the gesture restarts. setTool() does NOT use
   this — its clearing is per-tool ("leaving the arc tool drops the arc draft"),
   a different rule that happens to touch some of the same fields. */
export function cancelDraftGestures() {
  // the wall / rectangle / arc / offset / join drafts, and their preview
  S.drawing = false;
  S.drawFrom = null;
  S.drawStart = null;
  S.drawFromSplit = false;
  S.drawWalls = [];
  S.wallPress = null;
  S.rectDraft = null;
  S.arcDraft = null;
  S.offsetDraft = null;
  S.joinPick = null;
  S.previewPt = null;
  S.segPreview = null;
  S.markerPreview = null;
  S.freshWall = null;
  // snap feedback, which names geometry that may not exist any more
  S.snapGuides = [];
  S.snapInfo = null;
  S.snapFlash = null;
  S.snapFlashKey = null;
  // live pointer state and what it had hold of
  S.action = null;
  S.nodeDrag = null;
  S.dragRoom = null;
  S.mepDrag = null;
  S.panStart = null;
  S.wallProbe = null;
  S.hoverItem = null;
  S.stackHost = null;
  S.eraseHover = null;
}
