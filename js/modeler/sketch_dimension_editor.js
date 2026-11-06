/* The CAD editor's placed-dimension editor, smart dimensions, box select and
   wall chains, split out of js/modeler.js. It shares the editor's state through
   live imports from ../modeler.js. */
import { appendCircularEdgeOffset, projectCircularEdge } from "../core/cone_silhouette.js";
import { createTopologyReference } from "../core/topology.js";
import { cloneData } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { drawSketch, flash, newSketchPoint, snappedSketchPoint } from "../modeler/drawing_sheet.js";
import { markDrawnSelection, modelEdgeRelationTarget, resolveIntersectionEdge, resolveSketch, selCircles, selConics, selEntities, selLines, selPoints, selectedModelEdges, selectedModelVertices, sketchForView } from "../modeler/sketch_entities.js";
import { distanceDimensionLayout, hitSketchDimensionHit } from "../sketch_dimensions.js";
import { dimensionUnit } from "../sketch_equations.js";
import { bindModelEdgeTargets } from "../sketch_intersection.js";
import { relationSubjects, sketchInstanceNames } from "../sketch_names.js";
import { circularPatternEntities, linearPatternEntities, mirrorEntities } from "../sketch_pattern.js";
import { ensureSketch, entityPoints, explainSketchConflict, pruneImpliedRelations, sketchPoint, solveSketch } from "../sketch_solver.js";
import { radialArcEndpoint } from "../sketch_three_point_arc.js";
import { offsetEntity } from "../sketch_trim.js";
import { fin, uid } from "../state.js";
import { getDomainUnit } from "../unit_settings.js";
import {
  CONSTRAINT_DEFS, E, H, RELATION_REFUSAL_MS, modelLengthText,
  modelLengthUnit, openQuickForm, pushUndo, refreshAll, root, setTool, toPx,
} from "../modeler.js";

/* A slot: two lines capped by two arcs, held together by tangency and equal
   radius rather than by being drawn in the right place. Twelve point freedoms
   minus seven residuals leaves exactly the five a slot has — centre, angle,
   length and width — so dragging either end keeps it a slot, and the width is
   one radius dimension away from being driven by an equation.
   The centreline is added as construction geometry, which is what a slot length
   dimension attaches to. */
function addSketchSlot(a, b, halfWidth) {
  var dx = b.u - a.u, dy = b.v - a.v, span = Math.hypot(dx, dy);
  var w = Math.abs(halfWidth);
  if (span < 1e-6 || w < 1e-6) return null;
  var sketch = sketchForView();
  var ux = dx / span, uy = dy / span, nx = -uy, ny = ux;

  var ca = newSketchPoint(sketch, a), cb = newSketchPoint(sketch, b);
  var pa0 = newSketchPoint(sketch, { u: a.u + nx * w, v: a.v + ny * w });
  var pa1 = newSketchPoint(sketch, { u: a.u - nx * w, v: a.v - ny * w });
  var pb0 = newSketchPoint(sketch, { u: b.u + nx * w, v: b.v + ny * w });
  var pb1 = newSketchPoint(sketch, { u: b.u - nx * w, v: b.v - ny * w });

  // The loop runs pa1 → pb1 → (cap at b) → pb0 → pa0 → (cap at a) → pa1. Arcs
  // sweep counter-clockwise from their first rim point, so each cap has to name
  // its rim points in the order that takes the sweep away from the centreline.
  var side1 = { id: uid(), type: "line", name: "Slot side", a: pa1, b: pb1, construction: false };
  var capB = { id: uid(), type: "arc", name: "Slot cap", c: cb, a: pb1, b: pb0, construction: false };
  var side0 = { id: uid(), type: "line", name: "Slot side", a: pb0, b: pa0, construction: false };
  var capA = { id: uid(), type: "arc", name: "Slot cap", c: ca, a: pa0, b: pa1, construction: false };
  var centreline = { id: uid(), type: "line", name: "Slot centreline", a: ca, b: cb, construction: true };

  var made = [side1, capB, side0, capA, centreline];
  sketch.entities.push.apply(sketch.entities, made);
  /* Both sides are held parallel to the centreline and tangent to BOTH caps at
     the joints, as SOLIDWORKS does. That already makes the caps equal: each side
     sits one near-cap radius off the centreline and touches the far cap.

     The old construction — equal radius, tangency at the near cap only — looked
     sufficient, since a side parallel to the centreline at one radius can only
     meet the far cap at its tangent point. But that meeting is a double root, so
     the far rim points were free to first order, and the exact Jacobian counts
     that: a slot with its length, width and position dimensioned still read two
     freedoms. Equal radius on top of four tangents is redundant, and measured it
     also stalled a drag that swings the far cap 30 cm in one solve. The
     parallels stay because a tangent alone is also met by the internal
     (crossing) tangent, and parallel keeps a big drag from folding a bowtie. */
  [side0, side1].forEach(function (side) {
    sketch.constraints.push({ id: uid(), type: "parallel", a: side.id, b: centreline.id });
    sketch.constraints.push({ id: uid(), type: "tangent", a: side.id, b: capA.id });
    sketch.constraints.push({ id: uid(), type: "tangent", a: side.id, b: capB.id });
  });
  resolveSketch(false);
  return made;
}

/* A regular polygon inscribed in a construction circle: every corner is held on
   the circle and every side is held equal to the next. That leaves centre,
   size and rotation free — four freedoms, which is what a polygon actually has.
   Dimension the construction circle and the whole polygon resizes. */
function addSketchPolygon(centre, rim, sides, snap) {
  var n = Math.max(3, Math.min(24, Math.round(sides) || 6));
  var r = Math.hypot(rim.u - centre.u, rim.v - centre.v);
  if (r < 1e-6) return null;
  var sketch = sketchForView();
  var start = Math.atan2(rim.v - centre.v, rim.u - centre.u);
  var circle = {
    id: uid(), type: "circle", name: n + "-gon guide",
    c: snappedSketchPoint(sketch, centre, snap), r: r, construction: true,
  };
  sketch.entities.push(circle);

  var ids = [];
  for (var i = 0; i < n; i++) {
    var ang = start + (i * Math.PI * 2) / n;
    ids.push(newSketchPoint(sketch, { u: centre.u + Math.cos(ang) * r, v: centre.v + Math.sin(ang) * r }));
  }
  var lines = ids.map(function (id, i) {
    return { id: uid(), type: "line", name: "Polygon side", a: id, b: ids[(i + 1) % n], construction: false };
  });
  sketch.entities.push.apply(sketch.entities, lines);
  ids.forEach(function (id) {
    sketch.constraints.push({ id: uid(), type: "pointOnCircle", point: id, entity: circle.id });
  });
  // n-1 equalities, not n: the last one is implied, and asserting it anyway is
  // exactly the redundancy the solver reports as over-defined
  for (var k = 0; k < n - 1; k++) {
    sketch.constraints.push({ id: uid(), type: "equal", a: lines[k].id, b: lines[k + 1].id });
  }
  resolveSketch(false);
  return lines;
}

function addSketchArc(centre, start, end, exactEnd) {
  var sketch = sketchForView();
  var r = Math.hypot(start.u - centre.u, start.v - centre.v);
  if (r < 1e-6) return null;
  // the third click only picks a direction; the radius comes from the first two
  var arc = {
    id: uid(), type: "arc", name: "Arc",
    c: snappedSketchPoint(sketch, centre, centre),
    a: newSketchPoint(sketch, start),
    b: newSketchPoint(sketch, exactEnd ? end : radialArcEndpoint(centre, start, end)),
    construction: false,
  };
  sketch.entities.push(arc);
  resolveSketch(false);
  return arc;
}

// Which constraints the current selection could take — the palette greys out
// the rest instead of letting you click into an error message.
function constraintFits(type) {
  var lines = selLines(), circles = selCircles(), points = selPoints(), ents = selEntities();
  switch (type) {
    case "coincident": return points.length === 2 || (points.length === 1 && !ents.length && (selectedModelEdges().length === 1 || (selectedModelVertices().length === 1 && !selectedModelEdges().length)));
    case "horizontal": case "vertical": return lines.length >= 1 || points.length === 2;
    case "parallel": case "perpendicular": return lines.length === 2;
    case "tangent": return (lines.length===1&&ents.some(e=>e.type==="spline")) || (lines.length === 1 && circles.length === 1) || circles.length === 2;
    case "equal": return lines.length >= 2 || selConics().length >= 2;
    case "concentric": return selConics().length === 2;
    case "midpoint": return points.length === 1 && (lines.length === 1 || (!ents.length && selectedModelEdges().length === 1));
    case "pointOnLine": return points.length === 1 && ents.length === 1 && ["line","circle","arc","ellipse"].includes(ents[0].type);
    case "intersection": return points.length === 1 && (lines.length >= 2 || selectedModelEdges().length >= 2);
    case "symmetric": return points.length === 2 && lines.length === 1;
    case "fixed": return points.length >= 1 || ents.length >= 1;
    default: return false;
  }
}

function applyConstraint(type) {
  if (!constraintFits(type)) { flash(t("needSel")); return; }
  var sketch = ensureSketch(E.def);
  var lines = selLines(), circles = selCircles(), conics = selConics(), points = selPoints(), ents = selEntities();
  var added = [];
  var add = function (c) {
    var pairRule = ["parallel", "perpendicular", "equal", "concentric", "tangent", "coincident"].indexOf(c.type) >= 0;
    var exists = sketch.constraints.some(function (old) {
      if (old.suppressed || old.type !== c.type || old.entity !== c.entity || old.point !== c.point) return false;
      return old.a === c.a && old.b === c.b || pairRule && old.a === c.b && old.b === c.a;
    });
    if (exists) return false;
    c.id = uid(); sketch.constraints.push(c); added.push(c); return true;
  };

  pushUndo(t("opConstraint"));
  switch (type) {
    case "coincident":
      /* A point and one model edge: SOLIDWORKS' Coincident to an edge (HOUSING
         HandlePath's end on Boss-Stop's rim). The edge line is re-read from the
         rebuilt body on every solve. */
      if (points.length === 1) {
        var edge = selectedModelEdges()[0], vertexTarget = !edge && modelEdgeRelationTarget(selectedModelVertices()[0]);
        if (!edge && !vertexTarget) { H.discard(); flash(t("modelVertexNoEdge")); return; }
        /* A picked corner is recorded as "the start/end of the edge that ends there". */
        add(edge ? { type: "onModelEdge", point: points[0].id, edge: topologyReferenceFromEntry(edge) || createTopologyReference(edge.ownerFeatureId, "edge", edge.persistentId, edge.descriptor || {}) }
          : { type: "onModelEdge", point: points[0].id, edge: vertexTarget.edge, at: vertexTarget.at });
        try { bindModelEdgeTargets(sketch, resolveIntersectionEdge); } catch (error) { H.discard(); flash(error.message); return; }
      } else add({ type: "coincident", a: points[0].id, b: points[1].id });
      break;
    case "horizontal": case "vertical":
      if (lines.length) lines.forEach(function (l) { add({ type: type, entity: l.id }); });
      else add({ type: type, a: points[0].id, b: points[1].id });
      break;
    case "parallel": case "perpendicular":
      add({ type: type, a: lines[0].id, b: lines[1].id }); break;
    case "tangent":
      var spline=ents.find(e=>e.type==="spline");
      if(spline&&lines.length){var pairs=[];for(var se of ["a","b"])for(var le of ["a","b"]){var sp=sketchPoint(sketch,spline[se]),lp=sketchPoint(sketch,lines[0][le]);pairs.push({se,le,d:Math.hypot(sp.x-lp.x,sp.y-lp.y)});}pairs.sort((a,b)=>a.d-b.d);add({type:"tangent",a:spline.id,b:lines[0].id,splineEnd:pairs[0].se,lineEnd:pairs[0].le});break;}
      add({ type: "tangent", a: (lines[0] || circles[0]).id, b: (lines.length ? circles[0] : circles[1]).id }); break;
    case "equal":
      var equalEntities=lines.length>=2?lines:conics;equalEntities.slice(1).forEach(function(entity){add({type:"equal",a:equalEntities[0].id,b:entity.id});});break;
    case "concentric":
      add({ type: "concentric", a: conics[0].id, b: conics[1].id }); break;
    case "midpoint":
      if (lines.length) add({ type: "midpoint", point: points[0].id, entity: lines[0].id });
      else {
        /* Midpoint of a model edge: pinned to the middle of the rebuilt edge. */
        var midEdge = modelEdgeRelationTarget(selectedModelEdges()[0]);
        add({ type: "onModelEdge", point: points[0].id, edge: midEdge.edge, at: "mid" });
        try { bindModelEdgeTargets(sketch, resolveIntersectionEdge); } catch (error) { H.discard(); flash(error.message); return; }
      }
      break;
    case "pointOnLine":
      add({ type: ents[0].type === "line" ? "pointOnLine" : "pointOnCircle", point: points[0].id, entity: ents[0].id }); break;
    case "intersection":
      if (lines.length >= 2) add({ type: "intersection", point: points[0].id, a: lines[0].id, b: lines[1].id });
      else {
        var edges = selectedModelEdges();
        add({
          type: "intersection", point: points[0].id,
          edgeA: topologyReferenceFromEntry(edges[0]) || createTopologyReference(edges[0].ownerFeatureId, "edge", edges[0].persistentId, edges[0].descriptor || {}),
          edgeB: topologyReferenceFromEntry(edges[1]) || createTopologyReference(edges[1].ownerFeatureId, "edge", edges[1].persistentId, edges[1].descriptor || {}),
        });
      }
      break;
    case "symmetric":
      add({ type: "symmetric", a: points[0].id, b: points[1].id, entity: lines[0].id }); break;
    case "fixed":
      var fixedPoints = points.slice();
      ents.forEach(function (entity) { entityPoints(sketch, entity).forEach(function (p) { if (fixedPoints.indexOf(p) < 0) fixedPoints.push(p); }); });
      fixedPoints.forEach(function (p) { add({ type: "fixed", point: p.id, x: p.x, y: p.y }); }); break;
    default: break;
  }

  if (!added.length) { H.discard(); flash(t("constraintExists")); return; }

  if (!resolveSketch(true)) {
    var ids = added.map(function (c) { return c.id; });
    // explained with the new relations still in, against the restored geometry
    var why = explainSketchConflict(sketch, { keep: ids });
    sketch.constraints = sketch.constraints.filter(function (c) { return ids.indexOf(c.id) < 0; });
    resolveSketch(false);
    H.discard();
    showRelationRefusal(sketch, added, why);
  } else E.relationRefusal = null;
  refreshAll();
}

/* Run an operation that only ever APPENDS to the sketch, and put the sketch
   back exactly as it was if the result cannot be solved. Restoring the arrays
   to their previous contents (rather than replaying history) keeps every
   surviving object's identity, so the selection and the inspector do not end
   up pointing at geometry that is no longer in the document. */
function appendToSketch(label, run) {
  var sketch = ensureSketch(E.def);
  var before = {
    points: sketch.points.slice(),
    entities: sketch.entities.slice(),
    constraints: sketch.constraints.slice(),
  };
  pushUndo(label);
  var made = run(sketch);
  if (!made) { H.discard(); return null; }
  // the operation's own relations that the sketch already implies are left out
  // rather than refusing the whole mirror or pattern as a repeat (G27)
  pruneImpliedRelations(sketch, addedConstraintIds(sketch, before.constraints));
  if (!resolveSketch(true)) {
    var appendedIds = addedConstraintIds(sketch, before.constraints);
    var appendWhy = explainSketchConflict(sketch, { keep: appendedIds });
    sketch.points = before.points;
    sketch.entities = before.entities;
    sketch.constraints = before.constraints;
    resolveSketch(false);
    H.discard();
    showSketchRefusal(sketch, label, appendedIds, appendWhy);
    return null;
  }
  return made;
}

// Mirror the selection about the last-selected line, the way every CAD package
// reads a mirror selection: the geometry first, the axis last.
function toggleDynamicMirror() {
  var sketch=ensureSketch(E.def);
  if(E.dynamicMirror && E.dynamicMirror.sketchId===sketch.id){E.dynamicMirror=null;flash("Dynamic mirror off");return;}
  var lines=selLines();
  if(lines.length!==1){flash("Select one sketch line as the mirror axis");return;}
  E.dynamicMirror={sketchId:sketch.id,axisId:lines[0].id};
  setTool("wall");flash("Dynamic mirror on — new lines stay symmetric about the selected axis");
}

function mirrorSelection() {
  var lines = selLines(), ents = selEntities();
  if (lines.length < 1 || ents.length < 2) { flash(t("mirrorNeed")); return; }
  var axis = lines[lines.length - 1];
  var sources = ents.filter(function (e) { return e !== axis; });
  if (!sources.length) { flash(t("mirrorNeed")); return; }

  var made = appendToSketch(t("sketchMirror"), function (sketch) {
    return mirrorEntities(sketch, sources.map(function (e) { return e.id; }), axis.id);
  });
  if (!made) { refreshAll(); return; }
  markDrawnSelection(made.entities);
  E.sel = E.ssel[E.ssel.length - 1];
  flash(t("mirrorMade"));
  refreshAll();
}

/* Count, pitch and direction used to arrive from three chained window.prompt()
   dialogs, which froze the page and hid the sketch the pattern was about. They
   are one PropertyManager form now — appendToSketch still owns the undo entry,
   and it only runs when apply does. */
function patternSelection() {
  var ents = selEntities();
  if (!ents.length) { flash(t("selHint")); return; }
  var ids = ents.map(function (e) { return e.id; });
  openQuickForm({
    action: "sketchPattern", icon: "ph-squares-four", title: t("sketchPattern"),
    fields: [
      { key: "count", label: t("patternAsk"), type: "number", value: 3, step: 1, min: 2 },
      { key: "pitch", label: t("patternPitch"), type: "number", value: 30, step: 1, unit: "length" },
      { key: "dir", label: t("patternDir"), type: "select", value: "u",
        choices: [{ value: "u", label: t("patternDirU") }, { value: "v", label: t("patternDirV") }] },
    ],
    onApply: function (values) {
      var count = Math.round(values.count), pitch = values.pitch;
      if (!fin(count) || count < 2 || !fin(pitch) || !pitch) { flash(t("patternBadInput")); return false; }
      var made = appendToSketch(t("sketchPattern"), function (sketch) {
        return linearPatternEntities(sketch, ids, { count: count, spacing: pitch, direction: values.dir === "v" ? "v" : "u" });
      });
      if (!made) { flash(t("patternFail")); return false; }
      E.ssel = [];
      E.sel = null;
      flash(t("patternMade"));
      return true;
    },
  });
}

/* Offset's distance panel. The undo entry belongs to apply, not to the click
   that picked the entity: the panel is asynchronous, so pushing undo up front
   would leave a stray history step behind every cancel. */
function openModelEdgeOffsetForm(edge) {
  var sketch=ensureSketch(E.def),circle;
  try { circle=projectCircularEdge(sketch,edge); }
  catch(error){flash(error.message);return;}
  var preview=function(values){
    E.offsetPreview={x:circle.x,y:circle.y,radii:[circle.radius+values.dist]};
    if(values.bidirectional)E.offsetPreview.radii.push(circle.radius-values.dist);
    drawSketch();
  };
  openQuickForm({
    action:"modeledgeoffset",icon:"ph-path",title:"Offset circular edge",
    hint:"Linked to the model edge. Positive distance offsets outward; negative offsets inward.",
    fields:[{key:"dist",label:t("offsetAsk"),type:"number",value:5,step:.5,unit:"length"},
      {key:"bidirectional",label:"Bidirectional",type:"boolean",value:false}],
    onLive:preview,
    onCancel:function(){E.offsetPreview=null;},
    onApply:function(values){
      // Build on a detached sketch: invalid distances and Cancel never change history.
      var candidate=cloneData(sketch);
      try {
        appendCircularEdgeOffset(candidate,edge,values.dist,uid);
        if(values.bidirectional)appendCircularEdgeOffset(candidate,edge,-values.dist,uid);
      }catch(error){flash(error.message);return false;}
      pushUndo(t("tool_offset"));Object.assign(sketch,candidate);
      E.offsetPreview=null;E.ssel=[];E.sel=null;resolveSketch(false);return true;
    }
  });
  preview({dist:5,bidirectional:false});
}

function openSketchOffsetForm(entityId) {
  openQuickForm({
    action: "offset", icon: "ph-path", title: t("tool_offset"), hint: t("offsetHint"),
    fields: [{ key: "dist", label: t("offsetAsk"), type: "number", value: 5, step: .5, unit: "length" },
      {key:"bidirectional",label:"Bidirectional",type:"boolean",value:false},
      {key:"constructionSource",label:"Make source construction geometry",type:"boolean",value:false}],
    onApply: function (values) {
      if (!fin(values.dist) || !values.dist) { flash(t("offsetNeedDistance")); return false; }
      var sketch = ensureSketch(E.def);
      pushUndo(t("tool_offset"));
      var before=cloneData(sketch),first=offsetEntity(sketch,entityId,values.dist);
      var second=first && values.bidirectional ? offsetEntity(sketch,entityId,-values.dist) : null;
      if(!first || (values.bidirectional&&!second)){Object.assign(sketch,before);H.discard();flash(t("offsetFail"));return false;}
      if(values.constructionSource){var source=sketch.entities.find(function(e){return e.id===entityId;});source.construction=true;first.construction=false;if(second)second.construction=false;}
      E.ssel = [];
      E.sel = null;
      resolveSketch(false);
      return true;
    },
  });
}

/* Circular pattern. The centre is picked, not typed: a selected sketch point is
   the axis, and selecting a circle or arc instead uses its centre — which is
   how a bolt circle is actually laid out. */
function circularPatternCentre() {
  var points = selPoints();
  if (points.length) return points[points.length - 1].id;
  var circles = selCircles();
  for (var i = circles.length - 1; i >= 0; i--) {
    var id = circles[i].c != null ? circles[i].c : circles[i].center;
    if (id && sketchPoint(ensureSketch(E.def), id)) return id;
  }
  return null;
}

function patternCircularSelection() {
  var ents = selEntities();
  var centre = circularPatternCentre();
  if (!ents.length || !centre) { flash(t("circPatternNeed")); return; }
  var sources = ents.filter(function (e) {
    // patterning the guide circle around its own centre produces a stack of
    // coincident copies, which is never what the pick meant
    return (e.c != null ? e.c : e.center) !== centre;
  });
  if (!sources.length) { flash(t("circPatternNeed")); return; }

  var ids = sources.map(function (e) { return e.id; });
  var inputs = openQuickForm({
    action: "sketchCircPattern", icon: "ph-arrows-clockwise", title: t("sketchCircPattern"),
    fields: [
      { key: "count", label: t("patternAsk"), type: "number", value: 6, step: 1, min: 2 },
      { key: "angle", label: t("circPatternAngle"), type: "number", value: 60, step: 1, unit: "angle" },
    ],
    onApply: function (values) {
      var count = Math.round(values.count), angle = values.angle;
      if (!fin(count) || count < 2) { flash(t("patternBadInput")); return false; }
      var made = appendToSketch(t("sketchCircPattern"), function (sketch) {
        return circularPatternEntities(sketch, ids, { count: count, angle: fin(angle) ? angle : 0, center: centre });
      });
      if (!made) { flash(t("patternFail")); return false; }
      E.ssel = [];
      E.sel = null;
      flash(t("patternMade"));
      return true;
    },
  });
  /* The old prompt seeded the angle from the count the user had just typed.
     Keep that: the angle follows the count until it is edited by hand, and
     stops following the moment it is. */
  if (inputs) {
    var angleOwned = false;
    inputs.angle.addEventListener("input", function () { angleOwned = true; });
    inputs.count.addEventListener("input", function () {
      var typed = Math.round(Number(inputs.count.value));
      if (!angleOwned && fin(typed) && typed >= 2) inputs.angle.value = String(Math.round(3600 / typed) / 10);
    });
  }
}

/* ---- smart dimension: measure what is selected/picked, then lock it ---- */
function activateDrawingSketch(sketch) {
  if (!sketch) return false;
  if (E.def.activeSketch !== sketch.id) E.def.activeSketch = sketch.id;
  E.solveInfo = solveSketch(sketch);
  return true;
}

function placedDimensionAt(sketch, px, py) {
  var hit = sketch ? hitSketchDimensionHit(sketch, px, py, toPx, 10, modelLengthUnit()) : null;
  return hit ? hit.constraint : null;
}

function placedDimensionHit(sketch, px, py) {
  return sketch ? hitSketchDimensionHit(sketch, px, py, toPx, 10, modelLengthUnit()) : null;
}

function placeDimensionAtPointer(sketch, constraint, px, py) {
  var layout = distanceDimensionLayout(sketch, constraint, toPx);
  if (!layout) return false;
  constraint.offset = (px - layout.p1.x) * layout.nx + (py - layout.p1.y) * layout.ny - 20;
  return true;
}

function hideDimensionEditor() {
  var editor = root && root.querySelector("#mdDimEditor");
  if (editor) { editor.hidden = true; delete editor._dimensionAnchor; }
  clearDimensionRefusal();
  E.dimEditor = null;
}

function clearDimensionRefusal() {
  var box = root && root.querySelector("#mdDimError");
  if (box) { box.hidden = true; box.textContent = ""; }
  if (E.dimEditor) E.dimEditor.hint = null;
}

/* A relation as a person reads it in a sentence: its name, its value, or its
   kind — never an internal id. */
function constraintKindCaption(constraint) {
  if (constraint.name) return constraint.name;
  if (constraint.value != null) {
    var n = dimensionUnit(constraint) === "angle" ? Number(Number(constraint.value).toFixed(3)) : modelLengthText(Number(constraint.value),6);
    return dimensionUnit(constraint) === "angle" ? n + "°"
      : constraint.type === "radius" ? "R " + n + " " + modelLengthUnit()
      : constraint.type === "diameter" ? "Ø " + n + " " + modelLengthUnit() : n + " " + modelLengthUnit();
  }
  if (constraint.type === "pointOnCircle") return t("cPointOnLine");
  if (constraint.type === "onModelEdge") return constraint.convert ? t("cOnEdge") : constraint.at === "mid" ? t("cMidpoint") : t("cCoincident");
  if (constraint.type === "pierce") return t("cPierce");
  var def = CONSTRAINT_DEFS.find(function (d) { return d.id === constraint.type; });
  return def ? t(def.label) : constraint.type;
}

function instanceLabels() {
  return { line: t("nameLine"), arc: t("nameArc"), circle: t("nameCircle"), ellipse: t("nameEllipse"), spline: t("nameSpline"), point: t("namePoint"), entity: t("nameEntity") };
}

/* "Tangent (Line3, Arc1)": the kind or value, then the geometry it ties by
   instance name — the way SOLIDWORKS lists relations — so four tangents in
   one message can be told apart. */
function constraintCaption(constraint, sketch) {
  var kind = constraintKindCaption(constraint);
  if (!sketch) return kind;
  var subjects = relationSubjects(sketch, constraint, sketchInstanceNames(sketch, instanceLabels()));
  return subjects.length ? kind + " (" + subjects.join(", ") + ")" : kind;
}

/* Say why a typed value was refused, in the editor where it was typed, and
   paint the relations it fights red until the editor closes or the value is
   tried again. "That constraint fights the existing ones" was true but left
   the user to guess which ones out of the fourteen the least-squares fit had
   turned red. */
function refusalMessage(sketch, subject, subjectIds, why) {
  var list = (why.ids || []).filter(function (id) { return subjectIds.indexOf(id) < 0; })
    .map(function (id) { return (sketch.constraints || []).find(function (c) { return c.id === id; }); })
    .filter(Boolean).map(function (c) { return constraintCaption(c, sketch); }).join(", ");
  return !list ? t("overDefined")
    : t(why.kind === "over-constrained" ? "dimRepeats" : "dimNoSolution").replace("{value}", subject).replace("{list}", list);
}

/* The relations a refusal named, for the canvas and the constraint list: the
   open dimension editor's, or a refused relation's for a few seconds after. */
function refusalHint(sketch) {
  if (E.dimEditor && E.dimEditor.sketch === sketch && E.dimEditor.hint) return E.dimEditor.hint;
  var recent = E.relationRefusal;
  return recent && recent.sketch === sketch && Date.now() < recent.until ? recent.ids : null;
}

/* A relation from the toolbar or the inspector palette that the sketch cannot
   take. It is already removed again; say which relations it fought and paint
   them red for a moment, instead of the bare "fights the existing ones". */
function showRelationRefusal(sketch, added, why) {
  var names = [];
  added.forEach(function (c) { var name = constraintCaption(c, sketch); if (names.indexOf(name) < 0) names.push(name); });
  showSketchRefusal(sketch, names.join(", "), added.map(function (c) { return c.id; }), why);
}

/* Any edit the sketch refused and has already undone — a fillet, a mirror, a
   typed value, a fixed point: say what it fought, hold the sentence long enough
   to read, and paint and name-tag those relations for as long. `keepIds` are
   the edit's own relations, which the explanation always contains and the
   message does not list back. */
function showSketchRefusal(sketch, subject, keepIds, why) {
  var hint = (why.ids || []).filter(function (id) { return keepIds.indexOf(id) < 0; });
  E.relationRefusal = hint.length ? { sketch: sketch, ids: hint, until: Date.now() + RELATION_REFUSAL_MS } : null;
  flash(refusalMessage(sketch, subject, keepIds, why), RELATION_REFUSAL_MS);
  clearTimeout(E._relationRefusalT);
  if (hint.length) E._relationRefusalT = setTimeout(function () { E.relationRefusal = null; refreshAll(); }, RELATION_REFUSAL_MS);
}

// the relations an edit added: whatever is in the sketch now that was not before
function addedConstraintIds(sketch, beforeConstraints) {
  var had = new Set((beforeConstraints || []).map(function (c) { return c.id; }));
  return (sketch.constraints || []).filter(function (c) { return !had.has(c.id); }).map(function (c) { return c.id; });
}

function showDimensionRefusal(state, typed, why) {
  var msg = refusalMessage(state.sketch, typed, [state.constraint.id], why);
  state.hint = why.ids && why.ids.length ? why.ids.slice() : null;
  var box = root.querySelector("#mdDimError");
  if (box) { box.textContent = msg; box.hidden = false; }
  flash(msg);
  refreshAll();
  root.querySelector("#mdDimValue").focus({ preventScroll:true });
}

function cancelDimensionEditor() {
  var state = E.dimEditor;
  if (!state) return;
  if (state.created) {
    state.sketch.constraints = (state.sketch.constraints || []).filter(function (candidate) { return candidate !== state.constraint; });
    resolveSketch(false);
    H.discard();
  } else if (state.discardOnCancel) H.discard();
  hideDimensionEditor();
  refreshAll();
}

function dismissCommittedDimensionEditor(sketch, constraint) {
  // The inspector and placed-dimension popover edit the same constraint. A
  // successful inspector commit supersedes the popover's original value;
  // otherwise finishing the sketch applies that stale value over the edit.
  if(E.dimEditor?.sketch===sketch && E.dimEditor.constraint===constraint)hideDimensionEditor();
}

function dimensionEditorUnit(constraint) {
  if (dimensionUnit(constraint) === "angle") return "°";
  var docUnit = typeof E !== "undefined" && E.def && E.def.context && E.def.context.units && E.def.context.units.length;
  if (docUnit) return docUnit;
  if (typeof getDomainUnit === "function") return getDomainUnit("details");
  return "mm";
}

export {
  activateDrawingSketch, addSketchArc, addSketchPolygon, addSketchSlot,
  addedConstraintIds, appendToSketch, applyConstraint, cancelDimensionEditor,
  clearDimensionRefusal, constraintCaption, constraintFits,
  dimensionEditorUnit, dismissCommittedDimensionEditor, hideDimensionEditor,
  instanceLabels, mirrorSelection, openModelEdgeOffsetForm,
  openSketchOffsetForm, patternCircularSelection, patternSelection,
  placeDimensionAtPointer, placedDimensionAt, placedDimensionHit, refusalHint,
  refusalMessage, showDimensionRefusal, showSketchRefusal,
  toggleDynamicMirror,
};
