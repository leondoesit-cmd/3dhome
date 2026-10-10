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

import { TOOLBOX_FAMILIES } from "../toolbox/catalog.js";
import { TOOLBOX_FINISHES, TOOLBOX_MATERIALS } from "../toolbox/schema.js";
import { isUpToFace } from "./extrude_extent.js";
import {normalizeHelixRegions} from '../cad_helix.js';
import {shellFaceThicknesses} from './planar_shell_overrides.js';

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
  { value: "up-to-face", label: "Up to surface", labelKey: "fcOptUpToFace" },
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
const TOOLBOX_FAMILY_CHOICES = TOOLBOX_FAMILIES.map((family) => ({ value:family.kind, label:family.label }));
const TOOLBOX_MATERIAL_CHOICES = [{ value:"", label:"Automatic (family default)" }].concat(Object.values(TOOLBOX_MATERIALS).map((material) => ({ value:material.id, label:material.name })));
const TOOLBOX_FINISH_CHOICES = [{ value:"", label:"Automatic (family default)" }].concat(Object.entries(TOOLBOX_FINISHES).map(([value,label]) => ({ value, label })));

const resultGroup = (operation = true, choices = OPERATIONS) => ({
  id: "result", label: "Result", labelKey: "fcGrpResult", icon: "ph-union",
  fields: [
    ...(operation ? [{ key: "operation", label: "Operation", labelKey: "fcFldOperation", type: "select", choices: choices }] : []),
    { key: "mergeResult", label: "Merge result", labelKey: "fcFldMergeResult", type: "boolean" },
  ],
});

/* Primitives are placed, not profiled.
   A box, cylinder, sphere or cone has no sketch and no topology selection: it
   is fully described by numbers, which is exactly why legacy documents built
   from them had nowhere to go — the catalogue is what the migration coverage
   gate and the feature editor read, and neither could see a primitive.

   The parameter names are not invented here. They are the ones the rest of the
   codebase already writes for these feature types (js/modeler.js's
   rebuildFeatureTreeFromDocument, js/core/cabinet_advanced.js) and the ones
   js/core/topology.js already names faces and edges from, so one spec now
   describes the same feature everywhere: box = origin + size, cylinder and cone
   = base point + radii + height, sphere = centre + radius.

   Bilingual note: `welcomeShapeBox` / `welcomeShapeCyl` / `welcomeShapeSph`
   already carry exactly these words in both languages, so they are reused
   rather than duplicated. The remaining labels below have no entry in the
   modeler's TXT table yet and therefore fall back to English, the same
   deliberate fallback the "ABS" and metric-size choices use. */
export const FEATURE_CATALOG = Object.freeze({
  box: {
    label: "Box",
    labelKey: "welcomeShapeBox",
    icon: "directbox",
    selection: {},
    defaults: { x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 },
    parameters: { x: SIGNED_LENGTH, y: SIGNED_LENGTH, z: SIGNED_LENGTH, w: LENGTH, h: LENGTH, d: LENGTH },
    editor: { groups: [{ id: "box", label: "Corner and size", icon: "ph-cube", fields: [
      { key: "x", label: "X", type: "number", unit: "length", step: 0.1 },
      { key: "y", label: "Y", type: "number", unit: "length", step: 0.1 },
      { key: "z", label: "Z", type: "number", unit: "length", step: 0.1 },
      { key: "w", label: "Width", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "h", label: "Height", labelKey: "fcFldHeight", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "d", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
    ]}]},
  },
  cylinder: {
    label: "Cylinder",
    labelKey: "welcomeShapeCyl",
    icon: "directcyl",
    selection: {},
    /* No axis parameter. Every other producer of a canonical cylinder — the
       cabinet adapter, import recognition, the Toolbox lowering, the modeler's
       own exact build — writes exactly {x, y, z, r, h} and means "up the Y
       axis", and both consumers agree with them: core/topology.js defaults an
       absent axis to Y, and cad_kernel.js's makeBrepPrimitive defaults it to
       the vector {0,1,0}. Offering the string "x" here would have been read as
       a vector by the exact kernel and produced a null direction. */
    defaults: { x: 0, y: 0, z: 0, r: 5, h: 10 },
    parameters: { x: SIGNED_LENGTH, y: SIGNED_LENGTH, z: SIGNED_LENGTH, r: LENGTH, h: LENGTH },
    editor: { groups: [{ id: "cylinder", label: "Base and size", icon: "ph-cylinder", fields: [
      { key: "x", label: "X", type: "number", unit: "length", step: 0.1 },
      { key: "y", label: "Base Y", type: "number", unit: "length", step: 0.1 },
      { key: "z", label: "Z", type: "number", unit: "length", step: 0.1 },
      { key: "r", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "h", label: "Height", labelKey: "fcFldHeight", type: "number", unit: "length", min: 1e-6, step: 0.1 },
    ]}]},
  },
  cone: {
    /* A legacy cylinder with a second radius is a frustum, not a cylinder, and
       naming it one would make the geometry comparison disagree with the
       picture. It converts to this instead.
       `r1`/`r2`, not `r`/`r2`: cad_kernel.js's makeBrepCone reads r1 first and
       otherwise falls back to a hole-wizard diameter, so a base radius written
       as `r` would have silently built a needle. */
    label: "Cone",
    icon: "directcyl",
    selection: {},
    defaults: { x: 0, y: 0, z: 0, r1: 5, r2: 0, h: 10 },
    parameters: { x: SIGNED_LENGTH, y: SIGNED_LENGTH, z: SIGNED_LENGTH, r1: LENGTH, r2: { type: "number", unit: "document-length", min: 0 }, h: LENGTH },
    editor: { groups: [{ id: "cone", label: "Base and size", icon: "ph-cylinder", fields: [
      { key: "x", label: "X", type: "number", unit: "length", step: 0.1 },
      { key: "y", label: "Base Y", type: "number", unit: "length", step: 0.1 },
      { key: "z", label: "Z", type: "number", unit: "length", step: 0.1 },
      { key: "r1", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "r2", label: "Top radius", type: "number", unit: "length", min: 0, step: 0.1 },
      { key: "h", label: "Height", labelKey: "fcFldHeight", type: "number", unit: "length", min: 1e-6, step: 0.1 },
    ]}]},
  },
  sphere: {
    label: "Sphere",
    labelKey: "welcomeShapeSph",
    icon: "directsph",
    selection: {},
    defaults: { x: 0, y: 0, z: 0, r: 5 },
    parameters: { x: SIGNED_LENGTH, y: SIGNED_LENGTH, z: SIGNED_LENGTH, r: LENGTH },
    editor: { groups: [{ id: "sphere", label: "Centre and radius", icon: "ph-sphere", fields: [
      { key: "x", label: "X", type: "number", unit: "length", step: 0.1 },
      { key: "y", label: "Y", type: "number", unit: "length", step: 0.1 },
      { key: "z", label: "Z", type: "number", unit: "length", step: 0.1 },
      { key: "r", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
    ]}]},
  },
  extrude: {
    label: "Extrude / Boss",
    labelKey: "fcFeatExtrude",
    icon: "ph-cube",
    selection: { sketches: { min: 1, max: 1 }, topology: { kinds: ["face"], max: 1 } },
    defaults: { operation: "add", endCondition: "blind", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, thinFeature: false, thickness: .1, thinMode: "mid-plane", mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "up-to-surface", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, thinFeature: BOOLEAN, thickness: LENGTH, thinMode: ENUM("mid-plane", "forward", "reverse"), mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Extent", labelKey: "fcGrpExtent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", labelKey: "fcFldSymmetricMid", type: "boolean" },
        { key: "offset", label: "Start offset", labelKey: "fcFldStartOffset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "thin", label: "Thin feature", fields: [
        { key: "thinFeature", label: "Thin feature", type: "boolean" },
        { key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 1e-6, step: .01 },
        { key: "thinMode", label: "Thickness direction", type: "select", choices: [{value:"mid-plane",label:"Mid-plane"},{value:"forward",label:"One side"},{value:"reverse",label:"Other side"}] },
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
    defaults: { operation: "subtract", endCondition: "through-all", depth: 10, offset: 0, direction: "forward", symmetric: false, draftAngle: 0, draftOutward: false, thinFeature: false, thickness: .1, thinMode: "mid-plane", keepTool: false },
    parameters: { operation: ENUM("subtract"), endCondition: ENUM("blind", "through-all", "up-to-next", "up-to-face", "up-to-surface", "mid-plane"), depth: LENGTH, offset: SIGNED_LENGTH, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, draftAngle: { ...ANGLE, min: -89, max: 89 }, draftOutward: BOOLEAN, thinFeature: BOOLEAN, thickness: LENGTH, thinMode: ENUM("mid-plane", "forward", "reverse"), keepTool: BOOLEAN },
    editor: { groups: [
      { id: "extent", label: "Cut extent", labelKey: "fcGrpCutExtent", icon: "ph-arrows-out-line-vertical", fields: [
        { key: "endCondition", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: EXTENTS },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric / mid-plane", labelKey: "fcFldSymmetricMid", type: "boolean" },
        { key: "offset", label: "Start offset", labelKey: "fcFldStartOffset", type: "number", unit: "length", step: 0.1 },
      ]},
      { id: "thin", label: "Thin feature", fields: [
        { key: "thinFeature", label: "Thin feature", type: "boolean" },
        { key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 1e-6, step: .01 },
        { key: "thinMode", label: "Thickness direction", type: "select", choices: [{value:"mid-plane",label:"Mid-plane"},{value:"forward",label:"One side"},{value:"reverse",label:"Other side"}] },
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
    defaults: { operation: "add", angle: 360, direction: "forward", symmetric: false, thinFeature: false, thickness: .1, thinMode: "mid-plane", mergeResult: true },
    parameters: { operation: ENUM("add", "new-body"), angle: { ...ANGLE, min: 1e-6, max: 360 }, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, mergeResult: BOOLEAN, useSketchPlane: BOOLEAN, thinFeature: BOOLEAN, thickness: LENGTH, thinMode: ENUM("mid-plane", "forward", "reverse") },
    editor: { groups: [
      { id: "axis", label: "Axis and extent", labelKey: "fcGrpAxisExtent", icon: "ph-axis-arrow", fields: [
        { key: "$axisReference", label: "Axis", labelKey: "fcFldAxis", type: "axis-reference" },
        { key: "useSketchPlane", label: "Use sketch plane coordinates", type: "boolean" },
        { key: "thinFeature", label: "Thin feature", type: "boolean" },
        { key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 0.0001, step: .01 },
        { key: "thinMode", label: "Thickness direction", type: "select", choices: [{value:"mid-plane",label:"Mid-plane"},{value:"forward",label:"Outward"},{value:"reverse",label:"Inward"}] },
        { key: "angle", label: "Angle", labelKey: "fcFldAngle", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric", labelKey: "fcFldSymmetric", type: "boolean" },
      ]},
      resultGroup(true),
    ]},
  },
  revolveCut: {
    /* The subtractive twin of revolve. It is a separate catalogue entry rather
       than an `operation` on revolve because the two ask for different things:
       a cut needs a body to remove material from, which the selection rules
       below state, and a revolve does not. The profile, the axis and the extent
       are revolve's own — js/core/kernel_feature_adapter.js lowers this to the
       same revolve step followed by a subtract, exactly as extrudeCut lowers to
       extrude + subtract, so there is one revolve implementation, not two. */
    label: "Revolve Cut",
    labelKey: "fcFeatRevolveCut",
    icon: "ph-arrow-counter-clockwise",
    selection: { sketches: { min: 1, max: 1 }, features: { min: 1, max: 1 }, references: { kinds: ["axis"], max: 1 } },
    defaults: { operation: "subtract", angle: 360, direction: "forward", symmetric: false, thinFeature: false, thickness: .1, thinMode: "mid-plane", keepTool: false },
    parameters: { operation: ENUM("subtract"), angle: { ...ANGLE, min: 1e-6, max: 360 }, direction: ENUM("forward", "reverse"), symmetric: BOOLEAN, keepTool: BOOLEAN, useSketchPlane: BOOLEAN, thinFeature: BOOLEAN, thickness: LENGTH, thinMode: ENUM("mid-plane", "forward", "reverse") },
    editor: { groups: [
      { id: "axis", label: "Axis and extent", labelKey: "fcGrpAxisExtent", icon: "ph-axis-arrow", fields: [
        { key: "$axisReference", label: "Axis", labelKey: "fcFldAxis", type: "axis-reference" },
        { key: "useSketchPlane", label: "Use sketch plane coordinates", type: "boolean" },
        { key: "thinFeature", label: "Thin feature", type: "boolean" },
        { key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 0.0001, step: .01 },
        { key: "thinMode", label: "Thickness direction", type: "select", choices: [{value:"mid-plane",label:"Mid-plane"},{value:"forward",label:"Outward"},{value:"reverse",label:"Inward"}] },
        { key: "angle", label: "Angle", labelKey: "fcFldAngle", type: "number", unit: "angle", min: 1e-6, max: 360, step: 1 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
        { key: "symmetric", label: "Symmetric", labelKey: "fcFldSymmetric", type: "boolean" },
        { key: "keepTool", label: "Keep cutting tool", labelKey: "fcFldKeepTool", type: "boolean" },
      ]},
    ]},
  },
  sweep: {
    label: "Sweep",
    labelKey: "fcFeatSweep",
    icon: "ph-path",
    selection: { sketches: { min: 2, max: 2 } },
    defaults: { profileMode:"sketch", profileDiameter:.3175, operation: "add", orientation: "follow-path", twistAngle: 0, scale: 1, solid: true, mergeResult: true },
    parameters: { profileMode:ENUM("sketch","circular"), profileDiameter:LENGTH, operation: ENUM("add", "new-body"), orientation: ENUM("follow-path", "minimum-twist", "fixed"), twistAngle: ANGLE, scale: { type: "number", min: 1e-6 }, solid: BOOLEAN, mergeResult: BOOLEAN },
    editor: { groups: [
      {id:"profile",label:"Sweep profile",fields:[{key:"profileMode",label:"Profile type",type:"select",choices:[{value:"sketch",label:"Sketch profile"},{value:"circular",label:"Circular profile"}]},{key:"profileDiameter",label:"Profile diameter",type:"number",unit:"length",min:1e-6,step:.01}]},
      { id: "path", label: "Path behavior", labelKey: "fcGrpPathBehavior", icon: "ph-path", fields: [
        // which curve the profile follows: a helix in the document, or the
        // second selected sketch (G31 — the form used to bind silently)
        { key: "helixId", label: "Path", labelKey: "fcFldSweepPath", type: "helix-reference" },
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
  sweepCut: {
    // Sweep's subtractive twin, on the same terms as revolveCut above: the
    // profile and path resolution is sweep's, and the adapter appends the
    // subtract.
    label: "Sweep Cut",
    labelKey: "fcFeatSweepCut",
    icon: "ph-path",
    selection: { sketches: { min: 2, max: 2 }, features: { min: 1, max: 1 } },
    defaults: { operation: "subtract", orientation: "follow-path", twistAngle: 0, scale: 1, keepTool: false },
    parameters: { operation: ENUM("subtract"), orientation: ENUM("follow-path", "minimum-twist", "fixed"), twistAngle: ANGLE, scale: { type: "number", min: 1e-6 }, keepTool: BOOLEAN },
    editor: { groups: [
      { id: "path", label: "Path behavior", labelKey: "fcGrpPathBehavior", icon: "ph-path", fields: [
        { key: "helixId", label: "Path", labelKey: "fcFldSweepPath", type: "helix-reference" },
        { key: "orientation", label: "Profile orientation", labelKey: "fcFldProfileOrientation", type: "select", choices: [
          {value:"follow-path",label:"Follow path",labelKey:"fcOptFollowPath"},
          {value:"minimum-twist",label:"Minimum twist",labelKey:"fcOptMinimumTwist"},
          {value:"fixed",label:"Keep profile fixed",labelKey:"fcOptKeepProfileFixed"},
        ] },
        { key: "twistAngle", label: "Twist", labelKey: "fcFldTwist", type: "number", unit: "angle", step: 1 },
        { key: "scale", label: "End scale", labelKey: "fcFldEndScale", type: "number", min: 1e-6, step: 0.05 },
        { key: "keepTool", label: "Keep cutting tool", labelKey: "fcFldKeepTool", type: "boolean" },
      ]},
    ]},
  },
  loft: {
    label: "Loft",
    labelKey: "fcFeatLoft",
    icon: "ph-stack",
    selection: { sketches: { min: 2 } },
    /* No `closed` here. BRepOffsetAPI_ThruSections runs an open chain of
       sections; there is no way to ask it to bend the last one back onto the
       first, so offering the switch would have been a control the kernel
       ignores. `continuity` stays because SetContinuity() receives it. */
    defaults: { operation: "add", continuity: "position", solid: true, ruled: false, matchProfiles: true, tolerance: 0.001, mergeResult: true },
    parameters: { operation: ENUM("add", "subtract", "new-body"), continuity: ENUM("position", "tangent", "curvature"), solid: BOOLEAN, ruled: BOOLEAN, matchProfiles: BOOLEAN, tolerance: LENGTH, mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "sections", label: "Sections", labelKey: "fcGrpSections", icon: "ph-stack", fields: [
        { key: "continuity", label: "Continuity", labelKey: "fcFldContinuity", type: "select", choices: [
          {value:"position",label:"Position (G0)",labelKey:"fcOptPositionG0"},
          {value:"tangent",label:"Tangent (G1)",labelKey:"fcOptTangentG1"},
          {value:"curvature",label:"Curvature (G2)",labelKey:"fcOptCurvatureG2"},
        ] },
        { key: "matchProfiles", label: "Match profile vertices", labelKey: "fcFldMatchProfiles", type: "boolean" },
        { key: "ruled", label: "Ruled sections", labelKey: "fcFldRuledSections", type: "boolean" },
        { key: "solid", label: "Create solid", labelKey: "fcFldCreateSolid", type: "boolean" },
        { key: "tolerance", label: "Tolerance", labelKey: "fcFldTolerance", type: "number", unit: "length", min: 1e-6, step: 0.001 },
      ]},
      resultGroup(true, OPERATIONS.concat([{value:"subtract",label:"Cut material",labelKey:"fcOptSubtract"}])),
    ]},
  },
  fillet: {
    label: "Fillet",
    labelKey: "fcFeatFillet",
    icon: "ph-corners-out",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["edge", "face"], min: 1 } },
    /* One feature, not two. A variable-radius fillet differs from a constant
       one only in how much radius each end of an edge gets: the selection, the
       propagation, the section representation and the continuity all mean
       exactly the same thing, and BRepFilletAPI_MakeFillet takes both through
       the same maker (Add_2 vs Add_3). A second catalogue entry would have
       duplicated four controls and split the edge collector in half.
       `radius` is the radius at each edge's first vertex; `endRadius` the one
       at its last, used only while `variableRadius` is on. `edgeRadii` holds
       the per-edge overrides the edge list writes — it is a list, not a scalar,
       so it is deliberately not in `parameters`: the validator there speaks
       numbers, enums and booleans, and normalising the list belongs to the one
       place that reads it (filletEdgeRadius in js/cad_kernel.js). */
    defaults: { radius: 1, fullRound: false, multipleRadius: false, variableRadius: false, endRadius: 1, edgeRadii: [], propagation: "tangent", section: "rational", continuity: "tangent" },
    parameters: { radius: LENGTH, fullRound: BOOLEAN, multipleRadius: BOOLEAN, variableRadius: BOOLEAN, endRadius: LENGTH, propagation: ENUM("tangent", "feature"), section: ENUM("rational", "quasi-angular", "polynomial"), continuity: ENUM("tangent", "curvature") },
    editor: { groups: [{ id: "shape", label: "Fillet definition", labelKey: "fcGrpFilletDefinition", icon: "ph-corners-out", fields: [
      { key: "fullRound", label: "Full round — side, center, side", type: "boolean" },
      { key: "multipleRadius", label: "Multiple radius", type: "boolean" },
      { key: "radius", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "variableRadius", label: "Variable radius", labelKey: "fcFldVariableRadius", type: "boolean" },
      { key: "endRadius", label: "End radius", labelKey: "fcFldEndRadius", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "propagation", advanced: true, label: "Edge scope", labelKey: "fcFldEdgeScope", type: "select", choices: [
        {value:"tangent",label:"Selected tangent chain",labelKey:"fcOptTangentChain"},
        {value:"feature",label:"Whole feature",labelKey:"fcOptWholeFeature"},
      ] },
      { key: "section", advanced: true, label: "Section representation", labelKey: "fcFldSectionRepresentation", type: "select", choices: [
        {value:"rational",label:"Rational",labelKey:"fcOptRational"},
        {value:"quasi-angular",label:"Quasi-angular",labelKey:"fcOptQuasiAngular"},
        {value:"polynomial",label:"Polynomial",labelKey:"fcOptPolynomial"},
      ] },
      { key: "continuity", advanced: true, label: "Surface continuity", labelKey: "fcFldSurfaceContinuity", type: "select", choices: [
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
    defaults: { thickness: 1, direction: "inside", tolerance: 0.001, join: "arc", removeOpenings: true, faceThicknesses: [] },
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
  dome: {
    label: "Dome", icon: "ph-sphere",
    selection: {features:{min:1,max:1},topology:{kinds:["face"],min:1,max:1}},
    defaults:{height:0.254},parameters:{height:LENGTH},
    editor:{groups:[{id:"dome",label:"Dome",icon:"ph-sphere",fields:[{key:"height",label:"Height",type:"number",unit:"length",min:1e-6,step:0.01}]}]},
  },
  draft: {
    /* Draft has lived only as a sub-parameter of extrude and cut, which can
       only taper the walls one feature happens to create. A moulded part is
       drafted after the fact, on faces that came from several features and
       often from a boolean, so it is its own history node here.
       The neutral plane is square to the pull direction and sits at one end of
       the body along it — that is where a parting line falls — which is why it
       is stated as an end plus an offset rather than as a free plane: every
       field below is something js/cad_kernel.js's draftBrep actually reads. */
    label: "Draft",
    labelKey: "fcFeatDraft",
    icon: "ph-angle",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["face"], min: 1 } },
    defaults: { angle: 3, pullAxis: "y", pullDirection: "forward", neutral: "end", neutralOffset: 0 },
    parameters: {
      angle: { ...ANGLE, min: -89, max: 89 },
      pullAxis: ENUM("x", "y", "z"), pullDirection: ENUM("forward", "reverse"),
      neutral: ENUM("start", "end"), neutralOffset: SIGNED_LENGTH,
    },
    editor: { groups: [{ id: "draft", label: "Draft definition", labelKey: "fcGrpDraftDefinition", icon: "ph-angle", fields: [
      { key: "angle", label: "Draft angle", labelKey: "fcFldDraftAngle", type: "number", unit: "angle", min: -89, max: 89, step: 0.5 },
      { key: "pullAxis", label: "Pull direction", labelKey: "fcFldPullDirection", type: "select", choices: [
        {value:"x",label:"X axis",labelKey:"fcOptAxisX"},
        {value:"y",label:"Y axis",labelKey:"fcOptAxisY"},
        {value:"z",label:"Z axis",labelKey:"fcOptAxisZ"},
      ] },
      { key: "pullDirection", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
      { key: "neutral", label: "Neutral plane", labelKey: "fcFldNeutralPlane", type: "select", choices: [
        {value:"start",label:"Start of pull axis",labelKey:"fcOptNeutralStart"},
        {value:"end",label:"End of pull axis",labelKey:"fcOptNeutralEnd"},
      ] },
      { key: "neutralOffset", label: "Neutral offset", labelKey: "fcFldNeutralOffset", type: "number", unit: "length", step: 0.1 },
    ]}]},
  },
  splitBody: {
    /* Cut a body in two and keep what was asked for. The plane is stated as an
       axis and a coordinate on it rather than as a free plane, because that is
       what the splitter needs and what a part is actually parted along.
       "Both" is the compound BRepAlgoAPI_Splitter itself returns; the model
       editor turns that into two independently selectable bodies, which is what
       "split into separate bodies" means to someone holding the part. */
    label: "Split Body",
    labelKey: "fcFeatSplitBody",
    icon: "ph-square-split-horizontal",
    selection: { features: { min: 1, max: 1 } },
    defaults: { axis: "y", offset: 0, keep: "both" },
    parameters: { axis: ENUM("x", "y", "z"), offset: SIGNED_LENGTH, keep: ENUM("both", "positive", "negative") },
    editor: { groups: [{ id: "split", label: "Split definition", labelKey: "fcGrpSplitDefinition", icon: "ph-square-split-horizontal", fields: [
      { key: "axis", label: "Plane normal", labelKey: "fcFldPlaneNormal", type: "select", choices: [
        {value:"x",label:"X axis",labelKey:"fcOptAxisX"},
        {value:"y",label:"Y axis",labelKey:"fcOptAxisY"},
        {value:"z",label:"Z axis",labelKey:"fcOptAxisZ"},
      ] },
      { key: "offset", label: "Plane position", labelKey: "fcFldPlanePosition", type: "number", unit: "length", step: 0.5 },
      { key: "keep", label: "Keep", labelKey: "fcFldKeep", type: "select", choices: [
        {value:"both",label:"Both halves",labelKey:"fcOptKeepBoth"},
        {value:"positive",label:"Above the plane",labelKey:"fcOptKeepPositive"},
        {value:"negative",label:"Below the plane",labelKey:"fcOptKeepNegative"},
      ] },
    ]}]},
  },
  moveBody: {
    /* Move or copy a whole body. The rotation turns about the body's own centre
       of mass — a body a metre from the origin would otherwise be flung across
       the document by five degrees — and the turn happens before the offset, so
       the two numbers read in the order they are applied. A copy is a second
       body beside the first, never a fuse. */
    label: "Move / Copy Body",
    labelKey: "fcFeatMoveBody",
    icon: "ph-arrows-out-cardinal",
    selection: { features: { min: 1, max: 1 } },
    defaults: { dx: 0, dy: 0, dz: 0, axis: "y", angle: 0, copy: false },
    parameters: { dx: SIGNED_LENGTH, dy: SIGNED_LENGTH, dz: SIGNED_LENGTH, axis: ENUM("x", "y", "z"), angle: ANGLE, copy: BOOLEAN },
    editor: { groups: [
      { id: "offset", label: "Offset", labelKey: "fcGrpOffset", icon: "ph-arrows-out-cardinal", fields: [
        { key: "dx", label: "X offset", labelKey: "fcFldOffsetX", type: "number", unit: "length", step: 0.5 },
        { key: "dy", label: "Y offset", labelKey: "fcFldOffsetY", type: "number", unit: "length", step: 0.5 },
        { key: "dz", label: "Z offset", labelKey: "fcFldOffsetZ", type: "number", unit: "length", step: 0.5 },
      ]},
      { id: "turn", label: "Rotation", labelKey: "fcGrpRotation", icon: "ph-arrows-clockwise", fields: [
        { key: "axis", label: "Rotation axis", labelKey: "fcFldRotationAxis", type: "select", choices: [
          {value:"x",label:"X axis",labelKey:"fcOptAxisX"},
          {value:"y",label:"Y axis",labelKey:"fcOptAxisY"},
          {value:"z",label:"Z axis",labelKey:"fcOptAxisZ"},
        ] },
        { key: "angle", label: "Angle", labelKey: "fcFldAngle", type: "number", unit: "angle", step: 1 },
        { key: "copy", label: "Leave a copy behind", labelKey: "fcFldLeaveCopy", type: "boolean" },
      ]},
    ]},
  },
  rib: {
    /* A drawn line braced into a web. The sketch is open — a rib is traced, not
       outlined — and the thickness is typed, so every field here is a number
       js/cad_kernel.js's ribBrep reads: how thick, which side of the line it
       goes, how far it runs, which way, and the draft on its walls. The draft
       angle carries draft's own sign convention (positive narrows the web away
       from the sketch plane) because it IS that taper, applied to the two walls
       the rib is about to create. */
    label: "Rib",
    labelKey: "fcFeatRib",
    icon: "ph-triangle",
    selection: { sketches: { min: 1, max: 1 }, features: { min: 1, max: 1 } },
    defaults: { thickness: 1, side: "both", extent: "up-to-body", depth: 10, direction: "forward", draftAngle: 0, draftOutward: false, orientation: "perpendicular", growthDirection: "negative-v", profileExtension: "finite" },
    parameters: {
      thickness: LENGTH, side: ENUM("both", "left", "right"),
      orientation: ENUM("perpendicular", "parallel"), growthDirection: ENUM("negative-v", "positive-v", "negative-u", "positive-u", "normal-left", "normal-right"),
      profileExtension: ENUM("finite", "natural"),
      extent: ENUM("up-to-body", "blind"), depth: LENGTH,
      direction: ENUM("forward", "reverse"), draftAngle: { ...ANGLE, min: 0, max: 60 }, draftOutward: BOOLEAN,
    },
    editor: { groups: [
      { id: "web", label: "Web definition", labelKey: "fcGrpWebDefinition", icon: "ph-triangle", fields: [
        { key: "orientation", label: "Rib orientation", labelKey: "fcFldRibOrientation", type: "select", choices: [
          {value:"perpendicular",label:"Perpendicular to sketch",labelKey:"fcOptRibPerpendicular"},
          {value:"parallel",label:"Parallel to sketch",labelKey:"fcOptRibParallel"},
        ] },
        { key: "growthDirection", label: "In-plane growth", labelKey: "fcFldRibGrowth", type: "select", choices: [
          {value:"negative-v",label:"Down (−V)",labelKey:"fcOptRibDown"},
          {value:"positive-v",label:"Up (+V)",labelKey:"fcOptRibUp"},
          {value:"negative-u",label:"Left (−U)",labelKey:"fcOptRibLeft"},
          {value:"positive-u",label:"Right (+U)",labelKey:"fcOptRibRight"},
          {value:"normal-left",label:"Normal to straight guide — left"},
          {value:"normal-right",label:"Normal to straight guide — right"},
        ] },
        { key: "profileExtension", label: "Guide ends", type: "select", choices: [
          {value:"finite",label:"Finite sketch ends"},
          {value:"natural",label:"Natural — straight ends to body"},
        ] },
        { key: "thickness", label: "Thickness", labelKey: "fcFldThickness", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key: "side", label: "Thickness side", labelKey: "fcFldThicknessSide", type: "select", choices: [
          {value:"both",label:"Both sides",labelKey:"fcOptBothSides"},
          {value:"left",label:"Left of the line",labelKey:"fcOptLeftOfLine"},
          {value:"right",label:"Right of the line",labelKey:"fcOptRightOfLine"},
        ] },
        { key: "extent", label: "End condition", labelKey: "fcFldEndCondition", type: "select", choices: [
          {value:"up-to-body",label:"Up to the body",labelKey:"fcOptUpToBody"},
          {value:"blind",label:"Blind",labelKey:"fcOptBlind"},
        ] },
        { key: "depth", label: "Depth", labelKey: "fcFldDepth", type: "number", unit: "length", min: 1e-6, step: 0.5 },
        { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: DIRECTIONS },
      ]},
      { id: "draft", label: "Draft", labelKey: "fcGrpDraft", icon: "ph-angle", fields: [
        { key: "draftAngle", label: "Draft angle", labelKey: "fcFldDraftAngle", type: "number", unit: "angle", min: 0, max: 60, step: 0.5 },
        { key: "draftOutward", label: "Draft outward", labelKey: "fcFldDraftOutward", type: "boolean" },
      ]},
    ]},
  },
  thicken: {
    /* Turn a surface into a solid. The selected faces are offset into a slab of
       their own thickness; on a surface body (a sweep or a loft with "Create
       solid" off) that slab is the whole answer, and on a solid it is fused
       back in as a boss so the body it grew from is not silently replaced.
       Two fields, both read by js/cad_kernel.js's thickenBrep: the offset and
       its sign. */
    label: "Thicken",
    labelKey: "fcFeatThicken",
    icon: "ph-stack-simple",
    selection: { features: { min: 1, max: 1 }, topology: { kinds: ["face"], min: 1 } },
    defaults: { thickness: 1, direction: "outside" },
    parameters: { thickness: LENGTH, direction: ENUM("outside", "inside") },
    editor: { groups: [{ id: "thicken", label: "Thicken definition", labelKey: "fcGrpThickenDefinition", icon: "ph-stack-simple", fields: [
      { key: "thickness", label: "Thickness", labelKey: "fcFldThickness", type: "number", unit: "length", min: 1e-6, step: 0.1 },
      { key: "direction", label: "Direction", labelKey: "fcFldDirection", type: "select", choices: [
        {value:"outside",label:"Outside",labelKey:"fcOptOutside"},
        {value:"inside",label:"Inside",labelKey:"fcOptInside"},
      ] },
    ]}]},
  },
  pattern: {
    label: "Pattern",
    labelKey: "fcFeatPattern",
    icon: "ph-dots-nine",
    /* `sketches` is optional and capped at one: only the curve layout uses it,
       and a linear or circular pattern must keep validating with none. */
    selection: { features: { min: 1, max: 1 }, sketches: { max: 1 }, references: { kinds: ["axis", "direction"], max: 1 } },
    defaults: { scope: "body", seedFeatureId: "", mode: "linear", count: 2, spacing: 10, countX: 2, spacingX: 10, spacingIncrementX: 0, countY: 2, spacingY: 10, spacingIncrementY: 0, countZ: 2, spacingZ: 10, spacingIncrementZ: 0, skipInstances: "", angle: 360, radialDistance: 0, equalSpacing: true, axis: "y", directionAxis: "x", direction: { x: 1, y: 0, z: 0 }, curveCount: 4, curveSpacingMode: "fit", curveSpacing: 0, curveAlign: "tangent", mergeResult: false },
    parameters: { scope: ENUM("body", "feature"), seedFeatureId: {type:"string"}, mode: ENUM("linear", "circular", "curve"), count: { type: "number", integer: true, min: 2, max: 100 }, spacing: SIGNED_LENGTH, countX: { type: "number", integer: true, min: 2, max: 100 }, spacingX: SIGNED_LENGTH, spacingIncrementX: SIGNED_LENGTH, countY: { type: "number", integer: true, min: 2, max: 100 }, spacingY: SIGNED_LENGTH, spacingIncrementY: SIGNED_LENGTH, countZ: { type: "number", integer: true, min: 2, max: 100 }, spacingZ: SIGNED_LENGTH, spacingIncrementZ: SIGNED_LENGTH, skipInstances: { type: "string" }, angle: { ...ANGLE, min: 1e-6, max: 360 }, radialDistance: SIGNED_LENGTH, equalSpacing: BOOLEAN, axis: ENUM("x", "y", "z"), axisX: BOOLEAN, axisY: BOOLEAN, axisZ: BOOLEAN, directionAxis: ENUM("x", "y", "z"), curveCount: { type: "number", integer: true, min: 2, max: 128 }, curveSpacingMode: ENUM("fit", "spacing"), curveSpacing: { type: "number", min: 0 }, curveAlign: ENUM("tangent", "none"), mergeResult: BOOLEAN },
    editor: { groups: [
      { id: "layout", label: "Pattern layout", labelKey: "fcGrpPatternLayout", icon: "ph-dots-nine", fields: [
        { key:"scope", label:"Pattern scope", labelKey:"fcFldPatternScope", type:"select", choices:[{value:"body",label:"Entire body",labelKey:"fcOptEntireBody"},{value:"feature",label:"Pattern seed only",labelKey:"fcOptPatternSeedOnly"}] },
        { key: "mode", label: "Pattern type", labelKey: "fcFldPatternType", type: "select", choices: [
          {value:"linear",label:"Linear",labelKey:"fcOptLinear"},
          {value:"circular",label:"Circular",labelKey:"fcOptCircular"},
          {value:"curve",label:"Along a curve",labelKey:"fcOptCurve"},
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
      { id: "curve", label: "Curve definition", labelKey: "fcGrpCurveDefinition", icon: "ph-bezier-curve", fields: [
        { key: "curveCount", label: "Curve instances", labelKey: "fcFldCurveInstances", type: "number", min: 2, max: 128, step: 1 },
        { key: "curveSpacingMode", label: "Along the curve", labelKey: "fcFldCurveSpacingMode", type: "select", choices: [
          {value:"fit",label:"Fit to the whole curve",labelKey:"fcOptCurveFit"},
          {value:"spacing",label:"Fixed arc spacing",labelKey:"fcOptCurveSpacing"},
        ] },
        { key: "curveSpacing", label: "Arc spacing", labelKey: "fcFldCurveArcSpacing", type: "number", unit: "length", min: 0, step: 0.1 },
        { key: "curveAlign", label: "Orientation", labelKey: "fcFldCurveAlign", type: "select", choices: [
          {value:"tangent",label:"Follow the curve",labelKey:"fcOptCurveFollow"},
          {value:"none",label:"Keep the seed's orientation",labelKey:"fcOptCurveKeep"},
        ] },
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
    defaults: { merge: true, keepOriginal: true, scope: "body", seedFeatureId: "", seedFeatureIds: [] },
    parameters: { merge: BOOLEAN, keepOriginal: BOOLEAN, scope: ENUM("body", "feature"), seedFeatureId: {type:"string"}, seedFeatureIds: {type:"array"} },
    editor: { groups: [{ id: "mirror", label: "Mirror definition", labelKey: "fcGrpMirrorDefinition", icon: "ph-flip-horizontal", fields: [
      { key: "$planeReference", label: "Mirror plane", labelKey: "fcFldMirrorPlane", type: "plane-reference" },
      { key: "scope", label: "Mirror scope", type: "select", choices: [{value:"body",label:"Entire body"},{value:"feature",label:"Selected features"}] },
      { key: "seedFeatureIds", label: "Features to mirror", type: "feature-seeds", dynamicChoices:"feature-seed" },
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
      holeType: "simple", standard: "ISO 273", fastenerType: "generic", standardSize: "M6", fit: "normal", diameter: 0.66, depth: 10,
      endCondition: "through-all", drillPointAngle:118, countersink: false, countersinkDiameter: 1.2,
      counterbore: false, cboreDiameter: 1.1, cboreDepth: 0.66, csinkAngle: 90,
      threadDepth: 0, threadMode: "cosmetic", handedness: "rh", toleranceClass: "6H",
      layout: "sketch", countX: 2, countY: 2, spacingX: 4, spacingY: 4, count: 4, radius: 3, startAngle: 0,
      direction: "forward",
      cylinderPlacementMethod:'angular',cylinderConstraintBranch:'positive-z',cylinderOnSurface:true,cylinderAlongZ:true,cylinderAlongY:true,separateHoleSketches:false,
    },
    parameters: {
      cylinderTopDistance: { ...LENGTH, min: 0 }, cylinderAngle: ANGLE,
      cylinderPlacementMethod:ENUM('angular','constraints'),cylinderConstraintBranch:ENUM('positive-z','negative-z'),cylinderOnSurface:BOOLEAN,cylinderAlongZ:BOOLEAN,cylinderAlongY:BOOLEAN,
      separateHoleSketches:BOOLEAN,
      holeType: ENUM("simple", "counterbore", "countersink", "spotface", "tapped", "tap-counterbore", "tap-countersink"),
      standard: ENUM("ISO 273", "ANSI Metric", "ANSI Inch", "ISO 262:2023", "ASME B1.1 UNC", "Custom"),
      fastenerType: ENUM("generic", "hex-bolt", "socket-head-cap-screw", "fractional-drill", "flat-head-machine-screw"),
      standardSize: ENUM("custom", "M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20", "1/4-20", "1/4-shcs", "1/2", "7/16-drill", "3/8-hex", "3/8-flat"),
      fit: ENUM("close", "normal", "loose"),
      diameter: LENGTH, depth: LENGTH, endCondition: ENUM("blind", "through-all"),
      drillPointAngle:{...ANGLE,min:60,max:180},
      countersink: BOOLEAN, countersinkDiameter: LENGTH, counterbore: BOOLEAN,
      cboreDiameter: LENGTH, cboreDepth: LENGTH, csinkAngle: { ...ANGLE, min: 60, max: 120 },
      threadDepth: { ...LENGTH, min: 0 },
      threadMode: ENUM("cosmetic", "modeled"), handedness: ENUM("rh", "lh"),
      layout: ENUM("sketch", "linear", "circular"),
      countX: { type: "number", integer: true, min: 1, max: 32 },
      countY: { type: "number", integer: true, min: 1, max: 32 },
      spacingX: LENGTH, spacingY: LENGTH,
      count: { type: "number", integer: true, min: 1, max: 32 }, radius: LENGTH, startAngle: ANGLE,
      direction: ENUM("forward", "reverse"),
    },
    editor: { groups: [
      { id:'cylindricalPosition',label:'Cylindrical face position',fields:[
        {key:'cylinderPlacementMethod',label:'Placement method',type:'select',choices:[{value:'angular',label:'Angle and top distance'},{value:'constraints',label:'3D cylindrical point constraints'}]},
        {key:'cylinderTopDistance',label:'Distance below cylinder top',type:'number',unit:'length',min:0,step:.1},
        {key:'cylinderAngle',label:'Angle from +Z around cylinder',type:'number',unit:'angle',step:1},
        {key:'cylinderConstraintBranch',label:'Cylindrical side',type:'select',choices:[{value:'positive-z',label:'+Z side'},{value:'negative-z',label:'−Z side'}]},
        {key:'cylinderOnSurface',label:'OnSurface · hole point',type:'boolean'},
        {key:'cylinderAlongZ',label:'AlongZ · construction line',type:'boolean'},
        {key:'cylinderAlongY',label:'AlongY · hole point to line end',type:'boolean'},
        {key:'separateHoleSketches',label:'Separate position and profile sketches',type:'boolean'},
      ]},
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
        { key: "standard", label: "Standard", type: "select", choices: [
          {value:"ISO 273",label:"ISO 273"},
          {value:"ISO 262:2023",label:"ISO 262:2023"},
          {value:"ANSI Metric",label:"ANSI Metric"},
          {value:"ANSI Inch",label:"ANSI Inch"},
        ]},
        { key: "fastenerType", label: "Fastener type", type: "select", choices: [
          {value:"generic",label:"Generic clearance"},
          {value:"hex-bolt",label:"Hex Bolt"},
          {value:"socket-head-cap-screw",label:"Socket Head Cap Screw"},
          {value:"fractional-drill",label:"Fractional Drill"},
          {value:"flat-head-machine-screw",label:"Flat Head Machine Screw (82°)"},
        ]},
        // Standard designations are the same in every language, so no labelKey.
        { key: "standardSize", label: "Size", labelKey: "fcFldSize", type: "select", choices: [{value:"custom",label:"Custom · enter mm or in"}].concat(["M3","M4","M5","M6","M8","M10","M12","M16","M20"].map((value)=>({value,label:value})),[{value:"1/4-shcs",label:"1/4 in · Socket Head Cap Screw (clearance)"},{value:"1/4-20",label:"1/4-20 UNC · #7 tap drill"},{value:"1/2",label:"1/2 in · Hex Bolt"},{value:"7/16-drill",label:"7/16 in · Fractional Drill"},{value:"3/8-hex",label:"3/8 in · Hex Bolt (reference clearance)"},{value:"3/8-flat",label:"3/8 in · Flat Head Machine Screw"}]) },
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
        { key: "drillPointAngle", label: "Drill point angle (180° = flat)", type: "number", unit: "angle", min:60,max:180,step:1 },
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
        { key: "threadDepth", label: "Thread engagement (0 = automatic)", labelKey: "fcFldThreadEngagement", type: "number", unit: "length", min: 0, step: 0.1 },
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
        { key: "radius", label: "Bolt circle radius", labelKey: "fcFldBoltCircle", type: "number", unit: "length", step: 0.1 },
        { key: "startAngle", label: "First hole angle", type: "number", unit: "angle", step: 1 },
      ]},
    ]},
  },
  helix: {
    label: "Helix / Spiral",
    labelKey: "fcFeatHelix",
    icon: "helixfeature",
    selection: { topology: { kinds: ["axis", "edge", "face"], max: 1 } },
    defaults: { radius: 1, pitch: 0.125, turns: 8, height: 1, handedness: "rh", startAngle: 0, taper: 0, definition:"pitch-turns", reverse:false, taperMode:"angle", taperAngle:0, taperOutward:false, pitchMode:"constant",pitchRegions:[] },
    parameters: { radius: LENGTH, pitch: LENGTH, turns: { type: "number", min: 0.01, max: 200 }, height: LENGTH, handedness: ENUM("rh", "lh"), startAngle: ANGLE, taper: SIGNED_LENGTH,pitchMode:ENUM('constant','variable') },
    editor: { groups: [{ id: "helix", label: "Helix definition", labelKey: "fcGrpHelixDefinition", icon: "ph-spiral", fields: [
      {key:"pitchMode",label:"Pitch mode",type:"select",choices:[{value:"constant",label:"Constant pitch"},{value:"variable",label:"Variable pitch"}]},
      {key:"pitchRegions",label:"Region parameters",type:"helix-regions"},
      {key:"definition",label:"Defined by",type:"select",choices:[{value:"pitch-turns",label:"Pitch and turns"},{value:"height-turns",label:"Height and turns"}]},
      { key: "radius", label: "Radius", labelKey: "fcFldRadius", type: "number", unit: "length", min: 0, step: 0.05 },
      {key:"reverse",label:"Reverse direction",type:"boolean"},
      {key:"taperMode",label:"Taper definition",type:"select",choices:[{value:"angle",label:"Angle"},{value:"delta",label:"End radius delta"}]},
      {key:"taperAngle",label:"Taper angle",type:"number",unit:"angle",value:0},
      {key:"taperOutward",label:"Taper outward",type:"boolean"},
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
    defaults: { threadPreset:"iso-metric", side: "external", mode: "cosmetic", diameterMm: 8, pitchMm: 1.25, length: 1.5, handedness: "rh", toleranceClass: "", series: "coarse", runoutStartMm:0, runoutEndMm:0, useFitLimits:false },
    parameters: {
      side: ENUM("external", "internal"), mode: ENUM("cosmetic", "modeled"),
      threadPreset: ENUM("iso-metric", "unc-quarter-20", "inch-die-8-36", "custom"),
      diameterMm: { type: "number", min: 1, max: 64 }, pitchMm: { type: "number", min: 0.2, max: 8 },
      runoutStartMm: {type:"number",min:0}, runoutEndMm: {type:"number",min:0},
      length: LENGTH, handedness: ENUM("rh", "lh"), series: ENUM("coarse", "fine", "custom"),
    },
    editor: { groups: [
      { id: "spec", label: "Thread specification", icon: "ph-seal-check", fields: [
        {key:"threadPreset",label:"Thread specification",type:"select",choices:[{value:"iso-metric",label:"ISO metric"},{value:"custom",label:"Custom thread (designer specification)"},{value:"unc-quarter-20",label:"1/4-20 UNC · cosmetic"},{value:"inch-die-8-36",label:"#8-36 UNF · inch die · basic profile"}]},
        { key: "side", label: "Side", labelKey: "fcFldSide", type: "select", choices: [
          {value:"external",label:"External",labelKey:"fcOptExternal"},
          {value:"internal",label:"Internal",labelKey:"fcOptInternal"},
        ] },
        { key: "mode", label: "Display", labelKey: "fcFldDisplay", type: "select", choices: COSMETIC_MODES },
        { key: "diameterMm", label: "Major Ø (mm)", labelKey: "fcFldMajorDiameterMm", type: "number", min: 1, max: 64, step: 0.1 },
        { key: "pitchMm", label: "Pitch (mm)", labelKey: "fcFldPitchMm", type: "number", min: 0.2, max: 8, step: 0.05 },
        { key: "length", label: "Length", labelKey: "fcFldLength", type: "number", unit: "length", min: 1e-6, step: 0.1 },
        { key:"toleranceClass",label:"Tolerance class",labelKey:"mfgThreadClass",type:"text" },
        { key:"runoutStartMm",label:"Lead-in runout (mm)",labelKey:"mfgRunoutStart",type:"number",min:0,step:.1 },
        { key:"runoutEndMm",label:"Lead-out runout (mm)",labelKey:"mfgRunoutEnd",type:"number",min:0,step:.1 },
        { key: "handedness", label: "Hand", labelKey: "fcFldHand", type: "select", choices: HANDEDNESS },
        { key: "series", label: "Series", labelKey: "fcFldSeries", type: "select", choices: [
          {value:"coarse",label:"Coarse",labelKey:"fcOptCoarse"},
          {value:"fine",label:"Fine",labelKey:"fcOptFine"},
        ] },
      ]},
      {id:"fit",label:"Measured thread limits (mm)",labelKey:"mfgFitLimits",fields:[
        {key:"useFitLimits",label:"Use supplied limits",labelKey:"mfgUseLimits",type:"boolean"},
        {key:"fitSource",label:"Limits source / inspection record",labelKey:"mfgFitSource",type:"text"},
        {key:"majorMinMm",label:"Major diameter minimum",labelKey:"mfgMajorMin",type:"number",min:0,step:.001},
        {key:"majorMaxMm",label:"Major diameter maximum",labelKey:"mfgMajorMax",type:"number",min:0,step:.001},
        {key:"pitchMinMm",label:"Pitch diameter minimum",labelKey:"mfgPitchMin",type:"number",min:0,step:.001},
        {key:"pitchMaxMm",label:"Pitch diameter maximum",labelKey:"mfgPitchMax",type:"number",min:0,step:.001},
        {key:"minorMinMm",label:"Minor diameter minimum",labelKey:"mfgMinorMin",type:"number",min:0,step:.001},
        {key:"minorMaxMm",label:"Minor diameter maximum",labelKey:"mfgMinorMax",type:"number",min:0,step:.001},
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
    defaults: { kind: "shcs", sizeKey: "M8", lengthMm: 30, material: "", finish: "", threadMode: "cosmetic", lod: 2 },
    parameters: {
      kind: { type: "string" }, sizeKey: { type: "string" }, lengthMm: { type: "number", min: 0 },
      material: { type: "string" }, finish: { type: "string" }, threadMode: ENUM("cosmetic", "modeled"),
      lod: { type: "number", integer: true, min: 0, max: 2 },
    },
    editor: { groups: [{ id: "toolbox", label: "Standard part", labelKey: "fcGrpToolbox", icon: "ph-toolbox", fields: [
      { key: "kind", label: "Family", labelKey: "fcFldToolboxFamily", type: "select", choices: TOOLBOX_FAMILY_CHOICES },
      { key: "sizeKey", label: "Size", labelKey: "fcFldToolboxSize", type: "select", choices: [], dynamicChoices: "toolbox-size" },
      { key: "lengthMm", label: "Length (mm)", labelKey: "fcFldLengthMm", type: "number", min: 0, step: 1 },
      { key: "material", label: "Material", labelKey: "fcFldMaterial", type: "select", choices: TOOLBOX_MATERIAL_CHOICES },
      { key: "finish", label: "Finish", labelKey: "fcFldToolboxFinish", type: "select", choices: TOOLBOX_FINISH_CHOICES },
      { key: "threadMode", label: "Thread geometry", labelKey: "fcFldThreadGeometry", type: "select", choices: COSMETIC_MODES },
      { key: "lod", label: "Detail level", labelKey: "fcFldToolboxLod", type: "number", min: 0, max: 2, step: 1 },
    ]}]},
  },
});

export const PARAMETRIC_FEATURE_TYPES = Object.freeze(Object.keys(FEATURE_CATALOG));

/* Features that stand on their own numbers: no sketch, no profile, no upstream
   body. The migration gate and the geometry comparison both need to ask this. */
export const PRIMITIVE_FEATURE_TYPES = Object.freeze(["box", "cylinder", "cone", "sphere"]);

export function isPrimitiveFeatureType(type) {
  return PRIMITIVE_FEATURE_TYPES.includes(type);
}

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

function selectionCount(references, role, feature) {
  if (role === "features") return Array.isArray(references?.features) ? references.features.length : 0;
  if (role === "sketches") {
    const listed = Array.isArray(references?.sketches) ? references.sketches.filter(Boolean).length : 0;
    if (listed) return listed;
    /* Migrated and viewport-rebuilt extrudes store the profile on
       params.sketchId. That is the same selection the tree already reads. */
    return feature?.params?.sketchId ? 1 : 0;
  }
  return Array.isArray(references?.[role]) ? references[role].length : 0;
}

export function validateFeatureDefinition(feature) {
  const issues = [];
  if(feature?.type==='helix' && feature.params?.pitchMode==='variable'){
    try{normalizeHelixRegions(feature.params.pitchRegions,2*feature.params.radius);}catch(error){issues.push({severity:'error',code:'invalid-helix-regions',featureId:feature.id,message:error.message});}
  }
  const spec = featureSpec(feature?.type);
  if (!feature?.id) issues.push({ severity: "error", code: "feature-id", message: "Feature has no stable id" });
  if (!spec) return issues.concat({ severity: "error", code: "feature-type", message: "Unsupported feature type: " + (feature?.type || "missing") });
  const references = feature.references || {};
  Object.entries(spec.selection || {}).forEach(([role, rule]) => {
    /* A SolidWorks-style sweep can use one profile sketch plus a reference
       helix/spiral.  The helix is carried as a reference in the feature
       parameters, so the sketch selection count is one even though the
       ordinary sketch-path sweep still requires two sketches. */
    if((feature.type==="sweep" || feature.type==="sweepCut" && (feature.params?.helixId || feature.params?.helix)) && role==="sketches" && (
      feature.params?.profileMode==="circular" ||
      feature.params?.sweepPathMode==="helix" ||
      feature.params?.helixId ||
      feature.params?.helix
    ))rule={...rule,min:feature.params?.sketchSources?.kind==='circular-helix-sweep'?0:1,max:1};
    if(feature.type==='sweepCut' && role==='features' && feature.params?.helixId && feature.params?.sketchSources?.helixFeatureId
      && references.features?.length===2 && references.features.includes(feature.inputs?.[0])
      && references.features.includes(feature.params.sketchSources.helixFeatureId))rule={...rule,max:2};
    const count = selectionCount(references, role, feature);
    if (Number.isFinite(rule.min) && count < rule.min) issues.push({
      severity: "error", code: "missing-feature-input", featureId: feature.id, role,
      message: spec.label + " requires " + rule.min + " " + role + " selection" + (rule.min === 1 ? "" : "s"),
    });
    const pairedHole=feature.type==='hole' && role==='sketches' && count===2 && feature.params?.positionSketchId && feature.params?.holeProfileSketchId
      && feature.params.positionSketchId!==feature.params.holeProfileSketchId
      && [feature.params.positionSketchId,feature.params.holeProfileSketchId].every(id=>references.sketches.includes(id));
    if (Number.isFinite(rule.max) && count > rule.max && !pairedHole) issues.push({
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
  if(feature.type==='shell' && typeof feature.params?.thickness!=='string'){
    try{shellFaceThicknesses(feature.params?.faceThicknesses,feature.params?.thickness,feature.params?.direction);}
    catch(error){issues.push({severity:'error',code:'invalid-feature-parameter',featureId:feature.id,parameter:'faceThicknesses',message:error.message});}
  }
  Object.entries(spec.parameters || {}).forEach(([name, rule]) => {
    const value = feature.params?.[name];
    if (value == null) return;
    if (rule.type === "array") {
      if (!Array.isArray(value) || value.some(item=>typeof item!=="string" || !item)) issues.push({severity:"error",code:"invalid-feature-parameter",featureId:feature.id,parameter:name,message:spec.label+" requires a list of feature identifiers"});
      return;
    }
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
    const allowed = ["blind", "through-all", "up-to-face", "up-to-surface", "up-to-next", "mid-plane"];
    if (!allowed.includes(feature.params?.endCondition)) issues.push({
      severity: "error", code: "invalid-end-condition", featureId: feature.id,
      message: spec.label + " has an invalid end condition",
    });
    if (isUpToFace(feature.params?.endCondition)) {
      const face = feature.params?.endFace || (feature.references?.topology || []).find((item) => item?.kind === "face" || item?.persistentId);
      if (!face) issues.push({
        severity: "error", code: "missing-end-face", featureId: feature.id,
        message: spec.label + " Up to surface requires a selected face",
      });
    }
  }
  if (feature.type === "boolean" && !["union", "subtract", "intersect"].includes(feature.params?.operation)) issues.push({
    severity: "error", code: "invalid-boolean-operation", featureId: feature.id, message: "Boolean operation must be union, subtract or intersect",
  });
  if (feature.type === "toolbox") {
    const family = TOOLBOX_FAMILIES.find((item) => item.kind === feature.params?.kind);
    const size = String(feature.params?.sizeKey || feature.params?.size || "");
    if (!family) issues.push({ severity:"error", code:"invalid-toolbox-family", featureId:feature.id, parameter:"kind", message:"Toolbox Part has an unknown family" });
    else {
      const sizeRow = (family.sizes || []).find((item) => String(item.key || item.size) === size || String(item.size) === size);
      if (!sizeRow) issues.push({ severity:"error", code:"invalid-toolbox-size", featureId:feature.id, parameter:"sizeKey", message:family.label + " does not contain size " + (size || "(none)") });
      if (family.hasLength && !(Number(feature.params?.lengthMm) > 0)) issues.push({ severity:"error", code:"invalid-toolbox-length", featureId:feature.id, parameter:"lengthMm", message:family.label + " requires a positive length" });
    }
  }
  return issues;
}
