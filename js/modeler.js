import { registerQuickForm } from "./modeler_quick_form.js";
import { extrusionGeometry } from "./core/profile_mesh_geometry.js";
import {SECTION_HATCH_PATTERNS,sectionHatchCaption} from "./core/section_hatch.js";
import {componentPatternPlan,setComponentPattern,removeComponentPattern} from "./core/assembly_component_pattern.js";
import {appendSavedLibrarySearch} from './modeler_library_search.js';
import {sketchEntityStep,sketchEntitySwipe,selectedSketchNavigationEntity,sketchNavigationTarget} from './core/sketch_entity_navigation.js';
import {makeDimensionTolerance,toleranceFields} from "./core/dimension_tolerance.js";
import {dimensionEditorPosition} from './core/dimension_editor_position.js';
import {createSpringBinding,springSource,springMotionState,springPreviewMesh,hasUnverifiedSprings,restoreSpringEndpoint} from "./core/flexible_spring.js";
import {createExactSaveCache} from "./core/exact_save_cache.js";
import {syncSaveButtonAccessibility} from './modeler_save_button.js';
import {shortcutConflict,validShortcutBindings} from './core/command_shortcuts.js';
import {sketchGeometryBounds} from './core/sketch_view_fit.js';
import {reassignSketchPlane} from './core/sketch_plane_edit.js';
import {sketchPlaneDisplay} from './core/sketch_plane_display.js';
import {createExactPublicationDraft} from './core/exact_publication_draft.js';
import {applyCurrentExactDiagnostics,captureExactDiagnostics} from './core/exact_diagnostics.js';
import {temporaryAxes} from './core/temporary_axes.js';
import { massDisplaySystem } from "./mass_display_units.js";
import {reorderFinishFeature} from "./cad_finish_reorder.js";
import {resolveFinishFace} from "./core/finish_face_reference.js";
import { markDirty as markPlannerDirty } from "./persist.js";
import {pierceSketchToHelix} from './core/sketch_pierce.js';
import {helixFromSketch,synchronizeSketchHelices} from './core/sketch_helix.js';
import {appendCircularEdgeOffset,coneSilhouette,detachDrivenSketchDimension,projectCircularEdge,retargetConvertedCircle,retargetSilhouetteLine} from './core/cone_silhouette.js';
import {readProjectBundleUrl} from './core/project_bundle_url.js';
import {dimensionTargetFromSelection} from './core/sketch_dimension_selection.js';
import {resolveOffsetPlanes, throughVertexBinding, referencePlaneOffset} from './core/offset_planes.js';
import {thinSketchProfile} from './core/thin_profile.js';
import {thinExtrudeAreas,thinExtrudeChainKey,thinExtrudeSketchReadiness} from './modeler_thin_extrude_profiles.js';
import {threadPlacementFromFace} from './core/thread_placement.js';
import {threadPlacementFromCircularEdge} from './core/thread_circular_start.js';
import {occurrenceDependencyId,mateDependencyId,partDependencyGraph,assemblyDependencyGraph,dependencyVisualization} from './core/dependency_visualization.js';
import {renderDependencyPresentation} from './modeler_dependency_ui.js';
import {captureNamedCameraPose,restoreNamedCameraPose,namedCameraViews,addNamedCameraView,removeNamedCameraView} from './core/named_camera_views.js';
import {withRetiredGpuChildren} from './core/gpu_child_retirement.js';
import { synchronizeExtrusionProjections, synchronizeSketchExtrusionFrames, extrusionPreviewDirection } from "./core/extrusion_projection.js";
import { transitionExtrudeProjection } from "./core/extrude_projection_transition.js";
import {setExtrudeFeatureOperation} from './core/extrude_operation_edit.js';
import {createShellFaceThicknessEditor,createShellOpeningFaceBrowser} from './modeler_shell_thickness_form.js';
import {bindMateNumericCommit} from './modeler_mate_numeric_commit.js';
import {setTopologyMateValue} from './cad_mate_value_controls.js';
import { deduplicateBooleanProjections } from "./core/boolean_projection.js";
import { rebindReplacedSketchProfiles } from "./core/sketch_profile_rebind.js";
import { forkConflictingModel } from "./core/model_save_conflict.js";
import { threePointArc, radialArcEndpoint } from "./sketch_three_point_arc.js";
import { tangentArc, entityOutgoingTangent } from "./sketch_tangent_arc.js";
import {createMaterialValidationUI} from "./modeler_material_validation.js";
import { addCenterRectangle } from "./sketch_center_rectangle.js";
import { addDimensionedCircle } from "./sketch_dimensioned_circle.js";
import { addDimensionedPolygon } from "./sketch_dimensioned_polygon.js";
import { addCenterSlot } from "./sketch_center_slot.js";
import { rasterTextContours } from "./sketch_text.js";
import { filletSketchCorner } from "./sketch_fillet.js";
import { bindIntersectionTargets, bindModelEdgeTargets, bindPierceTargets, vertexEdgeBinding } from "./sketch_intersection.js";
import { appendConvertedEdges, exactEdgeForSegment, previewConvertedEdge } from "./core/convert_entities.js";
import { copySketchForClipboard, pasteSketchGeometry, readSketchClipboard, writeSketchClipboard } from "./core/sketch_clipboard.js";
import { ensureSketchOriginPoint, pickIsOrigin, sketchOriginPoint, smartDimensionOriginWins } from "./core/sketch_origin.js";
import { offsetFaceBoundary, appendBoundarySketch } from "./cad_face_offset.js";
import { sketchProfileSegments } from "./core/profile_curves.js";
import { captureExactTopology, verifiedExactTopology, verifiedFinalTopology } from './core/exact_topology_cache.js';
import { parallelStraightEdges } from "./core/edge_selection.js";
import { modelDimensions, formatModelLength } from "./core/model_dimensions.js";
import {documentLengthUnit,formatDocumentLength,formatDocumentScreenScale,lengthFromDocument,lengthToDocument} from './core/document_length_units.js';
import {documentDefaults,validateDocumentDefaults,applyDocumentDefaults,captureDocumentPreset,loadDocumentPresets,saveDocumentPreset,documentFromPreset} from './core/document_presets.js';
import {parseSketchDimensionEntry} from './core/sketch_dimension_entry.js';
import {generatedRackGear,validateGearPair} from "./cad_gear_geometry.js";
import {setGearMatePhase} from "./cad_gear_motion.js";
import {beltMateSpec,beltDiameterValue} from './cad_belt_mate.js';
import {rackPinionMateSpec} from './cad_rack_pinion_mate.js';
import {rotationLimitMateSpec} from './cad_rotation_limit_mate.js';
import {addRotationLimitMate,setRotationLimitMateSettings,setRotationLimitMateDrive,setRotationLimitMateReferences} from './cad_rotation_limit_controls.js';
import {addRackPinionMate,setRackPinionMateSettings,setRackPinionMateDrive,setRackPinionMateReferences} from './cad_rack_pinion_controls.js';
import {addCubicSpline,splineControls,sampleBezier,bezierPoint} from "./sketch_spline.js";
import {holeSpan} from "./core/hole_span.js";
import {repairReferences,restoreSketchConstraint} from "./sketch_edit_repair.js";
import { MANUFACTURING_TABLES, validateManufacturingTables } from "./manufacturing_tables.js";
import { centerOfMassInSystem, evaluateMassProperties } from "./cad_mass_properties.js";
import { evaluateAssemblyMassProperties } from "./cad_assembly_mass_properties.js";
import { holeToolPlacements, holeCutRecords, holePreviewParts, syncHoleCutPlacement, holePositionPointIds } from "./core/hole_geometry.js";
import { cylindricalHoleSource, cylindricalHolePlacement } from './core/cylindrical_hole_placement.js';
import {createHoleWizardSketchPair,solveHoleWizardSketch,isHoleWizardSketch,resolveHoleWizardInputs} from './core/hole_wizard_sketches.js';
import {editedHoleWizardSketch,holeWizardSketchPolylines} from './core/hole_wizard_sketch_edit.js';
import { assertSketchAxisProfile, assertStandaloneRevolve, axisMeridian, isSketchAxis, isStandaloneSketchAxisRevolve, retainedSketchRevolve, revolvePreviewAxis, revolveRecipe, sketchAxisReference } from "./core/revolve_geometry.js";
import { aabbFromBox, isUpToFace, resolveExtrudeExtent } from "./core/extrude_extent.js";
import { toolFeatureRecipe } from "./core/tool_recipe.js";
import { askModelerDecision, dismissModelerDecision, modelerDecisionOpen } from "./modeler_decision.js";
// Custom model editor ("CAD-lite"): sketch profiles, extrude, add primitives,
// apply materials/textures, constrain dimensions, and save reusable models.
// Saved models register into FURN/PRICE so they behave exactly like built-ins:
// placeable from the library select, priced, serialized with the scene.
//
// Model definition (stored in localStorage "home3d_models" + embedded in scene JSON):
//   { key, name, price, col, parts: [part...] }
// Part kinds (model-local frame like furniture: x=width, z=depth, y=up, floor y=0):
//   box: {x0,x1,y0,y1,z0,z1}    cyl: {x,y,z,r,r2,h} (y = base)   sph: {x,y,z,r}
//   ext: {axis:'y'|'z'|'x', from, to, pts:[{u,v}]}  extruded sketch profile
// Common part fields: id, kind, name, color, metal, rough, opacity, tex(dataURL)

import { THREE, loadThree, threeLoaded } from "./three_lazy.js";
import { render as gpuRender } from "./gpu.js";
import { S, uid, clamp, fin, hexStr } from "./state.js";
import { nextDocumentNumericId } from "./core/document_ids.js";
import {createMotionPlayback,motionPreviewDuration} from './core/motion_playback.js';
import {createMotionPlaybackExecutor} from './core/motion_playback_executor.js';
import {nativeSolidSummary} from './core/native_solid_summary.js';
import { reattachFeatureSketchSupport, reattachSketchSupport, sketchSupportNeedsUpdate } from "./core/sketch_support_edit.js";
import {holeSupportChoices,holeSupportChoiceReference} from './core/hole_support_choices.js';
import {compactAssemblyTopologySnapshots,compactDocumentTopologySnapshots} from './core/project_topology_budget.js';
import { FURN, PRICE, CATALOG, flabel, clearVSpanCache, buildItem } from "./furniture.js";
import { modelThumb, thumbAsync, hasThumb, loadThumbCache } from "./thumbs.js";
import { usedCustomModels, refreshCatalogSelect } from "./model_catalog.js";
import { reportEditorOpenState } from "./modeler_launch.js";
import {
  registerEditor, editorSwitchHTML, wireEditorSwitch, wireShell,
  projectChipHTML, shellActionsHTML, commandBarHTML, aiStatusHTML,
} from "./pro_shell.js";
import { box, cyl, sph, clearGroup } from "./primitives.js";
import { sharedRepeat } from "./pbr_material.js";
import { syncViewportSelectionMaterial } from "./core/viewport_selection.js";
import { getLang, onLangChange } from "./i18n.js";
import * as ribbon from "./uikit_host/ribbon.js";
import { stopSpeaking, bindSpeakButton } from "./speech.js";
import { render2D } from "./plan2d.js";
import { pushHistory as pushPlannerHistory } from "./history.js";
import { convertCadToWalls } from "./cad_to_walls.js";
import { wallDrawCommand, executeCommand } from "./commands/index.js";
import { createHistory } from "./edit_history.js";
import { createHistorySnapshotCodec } from "./core/history_value_pool.js";
import { createHistoryPanel } from "./ui_history.js";
import { registerEditorAgent } from "./editor_agent.js";
import { bindThreeFingerPan, createEditorView, createViewportSwap } from "./editor_view.js";
import {
  beginTouchPrecision, directionalSegmentDistances, drawTouchPrecisionLens, modelerPrecisionTrialAllowed,
  modelerTouchPrecisionKind, touchPrecisionPoint, updateTouchPrecision,
} from "./touch_precision.js";
import {
  buildTouchPrecisionSettings,
  dispatchPrecisionCommit, dispatchPrecisionDown, dispatchPrecisionMove, dispatchPrecisionUp, getTouchPrecisionMode, getTouchPrecisionPrefs,
  precisionModelPoint, releaseTouchPrecisionTrial, startTouchPrecisionTrial, touchPrecisionTrialOwns,
  updateTouchPrecisionTrial,
} from "./touch_precision_ui.js";
import { getMainScene, getRigLights, has3D } from "./view3d.js";
import { validCustomModelKey, sanitizeDisplayName } from "./safe.js";
import {
  ensureSketch, ensureSketchDoc, sketchById, addSketch, removeSketch, pruneAbandonedSketches, planeLabel,
  sketchPoint, sketchEntity, solveSketch, explainSketchConflict, resolveProfilePoints,
  lineData, circleData, ellipseData, entityPoints, removeSketchEntity, refusesAsRepeat,
  collapsedEntityIds, pruneImpliedRelations, sketchEntitySizes, translateSketchGeometry,
} from "./sketch_solver.js";
import { drawNameTags, relationSubjects, relationTargets, sketchInstanceNames } from "./sketch_names.js";
import {
  addSmartDimension, currentMeasure, distanceDimensionLayout,
  hitSketchDimensionHit, dimensionHitYieldsToPoint, drawSketchDimensions, drawConstraintGlyphs,
} from "./sketch_dimensions.js";
import {
  resolveEquations, evaluateExpression, expandUnitLiterals, dimensionUnit, collectSymbols,
  isValidName, nameAvailable, addVariable, removeVariable,
} from "./sketch_equations.js";
import { trimEntity, extendEntity, offsetEntity, toggleConstruction, projectLoop } from "./sketch_trim.js";
import { mirrorEntities, linearPatternEntities, circularPatternEntities } from "./sketch_pattern.js";
import { addFeature, ensureFeatureTree, releaseRegeneration, resolveSketchProfile } from "./cad_feature_tree.js";
import { regenerateInCadWorker as regenerateFeatures, finishInCadWorker, interferenceInCadWorker, assemblyStepInCadWorker, assemblyPrintInCadWorker, partStepInCadWorker, cutIntersectionInCadWorker, surfaceSectionsInCadWorker, topologyInCadWorker, cadWorkerAvailable, cancelCadWorkerWork, cadWorkerActivity, subscribeCadWorkerActivity } from './core/cad_worker_client.js';
import { interferenceDocument } from './core/worker_interference.js';
import { assemblyInterferenceScope } from './core/assembly_interference_scope.js';
import { interferenceVolumeLabel } from './core/interference_volume_label.js';
import {canonicalFeatureTopologyReferences,featureInputStage} from './core/feature_input_stage.js';
import {setSketchOffset,sketchOffsetValue} from './core/sketch_offset.js';
import {pointerCameraRay} from './core/editor_projection.js';
import {createExactRebuildQueue} from './core/exact_rebuild_queue.js';
import { exportBinaryStl, stlMeshOptions } from "./cad_stl.js";
import { prepareNativePrintPositions, printSetupExtents } from "./core/print_setup.js";
import { exportThreeMf, printMeshFromPositions } from "./cad_3mf.js";
import { analyzePrintLayers, printLayerSvg, printLayerSourceStamp } from './core/print_layer_analysis.js';
import {slicePrintMeshes,validateFffSettings,FFF_DEFAULTS} from './core/print_toolpaths.js';
import {toolpathSvg,toolpathsGcode} from './core/print_toolpath_export.js';
import { exportAmf } from "./cad_amf.js";
import {
  exportStep, exportIges, importStep,
  makeBrepExtrusion, makeBrepLoft, makeBrepPrimitive, makeBrepRevolve, makeBrepSweep, booleanBrep, boundsMayOverlap, brepConnectedGroups, chamferBrep, domeBrep, draftBrep, extractBrepTopology, filletBrep, shapeToMeshData, moveBodyBrep, placeBrep, placedBrepBounds, ribBrep, shellBrep, splitBrep, thickenBrep, disposeBrep,
  serializeBrep, transformBrep, translateBrep, unifyBrepFaces, validateBrepForExport,
} from "./cad_kernel.js";
import { buildDrawingScene } from "./cad_drawings.js";
import {createNativeConfiguredDrawingCache,configuredViewId,configuredBodyAppearance} from './core/native_configured_drawing.js';
import { SHEET_SIZES, STANDARD_SCALES, defaultViewLabel, ensureSheetDoc, scaleLabel, sceneToSvg } from "./cad_sheet.js";
import {ensureAssemblyDrawingDoc} from './core/assembly_drawing_settings.js';
import {drawingViewScaleControl} from "./core/drawing_scale_control.js";
import {decodeDrawingImage} from "./core/drawing_image.js";
import {importDrawingProjectImage} from "./core/drawing_project_image.js";
import {captureDrawingPreset,applyDrawingFormat,drawingFromTemplate,loadDrawingPresets,saveDrawingPreset} from './core/drawing_presets.js';
import { DRAWING_TOOLS, createDrawingController, bindDetailTagControls, bindSectionTagControls, bindSectionPositionControls } from "./modeler_drawing.js";
import { tessellateParts } from "./core/part_tessellate.js";
import { KERNEL_BODY_KIND, buildKernelBrep, featureBuildsKernelBody, isKernelBody, kernelBodyBounds, kernelBodyMeshData, kernelBodySpec, meshDataBounds, offsetKernelBody } from "./core/kernel_body.js";
import { addEdgeFlange, createSheetMetalPart, flatPattern, flatPatternSvg } from "./cad_sheet_metal.js";
import { projectedHingeTool, repairSheetOwner, sheetPlate } from "./cad_sheet_hinge.js";
import { hingeForm } from "./modeler/sheet_hinge_form.js";
import { captureLockPose, mateFrameSupports, mateFramesSupport, mateRequirementFor, solveTopologyMates, topologyReference } from "./cad_mates.js";
import { defaultTopologyMateAlignment, exactMateReferenceChoices, mateAlignmentForLockedOrientation, planarMateFaceChoices } from "./cad_mate_reference_choices.js";
import {applyDrivenAssemblyPlacement} from "./core/assembly_placement.js";
import { draftFaceChoices } from "./core/draft_face_choices.js";
import { trackLibraryOccurrence } from "./core/library_occurrence.js";
import { resolvedLibraryAssembly, libraryOccurrenceUpdate } from "./core/model_library_store.js";
import { ASSEMBLY_ORIGIN_ID, boundsAtPlacement, componentTopology, containsAssembly, descriptorToParent, flattenAssembly, isSubassembly, lookupAssemblyComponent, refreshSubassemblyFromRecord, standardPlaneEntries, subassemblyComponent } from "./core/assembly_structure.js";
import {formSubassembly} from './core/assembly_form_subassembly.js';
import {assemblyDrawingBOM,occurrenceBOMKey} from './core/assembly_drawing_bom.js';
import {nativeOccurrenceBalloonTarget} from './core/assembly_balloon.js';
import {assemblyMobilityReport,currentAssemblyMobility} from './core/assembly_mobility_status.js';
import { eulerMatrix, normalizePose, rotationOf, setRotation, validLimitMateBounds, worldFrame } from "./cad_mate_model.js";
import { setScrewMateCoupledMotion, setScrewMateDrive, setScrewMateHandedness, setConcentricAxisDirection } from "./cad_screw_controls.js";
import { analyzeSketchChains, analyzeSketchProfiles, curveSegments, healSketchEndpoints, pointInProfile, profileCentroid } from "./sketch_profiles.js";
import { ribSketchReady } from "./core/rib_profile.js";
import { featureAreas, loopInteriorPoint, sketchRegions } from "./sketch_regions.js";
import { refreshedExtrudeProfile } from "./core/feature_profile_refresh.js";
import { featureContourKey, selectFeatureContours } from "./core/feature_contours.js";
import { createReferencePlane, createReferenceAxis, createReferencePoint, createCoordinateSystem, createHelix } from "./cad_reference_geometry.js";
import { helixSweepPath, documentHelixOverlays, sweepUsesHelixPath,circularHelixSweepProfile } from "./cad_helix.js";
import { circularSweepProfile, loftSectionSourceRecord, loftSourceRecord, savedLoftSources, resolveSketchSources as resolveSweptSources, sampleSketchPath, sketchPathSegments, sketchWorldPoint, sweepSourceRecord } from "./core/swept_sources.js";
import { defaultExplodeLayout, assemblyHasExplodedOffsets, createExplodedView, addExplodeStep, applyExplodedView, applyExplodedProgress, explodeLines, explodeTargets, explodedOccurrenceOffset } from "./cad_exploded_view.js";
import { createMotionStudy, captureMotionStudyBaseline, addRotaryMotor, addScrewMotor, addRackPinionMotor, addLinearMotor, addGearRelation, evaluateMotionStudy } from "./cad_motion_study.js";
import { detectInterference, generateBOM } from "./cad_interference.js";
import { createProjectBundle, exportProjectBundle, importProjectBundle, importProjectBundleText, activeProjectDocument } from "./cad_project_bundle.js";
import { measureAngleBetweenNormals, measureDistance } from "./cad_evaluate.js";
import { auditStandardParts, involuteGearOutline } from "./cad_standards.js";
import { holeCallout, holeTableRow, holeWizardSolids, holeWizardThread, listHoleSizes, normalizeHoleWizard } from "./cad_hole_wizard.js";
import { calloutText, calloutTextById, holeCallouts } from "./core/hole_callout.js";
import { cosmeticThread, modeledThreadSolid, normalizeThreadSpec, threadCallout, validateThreadFeature, validateThreadFit, documentThreadOverlays } from "./cad_thread.js";
import { knurlBandMesh, knurlCallout, knurlGroovePolylines, normalizeKnurlSpec, validateKnurl } from "./cad_knurl.js";
import { toolboxFastener, listToolboxLibrary, toolboxFamily, lengthOptionsForSize, FASTENER_LENGTHS_MM, reducingBranchRows, PVC_D1785, searchToolbox, TOOLBOX_CATEGORY_LABELS } from "./cad_toolbox.js";
import { assemblyToolboxDocument, hasSingleToolboxKernelRecipe } from "./cad_assembly_toolbox.js";
import { expectedContactFor, recordExpectedContact, removeExpectedContact, contactAuditSummary } from "./core/assembly_contact_audit.js";
import { applyAppearanceOverrides, createAppearanceOverride, insertBody, STOCK_MATERIALS, upsertAppearanceOverride, faceAppearanceOverrides, partMaterialDensity, stockMaterialForPart, drawingMaterialName, pruneSketchTargetedBodyAppearances, pruneSketchMaterialFields } from "./cad_appearances.js";
import { appearanceGroups } from "./core/appearance_groups.js";
import { openDesignTable } from "./modeler/design_table.js";
import { captureConfiguration, circularSweepTableRows, ensureConfigurations, setActiveConfiguration, setCircularSweepDesignTable, updateConfiguration } from "./cad_configurations.js";
import { restoreToolboxProjections } from "./core/toolbox_projection_restore.js";
import { synchronizeToolboxMaterial } from "./core/toolbox_assigned_material.js";
import {replaceComponentDefinition,setComponentConfiguration} from './core/component_configuration.js';
import {rebindTopologyMate} from './core/topology_mate_rebind.js';
import { evaluateFit, fitCallout, fitLimitSource } from "./cad_fits.js";
import {
  ensureItemDefinition,
  commitDefinition,
} from "./core/project.js";
import { migrateDefinition, cloneDomain, createParameter } from "./core/schema.js";
import {
  analyzeParametricHistory, createFeatureDefinition, ensureParametricDocument,
  recordSketchInHistory, removeHistoryNode, reorderHistoryNode, suppressHistoryNode,
  updateFeatureDefinition, setHistoryRollback, historyEntryRolled, applyHistoryToPreviewParts,
  reconnectLaterBodyConsumers,
} from "./core/parametric_document.js";
import { compileKernelFeatureTree, FEATURE_PATTERN_SEED_TYPES } from "./core/kernel_feature_adapter.js";
import { publishRebuildStatus, rebuildParametricDocument, withKernelFailures } from "./core/parametric_rebuild.js";
import { displayUnit, toDisp, fromDisp, fmtLen, parseLen } from "./display_units.js";
import { getDomainUnit } from "./unit_settings.js";
import { featureDefaults, featureLabel, featureSpec, setFeatureLabelResolver } from "./core/feature_catalog.js";
import { inferAuthoringMode } from "./core/authoring_mode.js";
import { createImportedDefinition, detectStepLengthUnit, stepUnitCorrection } from "./core/import_normalization.js";
import { encodeBinaryPayload } from "./core/binary_payload.js";
import { externalizeAttachments, collectAttachmentReferences, exportAttachmentRecords, installAttachmentRecords } from "./core/attachment_store.js";
import { garbageCollectAttachments } from "./core/attachment_gc.js";
import { loadModelLibrary, putModelLibraryRecord, deleteModelLibraryRecord, mergeStoredModelLibrary, loadAssemblyLibrary, putAssemblyLibraryRecord, deleteAssemblyLibraryRecord, mergeStoredAssemblyLibrary, loadModelerDraftRecord, listModelerDraftRecords, saveModelerDraftRecord, clearModelerDraftRecord, claimLegacyModelerDraftRecord, libraryBundle, parseLibraryBundle, collidingLibraryKeys, importKeptLibraryBundle } from "./core/model_library_store.js";
import { drawingOnlyContentSummary, hasSaveableModelContent } from "./core/model_save_policy.js";
import { sketchFitViewport } from "./core/sketch_fit_viewport.js";
import { analyticPartTopology, contextDocumentTopology } from "./core/assembly_context.js";
import { componentEditCopy, commitComponentEdit } from "./core/component_edit.js";
import {nestedComponentOccurrence,createNestedComponentEdit,restoreNestedComponentEdit,nestedEditStillCurrent,commitNestedComponentEdit,assemblyWithoutNestedOccurrence} from "./core/nested_component_edit.js";
import { registerGeneratedExtrusion } from "./core/generated_extrusion.js";
import { queueModelBackup, listDiskBackups, fetchDiskBackup, missingFromLibrary, modelBackupStatus } from "./core/model_backup_client.js";
import { leavesInputStanding, rebuildDefinition } from "./core/rebuild.js";
import { buildTreeModel, findTreeNode, folderMemberIds } from "./core/tree_model.js";
import {featureBrowseNodes,featureTreeContext} from './core/feature_browse.js';
import { renderTreeModel } from "./modeler_tree.js";
import { analyzeLegacyMigration, convertLegacyDocument, evaluateMigration, migrationGeometrySummary, retainLegacySource, restoreLegacyDocument } from "./core/migration_check.js";
import { applyDocumentTopologyRebindings, applyTopologyRebindings, createTopologyReference, cutWallTopology, createTopologyRegistry, resolveTopologyReference, topologyForFeature, mergeSmoothTopology, isCylinderTessellationSeam, pointWithinCylinderArc, resolveFinishTargetIds, resolveMergedTopology, topologyDescriptorSignature, topologyMemberIds, edgeLiesOnFace, edgesBoundingFace, fitProfileCircle } from "./core/topology.js";
import {
  edgeEndpoints, growSelection, invertSelection, selectConnected, selectLoop,
  selectTangentChain, shrinkSelection, vertexEntriesFrom,
} from "./core/topology_selection.js";
import { faceFrameOrigin, frameDirection, frameFromPlane, framePoint, frameProjectPoint, realignFrame } from "./core/frame.js";
import {
  bodyDepthRange, cutFootprintsMayOverlap,
  cutFootprint as cutScopeFootprint,
  profileLoopIsSeparateHole,
} from "./core/cut_scope.js";
import { diagnosticHelp, groupDiagnostics, recommendedDiagnostic } from "./core/diagnostic_help.js";
import { circularPatternAxisFromHistory, circularPatternPivot, circularPatternStepDegrees, composeRigidTransforms, curvePatternPath, curvePatternPlacements, invertRigidTransform, linearPatternOffsets, parseSkippedPatternInstances, patternPlacementTransform, patternRotationTransform, rigidTransformIsIdentity, rotatedPatternBounds } from "./core/pattern_geometry.js";
import { cabinetDefinitionFromItem, finalizeCabinetAdvancedDefinition, syncCabinetDefinition } from "./parametric_cabinet.js";
import { assignCabinetManufacturing, CABINET_MANUFACTURING_ROLES } from "./core/cabinet_advanced.js";
import { layoutCab } from "./cabinet.js";
import { createSurfaceSketch, supportsSurfaceUV, surfaceSketchWorldPolyline, cylinderUVDomain } from "./core/surface_uv.js";
import { clearMeshProjectionCache, meshFeatureEdges, meshSmoothFaces, projectMeshEdges } from "./core/mesh_projection.js";
import {
  FEATURE_COMMAND, KEY_TOOL, KEY_VIEW, DIRECT_COMMAND_TOOLS,
  bomCsv, bomTableRows, buildCommandCatalog, commandUnavailableReason as catalogUnavailableReason,
} from "./modeler_commands.js";
import { assemblyPartNumber, documentDescription, documentProperty, setDocumentDescription, setDocumentProperty, sheetTitleMeta, setSheetTitleSource } from "./core/custom_properties.js";
import { finishPreviewProofMatches } from "./core/finish_preview_proof.js";
import { claimLegacyModelerDraft, modelerDraftKey, modelerDraftOwner, freshModelerDraftOwner, clearModelerDraft, parseModelerDraft, readModelerDraft, serializeModelerDraft, writeModelerDraft } from "./modeler_draft.js";
import {
  featureField as featureFieldCore, featureReferenceValue, featureControlValue, evaluateFeatureNumber, validateFeatureInputs, readFeatureParameterForm, renderLoftSectionPicker, renderFeatureParameterForm as renderFeatureParameterFormCore,
} from "./modeler_feature_form.js";
import {
  resolveAssemblyWorkflow, defaultSketchPlane, featuresForClosedProfile,
  resolveWorkflowStep, shouldResumeSketchSession, shouldSkipReferencePicker,
  sketchStartMode,
} from "./modeler_workflow.js";
import {
  constraintAlreadyPresent, entityStatuses, inferLineRelations, inferOrthoSnap,
  inferTangentCircle, nextInferenceIndex, onCurveTargets, pickSnap, sketchSnapTargets, sketchStatusColor,
} from "./modeler_inference.js";
import {
  boxSelectMode, boundsHitBox, confirmationCornerState, contextMenuItems,
  contextToolbarItems, cycleOverlappingHits, featureHistoryIndex, gestureFromSwipe, selectionMenuItems,
  selectionBreadcrumb, selectionFilterAllows, shortcutBarItems, VIEW_PRESETS,
} from "./modeler_chrome.js";
import {
  applyHandleDrag, dimensionValueFromDrag, distancePointToSegment2d, extrudeHandlePose,
  filletGrowDirection, filletHandlePose, maxFinishAmount, patternHandlePose, instant3dDisplayValue, instant3dModelValue, instant3dValueLabel,
} from "./modeler_instant3d.js";
import { inferSmartMate, isolateVisibility } from "./modeler_smartmates.js";
import { welcomeGlyph } from "./modeler_welcome_glyphs.js";
import { cadIcon } from "./modeler_icons.js";
import { initModelerMobile, syncModelerMobile, teardownModelerMobile, showModelerSheet, closeModelerSheet, revealModelerFeatureForm } from "./modeler_mobile.js";
import { chooseTopologyHit, circularEdgeSweep, filterTopologyHitsByClipPlane, topologyCandidateWorldThreshold, topologyLineWorldThreshold, topologyPickPixelRadius } from "./modeler_topology_pick.js";
import { approximateFinishPreviewShapes, chamferVertex, filletVertex, insetLoop, pointInPoly } from "./modeler_finish_preview.js";
import {
  NOTE_CATEGORIES,
  CURATED_SWATCHES,
  addNoteToDef,
  updateNoteInDef,
  deleteNoteFromDef,
  translateNotes,
  applyFacePaint,
  applyBodyPaint,
  sampleFaceAppearance,
  clearFacePaint,
  addMarkupToDef,
  clearMarkupsFromDef,
  translateMarkups,
} from "./modeler_notes_paint.js";
/* The editor's string table and its local t()/tf() live in
   js/modeler_strings.js — a flat [he, en] table, not js/i18n/*.js. */
import { TXT, t, tf } from "./modeler_strings.js";
/* Pure mesh/edge/face geometry, lifted out of this file; it never touches E. */
import {
  addMeshSharpEdges, analyticCurvedFace, buildExactMesh, circleDescriptorsMatch,
  clearTopologyCache, distanceToCircularEdge, edgePoints, edgesGeometricallyMatch,
  exactOverlayEntries, faceHighlightMesh, forEachCutLoop, geometryToMeshData,
  hexNum, highlightIdsFor, holeAndCutEdges, holeAndCutFaces,
  holeLoop, matchingMeshChain, meshCircleEntries, meshFaceEntries,
  overlayEntryCache, profileAxisToWorld, profilePointToWorld, smoothFacesForMesh,
  smoothTessellationNormals, topologyMergeCache, triangleSetForFace,
} from "./modeler_mesh_geometry.js";
/* Pure part geometry and the exact-kernel part recipe; it never touches E. */
import {
  FACE_DRIVEN_OPERATIONS, boxToExt, buildLoft, buildRev,
  cloneData, cutFootprint, cutRangeForAxis, exactBrepForPart, exactCutIntersection,
  footprintHasPoint, footprintPoint, kernelRecipeBounds, loopCentroid,
  migrateBoundaryChangingProfileCuts, mirrorProjectionPart, movePart, normalizeTransform,
  partBounds, partNeedsExactMesh, partPatternRotations, partPatternTransform, partSupportsExactMesh,
  patternMergeSource, placePatternCopy, resetClonedPartIdentity, revMaxR, rotPartY,
  translateTopologyReferences,
} from "./modeler_part_geometry.js";
/* Pick-to-reference and reference-to-screen geometry; it never touches E. */
import {
  dedupeFinishRefs, dedupeTopologyCandidates, entryScreenBounds, finishEdgeKey,
  finishEdgeLabel, getScratchCandidateBox, nearestCircularEdge, pickPointer, pickScratch,
  projectToScreen, promotePickedEdge, sameFinishEdge, topologyReferenceFromEntry,
  viewportRect,
} from "./modeler_pick_geometry.js";
import {
  assemblyTourSteps, closeTour, dreidelTourSteps, flowerTourSteps,
  gearTourSteps, insertISO4017Screw, installTourDragging, mobileTourSteps,
  patternTourSteps, prepareTourStep, renderTour, renderTourMode,
  restoreAutomaticTourOrigin, screwTourSteps, seekAutomaticTour,
  selectTourTrack, sketchTourSteps, solidworksCubeTourSteps, startTour,
  studBallTourSteps, tourMaterial, tourStepDone, tourSteps,
} from "./modeler/sketch_guide.js";
import {
  cancel2DPointerMoveGlobal, dynCommit, dynDrawHud, dynHasEntry, onKey,
  pointToLineDistance, releaseSelectionFilterChord, wireSketch,
} from "./modeler/dimension_entry.js";
import {
  closeReport, closedSketchProfile, documentPresetAction, drawSketch,
  drawingDocument, drawingHintText, drawingSheet, extrudeClosedSketch,
  extrusionSketchAreas, featureAreaAt, finishPoly, fitSplitPreview, flash,
  flashHolding, hitPart, invalidateDrawing, modelerTouchDistances,
  newSketchPoint, prepareConfiguredDrawingExport, report, reportOpen,
  sampleSplinePoints, sheetForm, sheetPrompt, sheetRow, sheetSelect,
  sheetSharpSolids, showPickList, sketchFeatureAreas, sketchLinePoints,
  sketchProfileAnalysis, sketchRegionAnalysis, sketchUvPolylines,
  snappedSketchPoint, splineLength, syncSheetPanel, toggleFeatureArea,
} from "./modeler/drawing_sheet.js";
import {
  assemblyPrintRequests, beginMeasure, cancelInterferenceCheck, closeEvalCard,
  createDefaultExplodedView, createDefaultMotionStudy,
  createEmptyExplodedView, documentOwnership, documentStillOwned, evalRow,
  exportAssemblyPrintDocument, exportBundleDocument, importBundleDocument,
  massEvaluationChanged, measureCoordinates, measureFromPick,
  occurrenceWorldBounds, openExplodeStepForm, runInterferenceCheck,
  runStandardsAudit, standardsGate, syncMassPropertiesEvaluation,
} from "./modeler/document_outputs.js";
import {
  abandonDocumentExactWork, addReferenceGeometry, downloadBytes,
  evalCardActions, exactRunIsCurrent, exactRunStamp, exportIgesDocument,
  exportStepDocument, openCoordinateSystemForm, openEvalCard,
  openFffSlicePreview, openOffsetPlaneForm, openPrintLayerAnalysis,
  openPrintSetupForm, openStlExportForm, rebuildFailureMessage,
  rebuildFeatureTreeFromDocument, regenerateExactModel, releaseExactRun,
  scheduleExactRestore,
} from "./modeler/export_measure.js";
import {
  addExplodeLeaders, assemblyExplodeLines, buildComponentGroup, drawInRoom,
  markLiveDirtyPart, partBelongsToFeature, refreshChangedPart,
  refreshChangedParts, refreshLivePreview, renderPreview, retainExactPreview,
  retainingExactPreview, updatePreview,
} from "./modeler/library_panel.js";
import {
  addInstant3dHandles, assemblyPickedRefs, assemblySymmetricPicks,
  beginInstant3dDrag, closeNoteEditor, componentTopologyFromHit,
  hidePickCycle, hitInstant3d, instant3dAuthoringState, lockMateComponentPair,
  mateFramesFit, mateReferenceFromPick, mateTypeFits, openNoteEditor,
  pickAssemblyComponent, renderTreeAnnotations, screenDeltaAlongAxis,
  screenDeltaToWorld, showSelectThrough, stampComponentRef,
  syncFilletEndpoints, syncInstant3dValue, ungroundedComponentPair,
} from "./modeler/viewport_input.js";
import {
  hoverAssemblyTopology, markupsSignature, syncNotesAndMarkups,
  syncNotesToolbar, syncPaintToolbar, syncViewsToolbarNotes,
} from "./modeler/notes_markups.js";
import {
  fillInspector, fillInspectorTab, fillSketchPane, modelParameterOverrides,
  surfaceUVGuide,
} from "./modeler/inspector.js";
import {
  addInspectorTopologyMate, addMate, addTopologyMate, clampMateAngle,
  componentLabel, concentricAxisDirectionControl, diagnosticActionLabel,
  diagnosticMessage, fillLibraryLinkStatus, finalMateTopology,
  focusTreeDiagnostics, highlightFeatureIssueBanner, mateHolderById, mateRow,
  openFormSubassembly, openMateAngleForm, openMateBeltForm,
  openMateDistanceForm, openMateGearForm, openMatePropertyManager,
  openMateRackPinionForm, openMateRotationLimitForm, parametricRollbackBar,
  planeMateReference, refreshComponentMateReferences, refreshParts,
  rejectFlexibleSpringPreview, rollbackBar, runDiagnosticAction,
  syncDiagnosticJump,
} from "./modeler/component_mates.js";
import {
  applyDependencyTreeClasses, cancelFeatureParameterEdit, closeTreeMenu,
  currentTreeModel, dependencyReferenceId, dependencyRole, dependencySets,
  openTreeMenu, refreshModelHistoryPane, selectTreeNode,
  setDependencyHighlight, syncLiveFeatureEdit, treeCollapseState, treeDeps,
  updateDependencyPresentation,
} from "./modeler/feature_tree.js";
import {
  applyDimensionEditor, clearLiveDownstream, contextPartTopology,
  deleteDimensionEditor, editHoleWizardSketch, editSketchFromHistory,
  emptyState, finishContextPart, finishWallChain, insertAssemblyComponent,
  liveFeatureEditBadge, openComponentPatternForm, openSelectedSmartDimension,
  partsForFeature, positionDimensionEditor, projectPartEdges,
  refreshComponents, syncAssemblyContextBar, syncProjectionFromFeature,
  topologyMateLabel,
} from "./modeler/tree_assembly.js";
import {
  addedConstraintIds, appendToSketch, applyConstraint, cancelDimensionEditor,
  constraintCaption, constraintFits, mirrorSelection,
  patternCircularSelection, patternSelection, refusalMessage,
  showSketchRefusal, toggleDynamicMirror,
} from "./modeler/sketch_dimension_editor.js";
import {
  addSketchCircle, adoptSketchForView, bindPolygonSideControl,
  displayedCoreIssues, isSketchObject, modelRebuildPending,
  openCenterRectangle, openCenterSlot, openConvertEntities,
  openDimensionedCircle, openDimensionedPolygon, openFaceBoundary,
  openSketchFillet, refreshConvertEntitiesHint, resolveSketch, selEntities,
  selectSketch, sizeSketch, sketchForView, sketchPlaneCaption,
  syncFaceSupportedSketchFrames, syncHint, syncSketchDrivenParts, syncStatus,
  watchSketchSize,
} from "./modeler/sketch_entities.js";
import {
  closeWelcome, coachSuggestion, findVisibleEnabledCoachTarget, goTourStep,
  openWelcome, startSketchOnDefaultPlane, syncCoach, updateTourProgress,
} from "./modeler/welcome_coach.js";
import {
  applySectionClipping, fitPreview, initPreview, layout3DHost, sectionPlane,
  setModelDisplay, setPanelCollapsed, setSectionState, setShowModelEdges,
  toggleSectionView,
} from "./modeler/view_modes.js";
import {
  publishAssemblyModel, saveCurrentDocument, saveProgress, setDocumentType,
  syncExtrudeButton, syncTools, syncViewButtons,
} from "./modeler/document_save.js";
import {
  cancelActiveCommand, chromeCommandLabel, chromeSelectionInput,
  clearMobileSelection, closeCommandSearch, collectingEndFace, commandCatalog,
  commandSelectionPrefer, commandUnavailableReason, currentCornerInput,
  dismissProfileOffer, featureSelectionReady, finishActiveCommand,
  leavingQuickForm, offerProfileFeatures, openCommandSearch, openQuickForm,
  renderCommandResults, returnToFeatureParameters, runChromeCommand,
  selectionFilterAvailable, setAssemblyMoveMode, setMobileAddSelection,
  setSelectionFilter, showViewSelector, syncCommandManager,
  syncContextActions, syncExplodeCommandState, syncSelectionFilters,
  toggleIsolate,
} from "./modeler/command_manager.js";
import {
  addBossContourChoices, addFinishBodyTargetControl, addFinishScrubber,
  addShellFaceThicknessControls, addTerminatingFaceChoices,
  addThinExtrudeChainChoices, adoptFinishEdgeSelection,
  authoritativeFinishTopology, currentFinishEdges, edgeRefsForFaces,
  exactFinishPreviewBody, exactFinishPreviewPart, finishCommandActive,
  finishFeatureTargets, fullRoundActive, namedSelections,
  queueNewFeaturePreview, readyShellPreviewMatches, registerFeatureForm,
  rememberFinishAmount, renderFinishEdgeList, restoreNamedSelection,
  runSelectionOperation, setFinishEdges, syncActiveFeatureSelectionFeedback,
  syncNewFeaturePreview, toggleFinishEdges, toggleFullRoundFace,
} from "./modeler/finish_preview.js";
import {
  activeLoftCreation, clearFeaturePreview, createHelixFeature,
  createHoleFeature, createInsertFeature, createKnurlFeature,
  createMultiSketchFeature, createRevolveCutFeature, createRevolveFeature,
  createThreadFeature, cutTargetFeatureId, documentHelixRecords, featureField,
  preselectedRevolveAxis, publishExactBodies, resolvedRevolve,
  retargetSweepHelix, revolveContour, selectedFeatureIds, selectedHelixRecord,
  selectedSketchIds, setFeatureReferencesFromForm, showConfigurations,
  showToolboxPicker,
} from "./modeler/feature_create.js";
import {
  createRibFeature, quickDomePart, quickDraftPart, quickMirrorPart,
  quickMoveBodyPart, quickPatternPart, quickRoundPart, quickShellPart,
  quickSplitBodyPart, quickThickenPart, renderFeatureParameterForm,
  runCommand, selectedSolid,
} from "./modeler/part_commands.js";
import {
  activateWorkflowStep, activeTab, beginSketchWorkflow, cadSketchSnapshot,
  cancelFacePick, cancelReferenceSelection, chooseSketchReference,
  closeFeaturePanel, faceSketchAttachment, finishSketchWorkflow, fitSketch,
  isCanonicalAuthoring, modelLengthText, modelLengthUnit, orientModelToView,
  setCommandTab, setModelLengthUnit, setSketchNormalTo, setTab, setTool,
  setView, showReferencePicker, syncAssemblyWorkflow, syncAuthoringWorkflow,
  syncFacePrompt, syncModelPlane, syncNormalToControls, zoomBy,
} from "./modeler/sketch_workflow.js";
import {
  bindDocumentTextField, btn, commandButton, commandGroup, el, kt,
  markUnavailable, namedButton, relationButton, tab, tabstrip, toolKeyRows,
} from "./modeler/editor_dom.js";
import {
  addFaceAppearances, addFaceHighlights, addPartFeatureOverlays,
  applyViewportDisplayStyle, buildExt, decorationWorldPerPixel,
  isEntryAffectedByHover, overlayEntriesForPart, refreshViewportSelection,
  registerCustomModel, syncViewportMeshSelection, topologyHovered,
  topologySelected,
} from "./modeler/viewport_decorations.js";
import {
  activeParts, addPart, applyTexTo, applyTrackedUpdates, assemblyMateCount,
  brokenMateCount, componentDef, countLabel, featureTypeLabel, loadAssemblies,
  loadLib, mateIssuesFor, mateReboundFor, migrateDefinitionProfileCuts,
  mirrorLibraryToDisk, newAssembly, normalizeDef, pruneAssemblyMates,
  signalLibraryChange, topologyEntriesForPart, writeAssemblyIndex,
  writeLibraryIndex,
} from "./modeler/library_store.js";
import { buildDOM } from "./modeler/build_dom.js";
import {
  applyBoxSelection, beginPaintSelectDrag, cancelExactModelRebuild,
  refreshLib, scheduleLibThumbs, setMode, syncHead,
} from "./modeler/library_io.js";
import { pickPartsFor } from "./modeler/topology_pick.js";
import { newModel, openFeatureEditor } from "./modeler/editor_forms.js";
import {
  assemblySaveSession, confirmDiscardDocument, currentHistoryNode, doRedo,
  doUndo, docSubtree, documentDirty, frameRangeForBounds, hasResidentEdits,
  markDocumentClean, modelerDraftStorage, modelerSessionStorage, partUV,
  planeAxis, pushUndo, reconcileModelerDraft, requestCloseModeler,
  residentDirtyState, scanDoc, setModelerBackgroundIsolation, snapDoc,
  syncDraftStatus, syncUndoButtons, toPx, tryRestoreModelerDraft,
} from "./modeler/document_history.js";
import {
  loadModelerPrefs, newDef, queueExactMesh, queueKernelBody,
  restoreKernelBodies, saveModelerPrefs, syncDensity,
} from "./modeler/prefs_snap.js";
import {
  buildPart, defFromBuiltin, refreshDecorations,
} from "./modeler/viewport_state.js";
import {
  applyAssemblyMates, initializeModelLibrary, invalidateInterference,
  refreshLibraryFromOtherTab,
} from "./modeler/library_assembly_state.js";
export { activeParts };
export { registerCustomModel };
export { findVisibleEnabledCoachTarget };
// for js/modeler/drawing_sheet.js (live bindings: it sees every reassignment)
export { pathSketchSpline };
// for js/modeler/dimension_entry.js (live bindings: it sees every reassignment)
export {
  SKETCH_MAX_SCALE, SKETCH_MIN_SCALE, closeReport, drawSketch, drawingSheet,
  finishPoly, hitPart, modelerTouchDistances, reportOpen,
};
// for js/modeler/sketch_guide.js (live bindings: it sees every reassignment)
export {
  E, H, closedSketchProfile, flash, newSketchPoint, openParametricFeature,
  refreshAll, root,
};
// for js/modeler/document_outputs.js (live bindings: it sees every reassignment)
export { explodedPlaybackStop };
// for js/modeler/export_measure.js (live bindings: it sees every reassignment)
export {
  BODY_OPERATIONS, FINISH_AMOUNT_KEY, THREE_POINT_KEYS, exactBuildTimers,
  exactRebuildQueue, exactSaveCache, pendingCutController,
};
// for js/modeler/library_panel.js (live bindings: it sees every reassignment)
export { assemblyPreviewSolved, decoGroups };
// for js/modeler/viewport_input.js (live bindings: it sees every reassignment)
export { refreshSelection };
// for js/modeler/notes_markups.js (live bindings: it sees every reassignment)
export { SVG_NS };
// for js/modeler/inspector.js (live bindings: it sees every reassignment)
export {
  CONSTRAINT_DEFS, DIMENSION_SYMBOLS, inspectorDirty, materialValidationTools,
  openSketchRepairs,
};
// for js/modeler/component_mates.js (live bindings: it sees every reassignment)
export {
  MATE_PALETTE, PLANE_NAME_KEYS, configuredComponentBuilds,
  mateReferenceRefreshes, mateTopologyMemo, requestDocumentType,
};
// for js/modeler/feature_tree.js (live bindings: it sees every reassignment)
export { PATTERN_MERGE_PREVIEW_DELAY };
// for js/modeler/tree_assembly.js (live bindings: it sees every reassignment)
export { FINISH_FEATURES, assemblyLibraryCache, modelLibraryCache };
// for js/modeler/sketch_dimension_editor.js (live bindings: it sees every reassignment)
export { RELATION_REFUSAL_MS };
// for js/modeler/sketch_entities.js (live bindings: it sees every reassignment)
export { SKETCH_ENTITY_TYPES };
// for js/modeler/welcome_coach.js (live bindings: it sees every reassignment)
export { WELCOME_STARTS };
// for js/modeler/view_modes.js (live bindings: it sees every reassignment)
export { swapView };
// for js/modeler/document_save.js (live bindings: it sees every reassignment)
export { documentSaveTasks, motionPlaybackCancel, partHistoryMarker };
// for js/modeler/command_manager.js (live bindings: it sees every reassignment)
export { COMMAND_TOOLTIP };
// for js/modeler/finish_preview.js (live bindings: it sees every reassignment)
export { PATTERN_IDENTITY_PLACEMENT, REPEATABLE_AMOUNT };
// for js/modeler/feature_create.js (live bindings: it sees every reassignment)
export { insertToolboxFastener, lastToolboxPick };
// for js/modeler/part_commands.js (live bindings: it sees every reassignment)
export { openFitCheckForm, openRackGearForm };
// for js/modeler/sketch_workflow.js (live bindings: it sees every reassignment)
export {
  ASSEMBLY_TAB_LABELS, ASSEMBLY_WORKFLOW, ASSEMBLY_WORKFLOW_ACTION,
  CAMERA_ONLY_VIEWS, MODEL_PLANE_TOOLS, PART_TAB_LABELS, PART_WORKFLOW,
  SKETCH_DRAW_TOOLS, SKETCH_TOOLS, histPanel, refreshAssemblyPosePreview,
};
// for js/modeler/viewport_decorations.js (live bindings: it sees every reassignment)
export { decoratedWorldPerPixel, viewportPartByMesh };
// for js/modeler/library_store.js (live bindings: it sees every reassignment)
export { LS_ASSEMBLIES, LS_MODELS, MATE_ISSUE_KEYS, libraryChannel };
// for js/modeler/build_dom.js (live bindings: it sees every reassignment)
export { RIBBON_RELATIONS, setEditorRoot, setHistPanel };
// for js/modeler/document_io.js (live bindings: it sees every reassignment)
export {
  assemblyBalloonCache, lastLibrarySaveConflict, lastLibrarySaveError,
  libraryOpenBaseline, massCoordinateSystemId, massDisplayUnits,
  set_assemblyOpenBaseline, set_cancelledExactPreview, set_coreRunFresh,
  set_explodedPlaybackStop, set_libraryOpenBaseline,
  set_massCoordinateSystemId, set_massDisplayUnits, set_motionPlaybackCancel,
  set_partHistoryMarker,
};
// for js/modeler/library_io.js (live bindings: it sees every reassignment)
export {
  lastAssemblySaveConflict, libThumbQueue, libThumbTimer,
  librarySearchQueries, modelerDraftOwnerId, set_assemblyLibraryCache,
  set_libThumbQueue, set_libThumbTimer, set_modelLibraryCache,
  set_modelerDraftCache, set_swapView,
};
// for js/modeler/viewport_drags.js (live bindings: it sees every reassignment)
export {
  instantVectors, markupsLastDrawnSig, markupsLastDrawnVis, notesScratch,
  set_instantVectors, set_markupsLastDrawnSig, set_markupsLastDrawnVis,
  set_notesScratch,
};
// for js/modeler/topology_pick.js (live bindings: it sees every reassignment)
export {
  _scratchPickNormal, _scratchToComponent, set__scratchPickNormal,
  set__scratchToComponent,
};
// for js/modeler/editor_forms.js (live bindings: it sees every reassignment)
export {
  assemblyOpenBaseline, exactWorkerActivitySubscribed,
  exactWorkerActivityTimer, propGen, set_assemblySolveFresh,
  set_exactWorkerActivitySubscribed, set_exactWorkerActivityTimer,
  set_propGen,
};
// for js/modeler/document_history.js (live bindings: it sees every reassignment)
export {
  _scratchSketchDir, _scratchSketchNdc, _scratchSketchRayOrigin,
  assemblySaveSessions, draftRevision, draftSaveTimer, flushModelerDraft,
  historySnapshots, modelerBackgroundState, modelerDraftCache,
  set__scratchSketchDir, set__scratchSketchNdc, set__scratchSketchRayOrigin,
  set_draftRevision, set_draftSaveTimer, set_modelerBackgroundState,
  set_modelerDraftOwnerId,
};
// for js/modeler/prefs_snap.js (live bindings: it sees every reassignment)
export {
  LS_MODELER_PREFS, MODELER_PREFS, MODELER_PREFS_VERSION, MODELER_VIEW_PREFS,
  cancelledExactPreview, set_pendingCutController,
};
// for js/modeler/viewport_state.js (live bindings: it sees every reassignment)
export {
  buildPartCount, lastDecoratedHover, set_buildPartCount,
  set_lastDecoratedHover,
};
// for js/modeler/library_assembly_state.js (live bindings: it sees every reassignment)
export {
  mateSolveCount, set_assemblyPreviewSolved, set_decoratedWorldPerPixel,
  set_lastAssemblySaveConflict, set_lastLibrarySaveConflict,
  set_lastLibrarySaveError, set_mateSolveCount,
};

var LS_MODELS = "home3d_models";
var LS_ASSEMBLIES = "home3d_assemblies";
var modelLibraryCache = [];
function set_modelLibraryCache(value) { return modelLibraryCache = value; }
var assemblyLibraryCache = [];
function set_assemblyLibraryCache(value) { return assemblyLibraryCache = value; }
var modelerDraftCache = null;
function set_modelerDraftCache(value) { return modelerDraftCache = value; }
var modelerDraftOwnerId = modelerDraftOwner(modelerSessionStorage());
function set_modelerDraftOwnerId(value) { return modelerDraftOwnerId = value; }
var libraryOpenBaseline = null;
function set_libraryOpenBaseline(value) { return libraryOpenBaseline = value; }
var assemblyOpenBaseline = null;
function set_assemblyOpenBaseline(value) { return assemblyOpenBaseline = value; }
var libraryChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("modelforge-model-library-v1");

/* The feature catalogue cannot import t() — it is a shared module loaded
   without a UI — so it asks for a translation through this resolver instead.
   An unknown key falls back to the catalogue's own English string. */
setFeatureLabelResolver(function (key, fallback) {
  return TXT[key] ? t(key) : fallback;
});

if(libraryChannel)libraryChannel.addEventListener("message",function(){
  libraryRefreshQueue=libraryRefreshQueue.then(refreshLibraryFromOtherTab).catch(function(){});
});
var libraryRefreshQueue=Promise.resolve();
var lastLibrarySaveConflict=false;
function set_lastLibrarySaveConflict(value) { return lastLibrarySaveConflict = value; }
var lastLibrarySaveError=null;
function set_lastLibrarySaveError(value) { return lastLibrarySaveError = value; }

var lastAssemblySaveConflict=false;
function set_lastAssemblySaveConflict(value) { return lastAssemblySaveConflict = value; }

var MATE_ISSUE_KEYS = {
  "missing-component": "mateIssueMissingComponent",
  "grounded-target": "mateIssueGroundedTarget",
  "unresolved-topology": "mateIssueUnresolved",
  "cyclic-context-dependency": "mateIssueContextCycle",
  "unresolved-context-dependency": "mateIssueContextDependency",
  "missing-topology": "mateIssueUnresolved",
  "ambiguous-topology": "mateIssueAmbiguous",
  "invalid-face-frame": "mateIssueBadFrame",
  "invalid-axis-frame": "mateIssueBadFrame",
  "invalid-tangent-frame": "mateIssueBadFrame",
  "invalid-angle-frame": "mateIssueBadFrame",
  "over-constrained": "mateIssueOverConstrained",
  "non-convergent": "mateIssueNonConvergent",
};

/* Set by a solve, cleared by the refresh that consumes it. Every mutating path
   is `solveAssembly(); refreshAll();`, and refreshAll solves again for the
   benefit of callers that changed the assembly without going through
   solveAssembly — so without this the whole multi-pass solve, plus its residual
   check, ran twice on every click. */
var assemblySolveFresh = false;
function set_assemblySolveFresh(value) { return assemblySolveFresh = value; }
var coreRunFresh = false;
function set_coreRunFresh(value) { return coreRunFresh = value; }
// Only true inside a synchronous full refresh whose solver already ran.
// A standalone viewport/drawing build still solves its current assembly.
var assemblyPreviewSolved = false;
function set_assemblyPreviewSolved(value) { return assemblyPreviewSolved = value; }

var decoGroups = [];
var viewportPartByMesh = new WeakMap();
/* Test seams. buildPart is called through its LOCAL binding everywhere, so a
   spy installed on a window handle can never observe it — the perf suite tried
   that and its counter silently read zero while hover rebuilt the whole scene.
   A counter incremented inside the function is the only honest signal, and the
   hover setter lets a test drive the one piece of state (E.hoverTopology) that
   decides whether decoration is per-component isolated. */
var buildPartCount = 0;
function set_buildPartCount(value) { return buildPartCount = value; }
var rebuildDocCount = 0;
var mateSolveCount = 0;
function set_mateSolveCount(value) { return mateSolveCount = value; }
if (typeof window !== "undefined") {
  window.cadDecoGroups = decoGroups;
  window.cadRefreshDecorations = refreshDecorations;
  window.cadBuildPart = buildPart;
  window.cadBuildPartCount = function () { return buildPartCount; };
  window.cadRebuildDocCount = function () { return rebuildDocCount; };
  window.cadPreviewWorkSnapshot = function () {
    return { builds: buildPartCount, rebuilds: rebuildDocCount, mateSolves: mateSolveCount, drawingToken: E.sheetToken };
  };
  /* Kernel bodies arrive asynchronously, so a test cannot settle for them — it
     has to poll for the answer or for the failure. This reports both without
     handing out the editor's whole state. */
  window.cadKernelBodySnapshot = function () {
    return (E.def && E.def.parts || []).filter(isKernelBody).map(function (part) {
      return {
        id: part.id, name: part.name, type: part.kernel && part.kernel.type,
        pending: !!part.exactPending, error: part.exactError || null,
        triangles: part.meshData ? (part.meshData.positions || []).length / 9 : 0,
        bounds: part.bounds ? { ...part.bounds } : null,
      };
    });
  };
  /* One committed body's raw tessellation. A triangle COUNT cannot see a live
     ghost writing through a shared buffer into the seed — the count is
     unchanged while every vertex has moved — so this hands back the numbers. */
  window.cadPartMeshSnapshot = function (partId) {
    var part = (E.def && E.def.parts || []).find(function (item) { return item.id === partId; });
    if (!part || !part.meshData) return null;
    var positions = part.meshData.positions || [];
    return { id: part.id, count: positions.length, positions: Array.prototype.slice.call(positions) };
  };
  /* Which tessellation buffers a live ghost SHARES with its seed. The speed of
     the live preview rests on sharing the big immutable ones and the
     correctness of it on copying the written ones, and object identity is the
     only honest way to state either. */
  window.cadSeedAndGhostMesh = function (seedId) {
    var seed = (E.def && E.def.parts || []).find(function (item) { return item.id === seedId; });
    var ghost = ((E.authoring && E.authoring.previewParts) || []).find(function (item) { return !!item.meshData; });
    if (!seed || !seed.meshData || !ghost) return null;
    return {
      sharesPositions: ghost.meshData.positions === seed.meshData.positions,
      sharesNormals: ghost.meshData.normals === seed.meshData.normals,
      sharesColors: ghost.meshData.colors === seed.meshData.colors,
      sharesSubshapeMap: ghost.meshData.subshapeMap === seed.meshData.subshapeMap,
      sharesTopology: ghost.meshData.topology === seed.meshData.topology,
    };
  };
  /* A pattern whose instances merge finishes in the kernel, AFTER the command
     has returned — the copies are laid synchronously and the fuse is a second,
     asynchronous pass. E.patternFusion is that pass, and awaiting it is the
     only honest way for a test to see the finished document; there is no frame
     to settle for, because rAF never fires in a headless pane. */
  window.cadPatternRun = function (params) {
    var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
    if (part) E.sel = part;
    var ok = quickPatternPart(params);
    return Promise.resolve(E.patternFusion).then(function () { return ok; });
  };
  window.cadBodySnapshot = function () {
    return activeParts(E.def).map(function (part) {
      return {
        id: part.id, kind: part.kind, merges: (part.merges3d || []).length,
        fused: (part.merges3d || []).reduce(function (total, entry) { return total + (entry.placements || []).length; }, 0),
        pending: !!part.exactPending, error: part.exactError || null,
        /* The turn the body is DRAWN with, and the placements stored inside it:
           the two halves a merged instance's world position is made of, so a
           test can check they still multiply out to where the copy was laid. */
        rotations: partPatternRotations(part),
        placements: (part.merges3d || []).filter(function (entry) { return entry.kind === "placed"; })
          .reduce(function (all, entry) { return all.concat(entry.placements || []); }, []),
        triangles: part.meshData ? (part.meshData.positions || []).length / 9 : 0,
      };
    });
  };
  /* The rows the exact tree is built from — what STEP/IGES, mass properties and
     interference see, as opposed to what the viewport draws. Legacy documents
     rebuild from parts here; a parametric-v1 history already owns its features,
     and projecting them again drops sketch selections. */
  window.cadFeatureTreeSnapshot = function () {
    var hasAuthoredTree = Array.isArray(E.def.features) && E.def.features.length > 0;
    if (!isCanonicalAuthoring() || !hasAuthoredTree) rebuildFeatureTreeFromDocument();
    return (E.def.features || []).map(function (feature) {
      return { id:feature.id, type:feature.type, inputs:(feature.inputs || []).slice(), params:cloneData(feature.params || {}) };
    });
  };
  window.cadSetHoverTopology = function (reference) { E.hoverTopology = reference || null; };
  /* What the selection grammar actually did, as opposed to what the source
     says it should do. E.sel is reported by KIND rather than by value because
     the bug this guards against was a sketch entity being assigned to the slot
     that holds the selected solid — a check on the count alone would miss it. */
  /* Drive the selection operations without synthesising a pointer sequence: a
     browser test can pick a reference and grow it the way the menu does, which
     is the behaviour worth pinning rather than the click that reached it. */
  window.cadSelectTopologyById = function (persistentId) {
    var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
    var entry = topologyEntriesForPart(part).find(function (item) { return item.persistentId === persistentId; });
    if (!entry) return false;
    E.sel = part;
    E.topologySelection = [topologyReferenceFromEntry(entry)];
    refreshSelection();
    return true;
  };
  window.cadRunSelectionOperation = function (id) { runSelectionOperation(id); };
  /* What the finish preview actually put in the scene, and what the badge is
     claiming about it. The approximation runs off requestAnimationFrame, which
     never fires in a headless pane, so a test opens the form (which syncs the
     preview directly) and reads the result here rather than waiting for a
     frame that will not come. */
  window.cadOpenFeatureForm = function (type) {
    openParametricFeature(type);
    return !!(E.authoring && E.authoring.featureType === type);
  };
  /* closeFeaturePanel() is the one way a feature form is dismissed, and the one
     place the preview teardown has to live — reachable on its own so a test can
     prove that rather than proving a Cancel button that clears first. */
  window.cadCloseFeatureForm = function () { closeFeaturePanel(); };
  /* Retype the open form's parameters and resync its preview, the way editing a
     field does — minus the frame. queueNewFeaturePreview runs off
     requestAnimationFrame, which never fires in a headless pane, so a test that
     waited for one would see a preview that never moved. The body the feature
     works on is picked the way cadPatternRun picks it, since a pattern with no
     seed selected has nothing to preview. */
  window.cadSetFeatureFormParams = function (params) {
    var state = E.authoring && E.authoring.featurePreviewState;
    if (!state || !E.authoring.featureType) return false;
    if (!selectedSolid()) E.sel = activeParts(E.def)[activeParts(E.def).length - 1] || E.sel;
    state.params = { ...state.params, ...(params || {}) };
    syncNewFeaturePreview(E.authoring.featureType, state, E.authoring.featurePreviewBadge);
    refreshLivePreview();
    return true;
  };
  /* Retype an EXISTING feature's parameters the way dragging its form does,
     minus the frame: openFeatureEditor's live callback runs off
     requestAnimationFrame, which never fires in a headless pane. */
  window.cadEditFeatureParams = function (featureId, params) {
    var feature = (E.def.features || []).find(function (item) { return item.id === featureId; });
    if (!feature) return false;
    var editing = function () { return !!(E.authoring && E.authoring.featureEdit && E.authoring.featureEdit.featureId === featureId); };
    if (!editing()) openFeatureEditor(feature);
    if (!editing()) return false;
    feature.params = { ...feature.params, ...(params || {}) };
    syncLiveFeatureEdit(feature);
    return true;
  };
  /* Where every body actually SITS after a live edit, and what the kernel tier
     is still owed. A downstream body that did not follow reports the extent it
     had before the edit, which is the whole defect this guards. */
  window.cadLiveEditSnapshot = function () {
    var badge = liveFeatureEditBadge();
    return {
      downstream: E._liveDownstream ? { state: E._liveDownstream.state, features: E._liveDownstream.features.slice() } : null,
      badge: badge ? { state: badge.getAttribute("data-preview-state"), text: (badge.textContent || "").trim() } : null,
      bodies: (E.def.parts || []).filter(function (part) { return !part.previewOnly; }).map(function (part) {
        var bounds = partBounds(part);
        return {
          id: part.id, featureId: part.featureId || null, derivedFeatureId: part.derivedFeatureId || null,
          from: part.from, to: part.to,
          pending: !!part.exactPending, error: part.exactError || null,
          triangles: part.meshData ? (part.meshData.positions || []).length / 9 : 0,
          bounds: bounds ? { x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1, z0: bounds.z0, z1: bounds.z1 } : null,
        };
      }),
    };
  };
  window.cadFinishPreviewSnapshot = function () {
    var badge = root && root.querySelector("#mdQuickSettings .md-feature-live");
    return {
      type: (E.authoring && E.authoring.featureType) || null,
      // what the form has actually collected, so a test can prove a control is
      // read rather than merely rendered
      params: cloneData((E.authoring && E.authoring.featurePreviewState && E.authoring.featurePreviewState.params) || null),
      patternOverlap: !!(E.authoring && E.authoring.patternOverlap),
      approximate: !!(E.authoring && E.authoring.approxFinishPreview),
      replaces: (E.authoring && E.authoring.previewReplacesPartId) || null,
      parts: ((E.authoring && E.authoring.previewParts) || []).map(function (part) {
        return {
          id: part.id, kind: part.kind, color:part.color, approximate: !!part.approximate,
          points: (part.pts || []).length, holes: (part.holes || []).length,
          // a fused pattern cluster is a mesh and nothing else, so the triangle
          // count is the only thing that says the kernel really answered
          merged: !!part.merged, triangles: part.meshData ? (part.meshData.positions || []).length / 9 : 0,
        };
      }),
      /* The merged pattern's second pass: which stage it is at, and how many
         bodies it says the run will end up as. It is async and debounced, so a
         test polls this rather than settling. */
      merge: cloneData((E.authoring && E.authoring.mergedPatternPreview) || null),
      badge: badge ? { state: badge.getAttribute("data-preview-state"), text: (badge.textContent || "").trim() } : null,
      formOpen: !!(root && root.querySelector("#mdQuickSettings") && !root.querySelector("#mdQuickSettings").hidden),
    };
  };
  /* Pick a real face on a component, the way a viewport click does — from the
     component's own topology, not from its bounding box. A mate test that
     cannot do this can only exercise the envelope fallback, which is exactly
     the thing that had to go. */
  window.cadClearTopologySelection = function () { E.topologySelection = []; refreshSelection(); };
  window.cadAssemblySnapshot = function () {
    return { components: (E.assembly && E.assembly.components || []).map(function (item) { return item.id; }) };
  };
  window.cadSelectComponentFace = function (componentId, want) {
    var component = (E.assembly && E.assembly.components || []).find(function (item) { return item.id === componentId; });
    if (!component) return null;
    var match = typeof want === "string" ? { semantic: want } : (want || {});
    var entry = null;
    pickPartsFor(component).some(function (part) {
      entry = topologyEntriesForPart(part).find(function (item) {
        if (item.kind !== "face") return false;
        if (match.semantic && item.descriptor.semantic !== match.semantic) return false;
        if (match.surface && item.descriptor.surface !== match.surface) return false;
        return true;
      });
      return !!entry;
    });
    if (!entry) return null;
    var reference = stampComponentRef(topologyReferenceFromEntry(entry), component, null);
    E.componentSel = [component];
    E.sel = component;
    E.topologySelection = (E.topologySelection || []).concat([reference]);
    refreshSelection();
    return reference.persistentId;
  };
  /* Named selections without driving the naming sheet: the sheet is its own
     surface with its own tests, and what matters here is that a set round
     trips through the document. */
  window.cadSaveNamedSelection = function (name) {
    var refs = dedupeFinishRefs(E.topologySelection || []);
    if (!refs.length) return 0;
    var list = namedSelections();
    var at = list.findIndex(function (entry) { return entry.name === name; });
    var record = { id: at >= 0 ? list[at].id : uid(), name: name, refs: cloneData(refs) };
    if (at >= 0) list[at] = record; else list.push(record);
    return refs.length;
  };
  window.cadRestoreNamedSelection = function (name) {
    restoreNamedSelection(namedSelections().find(function (record) { return record.name === name; }));
    return (E.topologySelection || []).length;
  };
  window.cadVertexCount = function () {
    var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
    return vertexEntriesFrom(topologyEntriesForPart(part)).length;
  };
  window.cadSelectionSnapshot = function () {
    var topology = E.topologySelection || [];
    return {
      mode: E.mode,
      tool: E.tool,
      modelPlane: !!E.modelPlaneActive,
      filter: E.selectionFilter,
      sketchFilterAvailable: selectionFilterAvailable("sketch"),
      activeFilter: commandSelectionPrefer(),
      topology: topology.length,
      kinds: topology.map(function (reference) { return reference.kind; }),
      ids: topology.map(function (reference) { return reference.persistentId; }),
      shapes: topology.map(function (reference) { var d = reference.descriptor || {}; return d.curve || d.surface || null; }),
      selKind: !E.sel ? null : E.sel.kind ? "part" : E.sel.type ? "entity" : "other",
      sketchSel: (E.ssel || []).length,
      cycle: E.pickCycle ? { index: E.pickCycle.index, count: E.pickCycle.candidates.length } : null,
    };
  };
  /* The modelling loop, in the four terms the loop is judged by: what the ghost
     currently claims, what the document actually owns, how many undo steps the
     commit cost, and whether the viewport was still the thing being looked at.
     Assembled here rather than read off six globals in the test, so a rename
     inside the editor breaks the seam instead of quietly passing. */
  window.cadLoopSnapshot = function () {
    var preview = E.authoring && E.authoring.featurePreviewState;
    var history = (E.def && E.def.history) || [];
    var last = history[history.length - 1] || null;
    var feature = last && E.def && (E.def.features || []).find(function (f) { return f.id === last.targetId; });
    var corner = confirmationCornerState(currentCornerInput());
    var actions = root && root.querySelector("#mdQuickSettings .md-feature-actions");
    return {
      steps: history.length,
      parts: ((E.def && E.def.parts) || []).length,
      undoDepth: H.length(),
      undoPosition: H.position(),
      authoring: (E.authoring && E.authoring.featureType) || null,
      ghost: preview ? { type: preview.type, params: { ...preview.params } } : null,
      last: last ? { kind: last.kind, name: last.name } : null,
      lastFeature: feature ? { type: feature.type, params: { ...feature.params } } : null,
      corner: { visible: corner.visible, mode: corner.mode, canAccept: corner.canAccept },
      formActionsHidden: actions ? !!actions.hidden : null,
      formActionsPresent: !!actions,
    };
  };
}

var lastDecoratedHover = null;
function set_lastDecoratedHover(value) { return lastDecoratedHover = value; }
/* What one pixel was worth when the decorations were last built. Highlight
   tubes are real geometry, so a screen-space width has to be re-baked when the
   zoom moves enough to notice — but only then: rebuilding on every frame of an
   orbit is exactly the churn the decoration cache exists to avoid. */
var decoratedWorldPerPixel = 0;
function set_decoratedWorldPerPixel(value) { return decoratedWorldPerPixel = value; }

// custom-model defs referenced by the given items (for embedding in scene exports)
/* usedCustomModels() and refreshCatalogSelect() moved to js/model_catalog.js:
   they only touch FURN/CATALOG/DOM, and keeping them here is what forced this
   830 KB editor onto the eager boot graph. Imported back below. */

// Load definitions before main fills the select. localStorage keeps only a
// compact index; geometry, textures and exact attachment references live in IDB.
await initializeModelLibrary();
loadLib().forEach(registerCustomModel);

/* ================= editor state ================= */
var E = {
  open: false,
  docType: "part",    // part | assembly
  def: null,          // model being edited
  assembly: null,
  brepRun: null,
  /* Which document, at which revision, E.brepRun was regenerated from. The
     exact run is a cache of a kernel solve that costs seconds; without a stamp
     the exports below could not tell a current shape from a shape belonging to
     a model the user closed two documents ago. See exactRunIsCurrent(). */
  brepStamp: null,
  coreRun: null,
  exactRestoring: false,
  lastCutSkipped: [],   // bodies the last cut passed through but could not take
  componentSel: [],   // assembly multi-selection; last entry is primary
  sel: null,          // selected part
  tool: "select",
  mode: "3d",          // "2d" sketch | "3d" model | "drawing" read-only sheet
  displayStyle: "solid", // viewport-only: solid | transparent
  showModelEdges: true,  // shaded-with-edges; off is shaded-only
  edgeColor: "#111111",
  selectedEdgeColor: "#ff7a00",
  selectedFaceColor: "#ff7200",
  hoverColor: "#24b7ff",
  lightMatchRoom: false,
  lightAzimuth: 35,
  lightElevation: 47,
  lightDistance: 470,
  modelPlaneActive: false, // sketch canvas over the solid model, on E.view
  view: "top",        // top | front | side
  scl: 2,             // px per cm
  ox: 0, oy: 0,       // canvas pan (px)
  grid: 5, osnap: true,
  depth: 60, baseOff: 0,
  wallWidth: 10,
  wallPts: null,      // connected line/wall centreline currently being drawn
  dynInput: null,     // typed dimension entry while drawing {field, values{}}
  poly: null,         // in-progress polygon [{u,v}]
  ssel: [],           // sketch selection: entities and/or points, in pick order
  arcPts: null,       // in-progress arc [centre, start]
  slotPts: null,      // in-progress slot centreline [start, end]
  ellPts: null,       // in-progress ellipse [centre, major axis end]
  polySides: 6,       // side count the polygon tool draws with
  solveInfo: null,    // last solver report: DOF, status, conflicting constraint ids
  topologySelection: [], // persistent face/edge/axis references from the 3D viewport
  flashUntil: 0,      // while in the future, flash() owns #mdHint and syncHint stands off
  measure: null,      // active Measure command: {mode, picks:[]}
  evalCard: null,     // which command owns the non-modal #mdEvalCard right now
  selectedReferenceId: null, // FeatureManager / overlay pick of a datum or helix
  facePick: null,     // {tool} while a new sketch is waiting for a face click in 3D
  hoverTopology: null, // topology reference under the cursor in the 3D viewport
  pickCycle: null,    // {candidates, index, x, y} for the "N of M here" chip
  lastFinishAmount: null, // repeat-last seed per finish feature type
  hoverPoint: null,   // where the cursor's ray last met the model, for Measure
  profileOffer: null, // feature types a just-finished closed profile can become
  filterChord: null,  // a held Shift+digit filter, to restore on release
  selectionFilter: "all",
  assemblyMoveMode: "free", // free camera-plane motion | world X/Y/Z axis lock
  mobileAddSelection: false,
  inferenceIndex: 0,
  inferenceCandidates: [],
  overlays: { shortcut: false, views: false, menu: false, gesture: false },
  /* Automatic orientation is on by default, like SolidWorks: a sketch opens
     looking straight at its plane so a screen square is a plane square. This
     preference only governs sketch entry; toolbar Normal To and Ctrl+8 are
     one-shot commands, and orbiting immediately frees the camera. Typed
     dimensions stay opt-out. */
  sketchNormalTo: true,
  sketchCameraReturnPose: null,
  autoDimTyped: true,
  section: { enabled:false, axis:"x", offset:0, flip:false },
  interferenceHits: [],
  buildComponent: null,   // component whose parts are being built right now
  mateIssues: [],         // what the last solve could not do, per mate
  mateRebindings: [],
  mateUnsatisfied: [],    // mates another mate has overridden
  mateFreedom: [],        // per-cluster degrees of freedom from the last solve
  mateDegreesOfFreedom: 0,
  mateMobilityReport: null,
  interferenceChecked: false,
  interferenceRevision: 0,
  dependencyHighlight: null,
  leftCollapsed: false,
  rightCollapsed: true,
  rightCollapsedPreference: true,
  workflowVisible: true,
  expertDensity: false,
  drag: null,
  touchPrecision: null, // active finger + visual-only precision loupe while authoring
  dimPick: [],        // first/second smart-dimension endpoints in the sketch
  dimSel: null,       // selected placed dimension constraint id
  sheet: null,        // the drafting table (modeler_drawing.js), built on demand
  sheetToken: 0,      // bumped whenever the model rebuilds, to re-project views
  dimEditor: null,    // contextual value editor beside a placed dimension
  cv: null, cx: null,
  pv: null,           // preview {renderer,scene,camera,group,az,el,dist}
  commandTab: "features",
  commandHighlight: 0,
  commandSearchRestore: null,
  kernelBusy: false,  // an exact-kernel regeneration is in flight
  treeQuery: "",
  tour: { active: false, track: null, mode: null, step: 0, completed: {}, baseline: null, target: null, autoOrigin: null, position: null, drag: null, moved: false, keepResult: false },
  authoring: { phase:"model", referenceId:null, sketchId:null, featureType:null, sketchSelection:[], workflowFocus:"context" },
  lastSketchReferenceId: null,
  /* Onboarding surfaces. Both are per-user prefs (persisted below); the welcome
     screen is per-opening and the coach's session dismissal resets on open. */
  welcomeOnOpen: true,  // show the visual start screen when opening on a fresh model
  coachEnabled: true,   // slim "next step" coach bar under the workflow nav
  welcomeOpen: false,
  coachDismissed: false, // per-session: the X on the coach bar
  paintColor: "#3b82f6",
  paintMode: "face",
  paintMetal: 0.1,
  paintRough: 0.5,
  paintEyedropper: false,
  notesVisible: true,
  activeNoteId: null,
  noteEditorOpen: false,
  noteMode: "callout",
  markupColor: "#ef4444",
  markupWidth: 3,
  activeMarkupStroke: null,
};

/* Sketching habits are per-user, not per-document — they outlive the model the
   switch happened to be flipped in. */
var LS_MODELER_PREFS = "home3d_modeler_prefs";
var MODELER_PREFS_VERSION = 2;
var MODELER_PREFS = ["sketchNormalTo", "autoDimTyped", "osnap", "welcomeOnOpen", "coachEnabled", "workflowVisible", "expertDensity", "rightCollapsedPreference"];
var MODELER_VIEW_PREFS = ["edgeColor", "selectedEdgeColor", "selectedFaceColor", "hoverColor", "lightMatchRoom", "lightAzimuth", "lightElevation", "lightDistance"];
loadModelerPrefs();

/* Sketch zoom, in screen px per cm. The old ceiling of 20 (1000%) left the
   book's R .1 in sketch fillet about 5 px across, so its endpoints always won
   the pick and the arc itself could not be selected for Mirror. CAD zoom is
   effectively unbounded; 2000 px/cm shows a 0.01 mm feature as 2 px.
   Fit uses the same range so small parts remain editable. */
var SKETCH_MIN_SCALE = 0.3, SKETCH_MAX_SCALE = 2000;

var exactBuildTimers = new WeakMap();
var cancelledExactPreview = null;
function set_cancelledExactPreview(value) { return cancelledExactPreview = value; }


var pendingCutController=null;
function set_pendingCutController(value) { return pendingCutController = value; }

/* ================= undo =================
   Tree machinery is shared (edit_history.js); the modeler only says what a
   snapshot is and what is inside one. It stays local to the editor: Ctrl+Z
   here walks the part list, and when it runs out it stops rather than escaping
   into the plan's history. Leaving the modeler is what commits or drops the
   session.

   The snapshot carries BOTH documents. An assembly lives on E.assembly rather
   than on E.def, so while only the def was recorded, every component insert,
   mate and delete pushed a step that restored an identical part document —
   undo in an assembly appeared to do nothing at all.

   Meshes and exact topology caches are pooled: a vanity whose two doors embed
   a rolled hinge snapshot at ~8 MB, nearly all of it these caches, and every
   placement edit used to store another full copy (docs/cad-undo-memory.md). */
const historySnapshots = createHistorySnapshotCodec(["meshData", "exactTopologyCache"]);
const H = createHistory({
  get: snapDoc,
  editScope: () => E.contextEdit ? "component" : E.docType,
  set: function (s) {
    var o = historySnapshots.parse(s);
    if(E.contextEdit && o.contextComponentId!==undefined && (o.contextComponentId!==E.contextEdit.componentId || JSON.stringify(o.contextComponentPath || [o.contextComponentId])!==JSON.stringify(E.contextEdit.path || [E.contextEdit.componentId]))){flash('This component history belongs to a different occurrence');return;}
    // Evaluation values describe the document being left, including its mass.
    closeEvalCard();
    E.def = o.d;
    if (!E.contextEdit || o.contextComponentId !== E.contextEdit.componentId || JSON.stringify(o.contextComponentPath || [o.contextComponentId])!==JSON.stringify(E.contextEdit.path || [E.contextEdit.componentId])) {
      // Undo/Redo allocates a new snapshot within the same editing session.
      if (E.assembly && o.a && E.assembly.key === o.a.key)
        assemblySaveSessions.set(o.a,assemblySaveSession(E.assembly));
      E.assembly = o.a || null;
    }
    // Undo restores document metadata too. Leaving the stale name textbox
    // behind would write the undone name back into the next Save.
    syncHead();
    // Drawing mode intentionally skips the 3D preview rebuild. Its cached
    // projections must still follow the document restored by Undo or Redo.
    invalidateDrawing();
    invalidateInterference();
    // the selected part / entity / component may not exist in the restored doc
    E.sel = null;
    E.ssel = [];
    E.topologySelection = [];
    E.facePick = null;
    E.componentSel = [];
    // Solver state is derived from the restored sketch, not part of the undo
    // snapshot. Reusing the report from the state we just left made the tab
    // badge disagree with the restored geometry until another edit happened.
    if (E.docType === "part" && E.def) resolveSketch(false);
    refreshAll();
    if (E.mode === "drawing") syncSheetPanel();
  },
  scan: scanDoc,
  subtree: docSubtree,
  onChange: function () { historySnapshots.retain(H.retainedSnapshots()); syncUndoButtons(); },
});

// A library open starts a fresh session, even when it reopens the same key.
const assemblySaveSessions = new WeakMap();
let partHistoryMarker = {savedEdit:0};
function set_partHistoryMarker(value) { return partHistoryMarker = value; }

var histPanel = null;
function setHistPanel(value) { histPanel = value; }
var draftSaveTimer = 0;
function set_draftSaveTimer(value) { return draftSaveTimer = value; }
var draftRevision = 0;
function set_draftRevision(value) { return draftRevision = value; }

/* A draft that cannot be written means crash recovery is off, which the user
   has no other way to find out. Said once per session: this runs on a timer
   after every edit, and a warning on each one would be its own problem. */
var draftFailureReported = false;
function flushModelerDraft() {
  draftSaveTimer = 0;
  if (!E.open || !(E.docType === "assembly" ? E.assembly : E.def)) return;
  var revision = ++draftRevision;
  var payload = { docType: E.docType, def: E.def, assembly: E.assembly,
    dirty:residentDirtyState(), previousDef:E.contextEdit?.previousDef,
    libraryBaseline:libraryOpenBaseline, assemblyBaseline:assemblyOpenBaseline };
  var parsed = parseModelerDraft(serializeModelerDraft(payload));
  modelerDraftCache = parsed;
  saveModelerDraftRecord(parsed,modelerDraftOwnerId).then(function () {
    if (revision !== draftRevision) return;
    try { localStorage.setItem(modelerDraftKey(modelerDraftOwnerId), JSON.stringify({ v: parsed.v, at: parsed.at, docType: parsed.docType, indexedDB: true })); }
    catch (error) {}
    draftFailureReported = false;
    syncDraftStatus("draftSaved");
  }).catch(function () {
    if (revision !== draftRevision) return;
    if (writeModelerDraft(modelerDraftStorage(), payload, undefined, modelerDraftOwnerId)) {
      draftFailureReported = false;
      syncDraftStatus("draftSaved");
      return;
    }
    syncDraftStatus("draftSaveFailed");
    if (!draftFailureReported) { draftFailureReported = true; flash(t("draftSaveFailed")); }
  });
}

var _scratchSketchNdc = null;
function set__scratchSketchNdc(value) { return _scratchSketchNdc = value; }
var _scratchSketchDir = null;
function set__scratchSketchDir(value) { return _scratchSketchDir = value; }
var _scratchSketchRayOrigin = null;
function set__scratchSketchRayOrigin(value) { return _scratchSketchRayOrigin = value; }

/* ================= DOM ================= */
var root = null;
// buildDOM lives in js/modeler/build_dom.js; an imported binding is read-only
function setEditorRoot(value) { root = value; }
var modelerBackgroundState = [];
function set_modelerBackgroundState(value) { return modelerBackgroundState = value; }
var modelerReturnFocus = null;

var swapView = null;
function set_swapView(value) { return swapView = value; }

/* The relations the ribbon promotes out of the inspector palette — the seven
   that carry most of a sketch. They are the same CONSTRAINT_DEFS entries the
   palette renders, gated by the same constraintFits and applied by the same
   applyConstraint; nothing about the palette changes. */
var RIBBON_RELATIONS = ["coincident", "horizontal", "vertical", "parallel", "perpendicular", "tangent", "equal"];

/* The chrome is built once, with the labels of the language current at the
   time — and every icon's caption and the whole shortcut sheet are baked in at
   that moment. Throw it away on a language switch so the next open rebuilds it
   in the new one; the panes re-label themselves on every refresh anyway. */
function destroyDOM() {
  E.pv?.dispose();
  E.pv = null;
  swapView = null; // it closes over elements that are about to be removed
  histPanel = null;
  E.cv = null;
  E.cx = null;
  E.mode = "3d";
  E.modelPlaneActive = false;
  window.removeEventListener("keydown", onKey);
  teardownModelerMobile(); // returns any borrowed panel before root is dropped
  /* Before root.remove(): unregistering the panes makes uikit drop the four
     containers and hand the group elements back INTO the tree that is about to
     go, rather than being left holding them in a detached one. */
  ribbon.detach();
  setModelerBackgroundIsolation(false);
  if (root) root.remove();
  root = null;
}

var WELCOME_STARTS = [
  { id:"blank", art:"blank", title:"welcomeBlank", desc:"welcomeBlankDesc" },
  { id:"assembly", art:"assembly", title:"welcomeAssemblyDoc", desc:"welcomeAssemblyDocDesc" },
  { id:"box", art:"box", title:"welcomeShapeBox", desc:"welcomeShapeDesc", command:"directbox" },
  { id:"cyl", art:"cyl", title:"welcomeShapeCyl", desc:"welcomeShapeDesc", command:"directcyl" },
  { id:"sph", art:"sph", title:"welcomeShapeSph", desc:"welcomeShapeDesc", command:"directsph" },
];

var SKETCH_TOOLS = ["wall", "sketchpoint", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline", "dim", "trim", "extend", "sketchfillet", "offset", "constr"];

/* The tools that DRAW, as opposed to the ones that edit what is already drawn.
   Only these may open a sketch from model mode: "start drawing and I will make
   you a sketch" is a reasonable offer, while Trim or Dimension arriving on an
   empty new sketch is an offer to edit nothing. */
var SKETCH_DRAW_TOOLS = ["wall", "constr", "sketchpoint", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline"];

/* Which tools own the sketch sheet. Everything else — Select above all — used
   to open it too: setTool() armed E.modelPlaneActive for ANY tool change in
   3D, so pressing V, or leaving Paint with Escape, laid #mdCanvas over the
   viewport and killed face picking until you pressed Finish plane. It also
   silently re-mapped the keyboard, because the Paint and Note chords are gated
   on !E.modelPlaneActive and fall through to KEY_TOOL's sketch tools once the
   sheet is up. One accidental overlay, three keys changed meaning. */
var MODEL_PLANE_TOOLS = SKETCH_TOOLS.concat(["rect", "circle", "sph", "poly", "rev", "cut", "cutc"]);
if (typeof window !== "undefined") window.cadSketchSnapshot = cadSketchSnapshot;

var ASSEMBLY_WORKFLOW_ACTION = {
  context: function () { setTab("parts"); },
  reference: function () {
    // grounding lives on the component pane, next to visibility
    if (!E.sel && E.assembly && E.assembly.components.length) {
      E.componentSel = [E.assembly.components[0]]; E.sel = E.componentSel[0];
    }
    setTab("look");
  },
  sketch: function () { setTab("ops"); },
  feature: function () { runInterferenceCheck(); },
  history: function () { saveCurrentDocument(); },
};

var PART_WORKFLOW = ["wfPart", "wfReference", "wfSketch", "wfFeature", "wfHistory"];
/* An assembly is not sketched into being — it is filled, anchored, related,
   checked and saved. Same five slots, so the bar keeps its shape, but naming
   them after part authoring left every backend improvement in this editor
   sitting behind a road sign for somewhere else. */
var ASSEMBLY_WORKFLOW = ["wfInsert", "wfGround", "wfMate", "wfCheck", "wfSave"];

/* Sketch / Shape / Finish are what a part's panes hold. An assembly's hold the
   component, where it sits, and what relates it — so they say so, and the
   sketch pane, which has nothing to show here, steps out of the strip. */
var ASSEMBLY_TAB_LABELS = { shape: "tabPlacement", look: "tabComponent", ops: "tabMates" };
var PART_TAB_LABELS = { shape: "tabShapeShort", look: "tabLookShort", ops: "tabOpsShort" };

/* Views that only turn the camera. Isometric, Back, Left and Bottom have no sketch
   plane of their own, so they must not touch E.view: that swaps the active
   sketch, and an Extrude Cut taken right after would cut from the wrong one. */
var CAMERA_ONLY_VIEWS = ["iso", "back", "left", "bottom"];

/* What the phone and fold header names (js/pro_compact.js): the sketch being
   drawn and the tool in hand, else the picked part, else the model. */
window.__modelerHeadState = function () {
  if (!E.open || !E.def) return null;
  var sketching = E.mode === "2d" || !!E.modelPlaneActive;
  var sketch = sketching ? ensureSketch(E.def) : null;
  var part = E.sel && Array.isArray(E.def.parts) && E.def.parts.indexOf(E.sel) >= 0 ? E.sel : null;
  return {
    model: (E.docType === "assembly" && E.assembly ? E.assembly.name : E.def.name) || "",
    sketch: sketch ? sketch.name || planeLabel(sketch.plane) : "",
    part: part ? part.name || "" : "",
    tool: E.tool || "",
    mode: E.mode || "",
  };
};

// The pro ribbon and the app-wide ⌘K palette run model commands through this.
window.__modelerRunCommand = function (id) {
  if (!root || !E.open) return false;
  // Asked for a specific command: the start-here screen would only be in the way.
  closeWelcome();
  runCommand(id);
  return true;
};

/* "Merge instances", the last of the pattern controls that was declared and
 * never read.
 *
 * WHAT IT MEANS. Copies that share material with a neighbour — or with the seed
 * — become ONE solid: the wall between them goes, and the shared material is
 * counted once. Copies that reach nothing stay bodies of their own. The number
 * of bodies is therefore the geometry's answer, not the flag's: a tight run
 * collapses to one, a spread run stays N, a partly overlapping run comes out as
 * however many connected clusters it actually forms.
 *
 * WHY THE COPIES ARE LAID FIRST AND FUSED SECOND. Whether two solids share
 * material is a question only the kernel can answer (two thin radial blades
 * have overlapping bounding boxes and touch nowhere), and the kernel is
 * asynchronous while laying a pattern is not. So placePatternCopy stays the one
 * place an instance is put down, the document holds the honest un-merged run
 * until the answer arrives, and a kernel failure leaves that run standing
 * rather than a half-fused ghost.
 *
 * WHY merges3d AND NOT A NEW PART KIND. A fused cluster is one body made of a
 * host plus solids fused into it, which is what merges3d already means:
 * exactBrepForPart fuses them, partNeedsExactMesh already knows such a body
 * needs the kernel, emitPartMerges already unions them into the exact tree that
 * feeds STEP/IGES, mass and interference, and the host keeps its own identity —
 * so the seed of a patterned extrude can still have its depth retyped
 * afterwards. Several clusters are simply several hosts. The one thing merges3d
 * could not previously express is a tool that is another BODY under a rigid
 * transform, which is what the "placed" merge kind adds. */
var PATTERN_IDENTITY_PLACEMENT = { matrix:[1,0,0,0,1,0,0,0,1], translation:{x:0,y:0,z:0} };

function insertToolboxFastener(kind, size, lengthMm, extra) {
  if(!kind){ showToolboxPicker(); return false; }
  var assemblyTarget=E.docType==="assembly" && E.assembly;
  if(E.docType!=="part" && !assemblyTarget)setDocumentType("part");
  extra = extra || {};
  var modeled = kind==="hex-screw" || kind==="hex-bolt";
  var fastener=toolboxFastener(Object.assign({
    kind:kind,
    size: extra.sizeKey || size || "M8",
    sizeKey: extra.sizeKey || extra.key || size,
    lengthMm:lengthMm,
    threadMode: modeled ? "modeled" : "cosmetic",
    lod:2
  }, extra));
  if(fastener && fastener.ok===false){
    flash(fastener.message || t("toolboxFastener"));
    return false;
  }
  if(assemblyTarget){
    S.idc=nextDocumentNumericId(assemblyTarget,S.idc);
    var toolboxDef;
    try{toolboxDef=assemblyToolboxDocument(fastener,{key:"cm_toolbox_"+Date.now().toString(36),nextId:uid});}
    catch(error){flash(String(error.message || error));return false;}
    pushUndo(t("toolboxFastener"));
    var count=assemblyTarget.components.length;
    var occurrence={id:uid(),modelKey:toolboxDef.key,name:toolboxDef.name,def:toolboxDef,visible:true,grounded:count===0,transform:{x:count*25,y:0,z:0,rx:0,ry:0,rz:0}};
    assemblyTarget.components.push(occurrence);
    invalidateInterference();E.componentSel=[occurrence];E.sel=occurrence;
    lastToolboxPick={kind:kind,label:fastener.callout || kind};
    refreshAll();fitPreview();flash("✓ "+fastener.callout);return true;
  }
  pushUndo(t("toolboxFastener"));
  var feature=null;
  if(isCanonicalAuthoring()){
    try{
      feature=createFeatureDefinition(E.def,"toolbox",{
        name:fastener.callout,
        references:{sketches:[],features:[],topology:[],references:[]},
        params:cloneData(fastener.sourceOptions || Object.assign({},extra,{kind:kind,sizeKey:extra.sizeKey || size,lengthMm:lengthMm})),
      });
      feature.toolboxAutoName=fastener.callout;
    }catch(error){H.discard();flash(String(error.message||error));return false;}
  }
  var addedParts=fastener.parts.map(function(part){return addPart(Object.assign({id:uid(),featureId:feature && feature.id,toolboxFeatureId:feature && feature.id},part));});
  if(E.def && fastener.metadata){
    E.def.toolboxParts=E.def.toolboxParts||[];
    E.def.toolboxParts.push(Object.assign({featureId:feature && feature.id},fastener.metadata));
  }
  E.sel=addedParts.filter(function(part){return !part.previewOnly;}).slice(-1)[0] || addedParts[addedParts.length-1];refreshAll();fitSketch();
  lastToolboxPick={kind:kind,label:fastener.callout || kind};
  flash("✓ "+fastener.callout);return true;
}

var lastToolboxPick=null;

/* Which parameter each finish feature means by "the amount" — the number the
   scrubber drags, the preview reads and the exact operation is recorded with. */
var FINISH_AMOUNT_KEY = { fillet:"radius", chamfer:"distance", shell:"thickness", dome:"height", draft:"angle", thicken:"thickness", rib:"thickness" };
/* Body operations have no single scrubbed number — their params ARE the whole
   definition — so they are named here rather than by an amount key. */
var BODY_OPERATIONS = new Set(["splitBody", "moveBody"]);

/* The live picture of "Merge instances".
 *
 * The N copies are laid immediately and unconditionally by the pattern branch
 * above; that is the cheap honest answer, and it is what stays on screen if
 * anything below fails. Whether any two of them share material is a question
 * only the kernel can answer, so the fuse is a DEBOUNCED second pass — a
 * parameter drag coalesces onto one run and a superseded run is dropped when it
 * lands, on the same E._featurePreviewToken queueExactFeaturePreview uses.
 *
 * The badge tells the truth at every stage: "approximate" for as long as the
 * un-merged copies are what is drawn, and "exact" only once the picture IS the
 * answer — which includes the kernel reporting that nothing overlaps, since the
 * separate copies are then already right. A failure says so and withdraws
 * nothing: a body OCC could not build is never shown. */
var PATTERN_MERGE_PREVIEW_DELAY = 140;

/* The features that work on an existing body's topology rather than on a
   sketch: they collect a selection, preview through the exact kernel, and are
   recorded as an exactOperation on the part. */
var FINISH_FEATURES = ["fillet", "chamfer", "shell", "dome", "draft", "thicken"];

/* Which parameter each of these means by "the amount", for repeat-last. */
var REPEATABLE_AMOUNT = { fillet: "radius", chamfer: "distance", shell: "thickness" };

function openParametricFeature(type, repeatedParams) {
  E.collectingFeature = false;
  if(E.docType!=="part")return;if(E.mode==="drawing")setMode("3d");
  var spec=featureSpec(type);if(!spec){flash(t("unsupportedFeature")+": "+type);return;}
  var host=root && root.querySelector("#mdQuickSettings");if(!host)return;
  dismissProfileOffer();
  E.quickFormInstance?.dismiss();
  if(E.authoring.featureEdit)cancelFeatureParameterEdit(true);
  clearFeaturePreview(false);E.authoring.featureType=type;E.authoring.phase="model";
  var scope=registerFeatureForm(host,type);host=scope.content;
  host.appendChild(el("div","md-feature-form-title",'<i class="ph '+spec.icon+'"></i><span><b>'+featureTypeLabel(type)+'</b><small>'+t("featureFormHint")+'</small></span>'));
  var state={type:type,params:featureDefaults(type),references:{},contourKeys:[]};
  if(type==='hole'){
    var cylinderFace=(E.topologySelection || []).find(function(ref){return ref.kind==='face';});
    var cylinderSource=cylindricalHoleSource(E.def,cylinderFace);
    if(cylinderSource){state.params.cylindricalSource=cylinderSource;state.params.cylinderTopDistance=.635;state.params.cylinderAngle=0;}
  }
  if(type==="helix"){
    var helixCircle=(ensureSketch(E.def).entities || []).find(function(e){return e.type==="circle"&&!e.construction;});if(helixCircle)state.params.radius=helixCircle.r;
  }
  if(type==="sweep" || type==="sweepCut"){
    // the Path row shows what the sweep will follow before it is committed:
    // the selected helix, else the document's only one; two sketches, the second
    var sweepHelix=selectedSketchIds().length===1 ? (selectedHelixRecord() || (documentHelixRecords().length===1 ? documentHelixRecords()[0] : null)) : null;
    if(type==="sweep" && selectedSketchIds().length===1)state.params.profileMode=sweepHelix?"sketch":"circular";
    state.params.helixId=sweepHelix ? sweepHelix.id : "";
    if(sweepHelix)state.params.sweepPathMode="helix";
  }
  if(type==="pattern"){
    var patternSeed=(E.def.features || []).find(function(feature){return (E.authoring.featureSelection || []).includes(feature.id) && FEATURE_PATTERN_SEED_TYPES.includes(feature.type) && feature.inputs?.length;});
    if(patternSeed){
      state.params.scope="feature";
      state.params.seedFeatureId=patternSeed.id;
      state.params.axis=circularPatternAxisFromHistory(E.def.features,patternSeed.id,state.params.axis);
    }
  }
  if(type==="mirror"){
    var mirrorSeed=(E.def.features || []).find(function(feature){return (E.authoring.featureSelection || []).includes(feature.id) && FEATURE_PATTERN_SEED_TYPES.includes(feature.type) && feature.inputs?.length;});
    if(mirrorSeed){state.params.scope="feature";state.params.seedFeatureId=mirrorSeed.id;state.params.seedFeatureIds=(E.def.features || []).filter(function(feature){return (E.authoring.featureSelection || []).includes(feature.id) && FEATURE_PATTERN_SEED_TYPES.includes(feature.type) && feature.inputs?.length;}).map(function(feature){return feature.id;});}
  }
  if(type==="revolve"||type==="revolveCut"){
    state.references.axis=preselectedRevolveAxis();
    state.params.useSketchPlane=true;
    state.params.thinFeature=!revolveContour(state.references.axis);
  }
  if(type==="extrude"||type==="extrudeCut")state.params.thinFeature=!closedSketchProfile();
  /* Repeat-last: a second fillet reuses the radius the first one was given.
     Extrude already works this way through E.depth; fillet and chamfer did not,
     so every edge in a run of identical rounds was retyped. The feature is
     still a new history node with its own copied params — nothing is shared
     but the seed. */
  if(REPEATABLE_AMOUNT[type] && fin(E.lastFinishAmount && E.lastFinishAmount[type])){
    state.params[REPEATABLE_AMOUNT[type]]=E.lastFinishAmount[type];
  }
  if(type==="extrude"||type==="extrudeCut"||type==="hole"){
    state.params.depth=E.depth;state.params.offset=E.baseOff;
    var activeFeatureSketch=ensureSketch(E.def);
    /* Support-face normals point out of the existing body. A cut should begin
       by travelling into material; the user can still flip it explicitly. */
    if(type==="extrudeCut"&&activeFeatureSketch.frameSpace==="local"&&activeFeatureSketch.support)state.params.direction="reverse";
  }
  if(type==="mirror")state.references.plane=E.authoring.referenceId||"plane:right";
  if (repeatedParams) state.params = {...state.params, ...cloneData(repeatedParams)};
  var liveBadge=el("div","md-feature-live",'<i class="ph ph-broadcast"></i> '+t("livePreviewReady"));host.appendChild(liveBadge);
  E.authoring.featurePreviewState=state;E.authoring.featurePreviewBadge=liveBadge;
  addFinishBodyTargetControl(host,type,state);
  if(type==="loft"){
    const sketchIds=new Set(E.def.sketches.map(sketch=>sketch.id));
    state.loftSectionIds=(E.authoring.sketchSelection ?? selectedSketchIds()).filter(id=>sketchIds.has(id));
    state.setLoftSections=function(ids){
      if(activeLoftCreation()!==state)return;
      state.loftSectionIds=ids;
      syncPicker(ids);
      refreshParts();refreshModelHistoryPane();
      syncActiveFeatureSelectionFeedback();syncContextActions();
    };
    var syncPicker=renderLoftSectionPicker(host,E.def.sketches,state.loftSectionIds,{
      el, title:t("loftSectionPicker"), hint:t("loftSectionHint"),onChange:state.setLoftSections
    });
  }
  var controls=renderFeatureParameterForm(host,type,state,function(next){state.params=next.params;state.references={...state.references,...next.references};E.depth=Number(state.params.depth)||E.depth;E.baseOff=Number(state.params.offset)||0;if(type==="fillet")renderFinishEdgeList();if(shellEditor)shellEditor.sync();queueNewFeaturePreview(type,state,liveBadge);});
  var shellEditor=addShellFaceThicknessControls(host,state,function(){queueNewFeaturePreview(type,state,liveBadge);});
  addTerminatingFaceChoices(host,type,state,liveBadge,controls);
  addThinExtrudeChainChoices(host,type,state,liveBadge,controls);
  if(type==="extrude")addBossContourChoices(host,state,liveBadge);
  var selectionNote=el("div","md-feature-selection-note");
  selectionNote.setAttribute("data-live-selection",type);host.appendChild(selectionNote);syncActiveFeatureSelectionFeedback();addFinishScrubber(host,type,controls);
  if(["fillet","chamfer"].includes(type)){
    adoptFinishEdgeSelection();
    var edgeBox=el("div","md-finish-edges");
    edgeBox.setAttribute("data-finish-edges",type);
    host.appendChild(edgeBox);
    renderFinishEdgeList();
  }
  if (["fillet","chamfer","shell","dome","draft","thicken"].includes(type) || type==="extrude" || type==="extrudeCut") {
    var collect = btn(t("selectForFeature"), function () {
      E.collectingFeature = true;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      closeModelerSheet(); syncContextActions();
    }, "md-collect-geometry");
    collect.hidden = !(["fillet","chamfer","shell","dome","draft","thicken"].includes(type) || collectingEndFace());
    host.appendChild(collect);
    var endControl=(controls||[]).find(function(item){return item.field.key==="endCondition";});
    if(endControl)endControl.input.addEventListener("change",function(){collect.hidden=!collectingEndFace();syncActiveFeatureSelectionFeedback();});
  }
  /* SOLIDWORKS opens the PropertyManager on "Items To Fillet" because that is
     the one input the feature cannot be completed without. Appending the
     collector after the parameter fields instead put it, and its Select
     geometry button, roughly 400px below the fold of an 812px phone: the form
     opened on a radius box with Finish greyed out and nothing on screen naming
     what was missing. Anything that collects geometry leads with what it wants
     and lets the numbers follow. */
  var selectionAnchor = liveBadge.nextSibling;
  if (selectionNote) host.insertBefore(selectionNote, selectionAnchor);
  if (typeof edgeBox !== "undefined" && edgeBox) host.insertBefore(edgeBox, selectionAnchor);
  if (typeof collect !== "undefined" && collect) host.insertBefore(collect, selectionAnchor);
  if (type === "draft") {
    /* SOLIDWORKS' Neutral Plane box: the next face click fills it instead of
       Faces to draft. A picked face replaces the axis/end fields, which only
       stand in for it when nothing is picked. */
    var neutralRow = el("div", "md-draft-neutral");
    neutralRow.setAttribute("data-draft-neutral", "");
    var neutralLabel = el("span", "md-draft-neutral-label");
    var syncNeutral = function () {
      var face = state.params && state.params.neutralFace;
      neutralLabel.textContent = t("fcFldNeutralPlane") + ": " + (state.neutralPick ? t("draftNeutralPick") : face ? t("draftNeutralFace") : t("fcOptNeutralEnd"));
      neutralRow.classList.toggle("is-picking", !!state.neutralPick);
      (controls || []).forEach(function (control) {
        if (!["pullAxis", "neutral", "neutralOffset"].includes(control.field.key)) return;
        var wrap = control.input.closest(".md-quick-field"); if (wrap) wrap.classList.toggle("parameter-inactive", !!face);
      });
    };
    neutralRow.appendChild(neutralLabel);
    neutralRow.appendChild(btn(t("draftNeutralPickButton"), function () { state.neutralPick = true; E.collectingFeature = true; syncNeutral(); flash(t("draftNeutralPick")); }, "md-draft-neutral-pick"));
    neutralRow.appendChild(btn(t("draftNeutralClear"), function () { state.neutralPick = false; if (state.params) delete state.params.neutralFace; syncNeutral(); queueNewFeaturePreview(type, state, liveBadge); }, "md-draft-neutral-clear"));
    state.syncNeutral = syncNeutral;
    host.appendChild(neutralRow);
    syncNeutral();
  }
  var actions=el("div","md-feature-actions");
    actions.appendChild(namedButton(btn('<i class="ph ph-x"></i> '+t("m_cancel"),function(){E.authoring.featureType=null;E.authoring.workflowFocus="history";clearFeaturePreview(true);closeFeaturePanel();syncAuthoringWorkflow();},"md-quick-cancel"), t("cancelCommand")));
  actions.appendChild(btn('<i class="ph ph-check"></i> '+t("quickApply"),async function(){
    if (!scope.form.isCurrent() || scope.form.applying || !validateFeatureInputs(host)) return;
    if(shellEditor)try{state.params.faceThicknesses=shellEditor.read();}catch(error){flash(String(error.message || error));return;}
    if (FINISH_FEATURES.includes(type) && !featureSelectionReady()) return;
    // A new body step can invalidate cached generated names used by later
    // features. Keep the last verified status until the exact history catches
    // up, just as a committed feature edit does.
    var releaseApply;
    scope.form.applying=new Promise(resolve=>{releaseApply=resolve;});
    try {
    var restoreExact=isCanonicalAuthoring();
    var values=readFeatureParameterForm(controls,state.params),params=values.params,ok=false;
    var shellPreviewVerified=type==="shell" && readyShellPreviewMatches(params);
    state.references={...state.references,...values.references};clearFeaturePreview(false);
    if(restoreExact){E.exactRestoring=true;coreRunFresh=true;}
    try {
    if(type==="extrude"||type==="extrudeCut")ok=await extrudeClosedSketch({type:type,...params,contourKeys:params.thinFeature?state.thinChainKeys:type==="extrude"?state.contourKeys:null});
    else if(type==="revolve")ok=createRevolveFeature({...params,axisReference:state.references.axis});
    else if(type==="revolveCut")ok=createRevolveCutFeature({...params,axisReference:state.references.axis});
    else if(type==="sweepCut")ok=createMultiSketchFeature("sweepCut",params);
    else if(type==="hole")ok=await createHoleFeature(params);
    else if(type==="helix")ok=createHelixFeature(params);
    else if(type==="thread")ok=createThreadFeature(params);
    else if(type==="knurl")ok=createKnurlFeature(params);
    else if(type==="insert")ok=createInsertFeature(params);
    else if(type==="sweep"||type==="loft")ok=createMultiSketchFeature(type,params,state.loftSectionIds);
    else if(type==="fillet"||type==="chamfer")ok=await quickRoundPart(type,params);
    else if(type==="shell")ok=await quickShellPart(params,shellPreviewVerified);
    else if(type==="dome")ok=await quickDomePart(params);
    else if(type==="draft")ok=quickDraftPart(params);
    else if(type==="thicken")ok=quickThickenPart(params);
    else if(type==="rib")ok=createRibFeature(params);
    else if(type==="splitBody")ok=quickSplitBodyPart(params);
    else if(type==="moveBody")ok=quickMoveBodyPart(params);
    else if(type==="pattern")ok=quickPatternPart(params);
    else if(type==="mirror"){E.authoring.referenceId=state.references.plane;ok=quickMirrorPart({...params,planeReference:state.references.plane});}
    else if(type==="boolean"){
      var ids=selectedFeatureIds();if(ids.length<2){E.exactRestoring=false;coreRunFresh=false;flash(t("booleanNeedTwo"));syncNewFeaturePreview(type,state);refreshAll();return;}
      pushUndo(t("createBoolean"));try{
        var combined=createFeatureDefinition(E.def,"boolean",{inputs:ids.slice(0,2),references:{sketches:[],features:ids.slice(0,2),topology:[],references:[]},params:params});
        E.sel=activeParts(E.def).find(function(part){return cutTargetFeatureId(part)===combined.id;}) || null;
        E.topologySelection=[];E.ssel=[];ok=true;refreshAll();
      }catch(error){H.discard();flash(String(error.message||error));}
    }
    } catch(error) { if(scope.form.isCurrent()){E.exactRestoring=false;coreRunFresh=false;flash(String(error.message||error));}return; }
    if(!scope.form.isCurrent())return;
    if(ok){
      var reusable = {};
      controls.forEach(function(control){ if(control.field.key[0] !== "$" && ["number","boolean","select"].includes(control.field.type)) reusable[control.field.key] = params[control.field.key]; });
      E.lastOperation = {type:type, params:cloneData(reusable)};
      rememberFinishAmount(type,params);E.authoring.featureType=null;E.authoring.workflowFocus="history";closeFeaturePanel();setMode("3d");setTab("parts");syncAuthoringWorkflow();
      if(restoreExact){if(exactRunIsCurrent(false))E.exactRestoring=false;else scheduleExactRestore();}
    }else{E.exactRestoring=false;coreRunFresh=false;E.authoring.featurePreviewState=state;E.authoring.featurePreviewBadge=liveBadge;syncNewFeaturePreview(type,state,liveBadge);refreshAll();}
    } finally { scope.form.applying=null;releaseApply(); }
  },"md-quick-apply"));host.appendChild(actions);
  syncNewFeaturePreview(type,state,liveBadge);refreshAll();syncAuthoringWorkflow();
  scope.form.rememberInputs(()=>[state.params,state.references,state.contourKeys,state.thinChainKeys,state.loftSectionIds]);
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
}

/* A ribbon caption whose catalog label would mislead gets its tooltip here.
   "Project" with nothing picked projects the bodies' silhouette on the sketch
   plane as construction geometry, and with model edges picked it hands them to
   Convert Entities — so the button says so rather than repeating the catalog's
   "Project part edges". */
var COMMAND_TOOLTIP = { project: function () { return t("projectEdgesTip"); } };

/* Returning from a component edit is asynchronous: finishContextPart
   regenerates the exact part before the assembly comes back. The command
   queued behind the switch runs when that finish lands, and only for the
   newest request; a repeated click joins the finish already under way. */
let documentTypeRequest = 0, contextFinish = null;
function requestDocumentType(type, afterSwitch) {
  var request = ++documentTypeRequest;
  function latest() { return request === documentTypeRequest; }
  function switchType() {
    if (!latest()) return false;
    setDocumentType(type);
    if (E.docType === type && afterSwitch) afterSwitch();
    return E.docType === type;
  }
  if (type === "assembly" && E.contextEdit) {
    var edit = E.contextEdit;
    if (contextFinish?.edit !== edit) {
      var finish = { edit: edit };
      finish.done = Promise.resolve(finishContextPart()).finally(function () { if (contextFinish === finish) contextFinish = null; });
      contextFinish = finish;
    }
    return contextFinish.done.then(function (done) {
      if (!done || !latest() || !E.open || E.contextEdit || E.docType !== "assembly") return false;
      if (afterSwitch) afterSwitch();
      return true;
    });
  }
  if (type === E.docType) return switchType();
  return leavingQuickForm(switchType);
}

var documentSaveTasks=new WeakMap();

var exactWorkerActivityTimer=0,exactWorkerActivitySubscribed=false;
function set_exactWorkerActivitySubscribed(value) { return exactWorkerActivitySubscribed = value; }
function set_exactWorkerActivityTimer(value) { return exactWorkerActivityTimer = value; }

/* ================= parametric sketcher =================
   Sketch geometry is not the model. Lines, circles and arcs live in
   E.def.sketch with their constraints; solid parts only appear when a feature
   (extrude, revolve…) consumes a closed profile. Every edit that can move
   geometry ends in resolveSketch(), which is the single place the solver runs
   and the single place a conflicting edit gets rolled back. */

/* ---- selection: entities and points, Ctrl/Cmd to extend ---- */
var SKETCH_ENTITY_TYPES = ["line", "circle", "arc", "ellipse", "spline", "point"];

/* ---- geometric constraints from the current selection ---- */
var CONSTRAINT_DEFS = [
  { id: "coincident", label: "cCoincident", icon: "ph-dot-outline", need: "2 points" },
  { id: "horizontal", label: "cHorizontal", icon: "ph-arrows-horizontal", need: "line(s) or 2 points" },
  { id: "vertical", label: "cVertical", icon: "ph-arrows-vertical", need: "line(s) or 2 points" },
  { id: "parallel", label: "cParallel", icon: "ph-equals", need: "2 lines" },
  { id: "perpendicular", label: "cPerpendicular", icon: "ph-angle", need: "2 lines" },
  { id: "tangent", label: "cTangent", icon: "ph-circle-half", need: "line+circle or 2 circles" },
  { id: "equal", label: "cEqual", icon: "ph-approximate-equals", need: "2 or more lines or circles" },
  { id: "concentric", label: "cConcentric", icon: "ph-circles-three", need: "2 circles" },
  { id: "midpoint", label: "cMidpoint", icon: "ph-align-center-horizontal", need: "point + line" },
  { id: "pointOnLine", label: "cPointOnLine", icon: "ph-map-pin-simple", need: "point + entity" },
  { id: "intersection", label: "cIntersection", icon: "ph-plus", need: "point + two lines or two model edges" },
  { id: "symmetric", label: "cSymmetric", icon: "ph-flip-horizontal", need: "2 points + line" },
  { id: "fixed", label: "cFixed", icon: "ph-lock-simple", need: "point(s)" },
];

/* ---- mirror & pattern: copies that stay tied to what they came from ---- */

// the value sits in the row's own field, so a dimension row names only its kind
var DIMENSION_SYMBOLS = { diameter: "Ø", radius: "R", angle: "∠", rotation: "∠" };

var RELATION_REFUSAL_MS = 6000;

/* ================= parts list + inspector ================= */
var KIND_ICON = {
  box: "ph-cube", cyl: "ph-cylinder", sph: "ph-sphere",
  ext: "ph-polygon", rev: "ph-spiral", loft: "ph-triangle",
};

/* The topology mates offered by both doors into addTopologyMate: the Ops
   palette and the ribbon's PropertyManager. Labels are i18n KEYS, not text —
   this list is built once and the language is chosen per render. Icons are
   phosphor class names because these buttons are drawn inline rather than
   through cadIcon. */
var MATE_PALETTE = [
  ["lock", "ph-lock", "lockMate"],
  ["coincident", "ph-selection", "coincidentMate"],
  ["distance", "ph-ruler", "topologyDistanceMate"],
  ["concentric", "ph-circles-three-plus", "concentricMate"],
  ["angle", "ph-angle", "angleMate"],
  ["screw", "threadfeature", "screwMate"],
  ["tangent", "ph-circle", "tangentMate"],
  ["limit", "ph-arrows-in-line-vertical", "limitMate"],
  ["symmetric", "ph-flip-horizontal", "symmetricMate"],
  ["gear", "ph-gear", "gearMate"],
  ["belt", "ph-circles-three-plus", "beltMate"],
  ["rackpinion", "ph-gear", "rackPinionMate"],
  ["rotationlimit", "ph-angle", "rotationLimitMate"],
];

/* ---- live DOWNSTREAM refresh ------------------------------------------
 *
 * syncProjectionFromFeature() edits the feature in hand and nothing else, so
 * while an extrude's depth is dragged a pattern OF it, or a fillet ON it, used
 * to sit at the old shape until Apply. These follow live, in two tiers,
 * because the two costs are three orders of magnitude apart:
 *
 *   ANALYTIC downstream — a plain pattern, a mirror, a toolbox row: a profile
 *   re-lay and a structuredClone of a body that has no tessellation while it is
 *   being dragged. Sub-millisecond, so it runs on EVERY tick and is what makes
 *   the model feel connected.
 *
 *   KERNEL-BACKED downstream — anything OpenCascade has to answer. That is
 *   "a second or more per keystroke" (modeler_finish_preview.js), so it may
 *   never gate a frame: it is debounced and cancelled on the same
 *   E._featurePreviewToken and PATTERN_MERGE_PREVIEW_DELAY the merged-pattern
 *   preview already uses, and a superseded run returns before it touches the
 *   scene. Meanwhile the stale exact mesh is dropped rather than left on
 *   screen as a confident wrong shape, and the badge says which stage it is
 *   at in the data-preview-state vocabulary the merged-pattern work
 *   established.
 *
 * No second scheduler, and no fixed-rate timer: a rate slow enough for the
 * kernel would make the cheap tier feel broken, and a rate fast enough for the
 * cheap tier would queue OpenCascade runs faster than they finish. */

/* ================= the FeatureManager =================

   One tree, two document shapes. core/tree_model.js reads a canonical history
   or a legacy parts list into the same normalised nodes and modeler_tree.js
   draws them, so rename, keyboard navigation, drag-reorder, folders and the
   context menu are written once and behave identically in both.

   The mode a document is in is *reported* by isCanonicalAuthoring() and never
   changed here. That flag also picks the rebuild engine, so converting a legacy
   document to unify the panel would swap the kernel under a model the user
   already trusts, and the way that goes wrong is quiet — a fillet resolving
   against a different edge still leaves something that looks like a part.
   Conversion is a separate, twice-gated, offered action: renderMigrationOffer. */

// bumped on blur so a second visit to the same field is its own history step
var propGen = 0;
function set_propGen(value) { return propGen = value; }

var configuredComponentBuilds=new WeakMap();

var PLANE_NAME_KEYS = { "plane:front": "planeFrontName", "plane:top": "planeTopName", "plane:right": "planeRightName" };

var mateTopologyMemo=new WeakMap();
var mateReferenceRefreshes=new WeakMap();

var inspectorDirty = { sketch: true, shape: true, look: true, ops: true };
if (typeof window !== "undefined") window.cadInspectorDirty = inspectorDirty;

var _scratchToComponent = null;
function set__scratchToComponent(value) { return _scratchToComponent = value; }
var _scratchPickNormal = null;
function set__scratchPickNormal(value) { return _scratchPickNormal = value; }

var markupsLastDrawnSig = null;
function set_markupsLastDrawnSig(value) { return markupsLastDrawnSig = value; }
var markupsLastDrawnVis = null;
function set_markupsLastDrawnVis(value) { return markupsLastDrawnVis = value; }

/* Note callouts are re-projected on EVERY rendered frame — this runs from the
   view's afterRender hook — so nothing in here may rebuild DOM. An earlier
   version assigned card.innerHTML and svg.innerHTML per frame, which parsed
   markup 60 times a second while the camera moved and, worse, destroyed the
   card's own subtree mid-gesture: the delete button lost hover and any
   in-flight pointer press, so it was not reliably clickable during an orbit.

   Build once, then write only what the projection actually changed. */
var notesScratch = null;
function set_notesScratch(value) { return notesScratch = value; }

var SVG_NS = "http://www.w3.org/2000/svg";

/* The references a mate button falls back to when nothing is picked: one face
   or axis synthesized from each component's own bounding box. The gate and the
   command build them here, together, so the gate is judging the very frames
   the mate would be stored with. */

var instantVectors = null;
function set_instantVectors(value) { return instantVectors = value; }

/* A saved model's card shows the model, the same picture as its planner
   library tile (js/thumbs.js renders it once and stores it; the warm-up there
   has usually made it before the list is opened). A picture not made yet is
   filled in a moment later (thumbAsync), so the list never waits on WebGL. */
var libThumbQueue = [], libThumbTimer = 0;
function set_libThumbQueue(value) { return libThumbQueue = value; }
function set_libThumbTimer(value) { return libThumbTimer = value; }

var librarySearchQueries={part:'',assembly:''};

var exactRebuildQueue=createExactRebuildQueue();

/* Through three points: each point is a picked model vertex (kept associative)
   or, where nothing is at hand to pick — the middle of a face edge, a point on
   a slanted face — typed as X, Y, Z. A typed point is stored as a free point;
   a picked one whose typed coordinates are unchanged stays bound to its vertex. */
var THREE_POINT_KEYS=["p1x","p1y","p1z","p2x","p2y","p2z","p3x","p3y","p3z"];

var massDisplayUnits = "si";
function set_massDisplayUnits(value) { return massDisplayUnits = value; }
var massCoordinateSystemId = "";
function set_massCoordinateSystemId(value) { return massCoordinateSystemId = value; }

let explodedPlaybackStop = null;
function set_explodedPlaybackStop(value) { return explodedPlaybackStop = value; }

var motionPlaybackCancel=null;
function set_motionPlaybackCancel(value) { return motionPlaybackCancel = value; }

var assemblyBalloonCache=new WeakMap();

const exactSaveCache=createExactSaveCache();

function syncPreviewFromHistory() {
  if (!isCanonicalAuthoring() || !E.def) return;
  var result = applyHistoryToPreviewParts(E.def);
  var queued = new Set();
  (result.dirtyPartIds || []).forEach(function (id) {
    var part = (E.def.parts || []).find(function (item) { return item.id === id; });
    if (!part) return;
    // A kernel body has no analytic mesh to fall back on, so dropping its cache
    // without ordering a rebuild would erase it from the viewport for good.
    if (isKernelBody(part)) { queueKernelBody(part); return; }
    delete part.meshData;
    delete part.bounds;
    part.exactPending = false;
    part.exactError = null;
    if (!part.suppressed && partSupportsExactMesh(part)) { queued.add(part); queueExactMesh(part); }
  });
  // A saved rollback may already contain suppressed compatibility operations.
  // Its simple earlier body still needs native geometry, even though no active
  // modifier makes the analytic preview require a kernel mesh.
  if (E.def.rollbackIndex != null) activeParts(E.def).forEach(function (part) {
    if (!queued.has(part) && !part.meshData && !part.exactPending && !part.exactError && partSupportsExactMesh(part)) {
      delete part.bounds;
      queueExactMesh(part);
    }
  });
}

/* Solid inspection selection changes presentation, never recipes or poses.
   Sketch authoring also reconciles its working geometry and support frames:
   retain that established refresh path while reusing its existing core run. */
function refreshSelection() {
  if (E.mode === "3d" && !E.modelPlaneActive) refreshAll({ selectionOnly: true });
  else { coreRunFresh = true; refreshAll(); }
}

/* Mate and exploded-view edits change poses, not solids. Retain the native
   buffers and topology pick metadata, while replacing transient leader lines. */
function refreshAssemblyPosePreview() {
  if(!E.pv?.grp || !E.assembly || E.pv.inRoom)return false;
  const visible=(E.assembly.components || []).filter(component=>component.visible!==false);
  const groups=new Map(),overlays=[];
  for(const child of E.pv.grp.children){
    if(child===E.pv.liveGrp)continue;
    if(child.userData?.cadInterference!==undefined || child.userData?.cadExplodeLine){overlays.push(child);continue;}
    if(child.userData?.cadAssemblyContext)return false;
    const id=child.userData?.cadComponent;
    if(id===undefined || groups.has(id))return false;
    groups.set(id,child);
  }
  if(groups.size!==visible.length || visible.some(component=>!groups.has(component.id)))return false;
  for(const component of visible){
    const group=groups.get(component.id),tr=normalizeTransform(component),blown=component.explodedOffset;
    group.position.set(tr.x+(blown?.x||0),tr.y+(blown?.y||0),tr.z+(blown?.z||0));
    group.rotation.set(tr.rx*Math.PI/180,tr.ry*Math.PI/180,tr.rz*Math.PI/180);
  }
  for(const overlay of overlays){
    overlay.traverse(object=>{
      object.geometry?.dispose();
      if(object.material)[].concat(object.material).forEach(material=>material.dispose());
    });
    E.pv.grp.remove(overlay);
  }
  if(visible.some(component=>{
    const offset=component.explodedOffset;
    return offset && (offset.x || offset.y || offset.z);
  }))addExplodeLeaders(E.pv.grp);
  const box=new THREE.Box3().setFromObject(E.pv.grp);
  E.pv.pickBounds=box.isEmpty()?null:box.getBoundingSphere(new THREE.Sphere());
  invalidateDrawing();
  return true;
}

/* ================= open / close ================= */
function refreshAll(options = {}) {
  if (E.quickFormInstance && !E.quickFormInstance.ownsDocument()) E.quickFormInstance.dismiss(true);
  syncAssemblyContextBar();
  if (E.quickAction === "convertentities") refreshConvertEntitiesHint();
  var selectionOnly = !!options.selectionOnly;
  var previousAssemblyPreviewSolved = assemblyPreviewSolved;
  try {
    /* Solve before the panels and viewport consume the assembly. Selection
       keeps the existing solution; a full refresh consumes an explicit solve
       or performs one before allowing its viewport/drawing builds to reuse it. */
    if (!selectionOnly && E.docType === "assembly" && E.assembly && !assemblySolveFresh && !options.skipAssemblySolve) applyAssemblyMates(E.assembly);
    if (!selectionOnly) assemblySolveFresh = false;
    assemblyPreviewSolved = E.docType === "assembly";
    if (!selectionOnly) syncFaceSupportedSketchFrames();
    if (!selectionOnly && isCanonicalAuthoring()) {
      syncPreviewFromHistory();
      if (!coreRunFresh && !E.exactRestoring) {
        rebuildDocCount++;
        E.coreRun=rebuildParametricDocument(E.def,modelParameterOverrides(),{lastGood:E.coreRun && E.coreRun.lastGood});
        E.coreRun=applyCurrentExactDiagnostics(E.coreRun,E.exactDiagnosticRun,E.def,currentHistoryNode(),E.massEditRevision);
        publishRebuildStatus(E.def,E.coreRun);
      }
    }
    // Clear even for legacy documents so an old flag cannot swallow a rebuild
    // when the document subsequently becomes canonical.
    coreRunFresh = false;
    if (!selectionOnly && E.docType === "part") repairSheetOwner(E.def);
    refreshParts();
    refreshModelHistoryPane();
    fillInspector();
    if (selectionOnly || (options.assemblyPoseOnly && E.docType==="assembly" && refreshAssemblyPosePreview())) refreshViewportSelection();
    else updatePreview();
    drawSketch();
    if (histPanel) histPanel.refresh();
    syncStatus();
    syncHint();
    syncFacePrompt();
    syncExtrudeButton();
    syncActiveFeatureSelectionFeedback();
    syncMassPropertiesEvaluation();
    syncAuthoringWorkflow();
    syncContextActions();
    updateTourProgress();
    syncModelerMobile();
    if (root && !root.querySelector("#mdDimEditor").hidden) positionDimensionEditor();
  } finally {
    assemblyPreviewSolved = previousAssemblyPreviewSolved;
  }
}


/* ---- phone / foldable shell ----
   js/modeler_mobile.js owns the two-row chrome there. It is handed this bridge
   rather than importing the editor, because everything it drives (undo, the
   coach, the selection's commands, the display toggles) is module-private
   here — and because the sheets BORROW the real panels, there is nothing to
   keep in sync beyond this table of verbs. */
function mobileBridge() {
  return {
    root: root,
    t: t,
    cadIcon: cadIcon,
    undo: doUndo,
    redo: doRedo,
    canUndo: function () { return H.canUndo(); },
    canRedo: function () { return H.canRedo(); },
    coach: function () { return E.open && E.coachEnabled && !E.coachDismissed && !E.tour.active && !E.welcomeOpen && E.mode !== "drawing" ? coachSuggestion() : null; },
    focusDiagnostics: focusTreeDiagnostics,
    contextItems: function () { return contextToolbarItems(chromeSelectionInput()); },
    chromeLabel: chromeCommandLabel,
    runChrome: runChromeCommand,
    runCommand: runCommand,
    returnToParameters: returnToFeatureParameters,
    accept: finishActiveCommand,
    cancel: cancelActiveCommand,
    finishDrawingDraft: function () { if(E.mode==='drawing')drawingSheet().finishDraft(); },
    cancelDrawingDraft: function () { if(E.mode==='drawing')drawingSheet().cancelDraft(); },
    setMode: setMode,
    setView: setView,
    setSketchNormalTo: setSketchNormalTo,
    zoom: zoomBy,
    setDisplay: function (style) { setModelDisplay(style, true); },
    toggleEdges: function () { setShowModelEdges(!(E.showModelEdges !== false)); },
    setSelFilter: setSelectionFilter,
    setAddSelection: setMobileAddSelection,
    clearSelection: clearMobileSelection,
    toggleContextRoom: function () {
      var box = root && root.querySelector("#mdContextBtn");
      if (box) box.click();
    },
    setDoc: setDocumentType,
    setCommandTab: setCommandTab,
    newModel: newModel,
    save: saveCurrentDocument,
    guide: startTour,
    startScreen: openWelcome,
    search: function () { openCommandSearch(); },
    state: function () {
      var corner = confirmationCornerState(currentCornerInput());
      return {
        open: !!E.open,
        mode: E.mode,
        modelPlaneActive: !!E.modelPlaneActive,
        drawingDraft: E.mode==='drawing' ? drawingSheet().draftActions() : null,
        view: E.view,
        sketchNormalTo: !!E.sketchNormalTo,
        tool: E.tool,
        docType: E.docType,
        commandTab: E.commandTab || "features",
        display: E.displayStyle === "transparent" ? "transparent" : "solid",
        edges: E.showModelEdges !== false,
        selFilter: E.selectionFilter || "all",
        assemblyMoveMode: E.assemblyMoveMode || "free",
        addSelection: !!E.mobileAddSelection,
        topologyCount: (E.topologySelection || []).length,
        componentCount: (E.componentSel || []).length,
        /* Sketch geometry is picked into E.ssel, not the topology list, so the
           phone selection bar never saw it — and with no Ctrl key its Add to
           selection toggle was the only way to hold two sketch entities, which
           every two-pick relation (Symmetric, Point on entity, Coincident…)
           and Mirror need. */
        sketchCount: (E.authoring && E.authoring.phase === "sketch") || E.mode === "2d" ? (E.ssel || []).length : 0,
        selectionKind: (E.topologySelection[0] && E.topologySelection[0].kind) || (E.componentSel.length ? "body" : ""),
        rebuildErrors: E.coreRun && E.coreRun.issues ? E.coreRun.issues.filter(function (issue) { return issue.severity === "error"; }).length : 0,
        rebuildWarnings: E.coreRun && E.coreRun.issues ? E.coreRun.issues.filter(function (issue) { return issue.severity === "warning"; }).length : 0,
        contextRoom: !!(root && root.querySelector("#mdContextBtn") && root.querySelector("#mdContextBtn").checked),
        collectingFeature: !!E.collectingFeature,
        cornerVisible: corner.visible,
        canAccept: corner.canAccept,
        /* Nothing modelled yet: the Features tab is six disabled buttons and
           one live one, so the sheet opens on Sketch instead. */
        emptyPart: E.docType === "part" && !((E.def && E.def.parts) || []).length,
        closedSketch: !!closedSketchProfile(),
        // identity only — the shell rebuilds when this string changes
        selKey: (E.sel && E.sel.id ? "p:" + E.sel.id : "") +
          "/" + (E.topologySelection || []).map(function (r) { return r.kind + (r.persistentId || ""); }).join(","),
      };
    },
    ensureDrawingSheetFresh: syncSheetPanel,
    ensureInspectorFresh: function () {
      var id = activeTab("R") || "shape";
      if (typeof inspectorDirty !== "undefined" && inspectorDirty[id]) {
        fillInspectorTab(id);
        inspectorDirty[id] = false;
      }
    },
  };
}

function syncModelerChrome() {
  if (!E.open) return;
  if (document.body.classList.contains("compact-nav")) initModelerMobile(mobileBridge());
  else teardownModelerMobile();
}
/* resize fires dozens of times through one orientation change or soft-keyboard
   open, and each call rebuilds the whole contextual row. Coalesce to one run
   per frame: the posture can only be read once the browser has settled anyway. */
var chromeFrame = 0;
function queueModelerChrome() {
  if (chromeFrame) return;
  chromeFrame = requestAnimationFrame(function () {
    chromeFrame = 0;
    syncModelerChrome();
    syncHint();
  });
}

export function openModeler(editKey, def, srcItem, discardConfirmed=false) {
  if(E.open && !discardConfirmed && (E.quickFormInstance?.applying || E.quickFormInstance?.hasPendingEdits() || hasResidentEdits())) {
    return confirmDiscardDocument("unsavedOpen").then(accepted=>{
      if(accepted)return openModeler(editKey,def,srcItem,true);
    });
  }
  E.contextEdit=null;
  E.quickFormInstance?.dismiss(true);
  if(motionPlaybackCancel)motionPlaybackCancel();
  cancelExactModelRebuild();
  dismissModelerDecision();
  // Evaluations belong to the previous document, including a card whose
  // native calculation completed before this library/draft replacement.
  closeEvalCard();
  // Whether this call REPLACES a document that is already open, as opposed to
  // opening the editor. The recovery draft below turns on the difference.
  var replacingOpenDocument = E.open;
  partHistoryMarker={savedEdit:0};
  inspectorDirty.sketch = true; inspectorDirty.shape = true; inspectorDirty.look = true; inspectorDirty.ops = true;
  modelerReturnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  if (root && E.lang !== getLang()) destroyDOM();
  if (!root) buildDOM();
  E.open = true;
  root.style.display = "flex";
  // Phone / foldable chrome is built per-open and also follows posture changes
  // (a desktop session that folds, or a phone that unfolds to a wide inner).
  syncModelerChrome();
  // Let the launcher click finish before its app shell becomes inert. Making
  // the clicked ancestor inert inside the same dispatch can strand assistive
  // technology and automation in a control that disappears mid-activation.
  setTimeout(function () { if (E.open) setModelerBackgroundIsolation(true); }, 50);
  E.lastOperation = null;
  E.collectingFeature = false;
  E.docType = "part";
  // The previous document's exact solid is native memory and belongs to a
  // model that is about to stop being open; it is neither reusable here nor
  // freed by anything else.
  releaseExactRun();
  // Tree state is per document: a hidden body or a collapsed branch from the
  // last model must not carry over onto ids that mean something else here.
  E.treeState = {};
  E.treeCollapsed = {};
  E.hiddenBodies = [];
  root.classList.remove("md-assembly");
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-doc") === "part"); });
  var f = editKey && FURN[editKey] && FURN[editKey].custom;
  S.idc=nextDocumentNumericId(def || f,S.idc);
  E.def = def ? ensureParametricDocument(def) : f ? ensureParametricDocument(f) : newDef();
  E.sheet?.resetSession();
  libraryOpenBaseline=cloneData(loadLib().find(function(model){return model.key===E.def.key;}) || null);
  E.def.metadata ||= {};
  if(!E.def.metadata.authoringSystem){
    var parametricEvidence=(E.def.features || []).some(function(feature){return !!feature.references || !!feature.params && !!feature.params.sketchId;}) || (E.def.parts || []).some(function(part){return !!part.sketchDriven;});
    E.def.metadata.authoringSystem=parametricEvidence ? "parametric-v1" : "legacy-adapter";
  }
  E.def.definitionId = E.def.definitionId || E.def.id || E.def.key;
  E.def.id = E.def.definitionId;
  (E.def.parts || []).forEach(function (part) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
    // Older legacy saves could keep the displacement only on the preview part.
    if(E.def.metadata.authoringSystem==="legacy-adapter" && part.kind==="rev" && part.sketchDriven){
      var source=(E.def.features || []).find(f=>f.id===part.featureId);
      var retained=retainedSketchRevolve(part,source);
      if(retained && ["x","y","z"].some(k=>(source.params[k] ?? 0)!==retained.params[k])){
        source.params=retained.params;delete part.meshData;part.exactPending=false;
      }
    }
  });
  /* This runs before selection, history seeding, and the first rebuild so a
     saved legacy slot can never publish its obsolete outer rim even once. */
  migrateDefinitionProfileCuts(E.def, true);
  restoreKernelBodies(E.def);
  // The FeatureManager's legacy reference rows mirror the canonical reference
  // table until that renderer is fully migrated.
  if (!Array.isArray(E.def.referenceGeometry) || !E.def.referenceGeometry.length) {
    E.def.referenceGeometry = (E.def.references || []).filter(function (ref) { return ref.id !== "origin"; }).map(function (ref) {
      if (ref.type === "plane") return Object.assign({}, cloneDomain(ref), { type:"reference_plane" });
      if (ref.type === "axis") return Object.assign({}, cloneDomain(ref), { type:"reference_axis" });
      return cloneDomain(ref);
    });
  }
  if (!Array.isArray(E.def.constraints)) E.def.constraints = [];
  ensureSketchDoc(E.def);
  E.srcItem = srcItem || null;
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.facePick = null;
  invalidateInterference();
  E.dependencyHighlight = null;
  E.section = { enabled:false, axis:"x", offset:0, flip:false };
  setSectionState(E.section);
  setPanelCollapsed("left", false);
  setPanelCollapsed("right", E.rightCollapsedPreference);
  E.mobileAddSelection = false;
  E.poly = null;
  E.arcPts = null;
  E.wallPts = null;
  E.componentSel = [];
  // Let the existing history determine the opening stage; an explicit Part
  // focus would incorrectly offer the blank-document tutorial on saved solids.
  E.authoring={phase:"model",referenceId:null,sketchId:E.def.activeSketch || null,featureType:null,sketchSelection:E.def.activeSketch?[E.def.activeSketch]:[],featureSelection:[],workflowFocus:null};
  E._mouse = null;
  E.solveInfo = solveSketch(ensureSketch(E.def));
  E._solveSketchId = ensureSketch(E.def).id;
  if (isCanonicalAuthoring()) rebuildDocCount++;
  E.exactRestoring = isCanonicalAuthoring() && activeParts(E.def).length && !(E.def && E.def.exactTopologyCache);
  E.coreRun = isCanonicalAuthoring() ? rebuildParametricDocument(E.def,modelParameterOverrides()) : rebuildDefinition(E.def, modelParameterOverrides());
  if (isCanonicalAuthoring() && !E.exactRestoring) publishRebuildStatus(E.def, E.coreRun);
  coreRunFresh = true;
  H.clear().seed();
  markDocumentClean();
  // A fresh editor can offer recovery from its previous session below.
  if (replacingOpenDocument) reconcileModelerDraft();
  E._centered = false;
  // Every editor session starts in an opaque, shaded view.
  setModelDisplay("solid", false);
  setShowModelEdges(true, false);
  setMode("3d");
  setCommandTab("features");
  setTab("parts");
  setTab("shape");
  syncHead();
  sizeSketch();
  syncTools();
  refreshLib();
  refreshAll();
  // Rebuild cached render parts from the ordered history when reopening.
  scheduleExactRestore();
  // The editor opens on the solid model; sketch and drawing remain one click away.
  fitPreview();
  var restoredDraft = false;
  if (!editKey && !def && !srcItem) restoredDraft = tryRestoreModelerDraft();
  E.coachDismissed = false; // a new session re-arms the coach's session dismiss
  // The start screen belongs to fresh beginnings only — editing an existing
  // model or resuming a draft already has a direction.
  if (!editKey && !def && !srcItem && !restoredDraft && E.welcomeOnOpen) {
    E.welcomeOnOpen=false; saveModelerPrefs(); openWelcome(); syncDensity();
  }
  else {
    closeWelcome();
    syncCoach();
    var closeButton = root.querySelector("#mdClose");
    if (closeButton) closeButton.focus({ preventScroll:true });
  }
}
// Open the editor for a placed item: custom models open their own definition
// (saving updates every placed instance); built-ins open as an editable copy,
// and saving swaps this item over to the new custom model.
export function openModelerForItem(it) {
  // defFromBuiltin() below builds real meshes — same late-bound-three bounce.
  if (!threeLoaded()) {
    loadThree().then(function () { openModelerForItem(it); }, function () {});
    return;
  }
  if (!it || !FURN[it.type]) { openModeler(); return; }
  // A catalogue envelope is not the editable appliance: decompose the actual
  // displayed geometry into a new document before entering CAD. This also
  // prevents saving a custom copy from replacing the shared builtin definition.
  if (!it.cab && !FURN[it.type].custom) {
    var editable = defFromBuiltin(it.type, it);
    if (editable) { openModeler(null, editable, it); return; }
  }
  var canonical = it.cab
    ? syncCabinetDefinition(S, it)
    : ensureItemDefinition(S, it, FURN[it.type]);
  var def = cloneDomain(canonical);
  // Built-in procedural objects remain hybrid during migration: their
  // canonical sketches/features carry design intent, while a one-time mesh
  // decomposition supplies an editable derived preview. Cabinets already
  // publish exact semantic parts and never take this fallback.
  if (!def.parts || !def.parts.length) {
    var derived = defFromBuiltin(it.type, it);
    if (derived) def.parts = derived.parts;
  }
  def.definitionId = canonical.id;
  def.id = canonical.id;
  def.key = canonical.key;
  if (def.parts && def.parts.length) openModeler(null, def, it);
  else openModeler();
}

export function closeModeler() {
  E.quickFormInstance?.dismiss(true);
  if(motionPlaybackCancel)motionPlaybackCancel();
  cancelExactModelRebuild();
  dismissModelerDecision();
  closeTour();
  closeWelcome();
  if(E.authoring && E.authoring.featureEdit)cancelFeatureParameterEdit(true);else clearFeaturePreview(false);
  if (cancel2DPointerMoveGlobal) cancel2DPointerMoveGlobal();
  E.drag = null;
  E.hoverTopology = null;
  E.open = false;
  releaseExactRun();
  decoGroups.length = 0;   // truncate, never reassign: window.cadDecoGroups holds this reference
  inspectorDirty.sketch = true; inspectorDirty.shape = true; inspectorDirty.look = true; inspectorDirty.ops = true;
  // Before the root is hidden: the mobile sheets hold the REAL tree/inspector/
  // ribbon while they are open, and those have to be put back inside it.
  teardownModelerMobile();
  if (root) root.style.display = "none";
  setModelerBackgroundIsolation(false);
  if (modelerReturnFocus && modelerReturnFocus.isConnected) modelerReturnFocus.focus({ preventScroll:true });
  modelerReturnFocus = null;
}

/* The editor's own chrome listeners. These used to live in initModeler(),
   which main.js called at boot — which is precisely what kept this file on the
   eager graph. js/modeler_launch.js now owns everything needed to OFFER the
   editor (top-bar button, "m" shortcut, the furniture-panel buttons); what is
   left here is only meaningful once the editor exists, so it registers when
   this module is actually fetched.

   Both handlers already no-opped unless E.open, and E.open cannot be true
   before this module has loaded — so nothing is missed by registering late. */
window.addEventListener("mf-posture", queueModelerChrome);
document.addEventListener("visibilitychange", scheduleLibThumbs);
window.addEventListener("resize", queueModelerChrome);
window.addEventListener("resize", function () {
  if (E.open && E.def) { sizeSketch(); drawSketch(); layout3DHost(); renderPreview(); }
  if (E.open && root && !root.querySelector("#mdDimEditor").hidden) positionDimensionEditor();
});
/* Let the launcher's "m" shortcut see the editor's open state without reaching
   into this module scope before it is loaded. */
reportEditorOpenState(function () { return E.open; });
// Leaving through the shared editor switcher asks about unsaved work like Close.
registerEditor("model", { leave: requestCloseModeler });

/* The model editor's AI adapter (js/editor_agent.js has the loop and the
   rules). Direct edits are the design's global variables — the named numbers
   dimensions are written in terms of, so "legs 430" re-sizes the part through
   the same equation path as the Equations list; everything else is the AI
   picking one of the editor's own commands for the user to fill in by hand. */
function modelAgentVariable(name) {
  var key = String(name || "").trim().toLowerCase();
  return (E.def && E.def.variables || []).find(function (v) { return String(v.name).toLowerCase() === key; }) || null;
}
function modelAgentTry(v, expr) {
  var old = v.expr, oldValue = v.value;
  v.expr = expr;
  resolveEquations(E.def);
  var out = { error: v.exprError || null, value: v.value };
  v.expr = old;
  resolveEquations(E.def);
  if (v.value !== oldValue) v.value = oldValue;
  return out;
}
registerEditorAgent("model", {
  name: "model editor",
  guide: [
    "",
    "Model editor rules:",
    "- A global variable changes with propose_variable: its name from the live document and a new expression, with units (\"430mm\", \"height/2\").",
    "- Features, sketches and edits need their forms: propose_command with the exact command label and, in values, what to enter.",
  ],
  state: function () {
    if (!E.open || !E.def) return { open: false };
    return {
      open: true, document: E.docType, name: E.def.name || "",
      view: E.split ? "split" : E.mode,
      features: (E.def.features || []).slice(0, 60).map(function (f) { return { name: f.name || f.type, type: f.type, suppressed: !!f.suppressed }; }),
      sketches: ensureSketchDoc(E.def).slice(0, 30).map(function (sk) { return { name: sk.name || "", plane: sk.plane || "", entities: (sk.entities || []).length }; }),
      variables: (E.def.variables || []).map(function (v) { return { name: v.name, expr: v.expr, value: v.value }; }),
      selected: E.sel ? (E.sel.name || E.sel.kind || "part") : null,
    };
  },
  tools: [{ type: "function", function: { name: "propose_variable", description: "Propose a new expression for an existing global variable.", parameters: {
    type: "object", required: ["name", "expr"], properties: { name: { type: "string" }, expr: { type: "string" } }, additionalProperties: false } } }],
  preview: function (name, args) {
    if (name !== "propose_variable") return { ok: false, reason: "UNKNOWN_TOOL" };
    if (!E.open || !E.def) return { ok: false, reason: "NO_MODEL_OPEN" };
    var v = modelAgentVariable(args.name), expr = String(args.expr || "").trim();
    if (!v) return { ok: false, reason: "NO_SUCH_VARIABLE", variables: (E.def.variables || []).map(function (x) { return x.name; }) };
    if (!expr || expr === v.expr) return { ok: false, reason: "NO_CHANGE" };
    var trial = modelAgentTry(v, expr);
    if (trial.error) return { ok: false, reason: "BAD_EXPRESSION", detail: String(trial.error) };
    return { ok: true, kind: "variable", name: v.name, expr: expr, undoable: true,
      lines: [v.name + ": " + v.expr + " → " + expr] };
  },
  apply: function (p) {
    var v = modelAgentVariable(p.name);
    if (!v) return { ok: false, reason: "NO_SUCH_VARIABLE" };
    pushUndo("AI: " + v.name);
    var old = v.expr;
    v.expr = p.expr;
    resolveEquations(E.def);
    if (v.exprError) { v.expr = old; resolveEquations(E.def); H.discard(); return { ok: false, reason: "BAD_EXPRESSION" }; }
    resolveSketch(false);
    refreshAll();
    return { ok: true, steps: 1 };
  },
  undo: doUndo,
  isOpen: function () { return !!(E.open && E.def); },
});

function pathSketchSpline(ctx,entity,points){
  var controls=splineControls(entity,points);if(!controls)return;var p=controls.map(q=>toPx(q.x,q.y));ctx.moveTo(p[0].x,p[0].y);ctx.bezierCurveTo(p[1].x,p[1].y,p[2].x,p[2].y,p[3].x,p[3].y);
}
function openSketchRepairs(){
  var sketch=ensureSketch(E.def),repairs=(sketch.repairs||[]).filter(r=>r.status==="pending");
  if(!repairs.length){flash(t("sketchRepairNone"));return;}
  showPickList(t("sketchRepair"),t("sketchRepair"),repairs.map(r=>({label:r.constraint.name||r.constraint.type,hint:r.operation,id:r.id})),function(item){
    var repair=repairs.find(r=>r.id===item.id),missing=repairReferences(sketch,repair);
    var fields=missing.map((ref,i)=>({key:"ref"+i,label:t("sketchReplacement")+" "+(i+1),type:"select",choices:(ref.kind==="point"?sketch.points:sketch.entities.filter(e=>e.type===ref.original?.type)).map(p=>({value:p.id,label:p.name||p.type||("("+p.x.toFixed(2)+", "+p.y.toFixed(2)+")")}))}));
    if(Number.isFinite(repair.constraint.value))fields.push({key:"value",label:t("sketchDimensionValue"),type:"number",value:repair.constraint.value});
    fields.push({key:"action",label:t("sketchRepair"),type:"select",value:"restore",choices:[{value:"restore",label:t("sketchRestore")},{value:"dismiss",label:t("sketchDismiss")}]});
    openQuickForm({action:"sketchrepair",title:t("sketchRepair"),fields:fields,onApply:function(values){
      pushUndo(t("sketchRepair"));try{if(values.action==="dismiss")repair.status="dismissed";else{var bindings={};missing.forEach((ref,i)=>bindings[ref.id]=values["ref"+i]);restoreSketchConstraint(sketch,repair.id,bindings,values.value);}resolveSketch(false);return true;}catch(error){H.discard();flash(error.message);return false;}
    }});
  });
}

function openFitCheckForm(){
  const saved=E.def.lastFitCheck;
  openQuickForm({action:"fitcheck",title:t("fitCheck"),hint:"ISO 286-2:2010 + Cor 1:2013 · mm",fields:[
    {key:"diameterMm",label:t("fitNominalDiameter"),type:"number",value:saved?.diameterMm??50,min:.001,max:3150,step:.001},
    {key:"code",label:t("fitCode"),type:"text",value:saved?.code||"H7/g6"}
  ],onApply:v=>{try{
    const fit=evaluateFit(v.diameterMm,v.code),match=fit.code.match(/^([A-Z]+)(\d+)\/([a-z]+)(\d+)$/);
    const sources=[fitLimitSource(v.diameterMm,match[1],match[2]),fitLimitSource(v.diameterMm,match[3],match[4])];
    pushUndo(t("fitCheck"));E.def.lastFitCheck={...fit,sources};
    report(t("fitCheck"),fitCallout(v.diameterMm,v.code),[
      t("fitHoleLimits")+": "+fit.holeMinMm.toFixed(6)+" … "+fit.holeMaxMm.toFixed(6)+" mm",
      t("fitShaftLimits")+": "+fit.shaftMinMm.toFixed(6)+" … "+fit.shaftMaxMm.toFixed(6)+" mm",
      t("fitClearanceLimits")+": "+fit.minClearanceMm.toFixed(6)+" … "+fit.maxClearanceMm.toFixed(6)+" mm · "+t("fitKind_"+fit.kind),
      ...sources.map(source=>source.class+": "+source.minExclusiveMm+" < Ø ≤ "+source.maxInclusiveMm+" mm · "+source.edition+(source.correction?" · "+source.correction.source:""))
    ]);return true;
  }catch(error){flash(error.message);return false;}}});
}

function openRackGearForm(){
  openQuickForm({action:"stdgear",title:t("stdGearCommand"),hint:t("gearGeometryHint"),fields:[
    {key:"moduleMm",label:t("gearModule"),type:"number",value:2,min:.1,step:.1},
    {key:"teeth",label:t("gearTeeth"),type:"number",value:20,min:5,step:1},
    {key:"pressureAngleDeg",label:t("gearPressure"),type:"number",value:20,min:1,max:44,step:1},
    {key:"tipRadiusCoefficient",label:t("gearTipRadius"),type:"number",value:.38,min:.01,step:.01},
    {key:"addendumCoefficient",label:t("gearCutterDepth"),type:"number",value:1.25,min:1.01,step:.01},
    {key:"backlashMm",label:t("gearBacklash"),type:"number",value:0,min:0,step:.01},
    {key:"profileShift",label:t("gearProfileShift"),type:"number",value:0,min:-1,max:1,step:.05},
    {key:"mateProfileShift",label:t("gearMateProfileShift"),type:"number",value:0,min:-1,max:1,step:.05},
    {key:"allowUndercut",label:t("gearAllowUndercut"),type:"boolean",value:false},
    {key:"requireMatingCheck",label:t("gearRequireMate"),type:"boolean",value:true},
    {key:"mateTeeth",label:t("gearMateTeeth"),type:"number",value:20,min:5,step:1},
    {key:"widthMm",label:t("gearWidth"),type:"number",value:8,min:.1,step:1}
  ],onApply:function(v){try{
    if(!(v.widthMm>0))throw new Error('Face width must be positive');
    var spec={family:"involute-gear",standard:"ISO 21771-1:2024",profile:"involute",rootGeometry:"rack-generated",moduleMm:v.moduleMm,teeth:v.teeth,pressureAngleDeg:v.pressureAngleDeg,backlashMm:v.backlashMm,profileShift:v.profileShift,allowUndercut:v.allowUndercut,cutter:{tipRadiusCoefficient:v.tipRadiusCoefficient,addendumCoefficient:v.addendumCoefficient}};
    spec.mate={...spec,teeth:v.mateTeeth,profileShift:v.mateProfileShift};var geometry=generatedRackGear(spec),pair=validateGearPair(spec,spec.mate);
    if(v.requireMatingCheck&&!pair.ok)throw new Error(pair.issues.join('; '));
    pushUndo(t("stdGearCommand"));
    var generated=Object.assign({id:uid(),kind:"ext",name:"Rack-generated gear m"+v.moduleMm+" z"+v.teeth,axis:"y",from:0,to:v.widthMm/10,pts:geometry.points,holes:[],standardCompliance:spec,gearGeometryCheck:pair,geometryApproximation:{kind:"rack-outline-polyline",outlineSimplificationMm:geometry.outlineSimplificationMm,estimatedChordErrorMm:geometry.estimatedChordErrorMm}},tourMaterial("#d0a84b"));
    if(isCanonicalAuthoring())registerGeneratedExtrusion(E.def,generated);
    addPart(generated);
    E.sel=E.def.parts.at(-1);E.def.lastStandardsAudit=null;flash(pair.ok?t("gearGeometryPassed")+" · "+pair.contactRatio.toFixed(3):t("gearStandaloneOnly"));return true;
  }catch(error){flash(error.message);return false;}}});
}

function materialValidationTools(){
  return createMaterialValidationUI({definition:()=>E.def,language:getLang,root:()=>root,uid:uid,form:openQuickForm,report:report,undo:pushUndo,flash:flash});
}
