/* The CAD editor's fillet/finish targets, live feature previews and feature
   form controls, split out of js/modeler.js. It shares the editor's state
   through live imports from ../modeler.js. */
import { booleanBrep, boundsMayOverlap, brepConnectedGroups, chamferBrep, disposeBrep, domeBrep, draftBrep, filletBrep, placeBrep, shapeToMeshData, shellBrep, unifyBrepFaces } from "../cad_kernel.js";
import { planarMateFaceChoices } from "../cad_mate_reference_choices.js";
import { cadWorkerAvailable, cancelCadWorkerWork, finishInCadWorker, topologyInCadWorker } from "../core/cad_worker_client.js";
import { lengthFromDocument, lengthToDocument } from "../core/document_length_units.js";
import { parallelStraightEdges } from "../core/edge_selection.js";
import { verifiedExactTopology } from "../core/exact_topology_cache.js";
import { isUpToFace } from "../core/extrude_extent.js";
import { featureDefaults } from "../core/feature_catalog.js";
import { featureContourKey } from "../core/feature_contours.js";
import { canonicalFeatureTopologyReferences, featureInputStage } from "../core/feature_input_stage.js";
import { resolveFinishFace } from "../core/finish_face_reference.js";
import { finishPreviewProofMatches } from "../core/finish_preview_proof.js";
import { holeCutRecords, holePositionPointIds, holePreviewParts } from "../core/hole_geometry.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { historyEntryRolled } from "../core/parametric_document.js";
import { circularPatternStepDegrees, patternPlacementTransform } from "../core/pattern_geometry.js";
import { growSelection, invertSelection, selectConnected, selectLoop, selectTangentChain, shrinkSelection } from "../core/topology_selection.js";
import { createTopologyRegistry, edgeLiesOnFace, edgesBoundingFace, resolveFinishTargetIds, resolveTopologyReference } from "../core/topology.js";
import { selectionFilterAllows } from "../modeler_chrome.js";
import { featureControlValue } from "../modeler_feature_form.js";
import { approximateFinishPreviewShapes, chamferVertex, filletVertex } from "../modeler_finish_preview.js";
import { maxFinishAmount } from "../modeler_instant3d.js";
import { edgePoints } from "../modeler_mesh_geometry.js";
import { FACE_DRIVEN_OPERATIONS, cloneData, exactBrepForPart, mirrorProjectionPart, partBounds, partNeedsExactMesh, partSupportsExactMesh, patternMergeSource, placePatternCopy, resetClonedPartIdentity } from "../modeler_part_geometry.js";
import { dedupeFinishRefs, finishEdgeKey, finishEdgeLabel, sameFinishEdge, topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { registerQuickForm } from "../modeler_quick_form.js";
import { createShellFaceThicknessEditor, createShellOpeningFaceBrowser } from "../modeler_shell_thickness_form.js";
import { t, tf } from "../modeler_strings.js";
import { thinExtrudeChainKey } from "../modeler_thin_extrude_profiles.js";
import { collectingEndFace, commandSelectionPrefer, openQuickForm, syncContextActions } from "../modeler/command_manager.js";
import { patternPlacements, pushUndo } from "../modeler/document_history.js";
import { closedSketchProfile, drawSketch, flash, sheetPrompt, showPickList, sketchFeatureAreas } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { clearFeaturePreview, cutTargetFeatureId, extrudePreviewParts, featureField, selectedFeatureIds, selectedRevolve, selectedSketchIds, selectedThreadStart } from "../modeler/feature_create.js";
import { cancelFeatureParameterEdit, dependencyReferenceId, syncLiveFeatureEdit } from "../modeler/feature_tree.js";
import { refreshChangedPart, refreshLivePreview, renderPreview } from "../modeler/library_panel.js";
import { activeParts, featureTypeLabel, savedExactTopologyForPart, topologyEntriesForPart } from "../modeler/library_store.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { exactDisplayBody } from "../modeler/prefs_snap.js";
import { selEntities } from "../modeler/sketch_entities.js";
import { isCanonicalAuthoring, modelLengthText, modelLengthUnit } from "../modeler/sketch_workflow.js";
import { clearLiveDownstream } from "../modeler/tree_assembly.js";
import { overlayEntriesForPart } from "../modeler/viewport_decorations.js";
import { hidePickCycle, syncFilletEndpoints } from "../modeler/viewport_input.js";
import { analyzeSketchChains } from "../sketch_profiles.js";
import { ensureSketch } from "../sketch_solver.js";
import { fin, uid } from "../state.js";
import {
  E, FINISH_AMOUNT_KEY, FINISH_FEATURES, H, PATTERN_IDENTITY_PLACEMENT,
  PATTERN_MERGE_PREVIEW_DELAY, REPEATABLE_AMOUNT, refreshAll,
  refreshSelection, root,
} from "../modeler.js";

function finishCommandActive() {
  return !!(E.authoring && ["fillet", "chamfer"].includes(E.authoring.featureType));
}

function overlayEdgesOnFace(part, face, mesh) {
  var descriptor = (face && face.descriptor) || {};
  var origin = descriptor.origin || descriptor.center, normal = descriptor.normal;
  if (!origin || !normal) return [];
  var n = { x: normal.x || 0, y: normal.y || 0, z: normal.z || 0 };
  var nlen = Math.hypot(n.x, n.y, n.z) || 1;
  n.x /= nlen; n.y /= nlen; n.z /= nlen;
  var span = Math.sqrt(Math.abs(Number(descriptor.measure) || 1));
  var tol = Math.max(1e-5, span * 1e-6);
  var refs = [];
  overlayEntriesForPart(part, mesh).forEach(function (entry) {
    var points = edgePoints(entry.descriptor);
    if (points.length < 2) return;
    var on = points.every(function (p) {
      return Math.abs(((p.x || 0) - origin.x) * n.x + ((p.y || 0) - origin.y) * n.y + ((p.z || 0) - origin.z) * n.z) <= tol;
    });
    if (on) refs.push(topologyReferenceFromEntry(entry));
  });
  return refs;
}




/* Cuts invalidate the exact mesh while OpenCascade rebuilds it. The analytic
   primitive underneath still describes the pre-cut body, so it is not an
   authoritative source for finish edges during that window. Returning no
   candidates is safer than offering a circular rim through a removed slot. */
function authoritativeFinishTopology(part) {
  if (!part) return null;
  if (partNeedsExactMesh(part) && !(part.meshData && Array.isArray(part.meshData.topology) && part.meshData.topology.length)) return savedExactTopologyForPart(part);
  if(part.meshData?.topology?.length)return part.meshData.topology;
  return topologyEntriesForPart(part);
}

function canonicalFinishEdges(edges, part) {
  var entries = authoritativeFinishTopology(part);
  if (!entries) return [];
  var registry = createTopologyRegistry(entries);
  return resolveFinishTargetIds(edges, registry, "edge").map(function (id) {
    return registry.byPersistentId.get(id);
  }).filter(Boolean).map(topologyReferenceFromEntry);
}

function edgeRefsForFaces(faces, part) {
  if (!part || !faces || !faces.length) return [];
  var entries = authoritativeFinishTopology(part);
  if (!entries) return [];
  var registry = createTopologyRegistry(entries);
  var seen = new Set(), keys = new Set(), refs = [];
  var add = function (edge) {
    if (!edge) return;
    var reference = edge.kind ? topologyReferenceFromEntry(edge) : edge;
    var key = finishEdgeKey(reference);
    if (seen.has(reference.persistentId) || keys.has(key)) return;
    seen.add(reference.persistentId);
    keys.add(key);
    refs.push(reference);
  };
  faces.forEach(function (face) {
    edgesBoundingFace(face, registry).forEach(add);
    if(!part.meshData?.topology?.length)overlayEdgesOnFace(part, face, null).forEach(add);
  });
  return refs;
}

function fullRoundActive() { return !!activeFilletParams()?.fullRound; }
function toggleFullRoundFace(reference) {
  var faces=(E.topologySelection || []).filter(function(item){return item.kind==="face";});
  var index=faces.findIndex(function(item){return item.persistentId===reference.persistentId;});
  if(index>=0)faces.splice(index,1);else if(faces.length<3)faces.push(reference);else {flash("Remove a face before selecting its replacement");return;}
  setFinishEdges(faces);
}

function currentFinishEdges() {
  return (E.topologySelection || []).filter(function (reference) { return reference.kind === "edge"; });
}


function setFinishEdges(edges, options) {
  var part = selectedSolid();
  var faces = (edges || []).filter(function (reference) { return reference && reference.kind === "face"; });
  var edgeRefs=(edges || []).filter(function(reference){return reference && reference.kind==="edge";});
  var canonical = E.authoring?.featureEdit && E.authoring.finishEditTopology ? dedupeFinishRefs(edgeRefs) : canonicalFinishEdges(edgeRefs, part);
  E.topologySelection = canonicalFeatureTopologyReferences(E.def,dedupeFinishRefs(faces.concat(canonical)));
  if (options && options.pool) {
    E.authoring.finishEdgePool = E.topologySelection.map(function (reference) { return reference.persistentId; });
  }
  syncActiveFeatureSelectionFeedback();
  if (E.authoring?.featureEdit && ["fillet","chamfer"].includes(E.authoring.featureType)) {
    var edited=(E.def.features || []).find(function(feature){return feature.id===E.authoring.featureEdit.featureId;});
    if(edited){
      edited.references.topology=cloneData(E.topologySelection);
      if(edited.type==="fillet" && Array.isArray(edited.params.edgeRadii)){
        var selectedIds=new Set(E.topologySelection.map(function(reference){return reference.persistentId;}));
        edited.params.edgeRadii=edited.params.edgeRadii.filter(function(entry){return selectedIds.has(entry.id);});
      }
      (E.def.parts || []).forEach(function(item){(item.exactOperations || []).forEach(function(operation){if(operation.id===edited.id)operation.targets=cloneData(edited.references.topology);});});
      syncLiveFeatureEdit(edited);
      renderFinishEdgeList();
    }
    return;
  }
  if (E.authoring && E.authoring.featureType && E.authoring.featurePreviewState && !E.authoring.featureEdit) {
    queueNewFeaturePreview(E.authoring.featureType, E.authoring.featurePreviewState, E.authoring.featurePreviewBadge);
    return;
  }
  refreshAll();
}

function toggleFinishEdges(refs) {
  var current = currentFinishEdges();
  var wanted = dedupeFinishRefs(refs);
  var allOn = wanted.length && wanted.every(function (reference) {
    return current.some(function (item) { return sameFinishEdge(item, reference); });
  });
  if (allOn) current = current.filter(function (item) {
    return !wanted.some(function (reference) { return sameFinishEdge(item, reference); });
  });
  else wanted.forEach(function (reference) {
    if (!current.some(function (item) { return sameFinishEdge(item, reference); })) current.push(reference);
  });
  setFinishEdges(current);
}

function adoptFinishEdgeSelection() {
  if (!finishCommandActive()) return;
  var edges = dedupeFinishRefs(finishFeatureTargets(E.authoring.featureType));
  E.topologySelection = edges;
  E.authoring.finishEdgePool = edges.map(function (reference) { return reference.persistentId; });
}

/* Select All in the 3D view of a part. It used to run the sketch branch here
   whatever the mode, which did not merely fail to select topology: it assigned
   a SKETCH ENTITY to E.sel, the slot holding the selected solid, so the
   inspector and every command reading selectedSolid() were handed a line.
   Honour the active filter, the way SolidWorks scopes Select All. */
function selectAllTopology() {
  var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
  if (!part) { flash(t("needParts")); return; }
  E.ssel = [];
  E.sel = part;
  var filter = commandSelectionPrefer();
  // Body is a selection of the solid itself; there is no topology to gather.
  if (filter === "body" || filter === "sketch") { E.topologySelection = []; return; }
  E.topologySelection = dedupeFinishRefs(topologyEntriesForPart(part)
    .filter(function (entry) { return entry.kind === "face" || entry.kind === "edge"; })
    .map(topologyReferenceFromEntry)
    .filter(function (reference) { return reference && selectionFilterAllows(reference.kind, filter); }));
  flash(t("selAllTopology") + " · " + E.topologySelection.length + " " + t("topologyRefs"));
}

/* Loop / tangency / connected / invert, over the topology of the body the pick
   belongs to. These are selection operations, so they neither push undo nor
   touch the document — only what is highlighted. While a finish command is
   collecting they feed its well instead, which is what makes "double-click an
   edge, apply a fillet" one gesture rather than twelve clicks. */
function runSelectionOperation(id) {
  var reference = (E.topologySelection || [])[0];
  if (!reference && id !== "selectinvert") { flash(t("selectEdges")); return; }
  var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
  var entries = topologyEntriesForPart(part);
  if (!entries.length) { flash(t("selectOpEmpty")); return; }
  var grown =
    id === "selectloop" ? selectLoop(reference, entries) :
    id === "selecttangency" ? selectTangentChain(reference, entries) :
    id === "selectconnected" ? selectConnected(reference, entries) :
    id === "selectgrow" ? growSelection(E.topologySelection || [], entries) :
    id === "selectshrink" ? shrinkSelection(E.topologySelection || [], entries) :
    invertSelection(E.topologySelection || [], entries);
  var refs = dedupeFinishRefs(grown.map(topologyReferenceFromEntry).filter(Boolean));
  if (!refs.length) { flash(t("selectOpEmpty")); return; }
  if (part) E.sel = part;
  /* Tangency and loop are how a fillet set is built, so they must land in the
     collector when one is armed rather than beside it. */
  if (finishCommandActive()) setFinishEdges(refs, { pool: true });
  else { E.topologySelection = refs; refreshSelection(); }
  hidePickCycle();
  flash(tf("selectOpResult", { count: refs.length }));
}

/* Double-click grows whatever the two clicks under it selected: an edge gives
   its loop, a face gives the smooth run of faces it belongs to. Both are what
   the same gesture does in SolidWorks and Fusion, and neither had any binding
   here — dblclick was wired to the 2D canvas only. */
function growSelectionFromDoubleClick() {
  var reference = (E.topologySelection || [])[0] || (finishCommandActive() ? currentFinishEdges()[0] : null);
  if (!reference) return;
  runSelectionOperation(reference.kind === "face" ? "selecttangency" : "selectloop");
}

/* Saved selection sets. A run of edges that took a minute to pick is worth
   keeping: the fillet gets tweaked, the model gets rebuilt, and the same set is
   wanted again. Stored on the document (see namedSelections in core/schema.js)
   so it survives save and reload, and pushed through undo like any other edit
   to it. */
function namedSelections() {
  if (!Array.isArray(E.def.namedSelections)) E.def.namedSelections = [];
  return E.def.namedSelections;
}

async function saveNamedSelection() {
  var refs = dedupeFinishRefs(E.topologySelection || []);
  if (!refs.length) { flash(t("selectOpEmpty")); return; }
  var name = await sheetPrompt(t("nameSelection"), t("selectionSet") + " " + (namedSelections().length + 1));
  name = String(name == null ? "" : name).trim();
  if (!name) return;
  pushUndo(t("nameSelection"));
  var list = namedSelections();
  var at = list.findIndex(function (entry) { return entry.name === name; });
  var record = { id: at >= 0 ? list[at].id : uid(), name: name, refs: cloneData(refs) };
  if (at >= 0) list[at] = record; else list.push(record);
  refreshAll();
  flash("✓ " + name + " · " + refs.length);
}

/* Restoring rebinds by persistent id against the body as it stands now, so a
   set saved before a rebuild does not quietly select nothing — and says how
   much of it survived rather than pretending it all did. */
function restoreNamedSelection(record) {
  if (!record) return;
  var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
  var entries = topologyEntriesForPart(part);
  var byId = new Map(entries.map(function (entry) { return [entry.persistentId, entry]; }));
  var found = (record.refs || []).map(function (reference) {
    var entry = byId.get(reference.persistentId);
    return entry ? topologyReferenceFromEntry(entry) : null;
  }).filter(Boolean);
  if (!found.length) { flash(t("selectionSetStale")); return; }
  if (part) E.sel = part;
  if (finishCommandActive()) setFinishEdges(found, { pool: true });
  else { E.topologySelection = dedupeFinishRefs(found); refreshSelection(); }
  flash(found.length < (record.refs || []).length
    ? tf("selectionSetPartial", { found: found.length, saved: (record.refs || []).length })
    : record.name + " · " + found.length);
}

function deleteNamedSelection(record) {
  if (!record) return;
  var list = namedSelections();
  var at = list.findIndex(function (entry) { return entry.id === record.id; });
  if (at < 0) return;
  pushUndo(t("nameSelection"));
  list.splice(at, 1);
  refreshAll();
}

/* Restore mode by default, with one entry that flips the same list into delete
   mode — showPickList has no room for a per-row control, and a second menu
   command for deleting would sit in the context menu forever to be used twice
   a year. */
function showNamedSelections(deleting) {
  var list = namedSelections();
  if (!list.length) { flash(t("selectionSetNone")); return; }
  var rows = list.map(function (record) {
    return { id: record.id, label: record.name, hint: (record.refs || []).length + " " + t("topologyRefs") };
  });
  if (!deleting) rows.push({ id: "$delete", label: t("selectionSetDelete") });
  showPickList(t("selectionSets"), t(deleting ? "selectionSetDelete" : "selectionSets"), rows, function (item) {
    if (item.id === "$delete") { showNamedSelections(true); return; }
    var record = list.find(function (entry) { return entry.id === item.id; });
    if (deleting) deleteNamedSelection(record);
    else restoreNamedSelection(record);
  }, deleting ? { onBack: function () { showNamedSelections(false); } } : {});
}

function selectedTopologyFaces() {
  return (E.topologySelection || []).filter(function (reference) { return reference.kind === "face"; });
}

/* "All edges" means every edge of the picked faces when a face is selected —
   scoping to the face is the whole point of picking one. Only a body-level
   selection sweeps the entire solid. */
function allCandidateFinishEdges(part) {
  if(E.authoring?.featureEdit && E.authoring.finishEditTopology)return dedupeFinishRefs(E.authoring.finishEditTopology.filter(function(entry){return entry.kind==="edge";}).map(topologyReferenceFromEntry));
  if (!part) return [];
  if (!authoritativeFinishTopology(part)) return [];
  var overlay = overlayEntriesForPart(part, null);
  var entries = overlay.length
    ? overlay
    : topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "edge"; });
  var faces = selectedTopologyFaces();
  if (faces.length) {
    var onFaces = entries.filter(function (entry) {
      return faces.some(function (face) { return edgeLiesOnFace(entry, face); });
    });
    if (onFaces.length) entries = onFaces;
  }
  return dedupeFinishRefs(entries.map(topologyReferenceFromEntry));
}

/* The params object the open feature form is editing, when it is a fillet.
   The per-edge radii live there rather than in a parallel store, so Apply
   carries them with every other parameter and Cancel drops them with the rest. */
function activeFilletParams() {
  if (!E.authoring || E.authoring.featureType !== "fillet") return null;
  var state = E.authoring.featurePreviewState;
  return state && state.params ? state.params : null;
}

function filletEdgeRadiusEntry(params, persistentId, create) {
  if (!params) return null;
  if (!Array.isArray(params.edgeRadii)) params.edgeRadii = [];
  var found = params.edgeRadii.find(function (entry) { return entry && entry.id === persistentId; });
  if (found || !create) return found || null;
  found = { id: persistentId };
  params.edgeRadii.push(found);
  return found;
}

/* One number per end of one edge. Blank means "use the feature's own radius",
   which is why an emptied field deletes the override instead of storing 0 —
   a zero radius is not a fillet, and the kernel would clamp it to 1e-6 and
   fail on that edge alone. */
function filletEdgeRadiusInput(row, reference, key, params) {
  var field = el("label", "md-finish-edge-radius");
  var unit=modelLengthUnit();
  field.appendChild(el("span", "", t(key === "radius" ? "edgeRadiusStart" : "edgeRadiusEnd")+" ("+unit+")"));
  var input = el("input");
  input.type = "number";
  input.min = "0";
  input.step = "any";
  input.dataset.edgeRadius = key;
  input.dataset.edgeId = reference.persistentId;
  var entry = filletEdgeRadiusEntry(params, reference.persistentId, false);
  input.value = entry && Number(entry[key]) > 0 ? String(lengthToDocument(entry[key],unit)) : "";
  input.addEventListener("input", function () {
    /* Read the live params object, not the one captured at render time: every
       form edit replaces state.params with a fresh spread, so a closed-over
       reference would collect radii nobody would ever apply. */
    var live = activeFilletParams();
    if (!live) return;
    var value = lengthFromDocument(Number(input.value),unit);
    if (input.value === "" || !Number.isFinite(value) || value <= 0) {
      var existing = filletEdgeRadiusEntry(live, reference.persistentId, false);
      if (existing) delete existing[key];
      if (existing && existing.radius == null && existing.endRadius == null) {
        live.edgeRadii = live.edgeRadii.filter(function (item) { return item !== existing; });
      }
    } else filletEdgeRadiusEntry(live, reference.persistentId, true)[key] = value;
    if (E.authoring.featureEdit) {
      var feature=(E.def.features || []).find(function(item){return item.id===E.authoring.featureEdit.featureId;});
      if(feature)syncLiveFeatureEdit(feature);
    } else if (E.authoring.featurePreviewState) {
      queueNewFeaturePreview("fillet", E.authoring.featurePreviewState, E.authoring.featurePreviewBadge);
    }
  });
  field.appendChild(input);
  row.appendChild(field);
}

function filletReferenceEndpoints(reference) {
  var d=reference && reference.descriptor;
  if(!d)return null;
  if(d.endpoints && d.endpoints.length>=2)return [d.endpoints[0],d.endpoints[d.endpoints.length-1]];
  if(d.curve!=="line" || !d.origin || !d.axis || !(d.measure>0))return null;
  var length=Math.hypot(d.axis.x,d.axis.y,d.axis.z);if(!length)return null;
  return [-1,1].map(function(sign){return {x:d.origin.x+sign*d.axis.x*d.measure/(2*length),y:d.origin.y+sign*d.axis.y*d.measure/(2*length),z:d.origin.z+sign*d.axis.z*d.measure/(2*length)};});
}

function finishEdgeDescription(reference) {
  var d=reference.descriptor || {},center=d.origin || d.center;
  var unit=modelLengthUnit();
  return (d.curve || "Edge")+(Number.isFinite(d.radius)?" · radius "+modelLengthText(d.radius,8)+" "+unit:"")+(center?" · center ("+[center.x,center.y,center.z].map(function(value){return modelLengthText(value,8);}).join(", ")+") "+unit:"");
}

function renderFinishEdgeList() {
  var host = root && root.querySelector("#mdQuickSettings [data-finish-edges]");
  if (!host) return;
  var part = selectedSolid();
  if(!part && E.authoring?.featureEdit){var finishBodies=activeParts(E.def).filter(partSupportsExactMesh);if(finishBodies.length===1)part=finishBodies[0];}
  var edges = currentFinishEdges();
  var filletParams = activeFilletParams();
  if(filletParams?.fullRound){
    host.dataset.edgeSignature="";host.innerHTML="";
    host.appendChild(el("p","md-finish-edges-hint","Select wall 1, the flat land, then wall 2. The walls need parallel straight or concentric circular boundaries on the land."));
    if(!part){var bodies=activeParts(E.def).filter(partSupportsExactMesh);if(bodies.length===1)part=bodies[0];}
    var selectedFaces=(E.topologySelection || []).filter(function(reference){return reference.kind==="face";});
    var availableFaces=part ? topologyEntriesForPart(part).filter(function(reference){return reference.kind==='face'&&["plane","cylinder"].includes(reference.descriptor?.surface);}) : [];
    ["Side face 1","Center face","Side face 2"].forEach(function(role,index){
      var label=el("label","md-feature-field"),select=document.createElement('select');
      label.appendChild(document.createTextNode(role));select.setAttribute('aria-label',role);
      var empty=document.createElement('option');empty.value='';empty.textContent='Pick in viewport or choose a face';select.appendChild(empty);
      var roleFaces=availableFaces.filter(function(reference){return index!==1||reference.descriptor.surface==="plane";});
      roleFaces.forEach(function(reference){
        var option=document.createElement('option'),d=reference.descriptor,o=d.origin||{},n=d.normal||{};
        option.value=reference.persistentId;
        option.textContent=d.surface+' · center ('+[o.x,o.y,o.z].map(function(v){return modelLengthText(Number(v||0),5);}).join(', ')+') '+modelLengthUnit()+(d.surface==="cylinder"?' · R '+modelLengthText(d.radius,5)+' '+modelLengthUnit():' · normal ('+[n.x,n.y,n.z].map(function(v){return Number(v||0).toFixed(2);}).join(', ')+')');
        option.disabled=selectedFaces.some(function(face,other){return other!==index&&face.persistentId===reference.persistentId;});
        select.appendChild(option);
      });
      select.value=selectedFaces[index]?.persistentId || '';
      select.disabled=index>selectedFaces.length;
      select.addEventListener('change',function(){
        var faces=selectedFaces.slice(),chosen=availableFaces.find(function(face){return face.persistentId===select.value;});
        if(chosen)faces[index]=topologyReferenceFromEntry(chosen);else faces.splice(index,1);
        E.sel=part;setFinishEdges(faces);
      });
      label.appendChild(select);host.appendChild(label);
    });
    return;
  }
  var variable = !!(filletParams && filletParams.variableRadius);
  if (variable) edges.forEach(function(reference) {
    var ends = filletReferenceEndpoints(reference);
    if (!ends || ends.length !== 2) return;
    var entry = filletEdgeRadiusEntry(filletParams, reference.persistentId, true);
    if (!entry.startPoint) entry.startPoint = cloneData(ends[0]);
  });
  syncFilletEndpoints(E.pv);

  /* refreshAll() re-runs this on every preview tick, and rebuilding the list
     under a half-typed radius steals the caret. Only redraw when the list is
     actually different. */
  var candidates = part ? allCandidateFinishEdges(part) : [];
  /* A body selected after the command opens (or a late exact mesh) changes the
     choices even when the selected-edge well is still empty. */
  var signature = (variable ? "v|" : filletParams?.multipleRadius ? "m|" : "c|")
    + (part?.id || "") + "|" + candidates.map(function(reference){return reference.persistentId;}).join(",")
    + "|" + edges.map(function (reference) { return reference.persistentId; }).join("|");
  if (host.dataset.edgeSignature === signature) return;
  var browseOpen=!!host.querySelector(".md-edge-browser")?.open || host.dataset.edgeBrowserOpen==="true";
  var browseScroll=host.querySelector(".md-edge-browser-choices")?.scrollTop || 0;
  host.dataset.edgeSignature = signature;
  host.innerHTML = "";
  var head = el("div", "md-finish-edges-head");
  /* An armed collector, not a read-out. Fillet already routes every click into
     toggleFinishEdges(), but nothing on screen said so — the panel looked like
     a list of what happened to be selected. The armed state and the kind it
     wants are now stated, so a click that lands somewhere unexpected is
     traceable to the command rather than to a broken pick. */
  host.classList.add("is-collecting");
  host.setAttribute("data-collector-kind", "edge");
  head.appendChild(el("b", "", t("finishEdges") + " · " + edges.length));
  head.appendChild(el("small", "md-collector-armed", t("collectorArmedEdges")));
  var tools = el("div", "md-finish-edges-tools");
  tools.appendChild(btn(t("selectAllEdges"), function () {
    setFinishEdges(selectedTopologyFaces().concat(allCandidateFinishEdges(part)));
  }, "md-finish-edges-all"));
  tools.appendChild(btn(t("clearEdges"), function () { setFinishEdges([]); }, "md-finish-edges-none"));
  var parallel = btn(t("selectParallelEdges"), function () {
    var matches = parallelStraightEdges(edges[0], allCandidateFinishEdges(part));
    setFinishEdges(selectedTopologyFaces().concat(edges,matches));
  }, "md-finish-edges-parallel");
  parallel.disabled = !parallelStraightEdges(edges[0], edges).length;
  parallel.title = t("selectParallelEdgesHint");
  tools.appendChild(parallel);
  head.appendChild(tools);
  host.appendChild(head);
  if(part){
    var browser=el("details","md-edge-browser"),summary=el("summary","","Browse body edges");
    browser.open=browseOpen;
    browser.addEventListener("toggle",function(){host.dataset.edgeBrowserOpen=String(browser.open);});
    browser.appendChild(summary);
    var filterBar=el('div','md-edge-browser-filter');
    var filterInput=el('input','md-edge-browser-search');filterInput.type='search';
    filterInput.setAttribute('aria-label','Filter edges');filterInput.placeholder='Filter edges · e.g. line 5';
    filterInput.value=host.dataset.edgeBrowserFilter || '';
    var filterCount=el('span','md-edge-browser-count');filterCount.setAttribute('role','status');filterCount.setAttribute('aria-live','polite');
    var clearFilter=btn('Clear filter',function(){filterInput.value='';applyEdgeFilter(true);filterInput.focus?.();},'md-edge-browser-clear');
    filterBar.appendChild(filterInput);filterBar.appendChild(clearFilter);filterBar.appendChild(filterCount);browser.appendChild(filterBar);
    var choices=el("div","md-edge-browser-choices"),filterRows=[];
    function applyEdgeFilter(resetScroll){
      var query=filterInput.value || '',terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),shown=0;
      host.dataset.edgeBrowserFilter=query;
      filterRows.forEach(function(row){var match=terms.every(function(term){return row.label.includes(term);});row.button.hidden=!match;if(match)shown++;});
      filterCount.textContent=shown+' of '+filterRows.length+' edges';clearFilter.disabled=!query;
      if(resetScroll)choices.scrollTop=0;
    }
    filterInput.addEventListener('input',function(){applyEdgeFilter(true);});
    candidates.forEach(function(reference,index){
      var selected=edges.some(function(edge){return sameFinishEdge(edge,reference);});
      var choice=btn("",function(){toggleFinishEdges([reference]);},"md-wide");
      choice.setAttribute("aria-pressed",String(selected));
      var marker=el("span","md-edge-browser-marker",selected?"✓":"");
      marker.setAttribute("aria-hidden","true");
      choice.appendChild(marker);
      var edgeLabel=(index+1)+" · "+finishEdgeDescription(reference);
      choice.appendChild(el("span","md-edge-browser-label",edgeLabel));
      filterRows.push({button:choice,label:edgeLabel.toLocaleLowerCase()});
      choice.addEventListener("mouseenter",function(){E.hoverTopology=reference;refreshChangedPart(part);});
      choice.addEventListener("mouseleave",function(){E.hoverTopology=null;refreshChangedPart(part);});
      choices.appendChild(choice);
    });
    browser.appendChild(choices);host.appendChild(browser);
    applyEdgeFilter(false);choices.scrollTop=browseScroll;
  }
  var list = el("div", "md-finish-edges-list");
  edges.forEach(function (reference, index) {
    var row = el("button", "md-finish-edge");
    row.type = "button";
    row.appendChild(el("span", "", finishEdgeLabel(reference, index)));
    row.title=finishEdgeDescription(reference);
    row.appendChild(el("i", "ph ph-x"));
    row.addEventListener("mouseenter", function () {
      E.hoverTopology = reference;
      if (E.pv) refreshChangedPart(part);
    });
    row.addEventListener("mouseleave", function () {
      if (E.hoverTopology && E.hoverTopology.persistentId === reference.persistentId) {
        E.hoverTopology = null;
        if (E.pv) refreshChangedPart(part);
      }
    });
    row.addEventListener("click", function (event) {
      event.preventDefault();
      toggleFinishEdges([reference]);
    });
    if (!variable && !filletParams?.multipleRadius) { list.appendChild(row); return; }
    var wrap = el("div", "md-finish-edge-row");
    wrap.appendChild(row);
    filletEdgeRadiusInput(wrap, reference, "radius", filletParams);
    if(variable)filletEdgeRadiusInput(wrap, reference, "endRadius", filletParams);
    list.appendChild(wrap);
  });
  host.appendChild(list);
  host.appendChild(el("p", "md-finish-edges-hint", variable ? t("edgeRadiiHint") : t("clickEdgesHint")));
}

function finishFeatureTargets(type, params) {
  var sel=E.topologySelection || [];
  if(type==="fillet" && (params ? params.fullRound : fullRoundActive()))return cloneData(sel.filter(function(reference){return reference.kind==="face";}));
  if(FACE_DRIVEN_OPERATIONS.has(type))return cloneData(sel.filter(function(reference){return reference.kind==="face";}));
  var edges=dedupeFinishRefs(sel.filter(function(reference){return reference.kind==="edge";}));
  var faces=sel.filter(function(reference){return reference.kind==="face";});
  var part=selectedSolid();
  if(faces.length && part){
    edgeRefsForFaces(faces, part).forEach(function(edge){
      if(!edges.some(function(item){return sameFinishEdge(item,edge);}))edges.push(edge);
    });
  }
  if(edges.length && part)edges=canonicalFinishEdges(edges,part);
  return cloneData(edges.length ? edges : faces);
}

function finishFeatureAmount(type,params) {
  var key=FINISH_AMOUNT_KEY[type];
  return key ? Number((params || {})[key]) : NaN;
}

function exactFinishPreviewPart(type,state) {
  var source=selectedSolid();
  if(!partSupportsExactMesh(source))return null;
  var targets=finishFeatureTargets(type);
  if(!targets.length)return null;
  var amount=finishFeatureAmount(type,state.params);
  // A draft angle is the one finish amount that is meaningfully signed: a
  // negative angle tips the wall the other way rather than being invalid.
  if(!Number.isFinite(amount) || (type==="draft"?amount===0:amount<=0))return null;
  var preview=clonePartWithoutTessellationCopy(source);
  preview.previewOnly=true;preview.id=source.id;preview.name="Live "+featureTypeLabel(type);
  preview.color=type==="shell"?"#43a6c9":type==="draft"?"#c98f43":type==="thicken"?"#5fae7a":"#7567e8";preview.opacity=.94;
  preview.exactOperations=preview.exactOperations || [];
  preview.exactOperations.push({
    id:"preview:"+type,type:type,amount:amount,targets:targets,params:cloneData(state.params),
  });
  return preview;
}

/* The approximate stand-in.  Fillet, chamfer and shell are the three features
   whose parameter is purely visual, and the three whose exact result is the
   slowest to compute — so the mesh path answers immediately, in mesh space,
   while OpenCascade works.  The answer is an approximation and the badge above
   the form says so; a selection or a body the approximation cannot describe
   simply produces nothing and the form waits for the exact result, exactly as
   it used to.  Pure arithmetic on plain objects: safe on a frame. */
function approximateFinishPreviewParts(type,state,source) {
  var amount=type==="fillet"?Number(state.params.radius):type==="chamfer"?Number(state.params.distance):Number(state.params.thickness);
  var shapes=[];
  try{
    shapes=approximateFinishPreviewShapes({part:source,type:type,amount:amount,targets:finishFeatureTargets(type)});
  }catch(error){
    console.warn("approximate finish preview failed:",error);
    return [];
  }
  return shapes.map(function(shape,index){
    return Object.assign({},shape,{
      id:"preview:"+type+":approx:"+index,
      featureId:"preview:"+type+":approx",
      previewOnly:true,approximate:true,
      name:tf("approxPreviewName",{feature:featureTypeLabel(type)}),
      color:type==="shell"?"#43a6c9":"#7567e8",
      opacity:.72,metal:.04,rough:.7,
    });
  });
}

/* Exact finish previews are debounced so dragging a radius scrubber does not
   queue a kernel build for every pointer event.  The source body remains
   untouched and the latest token alone is allowed to replace the preview. */
async function exactFinishPreviewBody(preview,type,onProgress) {
  /* Draft belongs here too: on a merged body its faces (HOUSING's Shell1 rim
     and wall) exist only on the rebuilt display body, never on the analytic
     part exactBrepForPart would rebuild, so the preview stayed "unavailable"
     and OK stayed disabled. */
  if(!isCanonicalAuthoring() || !["fillet","chamfer","shell","dome","draft"].includes(type))return exactBrepForPart(preview);
  var operation=preview.exactOperations[preview.exactOperations.length-1];
  if(cadWorkerAvailable())return finishInCadWorker(E.def,cutTargetFeatureId(preview,E.def),type,operation,{onProgress});
  var display=await exactDisplayBody(preview);
  try{
    var registry=createTopologyRegistry(display.brep.topology || []);
    var rebind=function(reference){
      var descriptor=cloneData(reference.descriptor || {});delete descriptor.semantic;
      var resolution=resolveTopologyReference({persistentId:reference.persistentId,kind:reference.kind,descriptor:descriptor},registry,{threshold:.05});
      if(!resolution.topology || ['missing','ambiguous'].includes(resolution.status)){
        throw new Error("The selected geometry could not be matched to the rebuilt body");
      }
      return resolution.topology;
    };
    var targets=operation.targets.map(function(reference){return operation.params?.fullRound ? resolveFinishFace(reference,display.brep.topology) : rebind(reference);});
    var neutral=type==='draft' && operation.params && operation.params.neutralFace ? rebind(operation.params.neutralFace) : null;
    var options={...operation.params,edgePersistentIds:targets.filter(function(item){return item.kind==='edge';}).map(function(item){return item.persistentId;}),facePersistentIds:targets.filter(function(item){return item.kind==='face' && (!neutral || item.persistentId!==neutral.persistentId);}).map(function(item){return item.persistentId;})};
    if(neutral)options.neutralFaceId=neutral.persistentId;
    var finishOperation=type==='draft'?draftBrep:type==='dome'?domeBrep:type==='fillet'?filletBrep:type==='shell'?shellBrep:chamferBrep;
    return await finishOperation(display.brep,operation.amount,options);
  }finally{display.release();}
}

function queueExactFeaturePreview(preview,type,liveBadge) {
  cancelCadWorkerWork('finish');
  var token=(E._featurePreviewToken || 0)+1;E._featurePreviewToken=token;
  var sourceDocument=E.def,sourceHistorySignature=finishPreviewHistorySignature();
  if(E._featureExactPreviewTimer)clearTimeout(E._featureExactPreviewTimer);
  /* Two different claims: with an approximation on screen the badge must not
     say the views are synced or exact — it says the picture is approximate. */
  E.authoring.finishPreviewStatus="pending";
  syncContextActions();
  var approximate=!!(E.authoring && E.authoring.approxFinishPreview);
  if(liveBadge){liveBadge.classList.add("on");liveBadge.classList.toggle("approx",approximate);liveBadge.setAttribute("data-preview-state",approximate?"approximate":"calculating");
    liveBadge.innerHTML=approximate?'<i class="ph ph-scribble-loop"></i> '+t("liveApproxPreview"):'<i class="ph ph-spinner-gap"></i> '+t("liveExactCalc")+" "+type+"…";}
  E._featureExactPreviewTimer=setTimeout(async function(){
    E._featureExactPreviewTimer=0;var brep=null;
    try{
      brep=await exactFinishPreviewBody(preview,type,function(progress){
        if(token!==E._featurePreviewToken || !liveBadge)return;
        liveBadge.textContent="Computing exact "+type+" · "+(progress.name || progress.stage);
      });
      if(brep.approximate || brep.invalid)throw new Error(brep.approximate || "The exact finish is invalid");
      var meshData=await shapeToMeshData(brep,{deflection:.24,angle:.16});
      meshData.topology=cloneData(brep.topology || []);
      if(token!==E._featurePreviewToken || !E.authoring || !finishPreviewIsLive(preview))return;
      preview.meshData=meshData;preview.exactError=null;
      preview.verifiedProof={document:sourceDocument,type,sourceId:preview.id,token,
        historySignature:sourceHistorySignature,params:cloneData(preview.exactOperations.at(-1)?.params),
        targets:cloneData(preview.exactOperations.at(-1)?.targets)};
      E.authoring.finishPreviewStatus="ready";
      syncContextActions();
      adoptExactFinishPreview(preview);   // the approximation has served its purpose
      refreshLivePreview();renderPreview();
      if(liveBadge){liveBadge.title="";liveBadge.classList.remove("approx");liveBadge.setAttribute("data-preview-state","exact");liveBadge.innerHTML='<i class="ph ph-broadcast"></i> '+t("liveExactReady");liveBadge.classList.add("pulse");setTimeout(function(){liveBadge.classList.remove("pulse");},180);}
    }catch(error){
      if(token!==E._featurePreviewToken)return;
      /* The kernel refused this radius/thickness. Keeping the approximation up
         would show a body that cannot be built, so it goes and the untouched
         source comes back — today's behaviour — with the reason in the badge. */
      if(E.authoring && E.authoring.approxFinishPreview){adoptExactFinishPreview(preview);refreshLivePreview();renderPreview();}
      E.authoring.finishPreviewStatus="error";
      syncContextActions();
      preview.exactError=String(error && error.message || error);
      console.warn("exact feature preview failed:",preview.exactError);
      if(liveBadge){
        var message=preview.exactError;
        var caption=/no resolved edges/i.test(message)?t("previewNoResolvedEdges"):/fillet failed/i.test(message)?t("previewFilletConflict"):/chamfer failed/i.test(message)?t("previewChamferConflict"):type==="shell"?"Shell could not be built · check thickness and opening faces":t("previewUnavailable");
        liveBadge.classList.remove("approx");liveBadge.setAttribute("data-preview-state","error");
        liveBadge.innerHTML='<i class="ph ph-warning"></i> '+caption;
        if(type==='shell' || (type==='fillet' && (activeFilletParams()?.fullRound || /valid closed solid/.test(message))))liveBadge.appendChild(document.createTextNode(' · '+message));
        liveBadge.title=message;   // the caption is a guess; keep the real reason reachable
      }
    }finally{if(brep)disposeBrep(brep);}
  },90);
}

function syncMergedPatternPreview(seed,params,instances,liveBadge) {
  var previous=E.authoring.mergedPatternPreview;
  E.authoring.mergedPatternPreview=null;
  if(!params || !params.mergeResult || !seed || !(instances || []).length || !partSupportsExactMesh(seed)){
    // merge off (or a body the kernel cannot rebuild): the copies are the whole
    // answer, so the badge must stop claiming anything about a fuse
    if(liveBadge && previous){liveBadge.classList.remove("approx");liveBadge.removeAttribute("data-preview-state");}
    return;
  }
  var token=(E._featurePreviewToken || 0)+1;E._featurePreviewToken=token;
  E.authoring.mergedPatternPreview={token:token,state:"approximate",bodies:instances.length+1,fused:0};
  patternMergePreviewBadge(liveBadge,"approximate","ph-scribble-loop",t("livePatternMergeCheck"));
  if(E._featureExactPreviewTimer)clearTimeout(E._featureExactPreviewTimer);
  E._featureExactPreviewTimer=setTimeout(function(){
    E._featureExactPreviewTimer=0;
    runMergedPatternPreview(seed,params,instances,liveBadge,token);
  },PATTERN_MERGE_PREVIEW_DELAY);
}

function patternMergePreviewBadge(liveBadge,state,icon,text) {
  if(!liveBadge)return;
  liveBadge.classList.add("on");liveBadge.classList.toggle("approx",state==="approximate");
  liveBadge.setAttribute("data-preview-state",state);
  liveBadge.innerHTML='<i class="ph '+icon+'"></i> '+text;
}

/* The form may have been dismissed, retyped or pointed at another body while
   the kernel worked; only the run the form is still waiting for may draw. */
function mergedPatternPreviewIsLive(token) {
  var pending=E.authoring && E.authoring.mergedPatternPreview;
  return !!(pending && pending.token===token && E.authoring.featureType==="pattern" && E._featurePreviewToken===token);
}

/* A fused cluster as a preview body: the kernel's mesh and nothing else. Every
   instance was placed in WORLD coordinates before the union, so this body must
   carry no pattern rotation of its own — buildPart would apply it a second
   time — and no profile, which the mesh has already superseded. */
function mergedPatternPreviewBody(seed,meshData,index) {
  var id="preview:pattern:merge:"+index;
  /* kind "mesh": the tessellation is the whole body, and basePartBounds reads a
     mesh body's box off the positions it already has. */
  return {id:id,featureId:id,previewOnly:true,merged:true,kind:"mesh",meshData:meshData,
    color:seed.color,opacity:.62,metal:seed.metal,rough:seed.rough,
    name:featureTypeLabel("pattern")};
}

async function runMergedPatternPreview(seed,params,instances,liveBadge,token) {
  var source=patternMergeSource(seed),members=[{part:seed,transform:PATTERN_IDENTITY_PLACEMENT}].concat(instances);
  var base=null,placed=[];
  try{
    base=await exactBrepForPart(source);
    for(var i=0;i<members.length;i++)placed.push(await placeBrep(base,members[i].transform));
    var groups=await brepConnectedGroups(placed.map(function(brep,at){return {brep:brep,bounds:partBounds(members[at].part)};}));
    var clusters=groups.filter(function(group){return group.length>1;});
    if(!mergedPatternPreviewIsLive(token))return;
    if(!clusters.length){
      E.authoring.mergedPatternPreview={token:token,state:"exact",bodies:members.length,fused:0};
      patternMergePreviewBadge(liveBadge,"exact","ph-broadcast",t("livePatternMergeApart"));
      return;
    }
    var bodies=[],absorbed=[];
    for(var c=0;c<clusters.length;c++){
      var group=clusters[c],solid=null;
      for(var k=1;k<group.length;k++){
        var next=await booleanBrep("union",solid || placed[group[0]],placed[group[k]]);
        if(solid)disposeBrep(solid);
        solid=next;
      }
      var welded=await unifyBrepFaces(solid);disposeBrep(solid);solid=welded;
      try{
        var meshData=await shapeToMeshData(solid,{deflection:.24,angle:.16});
        meshData.topology=cloneData(solid.topology || []);
        bodies.push(mergedPatternPreviewBody(seed,meshData,c));
      }finally{disposeBrep(solid);}
      group.forEach(function(at){absorbed.push(members[at].part);});
    }
    if(!mergedPatternPreviewIsLive(token))return;
    /* The fused clusters REPLACE the copies they are made of; a copy that met
       nothing stays exactly as it was laid, and the seed is a real body of the
       document that was never a preview part in the first place. */
    E.authoring.previewParts=(E.authoring.previewParts || []).filter(function(part){return !absorbed.includes(part);}).concat(bodies);
    var fused=absorbed.length-clusters.length;
    E.authoring.mergedPatternPreview={token:token,state:"exact",bodies:members.length-fused,fused:fused};
    patternMergePreviewBadge(liveBadge,"exact","ph-broadcast",tf("livePatternMergeReady",{bodies:members.length-fused}));
    refreshLivePreview();renderPreview();
  }catch(error){
    if(!mergedPatternPreviewIsLive(token))return;
    /* The un-merged copies stand — they are what Apply would leave behind too
       when the fuse fails — and the badge stops claiming a merge is coming. */
    console.warn("merged pattern preview failed:",error);
    E.authoring.mergedPatternPreview={token:token,state:"error",error:String(error && error.message || error)};
    patternMergePreviewBadge(liveBadge,"error","ph-warning",t("livePatternMergeFail"));
    if(liveBadge)liveBadge.title=String(error && error.message || error);
  }finally{
    placed.forEach(function(copy){disposeBrep(copy);});
    if(base)disposeBrep(base);
  }
}

/* Copy exactly the fields a preview path writes and share the rest.
   `normals`, `colors` and `subshapeMap` are the expensive buffers and NOTHING
   between here and Apply writes them, so they ride by reference — that is the
   whole speed win. `positions` cannot: it is a plain Array (cad_kernel.js
   deliberately keeps it one so saveLib()'s JSON.stringify does not turn it into
   {"0":..}), Array.isArray() therefore passes, and movePart() — which every
   pattern ghost reaches through placePatternCopy — adds dx/dy/dz into it in
   place. Sharing it translated the SEED'S committed geometry once per ghost per
   keystroke. `topology` is written just as deeply (resetClonedPartIdentity
   remaps ownerFeatureId/persistentId, movePart shifts descriptor
   origin/center/endpoints/bounds) and `faceRanges[].persistentId` likewise, so
   both stay deep clones. The projection and topology caches are WeakMaps keyed
   on the meshData object; this returns a fresh one, so clearing the ghost's
   entry cannot evict the seed's. */
function clonedPartMeshData(mesh) {
  if (!mesh) return null;
  return Object.assign({}, mesh, {
    positions: (mesh.positions || []).slice(),
    topology: cloneData(mesh.topology || []),
    faceRanges: cloneData(mesh.faceRanges || []),
    bounds: mesh.bounds ? Object.assign({}, mesh.bounds) : mesh.bounds,
    exactBounds: mesh.exactBounds ? cloneData(mesh.exactBounds) : mesh.exactBounds,
  });
}

function clonePartWithoutTessellationCopy(seed) {
  if (!seed) return null;
  var mesh = seed.meshData;
  try {
    if (mesh) seed.meshData = null;
    var copy = cloneData(seed);
    if (mesh) copy.meshData = clonedPartMeshData(mesh);
    return copy;
  } finally {
    if (mesh) seed.meshData = mesh;
  }
}

/* Pattern and mirror ghosts are rigid copies of a body already on screen.
   structuredClone of its Float32Array normal/colour buffers is what froze the
   editor on every count/spacing keystroke; clonedPartMeshData shares those and
   copies only what the ghost writes. */
function clonePartForLivePreview(seed) {
  return resetClonedPartIdentity(clonePartWithoutTessellationCopy(seed));
}

function syncNewFeaturePreview(type,state,liveBadge) {
  var previews=[];
  E.authoring.previewReplacesPartId=null;
  E.authoring.patternOverlap=false;
  if(type==="hole"){
    var holeTarget=selectedSolid(),holeSketch=ensureSketch(E.def),holeProfile=closedSketchProfile(),holePreviewParams={...state.params};
    if(!holePreviewParams.layout || holePreviewParams.layout==="sketch"){
      var previewPositionIds=holePositionPointIds(holeSketch);
      if(previewPositionIds.length){holePreviewParams.holePositionPointIds=previewPositionIds;holeProfile={entityIds:[]};}
    }
    if(holeTarget && holeProfile){
      try{
        var holeBounds=partBounds(holeTarget),holeRecords=holeCutRecords(holePreviewParams,holeSketch,holeProfile.entityIds,E.def);
        previews=holePreviewParts(holeRecords,{min:{x:holeBounds.x0,y:holeBounds.y0,z:holeBounds.z0},max:{x:holeBounds.x1,y:holeBounds.y1,z:holeBounds.z1}}).map(function(part,i){return {...part,id:"preview:hole:"+i,previewOnly:true,color:"#d75a4a",opacity:.42,metal:.04,rough:.68,name:"Hole cutter"};});
      }catch(error){if(liveBadge)liveBadge.textContent=String(error.message || error);}
    }
  } else if(type==="extrude"||type==="extrudeCut"){
    previews.push.apply(previews,extrudePreviewParts(type,state.params));
  } else if(type==="revolve"||type==="revolveCut"){
    /* The cut shows the tool it will remove, in the cut colour, the way
       extrudePreviewParts draws a red prism for Extrude Cut. */
    var revCut=type==="revolveCut";
    try{
      var geometry=selectedRevolve({...state.params,axisReference:state.references.axis}).projection;
      previews.push({...geometry,id:"preview:revolve",featureId:"preview:revolve",previewOnly:true,kind:"rev",x:0,z:0,seg:48,color:revCut?"#d75a4a":"#6f8de8",opacity:revCut?.42:.62,metal:.04,rough:.68,name:"Live "+featureTypeLabel(type)});
      if(liveBadge)liveBadge.textContent=t("livePreviewReady");
    }catch(error){if(liveBadge)liveBadge.textContent=String(error.message||error);}
  } else if(type==="pattern"){
    var seed=selectedSolid(),count=Math.max(2,Math.min(100,Math.round(Number(state.params.count)||2))),circularStep=circularPatternStepDegrees(state.params,count)*Math.PI/180,placements=patternPlacements(state.params),patternInstances=[];
    if(seed && state.params.scope!=="feature")placements.forEach(function(placement,index){var copy=clonePartForLivePreview(seed);copy.previewOnly=true;copy.id="preview:pattern:"+(index+1);copy.featureId=copy.id;copy.opacity=.52;placePatternCopy(copy,state.params,placement,circularStep);copy.patternGridIndex=placement.indices;previews.push(copy);patternInstances.push({part:copy,transform:patternPlacementTransform(state.params,placement,circularStep)});});
    if(seed && !state.params.mergeResult) {
      var members=[seed].concat(previews), bounds=members.map(partBounds), overlapping=new Set();
      bounds.forEach(function(a,i){ bounds.slice(i+1).forEach(function(b,j){
        if(a && b && boundsMayOverlap(a,b)){ overlapping.add(i); overlapping.add(i+j+1); }
      }); });
      E.authoring.patternOverlap=overlapping.size>0;
      previews.forEach(function(copy,i){if(overlapping.has(i+1)){copy.color="#d0342c";copy.opacity=.52;}});
    }
  } else if(type==="mirror"){
    var source=selectedSolid();if(source){var plane=state.references && state.references.plane || "plane:right",copy=mirrorProjectionPart(clonePartForLivePreview(source),plane);if(copy){copy.previewOnly=true;copy.id="preview:mirror";copy.featureId=copy.id;copy.opacity=.52;previews.push(copy);}}
  } else if(FINISH_FEATURES.includes(type)){
    var finish=exactFinishPreviewPart(type,state);
    if(finish){
      E.authoring.previewReplacesPartId=finish.id;
      /* Approximate first, exact when it lands.  Only one of the two is ever in
         the scene: drawing both made the old exact fillet flicker against the
         sharp body underneath, and an approximation is no different. */
      var approximate=approximateFinishPreviewParts(type,state,finish);
      E.authoring.approxFinishPreview=approximate.length?approximate:null;
      E.authoring.pendingExactPreview=finish;
      if(approximate.length)previews.push.apply(previews,approximate);
      else previews.push(finish);
    }
  }
  if(type==="thread" && liveBadge){liveBadge.classList.toggle("on",!!selectedThreadStart());liveBadge.textContent=selectedThreadStart()?"✓ "+t("selectedLabel")+" · "+t("opThread"):t("threadNeed");}
  if(!FINISH_FEATURES.includes(type)){E.authoring.approxFinishPreview=null;E.authoring.pendingExactPreview=null;}
  E.authoring.previewParts=previews;
  if(finish)queueExactFeaturePreview(finish,type,liveBadge || E.authoring.featurePreviewBadge);
  if(type==="pattern") { syncMergedPatternPreview(seed,state.params,patternInstances,liveBadge || E.authoring.featurePreviewBadge); syncPatternOverlapBadge(liveBadge || E.authoring.featurePreviewBadge); }
}

function syncPatternOverlapBadge(badge) {
  if (!badge) return;
  if (!E.authoring.patternOverlap) {
    badge.removeAttribute("title");
    if(!E.authoring.mergedPatternPreview){badge.classList.add("on");badge.textContent=t("liveViewsSynced");}
    return;
  }
  badge.classList.add("on");
  badge.textContent=t("livePatternOverlap");
  badge.title=t("livePatternOverlapHint");
}

/* The exact body may be standing in previewParts already, or may still be
   waiting behind an approximation; either way it is the preview this run owns. */
function finishPreviewIsLive(preview) {
  if(!E.authoring)return false;
  return (E.authoring.previewParts || []).includes(preview) || E.authoring.pendingExactPreview===preview;
}

function finishPreviewHistorySignature() {
  return JSON.stringify({features:E.def.features || [],sketches:E.def.sketches || []});
}

function readyShellPreviewMatches(params) {
  var preview=E.authoring?.pendingExactPreview,operation=preview?.exactOperations?.at(-1);
  return E.authoring?.finishPreviewStatus==="ready" && preview?.meshData && finishPreviewIsLive(preview)
    && finishPreviewProofMatches(preview.verifiedProof,{
      document:E.def,type:"shell",sourceId:selectedSolid()?.id,token:E._featurePreviewToken,
      historySignature:finishPreviewHistorySignature(),params,targets:finishFeatureTargets("shell"),
    }) && operation?.type==="shell";
}

/* Retire the approximation in favour of the exact body it stood in for. */
function adoptExactFinishPreview(preview) {
  if(!E.authoring)return;
  if(!(E.authoring.previewParts || []).includes(preview))E.authoring.previewParts=[preview];
  E.authoring.approxFinishPreview=null;
}

function queueNewFeaturePreview(type,state,liveBadge) {
  if (FINISH_FEATURES.includes(type)) { E.authoring.finishPreviewStatus="pending"; syncContextActions(); }
  if(E._featurePreviewFrame)cancelAnimationFrame(E._featurePreviewFrame);
  E._featurePreviewFrame=requestAnimationFrame(function(){E._featurePreviewFrame=0;syncNewFeaturePreview(type,state,liveBadge);refreshLivePreview();
    // a merged pattern's badge is owned by its own fuse pass: overwriting it
    // here would claim the views are synced while the copies are still unfused
    // A rejected revolve has no ghost and its badge explains the invalid axis.
    if((type==="revolve" || type==="revolveCut") && !E.authoring.previewParts.length)return;
    if(liveBadge && type!=="thread" && !E.authoring.patternOverlap && !FINISH_FEATURES.includes(type) && !(E.authoring && E.authoring.mergedPatternPreview)){liveBadge.classList.add("on");liveBadge.innerHTML='<i class="ph ph-broadcast"></i> '+t("liveViewsSynced");}});
}

function finishSelectionMessage(type) {
  var targets=finishFeatureTargets(type),count=targets.length;
  var required=FACE_DRIVEN_OPERATIONS.has(type)?"face":(targets.every(function(reference){return reference.kind==="face";})?"face":targets.every(function(reference){return reference.kind==="edge";})?"edge":"reference");
  if(!selectedSolid())return t("selectSolidFirst");
  if(!count)return (type==="dome"?"Select one circular planar face":type==="draft"?t("selectFaceDraft"):type==="thicken"?t("selectFaceThicken"):type==="shell"?t("selectFaceRemove"):t("selectEdges"))+" "+t("addWithCtrl");
  return "✓ "+count+" "+required+(count===1?"":"s")+" "+t("selectedLabel")+" · "+t("livePreviewDrag");
}

function syncActiveFeatureSelectionFeedback() {
  if(!root || !E.authoring || !E.authoring.featureType)return;
  if(E.authoring.featurePreviewState?.syncFinishBodyTarget)E.authoring.featurePreviewState.syncFinishBodyTarget();
  if(E.authoring.featurePreviewState?.syncTerminatingFace)E.authoring.featurePreviewState.syncTerminatingFace();
  if(E.authoring.featurePreviewState?.syncShellThicknesses)E.authoring.featurePreviewState.syncShellThicknesses();
  var note=root.querySelector("#mdQuickSettings [data-live-selection]");
  if(!note)return;
  var type=note.getAttribute("data-live-selection");
  note.textContent=FINISH_FEATURES.includes(type)?finishSelectionMessage(type)
    :type==="thread"?(selectedThreadStart()?"✓ "+t("selectedLabel")+" · "+t("opThread"):t("threadNeed"))
    :collectingEndFace()?(((E.topologySelection||[]).some(function(item){return item.kind==="face";})?"✓ ":"")+t("upToFacePick"))
    :["extrude","extrudeCut","revolve","revolveCut","sweep","sweepCut","loft","hole"].includes(type)?selectedSketchIds().length+" "+t("sketchesSelected"):selectedFeatureIds().length+" "+t("featuresSelected")+" · "+(E.topologySelection || []).length+" "+t("topologyRefs");
  note.classList.toggle("ready",note.textContent.indexOf("✓")===0);
  if(type==="thread" && E.authoring.featurePreviewBadge){E.authoring.featurePreviewBadge.textContent=note.textContent;E.authoring.featurePreviewBadge.classList.toggle("on",!!selectedThreadStart());}
  /* Shell has no edge list to render, but it is just as much a collector — and
     the one whose picks were being silently dropped, since an edge clicked
     during Shell lands in the selection and finishFeatureTargets() then keeps
     only faces. commandSelectionPrefer() now stops the edge being acquired at
     all; this says which kind the command is waiting for. */
  note.classList.toggle("is-collecting",FINISH_FEATURES.includes(type)||collectingEndFace());
  note.setAttribute("data-collector-kind",(FACE_DRIVEN_OPERATIONS.has(type)||collectingEndFace())?"face":"edge");
  renderFinishEdgeList();
  if(type==="pattern"){
    var selected=selectedSolid(),selectionId=selected && selected.id || null;
    if(E.authoring._patternPreviewSelectionId!==selectionId){E.authoring._patternPreviewSelectionId=selectionId;syncNewFeaturePreview(type,E.authoring.featurePreviewState || {params:featureDefaults("pattern"),references:{}},E.authoring.featurePreviewBadge);refreshLivePreview();drawSketch();}
  }
}

function addFinishScrubber(host,type,controls) {
  var key=type==="fillet"?"radius":type==="chamfer"?"distance":type==="shell"?"thickness":null;
  if(!key)return;
  var control=controls.find(function(item){return item.field.key===key;}),part=selectedSolid();
  if(!control || !part)return;
  var b=partBounds(part),limit=Math.max(featureControlValue(control)||1,maxFinishAmount(b));
  var wrap=el("label","md-feature-scrubber");wrap.appendChild(el("span","",'<i class="ph ph-arrows-left-right"></i> '+t("dragForLive")));
  var range=el("input"),step=Number(control.field.step)||.1;range.type="range";range.min=String(Math.max(Number(control.field.min)||step,step));range.max=String(Math.max(limit,featureControlValue(control)||1));range.step=String(step);range.value=control.input.value;wrap.appendChild(range);
  range.addEventListener("input",function(){control.input.value=range.value;control.input.dispatchEvent(new Event("input",{bubbles:true}));});
  control.input.addEventListener("input",function(){var value=featureControlValue(control);if(Number.isFinite(value)){if(value>Number(range.max))range.max=String(value);range.value=String(value);}});
  var note=host.querySelector(".md-feature-selection-note");host.insertBefore(wrap,note || null);
}

/* A face sketch may enclose several independent regions (three concentric
   circles enclose a ring and a centre disk). Let the boss PropertyManager
   choose the material by region, even after Finish sketch has hidden the 2D
   canvas. Empty selection deliberately means the usual all-contour workflow. */
function addBossContourChoices(host,state,liveBadge) {
  var areas=sketchFeatureAreas(true);
  if(areas.length<2)return;
  var picker=el("fieldset","md-contour-picker");
  picker.appendChild(el("legend","",t("featureContours")));
  var hint=el("small","",t("featureContoursHint"));picker.appendChild(hint);
  var choices=el("div","md-contour-choices");picker.appendChild(choices);
  var all=btn(t("featureAllContours"),function(){state.contourKeys=[];sync();},"md-contour-choice");
  choices.appendChild(all);
  var choicesByArea=areas.map(function(area,index){
    var key=featureContourKey(area);
    var label=t("featureContour")+" "+(index+1)+(area.holes.length?" · "+t("featureRing"):"");
    var button=btn(label,function(){
      var active=state.contourKeys || [];
      state.contourKeys=active.includes(key)?active.filter(function(item){return item!==key;}):active.concat(key);
      sync();
    },"md-contour-choice");
    choices.appendChild(button);
    return {key:key,button:button};
  });
  function renderSelection(){
    all.setAttribute("aria-pressed",String(!state.contourKeys.length));
    choicesByArea.forEach(function(choice){choice.button.setAttribute("aria-pressed",String(state.contourKeys.includes(choice.key)));});
  }
  function sync(){
    renderSelection();
    syncNewFeaturePreview("extrude",state,liveBadge);refreshAll();
  }
  renderSelection();
  host.insertBefore(picker,host.querySelector(".md-feature-group") || host.querySelector(".md-feature-selection-note") || null);
}

function rememberFinishAmount(type, params) {
  var key = REPEATABLE_AMOUNT[type];
  if (!key || !params || !fin(Number(params[key]))) return;
  E.lastFinishAmount = Object.assign({}, E.lastFinishAmount);
  E.lastFinishAmount[type] = Number(params[key]);
}

function addTerminatingFaceChoices(host,type,state,liveBadge,controls) {
  if(type!=="extrude" && type!=="extrudeCut")return null;
  var inactive=new Set();
  (E.def.history || []).forEach(function(entry,index){
    if(entry.suppressed || historyEntryRolled(E.def,index))inactive.add(entry.targetId);
  });
  var history=(E.def.features || []).filter(function(feature){return !feature.suppressed && !inactive.has(feature.id);});
  var allowed=new Set(history.map(function(feature){return feature.id;}));
  var choices=planarMateFaceChoices(activeParts(E.def).flatMap(topologyEntriesForPart).filter(function(entry){
    var owner=String(entry.ownerFeatureId || "");
    return allowed.has(owner) || history.some(function(feature){return owner.startsWith(feature.id+":");});
  }),history,modelLengthUnit());
  var row=el("label","md-row md-row-wide"),select=document.createElement("select");
  row.appendChild(el("span","t",t("terminatingFace")));
  select.setAttribute("aria-label",t("terminatingFace"));
  var placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=t("terminatingFace");select.appendChild(placeholder);
  choices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;select.appendChild(option);});
  row.appendChild(select);host.appendChild(row);
  state.syncTerminatingFace=function(){
    row.hidden=!isUpToFace(state.params.endCondition);
    var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
    select.value=face?.persistentId || "";
  };
  select.addEventListener("change",function(){
    var chosen=choices.find(function(choice){return choice.entry.persistentId===select.value;});
    // Selecting a terminating face changes only the extrusion reference. In
    // particular it must not activate the sketch that produced that face.
    E.topologySelection=chosen ? canonicalFeatureTopologyReferences(E.def,[topologyReferenceFromEntry(chosen.entry)]) : [];
    E.collectingFeature=false;
    syncActiveFeatureSelectionFeedback();
    queueNewFeaturePreview(type,state,liveBadge);
  });
  var endControl=(controls || []).find(function(control){return control.field.key==="endCondition";});
  if(endControl)endControl.input.addEventListener("change",state.syncTerminatingFace);
  state.syncTerminatingFace();
  return row;
}

function addShellFaceThicknessControls(host,state,onChange,editedFeature=null,openingIds=null) {
  if(state.type!=="shell")return null;
  var form=E.quickFormInstance,cachedEntries=null,cachedDocument=null,cachedHead=null;
  var sourceHead=function(){return editedFeature?.inputs?.[0] || cutTargetFeatureId(selectedSolid());};
  var entries=function(){
    var head=sourceHead();
    if(cachedEntries && cachedDocument===E.def && cachedHead===head)return cachedEntries;
    var compiled=compileKernelFeatureTree(E.def);
    return (compiled.ok && verifiedExactTopology(E.def,compiled.features).get(head))
      || E.brepRun?.results?.get(head)?.topology
      || (!editedFeature && selectedSolid() ? authoritativeFinishTopology(selectedSolid()) : []) || [];
  };
  var openingBrowser=createShellOpeningFaceBrowser(host,{
    el:el,btn:btn,getEntries:entries,
    getSelected:function(){return editedFeature ? editedFeature.references?.topology || [] : finishFeatureTargets("shell");},
    label:function(entry){
      var d=entry.descriptor || {},o=d.origin || d.center,n=d.normal || d.axis;
      return (d.surface || "Face")+(o?" · center ("+[o.x,o.y,o.z].map(function(v){return modelLengthText(v,8);}).join(", ")+") "+modelLengthUnit():"")
        +(n?" · "+(d.normal?"normal":"axis")+" ("+[n.x,n.y,n.z].map(function(v){return Number(v).toFixed(3);}).join(", ")+")":"");
    },
    onChange:function(faces){
      var refs=faces.map(function(face){return topologyReferenceFromEntry(face);});
      if(!editedFeature){setFinishEdges(refs);return;}
      editedFeature.references.topology=cloneData(refs);E.topologySelection=cloneData(refs);
      (E.def.parts || []).forEach(function(part){(part.exactOperations || []).forEach(function(operation){if(operation.id===editedFeature.id)operation.targets=cloneData(refs);});});
      onChange();if(editor)editor.sync();
    },
  });
  var editor=createShellFaceThicknessEditor(host,{
    el:el,btn:btn,field:featureField,t:t,unit:modelLengthUnit(),getParams:function(){return state.params;},
    getChoices:function(){return planarMateFaceChoices(entries().filter(function(entry){return entry.descriptor?.surface==="plane";}),E.def.features || [],modelLengthUnit());},
    getOpeningIds:openingIds || function(){return (editedFeature ? editedFeature.references?.topology || [] : finishFeatureTargets("shell")).map(function(ref){return ref.persistentId;});},
    onChange:onChange,
    refresh:async function(){
      var documentAtStart=E.def,headAtStart=sourceHead(),compiled=compileKernelFeatureTree(E.def);
      if(!compiled.ok || !headAtStart)throw new Error("Choose the source body before refreshing retained faces");
      var stage=editedFeature ? featureInputStage(compiled,editedFeature) : {document:{...compiled.document,features:compiled.features},head:headAtStart};
      var result=await topologyInCadWorker(stage.document,stage.head,{onProgress:function(progress){flash("Refreshing retained faces · "+(progress.name || progress.stage));}});
      if((form && !form.isCurrent()) || E.def!==documentAtStart || sourceHead()!==headAtStart || E.authoring.featureType!=="shell")throw new Error("Shell source changed; reopen the command before choosing retained faces");
      cachedEntries=result.topology;cachedDocument=documentAtStart;cachedHead=headAtStart;
      openingBrowser.sync();
    },
  });
  var readThicknesses=editor.read,syncThicknesses=editor.sync;
  editor.read=function(){openingBrowser.read();return readThicknesses();};
  editor.sync=function(){openingBrowser.sync();syncThicknesses();};
  if(!editedFeature)state.syncShellThicknesses=editor.sync;
  return editor;
}

function addThinExtrudeChainChoices(host,type,state,liveBadge,controls) {
  if(type!=="extrude" && type!=="extrudeCut")return;
  var sketch=ensureSketch(E.def),chains=analyzeSketchChains(sketch).chains;
  if(chains.length<2)return;
  var selected=E.sselAuto?[]:selEntities().map(function(entity){return entity.id;});
  state.thinChainKeys=chains.filter(function(chain){return chain.entityIds.some(function(id){return selected.includes(id);});}).map(function(chain){return thinExtrudeChainKey(chain.entityIds);});
  var picker=el("fieldset","md-contour-picker");
  picker.appendChild(el("legend","",t("thinChains")));
  picker.appendChild(el("small","",t("thinChainsHint")));
  var all=btn(t("featureAllContours"),function(){state.thinChainKeys=[];sync();},"md-contour-choice");picker.appendChild(all);
  var choices=chains.map(function(chain,index){
    var key=thinExtrudeChainKey(chain.entityIds),row=el("label","md-row md-row-wide");
    var button=btn(t("thinChain")+" "+(index+1),function(){var keys=state.thinChainKeys;state.thinChainKeys=keys.includes(key)?keys.filter(function(item){return item!==key;}):keys.concat(key);sync();},"md-contour-choice");
    row.appendChild(button);
    var side=document.createElement("select");side.setAttribute("aria-label",t("thinChain")+" "+(index+1)+" · "+t("thinChainSide"));
    [["",t("thinChainDefault")],["mid-plane",t("thinChainCentered")],["forward",t("thinChainOneSide")],["reverse",t("thinChainOtherSide")]].forEach(function(choice){var option=document.createElement("option");option.value=choice[0];option.textContent=choice[1];side.appendChild(option);});
    side.value=state.params.thinChainModes?.[key] || "";
    side.addEventListener("change",function(){state.params.thinChainModes={...state.params.thinChainModes};if(side.value)state.params.thinChainModes[key]=side.value;else delete state.params.thinChainModes[key];sync();});
    row.appendChild(side);picker.appendChild(row);return {key:key,button:button};
  });
  function render(){picker.hidden=!state.params.thinFeature;all.setAttribute("aria-pressed",String(!state.thinChainKeys.length));choices.forEach(function(choice){choice.button.setAttribute("aria-pressed",String(state.thinChainKeys.includes(choice.key)));});}
  function sync(){render();queueNewFeaturePreview(type,state,liveBadge);}
  var control=(controls || []).find(function(item){return item.field.key==="thinFeature";});if(control)control.input.addEventListener("change",render);
  host.appendChild(picker);render();
}

function finishBodyTargetChoices() {
  return activeParts(E.def).filter(partSupportsExactMesh).map(function(part){
    var head=cutTargetFeatureId(part),feature=(E.def.features || []).find(function(item){return item.id===head;});
    return {part:part,value:part.id,head:head,label:(part.name || part.id)+(feature?" · "+feature.name:"")};
  }).filter(function(choice){return !!choice.head;});
}

function finishBodyForTreeSelection(choices,selectedIds) {
  if(selectedIds.length!==1)return null;
  var features=new Map((E.def.features || []).map(function(feature){return [feature.id,feature];}));
  var reaches=function(id,wanted,seen){
    if(id===wanted)return true;if(seen.has(id))return false;seen.add(id);
    return (features.get(id)?.inputs || []).some(function(input){return reaches(dependencyReferenceId(input),wanted,seen);});
  };
  var matches=choices.filter(function(choice){return reaches(choice.head,selectedIds[0],new Set());});
  return matches.length===1 ? matches[0].part : null;
}

function addFinishBodyTargetControl(host,type,state) {
  if(!FINISH_FEATURES.includes(type))return null;
  var choices=finishBodyTargetChoices(),selected=selectedSolid();
  if(!selected){
    selected=finishBodyForTreeSelection(choices,selectedFeatureIds());
    if(selected){E.sel=selected;E.ssel=[];E.topologySelection=[];E.authoring.finishEdgePool=[];}
  }
  var picker=featureField(host,{key:"$finishTargetBody",label:t("finishTargetBody"),type:"select",choices:[{value:"",label:t("finishChooseBody")}].concat(choices)},selected?.id || "");
  var hint=el("p","md-field-hint",t("finishTargetBodyHint"));host.appendChild(hint);
  picker.value=selected?.id || "";
  picker.addEventListener("change",function(){
    var chosen=finishBodyTargetChoices().find(function(choice){return String(choice.value)===picker.value;});
    E.sel=chosen?.part || null;E.ssel=[];E.topologySelection=[];E.authoring.finishEdgePool=[];
    E.authoring.featureSelection=[];
    syncActiveFeatureSelectionFeedback();
    queueNewFeaturePreview(type,state,E.authoring.featurePreviewBadge);refreshLivePreview();
  });
  state.syncFinishBodyTarget=function(){
    if(!selectedSolid()){
      var treeBody=finishBodyForTreeSelection(finishBodyTargetChoices(),selectedFeatureIds());
      if(treeBody){
        E.sel=treeBody;E.ssel=[];E.topologySelection=[];E.authoring.finishEdgePool=[];
        queueNewFeaturePreview(type,state,E.authoring.featurePreviewBadge);
      }
    }
    picker.value=selectedSolid()?.id || "";
  };
  return picker;
}

function registerFeatureForm(panel, action) {
  var authoring = E.authoring;
  var form = registerQuickForm(E, panel, action, function (leaving) {
    if (!leaving || authoring !== E.authoring) return;
    if (form.ownsDocument() && authoring.featureEdit) cancelFeatureParameterEdit(true);
    clearFeaturePreview(false);
    clearLiveDownstream(null);
    authoring.featureType = null;
    authoring.editFeatureId = null;
    authoring.featureEdit = null;
    E.collectingFeature = false;
  });
  // The detached subtree can still receive queued events, including events
  // on auxiliary pickers that have their own listeners.
  var content = el("div");
  content.style.display = "contents";
  panel.appendChild(content);
  for (var event of ["click","input","change","keydown","pointerdown"]) {
    content.addEventListener(event, function (e) {
      if (!form.isCurrent()) e.stopImmediatePropagation();
    }, true);
  }
  return {form, content};
}

/* The PropertyManager shape of openParametricFeature above, for the handful of
   ribbon commands that used to stop the page on a window.prompt(): the same
   #mdQuickSettings host, the same title card, the same featureField() rows and
   the same cancel/apply pair. `onLive` is optional — the operations that reach
   this helper edit sketch geometry rather than a solid, so most of them have
   nothing to preview until they are applied.
   `onApply` returning false keeps the panel open (bad input, or the operation
   refused), which is also why every one of these pushes its undo entry inside
   onApply: cancelling must leave the history untouched. */
/* The two double-click edits on a polygon, as forms rather than as the
   window.prompt() pair they used to be. Both keep the canvas live, so the
   geometry being dimensioned stays on screen while the number is typed. */
function cornerRoundForm(points, index) {
  openQuickForm({
    action: "cornerround",
    icon: "ph-corners-out",
    title: t("cornerRound"),
    hint: t("cornerRoundHint"),
    fields: [
      { key: "kind", label: t("cornerRoundKind"), type: "select", choices: [
        { value: "fillet", label: t("quickFillet") },
        { value: "chamfer", label: t("quickChamfer") },
      ] },
      { key: "amount", label: t("cornerRoundAmount"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: 5 },
    ],
    onApply: function (values) {
      var amount = Number(values.amount);
      if (!fin(amount) || amount <= 0) { flash(t("cornerRoundAmount")); return false; }
      pushUndo(t("opFillet"));
      var ok = values.kind === "chamfer" ? chamferVertex(points, index, amount) : filletVertex(points, index, amount);
      if (!ok) { H.discard(); flash(t("cornerRoundFailed")); return false; }
      return true;
    },
  });
}

function segmentLengthForm(from, to) {
  var current = Math.hypot(to.u - from.u, to.v - from.v);
  if (!(current > 0)) return;
  openQuickForm({
    action: "seglen",
    icon: "ph-ruler",
    title: t("segLen"),
    hint: t("segLenHint"),
    fields: [{ key: "length", label: t("segLen"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: Math.round(current * 10) / 10 }],
    onApply: function (values) {
      var length = Number(values.length);
      if (!fin(length) || length <= 0) return false;
      pushUndo(t("opSegLen"));
      var k = length / current;
      to.u = from.u + (to.u - from.u) * k;
      to.v = from.v + (to.v - from.v) * k;
      return true;
    },
  });
}

export {
  activeFilletParams, addBossContourChoices, addFinishBodyTargetControl,
  addFinishScrubber, addShellFaceThicknessControls, addTerminatingFaceChoices,
  addThinExtrudeChainChoices, adoptFinishEdgeSelection,
  authoritativeFinishTopology, cornerRoundForm, currentFinishEdges,
  edgeRefsForFaces, exactFinishPreviewBody, exactFinishPreviewPart,
  filletReferenceEndpoints, finishCommandActive, finishFeatureTargets,
  finishSelectionMessage, fullRoundActive, growSelectionFromDoubleClick,
  namedSelections, patternMergePreviewBadge, queueNewFeaturePreview,
  readyShellPreviewMatches, registerFeatureForm, rememberFinishAmount,
  renderFinishEdgeList, restoreNamedSelection, runSelectionOperation,
  saveNamedSelection, segmentLengthForm, selectAllTopology, setFinishEdges,
  showNamedSelections, syncActiveFeatureSelectionFeedback,
  syncNewFeaturePreview, toggleFinishEdges, toggleFullRoundFace,
};
