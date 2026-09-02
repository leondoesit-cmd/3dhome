// Canonical feature vocabulary for parametric part documents.
//
// The UI, history layer and kernel adapter all consume this catalogue.  A
// feature is therefore a declarative record with one meaning, rather than a UI
// button whose click handler happens to mutate a mesh in a particular way.
//
// Every human-readable `label` carries a `labelKey` beside it.  The English
// string stays here so the module keeps working standalone — the kernel
// adapter, the validator and the tests all import it with no UI attached —
// while the editor resolves the key against its own bilingual table at render
// time (see setFeatureLabelResolver below).  A key with no table entry simply
// falls back to the English text, so a missed key degrades to the old
// behaviour instead of leaking a raw identifier into the form.

const LENGTH = { type: "number", unit: "document-length", min: 1e-6 };
const SIGNED_LENGTH = { type: "number", unit: "document-length" };
const ANGLE = { type: "number", unit: "deg" };
const BOOLEAN = { type: "boolean" };
const ENUM = (...values) => ({ type: "enum", values });

const OPERATIONS = [
  { value: "add", label: "Add material", labelKey: "fcOptAdd" },
  { value: "new-body", label: "New body", labelKey: "fcOptNewBody" },
];
const EXTENTS = [
  { value: "blind", label: "Blind", labelKey: "fcOptBlind" },
  { value: "through-all", label: "Through all", labelKey: "fcOptThroughAll" },
  { value: "up-to-next", label: "Up to next", labelKey: "fcOptUpToNext" },
  { value: "up-to-face", label: "Up to face", labelKey: "fcOptUpToFace" },
  { value: "mid-plane", label: "Mid-plane", labelKey: "fcOptMidPlane" },
];
const DIRECTIONS = [
  { value: "forward", label: "Along normal", labelKey: "fcOptAlongNormal" },
  { value: "reverse", label: "Reverse normal", labelKey: "fcOptReverseNormal" },
];
const COSMETIC_MODES = [
  { value: "cosmetic", label: "Cosmetic", labelKey: "fcOptCosmetic" },
  { value: "modeled", label: "Modeled", labelKey: "fcOptModeled" },
];
const HANDEDNESS = [
  { value: "rh", label: "Right", labelKey: "fcOptRight" },
  { value: "lh", label: "Left", labelKey: "fcOptLeft" },
];

const resultGroup = (operation = true) => ({
  id: "result", label: "Result", labelKey: "fcGrpResult", icon: "ph-union",
  fields: [
    ...(operation ? [{ key: "operation", label: "Operation", labelKey: "fcFldOperation", type: "select", choices: OPERATIONS }] : []),
    { key: "mergeResult", label: "Merge result", labelKey: "fcFldMergeResult", type: "boolean" },
  ],
});

export const FEATURE_CATALOG = Object.freeze({
  extrude: {
    label: "Extrude / Boss",
    labelKey: "fcFeatExtrude",
    icon: "ph-cube",
    selection: { sketches: { min: 1, max: 1 }, topology: { kinds: ["face"], max: 1 } },
    defaults: { operation: "add", endCondition: "blind", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Extent", labelKey: "fcGrpExtent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", labelKey: "fcFldSymmetricMid", type: "boolean" },
        { key: "offset", label: "Start offset", labelKey: "fcFldStartOffset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "draft", label: "Draft", labelKey: "fcGrpDraft", icon: "ph-angle", fields: [
        { key: "draftAngle", label: "Draft angle", labelKey: "fcFldDraftAngle", type: "number", unit: "angle", min: -89, max: 89, step: 0.1 },
        { key: "draftOutward", label: "Draft outward", labelKey: "fcFldDraftOutward", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  extrudeCut: {
    label: "Extrude Cut",
    labelKey: "fcFeatExtrudeCut",
    icon: "ph-scissors",
    selection: { sketches: { min: 1, max: 1 }, features: { min: 1, max: 1 } },
    defaults: { operation: "subtract", endCondition: "through-all", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, keepTool: false },
    parameters: { operation: ENUM("subtract"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, keepTool: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Cut extent", labelKey: "fcGrpCutExtent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", labelKey: "fcFldSymmetricMid", type: "boolean" },
        { key: "offset", label: "Start offset", labelKey: "fcFldStartOffset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "draft", label: "Draft", labelKey: "fcGrpDraft", icon: "ph-angle", fields: [
        { key: "draftAngle", label: "Draft angle", labelKey: "fcFldDraftAngle", type: "number", unit: "angle", min: -89, max: 89, step: 0.1 },
        { key: "draftOutward", label: "Draft outward", labelKey: "fcFldDraftOutward", type: "boolean" },
        { key: "keepTool", label: "Keep cutting tool", labelKey: "fcFldKeepTool", type: "boolean" },
      ]},
    ]},
  },
  revolve: {
    label: "Revolve",
    labelKey: "fcFeatRevolve",
    icon: "ph-arrow-counter-clockwise",
    selection: { sketches: { min: 1, max: 1 }, references: { kinds: ["axis"], min: 1, max: 1 } },
    defaults: { operation: "add", angle: 360, direction: "forward", symmetric: false, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), angle: { ...ANGLE, min: 1e-6, max: 360 }, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "axis", label: "Axis and extent", labelKey: "fcGrpAxisExtent", icon: "ph-axis-arrow", fields: [
        { key: "$axisReference", label: "Axis", labelKey: "fcFldAxis", type: "axis-reference" },
        { key: "angle", label: "Angle", labelKey: "fcFldAngle", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric", labelKey: "fcFldSymmetric", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  sweep: {
    label: "Sweep",
    labelKey: "fcFeatSweep",
    icon: "ph-path",
    selection: { sketches: { min: 2, max: 2 } },
    defaults: { operation: "add", orientation: "follow-path", twistAngle: 0, scale: 1, solid: true, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), orientation: ENUM("follow-path", "minimum-twist", "fixed"), twistAngle: ANGLE, scale: { type: "number", min: 1e-6 }, solid: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "path", label: "Path behavior", labelKey: "fcGrpPathBehavior", icon: "ph-path", fields: [
        { key: "orientation", label: "Profile orientation", labelKey: "fcFldProfileOrientation", type: "select", choices: [
          {value:"follow-path",label:"Follow path",labelKey:"fcOptFollowPath"},
          {value:"minimum-twist",label:"Minimum twist",labelKey:"fcOptMinimumTwist"},
          {value:"fixed",label:"Keep profile fixed",labelKey:"fcOptKeepProfileFixed"},
        ] },
        { key: "twistAngle", label: "Twist", labelKey: "fcFldTwist", type: "number", unit: "angle", step: 1 },
        { key: "scale", label: "End scale", labelKey: "fcFldEndScale", type: "number", min: 1e-6, step: 0.05 },
        { key: "solid", label: "Create solid", labelKey: "fcFldCreateSolid", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  loft: {
    label: "Loft",
    labelKey: "fcFeatLoft",
    icon: "ph-stack",
    selection: { sketches: { min: 2 } },
    defaults: { operation: "add", continuity: "position", solid: true, ruled: false, closed: false, matchProfiles: true, tolerance: 0.001, mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), continuity: ENUM("position", "tangent", "curvature"), solid: BOOLEAN, ruled: BOOLEAN, closed: BOOLEAN, matchProfiles: BOOLEAN, tolerance: LENGTH, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "sections", label: "Sections", labelKey: "fcGrpSections", icon: "ph-stack", fields: [
        { key: "continuity", label: "Continuity", labelKey: "fcFldContinuity", type: "select", choices: [
          {value:"position",label:"Position (G0)",labelKey:"fcOptPositionG0"},
          {value:"tangent",label:"Tangent (G1)",labelKey:"fcOptTangentG1"},
          {value:"curvature",label:"Curvature (G2)",labelKey:"fcOptCurvatureG2"},
        ] },
        { key: "matchProfiles", label: "Match profile vertices", labelKey: "fcFldMatchProfiles", type: "boolean" },
        { key: "ruled", label: "Ruled sections", labelKey: "fcFldRuledSections", type: "boolean" },
        { key: "closed", label: "Closed loft", labelKey: "fcFldClosedLoft", type: "boolean" },
        { key: "solid", label: "Create solid", labelKey: "fcFldCreateSolid", type: "boolean" },
        { key: "tolerance", label: "Tolerance", labelKey: "fcFldTolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
      ]},
      resultGroup(true),
    ]},
  },
  fillet: {
    label: "Fillet",
    labelKey: "fcFeatFillet",
    icon: "ph-corners-out",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["edge", "face"], min: 1 } },
    defaults: { radius: 1, propagation: "tangent", section: "rational", continuity: "tangent" },
    parameters: { radius: LENGTH, propagation: ENUM("tangent", "feature"), section: ENUM("rational", "quasi-angular", "polynomial"), continuity: ENUM("tangent", "curvature") },
    editor: { groups: [{ id: "shape", label: "Fillet definition", labelKey: "fcGrpFilletDefinition", icon: "ph-corners-out", fields: [
      { key: "radius", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "propagation", label: "Edge scope", labelKey: "fcFldEdgeScope", type: "select", choices: [
        {value:"tangent",label:"Selected tangent chain",labelKey:"fcOptTangentChain"},
        {value:"feature",label:"Whole feature",labelKey:"fcOptWholeFeature"},
      ] },
      { key: "section", label: "Section representation", labelKey: "fcFldSectionRepresentation", type: "select", choices: [
        {value:"rational",label:"Rational",labelKey:"fcOptRational"},
        {value:"quasi-angular",label:"Quasi-angular",labelKey:"fcOptQuasiAngular"},
        {value:"polynomial",label:"Polynomial",labelKey:"fcOptPolynomial"},
      ] },
      { key: "continuity", label: "Surface continuity", labelKey: "fcFldSurfaceContinuity", type: "select", choices: [
        {value:"tangent",label:"Tangent (C1)",labelKey:"fcOptTangentC1"},
        {value:"curvature",label:"Curvature (C2)",labelKey:"fcOptCurvatureC2"},
      ] },
    ]}]},
  },
  chamfer: {
    label: "Chamfer",
    labelKey: "fcFeatChamfer",
    icon: "ph-corners-in",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["edge", "face"], min: 1 } },
    defaults: { mode: "equal-distance", distance: 1, secondDistance: 1, angle: 45, flip: false },
    parameters: { mode: ENUM("equal-distance", "two-distance", "distance-angle"), distance: LENGTH, secondDistance: LENGTH, angle: { ...ANGLE, min: 1e-6, max: 89.999 }, flip: BOOLEAN },
    editor: { groups: [{ id: "shape", label: "Chamfer definition", labelKey: "fcGrpChamferDefinition", icon: "ph-corners-in", fields: [
      { key: "mode", label: "Type", labelKey: "fcFldType", type: "select", choices: [
        {value:"equal-distance",label:"Equal distance",labelKey:"fcOptEqualDistance"},
        {value:"two-distance",label:"Two distances",labelKey:"fcOptTwoDistances"},
        {value:"distance-angle",label:"Distance and angle",labelKey:"fcOptDistanceAngle"},
      ] },
      { key: "distance", label: "Distance 1", labelKey: "fcFldDistance1", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "secondDistance", label: "Distance 2", labelKey: "fcFldDistance2", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "angle", label: "Angle", labelKey: "fcFldAngle", type: "number", unit: "angle", min: 1e-6, max: 89.999, step: 1 },
      { key: "flip", label: "Flip direction", labelKey: "fcFldFlipDirection", type: "boolean" },
    ]}]},
  },
  shell: {
    label: "Shell",
    labelKey: "fcFeatShell",
    icon: "ph-bowl-food",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["face"], min: 1 } },
    defaults: { thickness: 1, direction: "inside", tolerance: 0.001, join: "arc", removeOpenings: true },
    parameters: { thickness: LENGTH, direction: ENUM("inside", "outside"), tolerance: LENGTH, join: ENUM("arc", "intersection"), removeOpenings: BOOLEAN },
    editor: { groups: [{ id: "wall", label: "Wall definition", labelKey: "fcGrpWallDefinition", icon: "ph-bowl-food", fields: [
      { key: "thickness", label: "Thickness", labelKey: "fcFldThickness", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: [
        {value:"inside",label:"Inside",labelKey:"fcOptInside"},
        {value:"outside",label:"Outside",labelKey:"fcOptOutside"},
      ] },
      { key: "join", label: "Corner join", labelKey: "fcFldCornerJoin", type: "select", choices: [
        {value:"arc",label:"Round",labelKey:"fcOptRound"},
        {value:"intersection",label:"Intersection",labelKey:"fcOptIntersectionJoin"},
      ] },
      { key: "tolerance", label: "Tolerance", labelKey: "fcFldTolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
      { key: "removeOpenings", label: "Remove selected faces", labelKey: "fcFldRemoveFaces", type: "boolean" },
    ]}]},
  },
  pattern: {
    label: "Pattern",
    labelKey: "fcFeatPattern",
    icon: "ph-dots-nine",
    selection: { features: { min: 1, max: 1 }, references: { kinds: ["axis", "direction"], max: 1 } },
    defaults: { mode: "linear", count: 2, spacing: 10, countX: 2, spacingX: 10, spacingIncrementX: 0, countY: 2, spacingY: 10, spacingIncrementY: 0, countZ: 2, spacingZ: 10, spacingIncrementZ: 0, skipInstances: "", angle: 360, radialDistance: 0, equalSpacing: true, axis: "y", directionAxis: "x", direction: { x: 1, y: 0, z: 0 }, mergeResult: false },
    parameters: { mode: ENUM("linear", "circular"), count: { type: "number", integer: true, min: 2, max: 100 }, spacing: SIGNED_LENGTH, countX: { type: "number", integer: true, min: 2, max: 100 }, spacingX: SIGNED_LENGTH, spacingIncrementX: SIGNED_LENGTH, countY: { type: "number", integer: true, min: 2, max: 100 }, spacingY: SIGNED_LENGTH, spacingIncrementY: SIGNED_LENGTH, countZ: { type: "number", integer: true, min: 2, max: 100 }, spacingZ: SIGNED_LENGTH, spacingIncrementZ: SIGNED_LENGTH, skipInstances: { type: "string" }, angle: { ...ANGLE, min: 1e-6, max: 360 }, radialDistance: SIGNED_LENGTH, equalSpacing: BOOLEAN, axis: ENUM("x", "y", "z"), axisX: BOOLEAN, axisY: BOOLEAN, axisZ: BOOLEAN, directionAxis: ENUM("x", "y", "z"), mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "layout", label: "Pattern layout", labelKey: "fcGrpPatternLayout", icon: "ph-dots-nine", fields: [
        { key: "mode", label: "Pattern type", labelKey: "fcFldPatternType", type: "select", choices: [
          {value:"linear",label:"Linear",labelKey:"fcOptLinear"},
          {value:"circular",label:"Circular",labelKey:"fcOptCircular"},
        ] },
        { key: "count", label: "Circular instances", labelKey: "fcFldCircularInstances", type: "number", min: 2, max: 100, step: 1 },
      ]},
      { id: "axis-x", label: "X axis", labelKey: "fcGrpAxisX", icon: "ph-arrow-right", fields: [
        { key: "axisX", label: "Enable X axis", labelKey: "fcFldEnableAxisX", type: "boolean" },
        { key: "countX", label: "X instances", labelKey: "fcFldInstancesX", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingX", label: "X spacing", labelKey: "fcFldSpacingAxisX", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementX", label: "Increase X spacing by", labelKey: "fcFldSpacingIncrementX", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "axis-y", label: "Y axis", labelKey: "fcGrpAxisY", icon: "ph-arrow-up", fields: [
        { key: "axisY", label: "Enable Y axis", labelKey: "fcFldEnableAxisY", type: "boolean" },
        { key: "countY", label: "Y instances", labelKey: "fcFldInstancesY", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingY", label: "Y spacing", labelKey: "fcFldSpacingAxisY", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementY", label: "Increase Y spacing by", labelKey: "fcFldSpacingIncrementY", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "axis-z", label: "Z axis", labelKey: "fcGrpAxisZ", icon: "ph-arrow-up-right", fields: [
        { key: "axisZ", label: "Enable Z axis", labelKey: "fcFldEnableAxisZ", type: "boolean" },
        { key: "countZ", label: "Z instances", labelKey: "fcFldInstancesZ", type: "number", min: 2, max: 100, step: 1 },
        { key: "spacingZ", label: "Z spacing", labelKey: "fcFldSpacingAxisZ", type: "number", unit: "length", step: 0.1 },
        { key: "spacingIncrementZ", label: "Increase Z spacing by", labelKey: "fcFldSpacingIncrementZ", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "circular", label: "Circular definition", labelKey: "fcGrpCircularDefinition", icon: "ph-arrows-clockwise", fields: [
        { key: "angle", label: "Circular extent", labelKey: "fcFldCircularExtent", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "radialDistance", label: "Distance from axis", labelKey: "fcFldDistanceFromAxis", type: "number", unit: "length", step: 0.1 },
        { key: "axis", label: "Circular axis", labelKey: "fcFldCircularAxis", type: "select", choices: [
          {value:"x",label:"X axis",labelKey:"fcOptAxisX"},
          {value:"y",label:"Y axis",labelKey:"fcOptAxisY"},
          {value:"z",label:"Z axis",labelKey:"fcOptAxisZ"},
        ] },
        { key: "equalSpacing", label: "Equal spacing", labelKey: "fcFldEqualSpacing", type: "boolean" },
      ]},
      { id: "result", label: "Instances and result · max 128 total", labelKey: "fcGrpInstancesResult", icon: "ph-funnel", fields: [
        { key: "skipInstances", label: "Skip copies (2, 5-7)", labelKey: "fcFldSkipCopies", type: "text" },
        { key: "mergeResult", label: "Merge instances", labelKey: "fcFldMergeInstances", type: "boolean" },
      ]},
    ]},
  },
  mirror: {
    label: "Mirror",
    labelKey: "fcFeatMirror",
    icon: "ph-flip-horizontal",
    selection: { features: { min: 1 }, references: { kinds: ["plane"], min: 1, max: 1 } },
    defaults: { merge: true, keepOriginal: true },
    parameters: { merge: BOOLEAN, keepOriginal: BOOLEAN },
    editor: { groups: [{ id: "mirror", label: "Mirror definition", labelKey: "fcGrpMirrorDefinition", icon: "ph-flip-horizontal", fields: [
      { key: "$planeReference", label: "Mirror plane", labelKey: "fcFldMirrorPlane", type: "plane-reference" },
      { key: "keepOriginal", label: "Keep original", labelKey: "fcFldKeepOriginal", type: "boolean" },
      { key: "merge", label: "Merge touching solids", labelKey: "fcFldMergeTouching", type: "boolean" },
    ]}]},
  },
  boolean: {
    label: "Boolean",
    labelKey: "fcFeatBoolean",
    icon: "ph-intersect",
    selection: { features: { min: 2, max: 2 } },
    defaults: { operation: "union", keepTools: false, tolerance: 0.001 },
    parameters: { operation: ENUM("union", "subtract", "intersect"), keepTools: BOOLEAN, tolerance: LENGTH },
    editor: { groups: [{ id: "boolean", label: "Boolean definition", labelKey: "fcGrpBooleanDefinition", icon: "ph-intersect", fields: [
      { key: "operation", label: "Operation", labelKey: "fcFldOperation", type: "select", choices: [
        {value:"union",label:"Union",labelKey:"fcOptUnion"},
        {value:"subtract",label:"Subtract",labelKey:"fcOptSubtract"},
        {value:"intersect",label:"Intersect",labelKey:"fcOptIntersect"},
      ] },
      { key: "keepTools", label: "Keep tool bodies", labelKey: "fcFldKeepTools", type: "boolean" },
      { key: "tolerance", label: "Tolerance", labelKey: "fcFldTolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
    ]}]},
  },
  hole: {
    label: "Hole wizard",
    labelKey: "fcFeatHole",
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
      { id: "standard", label: "Standard", labelKey: "fcGrpStandard", icon: "ph-seal-check", fields: [
        { key: "holeType", label: "Hole type", labelKey: "fcFldHoleType", type: "select", choices: [
          {value:"simple",label:"Simple",labelKey:"fcOptSimple"},
          {value:"counterbore",label:"Counterbore",labelKey:"fcOptCounterbore"},
          {value:"countersink",label:"Countersink",labelKey:"fcOptCountersink"},
          {value:"spotface",label:"Spotface",labelKey:"fcOptSpotface"},
          {value:"tapped",label:"Tapped",labelKey:"fcOptTapped"},
          {value:"tap-counterbore",label:"Tapped counterbore",labelKey:"fcOptTappedCounterbore"},
          {value:"tap-countersink",label:"Tapped countersink",labelKey:"fcOptTappedCountersink"},
        ]},
        // Metric designations: the same in every language, so no labelKey.
        { key: "standardSize", label: "Size", labelKey: "fcFldSize", type: "select", choices: ["M3","M4","M5","M6","M8","M10","M12","M16","M20"].map((value)=>({value,label:value})) },
        { key: "fit", label: "Through fit", labelKey: "fcFldThroughFit", type: "select", choices: [
          {value:"close",label:"Close",labelKey:"fcOptFitClose"},
          {value:"normal",label:"Normal",labelKey:"fcOptFitNormal"},
          {value:"loose",label:"Loose",labelKey:"fcOptFitLoose"},
        ] },
      ]},
      { id: "hole", label: "Bore", labelKey: "fcGrpBore", icon: "ph-circle-dashed", fields: [
        { key: "diameter", label: "Diameter", labelKey: "fcFldDiameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "endCondition", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: [
          {value:"blind",label:"Blind",labelKey:"fcOptBlind"},
          {value:"through-all",label:"Through all",labelKey:"fcOptThroughAll"},
        ] },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
      ]},
      { id: "head", label: "Head recess", labelKey: "fcGrpHeadRecess", icon: "ph-funnel", fields: [
        { key: "counterbore", label: "Counterbore", labelKey: "fcFldCounterbore", type: "boolean" },
        { key: "cboreDiameter", label: "C'bore diameter", labelKey: "fcFldCboreDiameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "cboreDepth", label: "C'bore depth", labelKey: "fcFldCboreDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "countersink", label: "Countersink", labelKey: "fcFldCountersink", type: "boolean" },
        { key: "countersinkDiameter", label: "C'sink diameter", labelKey: "fcFldCsinkDiameter", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "csinkAngle", label: "C'sink angle", labelKey: "fcFldCsinkAngle", type: "number", unit: "angle", min: 60, max: 120, step: 1 },
      ]},
      { id: "thread", label: "Thread", labelKey: "fcGrpThread", icon: "ph-spiral", fields: [
        { key: "threadMode", label: "Thread display", labelKey: "fcFldThreadDisplay", type: "select", choices: COSMETIC_MODES },
        { key: "handedness", label: "Hand", labelKey: "fcFldHand", type: "select", choices: HANDEDNESS },
      ]},
      { id: "layout", label: "Layout", labelKey: "fcGrpLayout", icon: "ph-dots-nine", fields: [
        { key: "layout", label: "Instance layout", labelKey: "fcFldInstanceLayout", type: "select", choices: [
          {value:"sketch",label:"Sketch points",labelKey:"fcOptSketchPoints"},
          {value:"linear",label:"Linear",labelKey:"fcOptLinear"},
          {value:"circular",label:"Circular",labelKey:"fcOptCircular"},
        ] },
        { key: "countX", label: "Count X", labelKey: "fcFldCountX", type: "number", min: 1, max: 32, step: 1 },
        { key: "countY", label: "Count Y", labelKey: "fcFldCountY", type: "number", min: 1, max: 32, step: 1 },
        { key: "spacingX", label: "Spacing X", labelKey: "fcFldSpacingX", type: "number", unit: "length", step: 0.1 },
        { key: "spacingY", label: "Spacing Y", labelKey: "fcFldSpacingY", type: "number", unit: "length", step: 0.1 },
        { key: "count", label: "Circular count", labelKey: "fcFldCircularCount", type: "number", min: 1, max: 32, step: 1 },
        { key: "radius", label: "Bolt circle", labelKey: "fcFldBoltCircle", type: "number", unit: "length", step: 0.1 },
      ]},
    ]},
  },
  helix: {
    label: "Helix / Spiral",
    labelKey: "fcFeatHelix",
    icon: "helixfeature",
    selection: { topology: { kinds: ["axis", "edge", "face"], max: 1 } },
    defaults: { radius: 1, pitch: 0.125, turns: 8, height: 1, handedness: "rh", startAngle: 0, taper: 0 },
    parameters: { radius: LENGTH, pitch: LENGTH, turns: { type: "number", min: 0.01, max: 200 }, height: LENGTH, handedness: ENUM("rh", "lh"), startAngle: ANGLE, taper: SIGNED_LENGTH },
    editor: { groups: [{ id: "helix", label: "Helix definition", labelKey: "fcGrpHelixDefinition", icon: "ph-spiral", fields: [
      { key: "radius", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 0, step: 0.05 },
      { key: "pitch", label: "Pitch", labelKey: "fcFldPitch", type: "number", unit: "length", min: 1e-6, step: 0.01 },
      { key: "turns", label: "Turns", labelKey: "fcFldTurns", type: "number", min: 0.01, max: 200, step: 0.25 },
      { key: "height", label: "Height", labelKey: "fcFldHeight", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "handedness", label: "Hand", labelKey: "fcFldHand", type: "select", choices: HANDEDNESS },
      { key: "startAngle", label: "Start angle", labelKey: "fcFldStartAngle", type: "number", unit: "angle", step: 1 },
      { key: "taper", label: "End radius delta", labelKey: "fcFldEndRadiusDelta", type: "number", unit: "length", step: 0.05 },
    ]}]},
  },
  thread: {
    label: "Thread",
    labelKey: "fcFeatThread",
    icon: "threadfeature",
    selection: { topology: { kinds: ["face"], max: 1 }, features: { max: 1 } },
    defaults: { side: "external", mode: "cosmetic", diameterMm: 8, pitchMm: 1.25, length: 1.5, handedness: "rh", toleranceClass: "6g", series: "coarse" },
    parameters: {
      side: ENUM("external", "internal"), mode: ENUM("cosmetic", "modeled"),
      diameterMm: { type: "number", min: 1, max: 64 }, pitchMm: { type: "number", min: 0.2, max: 8 },
      length: LENGTH, handedness: ENUM("rh", "lh"), series: ENUM("coarse", "fine"),
    },
    editor: { groups: [
      { id: "spec", label: "ISO metric thread", labelKey: "fcGrpIsoThread", icon: "ph-seal-check", fields: [
        { key: "side", label: "Side", labelKey: "fcFldSide", type: "select", choices: [
          {value:"external",label:"External",labelKey:"fcOptExternal"},
          {value:"internal",label:"Internal",labelKey:"fcOptInternal"},
        ] },
        { key: "mode", label: "Display", labelKey: "fcFldDisplay", type: "select", choices: COSMETIC_MODES },
        { key: "diameterMm", label: "Major Ø (mm)", labelKey: "fcFldMajorDiameterMm", type: "number", min: 1, max: 64, step: 0.1 },
        { key: "pitchMm", label: "Pitch (mm)", labelKey: "fcFldPitchMm", type: "number", min: 0.2, max: 8, step: 0.05 },
        { key: "length", label: "Length", labelKey: "fcFldLength", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "handedness", label: "Hand", labelKey: "fcFldHand", type: "select", choices: HANDEDNESS },
        { key: "series", label: "Series", labelKey: "fcFldSeries", type: "select", choices: [
          {value:"coarse",label:"Coarse",labelKey:"fcOptCoarse"},
          {value:"fine",label:"Fine",labelKey:"fcOptFine"},
        ] },
      ]},
    ]},
  },
  knurl: {
    label: "Knurl",
    labelKey: "fcFeatKnurl",
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
    editor: { groups: [{ id: "knurl", label: "DIN 82 knurl", labelKey: "fcGrpDin82Knurl", icon: "ph-diamond", fields: [
      { key: "type", label: "Form", labelKey: "fcFldForm", type: "select", choices: [
        {value:"diamond",label:"Diamond RGE",labelKey:"fcOptKnurlDiamond"},
        {value:"straight",label:"Straight RAA",labelKey:"fcOptKnurlStraight"},
        {value:"left",label:"Left RBL",labelKey:"fcOptKnurlLeft"},
        {value:"right",label:"Right RBR",labelKey:"fcOptKnurlRight"},
      ] },
      { key: "pitchMm", label: "Pitch (mm)", labelKey: "fcFldPitchMm", type: "number", min: 0.3, max: 3, step: 0.1 },
      { key: "diameterMm", label: "Diameter (mm)", labelKey: "fcFldDiameterMm", type: "number", min: 1, max: 200, step: 0.5 },
      { key: "length", label: "Band length", labelKey: "fcFldBandLength", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "helixAngle", label: "Helix angle", labelKey: "fcFldHelixAngle", type: "number", unit: "angle", min: 0, max: 45, step: 1 },
      { key: "depthMm", label: "Depth (mm)", labelKey: "fcFldDepthMm", type: "number", min: 0.05, max: 2, step: 0.05 },
    ]}]},
  },
  insert: {
    label: "Insert / bushing",
    labelKey: "fcFeatInsert",
    icon: "insertfeature",
    selection: { topology: { kinds: ["face"], max: 1 }, features: { max: 1 } },
    defaults: { innerMm: 8, outerMm: 12, lengthMm: 10, material: "brass" },
    parameters: {
      innerMm: { type: "number", min: 1, max: 80 },
      outerMm: { type: "number", min: 2, max: 100 },
      lengthMm: { type: "number", min: 1, max: 120 },
      material: ENUM("brass", "steel", "aluminum", "plastic", "titanium"),
    },
    editor: { groups: [{ id: "insert", label: "Insert", labelKey: "fcGrpInsert", icon: "ph-circle", fields: [
      { key: "innerMm", label: "Inner Ø (mm)", labelKey: "fcFldInnerDiameterMm", type: "number", min: 1, max: 80, step: 0.1 },
      { key: "outerMm", label: "Outer Ø (mm)", labelKey: "fcFldOuterDiameterMm", type: "number", min: 2, max: 100, step: 0.1 },
      { key: "lengthMm", label: "Length (mm)", labelKey: "fcFldLengthMm", type: "number", min: 1, max: 120, step: 0.5 },
      { key: "material", label: "Material", labelKey: "fcFldMaterial", type: "select", choices: [
        {value:"brass",label:"Brass C360",labelKey:"fcOptBrassC360"},
        {value:"steel",label:"Steel 304",labelKey:"fcOptSteel304"},
        {value:"aluminum",label:"Aluminum 6061",labelKey:"fcOptAluminum6061"},
        // "ABS" is a polymer designation, not a word to translate.
        {value:"plastic",label:"ABS"},
        {value:"titanium",label:"Titanium",labelKey:"fcOptTitanium"},
      ]},
    ]}]},
  },
  toolbox: {
    label: "Toolbox Part",
    labelKey: "fcFeatToolbox",
    icon: "toolboxfastener",
    selection: {},
    defaults: { kind: "shcs", sizeKey: "M8", lengthMm: 30, material: "steel-8.8-zinc", finish: "Zinc Plated", threadMode: "cosmetic", lod: 2 },
    parameters: {
      kind: { type: "string" }, sizeKey: { type: "string" }, lengthMm: { type: "number", min: 0 },
      material: { type: "string" }, finish: { type: "string" }, threadMode: ENUM("cosmetic", "modeled"),
      lod: { type: "number", integer: true, min: 0, max: 2 },
    },
    editor: { groups: [{ id: "toolbox", label: "Standard part", labelKey: "fcGrpToolbox", icon: "ph-toolbox", fields: [
      { key: "kind", label: "Family", labelKey: "fcFldToolboxFamily", type: "text" },
      { key: "sizeKey", label: "Size", labelKey: "fcFldToolboxSize", type: "text" },
      { key: "lengthMm", label: "Length (mm)", labelKey: "fcFldLengthMm", type: "number", min: 0, step: 1 },
      { key: "material", label: "Material", labelKey: "fcFldMaterial", type: "text" },
      { key: "finish", label: "Finish", labelKey: "fcFldToolboxFinish", type: "text" },
      { key: "threadMode", label: "Thread geometry", labelKey: "fcFldThreadGeometry", type: "select", choices: COSMETIC_MODES },
      { key: "lod", label: "Detail level", labelKey: "fcFldToolboxLod", type: "number", min: 0, max: 2, step: 1 },
    ]}]},
  },
});

export const PARAMETRIC_FEATURE_TYPES = Object.freeze(Object.keys(FEATURE_CATALOG));

/* Bilingual labels without a circular import.
   This module is loaded by the kernel adapter, the history layer, the
   validator and by tests that never touch the DOM, so it must not import the
   editor's t() — that would make js/modeler.js and js/core/feature_catalog.js
   mutually dependent and break the static module graph.  Instead the editor
   registers a resolver once it has its own translation table; with no resolver
   registered every label stays exactly as written above. */
let labelResolver = null;

export function setFeatureLabelResolver(resolve) {
  labelResolver = typeof resolve === "function" ? resolve : null;
}

/** Localized text for any catalogue entry carrying { label, labelKey }. */
export function featureLabel(entry) {
  const fallback = entry && entry.label != null ? String(entry.label) : "";
  if (!labelResolver || !entry || !entry.labelKey) return fallback;
  const translated = labelResolver(entry.labelKey, fallback);
  return translated == null || translated === "" ? fallback : String(translated);
}

function localizeGroups(groups) {
  if (!labelResolver) return groups;
  groups.forEach((group) => {
    group.label = featureLabel(group);
    (group.fields || []).forEach((field) => {
      field.label = featureLabel(field);
      (field.choices || []).forEach((choice) => { choice.label = featureLabel(choice); });
    });
  });
  return groups;
}

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
  return localizeGroups(clone(featureSpec(type)?.editor?.groups || []));
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
