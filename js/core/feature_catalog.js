// Canonical feature vocabulary for parametric part documents.
//
// The UI, history layer and kernel adapter all consume this catalogue.  A
// feature is therefore a declarative record with one meaning, rather than a UI
// button whose click handler happens to mutate a mesh in a particular way.

const LENGTH = { type: "number", unit: "document-length", min: 1e-6 };
const SIGNED_LENGTH = { type: "number", unit: "document-length" };
const ANGLE = { type: "number", unit: "deg" };
const BOOLEAN = { type: "boolean" };
const ENUM = (...values) => ({ type: "enum", values });

const OPERATIONS = [
  { value: "add", label: "Add material" },
  { value: "new-body", label: "New body" },
];
const EXTENTS = [
  { value: "blind", label: "Blind" },
  { value: "through-all", label: "Through all" },
  { value: "up-to-next", label: "Up to next" },
  { value: "up-to-face", label: "Up to face" },
  { value: "mid-plane", label: "Mid-plane" },
];
const DIRECTIONS = [
  { value: "forward", label: "Along normal" },
  { value: "reverse", label: "Reverse normal" },
];

const resultGroup = (operation = true) => ({
  id: "result", label: "Result", icon: "ph-union",
  fields: [
    ...(operation ? [{ key: "operation", label: "Operation", type: "select", choices: OPERATIONS }] : []),
    { key: "mergeResult", label: "Merge result", type: "boolean" },
  ],
});

export const FEATURE_CATALOG = Object.freeze({
  extrude: {
    label: "Extrude / Boss",
    icon: "ph-cube",
    selection: { sketches: { min: 1, max: 1 }, topology: { kinds: ["face"], max: 1 } },
    defaults: { operation: "add", endCondition: "blind", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Extent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", type: "boolean" },
        { key: "offset", label: "Start offset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "draft", label: "Draft", icon: "ph-angle", fields: [
        { key: "draftAngle", label: "Draft angle", type: "number", unit: "angle", min: -89, max: 89, step: 0.1 },
        { key: "draftOutward", label: "Draft outward", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  extrudeCut: {
    label: "Extrude Cut",
    icon: "ph-scissors",
    selection: { sketches: { min: 1, max: 1 }, features: { min: 1, max: 1 } },
    defaults: { operation: "subtract", endCondition: "through-all", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, keepTool: false },
    parameters: { operation: ENUM("subtract"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, keepTool: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Cut extent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", type: "boolean" },
        { key: "offset", label: "Start offset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "draft", label: "Draft", icon: "ph-angle", fields: [
        { key: "draftAngle", label: "Draft angle", type: "number", unit: "angle", min: -89, max: 89, step: 0.1 },
        { key: "draftOutward", label: "Draft outward", type: "boolean" },
        { key: "keepTool", label: "Keep cutting tool", type: "boolean" },
      ]},
    ]},
  },
  revolve: {
    label: "Revolve",
    icon: "ph-arrow-counter-clockwise",
    selection: { sketches: { min: 1, max: 1 }, references: { kinds: ["axis"], min: 1, max: 1 } },
    defaults: { operation: "add", angle: 360, direction: "forward", symmetric: false, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), angle: { ...ANGLE, min: 1e-6, max: 360 }, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "axis", label: "Axis and extent", icon: "ph-axis-arrow", fields: [
        { key: "$axisReference", label: "Axis", type: "axis-reference" },
        { key: "angle", label: "Angle", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "direction", label: "Direction", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  sweep: {
    label: "Sweep",
    icon: "ph-path",
    selection: { sketches: { min: 2, max: 2 } },
    defaults: { operation: "add", orientation: "follow-path", twistAngle: 0, scale: 1, solid: true, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), orientation: ENUM("follow-path", "minimum-twist", "fixed"), twistAngle: ANGLE, scale: { type: "number", min: 1e-6 }, solid: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "path", label: "Path behavior", icon: "ph-path", fields: [
        { key: "orientation", label: "Profile orientation", type: "select", choices: [{value:"follow-path",label:"Follow path"},{value:"minimum-twist",label:"Minimum twist"},{value:"fixed",label:"Keep profile fixed"}] },
        { key: "twistAngle", label: "Twist", type: "number", unit: "angle", step: 1 },
        { key: "scale", label: "End scale", type: "number", min: 1e-6, step: 0.05 },
        { key: "solid", label: "Create solid", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  loft: {
    label: "Loft",
    icon: "ph-stack",
    selection: { sketches: { min: 2 } },
    defaults: { operation: "add", continuity: "position", solid: true, ruled: false, closed: false, matchProfiles: true, tolerance: 0.001, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), continuity: ENUM("position", "tangent", "curvature"), solid: BOOLEAN, ruled: BOOLEAN, closed: BOOLEAN, matchProfiles: BOOLEAN, tolerance: LENGTH, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "sections", label: "Sections", icon: "ph-stack", fields: [
        { key: "continuity", label: "Continuity", type: "select", choices: [{value:"position",label:"Position (G0)"},{value:"tangent",label:"Tangent (G1)"},{value:"curvature",label:"Curvature (G2)"}] },
        { key: "matchProfiles", label: "Match profile vertices", type: "boolean" },
        { key: "ruled", label: "Ruled sections", type: "boolean" },
        { key: "closed", label: "Closed loft", type: "boolean" },
        { key: "solid", label: "Create solid", type: "boolean" },
        { key: "tolerance", label: "Tolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
      ]},
      resultGroup(true),
    ]},
  },
  fillet: {
    label: "Fillet",
    icon: "ph-corners-out",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["edge", "face"], min: 1 } },
    defaults: { radius: 1, propagation: "tangent", section: "rational", continuity: "tangent" },
    parameters: { radius: LENGTH, propagation: ENUM("tangent", "feature"), section: ENUM("rational", "quasi-angular", "polynomial"), continuity: ENUM("tangent", "curvature") },
    editor: { groups: [{ id: "shape", label: "Fillet definition", icon: "ph-corners-out", fields: [
      { key: "radius", label: "Radius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "propagation", label: "Edge scope", type: "select", choices: [{value:"tangent",label:"Selected tangent chain"},{value:"feature",label:"Whole feature"}] },
      { key: "section", label: "Section representation", type: "select", choices: [{value:"rational",label:"Rational"},{value:"quasi-angular",label:"Quasi-angular"},{value:"polynomial",label:"Polynomial"}] },
      { key: "continuity", label: "Surface continuity", type: "select", choices: [{value:"tangent",label:"Tangent (C1)"},{value:"curvature",label:"Curvature (C2)"}] },
    ]}]},
  },
  chamfer: {
    label: "Chamfer",
    icon: "ph-corners-in",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["edge", "face"], min: 1 } },
    defaults: { mode: "equal-distance", distance: 1, secondDistance: 1, angle: 45, flip: false },
    parameters: { mode: ENUM("equal-distance", "two-distance", "distance-angle"), distance: LENGTH, secondDistance: LENGTH, angle: { ...ANGLE, min: 1e-6, max: 89.999 }, flip: BOOLEAN },
    editor: { groups: [{ id: "shape", label: "Chamfer definition", icon: "ph-corners-in", fields: [
      { key: "mode", label: "Type", type: "select", choices: [{value:"equal-distance",label:"Equal distance"},{value:"two-distance",label:"Two distances"},{value:"distance-angle",label:"Distance and angle"}] },
      { key: "distance", label: "Distance 1", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "secondDistance", label: "Distance 2", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "angle", label: "Angle", type: "number", unit: "angle", min: 1e-6, max: 89.999, step: 1 },
      { key: "flip", label: "Flip direction", type: "boolean" },
    ]}]},
  },
  shell: {
    label: "Shell",
    icon: "ph-bowl-food",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["face"], min: 1 } },
    defaults: { thickness: 1, direction: "inside", tolerance: 0.001, join: "arc", removeOpenings: true },
    parameters: { thickness: LENGTH, direction: ENUM("inside", "outside"), tolerance: LENGTH, join: ENUM("arc", "intersection"), removeOpenings: BOOLEAN },
    editor: { groups: [{ id: "wall", label: "Wall definition", icon: "ph-bowl-food", fields: [
      { key: "thickness", label: "Thickness", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "direction", label: "Direction", type: "select", choices: [{value:"inside",label:"Inside"},{value:"outside",label:"Outside"}] },
      { key: "join", label: "Corner join", type: "select", choices: [{value:"arc",label:"Round"},{value:"intersection",label:"Intersection"}] },
      { key: "tolerance", label: "Tolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
      { key: "removeOpenings", label: "Remove selected faces", type: "boolean" },
    ]}]},
  },
  pattern: {
    label: "Pattern",
    icon: "ph-dots-nine",
    selection: { features: { min: 1, max: 1 }, references: { kinds: ["axis", "direction"], max: 1 } },
    defaults: { mode: "linear", count: 2, spacing: 10, countX: 2, spacingX: 10, spacingIncrementX: 0, countY: 2, spacingY: 10, spacingIncrementY: 0, countZ: 2, spacingZ: 10, spacingIncrementZ: 0, skipInstances: "", angle: 360, radialDistance: 0, equalSpacing: true, axis: "y", directionAxis: "x", direction: { x: 1, y: 0, z: 0 }, mergeResult: false },
    parameters: { mode: ENUM("linear", "circular"), count: { type: "number", integer: true, min: 2, max: 100 }, spacing: SIGNED_LENGTH, countX: { type: "number", integer: true, min: 2, max: 100 }, spacingX: SIGNED_LENGTH, spacingIncrementX: SIGNED_LENGTH, countY: { type: "number", integer: true, min: 2, max: 100 }, spacingY: SIGNED_LENGTH, spacingIncrementY: SIGNED_LENGTH, countZ: { type: "number", integer: true, min: 2, max: 100 }, spacingZ: SIGNED_LENGTH, spacingIncrementZ: SIGNED_LENGTH, skipInstances: { type: "string" }, angle: { ...ANGLE, min: 1e-6, max: 360 }, radialDistance: SIGNED_LENGTH, equalSpacing: BOOLEAN, axis: ENUM("x", "y", "z"), axisX: BOOLEAN, axisY: BOOLEAN, axisZ: BOOLEAN, directionAxis: ENUM("x", "y", "z"), mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "layout", label: "Pattern layout", icon: "ph-dots-nine", fields: [
        { key: "mode", label: "Pattern type", type: "select", choices: [{value:"linear",label:"Linear"},{value:"circular",label:"Circular"}] },
        { key: "count", label: "Circular instances", type: "number", min: 2, max: 100, step: 1 },
      ]},
      { id: "axis-x", label: "X axis", icon: "ph-arrow-right", fields: [
        { key: "axisX", label: "Enable X axis", type: "boolean" },
        { key: "countX", label: "X instances", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingX", label: "X spacing", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementX", label: "Increase X spacing by", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "axis-y", label: "Y axis", icon: "ph-arrow-up", fields: [
        { key: "axisY", label: "Enable Y axis", type: "boolean" },
        { key: "countY", label: "Y instances", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingY", label: "Y spacing", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementY", label: "Increase Y spacing by", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "axis-z", label: "Z axis", icon: "ph-arrow-up-right", fields: [
        { key: "axisZ", label: "Enable Z axis", type: "boolean" },
        { key: "countZ", label: "Z instances", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingZ", label: "Z spacing", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementZ", label: "Increase Z spacing by", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "circular", label: "Circular definition", icon: "ph-arrows-clockwise", fields: [
        { key: "angle", label: "Circular extent", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "radialDistance", label: "Distance from axis", type: "number", unit: "length", step: 0.1 },
        { key: "axis", label: "Circular axis", type: "select", choices: [{value:"x",label:"X axis"},{value:"y",label:"Y axis"},{value:"z",label:"Z axis"}] },
        { key: "equalSpacing", label: "Equal spacing", type: "boolean" },
      ]},
      { id: "result", label: "Instances and result · max 128 total", icon: "ph-funnel", fields: [
        { key: "skipInstances", label: "Skip copies (2, 5-7)", type: "text" },
        { key: "mergeResult", label: "Merge instances", type: "boolean" },
      ]},
    ]},
  },
  mirror: {
    label: "Mirror",
    icon: "ph-flip-horizontal",
    selection: { features: { min: 1 }, references: { kinds: ["plane"], min: 1, max: 1 } },
    defaults: { merge: true, keepOriginal: true },
    parameters: { merge: BOOLEAN, keepOriginal: BOOLEAN },
    editor: { groups: [{ id: "mirror", label: "Mirror definition", icon: "ph-flip-horizontal", fields: [
      { key: "$planeReference", label: "Mirror plane", type: "plane-reference" },
      { key: "keepOriginal", label: "Keep original", type: "boolean" },
      { key: "merge", label: "Merge touching solids", type: "boolean" },
    ]}]},
  },
  boolean: {
    label: "Boolean",
    icon: "ph-intersect",
    selection: { features: { min: 2, max: 2 } },
    defaults: { operation: "union", keepTools: false, tolerance: 0.001 },
    parameters: { operation: ENUM("union", "subtract", "intersect"), keepTools: BOOLEAN, tolerance: LENGTH },
    editor: { groups: [{ id: "boolean", label: "Boolean definition", icon: "ph-intersect", fields: [
      { key: "operation", label: "Operation", type: "select", choices: [{value:"union",label:"Union"},{value:"subtract",label:"Subtract"},{value:"intersect",label:"Intersect"}] },
      { key: "keepTools", label: "Keep tool bodies", type: "boolean" },
      { key: "tolerance", label: "Tolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
    ]}]},
  },
  hole: {
    label: "Hole wizard",
    icon: "ph-circle-dashed",
    selection: { sketches: { max: 1 }, topology: { kinds: ["face"], max: 1 }, features: { min: 1, max: 1 } },
    defaults: {
      holeType: "simple", standardSize: "M6", fit: "normal", diameter: 0.7, depth: 10,
      endCondition: "through-all", countersink: false, countersinkDiameter: 1.2,
      counterbore: false, cboreDiameter: 1.1, cboreDepth: 0.66, csinkAngle: 90,
      threadMode: "cosmetic", handedness: "rh", toleranceClass: "6H",
      layout: "sketch", countX: 2, countY: 2, spacingX: 4, spacingY: 4, count: 4, radius: 3,
      direction: "forward",
    },
    parameters: {
      holeType: ENUM("simple", "counterbore", "countersink", "spotface", "tapped", "tap-counterbore", "tap-countersink"),
      standardSize: ENUM("M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"),
      fit: ENUM("close", "normal", "loose"),
      diameter: LENGTH, depth: LENGTH, endCondition: ENUM("blind", "through-all"),
      countersink: BOOLEAN, countersinkDiameter: LENGTH, counterbore: BOOLEAN,
      cboreDiameter: LENGTH, cboreDepth: LENGTH, csinkAngle: { ...ANGLE, min: 60, max: 120 },
      threadMode: ENUM("cosmetic", "modeled"), handedness: ENUM("rh", "lh"),
      layout: ENUM("sketch", "linear", "circular"),
      countX: { type: "number", integer: true, min: 1, max: 32 },
      countY: { type: "number", integer: true, min: 1, max: 32 },
      spacingX: LENGTH, spacingY: LENGTH,
      count: { type: "number", integer: true, min: 1, max: 32 }, radius: LENGTH,
      direction: ENUM("forward", "reverse"),
    },
    editor: { groups: [
      { id: "standard", label: "Standard", icon: "ph-seal-check", fields: [
        { key: "holeType", label: "Hole type", type: "select", choices: [
          {value:"simple",label:"Simple"},{value:"counterbore",label:"Counterbore"},
          {value:"countersink",label:"Countersink"},{value:"spotface",label:"Spotface"},
          {value:"tapped",label:"Tapped"},{value:"tap-counterbore",label:"Tapped counterbore"},
          {value:"tap-countersink",label:"Tapped countersink"},
        ]},
        { key: "standardSize", label: "Size", type: "select", choices: ["M3","M4","M5","M6","M8","M10","M12","M16","M20"].map((value)=>({value,label:value})) },
        { key: "fit", label: "Through fit", type: "select", choices: [{value:"close",label:"Close"},{value:"normal",label:"Normal"},{value:"loose",label:"Loose"}] },
      ]},
      { id: "hole", label: "Bore", icon: "ph-circle-dashed", fields: [
        { key: "diameter", label: "Diameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "endCondition", label: "End condition", type: "select", choices: [{value:"blind",label:"Blind"},{value:"through-all",label:"Through all"}] },
        { key: "depth", label: "Depth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", type: "select", choices: DIRECTIONS },
      ]},
      { id: "head", label: "Head recess", icon: "ph-funnel", fields: [
        { key: "counterbore", label: "Counterbore", type: "boolean" },
        { key: "cboreDiameter", label: "C'bore diameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "cboreDepth", label: "C'bore depth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "countersink", label: "Countersink", type: "boolean" },
        { key: "countersinkDiameter", label: "C'sink diameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "csinkAngle", label: "C'sink angle", type: "number", unit: "angle", min: 60, max: 120, step: 1 },
      ]},
      { id: "thread", label: "Thread", icon: "ph-spiral", fields: [
        { key: "threadMode", label: "Thread display", type: "select", choices: [{value:"cosmetic",label:"Cosmetic"},{value:"modeled",label:"Modeled"}] },
        { key: "handedness", label: "Hand", type: "select", choices: [{value:"rh",label:"Right"},{value:"lh",label:"Left"}] },
      ]},
      { id: "layout", label: "Layout", icon: "ph-dots-nine", fields: [
        { key: "layout", label: "Instance layout", type: "select", choices: [{value:"sketch",label:"Sketch points"},{value:"linear",label:"Linear"},{value:"circular",label:"Circular"}] },
        { key: "countX", label: "Count X", type: "number", min: 1, max: 32, step: 1 },
        { key: "countY", label: "Count Y", type: "number", min: 1, max: 32, step: 1 },
        { key: "spacingX", label: "Spacing X", type: "number", unit: "length", step: 0.1 },
        { key: "spacingY", label: "Spacing Y", type: "number", unit: "length", step: 0.1 },
        { key: "count", label: "Circular count", type: "number", min: 1, max: 32, step: 1 },
        { key: "radius", label: "Bolt circle", type: "number", unit: "length", step: 0.1 },
      ]},
    ]},
  },
  helix: {
    label: "Helix / Spiral",
    icon: "helixfeature",
    selection: { topology: { kinds: ["axis", "edge", "face"], max: 1 } },
    defaults: { radius: 1, pitch: 0.125, turns: 8, height: 1, handedness: "rh", startAngle: 0, taper: 0 },
    parameters: { radius: LENGTH, pitch: LENGTH, turns: { type: "number", min: 0.01, max: 200 }, height: LENGTH, handedness: ENUM("rh", "lh"), startAngle: ANGLE, taper: SIGNED_LENGTH },
    editor: { groups: [{ id: "helix", label: "Helix definition", icon: "ph-spiral", fields: [
      { key: "radius", label: "Radius", type: "number", unit: "length", min: 0, step: 0.05 },
      { key: "pitch", label: "Pitch", type: "number", unit: "length", min: 1e-6, step: 0.01 },
      { key: "turns", label: "Turns", type: "number", min: 0.01, max: 200, step: 0.25 },
      { key: "height", label: "Height", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "handedness", label: "Hand", type: "select", choices: [{value:"rh",label:"Right"},{value:"lh",label:"Left"}] },
      { key: "startAngle", label: "Start angle", type: "number", unit: "angle", step: 1 },
      { key: "taper", label: "End radius delta", type: "number", unit: "length", step: 0.05 },
    ]}]},
  },
  thread: {
    label: "Thread",
    icon: "threadfeature",
    selection: { topology: { kinds: ["face"], max: 1 }, features: { max: 1 } },
    defaults: { side: "external", mode: "cosmetic", diameterMm: 8, pitchMm: 1.25, length: 1.5, handedness: "rh", toleranceClass: "6g", series: "coarse" },
    parameters: {
      side: ENUM("external", "internal"), mode: ENUM("cosmetic", "modeled"),
      diameterMm: { type: "number", min: 1, max: 64 }, pitchMm: { type: "number", min: 0.2, max: 8 },
      length: LENGTH, handedness: ENUM("rh", "lh"), series: ENUM("coarse", "fine"),
    },
    editor: { groups: [
      { id: "spec", label: "ISO metric thread", icon: "ph-seal-check", fields: [
        { key: "side", label: "Side", type: "select", choices: [{value:"external",label:"External"},{value:"internal",label:"Internal"}] },
        { key: "mode", label: "Display", type: "select", choices: [{value:"cosmetic",label:"Cosmetic"},{value:"modeled",label:"Modeled"}] },
        { key: "diameterMm", label: "Major Ø (mm)", type: "number", min: 1, max: 64, step: 0.1 },
        { key: "pitchMm", label: "Pitch (mm)", type: "number", min: 0.2, max: 8, step: 0.05 },
        { key: "length", label: "Length", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "handedness", label: "Hand", type: "select", choices: [{value:"rh",label:"Right"},{value:"lh",label:"Left"}] },
        { key: "series", label: "Series", type: "select", choices: [{value:"coarse",label:"Coarse"},{value:"fine",label:"Fine"}] },
      ]},
    ]},
  },
  knurl: {
    label: "Knurl",
    icon: "knurlfeature",
    selection: { topology: { kinds: ["face"], max: 1 }, features: { max: 1 } },
    defaults: { type: "diamond", pitchMm: 1, diameterMm: 30, length: 1.2, helixAngle: 30, depthMm: 0.3 },
    parameters: {
      type: ENUM("diamond", "straight", "left", "right"),
      pitchMm: { type: "number", min: 0.3, max: 3 },
      diameterMm: { type: "number", min: 1, max: 200 },
      length: LENGTH, helixAngle: { ...ANGLE, min: 0, max: 45 },
      depthMm: { type: "number", min: 0.05, max: 2 },
    },
    editor: { groups: [{ id: "knurl", label: "DIN 82 knurl", icon: "ph-diamond", fields: [
      { key: "type", label: "Form", type: "select", choices: [{value:"diamond",label:"Diamond RGE"},{value:"straight",label:"Straight RAA"},{value:"left",label:"Left RBL"},{value:"right",label:"Right RBR"}] },
      { key: "pitchMm", label: "Pitch (mm)", type: "number", min: 0.3, max: 3, step: 0.1 },
      { key: "diameterMm", label: "Diameter (mm)", type: "number", min: 1, max: 200, step: 0.5 },
      { key: "length", label: "Band length", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "helixAngle", label: "Helix angle", type: "number", unit: "angle", min: 0, max: 45, step: 1 },
      { key: "depthMm", label: "Depth (mm)", type: "number", min: 0.05, max: 2, step: 0.05 },
    ]}]},
  },
  insert: {
    label: "Insert / bushing",
    icon: "insertfeature",
    selection: { topology: { kinds: ["face"], max: 1 }, features: { max: 1 } },
    defaults: { innerMm: 8, outerMm: 12, lengthMm: 10, material: "brass" },
    parameters: {
      innerMm: { type: "number", min: 1, max: 80 },
      outerMm: { type: "number", min: 2, max: 100 },
      lengthMm: { type: "number", min: 1, max: 120 },
      material: ENUM("brass", "steel", "aluminum", "plastic", "titanium"),
    },
    editor: { groups: [{ id: "insert", label: "Insert", icon: "ph-circle", fields: [
      { key: "innerMm", label: "Inner Ø (mm)", type: "number", min: 1, max: 80, step: 0.1 },
      { key: "outerMm", label: "Outer Ø (mm)", type: "number", min: 2, max: 100, step: 0.1 },
      { key: "lengthMm", label: "Length (mm)", type: "number", min: 1, max: 120, step: 0.5 },
      { key: "material", label: "Material", type: "select", choices: [
        {value:"brass",label:"Brass C360"},{value:"steel",label:"Steel 304"},
        {value:"aluminum",label:"Aluminum 6061"},{value:"plastic",label:"ABS"},{value:"titanium",label:"Titanium"},
      ]},
    ]}]},
  },
});

export const PARAMETRIC_FEATURE_TYPES = Object.freeze(Object.keys(FEATURE_CATALOG));

function clone(value) {
  return value == null ? value : typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function featureSpec(type) {
  return FEATURE_CATALOG[type] || null;
}

export function featureDefaults(type) {
  const spec = featureSpec(type);
  if (!spec) throw new Error("Unknown parametric feature type: " + type);
  return clone(spec.defaults);
}

export function featureEditorGroups(type) {
  return clone(featureSpec(type)?.editor?.groups || []);
}

function selectionCount(references, role) {
  if (role === "features") return Array.isArray(references?.features) ? references.features.length : 0;
  return Array.isArray(references?.[role]) ? references[role].length : 0;
}

export function validateFeatureDefinition(feature) {
  const issues = [];
  const spec = featureSpec(feature?.type);
  if (!feature?.id) issues.push({ severity: "error", code: "feature-id", message: "Feature has no stable id" });
  if (!spec) return issues.concat({ severity: "error", code: "feature-type", message: "Unsupported feature type: " + (feature?.type || "missing") });
  const references = feature.references || {};
  Object.entries(spec.selection || {}).forEach(([role, rule]) => {
    const count = selectionCount(references, role);
    if (Number.isFinite(rule.min) && count < rule.min) issues.push({
      severity: "error", code: "missing-feature-input", featureId: feature.id, role,
      message: spec.label + " requires " + rule.min + " " + role + " selection" + (rule.min === 1 ? "" : "s"),
    });
    if (Number.isFinite(rule.max) && count > rule.max) issues.push({
      severity: "error", code: "too-many-feature-inputs", featureId: feature.id, role,
      message: spec.label + " accepts at most " + rule.max + " " + role + " selection" + (rule.max === 1 ? "" : "s"),
    });
    if (rule.kinds && Array.isArray(references[role])) references[role].forEach((reference) => {
      const kind = typeof reference === "string" ? null : reference?.kind || reference?.type;
      if (kind && !rule.kinds.includes(kind)) issues.push({
        severity: "error", code: "wrong-reference-kind", featureId: feature.id, role,
        message: spec.label + " cannot use a " + kind + " as its " + role + " input",
      });
    });
  });
  Object.entries(spec.parameters || {}).forEach(([name, rule]) => {
    const value = feature.params?.[name];
    if (value == null) return;
    if (rule.type === "enum") {
      if (!rule.values.includes(value)) issues.push({ severity: "error", code: "invalid-feature-parameter", featureId: feature.id, parameter: name, message: spec.label + " has an invalid " + name });
      return;
    }
    if (rule.type === "boolean") {
      if (typeof value !== "boolean") issues.push({ severity: "error", code: "invalid-feature-parameter", featureId: feature.id, parameter: name, message: spec.label + " has an invalid " + name });
      return;
    }
    if (typeof value === "string") return; // numeric expressions resolve during rebuild
    if (typeof value !== "number" || !Number.isFinite(value)) issues.push({
      severity: "error", code: "invalid-feature-parameter", featureId: feature.id, parameter: name,
      message: spec.label + " has an invalid " + name,
    });
    else if (Number.isFinite(rule.min) && value < rule.min) issues.push({
      severity: "error", code: "feature-parameter-below-minimum", featureId: feature.id, parameter: name,
      message: spec.label + " requires " + name + " ≥ " + rule.min,
    });
    else if (Number.isFinite(rule.max) && value > rule.max) issues.push({
      severity: "error", code: "feature-parameter-above-maximum", featureId: feature.id, parameter: name,
      message: spec.label + " requires " + name + " ≤ " + rule.max,
    });
    else if (rule.integer && !Number.isInteger(value)) issues.push({
      severity: "error", code: "feature-parameter-not-integer", featureId: feature.id, parameter: name,
      message: spec.label + " requires " + name + " to be an integer",
    });
  });
  if (["extrude", "extrudeCut"].includes(feature.type)) {
    const allowed = ["blind", "through-all", "up-to-face", "up-to-next", "mid-plane"];
    if (!allowed.includes(feature.params?.endCondition)) issues.push({
      severity: "error", code: "invalid-end-condition", featureId: feature.id,
      message: spec.label + " has an invalid end condition",
    });
  }
  if (feature.type === "boolean" && !["union", "subtract", "intersect"].includes(feature.params?.operation)) issues.push({
    severity: "error", code: "invalid-boolean-operation", featureId: feature.id, message: "Boolean operation must be union, subtract or intersect",
  });
  return issues;
}
