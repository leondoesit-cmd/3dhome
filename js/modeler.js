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
export { findVisibleEnabledCoachTarget };
// for js/modeler/drawing_sheet.js (live bindings: it sees every reassignment)
export {
  addOverlayPolyline, assemblyDrawingBOMRows, assemblyDrawingBalloonTargets,
  authoritativeFinishTopology, axisOfView, btn, buildPart, currentHistoryNode,
  defBounds, el, invalidatePartMeshAfterEdit, mergeTargetBody, namedButton,
  newModel, openQuickForm, partUV, pathSketchSpline, pathUvCircleArc,
  pathUvEllipse, planeAxis, positiveArcSweep, queueExactMesh, renderedParts,
  sameSketchContext, scheduleExactMesh, setPanelCollapsed,
  sketchOpenPathReadiness, standardPlaneFrame, strokeUvCircle, strokeUvRect,
  syncHead, topologyEntriesForPart,
};
// for js/modeler/dimension_entry.js (live bindings: it sees every reassignment)
export {
  SKETCH_MAX_SCALE, SKETCH_MIN_SCALE, activeSketchFrame, applyCut,
  applyMouseGesture, cancelFacePick, cancelReferenceSelection,
  closeChromeOverlays, closeCommandSearch, closeReport, commandCatalog,
  cornerRoundForm, cutSkipNote, cutTargetFeatureId, dismissProfileOffer,
  doRedo, doUndo, drawSketch, drawingSheet, finishModelPlane, finishPoly,
  hitPart, invalidateSketchProjection, modelLengthUnit, modelerTouchDistances,
  moveInView, openCommandSearch, openSketchPointCoordinates,
  orientModelToView, partEditableInSketch, reportOpen, resolveTopologyPick,
  runCommand, saveCurrentDocument, scheduleModelerDraft, segmentLengthForm,
  selectAllTopology, selectionFilterAvailable, setModelDisplay,
  setSelectionFilter, showContextMenu, showShortcutBar, showViewSelector,
  sketchProjection, snapPt, snapV, solveAssembly, syncContextActions,
  syncTools, toPx, toUV, worldToSketchPx,
};
// for js/modeler/sketch_guide.js (live bindings: it sees every reassignment)
export {
  E, H, addPart, closeFeaturePanel, closedSketchProfile, fitPreview,
  fitSketch, flash, invalidateInterference, isCanonicalAuthoring,
  loadAssemblies, newAssembly, newDef, newSketchPoint, openParametricFeature,
  pushUndo, refreshAll, root, saveAssemblies, saveAssemblyDocument,
  selectedSolid, setCommandTab, setDocumentType, setMobileAddSelection,
  setMode, setTab, setTool, setView,
};
// for js/modeler/document_outputs.js (live bindings: it sees every reassignment)
export {
  componentDef, explodedPlaybackStop, modelLengthText, openExplodedPlayback,
  openImportedBundle, openMotionPlayback, showMassProperties,
  syncAssemblyWorkflow, syncCommandManager,
};
// for js/modeler/export_measure.js (live bindings: it sees every reassignment)
export {
  BODY_OPERATIONS, FINISH_AMOUNT_KEY, THREE_POINT_KEYS, emitPartMerges,
  emitPartPatternTurn, exactBuildTimers, exactRebuildQueue, exactSaveCache,
  exportThreeMfDocument, forceRebuildDocument, pendingCutController,
  publishExactBodies, syncAuthoringWorkflow,
};
// for js/modeler/library_panel.js (live bindings: it sees every reassignment)
export {
  addDocumentOverlays, applyAssemblyMates, applySectionClipping,
  assemblyPreviewSolved, committedRenderedParts, decoGroups, livePreviewParts,
  syncSectionHelper, syncViewportMeshSelection,
};
// for js/modeler/viewport_input.js (live bindings: it sees every reassignment)
export {
  activeFilletParams, activeTab, assemblyComponentById,
  beginAssemblyComponentDrag, beginBoxSelectDrag, beginSmartMateDrag,
  chooseSketchReference, chromeCommandLabel, chromeSelectionInput,
  commandSelectionPrefer, currentFinishEdges, edgeRefsForFaces,
  facePickFromViewport, featureTypeLabel, filletReferenceEndpoints,
  finishCommandActive, fullRoundActive, instantScratch, pickOwnerChain,
  queueNewFeaturePreview, rawTopologyPickCandidate, refreshSelection,
  runChromeCommand, selectionFilterLabel, syncNewFeaturePreview,
  toggleFinishEdges, toggleFullRoundFace,
};
// for js/modeler/notes_markups.js (live bindings: it sees every reassignment)
export { SVG_NS, drawMarkupsOverlay, noteScratch, refreshDecorations };
// for js/modeler/inspector.js (live bindings: it sees every reassignment)
export {
  CONSTRAINT_DEFS, DIMENSION_SYMBOLS, faceSketchAttachment,
  fillCabinetParameters, fillOps, inspectorDirty, materialValidationTools,
  numRow, openFeatureEditor, openSketchRepairs, referenceLabel,
  referencePlaneView, saveModelerPrefs, syncModelPlane,
};
// for js/modeler/component_mates.js (live bindings: it sees every reassignment)
export {
  MATE_PALETTE, PLANE_NAME_KEYS, acceptRackPinionSolve,
  assemblyMateInspectorBody, beginSketchWorkflow, componentFreedom,
  configuredComponentBuilds, loadLib, mateIssueLabel, mateReferenceRefreshes,
  mateTopologyMemo, redrawTrackedUpdates, requestDocumentType,
  selectedSketchableFace, syncDirty,
};
// for js/modeler/feature_tree.js (live bindings: it sees every reassignment)
export {
  PATTERN_MERGE_PREVIEW_DELAY, activeLoftCreation, consumedSketchIds,
  patternMergePreviewBadge, refreshViewportSelection,
};
// for js/modeler/tree_assembly.js (live bindings: it sees every reassignment)
export {
  FINISH_FEATURES, assemblyLibraryCache, captureSketchCameraPose,
  clearPatternMerges, countLabel, exactDisplayBody, freedomLabel,
  layPatternCopies, leavingQuickForm, mateIssuesFor, modelLibraryCache,
  patternPlacements, resolvedRevolve, scheduleKernelBody, selectedPatternBody,
  toggleIsolate,
};
// for js/modeler/sketch_dimension_editor.js (live bindings: it sees every reassignment)
export { RELATION_REFUSAL_MS };
// for js/modeler/sketch_entities.js (live bindings: it sees every reassignment)
export {
  SKETCH_ENTITY_TYPES, assemblyMateCount, brokenMateCount, documentDirty,
  finishSelectionMessage, layout3DHost, modelAreaText, queueKernelBody,
  syncExactWorkerActivity, syncExtrudeButton,
};
// for js/modeler/welcome_coach.js (live bindings: it sees every reassignment)
export {
  WELCOME_STARTS, assemblyWorkflowState, currentWorkflowStep,
  finishSketchWorkflow, showReferencePicker,
};

var LS_MODELS = "home3d_models";
var LS_ASSEMBLIES = "home3d_assemblies";
var modelLibraryCache = [];
var assemblyLibraryCache = [];
var modelerDraftCache = null;
var modelerDraftOwnerId = modelerDraftOwner(modelerSessionStorage());
var libraryOpenBaseline = null;
var assemblyOpenBaseline = null;
var libraryChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("modelforge-model-library-v1");

/* The feature catalogue cannot import t() — it is a shared module loaded
   without a UI — so it asks for a translation through this resolver instead.
   An unknown key falls back to the catalogue's own English string. */
setFeatureLabelResolver(function (key, fallback) {
  return TXT[key] ? t(key) : fallback;
});
function featureTypeLabel(type) {
  var spec = featureSpec(type);
  return spec ? featureLabel(spec) : type;
}

/* ================= library persistence + FURN registration ================= */
function loadLib() {
  return cloneData(modelLibraryCache);
}
async function initializeModelLibrary() {
  var legacy=[], legacyAssemblies=[];
  try {
    var stored=JSON.parse(localStorage.getItem(LS_MODELS)) || [];
    if (Array.isArray(stored) && stored.some(function(model){return Array.isArray(model.parts);})) legacy=stored;
  } catch(e) {}
  try {
    var storedAssemblies=JSON.parse(localStorage.getItem(LS_ASSEMBLIES)) || [];
    if (Array.isArray(storedAssemblies) && storedAssemblies.some(function(item){return Array.isArray(item.components);})) legacyAssemblies=storedAssemblies;
  } catch(e) {}
  try { modelLibraryCache=await loadModelLibrary(legacy); }
  catch(e) { modelLibraryCache=legacy; }
  try { assemblyLibraryCache=await loadAssemblyLibrary(legacyAssemblies); }
  catch(e) { assemblyLibraryCache=legacyAssemblies; }
  try {
    modelerDraftCache=await loadModelerDraftRecord(modelerDraftOwnerId);
    if (!modelerDraftCache) modelerDraftCache=readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  } catch(e) { modelerDraftCache=readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId); }
  writeLibraryIndex(modelLibraryCache);
  writeAssemblyIndex(assemblyLibraryCache);
  // Give models that predate the disk mirror a copy now, not at their next save.
  mirrorLibraryToDisk(modelLibraryCache);
}
function writeLibraryIndex(lib) {
  try {
    localStorage.setItem(LS_MODELS, JSON.stringify(lib.map(function(model){return {
      key:model.key,name:model.name,w:model.w,d:model.d,h:model.h,partCount:(model.parts || []).length,updatedAt:Date.now()
    };})));
    return true;
  } catch (e) { return false; }
}
function writeAssemblyIndex(list) {
  try {
    localStorage.setItem(LS_ASSEMBLIES, JSON.stringify((list || []).map(function(item){return {
      key:item.key,name:item.name,componentCount:(item.components || []).length,updatedAt:Date.now()
    };})));
    return true;
  } catch (e) { return false; }
}
/* Every library write is mirrored to disk through the relay
   (server/model_backup.mjs). IndexedDB can be cleared by the browser, and that
   has taken finished models with it. Best-effort and deferred: the mirror must
   never slow down or fail the save itself. The cache is handed over because it
   is only ever reassigned, never mutated, so the deferred copy stays exact. */
function diskBackupAttachments(model) {
  return collectAttachmentReferences(model).size ? exportAttachmentRecords(model) : [];
}
function mirrorLibraryToDisk(models) {
  setTimeout(function () {
    try { queueModelBackup(models, { attachmentsFor:diskBackupAttachments }); } catch (e) { /* the save already landed */ }
  }, 0);
}
async function refreshLibraryFromOtherTab() {
  var previous=new Set(modelLibraryCache.map(function(model){return model.key;}));
  var models=await loadModelLibrary(), assemblies=await loadAssemblyLibrary();
  modelLibraryCache=models; assemblyLibraryCache=assemblies;
  writeLibraryIndex(models); writeAssemblyIndex(assemblies);
  var current=new Set(models.map(function(model){return model.key;}));
  previous.forEach(function(key){if(!current.has(key)){delete FURN[key];delete PRICE[key];}});
  // Catalogue normalization adds render defaults. Keep the library snapshot
  // byte-for-byte equal to its stored record for optimistic save baselines.
  models.forEach(function(model){registerCustomModel(cloneData(model));});
  if(root && E && E.open){
    refreshCatalogSelect();refreshLib();
    if(E.docType==="assembly"){
      // Defer while a document or inspector edit is in progress.
      if(E.assembly?.components?.some(c=>c.libraryLink) && !documentDirty() &&
         !E.contextEdit && !E.quickAction && !motionPlaybackCancel && !E.drag &&
         !document.activeElement?.matches("input,textarea,select,[contenteditable=true]") && !documentSaveTasks.has(assemblySaveSession(E.assembly))) {
        if(applyTrackedUpdates(E.assembly))redrawTrackedUpdates();
      }
      refreshComponents();
      var status=root.querySelector?.("#mdLibraryLinkStatus");
      if(status && E.sel)fillLibraryLinkStatus(status,E.sel);
    }
    if(E.mode==="drawing"){drawSketch();syncSheetPanel();}
  }
}
if(libraryChannel)libraryChannel.addEventListener("message",function(){
  libraryRefreshQueue=libraryRefreshQueue.then(refreshLibraryFromOtherTab).catch(function(){});
});
var libraryRefreshQueue=Promise.resolve();
function signalLibraryChange() { if(libraryChannel)libraryChannel.postMessage("changed"); }
var lastLibrarySaveConflict=false;
var lastLibrarySaveError=null;
async function saveLib(records, options={}) {
  lastLibrarySaveError=null;
  try {
    var result=options.mode==="delete" ? await deleteModelLibraryRecord(records)
      : options.mode==="merge" ? await mergeStoredModelLibrary(records,{conflict:options.conflict || "replace"})
      : await putModelLibraryRecord(records,{expected:options.expected});
    lastLibrarySaveConflict=!!result.conflict;
    modelLibraryCache=cloneData(result.records);
    writeLibraryIndex(modelLibraryCache);
    if(result.ok && options.mode!=="delete") mirrorLibraryToDisk(options.mode==="merge" ? result.puts : [records]);
    if(!result.ok)return false;
    signalLibraryChange();
    return true;
  } catch (e) { lastLibrarySaveConflict=false;lastLibrarySaveError=e;return false; }
}

function redrawTrackedUpdates() {
  // Rebuild the displayed geometry only. A component inspector can own staged
  // placement inputs even after focus has moved away from the input.
  var previous=assemblyPreviewSolved;
  try {
    assemblyPreviewSolved=true;
    invalidateInterference();updatePreview();drawSketch();
  } finally {assemblyPreviewSolved=previous;}
  var status=root.querySelector("#mdLibraryLinkStatus");
  if(status && E.sel)fillLibraryLinkStatus(status,E.sel);
}
function applyTrackedUpdates(assembly) {
  var resolved=resolvedLibraryAssembly(assembly);
  if(resolved===assembly)return false;
  resolved.components.forEach(function(component,i){
    if(component!==assembly.components[i])Object.assign(assembly.components[i],component);
  });
  return true;
}
function loadAssemblies() {
  return cloneData(assemblyLibraryCache);
}
/* Returns whether the write landed, exactly as saveLib() does. Swallowing the
   quota error and returning nothing let saveAssemblyDocument() announce a save
   that never happened, mark the document clean and delete its recovery draft —
   the one copy of the work that was left. */
async function saveAssemblies(records, options={}) {
  try {
    var result=options.mode==="delete" ? await deleteAssemblyLibraryRecord(records)
      : options.mode==="merge" ? await mergeStoredAssemblyLibrary(records,{conflict:options.conflict || "replace"})
      : await putAssemblyLibraryRecord(records,{expected:options.expected});
    assemblyLibraryCache=cloneData(result.records);
    writeAssemblyIndex(assemblyLibraryCache);
    lastAssemblySaveConflict=!!result.conflict;
    if(result.ok)signalLibraryChange();
    return !!result.ok;
  } catch (e) { lastAssemblySaveConflict=false; return false; }
}
var lastAssemblySaveConflict=false;
function newAssembly() {
  return {
    key: "asm_" + Date.now().toString(36),
    name: t("newAssembly"),
    components: [],
    mates: [],
  };
}
function componentDef(component) {
  if (!component) return null;
  if (component.def && Array.isArray(component.def.parts)) return component.def;
  var lib = loadLib();
  for (var i = 0; i < lib.length; i++) if (lib[i].key === component.modelKey) return lib[i];
  var f = FURN[component.modelKey];
  return f && f.custom && Array.isArray(f.custom.parts) ? f.custom : null;
}
/* Where the assembly actually is, in assembly coordinates: every component's
   own bounds, turned and moved into place. Used to frame the camera, so it has
   to account for rotation — the corners are transformed, not the extents. */
/* One component's own bounds placed in assembly coordinates. The corners are
   transformed rather than the extents, because a turned component's box is not
   the turned box of its extents. `blown` folds in the exploded offset when the
   caller wants where the part is being drawn rather than where it is mated. */
function componentWorldBounds(component, options) {
  /* A sub-assembly is as big as everything visible inside it, carried through
     its own pose the same way a part's box is. */
  if (isSubassembly(component)) {
    var inner = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    component.asm.components.forEach(function (child) {
      if (child.visible === false) return;
      var cb = componentWorldBounds(child, options);
      if (!cb) return;
      inner.x0 = Math.min(inner.x0, cb.x0); inner.x1 = Math.max(inner.x1, cb.x1);
      inner.y0 = Math.min(inner.y0, cb.y0); inner.y1 = Math.max(inner.y1, cb.y1);
      inner.z0 = Math.min(inner.z0, cb.z0); inner.z1 = Math.max(inner.z1, cb.z1);
    });
    if (!Number.isFinite(inner.x0)) return null;
    return placedBounds(inner, component, options);
  }
  var def = componentDef(component);
  /* Measured against what defBounds will actually walk. Asking `def.parts`
     instead let a component whose every body is suppressed through, and
     defBounds answers an empty document with a fixed ±30 box — a 60 cm solid
     that renders as nothing, clashes with its neighbours and prints on the
     drawing. */
  if (!def || !activeParts(def).length) return null;
  return placedBounds(defBounds(def), component, options);
}

function placedBounds(b, component, options) {
  var tr = normalizeTransform(component);
  var blown = ((!options || options.exploded !== false) && component.explodedOffset) || { x: 0, y: 0, z: 0 };
  var matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180));
  var out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  [b.x0, b.x1].forEach(function (x) {
    [b.y0, b.y1].forEach(function (y) {
      [b.z0, b.z1].forEach(function (z) {
        var corner = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        var px = corner.x + tr.x + (blown.x || 0), py = corner.y + tr.y + (blown.y || 0), pz = corner.z + tr.z + (blown.z || 0);
        out.x0 = Math.min(out.x0, px); out.x1 = Math.max(out.x1, px);
        out.y0 = Math.min(out.y0, py); out.y1 = Math.max(out.y1, py);
        out.z0 = Math.min(out.z0, pz); out.z1 = Math.max(out.z1, pz);
      });
    });
  });
  return out;
}

function assemblyBounds() {
  var out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  ((E.assembly && E.assembly.components) || []).forEach(function (component) {
    if (component.visible === false) return;
    var b = componentWorldBounds(component);
    if (!b) return;
    out.x0 = Math.min(out.x0, b.x0); out.x1 = Math.max(out.x1, b.x1);
    out.y0 = Math.min(out.y0, b.y0); out.y1 = Math.max(out.y1, b.y1);
    out.z0 = Math.min(out.z0, b.z0); out.z1 = Math.max(out.z1, b.z1);
  });
  return Number.isFinite(out.x0) ? out : null;
}

function applyAssemblyMates(assembly, solveOptions) {
  if (!assembly) return null;
  mateSolveCount++;
  /* The old align/distance mates are part of the system the solver solves —
     they used to be applied by hand at the head of every pass, which is the
     best a solver that placed one component at a time could do. Both kinds now
     settle together because they are solved together. */
  var result = solveTopologyMates(assembly, {...solveOptions, partTopology:contextPartTopology});
  /* The solver reports missing topology, ambiguous rebinds, frames it could
     not use, and — since it now measures the result — mates that another mate
     has overridden. That report used to be discarded at this line, which is
     why a mate could quietly stop holding and nothing anywhere said so. */
  E.mateIssues = (result && result.issues) || [];
  E.mateRebindings = (result && result.rebindings) || [];
  E.mateUnsatisfied = (result && result.unsatisfied) || [];
  /* What the mates have not pinned down. The solver reads it off the rank of
     the system it just solved, per independent group of components and per
     component within it, which is the difference between "solved" and "solved,
     and this bracket can still slide and spin". */
  E.mateFreedom = (result && result.clusters) || [];
  E.mateDegreesOfFreedom = (result && result.degreesOfFreedom) || 0;
  E.mateMobilityReport=assemblyMobilityReport(assembly,result,E.mateIssues);
  return result;
}

/* "1 mates" reads as a bug in the counter. Hebrew and English both want the
   singular spelled out rather than derived, so each count names both keys. */
function countLabel(n, oneKey, manyKey) {
  return n + " " + t(n === 1 ? oneKey : manyKey);
}

function assemblyMateCount(assembly) {
  return (((assembly && assembly.mates) || []).length) + (((assembly && assembly.topologyMates) || []).length);
}

/* A deleted component used to take its legacy mates with it and leave its
   topology mates behind, pointing at nothing, all the way into the saved
   document. Returns how many were dropped so the caller can say so. */
function pruneAssemblyMates(assembly) {
  if (!assembly) return 0;
  var live = new Set((assembly.components || []).map(function (component) { return component.id; }));
  var before = assemblyMateCount(assembly);
  assembly.mates = (Array.isArray(assembly.mates) ? assembly.mates : []).filter(function (mate) {
    return live.has(mate.a) && live.has(mate.b);
  });
  assembly.topologyMates = (Array.isArray(assembly.topologyMates) ? assembly.topologyMates : []).filter(function (mate) {
    return mate.a && mate.b && live.has(mate.a.componentId) && live.has(mate.b.componentId)
      && (!mate.c || live.has(mate.c.componentId) || mate.c.componentId === ASSEMBLY_ORIGIN_ID);
  });
  return before - assemblyMateCount(assembly);
}

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

function mateIssueLabel(issue) {
  var key = MATE_ISSUE_KEYS[issue && issue.code];
  return key ? t(key) : String((issue && issue.code) || "");
}

function mateIssuesFor(mateId) {
  return (E.mateIssues || []).concat(E.mateUnsatisfied || [])
    .filter(function (issue) { return !issue.componentPath && issue.mate === mateId; });
}

/* How many mates are broken — not how many complaints were filed about them.
   One mate raises several records on the way down: a reference that cannot be
   found reports its own missing topology, and then the mate reports itself
   unresolved. Adding the lists up said "2 unresolved mates" for one mate. */
function brokenMateCount() {
  var mates = new Set();
  (E.mateIssues || []).concat(E.mateUnsatisfied || []).forEach(function (issue) {
    if (issue?.componentPath && issue.code === "context-reference") mates.add(JSON.stringify(["context",issue.componentPath]));
    else if (issue?.mate != null) mates.add(JSON.stringify(["mate",issue.componentPath,issue.mate]));
  });
  return mates.size;
}

/* How many ways a component can still be moved without breaking a mate. Null
   when the last solve did not say — a component no mate moves is not
   "6 degrees free", it is simply not solved for. */
function componentFreedom(componentId) {
  for (var i = 0; i < (E.mateFreedom || []).length; i++) {
    var cluster = E.mateFreedom[i];
    if (cluster && cluster.perComponent && cluster.perComponent[componentId] != null) {
      return cluster.perComponent[componentId];
    }
  }
  return null;
}

function freedomLabel(freedom) {
  if (freedom == null) return "";
  return freedom ? countLabel(freedom, "mateDofOne", "mateDof") : t("mateDofFixed");
}

/* A mate whose face was renamed by a rebuild but found again by its geometry
   still holds — say so, rather than leaving the reattachment invisible. */
function mateReboundFor(mateId) {
  return (E.mateRebindings || []).some(function (entry) { return !entry.componentPath && entry.mate === mateId; });
}

/* Set by a solve, cleared by the refresh that consumes it. Every mutating path
   is `solveAssembly(); refreshAll();`, and refreshAll solves again for the
   benefit of callers that changed the assembly without going through
   solveAssembly — so without this the whole multi-pass solve, plus its residual
   check, ran twice on every click. */
var assemblySolveFresh = false;
var coreRunFresh = false;
// Only true inside a synchronous full refresh whose solver already ran.
// A standalone viewport/drawing build still solves its current assembly.
var assemblyPreviewSolved = false;

/* Interference results describe one exact set of visible components at one
   exact arrangement. Component edits, visibility changes and document
   restoration all invalidate that answer even when no mate needs solving. */
function invalidateInterference() {
  cancelInterferenceCheck();
  E.interferenceHits = [];
  E.interferenceChecked = false;
  E.interferenceRevision = (E.interferenceRevision || 0) + 1;
  /* Every path that swaps the assembly or changes which components are in it
     comes through here, which makes it the right place to say a previous solve
     no longer describes the model — an undo that restored a different pose must
     not have its solve skipped by a flag left set by an earlier edit. */
  assemblySolveFresh = false;
}

/* Everything that changes an assembly goes through here: drop mates whose
   components have gone, re-solve, and say out loud what the solver could not
   do. Rebuilds call applyAssemblyMates directly — a render is not the place to
   delete data or raise a message. */
function solveAssembly(options) {
  if (!E.assembly) return null;
  /* The red clash boxes describe one arrangement of the components. Any edit
     that moves them makes those boxes a lie, and they used to stay on screen
     until the document type changed. */
  invalidateInterference();
  var dropped = pruneAssemblyMates(E.assembly);
  var result = applyAssemblyMates(E.assembly, options);
  assemblySolveFresh = true;
  if (options && options.quiet) return result;
  var notes = [];
  if (dropped) notes.push(countLabel(dropped, "matesCountOne", "matesCount") + " " + t("mateOrphansDropped"));
  var broken = brokenMateCount();
  if (broken) notes.push(countLabel(broken, "assemblyIssueOne", "assemblyIssues"));
  if (notes.length) flash(notes.join(" \u00b7 "));
  return result;
}



function migrateDefinitionProfileCuts(definition, schedule) {
  var changed = false;
  (definition && definition.parts || []).forEach(function (part) {
    if (!migrateBoundaryChangingProfileCuts(part)) return;
    changed = true;
    if (schedule) scheduleExactMesh(part);
  });
  return changed;
}
/* Compatibility render projection.  In parametric-v1 documents `features` and
   `history` are authoritative; parts are disposable preview records consumed by
   the existing Three.js scene.  Legacy documents still honour their rollback
   index here until migration converts them to canonical history. */
export function activeParts(def) {
  if (!def || !Array.isArray(def.parts)) return [];
  var upto = fin(def.rollback) && def.rollback >= 0 ? Math.min(def.rollback, def.parts.length) : def.parts.length;
  var parts = def.parts.slice(0, upto).filter(function (p) { return p && !p.suppressed; });
  if (def.rollbackIndex != null) parts=parts.filter(function (p) {
    var index = featureHistoryIndex(def.history, p.featureId);
    return index < 0 || !historyEntryRolled(def, index);
  });
  return def.metadata?.authoringSystem==='parametric-v1' ? deduplicateBooleanProjections(parts,def,cutTargetFeatureId) : parts;
}

// Command previews live outside the document so saving, rebuilding and undo
// never mistake transient geometry for design intent.  Every visual surface
// consumes this projection helper, which keeps 2D, 3D and drawing views in sync.
/* Hiding a body is not suppressing the feature that made it. A hidden body is
   still built, still exported, still weighed — it is only left out of the drawn
   scene. Suppression, which the feature row offers, is the other thing: it stops
   the step building at all. Conflating them would make the eye on a body row
   quietly change the model. */
function hiddenBodyPart(part) {
  var hidden = E.hiddenBodies;
  if (!hidden || !hidden.length || !part) return false;
  return hidden.indexOf("body:" + part.id) >= 0
    || (!!part.featureId && hidden.indexOf("body:" + part.featureId) >= 0)
    || (!!part.derivedFeatureId && hidden.indexOf("body:" + part.derivedFeatureId) >= 0);
}

function renderedParts(def) {
  var parts=activeParts(def);
  /* Only the document being edited has a hidden set; a library thumbnail is
     rendered from the same function and must not inherit the editor's state.

     `E` is guarded, not just read: this module registers the saved library into
     FURN at module scope (see loadLib().forEach below), and `var E = {...}` is
     declared AFTER that line, so during boot registration E is still undefined.
     Reading E.def threw for every saved model, registerCustomModel swallowed it
     in its catch and returned false, and NOTHING was registered — so a custom
     model could not be placed, and reopening one from the library found no
     definition and produced a blank document. A document being normalised
     before the editor exists has no editor state to inherit, which is exactly
     what this branch means to express.

     `E.open` for the same reason at the other end: closeModeler() clears
     neither E.def nor E.hiddenBodies, so after the editor closes `def===E.def`
     stays true for that document and a library thumbnail would keep hiding
     bodies the user hid during a finished editing session — and could show a
     transient finish preview. A closed editor is not editing. (The main 3D
     scene never reaches here: custom build closures call activeParts(def).) */
  if(E && E.open && def===E.def) parts=parts.filter(function(part){return !hiddenBodyPart(part);});
  if(E && E.open && def===E.def && E.authoring && Array.isArray(E.authoring.previewParts)){
    /* A finish preview is a temporary replacement for its source body, not a
       second coincident body.  Drawing both made the exact fillet flicker and
       left the old sharp edge visible through the result. */
    if(E.authoring.previewReplacesPartId)parts=parts.filter(function(part){return part.id!==E.authoring.previewReplacesPartId;});
    parts=parts.concat(E.authoring.previewParts);
  }
  if(def && def.appearances && def.appearances.length) parts=applyAppearanceOverrides(parts, def.appearances);
  return parts;
}

function livePreviewParts() {
  return (E && E.authoring && Array.isArray(E.authoring.previewParts)) ? E.authoring.previewParts : [];
}

/* Bodies that already belong to the document. Live ghosts ride a separate
   THREE group so dragging a new feature does not dispose them. */
function committedRenderedParts(def) {
  var live = livePreviewParts();
  if (!live.length) return renderedParts(def);
  var ids = {};
  live.forEach(function (part) { ids[part.id] = true; });
  return renderedParts(def).filter(function (part) { return !ids[part.id]; });
}

/* Add one derived preview part.  Canonical feature creation happens before this
   adapter is called; this function never records design intent. */
function addPart(part) {
  part.id = part.id || uid();
  part.featureId = part.featureId || "feature:part:" + part.id;
  if (fin(E.def.rollback) && E.def.rollback < E.def.parts.length) {
    E.def.parts.splice(E.def.rollback, 0, part);
    E.def.rollback++;
  } else E.def.parts.push(part);
  return part;
}


function defBounds(def) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  renderedParts(def).forEach(function (p) {
    var q = partBounds(p);
    b.x0 = Math.min(b.x0, q.x0); b.x1 = Math.max(b.x1, q.x1);
    b.y0 = Math.min(b.y0, q.y0); b.y1 = Math.max(b.y1, q.y1);
    b.z0 = Math.min(b.z0, q.z0); b.z1 = Math.max(b.z1, q.z1);
  });
  if (b.x1 < b.x0) b = { x0: -30, x1: 30, y0: 0, y1: 60, z0: -30, z1: 30 };
  return b;
}

// Center model in x/z, rest on floor, and compute catalog dims.
function normalizeDef(def) {
  // Cabinet coordinates are the semantic carcass frame, including plinth and
  // motion pivots. Centering the mesh would detach them from that frame.
  if (def.metadata && (def.metadata.adapter === "cabinet" || def.metadata.authoringSystem === "parametric-v1")) return;
  var b = defBounds(def);
  var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, fy = b.y0;
  var dx=-cx,dy=-fy,dz=-cz;
  def.parts.forEach(function (p) { movePart(p, dx, dy, dz,true); });
  (Array.isArray(def.sketches) ? def.sketches : def.sketch ? [def.sketch] : []).forEach(function(sketch){
    if (sketch.frameSpace==="local" && sketch.frame && sketch.frame.origin) {
      sketch.frame.origin.x+=dx;sketch.frame.origin.y+=dy;sketch.frame.origin.z+=dz;
    } else {
      var du=sketch.plane==="side" ? dz : dx, dv=sketch.plane==="top" ? dz : dy;
      (sketch.points || []).forEach(function(point){point.x+=du;point.y+=dv;});
      if (sketch.plane==="top") sketch.offset=(Number(sketch.offset)||0)+dy;
      else if (sketch.plane==="front") sketch.offset=(Number(sketch.offset)||0)+dz;
      else sketch.offset=(Number(sketch.offset)||0)+dx;
    }
  });
  (def.references || []).forEach(function(reference){
    if (!reference || ["origin","plane:top","plane:front","plane:right","axis:x","axis:y","axis:z"].includes(reference.id) || !reference.origin) return;
    reference.origin.x+=dx;reference.origin.y+=dy;reference.origin.z+=dz;
  });
  translateTopologyReferences({sketches:def.sketches,parts:def.parts,features:def.features},dx,dy,dz);
  translateNotes(def.notes, dx, dy, dz);
  translateMarkups(def.markups, dx, dy, dz);
  b = defBounds(def);
  Object.assign(def, modelDimensions(b));
  if ((def.parts || []).some(function(part){return !!part.parametricEnvelope;}) && def.parameters) {
    if (def.parameters.width && typeof def.parameters.width==="object") def.parameters.width.value=b.x1-b.x0;
    if (def.parameters.depth && typeof def.parameters.depth==="object") def.parameters.depth.value=b.z1-b.z0;
    if (def.parameters.height && typeof def.parameters.height==="object") def.parameters.height.value=b.y1-b.y0;
  }
}


// texture cache for custom-part image textures (shared with primitives' box() via opt.tex)
function applyTexTo(mesh, p, wCm, hCm) {
  if (!mesh || !p.tex) return;
  if (!S.customTexCache) S.customTexCache = {};
  if (!S.customTexCache[p.tex]) {
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    var tl = loader.load(p.tex, function () {
      S.dirty3D = true;
      S.repaint3D = true;
      updatePreview();
    });
    tl.wrapS = tl.wrapT = THREE.RepeatWrapping;
    S.customTexCache[p.tex] = tl;
  }
  // Cloning before the bitmap lands yields a version>0 texture with a null
  // image, which throws inside the renderer's texture upload; the loader
  // callback above re-runs this once the image is decoded.
  if (!S.customTexCache[p.tex].image) return;
  // shared per repeat: every clone is its own GPU upload (see pbr_material.js)
  mesh.material.map = sharedRepeat(S.customTexCache[p.tex], (wCm || 100) / 100, (hCm || 100) / 100, mesh.material);
  mesh.material.color.setHex(0xffffff);
  mesh.material.needsUpdate = true;
}





/* A saved canonical body can have verified exact topology before its display
   mesh finishes rebuilding. The signature check covers the feature prefix and
   every supporting sketch; an edited body must wait for fresh topology. */
function savedExactTopologyForPart(part) {
  if (!part || E.docType !== "part" || !E.def?.exactTopologyCache || !isCanonicalAuthoring()) return null;
  var compiled = compileKernelFeatureTree(E.def);
  if (!compiled.ok) return null;
  var head = cutTargetFeatureId(part, E.def);
  return verifiedExactTopology(E.def, compiled.features).get(head) || null;
}

function topologyEntriesForPart(part) {
  if (!part) return [];
  var featureId = part.featureId || "feature:part:" + part.id;
  var kernel = [];
  if (part.meshData && Array.isArray(part.meshData.topology) && part.meshData.topology.length) {
    kernel = part.meshData.topology;
    var cached = topologyMergeCache.get(part.meshData);
    if (cached) return cached;
  } else {
    var savedExact = savedExactTopologyForPart(part);
    if (savedExact?.length) return mergeSmoothTopology(savedExact);
    /* Kernel runs belong to the part document on E.def. A component carries its
       own document, so borrowing them in an assembly scored a component's faces
       against another document's topology — and could hand one of those foreign
       descriptors to a mate. Neither run is cleared when the document type
       changes, so the guard is on who is asking, not on whether one exists. */
    var sources = [];
    if (E.docType === "part") {
      if (E.brepRun && Array.isArray(E.brepRun.topology)) sources = sources.concat(E.brepRun.topology);
      if (E.coreRun && Array.isArray(E.coreRun.topology)) sources = sources.concat(E.coreRun.topology);
    }
    var seen = new Set();
    kernel = sources.filter(function (entry) {
      if (!entry || seen.has(entry.persistentId)) return false;
      if (entry.ownerFeatureId && entry.ownerFeatureId !== featureId) return false;
      seen.add(entry.persistentId);
      return true;
    });
  }
  var meshCircles = meshCircleEntries(part, featureId);
  /* Rims come from the mesh when there is one, from the loops otherwise; the
     hole walls are only ours to name when no kernel topology describes them. */
  var kernelHasFaces = kernel.some(function (entry) { return entry && entry.kind === "face"; });
  var extras = (meshCircles.length ? meshCircles : holeAndCutEdges(part, featureId))
    .concat(kernel.length ? [] : holeAndCutFaces(part, featureId))
    .concat(kernelHasFaces ? [] : meshFaceEntries(part, featureId));
  var analytic = kernel.length ? [] : analyticPartTopology(part,featureId);
  var entries = mergeSmoothTopology(kernel.concat(analytic, extras));
  if (kernel.length && part.meshData && kernel === part.meshData.topology) topologyMergeCache.set(part.meshData, entries);
  return entries;
}










/* Two components cut from the same library model carry identical persistent
   ids, so a reference has to name its component or picking a face lights up
   the same face on every instance of that model. */
function topologyRefInBuiltComponent(reference) {
  var building = E.buildComponent;
  if (!building) return true;
  return !reference || !reference.componentId || reference.componentId === building.id;
}
/* A part built inside a sub-assembly answers under the path of child ids that
   leads to it, which is how its faces are named on the sub-assembly. */
function builtTopologyId(persistentId) {
  var prefix = E.buildComponent && E.buildComponent.prefix || "";
  return prefix ? prefix + persistentId : persistentId;
}
function builtMemberIds(entry) {
  var prefix = E.buildComponent && E.buildComponent.prefix || "";
  var ids = (entry && entry.memberPersistentIds) || [];
  return prefix ? ids.map(function (id) { return prefix + id; }) : ids;
}
function topologySelected(persistentId, entry) {
  var rawId = persistentId;
  persistentId = builtTopologyId(rawId);
  var sel = (E.topologySelection || []).filter(topologyRefInBuiltComponent);
  if (sel.some(function (ref) {
    if (ref.persistentId === persistentId) return true;
    if ((ref.memberPersistentIds || []).includes(persistentId)) return true;
    if (entry && builtMemberIds(entry).includes(ref.persistentId)) return true;
    return !!(entry && !E.buildComponent?.prefix && edgesGeometricallyMatch(ref, entry));
  })) return true;
  return finishImpliedEdge(rawId);
}
function topologyHovered(persistentId, entry) {
  if (!E.hoverTopology || !topologyRefInBuiltComponent(E.hoverTopology)) return false;
  persistentId = builtTopologyId(persistentId);
  if (E.hoverTopology.persistentId === persistentId) return true;
  if ((E.hoverTopology.memberPersistentIds || []).includes(persistentId)) return true;
  return !!(entry && !E.buildComponent?.prefix && edgesGeometricallyMatch(E.hoverTopology, entry));
}

function finishImpliedEdge(persistentId) {
  if (!E.authoring || !["fillet", "chamfer"].includes(E.authoring.featureType)) return false;
  var faces = (E.topologySelection || []).filter(function (reference) { return reference.kind === "face"; });
  if (!faces.length) return false;
  var part = selectedSolid();
  if (!part) return false;
  var entry = topologyEntriesForPart(part).find(function (item) { return item.persistentId === persistentId; });
  return !!(entry && entry.kind === "edge" && faces.some(function (face) { return edgeLiesOnFace(entry, face); }));
}





/* Overlay and pick targets are the crease edges of the solid that is on
   screen. Analytic box ribs that a cut already removed never get a line, and a
   tessellated hole rim is one circle — not one selectable chord per facet. */
function overlayEntriesForPart(part, mesh) {
  /* Never synthesize pick lines from the pre-cut primitive while its exact
     post-cut topology is rebuilding. Those lines may cross empty space and
     become selectable even though the corresponding material is gone. */
  if (partNeedsExactMesh(part) && !(part.meshData && Array.isArray(part.meshData.topology) && part.meshData.topology.length)) {
    var savedExact = savedExactTopologyForPart(part);
    return savedExact?.length ? mergeSmoothTopology(savedExact).filter(function (entry) { return entry.kind === "edge"; }) : [];
  }
  /* Cache key. An exact body keys on its meshData, which survives rebuilds;
     a primitive has none, so it keys on the tessellated geometry — and
     buildPart makes a NEW geometry every rebuild, so primitives never hit.
     That is deliberate, not an oversight. Measured cost of the pass this
     cache exists to avoid (meshFeatureEdges, this machine):

         box      12 tri   0.04 ms      cylinder  192 tri   0.40 ms
         kernel 2000 tri   3.76 ms      kernel   8000 tri  15.46 ms

     The expensive case is exactly the one that keys on meshData and does hit.
     Do NOT "fix" primitives by hashing their geometry fields into a value
     signature: it must enumerate every field the entries depend on, forever,
     and a miss is a silently stale edge overlay. 0.4 ms is not worth that. */
  var cacheKey = (part && part.meshData) || (mesh && mesh.geometry) || null;
  if (cacheKey) {
    var cached = overlayEntryCache.get(cacheKey);
    if (cached) return cached;
  }
  /* An exact body carries the kernel's own edge list.  Re-deriving edges from
     its tessellation drew every facet crease of a small fillet or chamfer as a
     separate black line, which is what made a filleted body look shredded. */
  var data = part.meshData && Array.isArray(part.meshData.positions) && part.meshData.positions.length >= 9
    ? part.meshData
    : geometryToMeshData(mesh && mesh.geometry);
  var features = data ? meshFeatureEdges(data) : { circles: [], polylines: [] };
  var exact = exactOverlayEntries(part, features);
  if (exact.length) {
    if (cacheKey) overlayEntryCache.set(cacheKey, exact);
    return exact;
  }
  var kernelEdges = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "edge"; });
  /* Both loops below used to scan every kernel edge per mesh feature, which is
     O(n^2) on a body with a few hundred edges. Bucket once instead.

     A circle only matches within max(0.25, r*0.05) of its radius, and a
     polyline only matches when BOTH endpoints land within
     max(0.45, measure*0.04) — which bounds the length difference at twice that.
     So a candidate can never sit outside a band of buckets around the query,
     and probing that band is exact, not approximate: the original predicate
     still decides every hit. Candidates are re-sorted into their original
     kernelEdges order before matching so "first match wins" resolves exactly as
     it did when the list was scanned end to end. */
  var kernelCircleBuckets = new Map(), kernelLineBuckets = new Map();
  var midpointKey = function (a, b) {
    return Math.round(((a.x + b.x) + (a.y + b.y) + (a.z + b.z)) / 2);
  };
  var bucketPush = function (map, key, value) {
    var list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    list.push(value);
  };
  kernelEdges.forEach(function (entry, index) {
    var record = { entry: entry, index: index };
    var descriptor = entry.descriptor;
    if (descriptor && descriptor.curve === "circle") {
      bucketPush(kernelCircleBuckets, Math.round(Number(descriptor.radius) || 0), record);
    } else {
      /* Bucket on the ENDPOINT MIDPOINT, not on path length. The predicate
         below only ever compares endpoints, so two polylines can share them
         and still differ in length — a straight kernel edge against a mesh
         chain that approximates a curve between the same two points. Length
         buckets would file those apart and lose the match. The midpoint is
         orientation-invariant (the predicate accepts either winding) and moves
         at most `tol` per axis when both endpoints do, so a one-dimensional
         key over its coordinate sum is a strict superset: never a missed
         candidate, and the original predicate still decides. */
      var ends = descriptor ? edgePoints(descriptor) : [];
      bucketPush(kernelLineBuckets, ends.length >= 2 ? midpointKey(ends[0], ends[ends.length - 1]) : 0, record);
    }
  });
  var bucketCandidates = function (map, centre, reach) {
    var found = [];
    var lo = Math.round(centre - reach), hi = Math.round(centre + reach);
    for (var key = lo; key <= hi; key++) {
      var list = map.get(key);
      if (list) found = found.concat(list);
    }
    found.sort(function (a, b) { return a.index - b.index; });
    return found.map(function (record) { return record.entry; });
  };
  var featureId = part.featureId || "feature:part:" + part.id;
  var used = new Set(), entries = [];
  features.circles.forEach(function (circle, index) {
    var descriptor = {
      curve: "circle", origin: circle.origin, axis: circle.axis, radius: circle.radius,
      measure: Number(circle.measure) || (2 * Math.PI * circle.radius),
    };
    if (!circle.closed && circle.points && circle.points.length >= 2) {
      descriptor.endpoints = [circle.points[0], circle.points[circle.points.length - 1]];
    }
    var radius = Number(descriptor.radius) || 0;
    var kernelHit = bucketCandidates(kernelCircleBuckets, radius, Math.max(0.25, radius * 0.05) + 1).find(function (entry) {
      return entry.descriptor && circleDescriptorsMatch(descriptor, entry.descriptor) && !used.has(entry.persistentId);
    });
    if (kernelHit) used.add(kernelHit.persistentId);
    entries.push({
      ownerFeatureId: kernelHit ? kernelHit.ownerFeatureId : featureId,
      kind: "edge",
      persistentId: kernelHit ? kernelHit.persistentId : featureId + ":edge:mesh-circle:" + index,
      semantic: kernelHit ? kernelHit.semantic : "mesh-circle:" + index,
      descriptor: descriptor,
      memberPersistentIds: kernelHit && kernelHit.memberPersistentIds,
    });
  });
  features.polylines.forEach(function (line, index) {
    var points = line.points || [];
    if (points.length < 2) return;
    var a = points[0], b = points[points.length - 1], measure = 0;
    for (var i = 1; i < points.length; i++) measure += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
    var descriptor = {
      curve: points.length === 2 ? "line" : "polyline",
      origin: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
      endpoints: points,
      measure: measure,
    };
    var lineTol = Math.max(0.45, measure * 0.04);
    var kernelHit = bucketCandidates(kernelLineBuckets, midpointKey(a, b), 3 * lineTol + 1).find(function (entry) {
      if (used.has(entry.persistentId) || !entry.descriptor || entry.descriptor.curve === "circle") return false;
      var ends = edgePoints(entry.descriptor);
      if (ends.length < 2) return false;
      var ea = ends[0], eb = ends[ends.length - 1], tol = Math.max(0.45, measure * 0.04);
      return (Math.hypot(a.x - ea.x, a.y - ea.y, a.z - ea.z) < tol && Math.hypot(b.x - eb.x, b.y - eb.y, b.z - eb.z) < tol)
        || (Math.hypot(a.x - eb.x, a.y - eb.y, a.z - eb.z) < tol && Math.hypot(b.x - ea.x, b.y - ea.y, b.z - ea.z) < tol);
    });
    if (kernelHit) used.add(kernelHit.persistentId);
    entries.push({
      ownerFeatureId: kernelHit ? kernelHit.ownerFeatureId : featureId,
      kind: "edge",
      persistentId: kernelHit ? kernelHit.persistentId : featureId + ":edge:mesh-line:" + index,
      semantic: kernelHit ? kernelHit.semantic : "mesh-line:" + index,
      descriptor: descriptor,
      memberPersistentIds: kernelHit && kernelHit.memberPersistentIds,
    });
  });
  if (cacheKey) overlayEntryCache.set(cacheKey, entries);
  return entries;
}

function addTopologyPickEdges(parent, part, explicitMesh) {
  if (!part || (E.docType !== "part" && E.docType !== "assembly")) return;
  var mesh = explicitMesh || null;
  if (!mesh) {
    parent.traverse(function (object) {
      if (!mesh && object.isMesh && object.userData && object.userData.cadPart === part.id) mesh = object;
    });
  }
  var bounds = partBounds(part);
  var span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0, 1);
  var show = E.showModelEdges !== false;
  var finish = finishCommandActive();
  overlayEntriesForPart(part, mesh).forEach(function (entry) {
    var points = entry.displayPoints || edgePoints(entry.descriptor);
    if (points.length < 2) return;
    var selected = topologySelected(entry.persistentId, entry), hovered = topologyHovered(entry.persistentId, entry);
    var visible = show || finish || selected || hovered;
    var geometry = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x, p.y, p.z); }));
    var material = new THREE.LineBasicMaterial({
      color: selected ? hexNum(E.selectedEdgeColor) : hovered ? hexNum(E.hoverColor) : finish ? 0xf2d27a : hexNum(E.edgeColor),
      transparent: true,
      opacity: selected || hovered ? .98 : finish ? .9 : .95,
      depthTest: true,
      depthWrite: false,
    });
    var line = new THREE.Line(geometry, material);
    line.visible = visible;
    line.renderOrder = selected || hovered ? 22 : 20;
    line.userData.cadPart = part.id;
    line.userData.cadFeatureId = entry.ownerFeatureId;
    line.userData.cadTopology = entry;
    line.userData.cadPickVisible = visible;
    parent.add(line);

    if (selected || hovered || finish) {
      var vectors = points.map(function (point) { return new THREE.Vector3(point.x, point.y, point.z); });
      var closed = !!(entry.descriptor && entry.descriptor.curve === "circle" && !entry.descriptor.endpoints);
      if (closed && vectors.length > 2 && vectors[0].distanceToSquared(vectors[vectors.length - 1]) < 1e-8) vectors = vectors.slice(0, -1);
      var path = vectors.length === 2 ? new THREE.LineCurve3(vectors[0], vectors[1]) : new THREE.CatmullRomCurve3(vectors, closed, "centripetal");
      /* Screen-space, like the pick band it is supposed to advertise. Sizing
         the highlight off the MODEL span made it a constant in world units:
         zoomed in it drew a pipe over the edge, zoomed out it thinned to
         nothing while still being pickable at 5-8 px. Falls back to the old
         span-relative numbers when the view cannot say what a pixel is
         worth — a decoration built before the first render. */
      var perPixel = decorationWorldPerPixel();
      /* Stamped HERE, where the width is actually baked into geometry, rather
         than in refreshDecorations(): decorations are also built by the
         preview rebuild, and recording the scale only on one of those paths
         left the stamp at zero, which read as "nothing to compare" and meant
         the re-bake below never fired at all. */
      if (perPixel > 0) decoratedWorldPerPixel = perPixel;
      var radius = perPixel > 0
        ? perPixel * (selected ? 2.2 : hovered ? 1.7 : 1.1)
        : selected ? Math.max(.38, span * .0055) : hovered ? Math.max(.26, span * .004) : Math.max(.14, span * .0024);
      var glow = new THREE.Mesh(
        new THREE.TubeGeometry(path, Math.max(8, vectors.length * 2), radius, 6, closed),
        new THREE.MeshBasicMaterial({
          color: selected ? hexNum(E.selectedEdgeColor) : hovered ? hexNum(E.hoverColor) : 0xe7c56a,
          transparent: true,
          opacity: selected ? .95 : hovered ? .8 : .45,
          depthTest: true,
          depthWrite: false,
        })
      );
      glow.renderOrder = selected || hovered ? 24 : 19;
      glow.raycast = function () {};
      parent.add(glow);
    }
  });
}





function addTemporaryAxes(parent,part) {
  if(!E.showTemporaryAxes)return;
  temporaryAxes(part.meshData?.topology || topologyEntriesForPart(part)).forEach(function(axis){
    var from=new THREE.Vector3(axis.from.x,axis.from.y,axis.from.z),to=new THREE.Vector3(axis.to.x,axis.to.y,axis.to.z);
    var perPixel=decorationWorldPerPixel();if(perPixel>0)decoratedWorldPerPixel=perPixel;
    var span=from.distanceTo(to),radius=Math.max(span*.0015,perPixel*.8);
    for(var i=0;i<24;i++){
      var start=from.clone().lerp(to,i/24),end=from.clone().lerp(to,(i+.65)/24);
      var dash=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,start.distanceTo(end),6),new THREE.MeshBasicMaterial({color:0x63d8ff,transparent:true,depthTest:false,depthWrite:false}));
      dash.position.copy(start).add(end).multiplyScalar(.5);dash.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
      dash.renderOrder=30;dash.raycast=function(){};parent.add(dash);
    }
  });
}

function addFaceHighlights(parent, part, mesh) {
  if (!part || !mesh || (E.docType !== "part" && E.docType !== "assembly")) return;
  var entries = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var drawn = new Set();
  var featureId = part.featureId || "feature:part:" + part.id;
  var paint = function (reference, color, opacity) {
    if (!reference || drawn.has(reference.persistentId)) return;
    var entry = entries.find(function (candidate) { return candidate.persistentId === reference.persistentId; });
    /* Only the body that owns the face lights up. One cut runs through several
       bodies, and matching a cylinder by axis and radius alone lit the same
       bore in every one of them. */
    if (!entry && reference.ownerFeatureId && reference.ownerFeatureId !== featureId) return;
    var descriptor = (entry && entry.descriptor) || reference.descriptor;
    var highlight = faceHighlightMesh(mesh, descriptor, color, opacity, entry || reference, parent);
    if (!highlight) return;
    drawn.add(reference.persistentId);
    parent.add(highlight);
  };
  /* Same instance only. Two components off one library model share every
     persistent id, so without this filter selecting a face on one of them lit
     the matching face on all of them — the edge overlays already guard this
     way through topologySelected/topologyHovered. */
  (E.topologySelection || []).forEach(function (reference) {
    if (reference.kind !== "face" || !topologyRefInBuiltComponent(reference)) return;
    paint(reference, hexNum(E.selectedFaceColor), .62);
  });
  if (E.hoverTopology && E.hoverTopology.kind === "face" && topologyRefInBuiltComponent(E.hoverTopology)) {
    paint(E.hoverTopology, hexNum(E.hoverColor), .38);
  }
  addVertexHighlights(parent);
}

/* A picked corner has to be visible, and a corner is a point — there is no
   overlay geometry it can borrow the way a face borrows its surface. Drawn as
   a small screen-sized marker so it stays findable at any zoom, for the same
   reason the edge tubes are sized in pixels. */
function addVertexHighlights(parent) {
  var marks = (E.topologySelection || []).filter(function (reference) { return reference.kind === "vertex"; })
    .map(function (reference) { return { reference: reference, color: hexNum(E.selectedEdgeColor), opacity: .98 }; });
  if (E.hoverTopology && E.hoverTopology.kind === "vertex"
    && !marks.some(function (mark) { return mark.reference.persistentId === E.hoverTopology.persistentId; })) {
    marks.push({ reference: E.hoverTopology, color: hexNum(E.hoverColor), opacity: .85 });
  }
  if (!marks.length) return;
  var perPixel = decorationWorldPerPixel();
  var radius = perPixel > 0 ? perPixel * 4 : 0.35;
  marks.forEach(function (mark) {
    var point = mark.reference.descriptor && (mark.reference.descriptor.point || mark.reference.descriptor.origin);
    if (!point) return;
    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ color: mark.color, transparent: true, opacity: mark.opacity, depthTest: false, depthWrite: false })
    );
    dot.position.set(point.x, point.y, point.z);
    dot.renderOrder = 26;
    dot.raycast = function () {};
    parent.add(dot);
  });
}

function addFaceAppearances(parent, part, mesh) {
  if (!part || !mesh || E.docType !== "part") return;
  var saved = E.def && E.def.appearances || [];
  var ranges = part.meshData && part.meshData.faceRanges;
  if (ranges && ranges.length) {
    var count = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute("position").count) / 3;
    var assignments = appearanceGroups(ranges, count, saved);

    if (!assignments.materials.length) return;
    var base = mesh.material;
    mesh.material = [base].concat(assignments.materials.map(function (appearance) {
      var material = base.clone();
      if (appearance.kind !== "feature") {
        material.color.set(appearance.color);
        material.metalness = appearance.metal;
        material.roughness = appearance.rough;
      }
      var opacity = Number.isFinite(appearance.opacity) ? appearance.opacity : 1;
      material.opacity = E.displayStyle === "transparent" ? Math.min(.3, opacity) : opacity;
      material.transparent = material.opacity < 1;
      material.depthWrite = !material.transparent;
      return material;
    }));
    // Separate draws also let transparent faces sort independently from the
    // opaque body. Keep the original tessellation for stable face picking.
    var paintedMaterials = mesh.material;
    var indicesByMaterial = paintedMaterials.map(function () { return []; });
    var originalIndex = mesh.geometry.index;
    assignments.groups.forEach(function (group) {
      var indices = indicesByMaterial[group.materialIndex];
      for (var index = group.start; index < group.start + group.count; index++) indices.push(originalIndex ? originalIndex.getX(index) : index);
    });
    mesh.material = base.clone();
    mesh.material.visible = false;
    indicesByMaterial.forEach(function (indices, index) {
      if (!indices.length) { paintedMaterials[index].dispose(); return; }
      var geometry = mesh.geometry.clone();
      geometry.clearGroups(); geometry.setIndex(indices);
      var surface = new THREE.Mesh(geometry, paintedMaterials[index]);
      viewportPartByMesh.set(surface, { part: part, component: E.buildComponent || null, appearanceSurface: true, preserveAppearanceOpacity: index > 0 });
      surface.raycast = function () {};
      surface.castShadow = !paintedMaterials[index].transparent;
      surface.receiveShadow = true;
      mesh.add(surface);
    });
    return;
  }
  var overlays = faceAppearanceOverrides(saved);
  if (!overlays.length) return;
  var entries = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var featureId = part.featureId || "feature:part:" + part.id;
  overlays.forEach(function (appearance) {
    var entry = entries.find(function (candidate) { return candidate.persistentId === appearance.persistentId; });
    if (!entry) return;
    if (entry.ownerFeatureId && entry.ownerFeatureId !== featureId) return;
    var highlight = faceHighlightMesh(mesh, entry.descriptor, hexNum(appearance.color), 0.88, entry, parent);
    if (!highlight) return;
    var painted = highlight.material;
    highlight.material = new THREE.MeshStandardMaterial({
      color: hexNum(appearance.color),
      metalness: Number.isFinite(Number(appearance.metal)) ? appearance.metal : 0.2,
      roughness: Number.isFinite(Number(appearance.rough)) ? appearance.rough : 0.5,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    if (painted && painted.dispose) painted.dispose();
    highlight.raycast = function () {};
    highlight.userData.cadAppearance = appearance.id;
    parent.add(highlight);
  });
}

function buildExt(parent, p, opt) {
  if (p.meshData && !p.exactPending) return buildExactMesh(parent, p);
  var g = extrusionGeometry(p, smoothTessellationNormals);
  if (!g) return null;
  var m = new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
  var me = new THREE.Mesh(g, m);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function applyViewportDisplayStyle(mesh, style, previewOnly) {
  if (!mesh || !mesh.material || previewOnly || !style) return;
  var materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(function (material) {
    if (!material) return;
    var opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
    material.opacity = style === "transparent" ? Math.min(0.3, opacity) : opacity;
    material.transparent = material.opacity < 1;
    material.depthWrite = !material.transparent;
    material.needsUpdate = true;
  });
  mesh.castShadow = style !== "transparent";
  mesh.receiveShadow = style !== "transparent";
}

var decoGroups = [];
var viewportPartByMesh = new WeakMap();
/* Test seams. buildPart is called through its LOCAL binding everywhere, so a
   spy installed on a window handle can never observe it — the perf suite tried
   that and its counter silently read zero while hover rebuilt the whole scene.
   A counter incremented inside the function is the only honest signal, and the
   hover setter lets a test drive the one piece of state (E.hoverTopology) that
   decides whether decoration is per-component isolated. */
var buildPartCount = 0;
var rebuildDocCount = 0;
var mateSolveCount = 0;
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
/* What one pixel was worth when the decorations were last built. Highlight
   tubes are real geometry, so a screen-space width has to be re-baked when the
   zoom moves enough to notice — but only then: rebuilding on every frame of an
   orbit is exactly the churn the decoration cache exists to avoid. */
var decoratedWorldPerPixel = 0;

function decorationWorldPerPixel() {
  var view = E.pv;
  return view && typeof view.worldPerPixel === "function" ? Number(view.worldPerPixel()) || 0 : 0;
}

/* A third either way. Small enough that a highlight never visibly drifts from
   its intended width, coarse enough that a continuous zoom rebuilds a handful
   of times rather than once per frame. */
function decorationScaleStale() {
  var now = decorationWorldPerPixel();
  if (!(now > 0) || !(decoratedWorldPerPixel > 0)) return false;
  var ratio = now / decoratedWorldPerPixel;
  return ratio > 1.34 || ratio < 0.75;
}
function isEntryAffectedByHover(entry, hoverRef) {
  if (!hoverRef) return false;
  if (entry.component) {
    return hoverRef.componentId === entry.component.id;
  }
  if (hoverRef.ownerFeatureId && entry.part && entry.part.featureId) {
    return hoverRef.ownerFeatureId === entry.part.featureId;
  }
  return !!(entry.part && hoverRef.partId && hoverRef.partId === entry.part.id);
}

function syncViewportMeshSelection(mesh, component) {
  if (!mesh || !mesh.isMesh) return;
  var entry = viewportPartByMesh.get(mesh), part = entry && entry.part;
  if (!component) component = entry && entry.component;
  if (!component && E.docType === "assembly") {
    var parent = mesh.parent;
    while (parent) {
      if (parent.userData && parent.userData.cadComponent != null) {
        component = (E.assembly && E.assembly.components || []).find(function (item) { return item.id === parent.userData.cadComponent; });
        break;
      }
      parent = parent.parent;
    }
  }
  syncViewportSelectionMaterial(mesh, {
    partSelected: !!part && part === E.sel,
    componentSelected: !!component && E.componentSel.some(function (item) { return item.id === component.id; }),
    dependency: part ? dependencyRole(part.derivedFeatureId || part.featureId) : "",
    dependencyHighlight: !!part && !!E.dependencyHighlight,
    materialOwned: !!entry,
    preserveAppearanceOpacity: !!(entry && entry.preserveAppearanceOpacity),
  });
  if (entry && entry.appearanceSurface) mesh.castShadow = !mesh.material.transparent;
}

function refreshViewportSelection() {
  if (!E.pv) return;
  refreshDecorations(false);
  [E.pv.grp, E.pv.roomGrp].forEach(function (group) {
    if (group) group.traverse(function (object) { syncViewportMeshSelection(object); });
  });
  var live = E.pv.liveGrp;
  if (live) {
    live.children.slice().forEach(function (child) {
      if (!child.userData || !child.userData.instant3d) return;
      live.remove(child);
      clearGroup(child);
    });
    addInstant3dHandles(live);
    applySectionClipping(live);
  }
  E.pv.render();
}

function refreshDecorations(render = true) {
  if (retainExactPreview()) return;
  if (!E.pv) return;
  var currentHover = E.hoverTopology;
  decoGroups.forEach(function (entry) {
    var selectionStamp = JSON.stringify((E.topologySelection || []).filter(function (ref) { return isEntryAffectedByHover(entry, ref); }));
    var needsRebuild = entry.group.children.length === 0
      || entry.dirty
      || entry.selectionStamp !== selectionStamp
      || entry.hadHighlight
      || isEntryAffectedByHover(entry, currentHover)
      || isEntryAffectedByHover(entry, lastDecoratedHover);
    if (!needsRebuild) return;
    clearGroup(entry.group);
    E.buildComponent = entry.component || null;
    try {
      addTopologyPickEdges(entry.group, entry.part, entry.mesh);
      addFaceHighlights(entry.group, entry.part, entry.mesh);
      addTemporaryAxes(entry.group,entry.part);
    } finally {
      E.buildComponent = null;
    }
    entry.dirty = false;
    entry.selectionStamp = selectionStamp;
    entry.hadHighlight = isEntryAffectedByHover(entry, currentHover);
  });
  lastDecoratedHover = currentHover;
  if (render) E.pv.render();
}

/* Called after each frame: re-bakes highlight widths once a zoom has carried
   them far enough from the size they were built at. Nothing is highlighted
   most of the time, and then this costs one comparison. */
function refreshDecorationScale() {
  if (!E.pv) return;
  if (!(E.topologySelection || []).length && !E.hoverTopology && !finishCommandActive() && !E.showTemporaryAxes) return;
  if (!decorationScaleStale()) return;
  decoGroups.forEach(function (entry) { entry.dirty = true; });
  refreshDecorations();
}


function buildPart(g, p, displayStyle, presentationOnly = false) {
  buildPartCount++;
  /* One THREE child per body so a live parameter drag can dispose this part
     without tearing down every other GPU mesh in the viewport. */
  var partRoot = new THREE.Group();
  partRoot.userData.cadPartRoot = p.id;
  partRoot.userData.cadFeatureId = p.featureId || "feature:part:" + p.id;
  if (p.derivedFeatureId) partRoot.userData.cadDerivedFeatureId = p.derivedFeatureId;
  if (p.toolboxFeatureId) partRoot.userData.cadToolboxFeatureId = p.toolboxFeatureId;
  g.add(partRoot);
  g = partRoot;
  var rotations=partPatternRotations(p);
  /* The newest transform is the outermost group: R(new) × R(previous) × body.
     This also makes a pattern of an existing pattern behave predictably. */
  for(var rotationIndex=rotations.length-1;rotationIndex>=0;rotationIndex--){
    var rotation=rotations[rotationIndex],transformGroup=new THREE.Group(),pivot=rotation.pivot || {x:0,y:0,z:0},bodyGroup=new THREE.Group();
    transformGroup.position.set(Number(pivot.x)||0,Number(pivot.y)||0,Number(pivot.z)||0);transformGroup.rotation[rotation.axis]=rotation.angle;
    bodyGroup.position.set(-(Number(pivot.x)||0),-(Number(pivot.y)||0),-(Number(pivot.z)||0));transformGroup.add(bodyGroup);g.add(transformGroup);g=bodyGroup;
  }
  var opt = {
    metal: fin(p.metal) ? p.metal : undefined,
    rough: fin(p.rough) ? p.rough : undefined,
    opacity: fin(p.opacity) ? p.opacity : undefined,
    trans: fin(p.opacity) && p.opacity < 1,
  };
  var col = hexNum(p.color), me = null, b;
  if (p.meshData && !p.exactPending) {
    me = buildExactMesh(g, p);
  } else if (p.kind === "box") {
    if (p.tex) opt.tex = p.tex; // box() handles texture mapping itself
    if (sheetSharpSolids) opt.sharp = true;   // see sheetSharpSolids
    me = box(g, p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, col, opt);
  } else if (p.kind === "cyl") {
    opt.r2 = p.r2 != null ? p.r2 : p.r;
    // The furniture default of 24 sides is fine across a room; under a modeller's
    // nose a 40 cm cylinder shows every one of them.
    opt.seg = curveSegments(Math.max(p.r, opt.r2), Math.PI * 2, 24, 96);
    var cylinderDirection = p.axis ? new THREE.Vector3(p.axis.x, p.axis.y, p.axis.z).normalize() : new THREE.Vector3(0, 1, 0);
    me = cyl(g, p.x + cylinderDirection.x * p.h / 2, p.y + cylinderDirection.y * p.h / 2, p.z + cylinderDirection.z * p.h / 2, p.r, p.h, col, opt);
    if (me && p.axis) me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cylinderDirection);
    if (p.tex) applyTexTo(me, p, Math.PI * 2 * p.r, p.h);
  } else if (p.kind === "sph") {
    me = sph(g, p.x, p.y, p.z, p.r, col, opt);
    if (p.tex) applyTexTo(me, p, 4 * p.r, 4 * p.r);
  } else if (p.kind === "ext") {
    me = buildExt(g, p, opt);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "rev") {
    me = buildRev(g, p);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "loft") {
    me = buildLoft(g, p); // no UVs on lofted geometry — color/material only
  }
  if (me) {
    /* Display style belongs to the editor viewport, not to the part material.
       Keeping it out of `p.opacity` means toggling X-ray inspection never
       dirties the document or leaks into placed instances of this model. */
    applyViewportDisplayStyle(me, displayStyle, p.previewOnly);
    me.userData.cadPart = p.id;
    me.userData.cadFeatureId = p.featureId || "feature:part:" + p.id;
    me.userData.cadFaceRanges = p.meshData && p.meshData.faceRanges || null;
    me.userData.cadSubshapeMap = p.meshData && p.meshData.subshapeMap || null;
    viewportPartByMesh.set(me, { part: p, component: E.buildComponent || null });
    addMeshSharpEdges(me);
    var deco = new THREE.Group();
    deco.userData.cadDeco = p.id;
    g.add(deco);
    if (!presentationOnly) {
      decoGroups.push({ part: p, mesh: me, group: deco, component: E.buildComponent || null });
      addTopologyPickEdges(deco, p, me);
    }
    addFaceAppearances(g, p, me);
    me.traverse(function (object) {
      if (viewportPartByMesh.has(object)) syncViewportMeshSelection(object);
    });
    if (!presentationOnly) {
      addFaceHighlights(deco, p, me);
      addTemporaryAxes(deco,p);
    }
    addPartFeatureOverlays(g, p);
  }
  return me;
}

function addOverlayPolyline(parent, points, color, renderOrder, userData, depthTest) {
  if (!points || points.length < 2) return;
  var geometry = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x, p.y, p.z); }));
  var material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthTest: depthTest !== false, depthWrite: false });
  var line = new THREE.Line(geometry, material);
  line.renderOrder = renderOrder || 24;
  line.userData.cadOverlay = true;
  if (userData) Object.assign(line.userData, userData);
  parent.add(line);
}

function addPartFeatureOverlays(parent, part) {
  var thread = part.cosmeticThread;
  if (thread && thread.overlay && thread.overlay.length > 1) addOverlayPolyline(parent, thread.overlay, 0x3d6ea8, 25);
  if (part.modeledThread && part.modeledThread.path) addOverlayPolyline(parent, part.modeledThread.path, 0x2f6b4f, 25);
  var knurl = part.knurl || (part.knurlMesh && part.knurlMesh.spec);
  if (knurl) {
    var meshData = part.knurlMesh && part.knurlMesh.positions ? part.knurlMesh : knurlBandMesh(knurl);
    if (meshData && meshData.positions && meshData.positions.length >= 9) {
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      if (meshData.indices) geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
      geometry.computeVertexNormals();
      var mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x6a737d, metalness: 0.45, roughness: 0.55, transparent: true, opacity: 0.88, side: THREE.DoubleSide,
      }));
      mesh.renderOrder = 18;
      mesh.userData.cadOverlay = true;
      parent.add(mesh);
    }
    knurlGroovePolylines(knurl).forEach(function (points) { addOverlayPolyline(parent, points, 0x1f2933, 26); });
  }
}

/* User reference planes (BatteryLoftPlane, ThreadPlane…) were resolved and
   listed in the tree but never drawn, so an offset plane was invisible in the
   model it was placed against. Each gets a translucent square sized to the
   model at its resolved origin/normal, brighter while selected. Not pickable:
   a sheet in front of the body must not swallow face picks — select a plane
   from the tree or the datum picker. */
function documentPlaneOverlays(def) {
  if (!def || E.docType !== "part" || E.mode !== "3d") return [];
  var planes = (def.references || []).filter(function (ref) {
    return ref && ref.type === "plane" && ref.origin && ref.normal && !/^plane:(top|front|right)$/.test(ref.id || "") && !ref.hidden;
  });
  if (!planes.length) return [];
  var span = 40;
  (def.parts || []).forEach(function (part) {
    try {
      var b = partBounds(part);
      [(b.x1 - b.x0), (b.y1 - b.y0), (b.z1 - b.z0)].forEach(function (extent) { if (fin(extent)) span = Math.max(span, extent * 1.2); });
    } catch (error) { /* unsized part */ }
  });
  var out = [], zAxis = new THREE.Vector3(0, 0, 1);
  planes.forEach(function (ref) {
    var normal = new THREE.Vector3(ref.normal.x, ref.normal.y, ref.normal.z);
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    var selected = ref.id === E.selectedReferenceId, color = selected ? 0xffb020 : 0x7f8ea3;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: selected ? 0.22 : 0.1, side: THREE.DoubleSide, depthWrite: false }));
    var edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: color }));
    [mesh, edge].forEach(function (object) {
      object.quaternion.setFromUnitVectors(zAxis, normal);
      object.position.set(ref.origin.x, ref.origin.y, ref.origin.z);
      object.userData.cadOverlay = true;
      object.userData.cadPlaneOverlay = ref.id;
      object.raycast = function () {};
      object.renderOrder = 17;
      out.push(object);
    });
  });
  return out;
}

/* Sketch ids a feature has already absorbed. SOLIDWORKS hides a sketch once a
   feature consumes it — it lives under that feature in the tree instead — and
   showing them all would bury the model in its own history. */
function consumedSketchIds(def) {
  var used = new Set();
  (def && def.features || []).forEach(function (feature) {
    if (!feature) return;
    var direct = feature.params && feature.params.sketchId;
    if (direct) used.add(direct);
    if (feature.params?.holeProfileSketchId) used.add(feature.params.holeProfileSketchId);
    if (feature.params?.profileSketchId) used.add(feature.params.profileSketchId);
    var refs = feature.references && feature.references.sketches;
    if (Array.isArray(refs)) refs.forEach(function (reference) {
      var id = typeof reference === "string" ? reference : reference && reference.id;
      if (id) used.add(id);
    });
  });
  return used;
}

/* Sketches drawn into the 3D scene, the way SOLIDWORKS shows an unconsumed one.
   The sketch canvas is a 2D overlay that CSS hides outside sketch mode
   (#modeler.md-is3d:not(.md-model-sketching) #mdCanvas { display:none }), so a
   finished-but-unused sketch simply vanished: the tree still listed it and the
   toolbar still offered Extrude, with nothing on screen to extrude. Drawing it
   as real scene geometry keeps it aligned through orbit for free and leaves
   picking alone, which an interactive canvas over the viewport would not. */
function documentSketchOverlays(def) {
  if (!def || E.docType !== "part" || E.mode !== "3d") return [];
  var editing = E.modelPlaneActive ? ensureSketch(def) : null;
  var consumed = consumedSketchIds(def);
  var out = [];
  ensureSketchDoc(def).forEach(function (sketch) {
    if(isHoleWizardSketch(sketch)){
      var shown=E._holeSketchPreview?.id===sketch.id?E._holeSketchPreview:sketch;
      var lines=holeWizardSketchPolylines(shown);
      if(shown.kind==='cylindrical-position-3d' && E._holeSketchEditId===sketch.id){
        var selected=E._holeSketchInspect || 'all',point=function(role){return shown.points.find(function(p){return p.role===role;});};
        if(selected==='P')lines=[[point('P')]];
        if(selected==='AB')lines=[[point('A'),point('B')]];
        if(selected==='BP')lines=[[point('B'),point('P')]];
      }
      if(sketch.show3d===true || E._holeSketchEditId===sketch.id)lines.forEach(function(line){
        if(line.length===1){var p=line[0],d=.035;out.push([{x:p.x-d,y:p.y,z:p.z},{x:p.x+d,y:p.y,z:p.z}],[{x:p.x,y:p.y-d,z:p.z},{x:p.x,y:p.y+d,z:p.z}]);}
        else out.push(line);
      });
      return;
    }
    if (!sketch || sketch === editing) return;   // the live one is on the canvas
    if (sketch.show3d === false) return;
    if (sketch.id && consumed.has(sketch.id) && sketch.show3d !== true) return;
    var frame = sketch.frameSpace === "local" && sketch.frame
      ? sketch.frame
      : standardPlaneFrame(sketch.plane, sketch.offset);
    if (!frame) return;
    function toWorld(q) { return framePoint(frame, q.u, q.v, 0); }
    try {
      analyzeSketchProfiles(sketch).profiles.forEach(function (profile) {
        var points = (profile.points || []).slice();
        if (points.length > 1) {
          points.push(points[0]);
          out.push(sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(sketch, points) : points.map(toWorld));
        }
      });
      analyzeSketchChains(sketch).chains.forEach(function (chain) {
        var pts = sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(sketch, chain.points || []) : (chain.points || []).map(toWorld);
        if (pts.length > 1) out.push(pts);
      });
    } catch (error) { /* a malformed sketch must not take the whole scene down */ }
  });
  return out;
}

function addDocumentOverlays(parent, def) {
  if (!def) return;
  if(E.docType==="part" && E.mode==="3d" && !(def.parts || []).length && !(ensureSketch(def).entities || []).length && E.authoring?.phase==="model") {
    ["top","front","right"].forEach(function(plane,index){
      var mesh=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:[0x438dd8,0x59a879,0xd6a34b][index],transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
      if(plane==="top")mesh.rotation.x=-Math.PI/2;
      if(plane==="right")mesh.rotation.y=Math.PI/2;
      mesh.userData.cadReferenceId="plane:"+plane;
      parent.add(mesh);
      var edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:[0x438dd8,0x59a879,0xd6a34b][index]}));
      edge.rotation.copy(mesh.rotation); edge.userData.cadReferenceId=mesh.userData.cadReferenceId; parent.add(edge);
    });
  }
  documentPlaneOverlays(def).forEach(function (overlay) { parent.add(overlay); });
  var repair=E.authoring && E.authoring.repairMarker;
  if(repair) {
    var radius=Math.max(1,decorationWorldPerPixel()*14), at=repair.origin;
    var marker=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({color:0xe8a23a,wireframe:true,depthTest:false,transparent:true,opacity:.9}));
    marker.position.set(at.x,at.y,at.z);marker.renderOrder=90;
    marker.userData.cadRepairReference=repair.reference;parent.add(marker);
  }
  documentSketchOverlays(def).forEach(function (points) {
    /* Sketches commonly lie exactly on a solid face. A depth-tested line then
       loses the z-buffer fight (or disappears behind the face altogether),
       defeating an explicit Show in 3D request. These are reference graphics,
       so draw them over the model like CAD sketch overlays. */
    addOverlayPolyline(parent, points, 0x8fa6c4, 22, null, false);
  });
  documentHelixOverlays(def).forEach(function (curve) {
    var selected = curve.id && curve.id === E.selectedReferenceId;
    addOverlayPolyline(parent, curve.points, selected ? 0xffd060 : 0xf0b429, selected ? 28 : 23, { cadReferenceId: curve.id });
  });
  documentThreadOverlays(def).forEach(function (curve) {
    if (def.parts && def.parts.some(function (part) { return part.id === curve.id && part.cosmeticThread && part.cosmeticThread.overlay; })) return;
    addOverlayPolyline(parent, curve.points, 0x3d6ea8, 25);
  });
}

export function registerCustomModel(def) {
  S.idc=nextDocumentNumericId(def,S.idc);
  // Sketch-only documents belong in the model library, but have no body to
  // place in a room. Clear a former solid's catalog entry if it was edited
  // down to sketches, while leaving its library record available to reopen.
  if (def && validCustomModelKey(def.key) && Array.isArray(def.parts) && !def.parts.length && hasSaveableModelContent(def)) {
    delete FURN[def.key];
    delete PRICE[def.key];
    return false;
  }
  if (
    !def ||
    !validCustomModelKey(def.key) ||
    !Array.isArray(def.parts) ||
    !def.parts.length ||
    def.parts.length > 500 ||
    // a model whose every step is suppressed or rolled back builds nothing,
    // and an empty catalogue entry is worse than a refused save
    !activeParts(def).length
  )
    return false;
  def.name = sanitizeDisplayName(def.name || def.key, 80) || def.key;
  def.parts.forEach(function (part) {
    if (part && typeof part === "object") {
      part.name = String(part.name || part.kind || "part").slice(0, 80);
      if (typeof part.color !== "string" || !/^#[0-9a-f]{6}$/i.test(part.color))
        part.color = "#999999";
    }
  });
  try {
    normalizeDef(def);
    /* Only project a feature tree for documents that do not own one.

       rebuildFeatureTreeFromDocument() regenerates `features` from the RENDER
       PARTS, so it can only ever describe steps that left geometry behind. A
       suppressed step, a step past the rollback bar, and the sketch->feature
       link of anything that built no body are all invisible to it. Running it
       over a canonical (parametric-v1) document therefore replaced an authored
       history with a flat one-feature-per-body projection — and because
       openModeler() loads FURN[key].custom, that projection is what came back
       every time a saved model was reopened. Three authored features, one body,
       reopen: one feature.

       saveModel() already guards this call for exactly this reason ("Canonical
       documents already own their feature history"); registering did not, so
       the save preserved design intent and the very next load destroyed it.
       Same predicate as saveModel(), expressed against the document rather
       than editor state, because registration happens with no editor open. */
    var canonicalDoc = def.metadata && def.metadata.authoringSystem === "parametric-v1";
    var cabinetDoc = def.metadata && def.metadata.adapter === "cabinet";
    var recognizedImport = def.metadata && def.metadata.import && def.metadata.import.recognition
      && def.metadata.import.recognition !== "none";
    /* "Canonical" is a claim about provenance, not a guarantee that a tree came
       with it — an import whose recognition failed can carry the flag and no
       features at all. Skipping the projection there protects nothing and hands
       the editor an empty FeatureManager, so the exemption only applies while
       there is an authored tree to lose. */
    var hasAuthoredTree = Array.isArray(def.features) && def.features.length > 0;
    if (!cabinetDoc && !recognizedImport && (!canonicalDoc || !hasAuthoredTree))
      rebuildFeatureTreeFromDocument(def);
  } catch (_) {
    return false;
  }
  // Canonical models keep their datum coordinates, but still need a measured
  // catalogue footprint before the planner can validate a placement.
  var catalogBounds=defBounds(def);
  def.w=catalogBounds.x1-catalogBounds.x0;
  def.d=catalogBounds.z1-catalogBounds.z0;
  def.h=catalogBounds.y1-catalogBounds.y0;
  FURN[def.key] = {
    label: def.name || def.key,
    w: def.w, d: def.d, h: def.h,
    col: def.col || "#c9bfae",
    custom: def,
    build: def.metadata && def.metadata.adapter === "cabinet"
      ? function (g, it) {
          /* Advanced cabinet parts remain grouped by their semantic motion
             unit, so the existing door/drawer opening slider still drives the
             authored geometry after a CAD edit. */
          var current = S.parametric && S.parametric.definitions[it.definitionId] || def;
          var cabinetDef = cabinetDefinitionFromItem(it, current);
          var L = layoutCab(it), groups = {}, yo = (it.cab && it.cab.elev) || 0;
          function groupFor(p) {
            var unitId = p.cabinetUnit;
            if (unitId == null || !L.units[unitId]) return { parent:g, off:null };
            if (!groups[unitId]) {
              var u = L.units[unitId], gr = new THREE.Group();
              gr.position.set((u.px || 0) + (u.tx || 0), yo + (u.py || 0) + (u.ty || 0), (u.pz || 0) + (u.tz || 0));
              if (u.rot) gr.rotation[u.rot] = u.ang || 0;
              g.add(gr); groups[unitId] = gr;
            }
            return { parent:groups[unitId], off:L.units[unitId] };
          }
          activeParts(cabinetDef).forEach(function (p) {
            var target = groupFor(p), q = cloneData(p);
            if (target.off) movePart(q, -(target.off.px || 0), -(target.off.py || 0), -(target.off.pz || 0));
            else if (yo) movePart(q, 0, yo, 0);
            buildPart(target.parent, q);
          });
        }
      : function (g, it) { activeParts(def).forEach(function (p) {
          var q=p;
          if (p.parametricEnvelope === "box" && it) q=Object.assign({},p,{x0:-it.w/2,x1:it.w/2,y0:0,y1:it.h,z0:-it.d/2,z1:it.d/2});
          else if (p.parametricEnvelope === "cylinder" && it) q=Object.assign({},p,{x:0,y:0,z:0,r:it.w/2,r2:it.w/2,h:it.h});
          buildPart(g, q);
        }); },
  };
  PRICE[def.key] = fin(def.price) ? def.price : 0;
  // re-registering replaces the builder, so any measured vertical span for the
  // old shape is now wrong (elevation views read it)
  clearVSpanCache();
  return true;
}

// Convert a built-in (procedural) furniture type into an editable part list by
// building its meshes once and reading them back. Unrotated cylinders/spheres
// keep their exact shape; everything else (incl. RoundedBox, whose .parameters
// report the pre-scale unit box) becomes its axis-aligned bounding box.
function defFromBuiltin(type, it) {
  var f = FURN[type];
  if (!f || !f.build) return null;
  var g = new THREE.Group();
  /* Decompose the piece AS IT IS ON SCREEN, not the catalogue default. Copying
     the whole item is what makes that true for every builder at once: variant
     picks the shape and finish, and `cab` carries a modular cabinet's entire
     spec — cherry-picking a field list here is how a cabinet you had just
     designed came back as the stock unit. The copy is deep so a builder that
     caches or normalizes its spec cannot write back into the placed item. */
  var item = JSON.parse(JSON.stringify(it || {}));
  item.type = type;
  item.w = (it && it.w) || f.w;
  item.d = (it && it.d) || f.d;
  item.h = (it && it.h) || f.h;
  try {
    buildItem(g, item);
  } catch (e) {
    return null;
  }
  g.updateMatrixWorld(true);
  var parts = [];
  g.traverse(function (o) {
    if (!o.isMesh || !o.geometry || !o.material) return;
    var mat = o.material;
    var common = {
      id: uid(),
      color: "#" + mat.color.getHexString(),
      metal: fin(mat.metalness) ? mat.metalness : 0.08,
      rough: fin(mat.roughness) ? mat.roughness : 0.8,
    };
    if (mat.transparent && fin(mat.opacity) && mat.opacity < 1) common.opacity = mat.opacity;
    var gt = o.geometry.type, pr = o.geometry.parameters || {};
    var unrotated = !o.rotation.x && !o.rotation.y && !o.rotation.z;
    if (gt === "CylinderGeometry" && unrotated) {
      var p = new THREE.Vector3();
      o.getWorldPosition(p);
      parts.push(Object.assign({
        kind: "cyl", name: "cylinder",
        x: p.x, z: p.z, y: p.y - pr.height / 2,
        r: pr.radiusBottom, r2: pr.radiusTop, h: pr.height,
      }, common));
    } else if (gt === "SphereGeometry") {
      var q = new THREE.Vector3();
      o.getWorldPosition(q);
      parts.push(Object.assign({ kind: "sph", name: "sphere", x: q.x, y: q.y, z: q.z, r: pr.radius }, common));
    } else {
      var bb = new THREE.Box3().setFromObject(o);
      if (!isFinite(bb.min.x) || bb.isEmpty()) return;
      parts.push(Object.assign({
        kind: "box", name: "box",
        x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y, z0: bb.min.z, z1: bb.max.z,
      }, common));
    }
    if (o.geometry.dispose) o.geometry.dispose();
    if (mat.dispose) mat.dispose();
  });
  if (!parts.length) return null;
  return {
    key: "cm_" + Date.now().toString(36),
    name: flabel(type) + (getLang() === "en" ? " (custom)" : " (מותאם)"),
    price: PRICE[type] || 0,
    col: f.col || "#c9bfae",
    parts: parts,
  };
}

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
function syncDensity() {
  if (!root) return;
  root.classList.toggle("md-density-expert",E.expertDensity);
  root.classList.toggle("md-workflow-hidden",!E.workflowVisible);
  var density=root.querySelector("#mdDensity");
  if(density)density.value=E.expertDensity?"expert":E.workflowVisible||E.coachEnabled?"guided":"standard";
  var welcome=root.querySelector("#mdPrefWelcome"), coach=root.querySelector("#mdPrefCoach");
  if(welcome)welcome.checked=E.welcomeOnOpen;
  if(coach)coach.checked=E.coachEnabled;
}
function loadModelerPrefs() {
  try {
    var stored = JSON.parse(localStorage.getItem(LS_MODELER_PREFS)) || {};
    E.commandShortcuts=validShortcutBindings(stored.commandShortcuts);
    MODELER_PREFS.forEach(function (key) { if (typeof stored[key] === "boolean") E[key] = stored[key]; });
    MODELER_VIEW_PREFS.forEach(function (key) {
      if (typeof stored[key] === typeof E[key]) E[key] = stored[key];
    });
    /* v1 defaulted Normal To off, so every existing store has false without
       the user having chosen it. Stamp v2 once so a later uncheck sticks. */
    var ver = Number(stored.prefsVersion) || 0;
    if (ver < 2) {
      E.sketchNormalTo = true;
      saveModelerPrefs();
    }
  } catch (e) {}
}
function saveModelerPrefs() {
  try {
    var out = { prefsVersion: MODELER_PREFS_VERSION,commandShortcuts:E.commandShortcuts || {} };
    MODELER_PREFS.forEach(function (key) { out[key] = !!E[key]; });
    MODELER_VIEW_PREFS.forEach(function (key) { out[key] = E[key]; });
    localStorage.setItem(LS_MODELER_PREFS, JSON.stringify(out));
  } catch (e) {}
}
loadModelerPrefs();

function newDef() {
  var def=ensureParametricDocument({
    key: "cm_" + Date.now().toString(36), name: t("newModel"), price: 500,
    col: "#c9bfae", parts: [], constraints: [], rollback: null,
    sketches: [], activeSketch: null, variables: [],
    features: [], history:[], referenceGeometry: [], metadata:{authoringSystem:"parametric-v1"},
    notes: [], markups: [], appearances: [],
  });
  def.notes = [];
  def.markups = [];
  def.metadata.authoringSystem="parametric-v1";
  return def;
}
// Drawing stays freehand.  Keep only a little numeric cleanup so repeated
// pointer updates do not accumulate floating-point noise; the visible grid is
// a reference, not a magnet.
function snapV(v) { return Math.round(v * 10) / 10; }

/* Sketch zoom, in screen px per cm. The old ceiling of 20 (1000%) left the
   book's R .1 in sketch fillet about 5 px across, so its endpoints always won
   the pick and the arc itself could not be selected for Mirror. CAD zoom is
   effectively unbounded; 2000 px/cm shows a 0.01 mm feature as 2 px.
   Fit uses the same range so small parts remain editable. */
var SKETCH_MIN_SCALE = 0.3, SKETCH_MAX_SCALE = 2000;

/* ---- object snapping: endpoints, midpoints, centres, origin, then H/V inference ---- */
function snapTargets(excludePart) {
  var ts = sketchSnapTargets(ensureSketch(E.def), { poly: E.poly, excludeEntity: excludePart });
  (E.def.parts || []).forEach(function (p) {
    if (p === excludePart) return;
    var f = partUV(p);
    if (f.type === "rect") {
      var u0 = Math.min(f.u0, f.u1), u1 = Math.max(f.u0, f.u1), v0 = Math.min(f.v0, f.v1), v1 = Math.max(f.v0, f.v1);
      ts.push({ u: u0, v: v0, k: "e" }, { u: u1, v: v0, k: "e" }, { u: u0, v: v1, k: "e" }, { u: u1, v: v1, k: "e" });
    } else if (f.type === "poly") {
      /* Only a poly footprint has loop points. A mesh-projected one (an import,
         a kernel body) answers with segments, and reading .pts off it used to
         throw inside every snap on the plan. */
      var loops = [f.pts || []].concat((p.holes || []).map(function (hl) { return holeLoop(hl); }).filter(function (lp) { return lp.length; }));
      loops.forEach(function (lp) {
        lp.forEach(function (q) { ts.push({ u: q.u, v: q.v, k: "e" }); });
      });
    }
  });
  return ts;
}
function snapPt(uv, excludePart, origin) {
  E._osnap = null;
  var raw = { u: snapV(uv.u), v: snapV(uv.v) };
  if (E.osnap) {
    // fixed spots plus the nearest point on each sketch circle under the pointer
    var picked = pickSnap(uv, snapTargets(excludePart).concat(onCurveTargets(uv, ensureSketch(E.def), origin, E.scl)), {
      scale: E.scl, cycleIndex: E.inferenceIndex, suppress: E._suppressInference,
    });
    E.inferenceCandidates = picked.candidates || [];
    if (picked.snap) {
      E._osnap = picked.snap;
      raw = { u: picked.snap.u, v: picked.snap.v, pointId: picked.snap.pointId || null };
    }
  }
  if (origin && !E._osnap && !E._suppressInference) {
    var ortho = inferOrthoSnap(raw, origin, E.scl, false);
    if (ortho.kind) {
      E._osnap = { u: ortho.point.u, v: ortho.point.v, k: ortho.kind };
      raw = { u: ortho.point.u, v: ortho.point.v };
    }
  }
  return raw;
}






var exactBuildTimers = new WeakMap();
var cancelledExactPreview = null;
function exactPreviewWasCancelled() {
  return cancelledExactPreview && cancelledExactPreview.document===E.def && cancelledExactPreview.node===currentHistoryNode();
}


async function exactDisplayBody(p, document = E.def, requestedHead = null, options = {}) {
  if (document.metadata?.authoringSystem!=="parametric-v1" || !(document.features || []).some(function(feature){return feature.id===p.featureId;})) {
    var legacy=await exactBrepForPart(p);
    return {brep:legacy,release:function(){disposeBrep(legacy);}};
  }
  var head=requestedHead || cutTargetFeatureId(p,document), compiled=compileKernelFeatureTree(document);
  var displayNode=currentHistoryNode(),displayEditRevision=E.massEditRevision;
  if(!compiled.ok)throw new Error(compiled.issues[0]?.message || "Invalid feature history");
  var run=await regenerateFeatures({...compiled.document,features:compiled.features},{requestedHead:head,massProperties:options.massProperties,signal:options.signal,scope:options.scope,restoreMode:options.restoreMode,coalesceKey:options.coalesceViewport?'viewport:'+head:undefined});
  // A document-wide publication can retire this body without changing history.
  // Gate shared diagnostics and topology with the caller's ownership check too;
  // stale results still follow the normal return/error and release contract.
  if(document===E.def && displayNode===currentHistoryNode() && displayEditRevision===E.massEditRevision && (!options.isCurrent || options.isCurrent())){
    if(run.ok!==false)document.exactTopologyCache=captureExactTopology(document,compiled.features,run);
    if(run.ok===false)E.exactDiagnosticRun=captureExactDiagnostics(document,displayNode,displayEditRevision,run);
    else if(E.exactDiagnosticRun?.kernelRun.issues.every(function(issue){return run.results.has(issue.feature);}))E.exactDiagnosticRun=null;
  }
  var brep=run.results.get(head);
  if(!brep?.shape && !(options.restoreMode==='mesh' && brep?.verifiedSerializedExact===true)){releaseRegeneration(run);throw new Error(run.issues.find(function(issue){return issue.code==='regeneration-failed';})?.message || "The displayed body could not be rebuilt");}
  return {brep:brep,release:function(){releaseRegeneration(run);}};
}

function queueExactMesh(p) {
  if(exactPreviewWasCancelled())return;
  if (!partSupportsExactMesh(p)) return;
  var buildingDocument=E.def;
  if (!(buildingDocument.parts || []).includes(p)) return;
  var scheduled = exactBuildTimers.get(p);
  if (scheduled) { clearTimeout(scheduled); exactBuildTimers.delete(p); }
  var token = (p.exactBuildToken || 0) + 1;
  p.exactBuildToken = token;
  var buildIsCurrent = function () {
    return E.def===buildingDocument && p.exactBuildToken===token && (buildingDocument.parts || []).includes(p);
  };
  p.exactPending = true;
  p.exactError = null;
  syncStatus();
  /* A kernel body has no analytic form to fall back to, so a stale mesh left up
     while the kernel works — or after it fails — would be a different shape
     from the answer. Drop it here, exactly as queueKernelBody does. */
  if (isKernelBody(p)) { delete p.meshData; delete p.bounds; clearTopologyCache(p); }
  refreshChangedPart(p);
  // The full browser kernel is intentionally lazy-loaded.  Keep the editor
  // interactive and replace an indefinite spinner with an actionable status
  // on devices where compiling the WASM module takes unusually long.  The
  // original build is not cancelled: a late result still replaces the
  // lightweight preview below.
  var slowTimer = typeof window !== "undefined" ? setTimeout(function () {
    if (!buildIsCurrent() || !p.exactPending) return;
    p.exactPending = true;
    p.exactError = "Exact geometry is still computing. You can continue editing or cancel the command.";
    refreshChangedPart(p);
  }, 15000) : null;
  exactDisplayBody(p,buildingDocument,null,{restoreMode:'mesh',coalesceViewport:true,isCurrent:buildIsCurrent}).then(async function (display) {
    var brep=display.brep;
    try {
      if (!buildIsCurrent()) return;
      var meshData = brep.verifiedSerializedExact===true ? cloneData(brep.workerMeshData) : await shapeToMeshData(brep, {deflection:0.28,angle:0.18});
      meshData.topology = cloneData(brep.topology || []);
      if (!buildIsCurrent()) return;
      if (isKernelBody(p)) {
        /* This mesh IS the body — it is saved with the document rather than
           rebuilt from analytic fields on load — so the Float32Array normals
           and colours go, because JSON.stringify turns them into {"0":…}.
           buildExactMesh() derives flat normals when they are absent. */
        delete meshData.normals; delete meshData.colors;
        meshData.bounds = meshDataBounds(meshData.positions);
        p.bounds = meshData.bounds;
        clearTopologyCache(p);
      }
      p.meshData = meshData;
      if (buildingDocument.metadata?.authoringSystem === "parametric-v1") p.bounds = meshDataBounds(meshData.positions);
      p.exactPending = false;
      p.exactError = null;
      syncStatus();
      refreshChangedPart(p);
      if (isKernelBody(p) && root) refreshParts();
      if (E.mode === "3d") renderPreview();
    } finally {
      if (slowTimer !== null) clearTimeout(slowTimer);
      display.release();
    }
  }).catch(function (error) {
    if (slowTimer !== null) clearTimeout(slowTimer);
    if (!buildIsCurrent()) return;
    p.exactPending = false;
    p.exactError = String(error && error.message || error);
    console.warn("Exact CAD mesh build failed:", error);
    syncStatus();
    refreshChangedPart(p);
    if (isKernelBody(p) && root) refreshParts();
  });
}

function scheduleExactMesh(p) {
  if (!partNeedsExactMesh(p)) return;
  var old = exactBuildTimers.get(p);
  if (old) clearTimeout(old);
  exactBuildTimers.set(p, setTimeout(function () {
    exactBuildTimers.delete(p);
    queueExactMesh(p);
  }, 140));
}

/* Live parameter drags used to call queueKernelBody on every frame, which
   blanks the mesh and starts OpenCascade before the previous run has
   finished. One delayed rebuild after the pointer settles is enough. */
function scheduleKernelBody(p) {
  if (!isKernelBody(p) || !p.kernel) return;
  var old = exactBuildTimers.get(p);
  if (old) clearTimeout(old);
  exactBuildTimers.set(p, setTimeout(function () {
    exactBuildTimers.delete(p);
    queueKernelBody(p);
  }, 140));
}

/* A committed cut — or a merge, which is the same event with the other sign —
   changes the source solid underneath any cached exact mesh.
   This matters most for Cut-after-Fillet: a same-axis cut can stay a cheap
   profile hole, but the fillet's old mesh would otherwise keep rendering and
   hide the new hole forever.  Drop the stale mesh immediately so the analytic
   fallback shows profile holes, then rebuild when this body still needs the
   exact kernel (cross-cuts, fillets, chamfers, or shells). */
function invalidatePartMeshAfterEdit(p, schedule=true) {
  if (!p) return;
  delete p.meshData;
  // no analytic fallback: stale bounds would keep snapping and framing the
  // shape the cut just removed
  if (isKernelBody(p)) delete p.bounds;
  p.exactPending = false;
  p.exactError = null;
  if (schedule && partNeedsExactMesh(p)) scheduleExactMesh(p);
}

/* ---- kernel bodies ------------------------------------------------------
   Sweep, loft and everything after them produce a solid only OpenCascade can
   compute. queueExactMesh above rebuilds a body from its own analytic fields;
   this rebuilds one from `p.kernel`, the recipe copied off the feature. Same
   token discipline, same status fields, so the inspector, the tree and the
   viewport need to learn nothing new — and an overtaken build cannot land on
   top of a newer one. */
function queueKernelBody(p) {
  if(exactPreviewWasCancelled())return;
  if (!isKernelBody(p) || !p.kernel) return;
  // Canonical Loft/Sweep bodies belong to the feature history. Building their
  // bare legacy recipe here repeats OpenCascade on the UI thread while the
  // complete history is already running in the worker.
  if(isCanonicalAuthoring() && (E.def.features || []).some(function(feature){return feature.id===p.featureId;})) { queueExactMesh(p); return; }
  /* Once cuts or finish operations sit on the body, the recipe alone is no
     longer its shape. exactBrepForPart() starts from the same recipe and then
     applies them, so there is one builder rather than two disagreeing answers. */
  if (partNeedsExactMesh(p)) { queueExactMesh(p); return; }
  var token = (p.exactBuildToken || 0) + 1;
  p.exactBuildToken = token;
  p.exactPending = true;
  p.exactError = null;
  /* No stand-in solid while the kernel works, and none left behind when it
     fails: a kernel body has no analytic form to fall back to, so drawing one
     would mean drawing a different shape from the answer. The step fails alone
     — nothing else in the document is touched — and leaves no ghost. */
  delete p.meshData;
  delete p.bounds;
  clearTopologyCache(p);
  refreshChangedPart(p);
  kernelBodyMeshData(p.kernel, {origin:p.origin, ownerFeatureId:p.featureId || "feature:part:" + p.id}).then(function (meshData) {
    if (p.exactBuildToken !== token) return;
    p.meshData = meshData;
    p.bounds = meshData.bounds;
    p.exactPending = false;
    p.exactError = null;
    clearTopologyCache(p);
    /* The same three surfaces queueExactMesh() refreshes, and for the same
       reason: refreshAll() would re-enter the parametric rebuild from inside an
       async callback the rebuild itself started. */
    refreshChangedPart(p);
    if (root) refreshParts();
    if (E.mode === "3d") renderPreview();
  }).catch(function (error) {
    if (p.exactBuildToken !== token) return;
    p.exactPending = false;
    p.exactError = String(error && error.message || error);
    console.warn("Kernel body build failed:", p.exactError);
    refreshChangedPart(p);
    if (root) refreshParts();
    flash(tf("kernelBodyFailed", {error:p.exactError}));
  });
}


/* One derived preview body for a feature the kernel owns. Canonical feature
   creation has already happened; this is the projection adapter, exactly as
   addPart() is for the analytic kinds. */
function addKernelBodyPart(feature, type, params, sketchSources) {
  var spec;
  try { spec = kernelBodySpec(type, params); }
  catch (error) { flash(String(error && error.message || error)); return null; }
  var part = addPart({
    id: uid(),
    featureId: feature && feature.id,
    kind: KERNEL_BODY_KIND,
    name: (feature && feature.name) || featureTypeLabel(type),
    kernel: spec,
    // The link back to the sketches, kept on the PART: kernelBodySpec drops
    // everything the kernel would not read, and this is not a kernel input.
    ...(sketchSources ? { sketchSources: cloneData(sketchSources) } : {}),
    origin: {x:0, y:0, z:0},
    color: "#b89a6e", metal: .08, rough: .7,
  });
  queueKernelBody(part);
  return part;
}

/* A kernel body loaded from a saved model already carries its last mesh, so it
   draws at once; one that lost it (an older save, a failed build, a cleared
   cache) rebuilds from the recipe instead of staying invisible forever. */
function restoreKernelBodies(def) {
  (def && def.parts || []).forEach(function (part) {
    if (isKernelBody(part) && part.kernel && !(part.meshData && (part.meshData.positions || []).length >= 9)) queueKernelBody(part);
  });
}



var pendingCutController=null;
async function applyCut(loop,featureId,hint,cutSpec){
  if(E.cutPending)return 0;
  const host=root,controller=new AbortController();pendingCutController=controller;E.cutPending=true;
  if(host)host.setAttribute("aria-busy","true");
  try{return await applyCutChecked(loop,featureId,hint,cutSpec,controller.signal);}
  finally{if(pendingCutController===controller)pendingCutController=null;E.cutPending=false;if(host)host.removeAttribute("aria-busy");}
}
async function applyCutChecked(loop, featureId, hint, cutSpec, signal) {
  if (!loop || loop.length < 3) return 0;
  // The cut belongs to whatever it overlaps, not to whatever happens to sit
  // under its average point: the centroid of a C-shaped or ring-shaped loop is
  // in the notch, and testing only that point silently cut nothing.
  /* Feature application happens after plane-edit mode may have closed.  The
     sketch still owns its plane, so never fall back to the camera/view here:
     doing so mirrored or displaced cuts authored on a selected face. */
  var sketch=ensureSketch(E.def),frame=sketch && sketch.frameSpace==="local" ? sketch.frame : null;
  var ax=frame ? "frame" : planeAxis(sketch && sketch.plane || E.view),changed=0;
  cutSpec=cutSpec || {};
  var bounded=(cutSpec.endCondition || "through-all") !== "through-all"
    && fin(cutSpec.from) && fin(cutSpec.to);
  var c = hint && fin(hint.u) && fin(hint.v) ? hint : loopInteriorPoint(loop);
  /* The cut's own draft. `draftBase` pins the neutral plane to where the loop
     was drawn, so a through-all cutter stretched across the body still tapers
     from the sketch plane rather than from wherever the stretch started. */
  var draftAngle=Number(cutSpec.draftAngle)||0;
  var draftRecord=draftAngle?{draftAngle:draftAngle,draftOutward:!!cutSpec.draftOutward,draftBase:fin(cutSpec.from)?cutSpec.from:0}:{};
  if(cutSpec.segments)draftRecord.segments=cloneData(cutSpec.segments);
  var skipped = [];
  var document=E.def,originalParts=E.def.parts,signature=JSON.stringify(originalParts),sketchSignature=JSON.stringify(sketch),updated=[];
  for(const original of originalParts)updated.push(await (async function (p) {
    var footprint=cutFootprint(p, frame, ax);
    // Draft may expand beyond the sketch boundary; let the exact stage decide.
    var inside=!!draftAngle || cutFootprintsMayOverlap(loop,footprint);
    /* A cut with a stated depth only reaches as far as it says. Recording it on
       a body outside that depth costs a kernel rebuild that subtracts nothing,
       and makes the history claim a cut that never happened. */
    if (inside && bounded) {
      var reach = bodyDepthRange(partBounds(p), frame, ax);
      var lo = Math.min(cutSpec.from, cutSpec.to), hi = Math.max(cutSpec.from, cutSpec.to);
      if (reach.to <= lo + 1e-6 || reach.from >= hi - 1e-6) inside = false;
    }
    /* A body the exact kernel cannot rebuild cannot be cut. It used to be
       skipped in silence, which reads as "the cut went through the box but not
       through the shape standing on it". Collect it and say so. */
    if (inside && !partSupportsExactMesh(p)) { skipped.push(p.name || p.kind || "body"); return p; }
    if(inside){
      var exactRange=bounded?{from:cutSpec.from,to:cutSpec.to}:frame?frameRangeForBounds(partBounds(p),frame):cutRangeForAxis(partBounds(p),ax);
      var cutDisplay;
      try{
        var pendingCut=(E.def.features || []).find(function(feature){return feature.id===featureId;});
        var cutHead=pendingCut?.inputs?.[0] || cutTargetFeatureId(p,E.def),exactCut={axis:frame?"frame":ax,...(frame?{frame:cloneData(frame)}:{}),...exactRange,loop:loop,...draftRecord};
        var check;
        if(cadWorkerAvailable() && isCanonicalAuthoring()){
          var cutCompiled=compileKernelFeatureTree(E.def);if(!cutCompiled.ok)throw new Error(cutCompiled.issues[0]?.message || 'Invalid feature history');
          check=await cutIntersectionInCadWorker({...cutCompiled.document,features:cutCompiled.features},cutHead,exactCut,{signal:signal});
        } else {
          cutDisplay=await exactDisplayBody(p,E.def,cutHead,{signal:signal,scope:'cut-preflight'});if(signal?.aborted)return p;
          check=await exactCutIntersection(p,exactCut,cutDisplay.brep);
        }
        if(!check.intersects)return p;
      }
      catch(error){skipped.push((p.name||p.kind||"body")+": "+String(error.message||error));return p;}
      finally{if(cutDisplay)cutDisplay.release();}
    }
    if (frame && inside && partSupportsExactMesh(p)) {
      var range=bounded ? {from:cutSpec.from,to:cutSpec.to} : frameRangeForBounds(partBounds(p),frame);
      p.cuts3d=p.cuts3d || [];
      p.cuts3d.push({axis:"frame",frame:cloneData(frame),from:range.from,to:range.to,loop:loop.map(function(q){return {u:q.u,v:q.v};}),featureId:featureId || undefined,...draftRecord});
      changed++;
      invalidatePartMeshAfterEdit(p);
      return p;
    }
    if (p.kind === "box") {
      if (inside) p = boxToExt(p, ax);
    }
    if (inside) {
      var copy = loop.map(function (q) { return { u:q.u, v:q.v }; });
      var containedProfileHole = p.kind === "ext" && p.axis === ax && !bounded
        && !cutSpec.segments
        && !draftAngle   // a drafted cut is a taper; a profile hole is a prism
        && !(p.cuts3d && p.cuts3d.length)
        && profileLoopIsSeparateHole(copy, p.pts || [], (p.holes || []).map(function (hole) { return holeLoop(hole); }));
      if (containedProfileHole) {
        p.holes = p.holes || [];
        p.holes.push(featureId ? { points: copy, featureId: featureId } : copy);
      } else {
        p.cuts3d = p.cuts3d || [];
        var cutRange=bounded ? {from:cutSpec.from,to:cutSpec.to} : cutRangeForAxis(partBounds(p),ax);
        p.cuts3d.push({axis:ax,from:cutRange.from,to:cutRange.to,loop:copy,featureId:featureId || undefined,...draftRecord});
      }
      changed++;
      invalidatePartMeshAfterEdit(p);
    }
    return p;
  })(cloneData(original)));
  if(signal?.aborted || E.def!==document||E.def.parts!==originalParts||JSON.stringify(originalParts)!==signature||JSON.stringify(sketch)!==sketchSignature){E.lastCutSkipped=[signal?.aborted?'Exact CAD computation cancelled':t("cutChangedRetry")];return 0;}
  if(changed)E.def.parts=updated;
  E.lastCutSkipped = skipped;
  return changed;
}

/* What to add to the "cut applied" message when some body under the loop could
   not take it. Empty when every body was cut. */
function cutSkipNote() {
  var skipped = E.lastCutSkipped || [];
  if (!skipped.length) return "";
  return " · " + t("cutSkipped") + ": " + skipped.join(", ");
}



/* The curve a curve pattern runs along is authored as a sketch and stored as
   the world polyline every consumer reads — the same trade sweep makes, and
   the reason pattern_geometry.js never has to know what a sketch is. Only an
   Pattern command being AUTHORED may reach for the selection: a document being
   rebuilt already carries its own path, and an edit of an existing pattern must
   not be re-aimed at whatever sketch happens to be active. */
function resolvePatternCurvePath(params) {
  if(!params || params.mode!=="curve" || curvePatternPath(params).length>=2)return params;
  if(!E.authoring || E.authoring.featureType!=="pattern" || E.authoring.featureEdit)return params;
  var sketch=patternCurveSketch();
  if(!sketch)return params;
  var points=(sketch.points || []).map(function(point){return sketchWorldPoint(sketch,point.x,point.y);});
  return points.length>=2 ? {...params,path:points} : params;
}

function patternCurveSketch() {
  var ids=selectedSketchIds();
  for(var index=0;index<ids.length;index++){
    var sketch=(E.def.sketches || []).find(function(item){return item.id===ids[index];});
    if(sketch && (sketch.points || []).length>=2)return sketch;
  }
  return null;
}

function patternPlacements(params) {
  var count=Math.max(2,Math.min(100,Math.round(Number(params && params.count)||2)));
  // The curve layout carries its own count and its own turn per copy.
  if(params && params.mode==="curve")return curvePatternPlacements(resolvePatternCurvePath(params));
  if(params && params.mode==="circular"){
    var skipped=parseSkippedPatternInstances(params.skipInstances);
    return Array.from({length:count-1},function(_,index){return {circularIndex:index+1,instance:index+1};}).filter(function(placement){return !skipped.has(placement.instance);});
  }
  return linearPatternOffsets(params || {},count);
}
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
function snapDoc() {
  // Component authoring has an isolated working definition. Its unchanged
  // parent assembly is not part of these local sketch edits: serializing it
  // into sixty Undo entries duplicated every other native body many times.
  if (E.contextEdit) return historySnapshots.stringify({d:E.def,contextComponentId:E.contextEdit.componentId,contextComponentPath:E.contextEdit.path});
  return historySnapshots.stringify({ d: E.def, a: E.assembly });
}
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
function assemblySaveSession(assembly) {
  if (!assembly) return null;
  if (!assemblySaveSessions.has(assembly)) assemblySaveSessions.set(assembly,{savedEdit:0});
  return assemblySaveSessions.get(assembly);
}
function activeHistoryMarker() {
  return E.docType === "assembly" && E.assembly ? assemblySaveSession(E.assembly) : partHistoryMarker;
}

// The history tree is shared, but editing one resident does not dirty the other.
// Component-local history belongs to the working copy until Finish edits the parent.
function residentDirtyState() {
  return {
    part: !!E.def && H.editRevision("part") !== partHistoryMarker.savedEdit,
    assembly: !!E.assembly && H.editRevision("assembly") !== assemblySaveSession(E.assembly).savedEdit,
  };
}

function hasResidentEdits() {
  const dirty = residentDirtyState();
  return dirty.part || dirty.assembly || !!E.contextEdit;
}

/* ---- what is inside a document ------------------------------------------
   Read off a snapshot, so the history tree can say which step touched which
   part — and, scoped to one of them, show only its own thread. The nesting is
   the one the editor already works in: a sketch owns its entities and the
   constraints over them, a sketch-driven solid hangs off the sketch that
   drives it, a boolean hangs off its first input, and a mate hangs off the
   component it moves.

   Point coordinates fold into the entity that uses them (as wall corners fold
   into the wall, in the plan): dragging a line is an edit of the line, not of
   two anonymous points. */
function scanDoc(str) {
  var o;
  try {
    o = JSON.parse(str);
  } catch (err) {
    return [];
  }
  var def = (o && o.d) || {},
    asm = (o && o.a) || null,
    out = [];
  (def.sketches || []).forEach(function (s) {
    var pt = {};
    (s.points || []).forEach(function (p) { pt[p.id] = p.x + "," + p.y; });
    out.push({ id: "sketch:" + s.id, kind: "sketch", label: s.name || t("sketch"), sig: s.name + "|" + s.plane + "|" + s.offset });
    (s.entities || []).forEach(function (e) {
      var geo = [e.a, e.b, e.c, e.center, e.p, e.h1, e.h2].concat(e.pts || []).map(function (k) { return pt[k] || ""; }).join(";");
      out.push({
        id: "ent:" + e.id, parent: "sketch:" + s.id, kind: "entity",
        label: (e.name || e.type || "line"), sig: JSON.stringify(e) + "|" + geo,
      });
    });
    (s.constraints || []).forEach(function (c) {
      out.push({
        id: "con:" + c.id, parent: c.entity != null ? "ent:" + c.entity : "sketch:" + s.id,
        kind: c.value != null ? "dim" : "entity",
        label: conLabel(c), sig: JSON.stringify(c),
      });
    });
  });
  (def.parts || []).forEach(function (p, i) {
    out.push({
      id: "part:" + (p.id != null ? p.id : "i" + i),
      parent: p.sketchDriven && p.sketchId ? "sketch:" + p.sketchId : null,
      kind: "part", label: (p.name || p.kind) + " " + (i + 1), sig: JSON.stringify(p),
    });
  });
  (def.features || []).forEach(function (f) {
    out.push({
      id: "feat:" + f.id, parent: f.inputs && f.inputs.length ? "feat:" + f.inputs[0] : null,
      kind: "feature", label: f.name || f.type, sig: JSON.stringify(f),
    });
  });
  (def.variables || []).forEach(function (v) {
    out.push({ id: "var:" + v.id, kind: "dim", label: v.name, sig: JSON.stringify(v) });
  });
  if (asm) {
    (asm.components || []).forEach(function (c) {
      out.push({ id: "comp:" + c.id, kind: "component", label: c.name || c.modelKey || c.assemblyKey || t("component"), sig: JSON.stringify(c) });
    });
    (asm.mates || []).forEach(function (m) {
      out.push({ id: "mate:" + m.id, parent: m.a != null ? "comp:" + m.a : null, kind: "mate", label: m.type, sig: JSON.stringify(m) });
    });
    /* Topology mates are mates too. Scanning only the older list left every
       SmartMate and every face mate out of History — undo moved them, but the
       panel could neither show them nor scope an edit to the component they
       hold. */
    (asm.topologyMates || []).forEach(function (m) {
      var owner = m.a && m.a.componentId;
      out.push({
        id: "tmate:" + m.id, parent: owner != null ? "comp:" + owner : null,
        kind: "mate", label: m.type, sig: JSON.stringify(m),
      });
    });
  }
  return out;
}
function conLabel(c) {
  var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === c.type; })[0];
  return (d ? t(d.label) : c.type) + (c.value != null ? " " + Math.round(c.value * 10) / 10 : "");
}
/* Children the ids alone do not spell out: which solids a sketch drives, and
   which mates move a component. Everything else is already a parent link. */
function docSubtree(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1), out = [];
  if (kind === "sketch") {
    (E.def.parts || []).forEach(function (p) {
      if (p.sketchDriven && String(p.sketchId) === key) out.push("part:" + p.id);
    });
  } else if (kind === "comp" && E.assembly) {
    (E.assembly.mates || []).forEach(function (m) {
      if (String(m.a) === key || String(m.b) === key) out.push("mate:" + m.id);
    });
    (E.assembly.topologyMates || []).forEach(function (m) {
      var a = m.a && m.a.componentId, b = m.b && m.b.componentId;
      if (String(a) === key || String(b) === key) out.push("tmate:" + m.id);
    });
  } else if (kind === "part") {
    // a solid the sketch drives is where its profile edits show up
    var part = (E.def.parts || []).filter(function (p) { return String(p.id) === key; })[0];
    if (part && part.sketchDriven && part.profileEntityIds) {
      part.profileEntityIds.forEach(function (e) { out.push("ent:" + e); });
      (part.holeProfileEntityIds || []).forEach(function (loop) { loop.forEach(function (e) { out.push("ent:" + e); }); });
    }
  }
  return out;
}
/* Whatever the editor currently has picked, named the way the scan names it —
   and the way back, so a chip in the panel selects the object it names. */
function docScope() {
  if (E.docType === "assembly") {
    var c = E.componentSel && E.componentSel.length ? E.componentSel[E.componentSel.length - 1] : null;
    return c ? "comp:" + c.id : null;
  }
  var s = E.sel;
  if (!s) return null;
  if (s.kind) return "part:" + s.id;              // a solid
  if (s.type) return "ent:" + s.id;               // a sketch line / circle / arc
  return null;                                     // a bare sketch point
}
function docPick(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1);
  if (kind === "part") {
    var p = (E.def.parts || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!p) return;
    E.sel = p;
    E.topologySelection = [];
    E.ssel = [];
  } else if (kind === "ent" || kind === "con") {
    // Select the constraint's referenced entities in its owning sketch.
    var sk = null, picked = [];
    (E.def.sketches || []).some(function (s) {
      var constraint = kind === "con" && (s.constraints || []).find(function (c) { return String(c.id) === key; });
      var refs = kind === "con" ? (constraint ? [constraint.entity, constraint.a, constraint.b] : []) : [key];
      picked = Array.from(new Set(refs.filter(function (ref) { return ref != null; }).map(String)))
        .map(function (ref) { return (s.entities || []).find(function (e) { return String(e.id) === ref; }); }).filter(Boolean);
      if (!picked.length) return false;
      sk = s;
      return true;
    });
    if (!sk) return;
    E.def.activeSketch = sk.id;
    E.ssel = picked;
    E.sel = picked[0];
  } else if (kind === "sketch") {
    if (!(E.def.sketches || []).some(function (s) { return String(s.id) === key; })) return;
    E.def.activeSketch = key;
    E.sel = null;
    E.ssel = [];
  } else if (kind === "comp" && E.assembly) {
    var c = (E.assembly.components || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!c) return;
    E.componentSel = [c];
    E.sel = c;
    E.ssel = [];
    E.topologySelection = [];
  } else if (kind === "feat") {
    var feature = (E.def.features || []).find(function (f) { return String(f.id) === key; });
    if (!feature) return;
    E.authoring = E.authoring || {};
    E.authoring.featureSelection = [feature.id];
    E.authoring.sketchSelection = [];
    E.ssel = [];
    E.topologySelection = [];
    E.sel = partsForFeature(feature.id)[0] || null;
  } else return;
  refreshAll();
  if (histPanel) histPanel.refreshNow();
}
function pushUndo(label, tag, scope) { H.push(label, tag, scope); E.massEditRevision=(E.massEditRevision || 0)+1; scheduleModelerDraft(); }
function doUndo() { H.undo(); scheduleModelerDraft(); }
function doRedo() { H.redo(); scheduleModelerDraft(); }
var histPanel = null;
var draftSaveTimer = 0;
var draftRevision = 0;

function modelerSessionStorage() {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; }
  catch (error) { return null; }
}

function modelerDraftStorage() {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch (error) { return null; }
}

function scheduleModelerDraft() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(flushModelerDraft, 1500);
  syncDraftStatus("draftPending");
}

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

function discardModelerDraft() {
  ++draftRevision;
  if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = 0; }
  modelerDraftCache = null;
  clearModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  return clearModelerDraftRecord(modelerDraftOwnerId).catch(function () {});
}

// Save and single-document replacement share a recovery slot with the other
// resident document. Refresh its contents and baselines before leaving it.
function reconcileModelerDraft() {
  if (!E.open) return;
  if (!hasResidentEdits()) return discardModelerDraft();
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  flushModelerDraft();
}

function tryRestoreModelerDraft() {
  var draft = modelerDraftCache && (modelerDraftCache.def || modelerDraftCache.assembly) ? modelerDraftCache : readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  if (!draft) return false;
  var documentAtRequest = E.def;
  askModelerDecision(root, {
    title:t("recoverDraftTitle"),
    message:t("unsavedDraft") + "\n" + ((draft.docType === "assembly" ? draft.assembly : draft.def).name || t("title")) + "\n" + new Date(draft.at).toLocaleString(),
    accept:t("restoreDraftAction"), cancel:t("startWithoutDraft"), dismiss:t("recoverLater"), focusAccept:true,
    alternate:t("startFreshKeepDraft"),
  }).then(function (accepted) {
    if (!E.open || E.def !== documentAtRequest) return;
    if (accepted === 'alternate') {
      ++draftRevision;
      if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = 0; }
      modelerDraftOwnerId = freshModelerDraftOwner(modelerSessionStorage());
      modelerDraftCache = null;
      syncDraftStatus("draftPending");
    }
    else if (accepted) restoreModelerDraft(draft);
    else if (accepted === false) discardModelerDraft();
    else closeModeler();
  });
  return true;
}

function restoreModelerDraft(draft) {
  closeEvalCard();
  S.idc=nextDocumentNumericId(draft,S.idc);
  const context = draft.docType === "part" && draft.def?.metadata?.contextEditor;
  let restoredContext = null;
  if (context) {
    try { restoredContext = restoreNestedComponentEdit(draft.assembly,context); }
    catch (error) { flash('Component draft could not reopen: '+error.message); return false; }
  }
  // A recovered edit still belongs to the saved library revision it started
  // from. Older single-slot drafts have no baseline; leave it unknown so the
  // save conflict path can ask before replacing a same-key saved record.
  try { libraryOpenBaseline=draft.libraryBaselineJson ? JSON.parse(draft.libraryBaselineJson) : null; }
  catch (error) { libraryOpenBaseline=null; }
  try { assemblyOpenBaseline=draft.assemblyBaselineJson ? JSON.parse(draft.assemblyBaselineJson) : null; }
  catch (error) { assemblyOpenBaseline=null; }
  E.contextEdit=null;
  partHistoryMarker={savedEdit:0};
  E.assembly=draft.assembly || null;
  if (draft.docType === "assembly" && draft.assembly) {
    if (draft.def) E.def = ensureParametricDocument(draft.def);
    setDocumentType("assembly");
    /* setDocumentType is intentionally a no-op when the requested type is
       already active. A restored draft still replaces the whole assembly, so
       an interference result from the previous document cannot survive it. */
    invalidateInterference();
  } else if (draft.def) {
    E.def = ensureParametricDocument(draft.def);
    if (restoredContext) {
      E.contextEdit = restoredContext;
      delete restoredContext.working;
      restoredContext.isNew = !!context.isNew;
      restoredContext.previousDef = draft.previousDef || newDef();
    }
    E.docType = "part";
    if (root) root.classList.remove("md-assembly");
  } else return false;
  ensureSketchDoc(E.def);
  (E.def.parts || []).forEach(function (part) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
  });
  migrateDefinitionProfileCuts(E.def, true);
  restoreKernelBodies(E.def);
  var restoredSketch = ensureSketch(E.def), restoredHistory = E.def.history || [];
  E.solveInfo = solveSketch(restoredSketch);
  E._solveSketchId = restoredSketch.id;
  E.authoring = {
    phase:"model", referenceId:restoredSketch.referenceId || null, sketchId:restoredSketch.id,
    featureType:null, sketchSelection:[restoredSketch.id], featureSelection:[],
    workflowFocus:restoredHistory.some(function (entry) { return entry.kind === "feature"; }) ? "history"
      : restoredHistory.some(function (entry) { return entry.kind === "sketch"; }) ? "feature" : "context",
  };
  H.clear().seed();
  // Older drafts predate per-document dirty flags. Protect both residents
  // until saved when there is no evidence that one of them was clean.
  for (const [type,marker] of [["part",partHistoryMarker],["assembly",assemblySaveSession(E.assembly)]]) {
    if (!marker) continue;
    const clean=draft.dirty?.[type] === false;
    marker.savedEdit=clean ? H.editRevision(type) : null;
  }
  syncDirty();
  syncDraftStatus("draftSaved");
  syncHead();
  E.exactRestoring = isCanonicalAuthoring() && activeParts(E.def).length && !(E.def && E.def.exactTopologyCache);
  refreshAll();
  fitPreview();
  scheduleExactRestore();
  return true;
}
function syncUndoButtons() {
  if (!root) return;
  var u = root.querySelector("#mdUndo"), r = root.querySelector("#mdRedo");
  if (u) {
    u.disabled = !H.canUndo();
    u.title = "Ctrl+Z" + (H.undoLabel() ? " · " + H.undoLabel() : "");
  }
  if (r) {
    r.disabled = !H.canRedo();
    r.title = "Ctrl+Y · Shift+Z" + (H.redoLabel() ? " · " + H.redoLabel() : "");
  }
  syncDirty();
  if (histPanel) histPanel.refresh();
}

/* The editor's revision number. Every edit that can change geometry goes
   through pushUndo(), so the id of the current history node is what "the
   document as it stands now" means here — for the dirty flag, and for deciding
   whether a cached kernel solve still describes this document. */
function currentHistoryNode() {
  var tree = H.tree(), i;
  for (i = 0; i < tree.length; i++) if (tree[i].current) return tree[i].i;
  return null;
}

function documentDirty() {
  return !!E.contextEdit || residentDirtyState()[E.docType];
}

function syncDraftStatus(key) {
  if (!root) return;
  var status = root.querySelector("#mdDraftStatus");
  if (!status) {
    status = el("small", "md-draft-status"); status.id = "mdDraftStatus";
    status.setAttribute("role", "status");
    root.querySelector("#mdName").parentElement.appendChild(status);
  }
  status.textContent = t(key);
  status.classList.toggle("is-error", key === "draftSaveFailed");
  var save = root.querySelector("#mdSave");
  if (save) save.setAttribute("aria-describedby", status.id);
}

function markDocumentClean() {
  var marker = activeHistoryMarker();
  marker.savedEdit = H.editRevision(E.docType);
  syncDirty();
  syncDraftStatus("documentSaved");
  if (E.docType === "assembly") syncAssemblyWorkflow();
}

function syncDirty() {
  if (!root) return;
  var save = root.querySelector("#mdSave");
  if (!save) return;
  var dirty = documentDirty();
  save.classList.toggle("is-dirty", dirty);
  syncSaveButtonAccessibility(save,{
    label:t(E.docType === "assembly" ? "saveAssembly" : "save"),
    dirty:dirty,dirtyText:t("dirtySave")
  });
  syncStatus();
}

/* The one place that asks before unsaved work is thrown away. Every path that
   replaces or abandons the open document goes through here — New, Close, and
   both panes of the library. The library cards used to replace the document
   with no question at all, so a click on a card was an unrecoverable way to
   lose an unsaved model. */
async function confirmDiscardDocument(promptKey) {
  var form = E.quickFormInstance, type = E.docType;
  var documentAtRequest = E.def, assemblyAtRequest = E.assembly;
  if (form?.applying) {
    await form.applying;
    if (!E.open || E.docType !== type || E.def !== documentAtRequest || E.assembly !== assemblyAtRequest ||
        (E.quickFormInstance && E.quickFormInstance !== form)) return false;
    form = E.quickFormInstance;
  }
  if (!form?.hasPendingEdits() && !hasResidentEdits()) return true;
  var generation=H.generation, history=currentHistoryNode(), edit=H.editRevision(E.contextEdit ? "component" : type), formEdits=form?.editSnapshot();
  var accepted = await askModelerDecision(root, { title:t("unsavedChangesTitle"), message:t(promptKey || "unsavedClose"), accept:t("discardChangesAction"), cancel:t("keepEditingAction") });
  return accepted && E.open && E.docType === type && E.quickFormInstance === form && E.def === documentAtRequest && E.assembly === assemblyAtRequest &&
    H.generation === generation && currentHistoryNode() === history && H.editRevision(E.contextEdit ? "component" : type) === edit && form?.editSnapshot() === formEdits && !form?.applying;
}

async function requestCloseModeler() {
  if (!await confirmDiscardDocument("unsavedClose")) return false;
  discardModelerDraft();
  closeModeler();
  E.contextEdit=null;
  E.assembly=null;
  assemblyOpenBaseline=null;
  return true;
}

/* ---- view plane mapping: (u,v) sketch coords <-> model (x,y,z) ---- */
// top:   u=x, v=z, normal axis y (v axis points +z = down on canvas)
// front: u=x, v=y, normal axis z (v up on canvas)
// side:  u=z, v=y, normal axis x
function axisOfView() { return planeAxis(E.view); }
// The extrude direction a sketch plane implies. Read from the sketch's own
// plane, never from the current view — that is what made the same profile
// extrude differently depending on where the camera happened to be.
function planeAxis(plane) { return plane === "top" ? "y" : plane === "front" ? "z" : "x"; }
function activeSketchFrame() {
  if (!E.def) return null;
  var sketch=ensureSketch(E.def);
  return sketch && sketch.frameSpace==="local" && (E.modelPlaneActive || E.mode==="2d") ? sketch.frame : null;
}
function sameFrameOrientation(a,b) {
  if (!a || !b || !a.normal || !b.normal || !a.xAxis || !b.xAxis) return false;
  var nd=a.normal.x*b.normal.x+a.normal.y*b.normal.y+a.normal.z*b.normal.z;
  var xd=a.xAxis.x*b.xAxis.x+a.xAxis.y*b.xAxis.y+a.xAxis.z*b.xAxis.z;
  return nd>.99999 && xd>.99999;
}
function partEditableInSketch(part) {
  var frame=activeSketchFrame();
  return !!part && part.kind==="ext" && (frame ? part.axis==="frame" && sameFrameOrientation(part.frame,frame) : part.axis===axisOfView());
}
function frameRangeForBounds(bounds,frame) {
  var values=[];
  [bounds.x0,bounds.x1].forEach(function(x){[bounds.y0,bounds.y1].forEach(function(y){[bounds.z0,bounds.z1].forEach(function(z){values.push(frameProjectPoint(frame,{x:x,y:y,z:z}).w);});});});
  var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values),pad=Math.max(2,(hi-lo)*.08);
  return {from:lo-pad,to:hi+pad};
}
function sameSketchContext(a,b) {
  if (!a || !b) return false;
  if (a.frameSpace==="local" || b.frameSpace==="local") return a.frameSpace==="local" && b.frameSpace==="local" && a.support && b.support && a.support.persistentId===b.support.persistentId;
  return a.plane===b.plane;
}
function partUV(p) {
  // returns projected 2D footprint for the current view: {type:'rect',u0,u1,v0,v1} | {type:'circle',u,v,r} | {type:'poly',pts}
  var b = partBounds(p);
  function rect(u0, u1, v0, v1) { return { type: "rect", u0: u0, u1: u1, v0: v0, v1: v1 }; }
  var frame=activeSketchFrame();
  if (frame) {
    if (p.kind==="ext" && p.frame && sameFrameOrientation(p.frame,frame)) {
      var projectLoop=function(loop){return (loop || []).map(function(q){var world=framePoint(p.frame,q.u,q.v,p.from);var local=frameProjectPoint(frame,world);return {u:local.u,v:local.v};});};
      return {type:"poly",pts:projectLoop(p.pts),holes:(p.holes || []).map(function (hl) { return projectLoop(holeLoop(hl)); }).filter(function (loop) { return loop.length; })};
    }
    var projected=[];
    [b.x0,b.x1].forEach(function(x){[b.y0,b.y1].forEach(function(y){[b.z0,b.z1].forEach(function(z){projected.push(frameProjectPoint(frame,{x:x,y:y,z:z}));});});});
    return rect(Math.min.apply(null,projected.map(function(q){return q.u;})),Math.max.apply(null,projected.map(function(q){return q.u;})),Math.min.apply(null,projected.map(function(q){return q.v;})),Math.max.apply(null,projected.map(function(q){return q.v;})));
  }
  if ((isKernelBody(p) || p.kind === "direct" || p.kind === "mesh" || p.axisBasis) && p.meshData) {
    var meshProjection=projectMeshEdges(p.meshData,E.view);
    if(meshProjection.segments.length)return meshProjection;
  }
  if (p.kind === "ext" && p.axis === axisOfView()) return { type: "poly", pts: p.pts };
  if (p.kind === "loft" && p.axis === axisOfView()) return { type: "poly", pts: p.pts0 };
  if (p.kind === "rev" && !p.axisBasis && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: revMaxR(p) };
  if (p.kind === "cyl" && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: Math.max(p.r, p.r2 != null ? p.r2 : p.r) };
  if (p.kind === "sph") {
    if (E.view === "top") return { type: "circle", u: p.x, v: p.z, r: p.r };
    if (E.view === "front") return { type: "circle", u: p.x, v: p.y, r: p.r };
    return { type: "circle", u: p.z, v: p.y, r: p.r };
  }
  if (E.view === "top") return rect(b.x0, b.x1, b.z0, b.z1);
  if (E.view === "front") return rect(b.x0, b.x1, b.y0, b.y1);
  return rect(b.z0, b.z1, b.y0, b.y1);
}
function moveInView(p, du, dv) {
  if (p && p.type === "line") {
    var sketch = ensureSketch(E.def), pts = sketchLinePoints(p);
    if (pts.a) { pts.a.x += du; pts.a.y += dv; }
    if (pts.b && pts.b !== pts.a) { pts.b.x += du; pts.b.y += dv; }
    resolveSketch(false);
    return;
  }
  var frame=activeSketchFrame();
  if (frame) movePart(p,frame.xAxis.x*du+frame.yAxis.x*dv,frame.xAxis.y*du+frame.yAxis.y*dv,frame.xAxis.z*du+frame.yAxis.z*dv);
  else if (E.view === "top") movePart(p, du, 0, dv);
  else if (E.view === "front") movePart(p, du, dv, 0);
  else movePart(p, 0, dv, du);
}
/* ============ where the sketch sheet lives on screen ============
   Two mappings, one interface. In 2D (and in the read-only drawing) the sheet
   is a plain pan/zoom transform: E.ox/E.oy/E.scl. Over the model the sheet is
   the live camera's projection of the sketch plane (toPx/toUV), so orbiting
   mid-sketch does not slide the geometry off the face. Opening a sketch still
   looks square at the plane when Normal To is on — that is the SolidWorks
   default, and a screen square is then a plane square. Turn the toggle off
   (or orbit) and the same projection keeps drawing on the plane from any
   angle; the rubber-band is in UV so the preview is the shape that will land. */
function standardPlaneFrame(view, offset) {
  var w = fin(offset) ? offset : 0;
  if (view === "top") return {origin:{x:0,y:w,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1},normal:{x:0,y:1,z:0}};
  if (view === "front") return {origin:{x:0,y:0,z:w},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
  return {origin:{x:w,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:1,y:0,z:0}};
}
/* The plane the sketch canvas is currently drawing on, in world space. Null
   whenever the plain 2D transform is the right one. */
/* toPx runs hundreds of times per repaint, and the projection costs two layout
   reads and a matrix update. It cannot change within a single frame unless we
   change it ourselves, so it is computed once and dropped at the frame
   boundary; anything that moves the camera or the canvas drops it by hand. */
function invalidateSketchProjection() { E._proj = undefined; }
function sketchProjection() {
  if (E._proj !== undefined) return E._proj;
  E._proj = computeSketchProjection();
  requestAnimationFrame(invalidateSketchProjection);
  return E._proj;
}
function computeSketchProjection() {
  if (E.mode !== "3d" || !E.modelPlaneActive) return null;
  if (!E.pv || !E.pv.cam || !E.cv || !E.pv.rr || !E.pv.rr.domElement) return null;
  var sketch = ensureSketch(E.def);
  var frame = activeSketchFrame() || standardPlaneFrame(E.view, sketch && sketch.offset);
  var host = E.pv.rr.domElement.getBoundingClientRect(), self = E.cv.getBoundingClientRect();
  if (host.width < 4 || host.height < 4) return null;
  // The camera is only where `place()` puts it once it has been placed, and its
  // world matrix has to be current or every projection is a frame stale.
  if (E.pv.place) E.pv.place();
  E.pv.cam.updateMatrixWorld(true);
  var proj = {
    frame: frame, cam: E.pv.cam,
    w: host.width, h: host.height,
    dx: host.left - self.left, dy: host.top - self.top,
  };
  // Screen scale at the plane origin. Hit tolerances, glyph sizes and dimension
  // offsets are all quoted in E.scl, so it has to stay meaningful here.
  var a = projectSketchPoint(proj, 0, 0), b = projectSketchPoint(proj, 1, 0), c = projectSketchPoint(proj, 0, 1);
  var scale = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  if (fin(scale) && scale > 0.01) E.scl = scale;
  return proj;
}
var _scratchSketchNdc = null;
var _scratchSketchDir = null;
var _scratchSketchRayOrigin = null;
function getScratchSketchNdc() {
  if (!_scratchSketchNdc) _scratchSketchNdc = new THREE.Vector3();
  return _scratchSketchNdc;
}
function getScratchSketchDir() {
  if (!_scratchSketchDir) _scratchSketchDir = new THREE.Vector3();
  return _scratchSketchDir;
}

function getScratchSketchRayOrigin() {
  if (!_scratchSketchRayOrigin) _scratchSketchRayOrigin = new THREE.Vector3();
  return _scratchSketchRayOrigin;
}
function projectSketchPoint(proj, u, v) {
  var world = framePoint(proj.frame, u, v, 0);
  var ndc = getScratchSketchNdc().set(world.x, world.y, world.z).project(proj.cam);
  return { x: proj.dx + (ndc.x * .5 + .5) * proj.w, y: proj.dy + (-ndc.y * .5 + .5) * proj.h };
}
/* Where a world point lands on the sketch canvas, or null behind the camera. */
function worldToSketchPx(proj, world) {
  var ndc = getScratchSketchNdc().set(world.x, world.y, world.z).project(proj.cam);
  if (!(ndc.z > -1 && ndc.z < 1)) return null;
  return { x: proj.dx + (ndc.x * .5 + .5) * proj.w, y: proj.dy + (-ndc.y * .5 + .5) * proj.h };
}
function toPx(u, v) {
  var proj = sketchProjection();
  if (proj) return projectSketchPoint(proj, u, v);
  var vv = !activeSketchFrame() && E.view === "top" ? v : -v; // framed and elevation sketches use v-up
  return { x: E.ox + u * E.scl, y: E.oy + vv * E.scl };
}
function toUV(px, py) {
  var proj = sketchProjection();
  if (proj) {
    // Cast the pointer ray and land it on the sketch plane. Behind the camera,
    // or parallel to the plane, there is no answer — hold the last one rather
    // than throwing geometry to infinity.
    // Orthographic rays start at the pointer, perspective rays at the eye.
    var ray = pointerCameraRay(proj.cam, ((px - proj.dx) / proj.w) * 2 - 1,
      -(((py - proj.dy) / proj.h) * 2 - 1), getScratchSketchRayOrigin(), getScratchSketchDir());
    var eye = ray.origin, dir = ray.direction;
    var n = proj.frame.normal, o = proj.frame.origin;
    var denom = dir.x * n.x + dir.y * n.y + dir.z * n.z;
    if (Math.abs(denom) < 1e-6) return E._lastUV || { u: 0, v: 0 };
    var travel = ((o.x - eye.x) * n.x + (o.y - eye.y) * n.y + (o.z - eye.z) * n.z) / denom;
    if (travel <= 0) return E._lastUV || { u: 0, v: 0 };
    var hit = frameProjectPoint(proj.frame, { x: eye.x + dir.x * travel, y: eye.y + dir.y * travel, z: eye.z + dir.z * travel });
    E._lastUV = { u: hit.u, v: hit.v };
    return E._lastUV;
  }
  var u = (px - E.ox) / E.scl, v = (py - E.oy) / E.scl;
  if (activeSketchFrame() || E.view !== "top") v = -v;
  return { u: u, v: v };
}
/* Live sketch previews must be the UV shape that will be committed, projected
   through toPx — a screen-axis rectangle looks square in isometric and lands
   as a stretched plane rectangle. */
function strokeUvRect(c, u0, v0, u1, v1) {
  var p0 = toPx(u0, v0), p1 = toPx(u1, v0), p2 = toPx(u1, v1), p3 = toPx(u0, v1);
  c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.closePath();
}
function strokeUvCircle(c, u, v, r) {
  pathUvEllipse(c, { center:{ x:u, y:v }, rx:r, ry:r, rot:0 }, 0, Math.PI * 2, true);
}
/* Curves belong to the sketch plane, not the screen. Sampling their UV form
   before projection keeps circles, arcs and rotated ellipses faithful under an
   oblique/perspective camera and gives previews the exact path commit draws. */
function pathUvEllipse(c, o, start, sweep, closed) {
  if (!o || o.rx < 1e-4 || o.ry < 1e-4) return false;
  start = fin(start) ? start : 0;
  sweep = fin(sweep) ? sweep : Math.PI * 2;
  var steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * 64));
  var cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0);
  for (var i = 0; i <= steps; i++) {
    var angle = start + sweep * i / steps;
    var x = Math.cos(angle) * o.rx, y = Math.sin(angle) * o.ry;
    var p = toPx(o.center.x + x * cr - y * sr, o.center.y + x * sr + y * cr);
    if (!i) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
  }
  if (closed) c.closePath();
  return true;
}
function positiveArcSweep(start, end) {
  return ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}
function pathUvCircleArc(c, center, radius, start, sweep, closed) {
  return pathUvEllipse(c, { center:center, rx:Math.abs(radius), ry:Math.abs(radius), rot:0 }, start, sweep, closed);
}

/* ================= DOM ================= */
var root = null;
var modelerBackgroundState = [];
var modelerReturnFocus = null;

function setModelerBackgroundIsolation(on) {
  if (on) {
    if (modelerBackgroundState.length) return;
    /* Isolate only product-owned planner roots. A blanket walk over every
       <body> child also caught browser/assistive-tech integration nodes and
       could make the page's control surface disappear as the launch click
       finished. The main planner lives in #app; the remaining selectors are
       its body-level sheets and static overlays. Editor chrome deliberately
       stays outside this list. */
    document.querySelectorAll(
      "#app, #start-screen, #drawer-backdrop, #crosshair, #m-ctx, #m-sheet, #m-sheet-backdrop"
    ).forEach(function (node) {
      if (node === root) return;
      modelerBackgroundState.push({ node:node, inert:!!node.inert, ariaHidden:node.getAttribute("aria-hidden") });
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
    return;
  }
  modelerBackgroundState.forEach(function (state) {
    if (!state.node || !state.node.isConnected) return;
    state.node.inert = state.inert;
    if (state.ariaHidden == null) state.node.removeAttribute("aria-hidden");
    else state.node.setAttribute("aria-hidden", state.ariaHidden);
  });
  modelerBackgroundState = [];
}
var swapView = null;
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function btn(label, cb, cls) {
  var b = el("button", cls || "", label);
  if (cls === "md-quick-apply") {
    // Both the form button and the mobile confirmation corner use this
    // handler, even when the duplicate form actions are hidden.
    var pending = false;
    b.modelerApply = async function () {
      if (pending || b.disabled) return;
      pending = true;
      try { return await cb.apply(b, arguments); }
      finally { pending = false; }
    };
    b.addEventListener("click", b.modelerApply);
  } else b.addEventListener("click", cb);
  return b;
}

function bindDocumentTextField(selector, readValue, writeValue, undoLabel, commitOnInput) {
  var input=root.querySelector(selector);
  var gesture=0;
  function commit(){
    var next=input.value.trim();
    if(readValue()===next)return;
    pushUndo(undoLabel,commitOnInput ? selector+":"+gesture : undefined);writeValue(next);syncUndoButtons();
  }
  // Description must survive another Settings control refreshing the header
  // before blur. Consecutive input events still share a single undo step.
  if(commitOnInput)input.addEventListener("input",commit);
  input.addEventListener("change",commit);
  input.addEventListener("blur",function(){commit();gesture++;});
  input.addEventListener("keydown",function(event){
    if(event.key!=="Enter")return;
    event.preventDefault();event.stopPropagation();commit();gesture++;
  });
}
/* The one greyed affordance in the editor: `aria-disabled` plus `.unavailable`,
   never the `disabled` attribute. A disabled button suppresses its own tooltip,
   and the tooltip is the only place the *reason* a command cannot run is
   written — so the button stays enabled and its handler turns the click into
   that same explanation. */
function markUnavailable(button, why, label) {
  if (!button) return button;
  button.classList.toggle("unavailable", !!why);
  button.setAttribute("aria-disabled", why ? "true" : "false");
  button.title = why || label || "";
  return button;
}

function namedButton(button, label) {
  if (!button) return button;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

// tools carry their key in the caption so the shortcut is learnable in passing
function kt(label, key) { return label + " · " + key; }

/* Panel tabs are named, not guessed at. `ico("tab", …)` produced a 40px square
   whose only clue was a hover caption, so five of them read as five mystery
   buttons; a strip of labelled tabs is both smaller and self-explaining. */
function tab(id, icon, label, title, extra) {
  return '<button type="button" role="tab" aria-selected="false" data-tab="' + id + '" aria-label="' + (title || label) + '" title="' + (title || label) + '">' +
    cadIcon(icon || id) + '<span>' + label + "</span>" + (extra || "") + "</button>";
}
function tabstrip(side, tabs, extra) {
  var label = side === "L" ? "Model browser" : "Selection inspector";
  return '<div class="md-strip" data-strip="' + side + '" role="tablist" aria-label="' + label + '">' + tabs.join("") + (extra || "") + "</div>";
}

/* A labelled CommandManager button — the one place each command lives, so it
   is spelled out rather than left to a glyph.
   `full` is the unabbreviated name for the tooltip and for screen readers. The
   caption itself can be terse because the group heading right underneath
   already supplies the noun: "Rectangle" under "Sketch" says everything
   "Sketch rectangle" did, in half the ribbon.
   There is no icon argument: every command id is itself an icon key in
   modeler_icons.js, so the glyph follows from the command. */
function commandButton(id, label, key, cls, full) {
  var name = full || label;
  return (
    '<button type="button" class="md-command ' + (cls || "") + '" data-command="' + id +
    '" aria-label="' + name + '" title="' + name + (key ? " · " + key : "") + '">' +
    cadIcon(id) + '<span>' + label + "</span>" +
    (key ? '<kbd>' + key + "</kbd>" : "") + "</button>"
  );
}

/* The relations the ribbon promotes out of the inspector palette — the seven
   that carry most of a sketch. They are the same CONSTRAINT_DEFS entries the
   palette renders, gated by the same constraintFits and applied by the same
   applyConstraint; nothing about the palette changes. */
var RIBBON_RELATIONS = ["coincident", "horizontal", "vertical", "parallel", "perpendicular", "tangent", "equal"];

/* Glyph-only, deliberately. Seven labelled commands are four ribbon columns
   (~440px) and the Sketch pane has ~314px of slack at 1280px, so captions here
   would push the pane into a horizontal scroll. Relations are the one group in
   this editor with conventional glyphs everybody already reads, so the word
   lives in aria-label and the tooltip — and stays in the DOM, because the
   borrowed phone sheet shows it again (see .md-command-glyph in styles.css).
   `data-relation`, not `data-command`: these are not catalog commands, and
   syncCommandManager would keep clearing the greyed state they carry. */
function relationButton(id) {
  var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === id; })[0];
  if (!d) return "";
  var name = t(d.label);
  return (
    '<button type="button" class="md-command md-command-glyph" data-relation="' + id +
    '" aria-label="' + name + '" title="' + name + " — " + d.need + '">' +
    cadIcon(d.icon) + "<span>" + name + "</span></button>"
  );
}

/* Every letter key that picks a tool, straight out of the map the key handler
   reads, so the shortcut sheet cannot claim a binding the editor does not have.
   Each tool id names its own `tool_<id>` string. */
function toolKeyRows() {
  return Object.keys(KEY_TOOL).map(function (key) {
    return [t("tool_" + KEY_TOOL[key]), key.toUpperCase()];
  });
}

/* `rank` is "secondary" for the groups a phone collapses behind their heading.
   It is inert on the desktop ribbon, which lays every group out side by side —
   it only tells the borrowed-into-a-sheet stylesheet which headings are
   drawers, so 23 commands stop arriving as one endless column. */
/* A ribbon group, addressed by its own i18n KEY rather than by the words that
   key happens to produce.
 *
   The key is what is stable: it does not move when the wording is edited, it
   does not differ between English and Hebrew, and it is already unique. That
   makes `data-mdgroup` an identity a saved layout can still resolve after a
   release — which is what uikit needs to let a user rearrange this ribbon, and
   it is why the label is looked up here instead of at each of the fourteen
   call sites. */
function commandGroup(key, commands, rank) {
  return '<div class="md-command-group" data-mdgroup="' + key +
    '" data-cmdgroup="' + (rank || "primary") + '">' +
    '<div class="md-command-items">' + commands.join("") +
    '</div><span class="md-command-group-label">' + t(key) + "</span></div>";
}

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

function buildDOM() {
  E.lang = getLang();
  root = el("div", "", "");
  root.id = "modeler";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("title"));
  root.innerHTML =
    '<div class="md-head">' +
    '<div class="md-head-logo">' + cadIcon("mode3d") + ' <b>' + t("title") + "</b>" +
    '<span class="md-sub" id="mdSub"></span></div>' +
    projectChipHTML() +
    editorSwitchHTML("model", "md-editors") +
    '<div class="md-docmodes" id="mdDocModes">' +
    '<button data-doc="part" class="on">' + cadIcon("mode3d") + " " + t("docPart") + '</button>' +
    '<button data-doc="assembly">' + cadIcon("assembly") + " " + t("docAssembly") + '</button>' +
    '</div>' +
    '<div class="md-head-inputs">' +
    '<label class="md-field"><span>' + t("name") + '</span><input id="mdName" type="text" aria-label="' + t("name") + '" autocomplete="off"></label>' +
    '<label class="md-field"><span>' + t("description") + '</span><input id="mdDescription" type="text" aria-label="' + t("description") + '" autocomplete="off" title="' + t("descriptionHint") + '"></label>' +
    '<label class="md-field md-field-sm"><span>' + t("price") + '</span><input id="mdPrice" type="number" min="0"></label>' +
    "</div>" +
    /* Regenerate / STEP / drawing all have a labelled home in the Evaluate tab
       of the command manager. Repeating them here as unlabelled glyphs gave the
       same command two appearances and taught neither of them. */
    '<div class="md-head-actions">' +
    shellActionsHTML() +
    '<button id="mdUndo" data-tip="' + kt(t("undo"), "Ctrl+Z") + '"><i class="ph ph-arrow-u-up-left"></i></button>' +
    '<button id="mdRedo" data-tip="' + kt(t("redo"), "Ctrl+Y") + '"><i class="ph ph-arrow-u-up-right"></i></button>' +
    '<div class="md-separator"></div>' +
    '<button id="mdGuide" class="md-guide-launch" data-tip="' + t("guideTitle") + '"><i class="ph ph-graduation-cap"></i><span>' + t("guide") + '</span></button>' +
    '<button id="mdSave" class="btn-accent" data-tip="Ctrl+S"><i class="ph ph-floppy-disk"></i> ' + t("save") + "</button>" +
    '<button id="mdClose" data-tip="' + t("closeTip") + '"><i class="ph ph-x"></i> ' + t("close") + "</button>" +
    "</div>" +
    "</div>" +
    /* One line, not five cards. The five phases still read left to right and
       still carry their live readout, but as a breadcrumb they cost 26px
       instead of 60 and stop competing with the ribbon for attention. */
    '<nav class="md-workflow" id="mdWorkflow" aria-label="' + t("wfAria") + '">' +
      '<button type="button" data-workflow-step="context"><b>' + t("wfPart") + '</b><small id="mdWorkflowContext">cm · origin</small></button>' +
      '<button type="button" data-workflow-step="reference"><b>' + t("wfReference") + '</b><small id="mdWorkflowReference">' + t("wfNone") + '</small></button>' +
      '<button type="button" data-workflow-step="sketch"><b>' + t("wfSketch") + '</b><small id="mdWorkflowSketch">' + t("wfEmpty") + '</small></button>' +
      '<button type="button" data-workflow-step="feature"><b>' + t("wfFeature") + '</b><small id="mdWorkflowFeature">' + t("wfNone") + '</small></button>' +
      '<button type="button" data-workflow-step="history"><b>' + t("wfHistory") + '</b><small id="mdWorkflowHistory">0 ' + t("wfEditableSteps") + '</small></button>' +
    '</nav>' +
    /* The coach is the semi-guided layer: it reads the workflow state and
       names one concrete next action, with a button that performs it. It never
       blocks — dismissing it (or the workflow outgrowing it) just hides it. */
    '<div class="md-coach" id="mdCoach" hidden>' +
      '<span class="md-coach-pulse" aria-hidden="true"></span>' +
      '<i class="ph md-coach-icon" id="mdCoachIcon" aria-hidden="true"></i>' +
      '<div class="md-coach-text"><small id="mdCoachLabel">' + t("coachNext") + '</small><span id="mdCoachText"></span></div>' +
      '<button type="button" id="mdCoachGo" class="btn-accent"></button>' +
      '<div class="md-coach-dots" id="mdCoachDots" aria-hidden="true"></div>' +
      '<button type="button" id="mdCoachNever" class="md-coach-x" title="' + t("coachDontShow") + '"><i class="ph ph-eye-slash"></i></button>' +
      '<button type="button" id="mdCoachHide" class="md-coach-x" title="' + t("coachDismiss") + '" aria-label="' + t("coachDismiss") + '"><i class="ph ph-x"></i></button>' +
    '</div>' +
    '<div class="md-commandmanager" aria-label="' + t("cmdManager") + '">' +
    '<div class="md-command-tabs" role="tablist">' +
    '<button type="button" class="on" data-cmdtab="features" role="tab">' + t("cmdFeatures") + '</button>' +
    '<button type="button" data-cmdtab="sketch" role="tab">' + t("cmdSketch") + '</button>' +
    '<button type="button" data-cmdtab="evaluate" role="tab">' + t("cmdEvaluate") + '</button>' +
    '<button type="button" data-cmdtab="assembly" role="tab">' + t("cmdAssembly") + '</button>' +
    '<button type="button" id="mdCommandSearchBtn" class="md-command-search-btn" aria-label="' + t("cmdSearch") + '" title="' + kt(t("cmdSearch"), "Ctrl+K") + '"><i class="ph ph-magnifying-glass"></i><span>' + t("cmdSearch") + '</span><kbd>Ctrl K</kbd></button>' +
    '</div>' +
    '<div class="md-command-panes">' +
    '<div class="md-command-pane on" data-command-pane="features">' +
      /* Start is the everyday path: open a sketch, then the six verbs that turn
         a profile into a body. The specialty features moved to Standards so the
         default tab stops being a third wider than the window. */
      commandGroup("grpStart", [
        commandButton("newsketch", t("createSketch"), null, "primary"),
        commandButton("extrude", t("opExtrude"), null, "primary"),
        commandButton("extrudecut", t("extrudeCut"), null, "primary"),
        commandButton("revolvefeature", t("opRevolve"), "R"),
        commandButton("revolvecutfeature", t("opRevolveCut")),
        commandButton("sweepfeature", t("opSweep")),
        commandButton("sweepcutfeature", t("opSweepCut")),
        commandButton("loftfeature", t("cap_loft"), null, "", t("loftOp")),
        commandButton("holefeature", t("cap_hole"), null, "primary", t("holeWizard")),
      ]) +
      commandGroup("grpFinish", [
        commandButton("filletfeature", t("quickFillet"), null, "primary"),
        commandButton("chamferfeature", t("quickChamfer"), null, "primary"),
        commandButton("shellfeature", t("shellOp")),
        commandButton("draftfeature", t("draftOp")),
        commandButton("domefeature", t("domeOp")),
        commandButton("thickenfeature", t("thickenOp")),
        commandButton("ribfeature", t("ribOp")),
        commandButton("splitbodyfeature", t("splitBodyOp")),
        commandButton("movebodyfeature", t("moveBodyOp")),
        commandButton("patternfeature", t("quickPattern")),
        commandButton("mirrorfeature", t("quickMirror")),
        commandButton("booleanfeature", t("opBoolean")),
      ]) +
      /* Direct modelling rewrites two of these five into sketch tools and
         refuses the other three in a parametric-v1 document, so the group is
         hidden there (syncCommandManager) rather than removed — command search
         and legacy documents still reach every one of them. */
      commandGroup("grpDirect", [
        commandButton("directbox", t("tool_rect"), "B"),
        commandButton("directcyl", t("tool_circle"), "C"),
        commandButton("directsph", t("tool_sph"), "S"),
        commandButton("directpoly", t("tool_poly"), "P"),
        commandButton("directrev", t("tool_rev")),
      ], "secondary") +
      commandGroup("grpReferences", [
        commandButton("refplane", t("cap_refplane"), null, "", t("refPlane")),
        commandButton("refaxis", t("cap_refaxis"), null, "", t("refAxis")),
        commandButton("coordsys", t("cap_refcoord"), null, "", t("refCoord")),
      ], "secondary") +
      /* Helix, thread, knurl and insert are all standards-driven detail work
         (ISO threads, DIN 82 knurls, threaded inserts, the helix that sweeps
         them), so they sit with the toolbox parts rather than in Start. */
      commandGroup("grpStandards", [
        commandButton("stdscrew", t("cap_stdscrew"), null, "", t("stdScrewCommand")),
        commandButton("toolboxfastener", t("cap_fastener"), null, "", t("toolboxFastener")),
        commandButton("stdgear", t("stdGearCommand"), null, "", t("stdGearCommand")),
        commandButton("helixfeature", t("cap_helix"), null, "", t("opHelix")),
        commandButton("threadfeature", t("opThread"), null, "", t("opThread")),
        commandButton("knurlfeature", t("cap_knurl"), null, "", t("opKnurl")),
        commandButton("insertfeature", t("cap_insert"), null, "", t("opInsert")),
      ], "secondary") +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="sketch">' +
      commandGroup("grpSketch", [
        commandButton("select", t("cap_select"), "V", "", t("tool_select")),
        commandButton("wall", t("cap_wall"), "L", "primary", t("tool_wall")),
        commandButton("srect", t("cap_srect"), "Q", "primary", t("tool_srect")),
        commandButton("centerrectangle", t("centerRectangle"), ""),
        commandButton("faceboundary", t("faceBoundary"), ""),
        commandButton("convertentities", t("convertEntities"), null, "", t("convertEntitiesTip")),
        commandButton("scirc", t("cap_scirc"), "G", "primary", t("tool_scirc")),
        commandButton("dimensionedcircle", "Dimensioned circle", ""),
        commandButton("dimensionedpolygon", "Dimensioned polygon", ""),
        commandButton("sarc", t("centerpointArc"), "A", "", t("centerpointArc")),
        commandButton("arc3point", t("arcThreePoint"), ""),
        commandButton("tangentarc", t("tangentArc"), ""),
        commandButton("sslot", t("tool_sslot"), "J"),
        commandButton("centerslot", t("centerSlot"), ""),
        commandButton("spoly", t("cap_spoly"), "N", "", t("tool_spoly")),
        commandButton("sell", t("tool_sell"), "Y"),
        commandButton("sspline",t("tool_sspline"),""),
        commandButton("sketchrepair",t("sketchRepair"),""),
        commandButton("dim", t("cap_dim"), "D", "primary", t("tool_dim")),
        commandButton("trim", t("tool_trim"), "T", "primary"),
        commandButton("extend", t("tool_extend"), "E"),
        commandButton("sketchfillet", t("sketchFillet"), ""),
      ]) +
      /* Relations belong to the tab that owns sketching. They used to live only
         in the right-hand inspector, which on a phone is a bottom sheet — so
         the verbs of parametric sketching read as a separate product from the
         Sketch tab. Same palette plumbing, one tab closer. */
      commandGroup("grpRelations", RIBBON_RELATIONS.map(relationButton)) +
      commandGroup("grpSketchEdit", [
        commandButton("offset", t("tool_offset")),
        commandButton("constr", t("cap_constr"), null, "", t("tool_constr")),
        commandButton("mirror", t("sketchMirror")),
        commandButton("dynamicmirror", t("dynamicMirror")),
        commandButton("pattern", t("cap_pattern"), null, "", t("sketchPattern")),
        commandButton("circpattern", t("cap_circpattern"), null, "", t("sketchCircPattern")),
        // "Project" is a silhouette projection unless model edges are picked;
        // Convert Entities (in the Sketch group) is the selective conversion
        commandButton("project", t("cap_project"), null, "", t("projectEdgesTip")),
      ], "secondary") +
      /* Opening and committing a sketch are the two ends of this tab's job, so
         they get their own primary group at its end instead of leaving Finish
         sketch to sit as a peer of the construction-geometry toggle. */
      commandGroup("grpSketchOpenClose", [
        commandButton("newsketch", t("createSketch"), null, "primary"),
        commandButton("finishsketch", t("finishSketch"), null, "primary", t("finishSketch")),
      ]) +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="evaluate">' +
      /* What the model tells you about itself, versus what leaves the document.
         Zoom-to-fit is viewport control, not evaluation — the viewport chrome
         carries it, and F and command search still reach it. */
      commandGroup("grpAnalyze", [
        commandButton("regen", t("regenerate"), "Ctrl+B", "primary", t("regenerate")),
        commandButton("mass", t("massProps"), null, "", t("massProps")),
        commandButton("measure", t("measureTool"), null, "", t("measureTool")),
        commandButton("section", t("sectionView"), null, "", t("sectionView")),
        commandButton("paint", t("tool_paint"), "P", "", t("tool_paint_tip")),
        commandButton("note", t("tool_note"), "N", "", t("tool_note_tip")),
        commandButton("standards", t("standardsAudit"), null, "", t("standardsAudit")),
        commandButton("fitcheck", t("fitCheck"), null, "", t("fitCheck")),
      ]) +
      /* Configurations is neither analysis nor interop — it is saved document
         state, which is what the rest of this group is about. */
      commandGroup("grpFile", [
        commandButton("drawing", t("drawingExport")),
        commandButton("config", t("configurations")),
        commandButton("bundle", t("projectBundle"), null, "", t("projectBundle")),
        commandButton("bundlein", t("importBundle"), null, "", t("importBundle")),
        commandButton("stepin", t("stepImport"), null, "", t("stepImport")),
        commandButton("stepout", t("stepExport"), null, "", t("stepExport")),
        commandButton("igesout", t("exportIges"), null, "", t("exportIges")),
        commandButton("stlout", t("exportStl"), null, "", t("exportStlTip")),
        commandButton("layeranalysis", "Layer analysis"),
        commandButton("fffslice", "FFF slice preview"),
        // the unit override belongs next to the import it modifies, not in the header
        '<label class="md-command-field"><span>' + t("sourceUnits") + '</span>' +
        '<select id="mdStepUnit" aria-label="' + t("sourceUnits") + '"><option value="auto">' + t("stepAuto") + '</option>' +
        '<option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>' +
        '<option value="in">inch</option><option value="ft">feet</option></select></label>',
      ]) +
    '</div>' +
    /* Switching document shape is #mdDocModes' job in the header; repeating it
       here as two more ribbon buttons gave that command two homes. */
    '<div class="md-command-pane" data-command-pane="assembly">' +
      commandGroup("grpInsert", [
        commandButton("components", t("insertComponent"), null, "primary", t("insertComponent")),
        commandButton("formsubassembly",t("formSubassembly")),
        commandButton("componentpattern","Component Pattern"),
        commandButton("editcomponentpattern","Edit Component Pattern"),
        commandButton("removecomponentpattern","Remove Component Pattern"),
      ]) +
      commandGroup("grpMates", [
        commandButton("mates", t("mate"), null, "primary"),
        commandButton("screwmate", t("screwMate")),
      ]) +
      commandGroup("grpReview", [
        commandButton("explode", t("explodeView"), null, "", t("explodeView")),
        commandButton("isolate", t("isolate"), null, "", t("isolate")),
        commandButton("interference", t("interferenceCheck")),
        commandButton("bom", t("billOfMaterials"), null, "", t("billOfMaterials")),
        commandButton("motion", t("motionStudy"), null, "", t("motionStudy")),
      ]) +
      commandGroup("grpFile", [
        commandButton("printsetup", "Print setup"),
        commandButton("layeranalysis", "Layer analysis"),
        commandButton("fffslice", "FFF slice preview"),
        commandButton("stlout", t("exportStl")),
        commandButton("3mfout", "Export 3MF"),
        commandButton("amfout", "Export AMF"),
      ]) +
    '</div></div></div>' +
    '<div class="md-body">' +

    /* ---- left: design intent and ordered model history ----
       Every sketch tool and every feature op used to be repeated here as an
       unlabelled glyph while also living in the command manager above. One
       home per command: the ribbon owns the verbs, this panel owns the model
       tree. What's left is a plain text tab strip. */
    '<div class="md-panel md-left" id="mdLeftPanel">' +
    tabstrip("L", [
      tab("parts", "treeTab", t("tabTreeShort"), t("tabTreeLong"), '<span class="md-badge" id="mdPartBadge"></span>'),
      tab("lib", "libTab", t("tabLibShort"), t("tabLib")),
      tab("set", "paramsTab", t("tabSetShort"), t("tabSet")),
    ], '<button type="button" class="md-strip-act" data-act="new" title="' + t("newModel") + '"><i class="ph ph-file-plus"></i></button>') +
    '<div class="md-strip-meta"><span class="md-hsize" id="mdSize"></span><button type="button" class="md-diag-jump" id="mdDiagJump" hidden></button></div>' +
    '<div class="md-tabs" data-side="L">' +
    '<div class="md-pane on" data-pane="parts"><div id="mdParts"></div></div>' +
    '<div class="md-pane" data-pane="lib"><div id="mdLib"></div></div>' +
    '<div class="md-pane" data-pane="set"><div id="mdCons"></div></div>' +
    "</div>" +
    /* A property manager, not a launcher. The nine buttons that used to sit in
       this panel were the same nine commands as the Features ribbon tab,
       permanently parked over the model; now the panel only exists while a
       feature is being defined, it titles itself after that feature, and it
       covers the tree rather than the live preview it is there to show. */
    '<aside class="md-quick-tools" id="mdQuickTools" aria-label="' + t("quickTools") + '">' +
    '<div class="md-quick-settings" id="mdQuickSettings" hidden></div>' +
    '</aside>' +
    '<div id="mdLeftResizer" class="md-resizer md-resizer-left" role="separator" aria-orientation="vertical" aria-label="Resize feature tree" tabindex="0"></div>' +
    "</div>" +

    /* ---- middle: the drawing, full-bleed, with its controls floating on it ---- */
    '<div class="md-mid">' +
    '<canvas id="mdCanvas"></canvas>' +
    '<form id="mdDimEditor" class="md-dimension-editor" hidden autocomplete="off">' +
      '<div class="md-dimension-editor-head"><span><i class="ph ph-ruler"></i> ' + t("dimEditorTitle") + '</span><button type="button" data-dim-cancel aria-label="' + t("m_cancel") + '"><i class="ph ph-x"></i></button></div>' +
      '<label class="md-dimension-value"><span>' + t("dimValue") + '</span><span class="md-dimension-input"><input id="mdDimValue" type="text" spellcheck="false" autocapitalize="off" required><b id="mdDimUnit">mm</b></span></label>' +
      '<div class="md-dimension-quick"><label><span>' + t("dimMode") + '</span><select id="mdDimMode"><option value="driving">' + t("dimDriving") + '</option><option value="reference">' + t("dimReference") + '</option></select></label><label><span>' + t("dimNameOptional") + '</span><input id="mdDimName" type="text" spellcheck="false"></label></div>' +
      '<div class="md-dimension-quick"><label><span>Part tolerance</span><select id="mdDimTolerance"><option value="none">None</option><option value="deviation">Signed deviations</option></select></label><label><span>Upper / lower (dimension unit)</span><input id="mdDimTolUpper" type="text" aria-label="Upper tolerance deviation"><input id="mdDimTolLower" type="text" aria-label="Lower tolerance deviation"></label></div>' +
      '<div id="mdDimError" class="md-dimension-error" role="alert" hidden></div>' +
      '<div class="md-dimension-actions"><button type="button" class="danger" data-dim-delete title="' + t("dimDelete") + '"><i class="ph ph-trash"></i></button><span></span><button type="button" data-dim-cancel>' + t("m_cancel") + '</button><button type="submit" class="accept" title="' + t("dimApply") + '"><i class="ph ph-check"></i><span>' + t("dimApply") + '</span></button></div>' +
    '</form>' +
    '<div id="md3dHost" class="md-3dhost"></div>' +
    '<button type="button" id="mdToggleLeft" class="md-panel-toggle md-panel-toggle-left" aria-label="' + t("toggleTree") + '" title="' + t("toggleTree") + '" aria-pressed="true"><i class="ph ph-tree-structure"></i><span>' + t("tabTreeShort") + '</span></button>' +
    '<button type="button" id="mdToggleRight" class="md-panel-toggle md-panel-toggle-right" aria-label="' + t("toggleInspector") + '" title="' + t("toggleInspector") + '" aria-pressed="true"><i class="ph ph-sidebar-simple"></i><span>' + t("tabShapeShort") + '</span></button>' +
    '<div class="md-modes" id="mdModes" role="tablist" aria-label="Editor modes">' +
    '<button data-mode="3d" class="on" role="tab" aria-selected="true" data-tip="3">' + cadIcon("mode3d") + ' ' + t("mode3d") + "</button>" +
    '<button data-mode="2d" role="tab" aria-selected="false" data-tip="2">' + cadIcon("mode2d") + ' ' + t("mode2d") + "</button>" +
    '<button data-mode="drawing" role="tab" aria-selected="false" data-tip="7">' + cadIcon("drawing") + ' ' + t("modeDrawing") + "</button>" +
    '<button data-mode="split" id="mdModeSplit" role="tab" aria-selected="false" title="' + t("modeSplitTip") + '"><i class="ph ph-columns"></i> ' + t("modeSplit") + "</button>" +
    "</div>" +
    '<div class="md-drawing-tools" id="mdDrawingTools" role="toolbar" aria-label="Drawing tools">' +
    '<button type="button" data-drawing-tool="select" class="on">' + cadIcon("select") + '<span>' + t("drawToolSelect") + '</span><kbd>V</kbd></button>' +
    '<button type="button" data-drawing-tool="dim">' + cadIcon("dim") + '<span>' + t("drawToolDim") + '</span><kbd>D</kbd></button>' +
    '<button type="button" data-drawing-tool="angle"><i class="ph ph-angle"></i><span>' + t("drawToolAngle") + '</span><kbd>A</kbd></button>' +
    '<button type="button" data-drawing-tool="diam"><i class="ph ph-circle-dashed"></i><span>' + t("drawToolDiam") + '</span></button>' +
    '<button type="button" data-drawing-tool="baseline"><i class="ph ph-rows"></i><span>' + t("drawToolBaseline") + '</span><kbd>B</kbd></button>' +
    '<button type="button" data-drawing-tool="chain"><i class="ph ph-link-simple-horizontal"></i><span>' + t("drawToolChain") + '</span><kbd>C</kbd></button>' +
    '<button type="button" data-drawing-tool="sheetline">' + cadIcon("sheetline") + '<span>' + t("drawPaperLine") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetpolyline">' + cadIcon("sheetpolyline") + '<span>' + t("drawPaperPolyline") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetrect">' + cadIcon("sheetrect") + '<span>' + t("drawPaperRectangle") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetcircle">' + cadIcon("sheetcircle") + '<span>' + t("drawPaperCircle") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetarc">' + cadIcon("sheetarc") + '<span>' + t("drawPaperArc") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetellipse">' + cadIcon("sheetellipse") + '<span>' + t("drawPaperEllipse") + '</span></button>' +
    '<button type="button" data-drawing-tool="note"><i class="ph ph-note-pencil"></i><span>' + t("drawToolNote") + '</span><kbd>N</kbd></button>' +
    '<button type="button" data-drawing-tool="insertimage">' + cadIcon("insertimage") + '<span>Insert image</span></button>' +
    '<button type="button" data-drawing-tool="insertprojectimage">' + cadIcon("insertprojectimage") + '<span>Insert project image</span></button>' +
    '<button type="button" data-drawing-tool="editimage">' + cadIcon("editimage") + '<span>Edit image</span></button>' +
    '<button type="button" data-drawing-tool="removeimage"><i class="ph ph-trash"></i><span>Remove image</span></button>' +
    '<button type="button" data-drawing-tool="saveformat">' + cadIcon("saveformat") + '<span>Save sheet format</span></button>' +
    '<button type="button" data-drawing-tool="applyformat">' + cadIcon("applyformat") + '<span>Apply sheet format</span></button>' +
    '<button type="button" data-drawing-tool="savetemplate">' + cadIcon("savetemplate") + '<span>Save drawing template</span></button>' +
    '<button type="button" data-drawing-tool="newtemplate">' + cadIcon("newtemplate") + '<span>New from drawing template</span></button>' +
    '<button type="button" data-drawing-tool="section">' + cadIcon("drawingsection") + '<span>' + t("drawToolSection") + '</span><kbd>S</kbd></button>' +
    '<button type="button" data-drawing-tool="alignedsection">' + cadIcon("alignedsection") + '<span>Aligned cut-face section</span></button>' +
    '<button type="button" data-drawing-tool="detail"><i class="ph ph-magnifying-glass-plus"></i><span>' + t("drawToolDetail") + '</span></button>' +
    '<button type="button" data-drawing-tool="auxiliary"><i class="ph ph-cube"></i><span>Auxiliary</span></button>' +
    '<button type="button" data-drawing-tool="crop"><i class="ph ph-crop"></i><span>Crop</span></button>' +
    '<button type="button" data-drawing-tool="uncrop"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove crop</span></button>' +
    '<button type="button" data-drawing-tool="brokenout">' + cadIcon("brokenout") + '<span>Broken-out section</span></button>' +
    '<button type="button" data-drawing-tool="unbrokenout"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove broken-out</span></button>' +
    '<button type="button" data-drawing-tool="break">' + cadIcon("breakview") + '<span>Break view / edit</span></button>' +
    '<button type="button" data-drawing-tool="unbreak"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove Break</span></button>' +
    '<button type="button" data-drawing-tool="alternateposition"><i class="ph ph-copy"></i><span>Alternate Position / edit</span></button>' +
    '<button type="button" data-drawing-tool="removealternateposition"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove Alternate Position</span></button>' +
    '<span class="md-drawing-tools-sep"></span>' +
    '<button type="button" id="mdSheetAutoDim"><i class="ph ph-ruler"></i><span>' + t("drawAutoDim") + '</span></button>' +
    '<button type="button" id="mdSheetModelItems"><i class="ph ph-ruler"></i><span>' + t("drawModelItems") + '</span></button>' +
    '<button type="button" id="mdSheetHidden" aria-pressed="true"><i class="ph ph-eye-closed"></i><span>' + t("drawHiddenLines") + '</span><kbd>H</kbd></button>' +
    '<button type="button" id="mdSheetFit">' + cadIcon("fit") + '<span>' + t("zoomFit") + '</span><kbd>F</kbd></button>' +
    '<span class="md-drawing-tools-sep"></span>' +
    '<button type="button" id="mdSheetPrint"><i class="ph ph-printer"></i><span>' + t("drawPrint") + '</span></button>' +
    '<button type="button" id="mdSheetExport"><i class="ph ph-file-svg"></i><span>' + t("drawExportSvg") + '</span></button>' +
    '</div>' +
    '<aside class="md-sheet-panel" id="mdSheetPanel" hidden aria-label="' + t("sheetSetup") + '"></aside>' +
    '<div class="md-views" id="mdViews" role="toolbar" aria-label="' + t("displayStyle") + '">' +
    '<div class="md-vgroup">' +
    '<button data-view="top" data-tip="' + kt(t("view_top"), "4") + '">' + cadIcon("view_top") + '<span>' + (getLang()==="en"?"Top":"על") + ' · X·Z</span></button>' +
    '<button data-view="bottom" data-tip="' + t("view_bottom") + '">' + cadIcon("view_top") + '<span>' + (getLang()==="en"?"Bottom":"תחתון") + ' · X·Z</span></button>' +
    '<button data-view="front" data-tip="' + kt(t("view_front"), "5") + '">' + cadIcon("view_front") + '<span>' + (getLang()==="en"?"Front":"חזית") + ' · X·Y</span></button>' +
    '<button data-view="side" data-tip="' + kt(t("view_right"), "6") + '">' + cadIcon("view_right") + '<span>' + (getLang()==="en"?"Right":"ימין") + ' · Z·Y</span></button>' +
    '<button data-view="back" data-tip="' + t("view_back") + '">' + cadIcon("view_front") + '<span>' + (getLang()==="en"?"Back":"אחור") + ' · X·Y</span></button>' +
    '<button data-view="left" data-tip="' + t("view_left") + '">' + cadIcon("view_right") + '<span>' + (getLang()==="en"?"Left":"שמאל") + ' · Z·Y</span></button>' +
    '<button type="button" id="mdNormalToView" data-tip="' + kt(t("normalTo"), "Ctrl+8") + '">' + cadIcon("normalTo") + "<span>" + t("normalTo") + "</span></button>" +
    "</div>" +
    '<div class="md-vgroup md-projection"><button type="button" id="mdPerspectiveView" aria-label="Perspective" aria-pressed="true" title="Toggle perspective / orthographic orbit projection"><span>Perspective</span></button><button type="button" id="mdNamedViews" aria-label="Named views"><span>Named views</span></button></div>' +
    '<div class="md-vgroup md-zoom">' +
    '<button data-zoom="in" data-tip="' + t("zoomIn") + '" aria-label="' + t("zoomIn") + '" title="' + t("zoomIn") + '">' + cadIcon("zoomIn") + '</button>' +
    '<button data-zoom="out" data-tip="' + t("zoomOut") + '" aria-label="' + t("zoomOut") + '" title="' + t("zoomOut") + '">' + cadIcon("zoomOut") + '</button>' +
    '<button data-zoom="fit" data-tip="' + kt(t("zoomFit"), "F") + '" aria-label="' + t("zoomFit") + '" title="' + kt(t("zoomFit"), "F") + '">' + cadIcon("fit") + '</button>' +
    '</div>' +
    '<div class="md-vgroup md-display" role="group" aria-label="' + t("displayStyle") + '">' +
    '<button type="button" data-display="solid" class="on" aria-pressed="true">' + cadIcon("solidView") + '<span>' + t("solidView") + '</span></button>' +
    '<button type="button" data-display="transparent" aria-pressed="false">' + cadIcon("transparentView") + '<span>' + t("transparentView") + '</span></button>' +
    '<button type="button" id="mdShowEdges" class="on" aria-pressed="true" title="' + t("modelEdgesTip") + '">' + cadIcon("modelEdges") + '<span>' + t("modelEdges") + '</span></button>' +
    '<button type="button" id="mdTemporaryAxes" aria-pressed="false" title="Temporary axes"><i class="ph ph-crosshair-simple"></i><span>Temporary axes</span></button>' +
    '<button type="button" id="mdToggleNotesView" class="on" aria-pressed="true" title="' + t("toggleNotes") + '"><i class="ph ph-chat-circle-text"></i><span>' + t("notesAnnotations") + '</span></button>' +
    '</div><button type="button" id="mdFinishPlane" class="md-finish-plane">' + cadIcon("check") + '<span>' + t("exitPlane") + '</span></button></div>' +
    '<button type="button" id="mdSketchOnFace" class="md-sketch-on-face" hidden><i class="ph ph-pencil-line"></i><span>' + t("createSketchOnRef") + '</span></button>' +
    /* One shelf, not four things all claiming the same corner. The chip, the
       confirmation corner, the section panel and the evaluate card each used to
       pin themselves to top/inset-inline-end on their own, so any two of them
       open at once landed on top of each other — the plane chip covered the
       green check completely, and the eval card needed a hand-tuned 232px to
       dodge the section panel. A flex column stacks whatever is open and needs
       to know nothing about the heights of the rest. */
    '<div class="md-rail md-rail-end" id="mdRailEnd">' +
    '<button type="button" id="mdSketchPlaneChip" class="md-sketch-plane-chip" hidden>' +
      '<i class="ph ph-square-half" aria-hidden="true"></i><span id="mdSketchPlaneLabel"></span><b>' + t("changePlane") + '</b></button>' +
    '<div class="md-context-actions" id="mdContextActions" hidden>' +
    '<button type="button" id="mdAcceptCommand" class="accept" aria-label="' + t("finishCommand") + '" title="' + t("finishCommand") + '">' + cadIcon("check") + '</button>' +
    '<button type="button" id="mdCancelCommand" class="cancel" aria-label="' + t("cancelCommand") + '" title="' + t("cancelCommand") + '">' + cadIcon("cross") + '</button>' +
    '<span id="mdActiveCommand"></span></div>' +
    '<section class="md-section-controls" id="mdSectionControls" aria-label="' + t("sectionView") + '" hidden>' +
      '<div class="md-section-head"><b>' + t("sectionView") + '</b><button type="button" id="mdSectionClose" aria-label="' + t("sectionClose") + '" title="' + t("sectionClose") + '"><i class="ph ph-x"></i></button></div>' +
      '<div class="md-section-axis" role="group" aria-label="' + t("sectionAxis") + '"><button type="button" data-section-axis="x" class="on">X</button><button type="button" data-section-axis="y">Y</button><button type="button" data-section-axis="z">Z</button></div>' +
      '<label><span>' + t("sectionOffset") + '</span><input id="mdSectionOffset" type="range" min="-200" max="200" step="1" value="0"><output id="mdSectionValue">0 cm</output></label>' +
      '<button type="button" id="mdSectionFlip"><i class="ph ph-arrows-left-right"></i><span>' + t("sectionFlip") + '</span></button>' +
    '</section>' +
    /* Evaluate results that are ANSWERS rather than reports — a measurement,
       a mass, a BOM — live here rather than in #mdReport. #mdReport is
       aria-modal, so reading the number it just produced meant giving up the
       viewport that produced it; you could not orbit the model while reading
       its centre of mass. This card floats over the viewport instead and
       nothing under it stops responding. */
    '<section class="md-eval-card" id="mdEvalCard" aria-live="polite" hidden>' +
      '<div class="md-eval-head"><small id="mdEvalKicker"></small><b id="mdEvalTitle"></b>' +
      '<button type="button" id="mdEvalClose" aria-label="' + t("close") + '" title="' + t("close") + '"><i class="ph ph-x"></i></button></div>' +
      '<div class="md-eval-body" id="mdEvalBody"></div>' +
      '<div class="md-eval-actions" id="mdEvalActions"></div>' +
    '</section>' +
    '</div>' +
    /* The bottom-centre shelf, same reason: the hint, the face prompt and the
       profile offer are all "a sentence under the model", and all three used to
       be centred at their own `bottom`, so the offer sat squarely on the hint. */
    '<div class="md-rail md-rail-bottom" id="mdRailBottom">' +
    '<div class="md-profile-offer" id="mdProfileOffer" hidden></div>' +
    /* Non-modal on purpose: the viewport underneath it is the control. A modal
       plane dialog is what this bar replaces. */
    '<div class="md-face-prompt" id="mdFacePrompt" hidden>' +
    '<i class="ph ph-cursor-click"></i>' +
    '<span><b>' + t("pickFaceTitle") + '</b><small>' + t("pickFaceBody") + '</small></span>' +
    '<button type="button" id="mdFacePromptPlanes">' + t("pickFacePlanes") + '</button>' +
    '<button type="button" id="mdFacePromptCancel" class="cancel" aria-label="' + t("pickFaceCancel") + '" title="' + t("pickFaceCancel") + '"><i class="ph ph-x"></i></button>' +
    '</div>' +
    '<div class="md-hint" id="mdHint"></div>' +
    '</div>' +
    '<label id="mdPolygonControls" class="md-polygon-controls" hidden>' + t("dyn_sides") +
    ' <select id="mdPolygonSides" aria-label="' + t("dyn_sides") + '">' +
    Array.from({length:22},function(_,i){return '<option value="'+(i+3)+'">'+(i+3)+'</option>';}).join('') + '</select></label>' +
    '<button type="button" id="mdHintHelp" class="md-hint-help" aria-label="' + t("hint3d") + '" title="' + t("hint3d") + '"><i class="ph ph-question"></i></button>' +
    '<div id="mdEmptyStart" class="md-empty-start" role="group" aria-label="' + t("wfChoosePlane") + '" hidden>' +
      ["top","front","right"].map(function(plane){return '<button type="button" data-origin-plane="'+plane+'">'+t("view_"+plane)+'</button>';}).join("") + '</div>' +
    '<div class="md-context-toolbar" id="mdContextToolbar" hidden></div>' +
    '<div class="md-entity-nav" id="mdEntityNav" hidden></div>' +
    '<div class="md-feature-nav" id="mdFeatureNav" hidden></div>' +
    /* The selection row: filters at the start, breadcrumb at the end, one flex
       row so they compete for width instead of overlapping at narrow sizes —
       and so the breadcrumb stops printing itself over the status line. */
    '<div class="md-rail md-rail-row" id="mdRailRow">' +
    '<div class="md-sel-filters" id="mdSelFilters" role="toolbar" aria-label="' + t("selFilter") + '">' +
      '<button type="button" data-selfilter="all" class="on">' + t("selFilterAll") + '</button>' +
      '<button type="button" data-selfilter="face">' + t("selFilterFace") + '</button>' +
      '<button type="button" data-selfilter="edge">' + t("selFilterEdge") + '</button>' +
      '<button type="button" data-selfilter="vertex">' + t("selFilterVertex") + '</button>' +
      '<button type="button" data-selfilter="sketch">' + t("selFilterSketch") + '</button>' +
      '<button type="button" data-selfilter="body">' + t("selFilterBody") + '</button>' +
    '</div>' +
    '<div class="md-breadcrumb" id="mdBreadcrumb"></div>' +
    '</div>' +
    '<div class="md-assembly-move-mode" id="mdAssemblyMoveMode" role="toolbar" aria-label="' + t("assemblyMoveMode") + '">' +
      '<span>' + t("assemblyMoveMode") + '</span>' +
      '<button type="button" data-assembly-move="free" class="on" aria-pressed="true" title="' + t("assemblyMoveFree") + '"><i class="ph ph-arrows-out-cardinal"></i><b>' + t("assemblyMoveFree") + '</b></button>' +
      '<button type="button" data-assembly-move="x" aria-pressed="false" title="' + t("assemblyMoveX") + '">X</button>' +
      '<button type="button" data-assembly-move="y" aria-pressed="false" title="' + t("assemblyMoveY") + '">Y</button>' +
      '<button type="button" data-assembly-move="z" aria-pressed="false" title="' + t("assemblyMoveZ") + '">Z</button>' +
    '</div>' +
    '<div class="md-shortcut-bar" id="mdShortcutBar" hidden></div>' +
    '<div class="md-view-selector" id="mdViewSelector" hidden></div>' +
    '<div class="md-context-menu" id="mdContextMenu" hidden></div>' +
    '<div class="md-pick-cycle" id="mdPickCycle" hidden></div>' +
    '<div class="md-marquee" id="mdMarquee" hidden></div>' +
    '<div class="md-paint-toolbar" id="mdPaintToolbar" hidden role="toolbar" aria-label="' + t("tool_paint") + '">' +
      '<div class="md-paint-mode-toggle" role="group" aria-label="Paint mode">' +
        '<button type="button" data-paint-mode="face" class="on" title="' + t("paintModeFace") + '">' + t("paintModeFace") + '</button>' +
        '<button type="button" data-paint-mode="body" title="' + t("paintModeBody") + '">' + t("paintModeBody") + '</button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<div class="md-paint-swatches" id="mdPaintSwatches"></div>' +
      '<label class="md-paint-custom" title="' + t("color") + '">' +
        '<input type="color" id="mdPaintColorInput" value="#3b82f6">' +
      '</label>' +
      '<span class="md-paint-sep"></span>' +
      '<button type="button" id="mdPaintEyedropper" class="md-paint-tool-btn" title="' + t("paintEyedropper") + '">' +
        '<i class="ph ph-eyedropper"></i>' +
      '</button>' +
      '<button type="button" id="mdPaintClear" class="md-paint-tool-btn" title="' + t("clearPaint") + '">' +
        '<i class="ph ph-arrow-counter-clockwise"></i>' +
      '</button>' +
    '</div>' +
    '<div class="md-notes-toolbar" id="mdNotesToolbar" hidden role="toolbar" aria-label="' + t("tool_note") + '">' +
      '<div class="md-notes-mode-toggle" role="group" aria-label="Note mode">' +
        '<button type="button" data-note-mode="callout" class="on" title="' + t("noteModeCallout") + '"><i class="ph ph-chat-circle-text"></i><span>' + t("noteModeCallout") + '</span></button>' +
        '<button type="button" data-note-mode="markup" title="' + t("noteModeMarkup") + '"><i class="ph ph-pencil-simple-line"></i><span>' + t("noteModeMarkup") + '</span></button>' +
        '<button type="button" data-note-mode="eraser" title="' + t("noteModeEraser") + '"><i class="ph ph-eraser"></i><span>' + t("noteModeEraser") + '</span></button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<div class="md-markup-colors" id="mdMarkupColors">' +
        '<button type="button" data-markup-color="#ef4444" class="on" style="background:#ef4444" title="Red"></button>' +
        '<button type="button" data-markup-color="#eab308" style="background:#eab308" title="Yellow"></button>' +
        '<button type="button" data-markup-color="#22c55e" style="background:#22c55e" title="Green"></button>' +
        '<button type="button" data-markup-color="#3b82f6" style="background:#3b82f6" title="Blue"></button>' +
        '<button type="button" data-markup-color="#ffffff" style="background:#ffffff" title="White"></button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<button type="button" id="mdToggleNotesVisibility" class="md-paint-tool-btn on" title="' + t("toggleNotes") + '">' +
        '<i class="ph ph-eye"></i>' +
      '</button>' +
      '<button type="button" id="mdClearMarkupsBtn" class="md-paint-tool-btn" title="' + t("clearMarkups") + '">' +
        '<i class="ph ph-trash"></i>' +
      '</button>' +
    '</div>' +
    '<div class="md-note-editor" id="mdNoteEditor" hidden role="dialog" aria-modal="true" aria-label="' + t("noteEditorTitle") + '">' +
      '<div class="md-note-editor-head">' +
        '<i class="ph ph-chat-circle-text"></i>' +
        '<b id="mdNoteEditorTitle">' + t("noteEditorTitle") + '</b>' +
        '<button type="button" id="mdNoteEditorClose" aria-label="' + t("close") + '"><i class="ph ph-x"></i></button>' +
      '</div>' +
      '<div class="md-note-editor-cats" id="mdNoteEditorCats"></div>' +
      '<textarea id="mdNoteEditorText" rows="3" placeholder="' + t("notePlaceholder") + '"></textarea>' +
      '<div class="md-note-editor-actions">' +
        '<button type="button" id="mdNoteEditorDelete" class="danger" title="' + t("noteDelete") + '"><i class="ph ph-trash"></i></button>' +
        '<button type="button" id="mdNoteEditorDone" class="accept"><i class="ph ph-check"></i><span>' + t("noteDone") + '</span></button>' +
      '</div>' +
    '</div>' +
    '<div class="md-gesture-wheel" id="mdGestureWheel" hidden>' +
      '<span data-dir="up" data-cmd="extrude">' + cadIcon("extrude") + '<span>' + t("opExtrude") + '</span></span>' +
      '<span data-dir="right" data-cmd="normalTo">' + cadIcon("normalTo") + '<span>' + t("normalTo") + '</span></span>' +
      '<span data-dir="down" data-cmd="dim">' + cadIcon("dim") + '<span>' + t("tool_dim") + '</span></span>' +
      '<span data-dir="left" data-cmd="wall">' + cadIcon("wall") + '<span>' + t("cap_wall") + '</span></span>' +
    '</div>' +
    commandBarHTML("model") +
    '<div class="md-status" id="mdStatus" role="status"></div>' +
    "</div>" +

    /* ---- right: the model as it will look, and the selected part ---- */
    '<div class="md-panel md-right" id="mdRightPanel">' +
    '<div id="mdRightResizer" class="md-resizer" role="separator" aria-orientation="vertical" aria-label="Resize inspector" tabindex="0"></div>' +
    '<div class="md-prev-wrap">' +
    '<canvas id="mdPrev"></canvas>' +
    '<svg id="mdNotesSvg" class="md-notes-svg"></svg>' +
    '<canvas id="mdMarkupCanvas" class="md-markup-canvas"></canvas>' +
    '<div id="mdNotesHost" class="md-notes-host"></div>' +
    '<label class="md-context-toggle"><input type="checkbox" id="mdContextBtn"><span>' + t("contextRoom") + "</span></label>" +
    "</div>" +
    // Round-6: while the middle shows the model, the column shows the sketch
    '<button type="button" class="md-sketch-thumb" id="mdSketchThumb" hidden title="' + t("sketchThumbTip") + '"><canvas></canvas><span class="md-view-chip"></span></button>' +
    tabstrip("R", [
      tab("sketch", "ph-compass-tool", t("tabSketchShort"), t("tabSketch"), '<span class="md-badge" id="mdDofBadge"></span>'),
      tab("shape", "ph-ruler", t("tabShapeShort"), t("tabShape")),
      tab("look", "ph-paint-brush", t("tabLookShort"), t("tabLook")),
      tab("ops", "ph-magic-wand", t("tabOpsShort"), t("tabOps")),
      tab("hist", "ph-clock-counter-clockwise", t("tabHistShort"), t("tabHist")),
    ]) +
    '<div class="md-strip-meta"><span class="md-hsel" id="mdSelName"></span></div>' +
    '<div class="md-tabs" data-side="R">' +
    '<div class="md-pane" data-pane="sketch"><div id="mdSketch"></div></div>' +
    '<div class="md-pane on" data-pane="shape"><div id="mdInsp"></div></div>' +
    '<div class="md-pane" data-pane="look"><div id="mdLook"></div></div>' +
    '<div class="md-pane" data-pane="ops"><div id="mdOps"></div></div>' +
    '<div class="md-pane" data-pane="hist"><div id="mdHist"><section id="mdHistDesign"></section><section id="mdHistSession"></section></div></div>' +
    "</div></div></div>" +
    '<div class="md-command-search" id="mdCommandSearch" hidden role="dialog" aria-modal="true" aria-label="' + t("cmdSearch") + '">' +
    '<div class="md-command-search-card"><div class="md-command-search-input"><i class="ph ph-magnifying-glass"></i>' +
    '<input id="mdCommandSearchInput" type="search" autocomplete="off" placeholder="' + t("cmdSearchHint") + '" aria-autocomplete="list" aria-controls="mdCommandResults" role="combobox" aria-expanded="true"><button type="button" id="mdCommandSearchClose" aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></div>' +
    '<div id="mdCommandResults" class="md-command-results" role="listbox"></div></div></div>' +
    '<div class="md-reference-picker" id="mdReferencePicker" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReferenceTitle">' +
        '<header><div><small>' + t("newSketchKicker") + '</small><h3 id="mdReferenceTitle">' + t("referencePickerTitle") + '</h3></div><button type="button" data-reference-cancel aria-label="' + t("cancelCommand") + '"><i class="ph ph-x"></i></button></header>' +
        '<p>' + t("referencePickerBody") + '</p>' +
        '<div class="md-reference-options" id="mdReferenceOptions"></div>' +
      '</section></div>' +
    '<div class="md-reference-picker md-report" id="mdReport" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReportTitle">' +
        '<header><div><small id="mdReportKicker"></small><h3 id="mdReportTitle"></h3></div><button type="button" data-report-close aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></header>' +
        '<div class="md-pick-toolbar" id="mdPickToolbar" hidden><button type="button" id="mdPickBack"></button><input id="mdPickSearch" type="search" autocomplete="off"></div>' +
        '<pre id="mdReportBody" tabindex="0"></pre>' +
        '<div class="md-reference-options" id="mdPickList" hidden></div>' +
      '</section></div>' +
    /* ---- visual start screen: a gallery of starting points, not a blank
       canvas and a ribbon of strangers. Rendered by renderWelcomeCards(). */
    '<div class="md-welcome" id="mdWelcome" hidden>' +
      '<section class="md-welcome-card" role="dialog" aria-modal="true" aria-labelledby="mdWelcomeTitle">' +
        '<button type="button" id="mdWelcomeClose" class="md-welcome-close" aria-label="' + t("close") + '" title="' + t("close") + '"><i class="ph ph-x"></i></button>' +
        '<header class="md-welcome-head"><small>' + t("welcomeKicker") + '</small><h2 id="mdWelcomeTitle">' + t("welcomeTitle") + '</h2><p>' + t("welcomeSub") + '</p></header>' +
        '<div class="md-welcome-scroll">' +
          '<h4 class="md-welcome-group"><i class="ph ph-rocket-launch"></i>' + t("welcomeStartGroup") + '</h4>' +
          '<div class="md-welcome-grid" id="mdWelcomeStart"></div>' +
          '<h4 class="md-welcome-group"><i class="ph ph-graduation-cap"></i>' + t("welcomeGuidesGroup") + '</h4>' +
          '<div class="md-welcome-grid" id="mdWelcomeGuides"></div>' +
        '</div>' +
        '<footer class="md-welcome-foot">' +
          '<label class="md-welcome-dontshow"><input type="checkbox" id="mdWelcomeNever"><span>' + t("welcomeDontShow") + '</span></label>' +
          '<span class="md-welcome-hint"><i class="ph ph-sliders-horizontal"></i>' + t("welcomeSettingsHint") + '</span>' +
        '</footer>' +
      '</section>' +
    '</div>' +
    '<div class="md-tour-layer" id="mdTour" hidden>' +
      '<section class="md-tour-card" role="dialog" aria-modal="false" aria-labelledby="mdTourTitle">' +
        '<div class="md-tour-head" id="mdTourHead" title="' + t("guideMoveCard") + '"><div><span id="mdTourCount"></span><h3 id="mdTourTitle"></h3></div>' +
        '<div class="md-tour-head-actions">' +
          '<button type="button" id="mdTourSpeak" aria-label="' + t("speakReadAloud") + '" title="' + t("speakReadAloud") + '"><i class="ph ph-speaker-high"></i></button>' +
          /* A phone card is 8px from both edges: there is nowhere to drag it to
             when a step asks you to draw on the canvas underneath it. Collapse
             leaves the step title and the actions, and nothing else. */
          '<button type="button" id="mdTourMin" aria-label="' + t("guideCollapse") + '" title="' + t("guideCollapse") + '"><i class="ph ph-caret-down"></i></button>' +
          '<button type="button" id="mdTourClose" aria-label="' + t("guideClose") + '" title="' + t("guideClose") + '"><i class="ph ph-x"></i></button>' +
        '</div></div>' +
        '<div class="md-tour-progress" aria-hidden="true"><span id="mdTourProgress"></span></div>' +
        '<p id="mdTourBody"></p><div class="md-tour-demo" id="mdTourDemo" hidden aria-hidden="true"></div><div class="md-tour-tracks" id="mdTourTracks" hidden></div>' +
        '<label class="md-tour-slider" id="mdTourSlider" hidden><span>' + t("guideAutoSlider") + '</span><output id="mdTourSliderValue"></output><input id="mdTourRange" type="range" min="0" value="0"></label>' +
        '<div class="md-tour-tip"><i class="ph ph-lightbulb"></i><span id="mdTourTip"></span></div>' +
        '<div class="md-tour-status" id="mdTourStatus" role="status"></div>' +
        '<div class="md-tour-actions"><button type="button" id="mdTourBack"><i class="ph ph-arrow-right"></i>' + t("guideBack") + '</button>' +
        '<button type="button" id="mdTourRestart" class="md-tour-restart" aria-label="' + t("guideRestart") + '" title="' + t("guideRestart") + '"><i class="ph ph-arrow-counter-clockwise"></i><span>' + t("guideRestart") + '</span></button>' +
        '<button type="button" id="mdTourSkip" class="md-tour-skip">' + t("guideSkip") + '</button>' +
        '<button type="button" id="mdTourKeep" class="md-tour-skip" title="' + t("guideKeepResultTip") + '" hidden>' + t("guideKeepResult") + '</button>' +
        '<button type="button" id="mdTourNext" class="btn-accent">' + t("guideNext") + '<i class="ph ph-arrow-left"></i></button></div>' +
      '</section></div>';
  document.body.appendChild(root);
  /* The ribbon's four command panes become uikit slots, so a saved layout can
     rearrange the groups in them. A no-op unless uikit is running. */
  ribbon.attach(root);

  // tools: mutually exclusive, one drawing mode at a time
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-tool")); });
  });
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-drawing-tool")); });
  });
  root.querySelectorAll("#mdDrawingTools button").forEach(function (b) {
    var label = b.querySelector("span"), shortcut = b.querySelector("kbd");
    if (!label) return;
    b.setAttribute("aria-label", label.textContent);
    b.title = label.textContent + (shortcut ? " · " + shortcut.textContent : "");
  });
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    b.addEventListener("click", function () { setCommandTab(b.getAttribute("data-cmdtab")); });
  });
  root.querySelectorAll("[data-relation]").forEach(function (b) {
    // greyed relations stay clickable so applyConstraint can say why (see markUnavailable)
    b.addEventListener("click", function () { applyConstraint(b.getAttribute("data-relation")); refreshAll(); });
  });
  root.querySelectorAll("[data-command]").forEach(function (b) {
    b.addEventListener("click", function () { runCommand(b.getAttribute("data-command")); });
  });
  root.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  root.querySelector("#mdNormalToView").addEventListener("click", function () {
    orientModelToView(true);
    drawSketch();
  });
  root.querySelector("#mdPerspectiveView").addEventListener("click", function () {
    if(!E.pv)return;
    var mode=E.pv.getProjection()==='perspective'?'orthographic':'perspective';
    E.pv.setProjection(mode);
    try{localStorage.setItem('modelforge:orbitProjection',mode);}catch(error){}
    syncViewButtons();
  });
  root.querySelector('#mdNamedViews').addEventListener('click',showViewSelector);
  root.querySelector("#mdSketchPlaneChip").addEventListener("click", function () {
    showReferencePicker(E.tool);
  });
  root.querySelectorAll("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () { zoomBy(b.getAttribute("data-zoom")); });
  });
  root.querySelectorAll("[data-display]").forEach(function (b) {
    b.addEventListener("click", function () { setModelDisplay(b.getAttribute("data-display")); });
  });
  root.querySelector("#mdShowEdges").addEventListener("click", function () { setShowModelEdges(!(E.showModelEdges !== false)); });
  root.querySelector("#mdTemporaryAxes").addEventListener("click",function(){
    E.showTemporaryAxes=!E.showTemporaryAxes;
    this.setAttribute("aria-pressed",String(E.showTemporaryAxes));this.classList.toggle("on",E.showTemporaryAxes);
    updatePreview();
    var axisCount=decoGroups.reduce(function(total,entry){return total+temporaryAxes(entry.part.meshData?.topology || topologyEntriesForPart(entry.part)).length;},0);
    flash(E.showTemporaryAxes ? "Temporary axes shown: "+axisCount : "Temporary axes hidden");
  });
  var toggleNotesView = root.querySelector("#mdToggleNotesView");
  if (toggleNotesView) {
    toggleNotesView.addEventListener("click", function () {
      E.notesVisible = !(E.notesVisible !== false);
      syncNotesToolbar();
      syncViewsToolbarNotes();
      if (E.pv) syncNotesAndMarkups(E.pv);
    });
  }

  // Paint toolbar swatches and controls
  var swatchesHost = root.querySelector("#mdPaintSwatches");
  if (swatchesHost) {
    swatchesHost.innerHTML = "";
    CURATED_SWATCHES.forEach(function (sw) {
      var sBtn = el("button", "md-paint-swatch" + (sw.color === E.paintColor ? " on" : ""));
      sBtn.type = "button";
      sBtn.style.background = sw.color;
      sBtn.title = sw.name;
      sBtn.setAttribute("data-swatch-color", sw.color);
      sBtn.addEventListener("click", function () {
        E.paintColor = sw.color;
        E.paintMetal = sw.metal;
        E.paintRough = sw.rough;
        E.paintEyedropper = false;
        syncPaintToolbar();
      });
      swatchesHost.appendChild(sBtn);
    });
  }
  root.querySelectorAll("[data-paint-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.paintMode = b.getAttribute("data-paint-mode");
      syncPaintToolbar();
    });
  });
  var paintColorInput = root.querySelector("#mdPaintColorInput");
  if (paintColorInput) {
    paintColorInput.addEventListener("input", function () {
      E.paintColor = this.value;
      syncPaintToolbar();
    });
  }
  var eyedropperBtn = root.querySelector("#mdPaintEyedropper");
  if (eyedropperBtn) {
    eyedropperBtn.addEventListener("click", function () {
      E.paintEyedropper = !E.paintEyedropper;
      syncPaintToolbar();
      flash(E.paintEyedropper ? (t("paintEyedropper") + " — " + t("paintHint")) : t("paintFace"));
    });
  }
  var clearPaintBtn = root.querySelector("#mdPaintClear");
  if (clearPaintBtn) {
    clearPaintBtn.addEventListener("click", function () {
      var face = (E.topologySelection || []).find(function (item) { return item.kind === "face"; });
      if (face) {
        pushUndo(t("clearPaint"));
        clearFacePaint(E.def, face);
        updatePreview();
        refreshParts();
      } else {
        flash(t("selectFaceForColor"));
      }
    });
  }

  // Notes toolbar controls
  root.querySelectorAll("[data-note-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.noteMode = b.getAttribute("data-note-mode");
      syncNotesToolbar();
      syncHint();
    });
  });
  root.querySelectorAll("[data-markup-color]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.markupColor = b.getAttribute("data-markup-color");
      syncNotesToolbar();
    });
  });
  var toggleNotesVisBtn = root.querySelector("#mdToggleNotesVisibility");
  if (toggleNotesVisBtn) {
    toggleNotesVisBtn.addEventListener("click", function () {
      E.notesVisible = !(E.notesVisible !== false);
      syncNotesToolbar();
      syncViewsToolbarNotes();
      if (E.pv) syncNotesAndMarkups(E.pv);
    });
  }
  var clearMarkupsBtn = root.querySelector("#mdClearMarkupsBtn");
  if (clearMarkupsBtn) {
    clearMarkupsBtn.addEventListener("click", function () {
      if (E.def && E.def.markups && E.def.markups.length) {
        pushUndo(t("clearMarkups"));
        clearMarkupsFromDef(E.def);
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
    });
  }

  // Note editor dialog
  var noteEditorClose = root.querySelector("#mdNoteEditorClose");
  if (noteEditorClose) noteEditorClose.addEventListener("click", closeNoteEditor);
  var noteEditorDone = root.querySelector("#mdNoteEditorDone");
  if (noteEditorDone) {
    noteEditorDone.addEventListener("click", function () {
      if (E.activeNoteId && E.def) {
        var textarea = root.querySelector("#mdNoteEditorText");
        var text = textarea ? textarea.value.trim() : "";
        pushUndo(t("editNote"));
        updateNoteInDef(E.def, E.activeNoteId, { text: text || "Note" });
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
      closeNoteEditor();
    });
  }
  var noteEditorDelete = root.querySelector("#mdNoteEditorDelete");
  if (noteEditorDelete) {
    noteEditorDelete.addEventListener("click", function () {
      if (E.activeNoteId && E.def) {
        pushUndo(t("deleteNote"));
        deleteNoteFromDef(E.def, E.activeNoteId);
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
      closeNoteEditor();
    });
  }
  root.querySelector("#mdSketchOnFace").addEventListener("click", function () { beginSketchWorkflow(null, { forceNew: true }); });
  root.querySelector("#mdHintHelp").addEventListener("click", function () { E.hintDismissed = false; syncHint(); });
  bindPolygonSideControl(root.querySelector("#mdPolygonSides"));
  root.querySelector("#mdToggleLeft").addEventListener("click", function () { setPanelCollapsed("left", !E.leftCollapsed); });
  root.querySelector("#mdToggleRight").addEventListener("click", function () {
    /* Same button, the panel that is actually on screen: in Drawing mode the
       inspector is not there to collapse — the sheet's properties are. */
    if (E.mode === "drawing") {
      root.classList.toggle("md-sheet-collapsed");
      sizeSketch();
      drawSketch();
      return;
    }
    setPanelCollapsed("right", !E.rightCollapsed);
    E.rightCollapsedPreference = E.rightCollapsed; saveModelerPrefs();
  });
  root.querySelectorAll("[data-section-axis]").forEach(function (button) {
    button.addEventListener("click", function () { setSectionState({ enabled:true, axis:button.getAttribute("data-section-axis") }); });
  });
  root.querySelector("#mdSectionOffset").addEventListener("input", function () { setSectionState({ enabled:true, offset:Number(this.value) || 0 }); });
  root.querySelector("#mdSectionFlip").addEventListener("click", function () { setSectionState({ enabled:true, flip:!E.section.flip }); });
  root.querySelector("#mdSectionClose").addEventListener("click", function () { setSectionState({ enabled:false }); });
  root.querySelector("#mdEvalClose").addEventListener("click", function () { closeEvalCard(); });
  root.querySelector("#mdFinishPlane").addEventListener("click", finishSketchWorkflow);
  // tabs swap the pane inside their own panel; the two panels are independent
  root.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });
  root.querySelector('[data-act="new"]').addEventListener("click", newModel);
  root.querySelectorAll("[data-workflow-step]").forEach(function(button){
    button.addEventListener("click",function(){
      activateWorkflowStep(button.getAttribute("data-workflow-step"));
    });
  });
  root.querySelector("[data-reference-cancel]").addEventListener("click",cancelReferenceSelection);
  root.querySelector("#mdFacePromptPlanes").addEventListener("click",function(){cancelFacePick(true);});
  root.querySelector("#mdFacePromptCancel").addEventListener("click",function(){cancelFacePick(false);});
  root.querySelector("[data-report-close]").addEventListener("click",closeReport);
  root.querySelector("#mdReport").addEventListener("click",function(event){ if(event.target===this) closeReport(); });
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.addEventListener("click", function () { requestDocumentType(b.getAttribute("data-doc")); });
  });

  // sketch settings live in their own pane now, so they never crowd the tools
  var cons = root.querySelector("#mdCons");
  var dUnit = getDomainUnit("details");
  cons.innerHTML =
    '<label class="md-row"><span class="t">' + t("partUnits") + '</span><select id="mdDocumentLengthUnit" aria-label="' + t("partUnits") + '"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option></select></label>' +
    '<button type="button" id="mdDocumentProperties" class="md-settings-btn">Document properties</button>' +
    '<button type="button" id="mdSaveDocumentTemplate" class="md-settings-btn">Save document template</button>' +
    '<button type="button" id="mdNewDocumentTemplate" class="md-settings-btn">New from document template</button>' +
    '<label class="md-row"><span class="t">' + t("gridSize") + '</span><input id="mdGrid" type="number" value="' + toDisp(5, "details") + '" min="1"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-check"><input type="checkbox" id="mdOsnap" checked><span>' + t("osnap") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdNormalTo"><span>' + t("prefNormalTo") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdAutoDim"><span>' + t("prefAutoDim") + "</span></label>" +
    '<div class="md-sep"></div>' +
    '<h5 class="md-h5">' + t("guidanceTitle") + "</h5>" +
    '<label class="md-check"><input type="checkbox" id="mdPrefWelcome"><span>' + t("prefWelcome") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdPrefCoach"><span>' + t("prefCoach") + "</span></label>" +
    '<button type="button" id="mdGuideReplay" class="md-settings-btn"><i class="ph ph-graduation-cap"></i>' + t("guideRelaunch") + "</button>" +
    '<div class="md-sep"></div>' +
    '<label class="md-row"><span class="t">' + t("depth") + '</span><input id="mdDepth" type="number" value="' + toDisp(60, "details") + '" min="1"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-row"><span class="t">' + t("base") + '</span><input id="mdBase" type="number" value="' + toDisp(0, "details") + '"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-row"><span class="t">' + t("wallWidth") + '</span><input id="mdWallWidth" type="number" value="' + toDisp(10, "details") + '" min="0.5"><span class="u">' + dUnit + '</span></label>' +
    '<div class="md-note">' + t("ortho") + "</div>" +
    '<h5 class="md-h5">' + t("keysTitle") + "</h5>" +
    '<div class="md-keys">' +
    /* The tool rows are read out of KEY_TOOL, not restated: a hand-written copy
       drifted until it advertised Sphere on S (S opens the shortcut bar) and
       left out slot, ellipse and polygon entirely. Only the keys the handler
       spends on something other than a tool are spelled out below. */
    toolKeyRows().concat([
      [t("opRevolve"), "R"], [t("shortcutBar"), "S"],
      [t("mode3d") + " / " + t("mode2d") + " / " + t("modeDrawing"), "3 / 2 / 7"],
      [t("view_top") + " / " + t("view_front") + " / " + t("view_right"), "4 / 5 / 6"],
      [t("zoomFit"), "F"], [t("ortho"), "Shift"], [t("normalTo"), "Ctrl+8"],
      [t("cmdSearch"), "Ctrl+K · /"], [t("regenerate"), "Ctrl+B"], [t("save"), "Ctrl+S"],
      [t("undo") + " / " + t("redo"), "Ctrl+Z / Y · Shift+Z"], [t("del"), "Del"], [t("cancelCommand"), "Esc"],
    ]).map(function (k) { return '<div class="md-key"><span>' + k[0] + "</span><kbd>" + k[1] + "</kbd></div>"; }).join("") +
    "</div>";
  var shortcuts=el("details","md-feature-group"),shortcutBody=el("div","md-feature-group-body");
  shortcuts.appendChild(el("summary","","Custom command shortcuts"));
  var commandSelect=el("select"),keyInput=el("input"),message=el("div","md-note");
  commandSelect.setAttribute("aria-label","Shortcut command");keyInput.setAttribute("aria-label","Shortcut key");keyInput.placeholder="Unused letter, e.g. U";keyInput.maxLength=1;
  commandCatalog().forEach(function(command){var option=el("option","",command.label);option.value=command.id;commandSelect.appendChild(option);});
  var syncShortcut=function(){keyInput.value=(E.commandShortcuts || {})[commandSelect.value] || "";message.textContent="Single-letter shortcuts apply in model and sketch views. Built-in keys are reserved.";};
  commandSelect.addEventListener("change",syncShortcut);
  shortcutBody.append(commandSelect,keyInput,message);
  shortcutBody.appendChild(btn("Assign shortcut",function(){
    var key=keyInput.value.trim().toLowerCase(),id=commandSelect.value,error=shortcutConflict(key,id,E.commandShortcuts);
    if(error){message.textContent=error;return;}
    E.commandShortcuts=E.commandShortcuts || {};
    if(key)E.commandShortcuts[id]=key;else delete E.commandShortcuts[id];
    saveModelerPrefs();message.textContent=key ? "Shortcut saved: "+key.toUpperCase() : "Custom shortcut removed";
  }));
  shortcutBody.appendChild(btn("Remove shortcut",function(){keyInput.value="";if(E.commandShortcuts)delete E.commandShortcuts[commandSelect.value];saveModelerPrefs();message.textContent="Custom shortcut removed";}));
  shortcuts.appendChild(shortcutBody);cons.appendChild(shortcuts);syncShortcut();
  cons.prepend(root.querySelector(".md-head-inputs"));
  var statusRow=el("div", "md-status-row");
  var workflow=root.querySelector("#mdWorkflow");
  workflow.before(statusRow); statusRow.append(workflow,root.querySelector("#mdCoach"));
  var densityRow=el("label","md-row"), density=el("select");
  density.id="mdDensity";
  densityRow.appendChild(el("span","t",t("density")));
  ["guided","standard","expert"].forEach(function(value){var option=el("option","",t("density_"+value));option.value=value;density.appendChild(option);});
  densityRow.appendChild(density); cons.querySelector("#mdPrefWelcome").closest("label").before(densityRow);
  density.addEventListener("change",function(){
    E.expertDensity=this.value==="expert";
    E.workflowVisible=this.value==="guided"; E.coachEnabled=E.workflowVisible;
    E.welcomeOnOpen=E.workflowVisible; E.coachDismissed=false;
    saveModelerPrefs(); syncDensity(); syncCoach(); sizeSketch(); requestAnimationFrame(layout3DHost);
  });
  syncDensity();
  cons.querySelector("#mdOsnap").checked = !!E.osnap;
  cons.querySelector("#mdOsnap").addEventListener("change", function () { E.osnap = this.checked; saveModelerPrefs(); });
  var normalToBox = cons.querySelector("#mdNormalTo");
  normalToBox.checked = !!E.sketchNormalTo;
  normalToBox.addEventListener("change", function () { setSketchNormalTo(this.checked); });
  syncNormalToControls();
  var autoDimBox = cons.querySelector("#mdAutoDim");
  autoDimBox.checked = !!E.autoDimTyped;
  autoDimBox.addEventListener("change", function () { E.autoDimTyped = this.checked; saveModelerPrefs(); });
  /* Precise editing on a touch screen — the same lens / rough / portal chooser
     the planner offers, built by touch_precision_ui and reading the one shared
     preference, so switching here switches there too. It sits beside Object
     snap because they answer the same question: how the app helps a fingertip
     land on the entity it was aimed at rather than the one next to it. The
     editor already obeyed these prefs; it just never offered the switch. */
  var touchPrecisionGap = el("div", "md-sep");
  autoDimBox.closest("label").after(touchPrecisionGap);
  touchPrecisionGap.after(buildTouchPrecisionSettings());
  /* Guidance prefs — the "don't show again" on the welcome screen and the
     coach bar's eye-slash both land here, so nothing the user hides is gone
     for good. */
  var welcomeBox = cons.querySelector("#mdPrefWelcome");
  welcomeBox.checked = !!E.welcomeOnOpen;
  welcomeBox.addEventListener("change", function () { E.welcomeOnOpen = this.checked; saveModelerPrefs(); });
  var coachBox = cons.querySelector("#mdPrefCoach");
  coachBox.checked = !!E.coachEnabled;
  coachBox.addEventListener("change", function () { E.coachEnabled = this.checked; E.coachDismissed = false; saveModelerPrefs(); syncCoach(); });
  cons.querySelector("#mdGuideReplay").addEventListener("click", function () { setTab("parts"); startTour(); });
  cons.querySelector("#mdDocumentLengthUnit").addEventListener("change", function () {
    setModelLengthUnit(this.value);
  });
  cons.querySelector('#mdDocumentProperties').addEventListener('click',function(){void documentPresetAction('properties');});
  cons.querySelector('#mdSaveDocumentTemplate').addEventListener('click',function(){void documentPresetAction('capture');});
  cons.querySelector('#mdNewDocumentTemplate').addEventListener('click',function(){void documentPresetAction('new');});
  cons.querySelector("#mdGrid").addEventListener("change", function () { E.grid = Math.max(0.1, fromDisp(+this.value || 5, "details")); drawSketch(); syncStatus(); });
  cons.querySelector("#mdDepth").addEventListener("change", function () { E.depth = Math.max(0.1, fromDisp(+this.value || 60, "details")); });
  cons.querySelector("#mdBase").addEventListener("change", function () { E.baseOff = fromDisp(+this.value || 0, "details"); });
  cons.querySelector("#mdWallWidth").addEventListener("change", function () { E.wallWidth = Math.max(0.05, fromDisp(+this.value || 10, "details")); });

  root.querySelector("#mdSave").addEventListener("click", saveCurrentDocument);
  root.querySelector("#mdSheetAutoDim").addEventListener("click", function () { drawingSheet().autoDimension(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetModelItems").addEventListener("click", function () { drawingSheet().insertModelItems(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetHidden").addEventListener("click", function () {
    drawingSheet().setSheetOption("showHidden", !drawingDocument().showHidden);
    drawSketch(); syncTools();
  });
  root.querySelector("#mdSheetFit").addEventListener("click", function () { drawingSheet().fit(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetPrint").addEventListener("click", printDrawingSheet);
  root.querySelector("#mdSheetExport").addEventListener("click", exportDrawingSvg);
  root.querySelector("#mdGuide").addEventListener("click", startTour);
  root.querySelector("#mdClose").addEventListener("click", requestCloseModeler);
  wireEditorSwitch(root);
  wireShell(root, "model");
  root.querySelector("#mdUndo").addEventListener("click", doUndo);
  root.querySelector("#mdRedo").addEventListener("click", doRedo);
  root.querySelector("#mdCommandSearchBtn").addEventListener("click", function () { openCommandSearch(); });
  root.querySelector("#mdCommandSearchInput").addEventListener("input", renderCommandResults);
  root.querySelector("#mdCommandSearchClose").addEventListener("click", closeCommandSearch);
  root.querySelector("#mdCommandSearch").addEventListener("pointerdown", function (e) {
    if (e.target === this) closeCommandSearch();
  });
  root.querySelector("#mdAcceptCommand").addEventListener("click", finishActiveCommand);
  root.querySelector("#mdCancelCommand").addEventListener("click", cancelActiveCommand);
  root.querySelectorAll("[data-selfilter]").forEach(function (button) {
    button.addEventListener("click", function () { setSelectionFilter(button.getAttribute("data-selfilter")); });
  });
  root.querySelectorAll("[data-assembly-move]").forEach(function (button) {
    button.addEventListener("click", function () { setAssemblyMoveMode(button.getAttribute("data-assembly-move")); });
  });
  setAssemblyMoveMode(E.assemblyMoveMode);
  root.querySelector("#mdTourClose").addEventListener("click", closeTour);
  root.querySelector("#mdTourMin").addEventListener("click", function () {
    var card = root.querySelector(".md-tour-card");
    var min = card.classList.toggle("md-tour-min");
    E.tour.userCollapsed = min;
    this.querySelector("i").className = min ? "ph ph-caret-up" : "ph ph-caret-down";
    this.setAttribute("aria-label", t(min ? "guideExpand" : "guideCollapse"));
    this.title = this.getAttribute("aria-label");
  });
  installTourDragging();
  root.querySelector("#mdTourBack").addEventListener("click", function () { goTourStep(-1); });
  root.querySelector("#mdTourRestart").addEventListener("click", function () {
    if (!E.tour.active || !E.tour.track) return;
    E.tour.completed[E.tour.step] = false;
    prepareTourStep();
  });
  root.querySelector("#mdTourSkip").addEventListener("click", function () { goTourStep(1, true); });
  // `change`, not `input`: every seek replays the demo, and re-running it for
  // each pixel of a slider drag locked the editor up for seconds at a time.
  root.querySelector("#mdTourRange").addEventListener("change", function () { seekAutomaticTour(+this.value); });
  root.querySelector("#mdTourRange").addEventListener("input", function () {
    var value = +this.value, steps = tourSteps();
    root.querySelector("#mdTourSliderValue").textContent = (value + 1) + " / " + steps.length;
  });
  root.querySelector("#mdTourKeep").addEventListener("click", function () { E.tour.keepResult = true; closeTour(); });
  root.querySelector("#mdTourNext").addEventListener("click", function () {
    if (E.tour.mode === "auto") { if(E.tour.step>=tourSteps().length-1)closeTour();else seekAutomaticTour(E.tour.step+1, true); return; }
    if (E.tour.step >= tourSteps().length - 1) closeTour();
    else goTourStep(1);
  });
  root.querySelector("#mdWelcomeClose").addEventListener("click", closeWelcome);
  root.querySelector("#mdWelcome").addEventListener("pointerdown", function (e) { if (e.target === this) closeWelcome(); });
  root.querySelector("#mdWelcomeNever").addEventListener("change", function () {
    E.welcomeOnOpen = !this.checked;
    saveModelerPrefs();
    var pref = root.querySelector("#mdPrefWelcome");
    if (pref) pref.checked = E.welcomeOnOpen;
  });
  root.querySelector("#mdCoachGo").addEventListener("click", function () {
    var sug = E._coachSug;
    if (sug && sug.run) sug.run();
    syncCoach();
  });
  root.querySelector("#mdCoachHide").addEventListener("click", function () { E.coachDismissed = true; syncCoach(); });
  root.querySelector("#mdCoachNever").addEventListener("click", function () {
    E.coachEnabled = false;
    saveModelerPrefs();
    var pref = root.querySelector("#mdPrefCoach");
    if (pref) pref.checked = false;
    syncCoach();
    flash(t("coachDontShow"));
  });
  root.querySelector("#mdCoachDots").title = t("coachStages");
  root.querySelector("#mdEmptyStart").addEventListener("click", function(event){
    var button=event.target.closest("[data-origin-plane]");
    if(button){var reference=(E.def.references || []).find(function(ref){return ref.id==="plane:"+button.dataset.originPlane;});if(reference)chooseSketchReference(reference);}
  });
  var diagJump = root.querySelector("#mdDiagJump");
  if (diagJump) diagJump.addEventListener("click", function () { focusTreeDiagnostics(); });
  var statusEl = root.querySelector("#mdStatus");
  if (statusEl) statusEl.addEventListener("click", function (event) {
    if(event.target.closest(".md-cancel-exact")){cancelExactModelRebuild();flash("Exact computation cancelled");return;}
    if (event.target.closest(".md-st-rebuild")) focusTreeDiagnostics();
  });
  root.querySelector("#mdSketchThumb").addEventListener("click", function () {
    if (this._sketch) editSketchFromHistory(this._sketch);
  });
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode=b.getAttribute("data-mode");
      // Sketch is a choice against Split, not a sketch that happens to be split
      if(mode==="2d")E.split=false;
      if(mode==="split"){if(isCanonicalAuthoring()&&E.authoring.phase!=="sketch")beginSketchWorkflow();setMode("split");}
      else if(mode==="2d"&&isCanonicalAuthoring()&&E.authoring.phase!=="sketch")beginSketchWorkflow();
      else if(mode==="3d"&&E.authoring.phase==="sketch")finishSketchWorkflow();
      else setMode(mode);
    });
  });
  histPanel = createHistoryPanel(H, {
    title: t("sessionHistory"),
    showBaseline: true,
    compactTargets: true,
    scope: docScope,
    onPick: docPick,
  });
  root.querySelector("#mdHistSession").appendChild(histPanel.el);
  /* Renaming or repricing is a document edit like any other. These handlers
     used to assign straight into E.def, which put them outside the only thing
     that defines dirtiness here: documentDirty() compares the current undo-tree
     document's edit revision against its saved revision, so an edit outside history is
     invisible by construction. A renamed model stayed "clean", closed without
     the unsaved-work prompt, and never reached a draft. `change` fires on blur
     or Enter, not per keystroke, so this is one undo step per rename. */
  bindDocumentTextField("#mdName",function(){return (E.docType === "assembly" && E.assembly ? E.assembly : E.def).name;},
    function(value){(E.docType === "assembly" && E.assembly ? E.assembly : E.def).name=value;},t("renameDocument"));
  /* Description is a named custom property (SOLIDWORKS $PRP:"Description"),
     not a second name: drawings put it in the title block and the BOM's
     Description column, while the name stays the file / part number. */
  bindDocumentTextField("#mdDescription",function(){return documentDescription(E.docType === "assembly" ? E.assembly : E.def);},
    function(value){setDocumentDescription(E.docType === "assembly" ? E.assembly : E.def,value);},t("editDescription"),true);
  root.querySelector("#mdPrice").addEventListener("change", function () {
    if (E.docType !== "part") return;
    var price = +this.value || 0;
    if (E.def.price === price) return;
    pushUndo(t("setPrice"));
    E.def.price = price;
    syncUndoButtons();
  });

  E.cv = root.querySelector("#mdCanvas");
  E.cx = E.cv.getContext("2d");
  var dimensionEditor = root.querySelector("#mdDimEditor");
  dimensionEditor.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  dimensionEditor.addEventListener("submit", function (event) {
    event.preventDefault();
    applyDimensionEditor();
  });
  dimensionEditor.querySelectorAll("[data-dim-cancel]").forEach(function (button) {
    button.addEventListener("click", cancelDimensionEditor);
  });
  dimensionEditor.querySelector("[data-dim-delete]").addEventListener("click", deleteDimensionEditor);
  dimensionEditor.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelDimensionEditor();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyDimensionEditor();
    }
  });
  wireSketch();
  watchSketchSize();
  initPreview();

  // Both persistent desktop panels can give space back to the viewport. The
  // handles remain outside their panel contents so scrolling the tree/history
  // never makes the resize target disappear.
  var leftResizer = root.querySelector("#mdLeftResizer");
  var leftPanel = root.querySelector("#mdLeftPanel");
  var lDrag = null;
  leftResizer.addEventListener("pointerdown", function (e) {
    leftResizer.setPointerCapture(e.pointerId);
    lDrag = { startX: e.clientX, startW: leftPanel.offsetWidth };
  });
  leftResizer.addEventListener("pointermove", function (e) {
    if (!lDrag) return;
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var dx = (e.clientX - lDrag.startX) * direction;
    var newW = Math.max(210, Math.min(lDrag.startW + dx, window.innerWidth - 420));
    leftPanel.style.width = newW + "px";
    sizeSketch();
    drawSketch();
    requestAnimationFrame(layout3DHost);
  });
  leftResizer.addEventListener("pointerup", function () { lDrag = null; });
  leftResizer.addEventListener("pointercancel", function () { lDrag = null; });
  leftResizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var delta = (e.key === "ArrowRight" ? 16 : -16) * direction;
    leftPanel.style.width = Math.max(210, Math.min(leftPanel.offsetWidth + delta, window.innerWidth - 420)) + "px";
    sizeSketch(); drawSketch(); requestAnimationFrame(layout3DHost);
  });

  // Resize logic for right panel
  var resizer = root.querySelector("#mdRightResizer");
  var rightPanel = root.querySelector("#mdRightPanel");
  var rDrag = null;
  resizer.addEventListener("pointerdown", function (e) {
    resizer.setPointerCapture(e.pointerId);
    rDrag = { startX: e.clientX, startW: rightPanel.offsetWidth };
  });
  resizer.addEventListener("pointermove", function (e) {
    if (!rDrag) return;
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var dx = (rDrag.startX - e.clientX) * direction;
    var newW = Math.max(240, Math.min(rDrag.startW + dx, window.innerWidth - 420));
    rightPanel.style.width = newW + "px";
    sizeSketch();
    drawSketch();
    requestAnimationFrame(layout3DHost);
  });
  resizer.addEventListener("pointerup", function () { rDrag = null; });
  resizer.addEventListener("pointercancel", function () { rDrag = null; });
  resizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var delta = (e.key === "ArrowLeft" ? 16 : -16) * direction;
    rightPanel.style.width = Math.max(260, Math.min(rightPanel.offsetWidth + delta, window.innerWidth - 420)) + "px";
    sizeSketch(); drawSketch(); requestAnimationFrame(layout3DHost);
  });

  root.querySelector("#mdContextBtn").addEventListener("change", function(e) {
    if (E.pv) E.pv.inRoom = e.target.checked;
    updatePreview();
    renderPreview();
  });

  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", function (e) { if (E.open) releaseSelectionFilterChord(e); });
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
/* The plane the camera should look along for Normal To. Datum Top/Front/Right
   sketches have no sketch.frame, so fall back to the standard triad — orbitTo
   for Top is nearly degenerate (el≈86° with world-Y up). */
function sketchCameraFrame() {
  var frame = activeSketchFrame();
  if (frame) return frame;
  var sketch = E.def && ensureSketch(E.def);
  return standardPlaneFrame(E.view, sketch && sketch.offset);
}
/* Snap the camera square to the sketch plane (SolidWorks Normal To). Mid-sketch
   we do not steal the view unless asked — tool changes and chrome sync must
   not fight an orbit. Opening a sketch (when the preference is on), picking a
   face, Ctrl+8 and the toolbar command pass force=true. */
function orientModelToView(force) {
  if (!E.pv || E.mode !== "3d") return;
  if (!force && E.modelPlaneActive) return;
  var faceFrame = force && E.authoring?.phase !== "sketch" ? faceSketchAttachment() : null;
  var frame = faceFrame?.frame || sketchCameraFrame();
  // With no selected plane/face, Normal To uses the current principal datum;
  // an arbitrary orbit has no drafting plane, so use the Front datum explicitly.
  if(!frame && force)frame=standardPlaneFrame(['top','front','side'].includes(E.view)?E.view:'front',0);
  if (frame && E.pv.lookAtFrame) { E.pv.lookAtFrame(frame); return; }
  if (E.view === "top") E.pv.orbitTo(0, 1.5);
  else if (E.view === "front") E.pv.orbitTo(0, 0.05);
  else E.pv.orbitTo(Math.PI / 2, 0.05);
}
/* Top / Front / Right are world views, never aliases for Normal To.  The
   latter deliberately follows a selected planar face; sharing that path made
   Front keep looking down at a selected pocket floor while its button and
   measurement axes said X/Y. */
function orientStandardView(view) {
  if (!E.pv || E.mode !== "3d") return;
  var presetId=view==="side" ? "right" : view;
  var preset=VIEW_PRESETS.find(function(item){return item.id===presetId;});
  if (!preset || preset.az==null) return;
  E.pv.orbitTo(preset.az,preset.el);
}
function captureSketchCameraPose() {
  if (!E.pv || E.sketchCameraReturnPose) return;
  if (E.pv.place) E.pv.place();
  E.sketchCameraReturnPose = {
    az: E.pv.az, el: E.pv.el, dist: E.pv.dist,
    target: { x:E.pv.target.x, y:E.pv.target.y, z:E.pv.target.z },
  };
}
function restoreSketchCameraPose() {
  var pose = E.sketchCameraReturnPose;
  E.sketchCameraReturnPose = null;
  if (!pose || !E.pv) return false;
  E.pv.clearFixedFrame(false);
  E.pv.az = pose.az; E.pv.el = pose.el; E.pv.dist = pose.dist;
  E.pv.target.set(pose.target.x, pose.target.y, pose.target.z);
  E.pv.render();
  return true;
}
function cadSketchSnapshot() {
  var sketch = E.def && ensureSketch(E.def);
  var pts = (sketch && sketch.points) || [];
  var xs = pts.map(function (p) { return Number(p.x) || 0; });
  var ys = pts.map(function (p) { return Number(p.y) || 0; });
  var cam = E.pv && E.pv.cam && E.pv.cam.position;
  var previewRect = null;
  if (E.drag && E._mouse && (E.drag.mode === "draw" || E.drag.mode === "srect") && (E.tool === "rect" || E.tool === "srect")) {
    previewRect = [
      [E.drag.u,E.drag.v], [E._mouse.u,E.drag.v],
      [E._mouse.u,E._mouse.v], [E.drag.u,E._mouse.v],
    ].map(function (q) { var p=toPx(q[0],q[1]);return {x:p.x,y:p.y}; });
  }
  return {
    plane: sketch && sketch.plane,
    tool: E.tool,
    arcMode: E.arcTangent ? "tangent" : E.arcThreePoint ? "three" : (E.tool === "sarc" ? "center" : null),
    phase: E.authoring && E.authoring.phase,
    autoOrient: !!E.sketchNormalTo,
    hasFixedFrame: !!(E.pv && E.pv.fixedFrame),
    cam: cam ? { x: cam.x, y: cam.y, z: cam.z } : null,
    viewPose: E.pv ? {
      az:E.pv.az, el:E.pv.el, dist:E.pv.dist,
      target:{x:E.pv.target.x,y:E.pv.target.y,z:E.pv.target.z},
    } : null,
    pointCount: pts.length,
    screenPoints: pts.map(function (q) { var p=toPx(q.x,q.y);return {x:p.x,y:p.y}; }),
    entityTypes: ((sketch && sketch.entities) || []).map(function (entity) { return entity.type; }),
    constructionFlags: ((sketch && sketch.entities) || []).map(function (entity) { return !!entity.construction; }),
    constraintTypes: ((sketch && sketch.constraints) || []).map(function (constraint) { return constraint.type; }),
    points: pts.map(function (q) { return { id: q.id, x: q.x, y: q.y }; }),
    status: E.solveInfo && E.solveInfo.status,
    degreesOfFreedom: E.solveInfo ? E.solveInfo.degreesOfFreedom : null,
    previewRect: previewRect,
    width: xs.length ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : 0,
    height: ys.length ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : 0,
  };
}
if (typeof window !== "undefined") window.cadSketchSnapshot = cadSketchSnapshot;
function syncNormalToControls() {
  if (!root) return;
  var box = root.querySelector("#mdNormalTo");
  if (box) box.checked = !!E.sketchNormalTo;
}
function setSketchNormalTo(on) {
  E.sketchNormalTo = !!on;
  saveModelerPrefs();
  syncNormalToControls();
  syncModelerMobile();
}
function syncModelPlane() {
  if (!root) return;
  var active = E.mode === "3d" && E.modelPlaneActive;
  root.classList.toggle("md-model-sketching", active);
  /* A sketch laid over the model puts sketch geometry in front of the pointer
     without changing E.mode, so this — not setMode() — is where the Sketch
     filter becomes reachable and unreachable again. */
  syncSelectionFilters();
  var finish = root.querySelector("#mdFinishPlane");
  if (finish) finish.hidden = !active;
  var chip = root.querySelector("#mdSketchPlaneChip");
  if (chip) {
    chip.hidden = !active || E.docType !== "part";
    var label = root.querySelector("#mdSketchPlaneLabel");
    if (label && active) label.textContent = t("sketchingOn") + " " + sketchPlaneCaption();
  }
}
function finishModelPlane() {
  E.modelPlaneActive = false;
  E.wallPts = null; E.poly = null; E.arcPts = null; E.drag = null;
  setTool("select", true);
  if (!restoreSketchCameraPose() && E.pv) E.pv.clearFixedFrame(false);
  syncModelPlane();
  updatePreview();
}

function isCanonicalAuthoring() {
  return E.docType === "part" && E.def && E.def.metadata && E.def.metadata.authoringSystem === "parametric-v1";
}

function referencePlaneView(reference) {
  if (!reference) return "top";
  if (reference.id === "plane:front") return "front";
  if (reference.id === "plane:right") return "side";
  if (reference.id === "plane:top") return "top";
  var normal=reference.normal || reference.descriptor && reference.descriptor.normal || {x:0,y:1,z:0};
  var ax=Math.abs(normal.x||0),ay=Math.abs(normal.y||0),az=Math.abs(normal.z||0);
  return ay>=ax&&ay>=az ? "top" : az>=ax ? "front" : "side";
}

function referenceLabel(reference) {
  return reference && (reference.name || reference.semantic || reference.id || reference.persistentId) || "Reference";
}

function cancelReferenceSelection() {
  var picker=root && root.querySelector("#mdReferencePicker");
  if(picker)picker.hidden=true;
  E.facePick=null;syncFacePrompt();
  if(E.authoring && E.authoring.resumePhase==="sketch"){
    E.authoring.phase="sketch";E.authoring.resumePhase=null;E.authoring.workflowFocus="sketch";
    syncAuthoringWorkflow();
    return;
  }
  E.authoring.phase="model";E.authoring.featureType=null;E.authoring.workflowFocus="context";
  syncAuthoringWorkflow();
}

function chooseSketchReference(reference, preferredTool) {
  if(!reference)return;
  var stayIn3D = E.mode === "3d";
  var picker=root.querySelector("#mdReferencePicker");if(picker)picker.hidden=true;
  E.facePick=null;syncFacePrompt();
  pushUndo(t("newSketch"));
  var sketch=ensureSketch(E.def), isEmpty=!(sketch.entities || []).length && !(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;});
  var topology=reference.type==="topology-reference" || !!reference.persistentId;
  if(topology) {
    E.topologySelection=[cloneData(reference)];
    if(!attachSketchToSelectedFace(true,false)){H.discard();flash(t("needPlanarOrAnalytic"));cancelReferenceSelection();return;}
    sketch=ensureSketch(E.def);
  } else {
    var view=referencePlaneView(reference);
    if(!isEmpty)sketch=addSketch(E.def,view,0,referenceLabel(reference)+" sketch");
    sketch.plane=view;sketch.offset=0;sketch.referenceId=reference.id;sketch.name=referenceLabel(reference)+" sketch";
    delete sketch.support;delete sketch.supportOffset;
    if(!["plane:top","plane:front","plane:right"].includes(reference.id)){
      sketch.frame=frameFromPlane(reference.origin || {x:0,y:0,z:0},reference.normal || {x:0,y:1,z:0});
      sketch.frameSpace="local";
    } else {delete sketch.frame;delete sketch.frameSpace;}
    E.def.activeSketch=sketch.id;E.view=view;
  }
  recordSketchInHistory(E.def,sketch);
  E.def.metadata ||= {};E.def.metadata.authoringSystem="parametric-v1";
  E.lastSketchReferenceId=topology ? (reference.persistentId || sketch.referenceId) : reference.id;
  E.authoring={phase:"sketch",referenceId:sketch.referenceId,sketchId:sketch.id,featureType:null,sketchSelection:[sketch.id],preferredTool:preferredTool || null,workflowFocus:"sketch",resumePhase:null};
  /* Opening a sketch from the 3D model keeps you IN the 3D model: the sheet is
     laid over the solid rather than dropping you into a flat 2D view. Coming
     from 2D, stay in 2D. The automatic-orientation preference then looks square
     at the plane so a screen square is a plane square — same as SolidWorks. A
     face pick always snaps once, even if that preference is off: you asked to
     draw on that face, and it does not write the preference. Orbit afterwards
     is still allowed; the sheet follows the camera. */
  E.ssel=[];E.sel=null;
  if(stayIn3D){E.modelPlaneActive=true;syncModelPlane();}else setMode("2d");
  setCommandTab("sketch");setTab("sketch");
  if(preferredTool)setTool(preferredTool,true);else setTool("select",true);
  if(stayIn3D && (E.sketchNormalTo || topology)){
    captureSketchCameraPose();
    orientModelToView(true);
  }
  refreshAll();
  if(!stayIn3D || E.sketchNormalTo || topology)requestAnimationFrame(fitSketch);else drawSketch();
}

function selectedSketchableFace() {
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  return face && faceSketchAttachment() ? face : null;
}

function resumeSketchSession(preferredTool) {
  var picker=root && root.querySelector("#mdReferencePicker");
  if(picker)picker.hidden=true;
  E.authoring.phase="sketch";
  E.authoring.workflowFocus="sketch";
  E.authoring.resumePhase=null;
  setCommandTab("sketch");
  setTab("sketch");
  if(E.mode==="3d"){
    E.modelPlaneActive=true;
    syncModelPlane();
    if(E.sketchNormalTo){captureSketchCameraPose();orientModelToView(true);}
  }
  else if(E.mode!=="2d")setMode("2d");
  if(preferredTool)setTool(preferredTool,true);
  syncAuthoringWorkflow();
}

function showReferencePicker(preferredTool) {
  var picker=root && root.querySelector("#mdReferencePicker"),host=root && root.querySelector("#mdReferenceOptions");
  if(!picker||!host)return;
  E.facePick=null;syncFacePrompt();
  if(E.authoring.phase==="sketch")E.authoring.resumePhase="sketch";
  E.authoring.phase="reference";E.authoring.workflowFocus="reference";
  E.authoring.preferredTool=typeof preferredTool==="string" ? preferredTool : null;
  host.innerHTML="";
  var lastId=E.lastSketchReferenceId;
  var suggestedId=lastId || "plane:top";
  (E.def.references || []).filter(function(reference){return reference.type==="plane";}).forEach(function(reference){
    var suggested=reference.id===suggestedId;
    var hint=suggested ? (lastId===reference.id ? t("wfLastUsed") : t("wfSuggested"))+" · "+reference.id : reference.id;
    var button=el("button","md-reference-option"+(suggested?" selected":""),'<i class="ph ph-square-half"></i><span><b>'+referenceLabel(reference)+'</b><small>'+hint+'</small></span>');
    button.addEventListener("click",function(){chooseSketchReference(reference,E.authoring.preferredTool);});host.appendChild(button);
  });
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  if(face){var faceButton=el("button","md-reference-option selected",'<i class="ph ph-selection"></i><span><b>'+t("selectedFace")+'</b><small>'+(face.semantic || face.persistentId)+'</small></span>');faceButton.addEventListener("click",function(){chooseSketchReference(face,E.authoring.preferredTool);});host.prepend(faceButton);}
  picker.hidden=false;syncAuthoringWorkflow();
}

/* ---- "click the face you mean" ------------------------------------------
   A new sketch on a part that already has a solid does not open a dialog: the
   viewport becomes the picker. The model stays live under the prompt bar, the
   hover highlight already shows which face is under the cursor, and the click
   that selects the face is the same click that opens the sketch on it. An
   drawing-tool shortcut on an empty document sketches on the default plane;
   explicit New sketch opens the datum-plane picker before creating a sketch. */
function beginFacePick(preferredTool) {
  if(E.authoring.phase==="sketch")E.authoring.resumePhase="sketch";
  E.authoring.phase="reference";E.authoring.workflowFocus="reference";
  E.authoring.preferredTool=typeof preferredTool==="string" ? preferredTool : null;
  E.facePick={tool:E.authoring.preferredTool};
  E.topologySelection=[];
  // commandSelectionPrefer() forces "face" while E.facePick is set; the user's
  // own filter is left alone so it is still theirs when the pick is over.
  if(E.mode!=="3d")setMode("3d");
  /* The sketch sheet is a canvas laid over the model — leave it up and it eats
     the very click we are asking for. */
  if(E.modelPlaneActive){E.modelPlaneActive=false;syncModelPlane();}
  syncFacePrompt();
  flash(t("pickFaceTitle"));
  syncAuthoringWorkflow();
  refreshAll();
}
function syncFacePrompt() {
  var prompt=root && root.querySelector("#mdFacePrompt");
  if(prompt)prompt.hidden=!E.facePick;
  var canvas=root && root.querySelector("#mdPrev");
  if(canvas)canvas.style.cursor=E.facePick ? "crosshair" : "";
}
function cancelFacePick(openPicker) {
  var tool=E.facePick && E.facePick.tool || null;
  E.facePick=null;
  syncFacePrompt();
  if(openPicker){showReferencePicker(tool);return;}
  cancelReferenceSelection();
  refreshAll();
}
/* The click that lands on a face while the prompt is up. Returns true when it
   consumed the pick, so the normal selection path stops there. */
function facePickFromViewport(reference) {
  if(!E.facePick)return false;
  if(!reference || reference.kind!=="face"){refreshAll();return true;}
  E.topologySelection=[cloneData(reference)];
  if(!faceSketchAttachment()){flash(t("needPlanarOrAnalytic"));refreshAll();return true;}
  var tool=E.facePick.tool;
  E.facePick=null;
  syncFacePrompt();
  chooseSketchReference(E.topologySelection[0], tool);
  return true;
}
function beginSketchWorkflow(preferredTool, options) {
  if(E.docType!=="part")return;
  options=options || {};
  var forceNew=!!options.forceNew;
  if(shouldResumeSketchSession(E.authoring && E.authoring.phase, forceNew)){
    resumeSketchSession(typeof preferredTool==="string" ? preferredTool : null);
    return;
  }
  var face=selectedSketchableFace();
  var hasSolids=activeParts(E.def).length>0;
  var start=sketchStartMode({
    hasSketchableFace:!!face,
    hasSolids:hasSolids,
    wantsPlanePicker:!!options.planePicker || (forceNew&&!hasSolids),
  });
  if(start==="selected-face"&&shouldSkipReferencePicker(face)){
    chooseSketchReference(face, typeof preferredTool==="string" ? preferredTool : null);
    return;
  }
  if(start==="pick-face"){beginFacePick(preferredTool);return;}
  if(start==="default-plane"){
    startSketchOnDefaultPlane(typeof preferredTool==="string" ? preferredTool : "srect");
    return;
  }
  showReferencePicker(preferredTool);
}

function finishSketchWorkflow() {
  if(E.docType!=="part")return;
  if(!E.authoring || E.authoring.phase!=="sketch"){
    beginSketchWorkflow(null,{forceNew:true});
    flash(t("chooseReferenceFirst"));
    return;
  }
  var sketch=ensureSketch(E.def),run=solveSketch(sketch);
  /* Finishing is no longer refused. Blocking it taught people to delete
     dimensions until the message stopped, which REDUCES how well defined the
     sketch is — the opposite of what the block was protecting.
   *
     The two states it used to lump together are not the same thing. A sketch
     is "over-constrained" when it solved perfectly and merely carries a
     redundant dimension (see solveSketch: converged, zero DOF, rank short of
     the residual count) — that geometry is correct and there was never a
     reason to hold the solid hostage to it. "Conflicting" means the solver did
     not converge, so the points are wherever it gave up; that one finishes too,
     but it is stated plainly and the rebuild raises an error against the sketch
     node, which opens the diagnostics panel and fails the features downstream.
     Nothing here claims the geometry is right — it says what happened and lets
     the rest of the pipeline report on it. */
  if(run.status==="conflicting"){
    setTab("sketch");
    flash(t("sketchConflictWarn"));
  } else if(run.status==="over-constrained"){
    flash(t("sketchRedundantWarn"));
  }
  var consumed=consumedSketchIds(E.def).has(sketch.id);
  recordSketchInHistory(E.def,sketch);
  if(consumed && run.status!=="conflicting")rebindReplacedSketchProfiles(E.def,sketch.id);
  E.authoring.phase="model";E.authoring.sketchId=sketch.id;E.authoring.referenceId=sketch.referenceId;E.authoring.sketchSelection=[sketch.id];
  E.authoring.featureType=null;E.authoring.workflowFocus=consumed ? null : "feature";E.authoring.resumePhase=null;
  E.modelPlaneActive=false;setMode("3d");restoreSketchCameraPose();setCommandTab("features");setTab("parts");
  if(run.status!=="conflicting" && run.status!=="over-constrained"){
    flash(run.degreesOfFreedom ? t("sketchSavedDof") + " · " + run.degreesOfFreedom + " " + t("wfDof") : "✓ " + t("sketchFullySaved"));
  }
  refreshAll();
  if(consumed && isCanonicalAuthoring()){
    // Exact generated face names cannot be checked by the preliminary rebuild.
    // Publish the full dependent history when an existing sketch is finished.
    void regenerateExactModel("force");
  } else if(!consumed) offerProfileFeatures();
  syncAuthoringWorkflow();
}

function currentWorkflowStep() {
  var history=(E.def && E.def.history) || [];
  var last=history.length ? history[history.length-1] : null;
  return resolveWorkflowStep({
    phase:E.authoring && E.authoring.phase,
    featureType:E.authoring && E.authoring.featureType,
    workflowFocus:history.length ? E.authoring && E.authoring.workflowFocus : "context",
    lastHistoryKind:last && last.kind,
    hasClosedProfile:!!closedSketchProfile(),
    hasFeatureHistory:history.some(function(entry){return entry.kind==="feature";}),
    hasSketchHistory:history.some(function(entry){return entry.kind==="sketch";}),
  });
}

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

function activateWorkflowStep(step) {
  if(E.docType==="assembly"){
    var action=ASSEMBLY_WORKFLOW_ACTION[step];
    if(action){action();refreshAll();}
    return;
  }
  if(E.docType!=="part")return;
  if(step==="context"){
    E.authoring.workflowFocus="context";
    if(E.authoring.phase==="reference")cancelReferenceSelection();
    setTab("parts");
    syncAuthoringWorkflow();
    return;
  }
  if(step==="reference"){beginSketchWorkflow(null,{forceNew:true,planePicker:true});return;}
  if(step==="sketch"){
    if(E.authoring && E.authoring.phase==="sketch")resumeSketchSession();
    else beginSketchWorkflow();
    return;
  }
  if(step==="feature"){
    E.authoring.workflowFocus="feature";
    if(E.authoring.featureType){setCommandTab("features");syncAuthoringWorkflow();return;}
    if(closedSketchProfile()){
      if(E.authoring.phase==="sketch")finishSketchWorkflow();
      else{setCommandTab("features");offerProfileFeatures();}
      return;
    }
    setCommandTab("features");
    if(E.authoring.phase==="sketch")flash(t("profileEmpty"));
    syncAuthoringWorkflow();
    return;
  }
  if(step==="history"){
    E.authoring.workflowFocus="history";
    setTab("parts");
    setTab("hist");
    syncAuthoringWorkflow();
  }
}

var PART_WORKFLOW = ["wfPart", "wfReference", "wfSketch", "wfFeature", "wfHistory"];
/* An assembly is not sketched into being — it is filled, anchored, related,
   checked and saved. Same five slots, so the bar keeps its shape, but naming
   them after part authoring left every backend improvement in this editor
   sitting behind a road sign for somewhere else. */
var ASSEMBLY_WORKFLOW = ["wfInsert", "wfGround", "wfMate", "wfCheck", "wfSave"];

function assemblyWorkflowState() {
  var components = (E.assembly && E.assembly.components) || [];
  var grounded = components.filter(function (component) { return component.grounded; }).length;
  var mates = assemblyMateCount(E.assembly);
  var broken = brokenMateCount();
  var clashes = (E.interferenceHits || []).length;
  var dirty = documentDirty();
  var workflow = resolveAssemblyWorkflow({
    components: components.length,
    hasLibrary: modelLibraryCache.length > 0,
    grounded: grounded,
    mates: mates,
    broken: broken,
    checked: !!E.interferenceChecked,
    dirty: dirty,
  });
  return {
    components: components.length, grounded: grounded, mates: mates, broken: broken,
    clashes: clashes, checked: !!E.interferenceChecked,
    phase: workflow.phase, stage: workflow.stage, active: workflow.active, complete: workflow.complete,
    details: [
      components.length ? countLabel(components.length, "assemblyComponentOne", "assemblyComponents") : t("wfNoComponents"),
      grounded ? grounded + " " + t("wfAnchored") : t("wfNoAnchor"),
      mates ? countLabel(mates, "matesCountOne", "matesCount") : t("wfNoMates"),
      broken ? countLabel(broken, "assemblyIssueOne", "assemblyIssues")
        : clashes ? clashes + " " + t("wfCheckClash")
        : E.interferenceChecked ? t("wfNoInterference") : t("wfCheckUnrun"),
      dirty ? t("dirtySave") : t("savedAssembly"),
    ],
  };
}

/* Sketch / Shape / Finish are what a part's panes hold. An assembly's hold the
   component, where it sits, and what relates it — so they say so, and the
   sketch pane, which has nothing to show here, steps out of the strip. */
var ASSEMBLY_TAB_LABELS = { shape: "tabPlacement", look: "tabComponent", ops: "tabMates" };
var PART_TAB_LABELS = { shape: "tabShapeShort", look: "tabLookShort", ops: "tabOpsShort" };

function syncInspectorTabLabels() {
  if (!root) return;
  var assembly = E.docType === "assembly";
  var labels = assembly ? ASSEMBLY_TAB_LABELS : PART_TAB_LABELS;
  Object.keys(labels).forEach(function (id) {
    var button = root.querySelector('[data-tab="' + id + '"]');
    if (!button) return;
    var caption = button.querySelector("span");
    if (caption) caption.textContent = t(labels[id]);
    var full = assembly ? t(labels[id]) : t(id === "shape" ? "tabShape" : id === "look" ? "tabLook" : "tabOps");
    button.title = full;
    button.setAttribute("aria-label", full);
  });
}

function syncAssemblyWorkflow() {
  var state = assemblyWorkflowState();
  root.querySelectorAll("[data-workflow-step]").forEach(function (button, index) {
    var heading = button.querySelector("b"), detail = button.querySelector("small");
    if (heading) heading.textContent = t(ASSEMBLY_WORKFLOW[index] || PART_WORKFLOW[index]);
    if (detail) detail.textContent = state.details[index] || "";
    button.setAttribute("aria-label", [heading && heading.textContent, detail && detail.textContent].filter(Boolean).join(" · "));
    button.classList.toggle("active", index === state.active);
    button.classList.toggle("complete", index < state.active || (index === state.active && state.complete));
    if (index === state.active) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  root.classList.remove("md-authoring-sketch");
  syncCoach();
}

function syncAuthoringWorkflow() {
  if(!root)return;
  if(E.docType==="assembly"){syncAssemblyWorkflow();return;}
  if(!E.def)return;
  root.querySelectorAll("[data-workflow-step]").forEach(function(button,index){
    var heading=button.querySelector("b");
    if(heading)heading.textContent=t(PART_WORKFLOW[index]);
  });
  var phase=E.authoring && E.authoring.phase || "model",steps=["context","reference","sketch","feature","history"];
  var active=steps.indexOf(currentWorkflowStep());
  if(active<0)active=0;
  root.querySelectorAll("[data-workflow-step]").forEach(function(button,index){
    button.classList.toggle("active",index===active);
    button.classList.toggle("complete",index<active);
    if(index===active)button.setAttribute("aria-current","step");
    else button.removeAttribute("aria-current");
  });
  var units=E.def.context && E.def.context.units || {length:getDomainUnit("details")};
  var context=root.querySelector("#mdWorkflowContext");if(context)context.textContent=units.length+" · "+(E.def.context && E.def.context.activeCoordinateSystemId || "origin");
  var sketch=ensureSketch(E.def),hasRecordedSketch=(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;}),reference=root.querySelector("#mdWorkflowReference");
  if(reference)reference.textContent=(hasRecordedSketch || sketch.referenceId || sketch.support) && phase!=="reference" ? sketchPlaneCaption() : t("wfChoosePlane");
  var sketchText=root.querySelector("#mdWorkflowSketch");if(sketchText){var info=E._solveSketchId===sketch.id&&E.solveInfo ? E.solveInfo : solveSketch(sketch);if(E._solveSketchId!==sketch.id){E.solveInfo=info;E._solveSketchId=sketch.id;}sketchText.textContent=(sketch.entities || []).length ? (info.status==="fully-constrained"?t("wfFullyDefined"):info.status==="conflicting"?t("dofConflict"):info.status==="over-constrained"?t("dofOver"):((sketch.constraints || []).length?t("wfPartialDefined")+" · ":t("wfUnderDefined")+" · ")+info.degreesOfFreedom+" "+t("wfDof")) : t("wfCreateProfile");}
  var feature=root.querySelector("#mdWorkflowFeature");if(feature)feature.textContent=E.authoring && E.authoring.featureType ? featureTypeLabel(E.authoring.featureType) : (closedSketchProfile() ? t("wfReadyExtrude") : t("wfTurnIntent"));
  var history=root.querySelector("#mdWorkflowHistory");if(history)history.textContent=(E.def.history || []).length+" "+t("wfEditableSteps");
  root.querySelectorAll("[data-workflow-step]").forEach(function(button){
    button.setAttribute("aria-label", Array.from(button.querySelectorAll("b,small")).map(function(label){return label.textContent;}).filter(Boolean).join(" · "));
  });
  root.classList.toggle("md-authoring-sketch",phase==="sketch");
  syncCoach();
}
function modelLengthUnit() {
  var document=E.docType==="assembly"?E.assembly:E.def;
  return documentLengthUnit(document?.context?.units?.length);
}
function setModelLengthUnit(value) {
  var document=E.docType==="assembly"?E.assembly:E.def;
  if(!document)return false;
  var unit=documentLengthUnit(value);if(unit===modelLengthUnit())return false;
  pushUndo(t("partUnits"));
  document.context ||= {};document.context.units ||= {};document.context.units.length=unit;
  if(document.documentProperties)document.documentProperties.lengthUnit=unit;
  syncHead();refreshAll();return true;
}
function modelLengthText(cm, digits=10) {
  return formatDocumentLength(cm, modelLengthUnit(), digits);
}
function modelAreaText(cm2) {
  var value=cm2*Math.pow(lengthToDocument(1,modelLengthUnit()),2);
  return String(Number(value.toPrecision(10)))+' '+modelLengthUnit()+'²';
}
function faceSketchAttachment(reference, exact) {
  var support=reference || (E.topologySelection || []).find(function(item){return item.kind==="face";});
  if (!support) return null;
  if(!exact && isCanonicalAuthoring() && E.brepRun){
    var supportPart=(E.def?.parts || []).find(function(part){return part.featureId===support.ownerFeatureId || part.id===support.partId;});
    var supportHead=cutTargetFeatureId(supportPart),supportResult=E.brepRun.results.get(supportHead);
    if(supportResult && supportResult.topology){
      var supportDescriptor=cloneData(support.descriptor || {});delete supportDescriptor.semantic;
      var supportResolution=resolveTopologyReference({kind:"face",descriptor:supportDescriptor},createTopologyRegistry(supportResult.topology),{threshold:.05});
      if(supportResolution.topology){
        support=topologyReferenceFromEntry(supportResolution.topology);
        // A surviving face can retain its original name while a pocket changes
        // its position. Depend on the displayed body, not that original feature.
        support.ownerFeatureId=supportHead;
      }
    }
  }
  if(support.descriptor && support.descriptor.surface!=="plane")return supportsSurfaceUV(support.descriptor)?{support:cloneData(support),surface:true}:null;
  var descriptor=support.descriptor || {}, normal=descriptor.normal || {};
  var ax=Math.abs(normal.x || 0), ay=Math.abs(normal.y || 0), az=Math.abs(normal.z || 0), dominant=Math.max(ax,ay,az);
  if (dominant<.5) return null;
  var plane=ay>=ax && ay>=az ? "top" : az>=ax ? "front" : "side";
  var origin=faceFrameOrigin(descriptor,"bounds-center");
  return {support:cloneData(support),plane:plane,offset:0,frame:frameFromPlane(origin,normal),frameAnchor:"bounds-center"};
}
function attachSketchToSelectedFace(forceNew, recordUndo) {
  if (!E.def) return false;
  var attachment=faceSketchAttachment();
  if (!attachment) return false;
  var sketch=ensureSketch(E.def);
  if(attachment.surface){if(recordUndo!==false)pushUndo(t("newSketch"));var surfaceSketch=createSurfaceSketch(attachment.support,{id:"sketch:surface:"+uid(),name:(attachment.support.semantic || "Surface")+" UV sketch"});E.def.sketches=(E.def.sketches || []).concat([surfaceSketch]);E.def.activeSketch=surfaceSketch.id;E.view="front";E.ssel=[];flash("✓ "+t("surfaceUnwrapped"));return true;}
  var same=sketch.support && sketch.support.persistentId===attachment.support.persistentId;
  if (same && !forceNew) return true;
  // Explicit reference selection already owns the outer sketch transaction.
  if (recordUndo!==false) pushUndo(t("newSketch"));
  if ((sketch.entities || []).length || sketch.support) sketch=addSketch(E.def,attachment.plane,attachment.offset,(attachment.support.semantic || "Face")+" sketch",attachment.support);
  else {
    sketch.plane=attachment.plane;
    sketch.offset=attachment.offset;
    sketch.name=(attachment.support.semantic || "Face")+" sketch";
    sketch.referenceId=attachment.support.persistentId;
    sketch.support=attachment.support;
  }
  sketch.frame=attachment.frame;
  sketch.frameSpace="local";
  sketch.frameAnchor=attachment.frameAnchor;
  sketch.supportOffset=0;
  E.def.activeSketch=sketch.id;
  E.view=attachment.plane;
  E.ssel=[];
  return true;
}
function setTool(id, keepPlaneState) {
  if (E.dimEditor && !applyDimensionEditor()) return;
  E.touchPrecision = null;
  if (E.mode === "drawing") {
    drawingSheet().setTool(id);
    E.tool = drawingSheet().getTool ? drawingSheet().getTool() : id;
    syncTools();
    syncHint();
    return;
  }
  if (id === "paint" || id === "note") {
    E.tool = id;
    if (E.mode !== "3d") setMode("3d");
    E.modelPlaneActive = false;
    if (id === "note" && !E.noteMode) E.noteMode = "callout";
    syncModelPlane();
    syncTools();
    syncHint();
    if (E.pv) {
      syncNotesAndMarkups(E.pv);
      E.pv.render();
    }
    return;
  }
  if(E.mode !== "drawing" && isCanonicalAuthoring() && !E.tour.active) {
    if(SKETCH_TOOLS.includes(id) && E.authoring.phase!=="sketch") {
      // Trim, Dimension, Extend, Offset and the constraint tool edit geometry;
      // handing them a brand-new empty sketch is a dead end that looks like a
      // mode change. Say what is missing instead.
      if(!SKETCH_DRAW_TOOLS.includes(id)) { flash(t("needSketchForTool")); return; }
      beginSketchWorkflow(id); return;
    }
    if(["rect","circle","sph","poly","rev","cut","cutc"].includes(id)) {
      var replacement=id==="rect"?"srect":id==="circle"?"scirc":null;
      if(replacement)beginSketchWorkflow(replacement);else flash(t("needSketchThenFeature"));
      return;
    }
  }
  var opensSketchPlane = MODEL_PLANE_TOOLS.includes(id);
  var openingModelPlane = E.mode === "3d" && !E.modelPlaneActive && !keepPlaneState && opensSketchPlane;
  /* With a sketch session already open, re-arming the surface resumes THAT
     sketch. Attaching to whatever face was still picked started a stray face
     sketch every time a drawing tool was chosen after leaving the surface. */
  var sessionOpen = E.authoring && E.authoring.phase === "sketch";
  var attachedToFace = openingModelPlane && !sessionOpen ? attachSketchToSelectedFace() : false;
  if (E.wallPts && id !== E.tool) finishWallChain(false);
  if (id !== E.tool) E.dynInput = null;
  if (id !== E.tool) { E.dimPick = []; E.dimSel = null; }
  E.tool = id;
  /* Arms the sheet, never disarms it: picking Select inside a sketch you are
     already drawing means "select in this sketch", not "leave it". */
  if (E.mode === "3d" && !keepPlaneState && opensSketchPlane) E.modelPlaneActive = true;
  E.poly = null;
  if (id !== "sarc") E.arcPts = null;
  if (id !== "sslot") E.slotPts = null;
  if (id !== "sell") E.ellPts = null;
  if(id!=="sspline")E.splinePts=null;

  // a tool that acts on a picked entity keeps the selection; a drawing tool
  // starts clean so the constraint palette is not offering stale pairs
  if (["wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline", "rect", "circle", "sph", "poly", "rev", "cut", "cutc"].indexOf(id) >= 0) { E.ssel = []; E.sel = null; }
  // The line tool used to snap the view back to top, from when it drew
  // floor-plan walls. It is the generic sketch-line tool now and has to work on
  // whichever plane you are sketching on — forcing the view silently moved your
  // geometry into the top sketch.
  // Revolve is different: its profile is a height profile revolved about the
  // vertical axis, so it genuinely needs an elevation view.
  if (id === "rev" && E.view === "top") setView("front");
  syncModelPlane();
  syncTools();
  // Picking a face is an explicit statement about where you want to draw, so
  // the camera swings square onto that face even when automatic orientation is
  // off. A new sketch overlay with the preference on does the same for datum
  // planes. Neither path writes the preference.
  if (attachedToFace || (openingModelPlane && E.sketchNormalTo)) {
    captureSketchCameraPose();
    orientModelToView(true);
  }
  /* Professional selection-first workflow: geometry picked precisely in the
     tree or inspector is already a complete Smart Dimension request. Do not
     make the user find and pick the same entity again on a crowded canvas. */
  if (id === "dim" && openSelectedSmartDimension()) { updateTourProgress(); return; }
  if (attachedToFace) refreshAll(); else drawSketch();
  if (openingModelPlane) requestAnimationFrame(fitSketch);
  updateTourProgress();
}
/* Views that only turn the camera. Isometric, Back, Left and Bottom have no sketch
   plane of their own, so they must not touch E.view: that swaps the active
   sketch, and an Extrude Cut taken right after would cut from the wrong one. */
var CAMERA_ONLY_VIEWS = ["iso", "back", "left", "bottom"];
function setView(id) {
  // A feature owns its profile while the user turns the model to pick limits.
  // Adopting another plane's sketch here changes both preview and commit inputs.
  if (CAMERA_ONLY_VIEWS.indexOf(id) >= 0 || (E.authoring && E.authoring.featureType)
      || (E.mode === "3d" && E.modelPlaneActive && E.authoring?.phase === "sketch")) {
    var cameraId = id === "side" ? "right" : id;
    var cameraPreset = VIEW_PRESETS.find(function (preset) { return preset.id === cameraId; });
    if (E.pv && cameraPreset) {
      if (E.pv.clearFixedFrame) E.pv.clearFixedFrame(false);
      E.pv.orbitTo(cameraPreset.az, cameraPreset.el);
    }
    drawSketch();
    return;
  }
  E.view = id;
  E.poly = null;
  E.arcPts = null;
  E.dimPick = [];
  E.dimSel = null;
  // Changing plane changes which sketch is editable, which every panel shows —
  // redrawing the canvas alone would leave the lists describing the old plane.
  var swapped = E.mode === "drawing" ? false : adoptSketchForView();
  if (swapped) pruneAbandonedSketches(E.def);
  if (E.mode === "3d") orientStandardView(id);
  syncTools();
  if (swapped) refreshAll(); else drawSketch();
  if (E.mode === "3d" && E.modelPlaneActive) fitSketch();
}
function zoomBy(dir) {
  if(E.modelPlaneActive && sketchProjection() && E.pv){
    if(dir==='fit')fitSketch();else{E.pv.zoomBy(dir==='in'?1/1.25:1.25);invalidateSketchProjection();drawSketch();}
    syncStatus();return;
  }
  if (E.mode === "3d" && !E.modelPlaneActive) {
    if (dir === "fit") fitPreview();
    else if (E.pv) E.pv.zoomBy(dir === "in" ? 1/1.25 : 1.25);
    return;
  }
  if (dir === "fit") { fitSketch(); return; }
  var k = dir === "in" ? 1.25 : 1 / 1.25;
  var W = E.cw / 2, Hh = E.ch / 2;
  var ns = clamp(E.scl * k, SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
  E.ox = W - ((W - E.ox) / E.scl) * ns;
  E.oy = Hh - ((Hh - E.oy) / E.scl) * ns;
  E.scl = ns;
  drawSketch();
  syncStatus();
}
/* Frame the whole model in the sketch the way the 3D view frames it — without
   this the only way back from a stray scroll was to close and reopen. */
function fitSketch() {
  // the observer re-measures a frame later, which is too late for anything
  // that fits immediately after opening
  sizeSketch();
  /* Sketching over the model, the sheet has no pan/zoom of its own — it is the
     camera's projection of the plane. Fitting means framing the model. */
  if (sketchProjection()) { fitPreview(); drawSketch(); syncStatus(); return; }
  var W = E.cw, Hh = E.ch;
  var canvasRect=E.cv?.getBoundingClientRect();
  if(!canvasRect || canvasRect.width<1 || canvasRect.height<1)canvasRect={left:0,top:0,width:W,height:Hh};
  var overlayRect=function(id){var node=root && root.querySelector(id);return node && !node.hidden ? node.getBoundingClientRect() : null;};
  var fitArea=sketchFitViewport(canvasRect,
    [overlayRect("#mdCoach"),overlayRect("#mdWorkflow"),overlayRect("#mdContextToolbar")],
    [overlayRect("#mdRailBottom"),overlayRect("#mdRailRow"),overlayRect("#mdStatus"),overlayRect("#mdEntityNav")]);
  var u0, u1, v0, v1;
  var hasParts = renderedParts(E.def).length > 0;
  if (hasParts) {
    if (activeSketchFrame()) renderedParts(E.def).forEach(function(part){
      var projected=partUV(part), us=[], vs=[];
      if(projected.type==="rect"){us=[projected.u0,projected.u1];vs=[projected.v0,projected.v1];}
      else if(projected.type==="circle"){us=[projected.u-projected.r,projected.u+projected.r];vs=[projected.v-projected.r,projected.v+projected.r];}
      else if(projected.type==="segments"){var segmentPoints=projected.segments.flatMap(function(segment){return [segment.a,segment.b];});us=segmentPoints.map(function(q){return q.u;});vs=segmentPoints.map(function(q){return q.v;});}
      else{us=projected.pts.map(function(q){return q.u;});vs=projected.pts.map(function(q){return q.v;});}
      u0=u0===undefined?Math.min.apply(null,us):Math.min(u0,Math.min.apply(null,us));u1=u1===undefined?Math.max.apply(null,us):Math.max(u1,Math.max.apply(null,us));
      v0=v0===undefined?Math.min.apply(null,vs):Math.min(v0,Math.min.apply(null,vs));v1=v1===undefined?Math.max.apply(null,vs):Math.max(v1,Math.max.apply(null,vs));
    });
    else {
      var b = defBounds(E.def);
      if (E.view === "top") { u0 = b.x0; u1 = b.x1; v0 = b.z0; v1 = b.z1; }
      else if (E.view === "front") { u0 = b.x0; u1 = b.x1; v0 = b.y0; v1 = b.y1; }
      else { u0 = b.z0; u1 = b.z1; v0 = b.y0; v1 = b.y1; }
    }
  }
  /* Sketch geometry counts too. Framing only the solids meant that a document
     which is all sketch — every document, right up until the first extrude —
     zoomed to nothing. Sketch points are already in this plane's u/v. */
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch,ensureSketch(E.def))) return;
    var geometry=sketchGeometryBounds(sketch);if(!geometry)return;
    u0=u0===undefined?geometry.u0:Math.min(u0,geometry.u0);u1=u1===undefined?geometry.u1:Math.max(u1,geometry.u1);
    v0=v0===undefined?geometry.v0:Math.min(v0,geometry.v0);v1=v1===undefined?geometry.v1:Math.max(v1,geometry.v1);
  });
  /* An empty part sketch is usually a small component, not a room. The old
     60 cm opening span made a 4 mm slot only a few pixels wide before the
     first entity existed, precisely when the user has no geometry to fit. */
  if (u0 === undefined) { u0 = -5; u1 = 5; v0 = -5; v1 = 5; }
  var du = Math.max(0.01, u1 - u0), dv = Math.max(0.01, v1 - v0);
  E.scl = clamp(Math.min(Math.max(1,fitArea.w - 80) / du, Math.max(1,fitArea.h - 80) / dv), SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
  var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  E.ox = fitArea.x + fitArea.w / 2 - cu * E.scl;
  E.oy = fitArea.y + fitArea.h / 2 - (!activeSketchFrame() && E.view === "top" ? cv : -cv) * E.scl;
  drawSketch();
  syncStatus();
}

/* One pane visible per panel. The old editor stacked all five sections down the
   left panel, which overflowed the screen and left the parts list, history and
   library unreachable — the tabs are what make the panel fit at any height. */
function setTab(id) {
  if (!root) return;
  var b = root.querySelector('[data-tab="' + id + '"]');
  if (!b) return;
  var panel = b.closest(".md-panel");
  panel.querySelectorAll("[data-tab]").forEach(function (o) {
    var active = o === b;
    o.classList.toggle("on", active);
    o.setAttribute("aria-selected", active ? "true" : "false");
  });
  panel.querySelectorAll(".md-pane").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-pane") === id); });
  if (id === "lib") scheduleLibThumbs();
  if (id === "hist" && histPanel) histPanel.refresh();
  if (typeof inspectorDirty !== "undefined" && inspectorDirty[id]) {
    fillInspectorTab(id);
    inspectorDirty[id] = false;
  }
}
function activeTab(side) {
  var p = root && root.querySelector('.md-tabs[data-side="' + side + '"] .md-pane.on');
  return p ? p.getAttribute("data-pane") : null;
}

function setCommandTab(id) {
  if (!root) return;
  /* Sketch and Features are both hidden in an assembly document, the way the
     inspector's sketch pane is (setDocumentType): every command on either one
     is part-only and greys out there, so the pair is pure dead chrome. Guarding
     on the pane merely existing let a caller — or a user already sitting on one
     — select a pane whose tab is not on screen, which reads as a ribbon that
     has gone blank. */
  if ((id === "sketch" || id === "features") && E.docType === "assembly") id = "assembly";
  if (!root.querySelector('[data-command-pane="' + id + '"]')) return;
  E.commandTab = id;
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    var on = b.getAttribute("data-cmdtab") === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  root.querySelectorAll("[data-command-pane]").forEach(function (p) {
    p.classList.toggle("on", p.getAttribute("data-command-pane") === id);
  });
  if (document.body.classList.contains("compact-nav")) {
    const sheet = root.querySelector("#md-sheet");
    if (sheet) sheet.querySelectorAll(".md-commandmanager, .md-command-panes, .md-command-pane, #md-sheet-body").forEach(function (panel) {
      panel.scrollTop = 0;
    });
  }
}

function closeFeaturePanel(options = {}) {
  E.quickFormInstance?.dismiss();
  if(motionPlaybackCancel)motionPlaybackCancel();
  E.collectingFeature = false;
  if (!root) return;
  var host = root.querySelector("#mdQuickSettings");
  if (host) host.hidden = true;
  if(E.authoring)E.authoring.repairMarker=null;
  /* Dismissing the form dismisses its ghost body. Several callers used to close
     the panel without clearing the preview, which left an approximate (or a
     half-built exact) finish body in the scene until the next full rebuild. */
  clearFeaturePreview(false);
  /* The badge goes with the form it lives on, and a debounced downstream run
     left armed would re-lay the document after the edit was dismissed. */
  clearLiveDownstream(null);
  if(options.drawingOnly && E.mode==='drawing'){drawSketch();syncSheetPanel();}
  else if(options.assemblyPoseOnly && E.docType==="assembly" && refreshAssemblyPosePreview())refreshViewportSelection();
  else updatePreview();
  syncCommandManager(); // puts the ribbon button that opened the form back out
}

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

function runCommand(id) {
  if (!id) return;
  if(id==="temporaryaxes"){root.querySelector("#mdTemporaryAxes").click();closeCommandSearch();return;}
  if (id === "repeatlast") {
    var last = E.lastOperation;
    if (!last) { flash(t("repeatUnavailable")); return; }
    var reason = commandUnavailableReason(FEATURE_COMMAND[last.type]);
    if (reason) { flash(reason); return; }
    E.topologySelection = [];
    openParametricFeature(last.type, last.params); closeCommandSearch(); return;
  }
  var blocked = commandUnavailableReason(id);
  if (blocked) { flash(blocked); closeCommandSearch(); return; }
  if (id === "directsph" && isCanonicalAuthoring()) { openSphereForm(); closeCommandSearch(); return; }
  if (DIRECT_COMMAND_TOOLS[id]) { setTool(DIRECT_COMMAND_TOOLS[id]); closeCommandSearch(); syncCommandManager(); return; }
  if (id === "directcone") { openConeForm(); closeCommandSearch(); return; }
  if (id === "sketchtext") {
    if (isCanonicalAuthoring() && E.authoring?.phase !== "sketch") {
      if (activeParts(E.def).length) { flash("Open a sketch on the intended plane or face first."); closeCommandSearch(); return; }
      beginSketchWorkflow(null);
    }
    if (isCanonicalAuthoring() && E.authoring?.phase !== "sketch") { closeCommandSearch(); return; }
    openSketchTextForm(); closeCommandSearch(); return;
  }
  if (id === "stocksize") { openStockSizeForm(); closeCommandSearch(); return; }
  if (id === "towalls") { openToWallsForm(); closeCommandSearch(); return; }
  if (id === "finishpreview") { openFinishPreviewChooser(); closeCommandSearch(); return; }
  if (id === "exportglb") { exportModelGlb(); closeCommandSearch(); return; }
  if (id === "equations") { setTab("sketch"); fillSketchPane(); requestAnimationFrame(function () { Array.from(root.querySelectorAll("#mdSketch .md-h5")).find(function (node) { return node.textContent.trim() === t("equations"); })?.scrollIntoView({ block: "nearest" }); }); closeCommandSearch(); return; }
  if (id === "customprops") { openCustomProperties(); closeCommandSearch(); return; }
  if (id === "smartmates") { E.smartMateMode = !E.smartMateMode; setTab("ops"); flash(t("smartMate") + ": " + (E.smartMateMode ? "On" : "Off")); closeCommandSearch(); return; }
  if (id === "sheetmetal") {
    closeCommandSearch();
    setPanelCollapsed("right", false);
    setTab("ops");
    var section = root.querySelector("#mdSheetMetal");
    if (!section) flash(t("sheetMetalSelectPlate"));
    else {
      section.scrollIntoView({ block: "nearest" });
      root.querySelector("#mdSheetConvert")?.click();
    }
    return;
  }
  if (id === "branch") { setTab("hist"); closeCommandSearch(); return; }
  var tools = ["select", "rect", "circle", "sph", "poly", "rev", "cut", "cutc", "wall", "sketchpoint", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline", "dim", "trim", "extend", "offset", "constr"];
  /* A selected sketch entity toggles immediately. With nothing selected the
     command arms the two-point construction-line tool. */
  if (id === "constr" && E.mode !== "drawing") {
    var constrTargets = selEntities();
    if (constrTargets.length) {
      var constrSketch = ensureSketch(E.def);
      pushUndo(t("tool_constr"));
      constrTargets.forEach(function (entity) { toggleConstruction(constrSketch, entity.id); });
      resolveSketch(false);
      closeCommandSearch(); refreshAll(); syncCommandManager();
      return;
    }
  }
  if (tools.indexOf(id) >= 0) { if(id==="sarc"){ E.arcThreePoint=false; E.arcTangent=false; } setTool(id); }
  else if(id==="arc3point") { E.arcThreePoint=true; E.arcTangent=false; E.arcPts=null; setTool("sarc"); }
  else if(id==="tangentarc") { E.arcTangent=true; E.arcThreePoint=false; E.arcPts=null; setTool("sarc"); }
  else if(id==="sketchrepair")openSketchRepairs();
  else if(id==="centerrectangle")openCenterRectangle();
  else if(id==="dimensionedcircle")openDimensionedCircle();
  else if(id==="dimensionedpolygon")openDimensionedPolygon();
  else if(id==="centerslot")openCenterSlot();
  else if(id==="sketchfillet")openSketchFillet();
  else if(id==="faceboundary")openFaceBoundary();
  else if(id==="convertentities")openConvertEntities();
  else if (id === "newsketch") beginSketchWorkflow(null, { forceNew: true });
  else if (id === "finishsketch") finishSketchWorkflow();
  else if (id === "extrude") openParametricFeature("extrude");
  else if (id === "extrudecut") openParametricFeature("extrudeCut");
  else if (id === "revolvefeature") openParametricFeature("revolve");
  else if (id === "revolvecutfeature") openParametricFeature("revolveCut");
  else if (id === "sweepcutfeature") openParametricFeature("sweepCut");
  else if (id === "sweepfeature") openParametricFeature("sweep");
  else if (id === "loftfeature") openParametricFeature("loft");
  else if (id === "filletfeature") openParametricFeature("fillet");
  else if (id === "chamferfeature") openParametricFeature("chamfer");
  else if (id === "shellfeature") openParametricFeature("shell");
  else if (id === "domefeature") openParametricFeature("dome");
  else if (id === "draftfeature") openParametricFeature("draft");
  else if (id === "thickenfeature") openParametricFeature("thicken");
  else if (id === "ribfeature") openParametricFeature("rib");
  else if (id === "splitbodyfeature") openParametricFeature("splitBody");
  else if (id === "movebodyfeature") openParametricFeature("moveBody");
  else if (id === "patternfeature") openParametricFeature("pattern");
  else if (id === "mirrorfeature") openParametricFeature("mirror");
  else if (id === "booleanfeature") openParametricFeature("boolean");
  else if (id === "holefeature") openParametricFeature("hole");
  else if (id === "helixfeature") openParametricFeature("helix");
  else if (id === "threadfeature") openParametricFeature("thread");
  else if (id === "knurlfeature") openParametricFeature("knurl");
  else if (id === "insertfeature") openParametricFeature("insert");
  else if (id === "toolboxfastener") insertToolboxFastener();
  else if (id === "config") showConfigurations();
  else if (id === "screwmate") requestDocumentType("assembly",()=>{setTab("ops");addTopologyMate("screw");});
  else if (id === "gearmate") requestDocumentType("assembly",()=>{setTab("ops");openMateGearForm();});
  else if (id === "beltmate") requestDocumentType("assembly",()=>{setTab("ops");openMateBeltForm();});
  else if (id === "rackpinionmate") requestDocumentType("assembly",()=>{setTab("ops");openMateRackPinionForm();});
  else if (id === "rotationlimitmate") requestDocumentType("assembly",()=>{setTab("ops");openMateRotationLimitForm();});
  else if (id === "formsubassembly") openFormSubassembly();
  else if (id === "symmetricmate") requestDocumentType("assembly",()=>{setTab("ops");addTopologyMate("symmetric");});
  else if (id === "dynamicmirror") toggleDynamicMirror();
  else if (id === "mirror") mirrorSelection();
  else if (id === "pattern") patternSelection();
  else if (id === "circpattern") patternCircularSelection();
  else if (id === "project") projectPartEdges();
  else if (id === "regen") regenerateExactModel("force");
  else if (id === "stepin") importStepDocument();
  else if (id === "stepout") exportStepDocument();
  else if (id === "igesout") exportIgesDocument();
  else if (id === "stlout") openStlExportForm();
  else if (id === "3mfout") openStlExportForm("3mf");
  else if (id === "amfout") openStlExportForm("amf");
  else if (id === "printsetup") openPrintSetupForm();
  else if (id === "layeranalysis") openPrintLayerAnalysis();
  else if (id === "fffslice") openFffSlicePreview();
  else if (id === "drawing") {
    if (E.docType === "assembly" && E.assembly) showAssemblyDrawingSettings();
    else exportDrawingSvg();
  }
  else if (id === "mass") showMassProperties();
  else if (id === "measure") beginMeasure(E.measure && E.measure.mode);
  else if (id === "section") toggleSectionView();
  else if (id === "standards") runStandardsAudit();
  else if (id === "stdscrew") insertISO4017Screw();
  else if (id === "stdgear") openRackGearForm();
  else if (id === "fitcheck") openFitCheckForm();
  else if (id === "bundle") exportBundleDocument();
  else if (id === "bundlein") importBundleDocument();
  else if (id === "refplane") openOffsetPlaneForm();
  else if (id === "refaxis") addReferenceGeometry("axis");
  else if (id === "coordsys") openCoordinateSystemForm();
  else if (id === "refpoint") addReferenceGeometry("point");
  else if (id === "fit") {
    if (E.mode === "drawing") { drawingSheet().fit(); refreshAll(); }
    else if (E.mode === "3d") fitPreview();
    else fitSketch();
  }
  else if (id === "model3d") setMode("3d");
  else if (id === "assembly") requestDocumentType("assembly");
  else if (id === "partdoc") requestDocumentType("part");
  else if (id === "components") requestDocumentType("assembly",()=>setTab("parts"));
  else if (id === "componentpattern") openComponentPatternForm("create");
  else if (id === "editcomponentpattern") openComponentPatternForm("edit");
  else if (id === "removecomponentpattern") openComponentPatternForm("remove");
  else if (id === "mates") openMatePropertyManager();
  else if (id === "explode") createDefaultExplodedView();
  else if (id === "explodestep") openExplodeStepForm();
  else if (id === "motion") createDefaultMotionStudy();
  else if (id === "interference") runInterferenceCheck();
  else if (id === "bom") showAssemblyBOM();
  else if (id === "isolate") toggleIsolate();
  else if (id === "paint") { setMode("3d"); setTool("paint"); }
  else if (id === "note") { if(E.docType==="assembly")showAssemblyDrawingSettings(true);else{setMode("3d");setTool("note");} }
  closeCommandSearch();
  syncCommandManager();
}

function openSphereForm() {
  openQuickForm({
    action:"directsph",icon:"ph-sphere",title:"Sphere",
    hint:"Enter a center and driving diameter. Creates an editable native Sphere feature without a sketch.",
    fields:[
      {key:"x",label:"Center X",type:"number",unit:"length",value:0},
      {key:"y",label:"Center Y",type:"number",unit:"length",value:0},
      {key:"z",label:"Center Z",type:"number",unit:"length",value:0},
      {key:"diameter",label:"Diameter",type:"number",unit:"length",min:1e-6,value:1.2},
    ],
    failureMessage:function(){return "Enter finite center coordinates and a positive diameter.";},
    onApply:function(values){
      var x=Number(values.x),y=Number(values.y),z=Number(values.z),diameter=Number(values.diameter);
      if(![x,y,z,diameter].every(Number.isFinite) || diameter<=0)return false;
      pushUndo("Sphere");
      try{
        var params={x:x,y:y,z:z,r:diameter/2};
        var feature=createFeatureDefinition(E.def,"sphere",{params:params});
        E.sel=addPart({id:uid(),featureId:feature.id,kind:"sph",name:feature.name,x:x,y:y,z:z,r:params.r,color:"#b89a6e",metal:.08,rough:.7});
        refreshAll();return true;
      }catch(error){H.discard();flash(String(error.message || error));return false;}
    },
  });
}

function openConeForm() {
  openQuickForm({
    action: "directcone", icon: "ph-triangle", title: "Cone",
    fields: [
      { key: "r1", label: "Base radius", type: "number", unit: "length", min: 1e-6, value: 5 },
      { key: "r2", label: "Top radius", type: "number", unit: "length", min: 0, value: 0 },
      { key: "h", label: "Height", type: "number", unit: "length", min: 1e-6, value: 10 },
    ],
    onApply: function (values) {
      var r1 = Number(values.r1), r2 = Number(values.r2), h = Number(values.h);
      if (![r1, r2, h].every(Number.isFinite) || r1 <= 0 || r2 < 0 || h <= 0) return false;
      pushUndo("Cone");
      try {
        var params = { x: 0, y: 0, z: 0, r1, r2, h };
        var feature = createFeatureDefinition(E.def, "cone", { params: params });
        E.sel = addPart({ id: uid(), featureId: feature.id, kind: "cyl", name: "Cone", x: 0, y: 0, z: 0, r: r1, r2: r2, h: h, color: "#b89a6e", metal: .08, rough: .7 });
        refreshAll();
        return true;
      } catch (error) { H.discard(); flash(String(error.message || error)); return false; }
    },
  });
}

function openSketchTextForm() {
  openQuickForm({ action: "sketchtext", title: "Sketch text", icon: "ph-text-t",
    hint: "Creates closed editable letter profiles. Extrude to emboss or Extrude cut to engrave.",
    fields: [
      { key: "text", label: "Text (up to 24 characters)", type: "text", value: "TEXT" },
      { key: "height", label: "Letter height (cm)", type: "number", value: 3, min: .1, max: 100 },
      { key: "x", label: "Left position (cm)", type: "number", value: 0 },
      { key: "y", label: "Baseline position (cm)", type: "number", value: 0 },
    ],
    onApply: function(values) {
      const content = values.text.trim();
      if (!content || content.length > 24 || !Number.isFinite(values.height) || values.height < .1 || values.height > 100) { flash("Enter 1–24 characters and a letter height from 0.1 to 100 cm."); return false; }
      let contours;
      try { contours = rasterTextContours(content); } catch (error) { flash(error.message); return false; }
      if (!contours.length) { flash("This font produced no closed letter contours."); return false; }
      const ys = contours.flatMap(loop => loop.map(point => point.y));
      const top = Math.min(...ys), bottom = Math.max(...ys), scale = values.height / Math.max(1, bottom - top);
      const sketch = sketchForView();
      pushUndo("Sketch text");
      for (const contour of contours) {
        const ids = contour.map(point => newSketchPoint(sketch, { u: values.x + point.x * scale, v: values.y + (bottom - point.y) * scale }));
        ids.forEach((id, index) => sketch.entities.push({ id: uid(), type: "line", name: "Text " + content, a: id, b: ids[(index + 1) % ids.length], construction: false, textSource: content }));
      }
      resolveSketch(false); E.sel = null; E.ssel = []; refreshAll(); return true;
    },
  });
}

function openStockSizeForm() {
  var part = selectedSolid();
  if (!part) { flash(t("quickNeedPart")); return; }
  var bounds = partBounds(part), needed = [bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0].map(v => Math.max(0.01, v));
  var keys = Object.keys(STOCK_MATERIALS), current = String(part.materialCatalogId || "").replace(/^stock:/, "");
  openQuickForm({ action: "stocksize", title: "Stock size", icon: "ph-ruler",
    fields: [
      { key: "width", label: "Stock width", type: "number", unit: "length", min: needed[0], value: part.stockSize?.width || Math.ceil(needed[0]) },
      { key: "height", label: "Stock height", type: "number", unit: "length", min: needed[1], value: part.stockSize?.height || Math.ceil(needed[1]) },
      { key: "depth", label: "Stock depth", type: "number", unit: "length", min: needed[2], value: part.stockSize?.depth || Math.ceil(needed[2]) },
      { key: "material", label: "Material", type: "select", value: current || "aluminum", choices: keys.map(key => ({ value: key, label: STOCK_MATERIALS[key].name })) },
    ],
    onApply: function (values) {
      var dimensions = [Number(values.width), Number(values.height), Number(values.depth)];
      if (dimensions.some((value, i) => !Number.isFinite(value) || value + 1e-6 < needed[i])) { flash("Stock must enclose the part."); return false; }
      var material = STOCK_MATERIALS[values.material]; if (!material) return false;
      pushUndo("Stock size");
      part.stockSize = { width: dimensions[0], height: dimensions[1], depth: dimensions[2] };
      part.materialCatalogId = "stock:" + values.material; part.materialName = material.name;
      part.color = material.color; part.metal = material.metal; part.rough = material.rough;
      if ((E.def.parts || []).length === 1) setDocumentProperty(E.def, "Stock size", `${dimensions.join(" × ")} cm`);
      refreshAll(); return true;
    },
  });
}

function openToWallsForm() {
  var sketch = ensureSketch(E.def), points = new Map((sketch.points || []).map(p => [p.id, p]));
  var segments = (sketch.entities || []).filter(e => e.type === "line" && !e.construction).map(e => lineData(e, points)).filter(Boolean);
  if (!segments.length) { flash("Draw a line outline in the active sketch first."); return; }
  openQuickForm({ action: "towalls", title: "Sketch outline to planner walls", icon: "ph-wall",
    fields: [{ key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 1, value: 10 }],
    onApply: function (values) {
      var thickness = Number(values.thickness); if (!(thickness > 0)) return false;
      var cx = S.nodes.length ? S.nodes.reduce((sum, p) => sum + p.x, 0) / S.nodes.length : 0;
      var cz = S.nodes.length ? S.nodes.reduce((sum, p) => sum + p.z, 0) / S.nodes.length : 0;
      var source = { lines: segments.map(segment => ({ a: { x: segment.a.x + cx, z: segment.a.y + cz }, b: { x: segment.b.x + cx, z: segment.b.y + cz } })) };
      var converted = convertCadToWalls(source, { singleLineWalls: true, defaultThickness: thickness, firstId: S.idc, minLength: 1 });
      if (!converted.walls.length) { flash("No walls could be made from this sketch."); return false; }
      pushPlannerHistory();
      for (var wall of converted.walls) {
        var result = executeCommand(wallDrawCommand, {
          from: converted.nodes[wall.a], to: converted.nodes[wall.b],
          thickness: wall.thickness, height: wall.height, type: wall.wallTypeId,
          kind: wall.kind, datum: wall.datum, phase: wall.phase,
        }, { domain: "planner", state: S }, { history: false });
        if (!result.ok) { flash(`Could not make wall: ${result.reason}`); return false; }
      }
      S.dirty3D = true; markPlannerDirty(); render2D();
      flash(`✓ ${converted.walls.length} walls added to the planner`); return true;
    },
  });
}

function openFinishPreviewChooser() {
  if (!selectedSolid()) { flash(t("quickNeedPart")); return; }
  showPickList("Finish preview", "Choose a finish to preview", [
    { id: "fillet", label: t("quickFillet"), hint: "Round selected edges" },
    { id: "chamfer", label: t("quickChamfer"), hint: "Bevel selected edges" },
    { id: "shell", label: t("shellOp"), hint: "Hollow selected face" },
  ], function (item) { openParametricFeature(item.id); });
}

async function exportModelGlb() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.pv?.grp) { flash("Open the 3D model preview first."); return; }
  try {
    var mod = await import("three/addons/exporters/GLTFExporter.js");
    var doc = E.docType === "assembly" ? E.assembly : E.def;
    var name = doc?.name || "model";
    var source = new THREE.Group(); source.name = name;
    source.add(E.pv.grp.clone(true)); source.scale.setScalar(0.01);
    var buffer = await new mod.GLTFExporter().parseAsync(source, { binary: true, onlyVisible: true, trs: true });
    downloadBytes(buffer, name + ".glb", "model/gltf-binary");
  } catch (error) { flash(String(error.message || error)); }
}

function openCustomProperties() {
  var doc = E.docType === "assembly" ? E.assembly : E.def;
  if (!doc) return;
  root.querySelector("#mdCustomPropsDialog")?.remove();
  var dialog = document.createElement("dialog");
  dialog.id = "mdCustomPropsDialog";
  dialog.style.cssText = "max-width:min(32rem,90vw);max-height:80vh;overflow:auto;border-radius:12px;padding:1.2rem";
  var title = document.createElement("h2"); title.textContent = "Custom properties"; dialog.appendChild(title);
  var rows = document.createElement("div"); dialog.appendChild(rows);
  function row(key, value) {
    var line = document.createElement("div"); line.style.cssText = "display:flex;gap:.4rem;margin:.5rem 0";
    var name = document.createElement("input"); name.placeholder = "Name"; name.value = key; name.maxLength = 80;
    var field = document.createElement("input"); field.placeholder = "Value"; field.value = value;
    var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.onclick = function () { line.remove(); };
    line.append(name, field, remove); rows.appendChild(line);
  }
  Object.entries(doc.customProperties || {}).forEach(function (entry) { row(entry[0], entry[1]); });
  var add = document.createElement("button"); add.type = "button"; add.textContent = "+ Property"; add.onclick = function () { row("", ""); }; dialog.appendChild(add);
  var save = document.createElement("button"); save.type = "button"; save.textContent = "Save"; save.onclick = function () {
    var next = {};
    for (var line of rows.children) {
      var inputs = line.querySelectorAll("input"), key = inputs[0].value.trim(), value = inputs[1].value.trim();
      if (key && value) next[key] = value;
    }
    if (JSON.stringify(next) !== JSON.stringify(doc.customProperties || {})) {
      pushUndo("Custom properties");
      doc.customProperties = {};
      Object.entries(next).forEach(function (entry) { setDocumentProperty(doc, entry[0], entry[1]); });
      if (!Object.keys(next).length) delete doc.customProperties;
      syncHead();refreshAll();
    }
    dialog.close();
  }; dialog.appendChild(save);
  var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = function () { dialog.close(); }; dialog.appendChild(cancel);
  dialog.addEventListener("close", function () { dialog.remove(); }, { once: true });
  root.appendChild(dialog); dialog.showModal();
}

/* Common solid operations live beside the viewport with their one or two
   useful parameters exposed immediately. This deliberately avoids bouncing
   through the inspector and modal prompts for the operations used all day. */
function selectedSolid() {
  return E.sel && !isSketchObject(E.sel) && E.sel.kind ? E.sel : null;
}

function quickDuplicatePart() {
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickDuplicate"));
  var q = resetClonedPartIdentity(cloneData(p)); movePart(q, 10, 0, 10); addPart(q); E.sel = q;
  refreshAll(); return true;
}


function quickMirrorPart(options) {
  var params={...featureDefaults("mirror"),...(options || {})};
  if(params.scope==="feature"){
    /* Features to Mirror: reflect the picked addition or cutter on its host. */
    params.seedFeatureIds=Array.from(new Set(params.seedFeatureIds?.length ? params.seedFeatureIds : [params.seedFeatureId].filter(Boolean)));
    params.seedFeatureId=params.seedFeatureIds[0] || "";
    var mirrorSource=(E.def.features || []).find(function(item){return item.id===params.seedFeatureId;});
    var mirrorHost=selectedPatternBody(params.seedFeatureId);
    if(!mirrorHost){flash(t("quickNeedPart"));return false;}
    if(!mirrorSource?.inputs?.[0]){flash("Select the feature to mirror in the history tree");return false;}
    var mirrorPlane=params.planeReference || (E.authoring.referenceId && String(E.authoring.referenceId).indexOf("plane:")===0 ? E.authoring.referenceId : "plane:right");
    var mirrorParams={...params};delete mirrorParams.planeReference;
    pushUndo(t("quickMirror"));
    try{var hostFeatureId=cutTargetFeatureId(mirrorHost);createFeatureDefinition(E.def,"mirror",{inputs:[hostFeatureId],references:{sketches:[],features:Array.from(new Set([hostFeatureId,...params.seedFeatureIds])),topology:[],references:[mirrorPlane]},params:mirrorParams});queueExactMesh(mirrorHost);refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickMirror"));
  var planeId=params.planeReference || (E.authoring.referenceId && String(E.authoring.referenceId).indexOf("plane:")===0 ? E.authoring.referenceId : "plane:right");
  var q = mirrorProjectionPart(resetClonedPartIdentity(cloneData(p)),planeId);
  if(!q){H.discard();flash(t("kernelBodyNoMirror"));return false;}
  var feature;
  delete params.planeReference;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"mirror",{inputs:[source],references:{sketches:[],features:[source],topology:[],references:[planeId]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  if(feature){q.derivedFeatureId=feature.id;q.sourceFeatureId=p.featureId;}
  if(params.keepOriginal!==false)addPart(q);else{var index=E.def.parts.indexOf(p);if(index>=0)E.def.parts.splice(index,1,q);else addPart(q);} E.sel = q; refreshAll(); return true;
}

async function quickRoundPart(kind, amount) {
  var form=E.quickFormInstance;
  var params={...featureDefaults(kind),...(typeof amount==="object"?amount:kind==="fillet"?{radius:amount}:{distance:amount})};
  amount=kind==="fillet"?params.radius:params.distance;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("quickNeedPart")); return false; }
  var sourceFeatureId=cutTargetFeatureId(p);
  /* Edges come from the selection. A face with no edges picked means every
     edge of that face — not the whole body, which is what an empty edge list
     used to do. */
  var targets=finishFeatureTargets(kind,params).filter(function(reference){return reference.kind==="edge" || reference.kind==="face";});
  if (!targets.length) { flash(t("needEdges")); return false; }
  /* An override for an edge that is no longer in the selection means nothing,
     and storing it would make the saved feature claim a radius it never uses. */
  if (kind === "fillet" && Array.isArray(params.edgeRadii)) {
    params.edgeRadii = params.edgeRadii.filter(function (entry) {
      return entry && targets.some(function (reference) { return reference.persistentId === entry.id; });
    });
  }
  // Bind extracted edges to the analytic history names when they describe
  // the same geometry, so a subsequent rebuild can resolve the selection.
  var coreTopology=E.coreRun && (E.coreRun.core || E.coreRun).topology || [];
  var historyRegistry=createTopologyRegistry(coreTopology);
  targets=targets.map(function(reference){
    if(historyRegistry.byPersistentId.has(reference.persistentId))return reference;
    var descriptor=cloneData(reference.descriptor || {});delete descriptor.semantic;
    var resolution=resolveTopologyReference({kind:reference.kind,descriptor:descriptor},historyRegistry,{threshold:.05});
    if (!resolution.topology) return reference;
    var bound=topologyReferenceFromEntry(resolution.topology);
    // Lowered cutter edges retain their kernel name, but depend on the
    // authoring feature that produces the cutter rather than its internal tool.
    var owner=(E.def.features || []).filter(function(feature){
      return bound.ownerFeatureId===feature.id || bound.ownerFeatureId.startsWith(feature.id+":");
    }).sort(function(a,b){return b.id.length-a.id.length;})[0];
    if(owner)bound.ownerFeatureId=owner.id;
    if(Array.isArray(params.edgeRadii))params.edgeRadii.forEach(function(entry){
      if(entry.id===reference.persistentId)entry.id=bound.persistentId;
    });
    return bound;
  });
  if(isCanonicalAuthoring())try{
    var finishDocument=E.def,finishSignature=JSON.stringify(E.def);
    var trial=cloneData(E.def);
    var sourceCompiled=compileKernelFeatureTree(trial);
    if(!sourceCompiled.ok){flash(sourceCompiled.issues[0]?.message || 'Invalid feature history');return false;}
    var sourceRun=await regenerateFeatures({...sourceCompiled.document,features:sourceCompiled.features});
    try {
      var sourceResult=sourceRun.results.get(sourceFeatureId);
      if(!sourceResult?.shape){flash(sourceRun.issues[0]?.message || 'The source body could not be rebuilt');return false;}
      var exactRegistry=createTopologyRegistry(sourceResult.topology || []);
      var verifiedSourceTopology=captureExactTopology(trial,sourceCompiled.features,sourceRun);
      targets=targets.map(function(reference){
        var descriptor=cloneData(reference.descriptor || {});delete descriptor.semantic;
        var resolution=resolveTopologyReference({kind:reference.kind,descriptor},exactRegistry,{threshold:.05});
        if(!resolution.topology || ['missing','ambiguous'].includes(resolution.status))throw new Error('The selected edge could not be matched to the rebuilt body');
        var rebound=topologyReferenceFromEntry(resolution.topology);
        rebound.ownerFeatureId=sourceFeatureId;
        if(Array.isArray(params.edgeRadii))params.edgeRadii.forEach(function(entry){if(entry.id===reference.persistentId)entry.id=rebound.persistentId;});
        return rebound;
      });
    } finally {releaseRegeneration(sourceRun);}
    var trialFeature=createFeatureDefinition(trial,kind,{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:targets,references:[]},params:params});
    // Generated fillet and cut edges exist only in the exact model. Validate
    // against that model, rather than rejecting them in the analytic preview.
    var compiledTrial=compileKernelFeatureTree(trial);
    if(!compiledTrial.ok){flash(compiledTrial.issues[0]?.message || 'Invalid feature history');return false;}
    var trialRun=await regenerateFeatures({...compiledTrial.document,features:compiledTrial.features});
    try {
      var failure=trialRun.issues.find(function(issue){return issue.severity==='error' || issue.code==='regeneration-failed';});
      if(failure){flash(failure.message);return false;}
      if(!trialRun.results.get(trialFeature.id)){flash('The finish feature could not be rebuilt');return false;}
    } finally {releaseRegeneration(trialRun);}
    if((form && !form.isCurrent()) || E.def!==finishDocument || JSON.stringify(E.def)!==finishSignature || E.authoring?.featureType!==kind)return false;
  }catch(error){flash(String(error.message||error));return false;}
  pushUndo(kind === "fillet" ? t("quickFillet") : t("quickChamfer"));
  if(verifiedSourceTopology)E.def.exactTopologyCache=verifiedSourceTopology;
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,kind,{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":"+kind+":"+(p.exactOperations.length+1),
    type:kind,amount:Math.max(.1,amount),targets:targets,params:cloneData(params),
  });
  delete p.exactFillet; delete p.exactFilletTargets; delete p.exactFilletEdges;
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+(kind==="fillet"?t("quickFillet"):t("quickChamfer"))+" "+t("appliedFeature"));
  return true;
}

async function quickShellPart(thickness, verifiedPreview=false) {
  var form=E.quickFormInstance;
  var params={...featureDefaults("shell"),...(typeof thickness==="object"?thickness:{thickness:thickness})};thickness=params.thickness;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("shellFail")); return false; }
  var targets=cloneData((E.topologySelection || []).filter(function(reference){return reference.kind==="face";}));
  if (!targets.length) { flash(t("needFace")); return false; }
  var source=cutTargetFeatureId(p),verified;
  if(!verifiedPreview){
    var preview=exactFinishPreviewPart("shell",{params});
    try{verified=await exactFinishPreviewBody(preview,"shell");}catch(error){flash(String(error.message || error));return false;}finally{if(verified)disposeBrep(verified);}
  }
  if(form && !form.isCurrent())return false;
  pushUndo(t("shellOp"));
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"shell",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":shell:"+(p.exactOperations.length+1),
    type:"shell",amount:Math.max(1e-6,thickness),targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll(); return true;
}

/* Draft, like shell, is recorded as an exact operation on the selected body
   rather than as a new part: the solid keeps its identity and OpenCascade
   re-tilts its walls on the next exact build. */
async function quickDomePart(params) {
  var form=E.quickFormInstance;
  var p=selectedSolid(),targets=finishFeatureTargets("dome");
  if(!p || targets.length!==1){flash("Select one circular planar face for Dome");return false;}
  var preview=exactFinishPreviewPart("dome",{params:params}),verified;
  try{verified=await exactFinishPreviewBody(preview,"dome");}catch(error){flash(String(error.message || error));return false;}finally{if(verified)disposeBrep(verified);}
  if(form && !form.isCurrent())return false;
  pushUndo("Dome");
  try{
    var source=cutTargetFeatureId(p);
    var feature=createFeatureDefinition(E.def,"dome",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});
    p.exactOperations=p.exactOperations || [];
    p.exactOperations.push({id:feature.id,type:"dome",amount:params.height,targets:targets,params:cloneData(params)});
    E.sel=p;queueExactMesh(p);refreshAll();return true;
  }catch(error){H.discard();flash(String(error.message || error));return false;}
}

function quickDraftPart(options) {
  var params={...featureDefaults("draft"),...(typeof options==="object"?options:{angle:options})};
  var angle=Number(params.angle);
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("draftFail")); return false; }
  if (!Number.isFinite(angle) || angle===0) { flash(t("draftFail")); return false; }
  var neutralFace=params.neutralFace || null;
  var targets=finishFeatureTargets("draft").filter(function(reference){return !neutralFace || reference.persistentId!==neutralFace.persistentId;});
  if (!targets.length) { flash(t("needFace")); return false; }
  pushUndo(t("draftOp"));
  /* The body's head, as Shell and Dome use: on a merged body p.featureId is the
     first feature (HOUSING's Base Extrude), and drafting that started a second
     body next to Boss-Stop instead of drafting the part as it stands. */
  var source=cutTargetFeatureId(p);
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"draft",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":draft:"+(p.exactOperations.length+1),
    type:"draft",amount:angle,targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("\u2713 "+t("draftOp")+" "+t("appliedFeature"));
  return true;
}

/* Split Body. The plane cuts once; what the command does with the two halves is
   the whole point of the feature.

   "Both" is not a compound body here — a compound would be one row in the tree
   holding two lumps nobody can pick apart. The half that is kept stays on the
   original part and the other half becomes a part of its own, carrying the same
   source recipe with the complementary split recorded on it. Two rows, two
   bodies, both selectable, both saveable, and neither of them a special kind
   the rest of the editor has to learn about. */
function quickSplitBodyPart(options) {
  var params={...featureDefaults("splitBody"),...(typeof options==="object"?options:{offset:options})};
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("splitBodyFail")); return false; }
  var offset=Number(params.offset);
  if (!Number.isFinite(offset)) { flash(t("splitBodyFail")); return false; }
  var bounds=partBounds(p), axis=params.axis==="x"?"x":params.axis==="z"?"z":"y";
  if (!bounds || offset<=bounds[axis+"0"]+1e-9 || offset>=bounds[axis+"1"]-1e-9) { flash(t("splitBodyFail")); return false; }
  var both=params.keep!=="positive" && params.keep!=="negative";
  pushUndo(t("splitBodyOp"));
  /* Both halves are cut from the SAME body, so both history rows take the
     original part's feature as their input — the clone's own feature id names
     nothing in the tree yet and would dangle. It is the body's head, not its
     first feature, so a merged body is split as it stands. */
  var sourceFeatureId=cutTargetFeatureId(p);
  var record=function(part,keep){
    var half={...params,keep:keep};
    var feature;
    if(isCanonicalAuthoring())feature=createFeatureDefinition(E.def,"splitBody",{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:[],references:[]},params:half});
    part.exactOperations=part.exactOperations || [];
    part.exactOperations.push({
      id:feature ? feature.id : (part.featureId || "feature:part:"+part.id)+":split:"+(part.exactOperations.length+1),
      type:"splitBody",amount:offset,targets:[],params:cloneData(half),
    });
    queueExactMesh(part);
  };
  try{
    if(both){
      var other=resetClonedPartIdentity(cloneData(p));
      other.name=tf("splitBodyHalf",{name:p.name || t("selFilterBody")});
      delete other.meshData; delete other.bounds;
      addPart(other);
      record(p,"positive");
      record(other,"negative");
    } else record(p,params.keep);
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  E.sel=p; refreshAll();
  flash("✓ "+t("splitBodyOp")+" "+t("appliedFeature"));
  return true;
}

/* Move / Copy Body. A move rewrites the body in place; a copy leaves the
   original alone and puts the transform on a new part, because two bodies that
   happen to touch are still two bodies and a fuse would make them one. */
function quickMoveBodyPart(options) {
  var params={...featureDefaults("moveBody"),...(typeof options==="object"?options:{dx:options})};
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("moveBodyFail")); return false; }
  var moved=(Number(params.dx)||0)||(Number(params.dy)||0)||(Number(params.dz)||0)||(Number(params.angle)||0);
  if (!moved) { flash(t("moveBodyNothing")); return false; }
  var copy=!!params.copy;
  pushUndo(t("moveBodyOp"));
  /* `copy` is handled here, not by the kernel: moveBodyBrep's compound is the
     right answer for one BREP result, but a part must be one body. */
  var target=p;
  if(copy){
    target=resetClonedPartIdentity(cloneData(p));
    target.name=tf("moveBodyCopyName",{name:p.name || t("selFilterBody")});
    delete target.meshData; delete target.bounds;
    addPart(target);
  }
  var kernelParams={...params,copy:false};
  var feature;
  // a copy is cut from the original body too, so its row names that body
  var sourceFeatureId=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"moveBody",{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:[],references:[]},params:kernelParams});}catch(error){H.discard();flash(String(error.message||error));return false;}
  /* The copy is the row's body, the way a mirror or pattern copy is: its head
     starts at the move, and the original's head does not walk onto it. */
  if(copy && feature){target.derivedFeatureId=feature.id;target.sourceFeatureId=p.featureId;}
  target.exactOperations=target.exactOperations || [];
  target.exactOperations.push({
    id:feature ? feature.id : (target.featureId || "feature:part:"+target.id)+":movebody:"+(target.exactOperations.length+1),
    type:"moveBody",amount:Number(params.angle)||0,targets:[],params:cloneData(kernelParams),
  });
  E.sel=target; queueExactMesh(target); refreshAll();
  flash("✓ "+t("moveBodyOp")+" "+t("appliedFeature"));
  return true;
}

/* Rib. Sketch-driven like extrude, body-driven like shell: the open line says
   where the web runs, the selected body says what it braces, and the result is
   recorded as an exact operation on that body because a rib IS part of the
   solid it stiffens — never a loose fin standing next to it. */
function createRibFeature(options) {
  var params={...featureDefaults("rib"),...(typeof options==="object"?options:{thickness:options})};
  var thickness=Number(params.thickness);
  if(!Number.isFinite(thickness) || thickness<=0){flash(t("ribFail"));return false;}
  var sketch=ensureSketch(E.def);
  var chain=analyzeSketchChains(sketch,{selectedIds:selEntities().map(function(entity){return entity.id;})}).chains[0];
  if(!chain){flash(t("ribNeedLine"));setTab("sketch");return false;}
  var p=selectedSolid() || activeParts(E.def)[activeParts(E.def).length-1];
  if(!p){flash(t("quickNeedPart"));return false;}
  if(!partSupportsExactMesh(p)){flash(t("ribFail"));return false;}
  var axis=planeAxis(sketch.plane),localFrame=sketch.frameSpace==="local" && sketch.frame;
  var normal=sketch.frame && sketch.frame.normal;
  /* The sketch plane already carries a direction; the form's forward/reverse is
     stated relative to it, so the two are combined once here rather than being
     re-guessed by the kernel. */
  var principal=localFrame || !normal ? 1 : (axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)) || 1;
  var ribParams={...params,
    points:chain.points.map(function(q){return {u:q.u,v:q.v};}),
    chainEntityIds:chain.entityIds.slice(),
    axis:localFrame?"frame":axis,
    ...(localFrame?{frame:cloneData(sketch.frame)}:{}),
    from:localFrame?0:(Number(sketch.offset)||0),
    direction:(principal<0)!==(params.direction==="reverse")?"reverse":"forward",
    sketchId:sketch.id,
  };
  pushUndo(t("ribOp"));
  recordSketchInHistory(E.def,sketch);
  var feature;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"rib",{inputs:[source],references:{sketches:[sketch.id],features:[source],topology:[],references:[]},params:ribParams});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":rib:"+(p.exactOperations.length+1),
    type:"rib",amount:thickness,targets:[],params:cloneData(ribParams),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+t("ribOp")+" "+t("appliedFeature"));
  return true;
}

/* Thicken. Recorded like shell and draft — an exact operation on the selected
   body, not a new part — because the slab it grows is fused back into that
   body. On a surface body (a sweep or loft with "Create solid" off) there is
   nothing to fuse into and the slab becomes the body, which is the whole point:
   a sheet acquires a thickness without changing identity in the tree. */
function quickThickenPart(options) {
  var params={...featureDefaults("thicken"),...(typeof options==="object"?options:{thickness:options})};
  var thickness=Number(params.thickness);
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("thickenFail")); return false; }
  if (!Number.isFinite(thickness) || thickness<=0) { flash(t("thickenFail")); return false; }
  var targets=finishFeatureTargets("thicken");
  if (!targets.length) { flash(t("needFace")); return false; }
  pushUndo(t("thickenOp"));
  var feature;
  /* The body as it stands, not its first feature: on a merged body the first
     feature is only the base, and thickening that starts a second body. */
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"thicken",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":thicken:"+(p.exactOperations.length+1),
    type:"thicken",amount:thickness,targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+t("thickenOp")+" "+t("appliedFeature"));
  return true;
}

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

function clearPatternMerges(featureId) {
  if(!featureId)return;
  (E.def.parts || []).forEach(function(part){
    if(!(part.merges3d || []).length)return;
    var kept=part.merges3d.filter(function(entry){return entry.patternFeatureId!==featureId;});
    if(kept.length===part.merges3d.length)return;
    if(kept.length)part.merges3d=kept;else delete part.merges3d;
    invalidatePartMeshAfterEdit(part);
  });
}

/* Lay one run of pattern copies. Both Apply and the rebuild that follows a
   parameter edit come through here, so a merged pattern does not grow a second
   placement path. `push` is the only difference between the two callers. */
function layPatternCopies(seed, params, feature, placements, circularStep, push) {
  /* Snapshotted BEFORE this pattern's own fusions land on the seed, so the
     copies are the shape the seed was when they were made. */
  var source=params.mergeResult?patternMergeSource(seed):null,entries=[];
  placements.forEach(function(placement,index){
    var copy=resetClonedPartIdentity(cloneData(seed));
    placePatternCopy(copy,params,placement,circularStep);
    if(feature){copy.derivedFeatureId=feature.id;copy.sourceFeatureId=seed.featureId;copy.patternIndex=index+1;copy.patternGridIndex=placement.indices;}
    push(copy);
    entries.push({part:copy,transform:patternPlacementTransform(params,placement,circularStep)});
  });
  E.patternFusion=source&&entries.length?fusePatternInstances(seed,source,entries,feature):null;
  return entries;
}

/* The second pass: ask the kernel which instances share material, then collapse
   each connected cluster onto its first member. A cluster of one is left
   exactly as it was laid. */
function fusePatternInstances(seed, source, entries, feature) {
  if(!partSupportsExactMesh(seed)){flash(t("patternMergeUnsupported"));return;}
  var def=E.def,featureId=feature&&feature.id||null;
  var members=[{part:seed,transform:PATTERN_IDENTITY_PLACEMENT}].concat(entries);
  return (async function(){
    var base=null,copies=[];
    try{
      base=await exactBrepForPart(source);
      for(var index=0;index<members.length;index++)copies.push(await placeBrep(base,members[index].transform));
      var groups=await brepConnectedGroups(copies.map(function(brep,at){return {brep:brep,bounds:partBounds(members[at].part)};}));
      // The document may have moved on while the kernel worked; a stale answer
      // is worse than no answer.
      if(E.def!==def||!members.every(function(member){return (def.parts || []).includes(member.part);}))return;
      var absorbed=[],hosts=[];
      groups.forEach(function(group){
        if(group.length<2)return;
        var host=members[group[0]].part;
        hosts.push(host);
        /* A placement is stored RELATIVE TO THE HOST, never in world space.
           A copy's own turn is NOT baked into its BREP — buildPart nests it as
           groups around the whole body and the exact tree wraps it in the
           `transformBody` row emitPartPatternTurn writes, exactBrepForPart
           itself leaves it out — so a merge fused into that body is turned by
           the host's transform on both routes out. A world placement would
           therefore be turned twice.
           The seed hosts at the identity and a linear copy carries no turn, so
           those clusters read the same either way; a circular or curve cluster
           that does not contain the seed is hosted by a ROTATED copy, and only
           the host-relative form puts it where the copies were. */
        var fromHost=invertRigidTransform(patternRotationTransform(partPatternRotations(host)));
        /* ONE record per cluster, carrying every instance's placement, rather
           than one per instance: the shape being copied is stored once instead
           of N times in the saved model, and the cluster's copies are welded to
           each other before they meet the host. */
        host.merges3d=host.merges3d || [];
        host.merges3d.push({kind:"placed",part:cloneData(source),placements:group.slice(1).map(function(at){return composeRigidTransforms(fromHost,members[at].transform);}),...(featureId?{featureId:featureId,patternFeatureId:featureId}:{})});
        group.slice(1).forEach(function(at){absorbed.push(members[at].part);});
      });
      if(!absorbed.length)return;
      def.parts=(def.parts || []).filter(function(part){return !absorbed.includes(part);});
      hosts.forEach(function(host){invalidatePartMeshAfterEdit(host);queueExactMesh(host);});
      if(absorbed.includes(E.sel))E.sel=hosts[0];
      refreshAll();
      flash("✓ "+tf("patternMerged",{count:absorbed.length,bodies:(def.parts || []).filter(function(part){return part===seed||part.derivedFeatureId===featureId;}).length}));
    }catch(error){
      console.warn("Pattern merge failed:",error);
      if(E.def===def)flash(t("patternMergeFail"));
    }finally{
      copies.forEach(function(copy){disposeBrep(copy);});
      if(base)disposeBrep(base);
    }
  })();
}

function topologyEdgeDirection(entry) {
  var d = entry && entry.descriptor || {};
  if (d.axis && (Number(d.axis.x) || Number(d.axis.y) || Number(d.axis.z))) return { x: Number(d.axis.x) || 0, y: Number(d.axis.y) || 0, z: Number(d.axis.z) || 0 };
  var ends = edgeEndpoints(entry);
  if (ends.length < 2) return null;
  return { x: ends[1].x - ends[0].x, y: ends[1].y - ends[0].y, z: ends[1].z - ends[0].z };
}
function patternParamsFromSelectedEdges(params) {
  var edges = (E.topologySelection || []).filter(function (item) { return item.kind === "edge"; });
  if (!edges.length || params.mode && params.mode !== "linear") return params;
  var next = { ...params };
  var first = topologyEdgeDirection(edges[0]);
  if (first) {
    next.direction1 = first;
    next.direction1Ref = cloneData(edges[0]);
    next.count1 = Number(params.countX || params.count) || 2;
    next.spacing1 = Number(params.spacingX != null ? params.spacingX : params.spacing) || 0;
  }
  if (edges[1]) {
    var second = topologyEdgeDirection(edges[1]);
    if (second) {
      next.direction2 = second;
      next.direction2Ref = cloneData(edges[1]);
      next.count2 = Number(params.countY || params.countZ || params.count) || 2;
      next.spacing2 = Number(params.spacingY != null ? params.spacingY : params.spacingZ != null ? params.spacingZ : params.spacing) || 0;
    }
  }
  return next;
}
function selectedPatternBody(seedId) {
  var selected=selectedSolid();if(selected)return selected;
  function contains(id,seen){if(id===seedId)return true;if(!id || seen.has(id))return false;seen.add(id);var feature=(E.def.features || []).find(function(item){return item.id===id;});return (feature?.inputs || []).some(function(input){return contains(input,seen);});}
  return activeParts(E.def).find(function(part){return contains(cutTargetFeatureId(part),new Set());}) || null;
}
function quickPatternPart(count, pitch) {
  var params={...featureDefaults("pattern"),...(typeof count==="object"?count:{count:count,spacing:pitch})};count=Math.max(2,Math.round(params.count));pitch=Number(params.spacing)||0;
  params=patternParamsFromSelectedEdges(params);
  var p = selectedPatternBody(params.seedFeatureId);
  if (!p) { flash(t("quickNeedPart")); return false; }
  if(params.scope==="feature"){
    var seed=(E.def.features || []).find(function(item){return item.id===params.seedFeatureId;});
    if(!seed?.inputs?.[0]){flash("Select the feature to repeat in the history tree");return false;}
    pushUndo(t("quickPattern"));
    try{var hostId=cutTargetFeatureId(p);createFeatureDefinition(E.def,"pattern",{inputs:[hostId],references:{sketches:[],features:[hostId],topology:[],references:[]},params:params});queueExactMesh(p);refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var curveSketch=params.mode==="curve"?patternCurveSketch():null;
  /* The path is baked into the feature before it is created, so a reload
     rebuilds the same run of copies without the sketch having to be selected
     again — and so a later edit of the sketch does not silently re-aim it. */
  if(params.mode==="curve"){
    params=resolvePatternCurvePath(params);
    if(curvePatternPath(params).length<2){flash(t("patternNeedCurve"));return false;}
  }
  pushUndo(t("quickPattern"));
  var feature;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"pattern",{inputs:[source],references:{sketches:curveSketch?[curveSketch.id]:[],features:[source],topology:[],references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var circularStep=circularPatternStepDegrees(params,count)*Math.PI/180,placements=patternPlacements(params);
  if(!placements.length){H.discard();flash(t("patternNeedCurve"));return false;}
  layPatternCopies(p,params,feature,placements,circularStep,addPart);
  if(E.authoring.patternOverlap && !params.mergeResult)flash(t("livePatternOverlapHint"));
  refreshAll(); return true;
}

function featureReferenceOptions(type,state) {
  if(type==="helix-reference"){
    var selectedPaths=selectedSketchIds(),pathId=selectedPaths[selectedPaths.length>1?1:0];
    var pathSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===pathId;});
    return [{value:"",label:pathSketch?.name || t("sweepPathSketch")}].concat(documentHelixRecords().map(function(record){
      var owner=(E.def.features || []).find(function(feature){return feature.id===record.featureId;});
      return {value:record.id,label:(owner && owner.name) || record.name || record.id};
    }));
  }
  var expected=type==="axis-reference"?"axis":"plane";
  var choices=(E.def.references || []).filter(function(reference){return reference.type===expected;}).map(function(reference){return {value:reference.id,label:reference.name || reference.id};});
  if(type==="axis-reference" && ["revolve","revolveCut"].includes(state?.type)){
    if(isStandaloneSketchAxisRevolve(state.params))
      return [{value:state.params.axis,label:t("revolveStoredAxis")}];
    var sketch=state.id?sketchById(E.def,state.params.sketchId):ensureSketch(E.def);
    (sketch?.entities || []).forEach(function(entity,index){
      if(entity.type!=="line" || entity.projectedCurve)return;
      var endpoints=[entity.a,entity.b].map(id=>sketch.points.find(p=>p.id===id));
      var location=endpoints.every(Boolean)?endpoints.map(p=>"("+modelLengthText(p.x)+", "+modelLengthText(p.y)+")").join(" → "):"";
      choices.push({value:sketchAxisReference(entity.id),label:(entity.construction?t("revolveCenterline"):t("revolveSketchLine"))+" "+(index+1)+"  "+location});
    });
    var current=featureReferenceValue(state,"axis-reference");
    if(isSketchAxis(current) && !choices.some(choice=>choice.value===current))
      choices.push({value:current,label:t("revolveMissingAxis")});
  }
  return choices;
}

function featureExtrusionExtentText(type,state,params) {
  if(!['extrude','extrudeCut'].includes(type))return '';
  if(!['blind','mid-plane'].includes(params.endCondition || 'blind'))return '';
  var reference=state.references?.sketches?.[0],sketchId=params.sketchId || (typeof reference==='string'?reference:reference?.id);
  var sketch=sketchId?(E.def.sketches || []).find(function(item){return item.id===sketchId;}):!state.id?ensureSketch(E.def):null;
  if(!sketch)return '';
  var axis=planeAxis(sketch.plane),local=sketch.frameSpace==='local'&&sketch.frame;
  if(sketch.frame&&!local)return '';
  var principal=local || !sketch.frame?.normal?1:Math.sign(sketch.frame.normal[axis] || 1);
  var direction=(params.direction==='reverse'?-1:1)*principal;
  var plane=local?0:Number(sketch.offset || 0),offset=Number(params.offset || 0),depth=Number(params.depth);
  if(![plane,offset,depth].every(Number.isFinite)||depth<=0)return '';
  var center=plane+direction*offset,symmetric=params.symmetric || params.endCondition==='mid-plane';
  var from=symmetric?center-direction*depth/2:center,to=symmetric?center+direction*depth/2:center+direction*depth;
  var unit=modelLengthUnit(),length=function(value){return formatDocumentLength(value,unit)+' '+unit;};
  return (local?t('featureExtentSketchNormal'):tf('featureExtentPlane',{axis:axis.toUpperCase(),plane:length(plane)}))+' · '+tf('featureExtentStartEnd',{start:length(from),end:length(to)});
}

function renderFeatureParameterForm(host,type,state,onLive) {
  var extentNote=null,positionNote=null;
  function showCylindricalPosition(params){
    if(!positionNote)return;
    positionNote.hidden=params.cylinderPlacementMethod!=='constraints';if(positionNote.hidden)return;
    try{
      var graph=cylindricalHolePlacement(params,E.def,{allowUnderdefined:true}).positionGraph;
      var pointText=Object.entries(graph.points).map(function(pair){var p=pair[1];return pair[0]+' ('+[p.x,p.y,p.z].map(v=>modelLengthText(v,5)).join(', ')+')';}).join(' · ');
      positionNote.textContent=graph.status+' · '+graph.degreesOfFreedom+' DOF · maximum residual '+graph.maxResidual.toExponential(2)+' cm · '+pointText+' '+modelLengthUnit()+'. Construction A→B. A coincident with top-axis center; B on top plane; enabled OnSurface / AlongZ / AlongY relations drive the native hole. This is a bounded 3D point graph, not a general 3D sketch or generated hole-profile sketch.';
    }catch(error){positionNote.textContent=String(error.message || error);}
  }
  var controls=renderFeatureParameterFormCore(host,type,state,function(next){
    if(extentNote)extentNote.textContent=featureExtrusionExtentText(type,state,next.params);
    showCylindricalPosition(next.params);
    if(onLive)onLive(next);
  },{
    el:el,
    units:{length:modelLengthUnit(),angle:E.def?.context?.units?.angle || "deg"},
    referenceOptions:function(fieldType){return featureReferenceOptions(fieldType,state);},
    featureSeeds:(E.def.features || []).filter(function(feature,index,features){var current=features.findIndex(function(item){return item.id===state.id;});return !feature.suppressed && FEATURE_PATTERN_SEED_TYPES.includes(feature.type) && feature.inputs?.length && (current<0 || index<current);}).map(function(feature){return {value:feature.id,label:feature.name || feature.type};}),
    advancedLabel:t("featureMoreOptions"),
  });
  if(type==="revolve" && isStandaloneSketchAxisRevolve(state.params)){
    var thin=controls.find(control=>control.field.key==="thinFeature");
    thin?.input.closest(".md-quick-field")?.appendChild(el("small","md-note",t("revolveStoredThinHint")));
  }
  if(type==='hole' && state.params?.cylindricalSource){
    positionNote=el('output','md-note');positionNote.setAttribute('aria-live','polite');positionNote.setAttribute('data-cylindrical-position-graph','');
    host.appendChild(positionNote);showCylindricalPosition(state.params);
  }
  if(['extrude','extrudeCut'].includes(type)){
    var offsetControl=controls.find(function(control){return control.field.key==='offset';});
    var offsetRow=offsetControl?.input.closest('.md-quick-field');
    if(offsetRow){
      offsetRow.appendChild(el('small','md-note md-extrusion-extent-note',t('featureStartOffsetHint')));
      extentNote=el('output','md-note md-extrusion-extent-note',featureExtrusionExtentText(type,state,state.params));
      extentNote.setAttribute('aria-live','polite');extentNote.setAttribute('data-extrusion-extent','');
      offsetRow.appendChild(extentNote);
    }
  }
  if(type==="thread"){
    var preset=controls.find(function(control){return control.field.key==="threadPreset";});
    var syncPreset=function(changed){
      var unified=preset && preset.input.value==="unc-quarter-20",custom=preset && preset.input.value==="custom";
      controls.forEach(function(control){
        var key=control.field.key,fixed={diameterMm:6.35,pitchMm:1.27,mode:"cosmetic",series:"coarse",useFitLimits:false};
        if(["series","toleranceClass","useFitLimits"].includes(key)){var wrap=control.input.closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-hidden",!!custom);}
        if(Object.prototype.hasOwnProperty.call(fixed,key)){
          control.input.disabled=!!unified || !!custom && ["mode","series","useFitLimits"].includes(key);
          if(custom && ["mode","useFitLimits"].includes(key)){state.params[key]=fixed[key];if(control.input.type==="checkbox")control.input.checked=false;else control.input.value=String(fixed[key]);}
          if(unified){state.params[key]=fixed[key];if(control.input.type==="checkbox")control.input.checked=false;else control.input.value=String(fixed[key]);}
        }
        if(key==="toleranceClass"){
          control.input.disabled=!!custom;
          if(custom){control.input.value="";state.params[key]="";}
          control.input.placeholder=unified?"2A / 2B":"6g / 6H";
          if(changed){control.input.value="";state.params[key]="";}
        }
      });
    };
    syncPreset(false);
    if(preset)preset.input.addEventListener("change",function(){syncPreset(true);});
  }
  return controls;
}

function featureField(host,field,value) {
  return featureFieldCore(host,field,value,{
    el:el,
    units:{length:modelLengthUnit(),angle:E.def?.context?.units?.angle || "deg"},
    referenceOptions:featureReferenceOptions,
  });
}

function setFeatureReferencesFromForm(feature,referenceValues) {
  if(referenceValues.axis && ["revolve","revolveCut"].includes(feature.type))
    feature.params.axis=revolvePreviewAxis(feature.params,referenceValues);
  feature.references ||= {};feature.references.references ||= [];
  var retained=feature.references.references.filter(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return !(String(id||"").indexOf("axis:")===0&&referenceValues.axis)&&!(String(id||"").indexOf("plane:")===0&&referenceValues.plane);});
  if(referenceValues.axis)retained.push(referenceValues.axis);if(referenceValues.plane)retained.push(referenceValues.plane);feature.references.references=retained;
}

function selectedFeatureIds() {
  var selected=(E.authoring.featureSelection || []).slice();
  // Explicit history nodes are the complete requested inputs. Adding a
  // selected body's original boss duplicated it after its finished head.
  var part=selectedSolid();
  if(!selected.length && part){var head=cutTargetFeatureId(part) || part.featureId;if(head)selected.push(head);}
  return selected;
}

function selectedSketchIds() {
  var loftSections=activeLoftCreation()?.loftSectionIds;
  if(loftSections)return loftSections.slice();
  var selected=(E.authoring.sketchSelection || []).filter(function(id){return (E.def.sketches || []).some(function(sketch){return sketch.id===id;});});
  var active=ensureSketch(E.def);if(active&&!selected.includes(active.id))selected.push(active.id);return selected;
}

function activeLoftCreation() {
  const authoring=E.authoring, state=authoring?.featurePreviewState;
  return authoring?.phase==="model" && authoring.featureType==="loft" && !authoring.featureEdit &&
    state?.type==="loft" && state.setLoftSections ? state : null;
}

// every helix a sweep can follow, once each
function documentHelixRecords() {
  var all=(E.def.referenceGeometry || []).concat(E.def.references || []),seen=new Set(),records=[];
  all.forEach(function(item){
    if(!item || seen.has(item.id))return;
    var helical=item.type==="reference_helix" || item.type==="helix" || /helix/i.test(String(item.id || ""));
    if(helical){seen.add(item.id);records.push(item);}
  });
  return records;
}

/* A sweep edited to follow another helix: its rebuild reads sketchSources, its
   ordering reads references, and the part's merge carries its own copy — all
   three move to the chosen helix, or the Path row would change nothing. */
function retargetSweepHelix(feature) {
  var params=feature && (feature.type==="sweep" || feature.type==="sweepCut") ? feature.params || {} : null,sources=params && params.sketchSources;
  if(!params || !params.helixId || !sources || !sources.helixId || sources.helixId===params.helixId)return;
  var helix=documentHelixRecords().find(function(record){return record.id===params.helixId;});
  if(!helix)return;
  var previous=sources.helixId,moved=function(value){return {...value,helixId:helix.id,helixFeatureId:helix.featureId};};
  params.sketchSources=moved(sources);
  feature.references ||= {};
  if(feature.type==="sweepCut" && helix.featureId){
    feature.references.features=(feature.references.features || []).filter(function(id){return id!==sources.helixFeatureId;});
    if(!feature.references.features.includes(helix.featureId))feature.references.features.push(helix.featureId);
  }
  feature.references.references=(feature.references.references || []).map(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return id===previous?helix.id:reference;});
  (E.def.parts || []).forEach(function(part){(part.merges3d || []).concat(part.cuts3d || []).forEach(function(entry){if(entry.featureId===feature.id && entry.sketchSources)entry.sketchSources=moved(entry.sketchSources);});});
}

function sweepHelixRecord(inputParams) {
  inputParams=inputParams || {};
  var id=inputParams.helixId,records=documentHelixRecords();
  if(id){var selected=records.find(function(item){return item.id===id;});if(selected)return selected;}
  if(records.length===1)return records[0];
  var feature=(E.def.features || []).find(function(item){return item && (item.type==="helix" || /helix|threadpath/i.test(String(item.name || ""))) && (!id || item.id===id);});
  if(feature){
    try{return {...helixFromSketch(E.def,feature.params || {}),id:feature.id,type:"reference_helix",featureId:feature.id};}
    catch(error){var raw=feature.params || {};if(Number(raw.radius)>0 && (Number(raw.pitch)>0 || Number(raw.height)>0))return {...raw,id:feature.id,type:"reference_helix",featureId:feature.id};}
  }
  return null;
}

function createMultiSketchFeature(type, values, ids=selectedSketchIds()) {
  var inputParams=(values && values.params) || values || {};
  // the form's Path row said "second selected sketch": no helix, whatever exists
  var sketchPath=type==="sweep" && inputParams.helixId==="";
  if(type==="sweepCut")sketchPath=inputParams.helixId==="";
  var helix=sketchPath?null:type==="sweep"?sweepHelixRecord(inputParams):selectedHelixRecord();
  if(type==="sweepCut" && !sketchPath)helix=sweepHelixRecord(inputParams);
  if(type==="sweepCut" && inputParams.helixId && helix?.id!==inputParams.helixId)helix=null;
  if(type==="sweepCut" && !sketchPath && inputParams.helixId && !helix){flash(t("sweepNeed"));return false;}
  if(type==="sweepCut" && !sketchPath && helix && ids.length===1)return createHelixSweepCut(helix,inputParams,ids[0]);
  /* The confirmation corner can clear the transient datum focus while it
     reads the form. Keep the SolidWorks-style one-sketch sweep bound to the
     helix captured when the command opened, then resolve that stable id from
     the document at commit time. */
  if(type==="sweep" && !sketchPath && !helix && inputParams.helixId){
    helix=(E.def.referenceGeometry || []).concat(E.def.references || []).find(function(item){return item && item.id===inputParams.helixId;}) || null;
    if(!helix){
      var helixFeature=(E.def.features || []).find(function(item){return item && item.id===inputParams.helixId && item.type==="helix";});
      if(helixFeature){var hparams=helixFeature.params || {};try{helix={...helixFromSketch(E.def,hparams),id:helixFeature.id,type:"reference_helix",featureId:helixFeature.id};}catch(error){helix={...hparams,id:helixFeature.id,type:"reference_helix",featureId:helixFeature.id};}}
    }
  }
  if(type==="sweep" && !sketchPath && ids.length===1 && !helix){
    var fallbackFeature=(E.def.features || []).find(function(item){return item && (item.type==="helix" || /helix|threadpath/i.test(String(item.name||"")));});
    if(fallbackFeature){var fp=fallbackFeature.params || {};helix={...fp,id:fallbackFeature.id,type:"reference_helix",featureId:fallbackFeature.id};}
  }
  if(type==="sweep" && !sketchPath && inputParams.sweepPathMode==="helix" && !helix){flash(t("sweepNeed"));return false;}
  if(type==='sweep' && !sketchPath && helix && inputParams.profileMode==='circular'){
    var circularParams={...featureDefaults(type),...inputParams},circularSources={kind:'circular-helix-sweep',diameter:circularParams.profileDiameter,helixId:helix.id,helixFeatureId:helix.featureId};
    var circularUndoPushed=false;
    try{
      Object.assign(circularParams,circularHelixSweepProfile(helix,circularParams.profileDiameter));circularParams.sketchSources=circularSources;
      pushUndo('Circular helix sweep');
      circularUndoPushed=true;
      var circularFeature=createFeatureDefinition(E.def,type,{inputs:[],references:{sketches:[],features:helix.featureId?[helix.featureId]:[],topology:[],references:[helix.id]},params:circularParams});
      var circularHost=mergeTargetBody(kernelRecipeBounds(type,circularParams),circularParams);
      if(circularHost){
        var circularParentId=cutTargetFeatureId(circularHost);
        circularFeature.inputs=[circularParentId];
        circularFeature.references.features=[circularParentId,...(helix.featureId?[helix.featureId]:[])];
        reconnectLaterBodyConsumers(E.def,circularFeature);
        circularHost.merges3d=circularHost.merges3d || [];
        circularHost.merges3d.push({kind:"sweep",profile:cloneData(circularParams.profile),path:cloneData(circularParams.path),pathSegments:cloneData(circularParams.pathSegments),profileSegments:cloneData(circularParams.profileSegments),orientation:circularParams.orientation,twistAngle:circularParams.twistAngle,scale:circularParams.scale,sketchSources:circularSources,featureId:circularFeature.id});
        invalidatePartMeshAfterEdit(circularHost);
        E.sel=circularHost;queueExactMesh(circularHost);
      }else E.sel=addKernelBodyPart(circularFeature,type,circularParams,circularSources) || E.sel;
      refreshAll();return true;
    }catch(error){if(circularUndoPushed)H.discard();flash(String(error.message || error));return false;}
  }
  if(type==="sweep" && !sketchPath && (inputParams.sweepPathMode==="helix" || sweepUsesHelixPath(ids.length, helix))){
    var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===ids[0];});
    var profileRun=analyzeSketchProfiles(profileSketch),profileLoop=profileRun.profiles[0];
    if(!profileLoop){flash(t("sweepNeed"));return false;}
    var params={...featureDefaults(type),...((values && values.params) || values || {})};
    params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profileSketch,point.u,point.v);});
    Object.assign(params,helixSweepPath(helix));
    var helixSources={kind:"sweep",profile:{sketchId:profileSketch.id,entityIds:(profileLoop.entityIds || []).slice()},helixId:helix.id,helixFeatureId:helix.featureId};
    params.sketchSources=cloneData(helixSources);
    params.helix={origin:helix.origin,axis:helix.axis,radius:helix.radius,radiusEnd:helix.radiusEnd,pitch:helix.pitch,turns:helix.turns,height:helix.height,handedness:helix.handedness,startAngle:helix.startAngle,...(helix.pitchMode==='variable'?{pitchMode:helix.pitchMode,pitchRegions:cloneData(helix.pitchRegions)}:{})};
    pushUndo(t("createFeature")+" "+featureTypeLabel(type));
    var helixFeature=null;
    try{helixFeature=createFeatureDefinition(E.def,type,{references:{sketches:[profileSketch.id],features:[],topology:[],references:[helix.id]},params:params});}
    catch(error){H.discard();flash(String(error.message||error));return false;}
    var helixHost=mergeTargetBody(kernelRecipeBounds(type,params),params);
    if(helixHost){
      var parentId=cutTargetFeatureId(helixHost);helixFeature.inputs=[parentId];helixFeature.references.features=[parentId];reconnectLaterBodyConsumers(E.def,helixFeature);
      helixHost.merges3d=helixHost.merges3d || [];
      helixHost.merges3d.push({kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:helixSources,featureId:helixFeature && helixFeature.id || undefined});
      invalidatePartMeshAfterEdit(helixHost);
      E.sel=helixHost;queueExactMesh(helixHost);
    } else E.sel=addKernelBodyPart(helixFeature,type,params,helixSources) || E.sel;
    refreshAll();return true;
  }
  if(type==="sweep" && inputParams.profileMode==="circular"){
    var params={...featureDefaults(type),...(values?.params || values)},pathSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===ids[0];});
    if(!pathSketch){flash("Select a path sketch");return false;}
    var sources={kind:"circular-sweep",diameter:params.profileDiameter,path:{sketchId:pathSketch.id,entityIds:pathSketch.entities.filter(function(e){return !e.construction;}).map(function(e){return e.id;})}};
    try{Object.assign(params,circularSweepProfile(pathSketch,params.profileDiameter,sources.path.entityIds));}catch(error){flash(String(error.message || error));return false;}
    params.sketchSources=sources;pushUndo("Circular sweep");
    try{var feature=createFeatureDefinition(E.def,type,{inputs:[],references:{sketches:[pathSketch.id],features:[],topology:[],references:[]},params:params});E.sel=addKernelBodyPart(feature,type,params,sources) || E.sel;refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var required=type==="loft"?2:2;
  if(ids.length<required){flash(featureTypeLabel(type)+" "+t("featureNeedsSketches"));return false;}
  var refs=ids.slice(0,type==="sweep"||type==="sweepCut"?2:ids.length),params={...featureDefaults(type),...((values && values.params) || values || {})},sources=null;
  if(type==="sweep"||type==="sweepCut"){
    var profile=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[0];}),path=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[1];});
    var profileRun=analyzeSketchProfiles(profile),profileLoop=profileRun.profiles[0];
    var sampledPath=sampleSketchPath(path);
    if(!profileLoop||!sampledPath){flash(t("sweepNeed"));return false;}
    params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profile,point.u,point.v);});params.path=sampledPath;params.pathSegments=sketchPathSegments(path);params.profileSegments=sketchPathSegments(profile,profileLoop.entityIds);
    sources=sweepSourceRecord(profile,profileLoop.entityIds,path);params.sketchSources=cloneData(sources);
  } else {
    var sectionSketches=refs.map(function(id){return (E.def.sketches || []).find(function(item){return item.id===id;});});
    var sectionSources=sectionSketches.map(function(sketch,index){var loop=sketch?analyzeSketchProfiles(sketch).profiles[0]:null;return loftSectionSourceRecord(sketch,loop && loop.entityIds || [],index===0 || index===sectionSketches.length-1);});
    if(sectionSources.some(function(section){return !section;})){flash(t("loftNeed"));return false;}
    sources=loftSourceRecord(sectionSketches,sectionSources);
    var resolvedLoft=resolveSweptSources(E.def,sources,resolveProfilePoints);
    if(!resolvedLoft){flash(t("loftNeed"));return false;}
    Object.assign(params,resolvedLoft);params.sketchSources=cloneData(sources);
  }
  /* Sweep Cut removes the very solid Sweep would have added: same two sketches,
     same params record, and the tool lands on the target's cut list instead of
     on the document as a body. */
  var cutTarget=null,cutTargetId=null;
  if(type==="sweepCut" || type==="loft" && params.operation==="subtract"){
    if(type==="loft" && params.solid===false){flash(t("loftCutSolid"));return false;}
    cutTarget=type==="loft" ? (selectedSolid() || (activeParts(E.def).length===1 ? activeParts(E.def)[0] : null)) : cutTargetBody();
    if(!cutTarget){flash(t("extrudeCutNeed"));return false;}
    if(!partSupportsExactMesh(cutTarget)){flash(t("cutNeedExactBody"));return false;}
    cutTargetId=cutTargetFeatureId(cutTarget);
    if(!cutTargetId){flash(t("extrudeCutNeed"));return false;}
  }
  pushUndo(t("createFeature")+" "+featureTypeLabel(type));
  var created=null;
  try{created=createFeatureDefinition(E.def,type,{inputs:cutTargetId?[cutTargetId]:[],references:{sketches:refs,features:cutTargetId?[cutTargetId]:[],topology:[],references:[]},params:params});}
  catch(error){H.discard();flash(String(error.message||error));return false;}
  /* The whole point of the kernel-body kind. Before it, this branch created a
     feature row, an exact BREP run that only STEP export could see, and NO
     visible geometry — sweep and loft added a step and drew nothing. */
  var mergeHost=cutTarget?null:mergeTargetBody(kernelRecipeBounds(type,params),params);
  if(mergeHost){
    var mergeParent=cutTargetFeatureId(mergeHost);created.inputs=[mergeParent];created.references.features=[mergeParent];reconnectLaterBodyConsumers(E.def,created);
    mergeHost.merges3d=mergeHost.merges3d || [];
    mergeHost.merges3d.push(type==="loft"
      ? {kind:"loft",sections:cloneData(params.sections),sectionSegments:cloneData(params.sectionSegments),solid:params.solid!==false,ruled:!!params.ruled,matchProfiles:params.matchProfiles!==false,continuity:params.continuity,tolerance:params.tolerance,sketchSources:sources,featureId:created && created.id || undefined}
      : {kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:created && created.id || undefined});
    invalidatePartMeshAfterEdit(mergeHost);
    E.sel=mergeHost;queueExactMesh(mergeHost);refreshAll();return true;
  }
  if(!cutTarget)E.sel=addKernelBodyPart(created,type,params,sources) || E.sel;
  if(cutTarget){
    cutTarget.cuts3d=cutTarget.cuts3d || [];
    cutTarget.cuts3d.push(type==="loft" ? {kind:"loft",sections:cloneData(params.sections),sectionSegments:cloneData(params.sectionSegments),solid:true,ruled:!!params.ruled,matchProfiles:params.matchProfiles!==false,continuity:params.continuity,tolerance:params.tolerance,sketchSources:sources,featureId:created.id} : {kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:created && created.id || undefined});
    invalidatePartMeshAfterEdit(cutTarget);
    E.sel=cutTarget;queueExactMesh(cutTarget);
  }
  refreshAll();return true;
}

function createHelixSweepCut(helix,inputParams,sketchId) {
  var target=cutTargetBody(),targetId=target && cutTargetFeatureId(target);
  if(!target || !targetId){flash(t("extrudeCutNeed"));return false;}
  if(!partSupportsExactMesh(target)){flash(t("cutNeedExactBody"));return false;}
  var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===sketchId;});
  var profileRun=analyzeSketchProfiles(profileSketch),profileLoop=profileRun.profiles[0];
  if(!profileLoop){flash(t("sweepNeed"));return false;}
  var params={...featureDefaults("sweepCut"),...inputParams},sources={kind:"sweep",profile:{sketchId:sketchId,entityIds:(profileLoop.entityIds || []).slice()},helixId:helix.id,helixFeatureId:helix.featureId};
  params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profileSketch,point.u,point.v);});
  Object.assign(params,helixSweepPath(helix));
  params.sketchSources=sources;params.helixId=helix.id;params.sweepPathMode="helix";
  params.helix={origin:helix.origin,axis:helix.axis,radius:helix.radius,radiusEnd:helix.radiusEnd,pitch:helix.pitch,turns:helix.turns,height:helix.height,handedness:helix.handedness,startAngle:helix.startAngle,...(helix.pitchMode==='variable'?{pitchMode:helix.pitchMode,pitchRegions:cloneData(helix.pitchRegions)}:{})};
  pushUndo(t("createFeature")+" "+featureTypeLabel("sweepCut"));
  try{
    var feature=createFeatureDefinition(E.def,"sweepCut",{inputs:[targetId],references:{sketches:[sketchId],features:[targetId,...(helix.featureId?[helix.featureId]:[])],topology:[],references:[helix.id]},params:params});
    target.cuts3d=target.cuts3d || [];
    target.cuts3d.push({kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:feature.id});
    invalidatePartMeshAfterEdit(target);E.sel=target;queueExactMesh(target);refreshAll();return true;
  }catch(error){H.discard();flash(String(error.message || error));return false;}
}

function selectedHelixRecord() {
  var id=E.selectedReferenceId;
  var records=[];var seen=new Set();
  (E.def && E.def.referenceGeometry || []).concat(E.def && E.def.references || []).forEach(function(item){
    var looksHelical=item && ((item.type==="reference_helix" || item.type==="helix") || /helix/i.test(String(item.id||"")) || (item.pitch!=null && item.turns!=null && item.radius!=null && item.axis));
    if(looksHelical && !seen.has(item.id)){seen.add(item.id);records.push(item);}
  });
  if(id){var selected=records.find(function(item){return item.id===id;});if(selected)return selected;}
  /* A single helix is an unambiguous path for the SolidWorks-style
     one-sketch sweep. The tree can clear datum focus when the profile is
     added with a modifier key, so retain the workflow instead of falling
     back to the two-sketch requirement. */
  if(records.length===1)return records[0];
  if(!records.length){
    var feature=(E.def && E.def.features || []).find(function(item){return item && item.type==="helix";});
    if(feature){
      try{return {...helixFromSketch(E.def,feature.params || {}),id:feature.id,type:"reference_helix",featureId:feature.id};}
      catch(error){
        var raw=feature.params || {};
        if(Number(raw.radius)>0 && (Number(raw.pitch)>0 || Number(raw.height)>0))return {...raw,id:feature.id,type:"reference_helix",featureId:feature.id};
      }
    }
  }
  return null;
}

async function createHoleFeature(options) {
  if(E._holeBuildPending)return false;
  var params={...featureDefaults("hole"),...(options || {}),displayUnit:modelLengthUnit()};
  var target=selectedSolid() || (E.def && activeParts(E.def)[activeParts(E.def).length-1]);
  if(!target){flash(t("cmdNeedSolid"));return false;}
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  var radialSource=params.cylindricalSource || cylindricalHoleSource(E.def,face);
  if(radialSource){
    params.cylindricalSource=radialSource;params.layout='sketch';
    try{cylindricalHolePlacement(params,E.def);}catch(error){flash(String(error.message || error));return false;}
  }
  if(face && face.descriptor && face.descriptor.surface && face.descriptor.surface!=="plane" && !radialSource){flash(t("needPlanarFace"));return false;}
  var holeSketchPair=null;
  if(params.separateHoleSketches){
    if(!isCanonicalAuthoring() || !radialSource || params.cylinderPlacementMethod!=='constraints' || params.holeType!=='counterbore'){
      flash('Separate hole sketches require a constrained cylindrical counterbore in a parametric part');return false;
    }
    try{holeSketchPair=createHoleWizardSketchPair(params,E.def,{positionId:uid('sk'),profileId:uid('sk')});params=holeSketchPair.params;}
    catch(error){flash(String(error.message || error));return false;}
  }
  var holeCreationSnapshot=holeSketchPair?cloneData(E.def):null;
  function restoreHoleSketchCreation(){
    if(!holeCreationSnapshot)return;
    Object.keys(E.def).forEach(function(key){delete E.def[key];});Object.assign(E.def,cloneData(holeCreationSnapshot));
  }
  var profile=closedSketchProfile();
  if(!profile && !face && !holePositionPointIds(ensureSketch(E.def)).length){flash(t("holeNeed"));return false;}
  if(face && !radialSource && !attachSketchToSelectedFace()){flash(t("needPlanarFace"));return false;}
  var wizard=holeWizardSolids(params);
  var diameter=Math.max(.1, Number(wizard.hole.diameter)||Number(params.diameter)||1);
  profile=closedSketchProfile();
  if(!params.layout || params.layout==="sketch"){
    var positionIds=holePositionPointIds(ensureSketch(E.def));
    if(positionIds.length){params.holePositionPointIds=positionIds;profile={entityIds:[]};}
  }
  if(radialSource){profile={entityIds:[]};}
  if(!profile){
    pushUndo(t("holeWizard"));
    var placementCircle=addSketchCircle({u:0,v:0},{u:Math.max(.25,diameter/2),v:0});
    if(!placementCircle){H.discard();flash(t("holeNeed"));return false;}
    placementCircle.fixed=true;
    sketchPoint(ensureSketch(E.def),placementCircle.c).fixed=true;
    resolveSketch(false);
    profile=closedSketchProfile();
    if(!profile){H.discard();flash(t("holeNeed"));return false;}
  } else {
    pushUndo(t("holeWizard"));
  }
  var sketch=ensureSketch(E.def);
  if(holeSketchPair){
    E.def.sketches.push(holeSketchPair.position,holeSketchPair.profile);
    recordSketchInHistory(E.def,holeSketchPair.position);
    recordSketchInHistory(E.def,holeSketchPair.profile);
    sketch=holeSketchPair.profile;
  }
  var targetFeatureId=cutTargetFeatureId(target);
  var topology=face ? [cloneData(face)] : [];
  recordSketchInHistory(E.def,sketch);
  var feature=null;
  var callout=holeCallout(params);
  if(isCanonicalAuthoring()){
    try{
      feature=createFeatureDefinition(E.def,"hole",{
        inputs:targetFeatureId ? [targetFeatureId] : [],
        references:{sketches:holeSketchPair?[holeSketchPair.position.id,holeSketchPair.profile.id]:radialSource?[]:[sketch.id],features:targetFeatureId ? [targetFeatureId] : [],topology:topology,references:[],profileEntityIds:profile.entityIds},
        params:{...params,depth:wizard.hole.depth,diameter:diameter,profileEntityIds:profile.entityIds,sketchId:sketch.id,operation:"subtract",callout:callout},
      });
    }catch(error){restoreHoleSketchCreation();H.discard();flash(String(error.message||error));return false;}
  }
  var candidate=cloneData(target),records,verified=null,thread=null,documentAtStart=E.def;
  var historyAtStart=H.tree().find(function(node){return node.current;})?.i;
  E._holeBuildPending=true;
  try {
    records=holeCutRecords(params,sketch,profile.entityIds,E.def);
    records.forEach(function(record){record.featureId=feature && feature.id;});
    if(wizard.hole.holeType.startsWith("tap")){
      var bounds=partBounds(target),threadPlacement=holeToolPlacements(records[0].params,{min:{x:bounds.x0,y:bounds.y0,z:bounds.z0},max:{x:bounds.x1,y:bounds.y1,z:bounds.z1}})[0];
      thread=holeWizardThread(params,{origin:threadPlacement.origin,axis:threadPlacement.axis,bounds});
    }
    candidate.cuts3d=(candidate.cuts3d || []).concat(records);
    verified=await exactDisplayBody(candidate);
    if(E.def!==documentAtStart || !E.def.parts.includes(target) || H.tree().find(function(node){return node.current;})?.i!==historyAtStart)throw new Error("The document changed while the hole was being checked; apply it again");
    target.cuts3d=candidate.cuts3d;
    invalidatePartMeshAfterEdit(target);
    scheduleModelerDraft();
  } catch(error) {
    if(E.def===documentAtStart && H.tree().find(function(node){return node.current;})?.i===historyAtStart){if(holeSketchPair)restoreHoleSketchCreation();else if(feature)removeHistoryNode(E.def,"history:feature:"+feature.id);H.discard();}
    flash(String(error.message || error));return false;
  } finally {E._holeBuildPending=false;if(verified)verified.release();}
  if(thread){
    target.cosmeticThread=thread;
    target.threadGeometry=thread.threadGeometry;
  }
  E.authoring.featureType=null;E.authoring.phase="model";refreshAll();flash("✓ "+callout);return true;
}

function circleLoopAt(u, v, r, segments) {
  var n=segments||24, loop=[], i;
  for(i=0;i<n;i++){var a=i*Math.PI*2/n;loop.push({u:u+Math.cos(a)*r,v:v+Math.sin(a)*r});}
  return loop;
}

function selectedCylindricalFace() {
  return (E.topologySelection || []).find(function(reference){
    return reference.kind==="face" && reference.descriptor && (reference.descriptor.surface==="cylinder" || !reference.descriptor.surface && Number(reference.descriptor.radius)>0);
  }) || null;
}

function selectedThreadStart() {
  var face=selectedCylindricalFace();
  if(face)return {face:face,placement:threadPlacementFromFace(face.descriptor)};
  var edges=(E.topologySelection || []).filter(function(reference){return reference.kind==='edge';}),target=selectedSolid();
  if(edges.length!==1 || !target)return null;
  var topology=topologyEntriesForPart(target),picked=edges[0];
  var current=topology.find(function(entry){return entry.kind==='edge' && entry.persistentId===picked.persistentId && entry.ownerFeatureId===picked.ownerFeatureId;});
  if(!current)return null;
  try{
    var start=threadPlacementFromCircularEdge(current,topology);
    var captured=threadPlacementFromCircularEdge(picked,topology),tolerance=Math.max(1e-6,current.descriptor.radius*1e-5);
    if(Math.hypot(start.origin.x-captured.origin.x,start.origin.y-captured.origin.y,start.origin.z-captured.origin.z)>tolerance)return null;
    return {face:topologyReferenceFromEntry(start.face),edge:topologyReferenceFromEntry(current),placement:{origin:start.origin,axis:start.axis}};
  }catch(error){return null;}
}

function createHelixFeature(options) {
  var params={...featureDefaults("helix"),...(options || {})};
  var face=selectedCylindricalFace();
  if(face && face.descriptor){
    params.radius=Number(face.descriptor.radius)||params.radius;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  var sketch=ensureSketch(E.def),circles=(sketch.entities || []).filter(function(e){return e.type==="circle"&&!e.construction;});
  if(!face&&circles.length===1){params.sketchId=sketch.id;params.circleId=circles[0].id;}
  var helixSpec;try{helixSpec=helixFromSketch(E.def,params);}catch(error){flash(error.message);return false;}
  pushUndo(t("opHelix"));
  var feature;
  try{
    if(isCanonicalAuthoring())feature=createFeatureDefinition(E.def,"helix",{references:{sketches:params.sketchId?[params.sketchId]:[],features:[],topology:face?[cloneData(face)]:[],references:[]},params:params});
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  E.def.referenceGeometry=E.def.referenceGeometry||[];
  E.def.referenceGeometry.push({...createHelix({name:t("opHelix"),...helixSpec}),featureId:feature?.id});
  refreshAll();flash("✓ "+t("helixAdded"));return true;
}

function createThreadFeature(options) {
  var params={...featureDefaults("thread"),...(options || {})};
  var start=selectedThreadStart(),pickedFace=start?.face;
  var target=selectedSolid();
  if(!pickedFace){flash(t("threadNeed"));return false;}
  var face=canonicalFeatureTopologyReferences(E.def,[cloneData(pickedFace)])[0];
  var placement=start.placement;
  var origin=placement.origin,axis=placement.axis;
  var targetFeatureId=target&&cutTargetFeatureId(target);
  var diameterMm=Number(params.diameterMm)||((face&&face.descriptor&&face.descriptor.radius||0)*20)||8;
  var spec=normalizeThreadSpec({...params,diameterMm:diameterMm,origin:origin,axis:axis,length:Number(params.length)||1.5});
  var check=validateThreadFeature(spec);
  if(!check.ok){flash(check.issues[0]&&check.issues[0].message||t("opThread"));return false;}
  var modeled=null;
  try{if(spec.mode==="modeled")modeled=modeledThreadSolid(spec);}catch(error){flash(String(error.message||error));return false;}
  pushUndo(t("opThread"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"thread",{
      inputs:targetFeatureId?[targetFeatureId]:[],
      references:{sketches:[],features:targetFeatureId?[targetFeatureId]:[],topology:canonicalFeatureTopologyReferences(E.def,start.edge?[cloneData(face),cloneData(start.edge)]:[cloneData(face)]),references:[]},
      params:{...params,...spec},
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  if(target){
    target.cosmeticThread=cosmeticThread(spec);
    target.threadGeometry=target.cosmeticThread.threadGeometry;
    if(spec.mode==="modeled")target.modeledThread=modeled;
  }
  refreshAll();flash("✓ "+threadCallout(spec));return true;
}

function createKnurlFeature(options) {
  var params={...featureDefaults("knurl"),...(options || {})};
  var face=selectedCylindricalFace();
  var target=selectedSolid();
  if(!face && !target){flash(t("knurlNeed"));return false;}
  if(face&&face.descriptor){
    params.diameterMm=Number(params.diameterMm)||((Number(face.descriptor.radius)||0)*20)||30;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  var check=validateKnurl(params);
  if(!check.ok){flash(check.issues[0]&&check.issues[0].message||t("opKnurl"));return false;}
  pushUndo(t("opKnurl"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"knurl",{
      inputs:target&&target.featureId?[target.featureId]:[],
      references:{sketches:[],features:target&&target.featureId?[target.featureId]:[],topology:face?[cloneData(face)]:[],references:[]},
      params:params,
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  if(target){target.knurl=normalizeKnurlSpec(params);target.knurlMesh=knurlBandMesh(target.knurl);}
  refreshAll();flash("✓ "+knurlCallout(params));return true;
}

function createInsertFeature(options) {
  var params={...featureDefaults("insert"),...(options || {})};
  var face=selectedCylindricalFace();
  if(face&&face.descriptor){
    params.innerMm=Number(params.innerMm)||((Number(face.descriptor.radius)||0)*20)||8;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  pushUndo(t("opInsert"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"insert",{
      references:{sketches:[],features:[],topology:face?[cloneData(face)]:[],references:[]},
      params:params,
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  addPart(Object.assign({id:uid()}, insertBody(params)));
  refreshAll();flash("✓ "+t("opInsert"));return true;
}

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

function toolboxOptionLabel(key) {
  var labels={ overlay:t("toolboxOverlay"), angle:t("toolboxAngle"), radius:t("toolboxRadius"), thread:t("toolboxThread"), drawerSideMm:t("toolboxDrawerSide") };
  return labels[key] || key;
}

function pickToolboxOptions(fam, keys, index, acc, done, onBack) {
  if(!keys || index>=keys.length){ done(acc); return; }
  var key=keys[index], values=fam.options[key];
  if(key==="overlay" && acc.overlay){ pickToolboxOptions(fam, keys, index+1, acc, done, onBack); return; }
  showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: toolboxOptionLabel(key) }), values.map(function(value){
    return {value:value,label:String(value)};
  }), function(item){
    acc[key]=item.value;
    pickToolboxOptions(fam, keys, index+1, acc, done, function(){
      pickToolboxOptions(fam, keys, index, acc, done, onBack);
    });
  }, { onBack: onBack });
}

function showToolboxPicker() {
  function chooseFamily() {
    var library=listToolboxLibrary();
    var items=[];
    if(lastToolboxPick){
      items.push({kind:lastToolboxPick.kind,label:lastToolboxPick.label,hint:t("toolboxRecent")});
    }
    library.forEach(function(cat){
      cat.families.forEach(function(fam){
        if(lastToolboxPick && fam.kind===lastToolboxPick.kind) return;
        items.push({kind:fam.kind,label:fam.label,hint:(TOOLBOX_CATEGORY_LABELS[cat.id] || cat.label)+" · "+fam.standard});
      });
    });
    showPickList(t("toolboxFastener"), t("toolboxKind"), items, function(famItem){
      var fam=toolboxFamily(famItem.kind);
      if(!fam) return;
      continueToolboxFamily(fam, chooseFamily);
    }, {
      searchable:true,
      filter:function(query, rows){
        if(!query) return rows;
        var kinds=new Set(searchToolbox(query).map(function(row){ return row.kind; }));
        return rows.filter(function(row){ return kinds.has(row.kind); });
      }
    });
  }
  chooseFamily();
}

function continueToolboxFamily(fam, onBackToFamilies) {
  pickToolboxSize(fam, function(sizeItem, seed){
    var acc=Object.assign({}, seed||{});
    if(fam.kind==="euro-hinge") acc.overlay=sizeItem.size || sizeItem.key;

    function afterOptions() {
      var payload=Object.assign({
        sizeKey:sizeItem.key || sizeItem.size,
        series:sizeItem.series || acc.series,
        key:sizeItem.key
      }, acc);
      var lengthChoices=lengthOptionsForSize(fam, sizeItem.size || sizeItem.key);
      if(fam.hasLength && lengthChoices.length){
        showPickList(t("toolboxFastener"), t("toolboxLength"), lengthChoices.map(function(mm){
          return {lengthMm:mm,label:(sizeItem.label||sizeItem.size||"")+" × "+mm,hint:mm===sizeItem.lengthMm?t("wfSuggested"):""};
        }), function(lenItem){ insertToolboxFastener(fam.kind, sizeItem.key || sizeItem.size, lenItem.lengthMm, payload); }, { onBack: function(){ continueToolboxFamily(fam, onBackToFamilies); } });
        return;
      }
      insertToolboxFastener(fam.kind, sizeItem.key || sizeItem.size, sizeItem.lengthMm, payload);
    }

    function pickOptions() {
      var optionKeys=fam.options?Object.keys(fam.options):[];
      if(optionKeys.length) pickToolboxOptions(fam, optionKeys, 0, acc, afterOptions, afterSize);
      else afterOptions();
    }

    function afterSize() {
      if(fam.kind==="tee-reducing"){
        var runKey=sizeItem.key || sizeItem.size;
        var run = PVC_D1785[runKey] || null;
        var branches=reducingBranchRows(run, PVC_D1785);
        if(!branches.length){ flash(t("toolboxNoBranch")); return; }
        showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: t("toolboxBranch") }), branches.map(function(item){
          return {key:item.key,size:item.row.size,label:item.row.size+" · Sch "+item.row.schedule,hint:"Ø "+item.row.odMm};
        }), function(branchItem){
          acc.branchKey=branchItem.key;
          acc.branchSize=branchItem.size;
          pickOptions();
        }, { onBack: function(){ continueToolboxFamily(fam, onBackToFamilies); } });
        return;
      }
      pickOptions();
    }

    afterSize();
  }, { onBack: onBackToFamilies, searchable: (fam.sizes || []).length > 12 });
}

function pickToolboxSize(fam, done, extra) {
  extra = extra || {};
  if(fam.sizesBySeries){
    var seriesKeys=Object.keys(fam.sizesBySeries);
    showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: t("toolboxSeries") }), seriesKeys.map(function(value){
      return {value:value,label:value};
    }), function(seriesItem){
      var sizes=fam.sizesBySeries[seriesItem.value] || [];
      showPickList(t("toolboxFastener"), t("toolboxSize"), sizes.map(function(row){
        return {kind:fam.kind,size:row.size,key:row.key,lengthMm:row.lengthMm,label:row.label||row.size,series:seriesItem.value};
      }), function(sizeItem){ done(sizeItem, {series:seriesItem.value}); }, {
        onBack: function(){ pickToolboxSize(fam, done, extra); },
        searchable: sizes.length > 12
      });
    }, { onBack: extra.onBack });
    return;
  }
  showPickList(t("toolboxFastener"), t("toolboxSize"), fam.sizes.map(function(row){
    return {kind:fam.kind,size:row.size,key:row.key,lengthMm:row.lengthMm,label:row.label||row.size,series:row.series};
  }), function(sizeItem){ done(sizeItem, {}); }, { onBack: extra.onBack, searchable: extra.searchable });
}

function showConfigurations() {
  var assemblyConfiguration=E.docType==="assembly";
  var configurationDocument=assemblyConfiguration?E.assembly:E.def;
  if(!configurationDocument)return;
  function documentIsCurrent(){return configurationDocument===(E.docType==="assembly"?E.assembly:E.def);}
  function refreshConfigurationGeometry(){
    if(assemblyConfiguration){solveAssembly({quiet:true});refreshAll();return;}
    refreshAll();
    // A circular sweep has no analytic stand-in. Switching a design-table row
    // clears its old mesh, so the exact kernel body must be queued explicitly.
    (configurationDocument.parts||[]).filter(function(part){return isKernelBody(part)&&part.sketchSources?.kind==="circular-sweep"&&!part.meshData;}).forEach(scheduleKernelBody);
    if(isCanonicalAuthoring())scheduleExactRestore();
  }
  ensureConfigurations(configurationDocument);
  var items=configurationDocument.configurations.map(function(cfg){
    var active=cfg.id===configurationDocument.activeConfiguration;
    var size=cfg.designTableValues;
    return {id:cfg.id,label:cfg.name+(active?" ●":""),hint:size?"Path Ø "+size.pathDiameterMm+" mm · profile Ø "+size.profileDiameterMm+" mm":active?t("configSaved"):Object.keys(cfg.parameterOverrides||{}).length+" overrides"};
  });
  if(isCanonicalAuthoring() && configurationDocument.designTable?.kind!=="circular-sweep")items.unshift({id:"__design_table__",label:"Edit design table",hint:"Configuration rows, driving dimensions and feature suppression"});
  if(circularSweepTableRows(configurationDocument))items.push({id:"__sweep_table__",label:"Edit circular-sweep design table",hint:"Default, Small, Medium and Large · path and profile diameters"});
  items.push({id:"__edit__",label:"Rename active configuration",hint:"Name and description"});
  items.push({id:"__capture__",label:"Update active configuration from model",hint:assemblyConfiguration?"Capture component poses, grounding, mate settings and suppression":"Capture current dimensions, feature settings, suppression, material and properties"});
  items.push({id:"__new__",label:"+ "+t("configNew")});
  showPickList(t("configurations"), t("configurations"), items, function(item){
    if(!documentIsCurrent())return;
    if(item.id==="__design_table__"){
      openDesignTable(configurationDocument,{
        isCurrent:documentIsCurrent,
        beforeCommit:function(){pushUndo("Design table");},
        afterCommit:function(activeChanged){
          if(activeChanged){syncSketchDrivenParts();refreshConfigurationGeometry();}
          else refreshAll();
        }
      });
      return;
    }
    if(item.id==="__capture__"){
      pushUndo(t("configurations"));
      updateConfiguration(configurationDocument,configurationDocument.activeConfiguration,{capture:true});
      refreshAll();flash("✓ Active configuration updated");return;
    }
    if(item.id==="__edit__"){
      var current=configurationDocument.configurations.find(function(cfg){return cfg.id===configurationDocument.activeConfiguration;});
      sheetForm("Configuration",[{key:"name",label:"Configuration name",value:current.name},{key:"description",label:"Description",value:current.description||""}],"Names identify configurations in parts, assemblies and drawings.").then(function(values){
        if(!values||!documentIsCurrent())return;
        pushUndo(t("configurations"));
        try{updateConfiguration(configurationDocument,current.id,values);refreshAll();flash("✓ Configuration renamed");}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });return;
    }
    if(item.id==="__sweep_table__"){
      var rows=circularSweepTableRows(configurationDocument);
      var fields=rows.flatMap(function(row,index){return [
        {key:"path"+index,label:row.name+" path Ø (mm)",value:String(row.pathDiameterMm)},
        {key:"profile"+index,label:row.name+" profile Ø (mm)",value:String(row.profileDiameterMm)}
      ];});
      sheetForm("Circular-sweep design table",fields,"Large profile: the book screenshot shows 5 mm; its written step 254 says 10 mm. Enter the value you intend.").then(function(values){
        if(!values||!documentIsCurrent())return;
        var edited=rows.map(function(row,index){return {name:row.name,pathDiameterMm:Number(values["path"+index]),profileDiameterMm:Number(values["profile"+index])};});
        pushUndo("Design table");
        try{setCircularSweepDesignTable(configurationDocument,edited);refreshConfigurationGeometry();flash("✓ Design table · 4 configurations");}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });
      return;
    }
    if(item.id==="__new__"){
      var name="Config "+(configurationDocument.configurations.length+1);
      sheetForm("New configuration",[{key:"name",label:"Configuration name",value:name},{key:"description",label:"Description",value:""}],assemblyConfiguration?"Captures component poses, grounding and mate settings. Add or edit mates, then update the active configuration to retain the edits.":"Captures the current model. Edit dimensions and feature settings normally, then update the active configuration to retain the edits.").then(function(values){
        if(!values||!documentIsCurrent())return;
        pushUndo(t("configurations"));
        try{var saved=captureConfiguration(configurationDocument,values);flash("✓ "+t("configSaved")+" · "+saved.name);refreshAll();}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });return;
    }
    pushUndo(t("configurations"));
    setActiveConfiguration(configurationDocument,item.id);
    refreshConfigurationGeometry();flash("✓ "+item.label.replace(" ●",""));
  });
}

// Keep the feature associative. The mesh projection and recorded boolean tool
// are derived from the very same profile/axis that the exact history resolves.
function resolvedRevolve(sketch,params) {
  if(!sketch)throw new Error("Feature profile is missing its sketch");
  var spec=resolveSketchProfile({sketches:[sketch]},params),basis=spec.axisBasis;
  var pts=spec.points;
  if(basis){
    assertSketchAxisProfile(spec);
    pts=pts.map(q=>axisMeridian(basis,q));
  }else if(params.useSketchPlane){
    var axis=params.axis || "y";
    pts=pts.map(function(q){var p=sketchWorldPoint(sketch,q.u,q.v);return {u:axis==='x'?Math.hypot(p.y,p.z):axis==='z'?Math.hypot(p.x,p.y):Math.hypot(p.x,p.z),v:p[axis]};});
  }
  var extent={axis:params.axis,angle:params.angle,direction:params.direction,symmetric:params.symmetric};
  return {
    projection:{...extent,axisBasis:basis || null,pts,
      revolveProfile:basis && spec.segments?.some(s=>s.type!=="line")?{points:spec.points,segments:spec.segments}:null},
    tool:{...extent,kind:"revolve",axisBasis:basis || null,profileFrame:spec.profileFrame || null,
      radialProfile:!!spec.radialProfile,segments:spec.segments,loop:spec.points}
  };
}

function preselectedRevolveAxis(){
  var selected=E.sselAuto?[]:selEntities(),line=selected.length===1 && selected[0];
  return line?.type==="line" && !line.projectedCurve && ensureSketch(E.def).entities.some(e=>e.id===line.id)
    ? sketchAxisReference(line.id):"axis:y";
}

function revolveContour(axis,thin=false){
  var sketch=ensureSketch(E.def),closed=thin?null:closedSketchProfile();
  if(closed && (!isSketchAxis(axis) || closed.entityIds.some(id=>sketchAxisReference(id)===axis)))return closed;
  var geometry=sketch;
  if(isSketchAxis(axis))geometry={...sketch,entities:sketch.entities.filter(e=>sketchAxisReference(e.id)!==axis)};
  var options={selectedIds:selEntities().map(e=>e.id)};
  if(thin)return analyzeSketchChains(geometry,options).chains[0];
  return geometry===sketch?closed:analyzeSketchProfiles(geometry,options).profiles[0];
}

function selectedRevolve(params) {
  var sketch=ensureSketch(E.def),axis=revolvePreviewAxis(params,{axis:params.axisReference});
  var profile=revolveContour(axis,params.thinFeature);
  if(!profile)throw new Error(t("quickNeedSketch"));
  var featureParams={...params,axis,sketchId:sketch.id,profileEntityIds:profile.entityIds};
  if(params.operation!=="subtract")featureParams.radialProfile=true;
  if(isSketchAxis(axis))featureParams.useSketchPlane=true;
  delete featureParams.axisReference;
  return {sketch,params:featureParams,...resolvedRevolve(sketch,featureParams)};
}

function createRevolveFeature(options) {
  var optionsWithDefaults={...featureDefaults("revolve"),useSketchPlane:true,...(typeof options==="number"?{angle:options}:options || {})};
  var result;try{result=selectedRevolve(optionsWithDefaults);}catch(error){flash(String(error.message || error));return false;}
  var {params,sketch,projection,tool}=result;
  pushUndo(t("opRevolve"));recordSketchInHistory(E.def,sketch);var feature;
  var axisReference=optionsWithDefaults.axisReference || "axis:y";
  try{feature=createFeatureDefinition(E.def,"revolve",{references:{sketches:[sketch.id],features:[],topology:[],references:[axisReference],profileEntityIds:params.profileEntityIds},params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var revolved={...projection,id:uid(),featureId:feature.id,kind:"rev",name:feature.name,x:0,z:0,seg:48,color:"#b89a6e",metal:.08,rough:.7,sketchDriven:true,sketchId:sketch.id,profileEntityIds:params.profileEntityIds};
  var revolveHost=mergeTargetBody(partBounds(revolved),params);
  if(revolveHost){
    var revolveTarget=cutTargetFeatureId(revolveHost);
    feature.inputs=[revolveTarget];feature.references.features=[revolveTarget];reconnectLaterBodyConsumers(E.def,feature);
    revolveHost.merges3d=revolveHost.merges3d || [];
    revolveHost.merges3d.push({...tool,featureId:feature.id});
    invalidatePartMeshAfterEdit(revolveHost);
    E.sel=revolveHost;queueExactMesh(revolveHost);refreshAll();return true;
  }
  E.sel=addPart(revolved);refreshAll();return true;
}

/* The body a cut is aimed at. Extrude Cut picks the selected solid and falls
   back to the last one built; the revolved and swept cuts want exactly the same
   rule, so it is stated once instead of three times. */
function cutTargetBody() {
  var parts=activeParts(E.def);
  return selectedSolid() || parts[parts.length-1] || null;
}

/* The body a MERGED feature fuses into.
 *
 * "Merge result" was declared by extrude, revolve, sweep and loft and wired by
 * none of them: every additive feature made a body of its own whatever the box
 * said. It is a choice between one body and two, so it only means anything when
 * there IS a second body to be — a solid the new one actually reaches. A boss
 * standing alone in space has nothing to fuse with and stays its own body
 * however the box is ticked, which is what a CAD modeller does with the option
 * greyed out; saying otherwise would be a different kind of lie.
 *
 * Touching counts: a boss grown off the top face of a plate meets it on a plane
 * and nowhere else, and that is the commonest merge there is. */
function mergeTargetBody(box, params) {
  if (!box || !params || params.mergeResult === false || params.operation === "new-body") return null;
  var touches = function (part) {
    var other = partBounds(part);
    if (!other) return false;
    return box.x0 <= other.x1 + 1e-6 && box.x1 >= other.x0 - 1e-6
      && box.y0 <= other.y1 + 1e-6 && box.y1 >= other.y0 - 1e-6
      && box.z0 <= other.z1 + 1e-6 && box.z1 >= other.z0 - 1e-6;
  };
  var candidates = activeParts(E.def).filter(function (part) { return partSupportsExactMesh(part) && touches(part); });
  if (!candidates.length) return null;
  var selected = selectedSolid();
  return candidates.includes(selected) ? selected : candidates[candidates.length - 1];
}

function cutTargetFeatureId(target, document = E.def, built = null) {
  if (!target) return null;
  /* `built(id)`, when given, also stops the chain at a step the run did not
     build, so a failed last step leaves the body at the step before it. */
  var head = target.derivedFeatureId || target.featureId;
  // Reactivating suppressed steps can leave a later sibling branch reading an
  // earlier body stage. Native history still evaluates that later branch;
  // publication must follow the latest active descendant, not an older fork.
  var lineage = new Set([head]);
  var modifiers = new Set(["fillet", "chamfer", "shell", "dome", "draft", "thicken", "rib", "extrudeCut", "revolveCut", "sweepCut", "hole", "moveBody", "boolean"]);
  /* A step below the rollback bar (or suppressed in history) is not built, so it
     cannot be the body's head. Walking past it made the displayed body ask the
     regeneration for Shell1 after rolling HOUSING back to Boss-Battery; the run
     had no Shell1, the exact rebuild failed, and the viewport fell back to the
     bare Base Extrude cylinder — Boss-Loft1, above the bar, vanished with it. */
  var inactive = new Set();
  (document.history || []).forEach(function (entry, index) {
    if (entry && entry.targetId && (entry.suppressed || historyEntryRolled(document, index))) inactive.add(entry.targetId);
  });
  var featureOrder=new Map((document.features || []).map(function(feature){return [feature.id,feature];}));
  var orderedFeatures=(document.history || []).filter(function(entry){return entry.kind==='feature' && featureOrder.has(entry.targetId);}).map(function(entry){var feature=featureOrder.get(entry.targetId);featureOrder.delete(entry.targetId);return feature;});
  orderedFeatures.push(...featureOrder.values());
  orderedFeatures.forEach(function (feature) {
    if (!feature.suppressed && !inactive.has(feature.id) && (modifiers.has(feature.type) || (feature.type==="thread" && feature.params?.mode==="modeled") || (["pattern","mirror"].includes(feature.type) && feature.params?.scope==="feature") || (["extrude","revolve","sweep","loft"].includes(feature.type) && feature.params?.mergeResult !== false && feature.params?.operation !== "new-body")) && (feature.inputs || []).some(function(id){return lineage.has(id);})
      // a Move with Copy made a second body; the original does not move with it
      && (feature.type !== "moveBody" || !leavesInputStanding(document, feature))
      && (feature.type !== "boolean" || !feature.params?.keepTools || feature.inputs[0]===head)
      && (!built || built(feature.id))) { head = feature.id; lineage.add(head); }
  });
  return head && (!built || built(head)) ? head : null;
}

/* Bodies come only from steps that built. A failed run used to throw before
   any part was given its mesh, so the saved meshData stayed on screen — on
   HOUSING a stale ring from an old broken union, under a green status. Each
   part now shows the last step of its chain that did build, flagged with the
   failure; a part none of whose steps built loses its mesh. Returns the parts
   whose display changed. */
async function publishExactBodies(parts, run, document, meshOf, isCurrent=function(){return true;}) {
  var failed = (run.issues || []).find(function (issue) { return issue.code === "regeneration-failed"; });
  var failure = run.ok ? null : failed ? failed.message : "The body could not be rebuilt";
  var built = function (id) { var result = run.results.get(id); return !!(result && (result.shape || (result.verifiedSerializedExact===true && result.workerMeshData && !result.invalid && !result.approximate))); };
  var publications = [];
  for (var part of parts) {
    if(!isCurrent())return [];
    var head = cutTargetFeatureId(part, document);
    if (!head) continue;
    var shown = run.ok ? head : cutTargetFeatureId(part, document, built);
    var body = shown ? run.results.get(shown) : null;
    if (body && built(shown)) {
      var mesh=await meshOf(body);
      if(!isCurrent())return [];
      publications.push({part, mesh, bounds:meshDataBounds(mesh.positions), error:shown === head ? null : failure});
    } else if (!run.ok) publications.push({part, mesh:null, error:failure});
  }
  // Commit together after the last await. A stale or rejected transfer
  // cannot leave the live drawing half on the new generation.
  return publications.map(function ({part, mesh, bounds, error}) {
    if (mesh) { part.meshData = mesh; part.bounds = bounds; }
    else { delete part.meshData; delete part.bounds; }
    part.exactError = error;
    part.exactPending = false;
    return part;
  });
}

/* Revolve Cut. The profile, the axis and the extent are the ones Revolve would
   have used — createRevolveFeature above builds an identical params record —
   and the difference is only where the resulting solid goes: onto the document
   as a body, or onto the target's cut list as a tool. */
function createRevolveCutFeature(options) {
  var optionsWithDefaults={...featureDefaults("revolveCut"),useSketchPlane:true,...(typeof options==="number"?{angle:options}:options || {})};
  var result;try{result=selectedRevolve(optionsWithDefaults);}catch(error){flash(String(error.message || error));return false;}
  var {params,sketch,tool}=result;
  var target=cutTargetBody();
  if(!target){flash(t("extrudeCutNeed"));return false;}
  if(!partSupportsExactMesh(target)){flash(t("cutNeedExactBody"));return false;}
  var axisReference=optionsWithDefaults.axisReference || "axis:y";
  pushUndo(t("opRevolveCut"));recordSketchInHistory(E.def,sketch);
  var targetFeatureId=cutTargetFeatureId(target),feature=null;
  try{feature=createFeatureDefinition(E.def,"revolveCut",{
    inputs:targetFeatureId?[targetFeatureId]:[],
    references:{sketches:[sketch.id],features:targetFeatureId?[targetFeatureId]:[],topology:[],references:[axisReference],profileEntityIds:params.profileEntityIds},
    params,
  });}catch(error){H.discard();flash(String(error.message||error));return false;}
  target.cuts3d=target.cuts3d || [];
  target.cuts3d.push({...tool,featureId:feature.id});
  invalidatePartMeshAfterEdit(target);
  E.sel=target;queueExactMesh(target);refreshAll();return true;
}

function clearFeaturePreview(refresh) {
  cancelCadWorkerWork('finish');
  E._instant3dPose = null;
  if(E.authoring){E.authoring.patternOverlap=false;E.authoring.finishPreviewStatus=null;}
  if(!E.authoring)return;E.authoring.previewParts=[];E.authoring.previewReplacesPartId=null;
  E.authoring.approxFinishPreview=null;E.authoring.pendingExactPreview=null;
  /* A merged pattern's fuse is in flight for as long as the kernel takes; the
     token bump below is what stops it landing a mesh in a scene the form has
     already been dismissed from. */
  var hadLoftSelection=!!E.authoring.featurePreviewState?.loftSectionIds;
  E.authoring.mergedPatternPreview=null;
  E.authoring.featurePreviewState=null;E.authoring.featurePreviewBadge=null;
  E._featurePreviewToken=(E._featurePreviewToken || 0)+1;
  if(E._featureExactPreviewTimer){clearTimeout(E._featureExactPreviewTimer);E._featureExactPreviewTimer=0;}
  if(E._featurePreviewFrame){cancelAnimationFrame(E._featurePreviewFrame);E._featurePreviewFrame=0;}
  if(refresh)refreshAll();
  else if(hadLoftSelection){refreshParts();refreshModelHistoryPane();}
}

/* The live preview shows what the feature will do — so it shows every area the
   feature will act on, one ghost body each. */
function extrudePreviewParts(type,params) {
  var areas;try{areas=extrusionSketchAreas(params);}catch(error){return [];}if(!areas.length)return [];
  var sketch=ensureSketch(E.def);
  // Local distances already follow the frame normal. Multiplying by its world
  // sign again reverses previews on back-facing supports.
  var axis=planeAxis(sketch.plane),normal=sketch.frame && sketch.frame.normal,principalDirection=sketch.frameSpace==="local"?1:normal?(axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)):1;
  var direction=(params.direction==="reverse"?-1:1)*(principalDirection || 1),depth=Math.max(1e-6,Number(params.depth)||1e-6),offset=Number(params.offset)||0,symmetric=!!params.symmetric||params.endCondition==="mid-plane";
  var center=(sketch.frameSpace==="local"?0:Number(sketch.offset)||0)+direction*offset,from=symmetric?center-direction*depth/2:center,to=symmetric?center+direction*depth/2:center+direction*depth;
  var extent={...params,axis:sketch.frameSpace==="local"?"frame":axis,frame:sketch.frameSpace==="local"?cloneData(sketch.frame):undefined,from:from,to:to,points:areas[0]&&areas[0].points};
  try {
    var host=type==="extrudeCut"?(selectedSolid()||activeParts(E.def)[activeParts(E.def).length-1]):null;
    var hostFaces=host?(authoritativeFinishTopology(host)||[]).filter(function(entry){return entry.kind==="face";}):[];
    extent=resolveExtrudeExtent(extent,{
      endFace:isUpToFace(params.endCondition)?(E.topologySelection||[]).find(function(item){return item.kind==="face";}):null,
      hostFaces:hostFaces,
      hostBounds:host?aabbFromBox(partBounds(host)):null,
    });
    from=extent.from;to=extent.to;
  } catch (error) {}
  return areas.map(function(area,index){
    return {id:"preview:"+type+":"+index,featureId:"preview:"+type,previewOnly:true,kind:"ext",axis:sketch.frameSpace==="local"?"frame":axis,frame:sketch.frameSpace==="local"?cloneData(sketch.frame):undefined,from:from,to:to,pts:area.points,holes:area.holes.slice(),color:type==="extrudeCut"?"#d75a4a":"#6f8de8",opacity:type==="extrudeCut"?.42:.62,metal:.04,rough:.68,name:"Live "+featureTypeLabel(type)};
  });
}

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

/* Which parameter each finish feature means by "the amount" — the number the
   scrubber drags, the preview reads and the exact operation is recorded with. */
var FINISH_AMOUNT_KEY = { fillet:"radius", chamfer:"distance", shell:"thickness", dome:"height", draft:"angle", thicken:"thickness", rib:"thickness" };
/* Body operations have no single scrubbed number — their params ARE the whole
   definition — so they are named here rather than by an amount key. */
var BODY_OPERATIONS = new Set(["splitBody", "moveBody"]);

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

/* The features that work on an existing body's topology rather than on a
   sketch: they collect a selection, preview through the exact kernel, and are
   recorded as an exactOperation on the part. */
var FINISH_FEATURES = ["fillet", "chamfer", "shell", "dome", "draft", "thicken"];

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

/* Which parameter each of these means by "the amount", for repeat-last. */
var REPEATABLE_AMOUNT = { fillet: "radius", chamfer: "distance", shell: "thickness" };

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

function openQuickForm(spec) {
  E.quickFormInstance?.dismiss();
  if(motionPlaybackCancel)motionPlaybackCancel();
  var host = root && root.querySelector("#mdQuickSettings");
  if (!host) return null;
  if (E.leftCollapsed) setPanelCollapsed("left", false);
  if (E.authoring && E.authoring.featureEdit) cancelFeatureParameterEdit(true);
  if (E.authoring && E.authoring.featureType) { clearFeaturePreview(false); E.authoring.featureType = null; }
  var action = spec.action || "quickform";
  var instance = registerQuickForm(E, host, action, function (leavingDocument) {
    if (spec.onDismiss) spec.onDismiss();
    else if (leavingDocument && spec.onCancel) spec.onCancel();
  });
  var ownsForm = () => instance.isCurrent() && E.quickAction === action;
  host.appendChild(el("div", "md-feature-form-title",
    '<i class="ph ' + (spec.icon || "ph-sliders-horizontal") + '"></i><span><b>' + spec.title +
    "</b><small>" + (spec.hint || t("featureFormHint")) + "</small></span>"));
  var section = el("details", "md-feature-group");
  section.open = true;
  section.appendChild(el("summary", "", '<i class="ph ph-sliders-horizontal"></i><span>' + spec.title + "</span><small>" + spec.fields.length + "</small>"));
  var body = el("div", "md-feature-group-body");
  var inputs = {};
  var fields=spec.fields.map(function(field){return field.unit==='length' ? {...field,inputUnit:modelLengthUnit()} : field;});
  fields.forEach(function (field) { inputs[field.key] = featureField(body, field, field.value); });
  section.appendChild(body);
  host.appendChild(section);

  var read = function () {
    var values = {};
    fields.forEach(function (field) {
      var raw = inputs[field.key].value;
      values[field.key] = field.type === "boolean" ? inputs[field.key].checked : (field.type === "number" || field.type === "feature-seeds") ? featureControlValue({field:field,input:inputs[field.key]}) : String(raw);
    });
    return values;
  };
  if (spec.onLive) Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener("input", function () { if(ownsForm())spec.onLive(read()); });
  });

  var failure = el("p", "md-feature-error");
  if(failure){failure.setAttribute("role", "alert"); failure.hidden = true; host.appendChild(failure);}
  var close = function () { if(!ownsForm())return; host.innerHTML = ""; E.quickFormInstance = null; E.quickAction = null; closeFeaturePanel({assemblyPoseOnly:!!spec.presentationOnly,drawingOnly:!!spec.drawingOnly}); };
  var actions = el("div", "md-feature-actions");
  var cancelButton = namedButton(btn('<i class="ph ph-x"></i> ' + t("m_cancel"), function () {
    if(!ownsForm() || instance.applying)return;
    close();
    if (spec.onCancel) spec.onCancel();
    if(!spec.presentationOnly&&!spec.drawingOnly)refreshAll();
  }, "md-quick-cancel"), t("cancelCommand"));
  actions.appendChild(cancelButton);
  var applyButton = btn('<i class="ph ph-check"></i> ' + t("quickApply"), async function () {
    if (!ownsForm()) return;
    if (instance.applying) return instance.applying;
    if (!validateFeatureInputs(host)) return;
    // Publish before invoking user code, including synchronous/reentrant callbacks.
    // This promise is a settlement barrier for navigation, never a rejection.
    var releaseApply;
    instance.applying = new Promise(resolve => { releaseApply = resolve; });
    applyButton.disabled = cancelButton.disabled = true;
    failure.hidden = true;
    try {
      var submitted = read();
      var submittedDraft = JSON.stringify(submitted);
      var applied = await spec.onApply(submitted, ownsForm);
      // A resolved prompt may already have opened a replacement with the same action.
      if (!ownsForm()) return;
      if (applied === false) {
        if (spec.failureMessage) { failure.textContent = spec.failureMessage(); failure.hidden = false; }
        return;
      }
      if (JSON.stringify(read()) !== submittedDraft) {
        // Keep edits made during the operation, with the submitted values as baseline.
        instance.rememberInputs(read, JSON.parse(submittedDraft));
      } else close();
      if(!spec.presentationOnly&&!spec.drawingOnly)refreshAll();
    } catch (error) {
      if (ownsForm()) {
        failure.textContent = error?.message || String(error);
        failure.hidden = false;
      }
    } finally {
      instance.applying = null;
      if (ownsForm()) applyButton.disabled = cancelButton.disabled = false;
      releaseApply();
    }
  }, "md-quick-apply");
  actions.appendChild(applyButton);
  host.appendChild(actions);

  var first = inputs[spec.fields[0] && spec.fields[0].key];
  var openingFocus=document.activeElement,fieldInteracted=false;
  Object.keys(inputs).forEach(function(key){
    ["pointerdown","focus","input"].forEach(function(event){inputs[key].addEventListener?.(event,function(){fieldInteracted=true;});});
  });
  if (first) requestAnimationFrame(function () {
    // A busy frame may arrive after the user chose or typed another field.
    // Default focus must never steal that established caret/selection.
    if(!ownsForm() || fieldInteracted || document.activeElement!==openingFocus)return;
    try { first.focus(); if (first.select) first.select(); } catch (error) {}
  });
  syncCommandManager();
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
  instance.rememberInputs(read);
  return inputs;
}

function commandCatalog() {
  var catalog=buildCommandCatalog({ t: t, editor: E, closedSketchProfile: closedSketchProfile, selectedAxisProfile:function(){var axis=preselectedRevolveAxis();return isSketchAxis(axis) && (revolveContour(axis) || revolveContour(axis,true));}, openSketchChain: function(){return analyzeSketchChains(ensureSketch(E.def)).chains.length>0;}, activeParts: activeParts, canonicalAuthoring: isCanonicalAuthoring });
  catalog.push({id:"temporaryaxes",label:"Temporary axes",group:"View",terms:"axis cylindrical conical centerline"});
  return catalog.map(function(command){var key=(E.commandShortcuts || {})[command.id];return key ? {...command,shortcut:key.toUpperCase()} : command;});
}

function commandUnavailableReason(id) {
  return catalogUnavailableReason(id, commandCatalog(), t("cmdUnavailable"));
}

/* A ribbon caption whose catalog label would mislead gets its tooltip here.
   "Project" with nothing picked projects the bodies' silhouette on the sketch
   plane as construction geometry, and with model edges picked it hands them to
   Convert Entities — so the button says so rather than repeating the catalog's
   "Project part edges". */
var COMMAND_TOOLTIP = { project: function () { return t("projectEdgesTip"); } };

/* The ribbon relations grey themselves from constraintFits, exactly as the
   inspector palette does. They carry `data-relation`, so the [data-command]
   sweep below never touches them. */
function syncRelationCommands() {
  if (!root) return;
  root.querySelectorAll("[data-relation]").forEach(function (b) {
    var id = b.getAttribute("data-relation");
    var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === id; })[0];
    var name = d ? t(d.label) : id;
    var fits = constraintFits(id);
    markUnavailable(b, fits ? "" : name + " — " + t("selHint"), name + (d ? " — " + d.need : ""));
  });
}

function syncExplodeCommandState() {
  var assemblyMode=E.docType==='assembly',exploded=assemblyMode&&assemblyHasExplodedOffsets(E.assembly),label=t(exploded?"collapseExplodeView":"explodeAssembly");
  var buttons=Array.from(root.querySelectorAll('[data-command="explode"]'));
  if(root.ownerDocument)buttons.push(...root.ownerDocument.querySelectorAll('[data-pro-bind="mcmd:explode"]'));
  buttons.forEach(function(button){
    var text=button.querySelector('span');if(text)text.textContent=label;
    button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(exploded));
    if(!assemblyMode)button.setAttribute('aria-disabled','true');
    button.title=label+' · '+t(exploded?'assemblyExploded':'assemblyAssembled');
  });
}
function syncCommandManager() {
  if (!root) return;
  syncRelationCommands();
  var catalog = commandCatalog();
  /* Two of Direct's five buttons quietly become sketch tools in a parametric-v1
     document and the other three refuse outright, so the whole group goes away
     there. It is part-only besides — leaving it on in an assembly put five dead
     buttons back on the pane and pushed Features 340px past the fold, which is
     the overflow this ribbon was rebuilt to remove. Hidden, not removed:
     command search and legacy part documents still reach every one of them. */
  var directSeed = root.querySelector('[data-command="directbox"]');
  var direct = directSeed && directSeed.closest(".md-command-group");
  if (direct) direct.hidden = E.docType !== "part" || isCanonicalAuthoring();
  root.querySelectorAll("[data-command]").forEach(function (b) {
    var id = b.getAttribute("data-command"), def = catalog.find(function (c) { return c.id === id; });
    // a ribbon button is lit while its tool is picked *or* its feature form is open
    var feature = E.authoring && E.authoring.featureType;
    var why = (def && def.available && !def.available()) ? ((def.reason && def.reason()) || t("cmdUnavailable")) : "";
    b.classList.toggle("on", (id === "sarc" ? (E.tool === "sarc" && !E.arcThreePoint && !E.arcTangent) : id === E.tool) ||
      (id === "arc3point" && E.tool === "sarc" && !!E.arcThreePoint) ||
      (id === "tangentarc" && E.tool === "sarc" && !!E.arcTangent) ||
      (feature && id === FEATURE_COMMAND[feature]) || (id === "measure" && !!E.measure) || (id === "model3d" && E.mode === "3d"));
    b.classList.toggle("unavailable", !!why);
    b.setAttribute("aria-disabled", why ? "true" : "false");
    if (why) b.title = why;
    else if (COMMAND_TOOLTIP[id]) b.title = COMMAND_TOOLTIP[id]();
    else if (def) b.title = def.label + (def.shortcut ? " · " + def.shortcut : "");
  });
  syncExplodeCommandState();
}

function openCommandSearch(seed) {
  if (!root) return;
  var overlay = root.querySelector("#mdCommandSearch"), input = root.querySelector("#mdCommandSearchInput");
  E.commandSearchRestore = document.activeElement;
  E.commandHighlight = 0;
  overlay.hidden = false;
  input.value = seed || "";
  renderCommandResults();
  requestAnimationFrame(function () { input.focus(); input.select(); });
}

function closeCommandSearch() {
  var overlay = root && root.querySelector("#mdCommandSearch");
  var input = root && root.querySelector("#mdCommandSearchInput");
  if (overlay) overlay.hidden = true;
  if (input) input.setAttribute("aria-activedescendant", "");
  var restore = E.commandSearchRestore;
  E.commandSearchRestore = null;
  if (restore && restore !== input && typeof restore.focus === "function") {
    try { restore.focus(); } catch (error) {}
  }
}

function commandSearchOptionId(id) {
  return "mdCommandOption-" + String(id || "").replace(/[^a-z0-9_-]/gi, "");
}

function syncCommandSearchAria(commands) {
  var input = root && root.querySelector("#mdCommandSearchInput");
  if (!input) return;
  var list = commands || [];
  var active = list[E.commandHighlight] || list[0];
  input.setAttribute("aria-activedescendant", active ? commandSearchOptionId(active.id) : "");
}

function renderCommandResults() {
  if (!root) return;
  var input = root.querySelector("#mdCommandSearchInput"), host = root.querySelector("#mdCommandResults");
  var query = String(input.value || "").trim().toLowerCase();
  var list = commandCatalog().filter(function (c) {
    return !query || (c.label + " " + c.group + " " + (c.terms || "") + " " + (c.shortcut || "")).toLowerCase().indexOf(query) >= 0;
  }).slice(0, 12);
  host.innerHTML = "";
  if (!list.length) { E.commandHighlight = 0; input.setAttribute("aria-activedescendant", ""); host.appendChild(el("div", "md-command-empty", t("noCommands"))); return; }
  if (E.commandHighlight >= list.length) E.commandHighlight = 0;
  list.forEach(function (c, index) {
    var why = c.available && !c.available() ? ((c.reason && c.reason()) || t("cmdUnavailable")) : "";
    var row = el("button", "md-command-result" + (index === E.commandHighlight ? " selected" : "") + (why ? " unavailable" : ""));
    row.type = "button";
    row.id = commandSearchOptionId(c.id);
    row.setAttribute("role", "option");
    row.setAttribute("aria-disabled", why ? "true" : "false");
    row.dataset.command = c.id;
    row.appendChild(el("span", "md-search-icon", cadIcon(c.id || c.icon)));
    var copy = el("span", "copy");
    copy.appendChild(el("b", "", c.label));
    copy.appendChild(el("small", "", why || c.group));
    row.appendChild(copy);
    if (c.shortcut) row.appendChild(el("kbd", "", c.shortcut));
    row.addEventListener("click", function () {
      if (why) { flash(why); return; }
      runCommand(c.id);
    });
    host.appendChild(row);
  });
  syncCommandSearchAria(list);
}

function chromeSelectionInput() {
  var face = (E.topologySelection || []).some(function (r) { return r.kind === "face"; });
  var edge = (E.topologySelection || []).some(function (r) { return r.kind === "edge"; });
  var closed = !!closedSketchProfile();
  var sketchEntity = (E.ssel || []).some(function (item) { return item && item.type; });
  var featureSelected = !!(E.authoring && (E.authoring.featureSelection || []).length);
  return {
    face: face, edge: edge, closedSketch: closed, sketchEntity: sketchEntity,
    featureSelected: featureSelected,
    assembly: E.docType === "assembly",
    oneComponent: E.docType === "assembly" && E.componentSel.length >= 1,
    twoComponents: E.docType === "assembly" && E.componentSel.length === 2,
    topologyCount: (E.topologySelection || []).length,
    namedSelections: (E.def && E.def.namedSelections || []).length,
    hideable: !!(E.sel || (E.componentSel && E.componentSel.length)),
    hidden: !!(E.assembly && E.assembly.isolated),
    sketchPhase: E.authoring && E.authoring.phase === "sketch",
  };
}

/* Sketch geometry is not in the 3D viewport's pick set, so the Sketch filter
   has nothing to acquire there. It used to be selectable anyway and every
   click became a silent no-op — the filter said it was on, the model refused
   to select, and nothing explained why. The button is disabled instead. */
function selectionFilterAvailable(id) {
  if (id !== "sketch") return true;
  return E.mode !== "3d" || E.modelPlaneActive;
}

function setSelectionFilter(id) {
  id = id || "all";
  if (!selectionFilterAvailable(id)) { flash(t("selFilterSketch3d")); return; }
  E.selectionFilter = id;
  syncSelectionFilters();
}

/* Painted whenever the filter OR the mode changes: leaving the sketch view
   with the Sketch filter on has to both demote the filter and repaint. */
function syncSelectionFilters() {
  if (!root) return;
  if (!selectionFilterAvailable(E.selectionFilter)) E.selectionFilter = "all";
  root.querySelectorAll("[data-selfilter]").forEach(function (button) {
    var id = button.getAttribute("data-selfilter"), available = selectionFilterAvailable(id);
    button.classList.toggle("on", id === E.selectionFilter);
    button.disabled = !available;
    button.dataset.tip = available ? "" : t("selFilterSketch3d");
  });
}

function selectionFilterLabel(id) {
  var key = { face: "selFilterFace", edge: "selFilterEdge", vertex: "selFilterVertex", sketch: "selFilterSketch", body: "selFilterBody" }[id];
  return key ? t(key) : t("selFilterAll");
}

/* The filter the ACTIVE COMMAND needs, layered over the user's sticky filter
   rather than overwriting it. beginFacePick() used to assign E.selectionFilter
   directly and never put it back, so asking for a sketch plane silently reset
   a filter the user had chosen for the whole session.

   Fillet and chamfer are deliberately NOT forced to "edge": under All a face
   pick expands to its bounding edges, which is the fast way to fillet a boss,
   and prefer:"edge" would additionally make edges hidden behind the solid
   pickable. Their widened pick band is handled by the `finish` flag in
   topologyPickPixelRadius() instead. */
function collectingEndFace() {
  var type = E.authoring && !E.authoring.featureEdit ? E.authoring.featureType : null;
  var params = E.authoring && E.authoring.featurePreviewState && E.authoring.featurePreviewState.params;
  return (type === "extrude" || type === "extrudeCut") && isUpToFace(params && params.endCondition);
}

function commandSelectionPrefer() {
  if (E.facePick) return "face";
  if (fullRoundActive()) return "face";
  var type = E.authoring && !E.authoring.featureEdit ? E.authoring.featureType : null;
  // Shell and draft consume faces only; an edge picked here lands in the
  // selection and is then silently dropped by finishFeatureTargets().
  if (FACE_DRIVEN_OPERATIONS.has(type)) return "face";
  if (collectingEndFace()) return "face";
  if (E.collectingFeature && ["fillet", "chamfer"].includes(type)) return "all";
  return E.selectionFilter;
}

function setAssemblyMoveMode(mode) {
  E.assemblyMoveMode = ["x", "y", "z"].includes(mode) ? mode : "free";
  if (!root) return;
  root.querySelectorAll("[data-assembly-move]").forEach(function (button) {
    var active = button.getAttribute("data-assembly-move") === E.assemblyMoveMode;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setMobileAddSelection(on) {
  E.mobileAddSelection = !!on;
  syncModelerMobile(true);
}

function clearMobileSelection() {
  E.sel = null;
  E.ssel = [];
  E.componentSel = [];
  E.topologySelection = [];
  if (E.authoring) E.authoring.featureSelection = [];
  E.mobileAddSelection = false;
  refreshAll();
}

function hideOverlay(id) {
  var node = root && root.querySelector(id);
  if (node) node.hidden = true;
}

function chromeCommandLabel(id) {
  var keys = {
    newsketch: "createSketch", extrude: "opExtrude", extrudecut: "extrudeCut", revolvefeature: "opRevolve",
    /* The cut/sweep/loft verbs reach the phone's docked action row, which asks
       for a label by command id. Without these the row printed the raw id
       ("sweepfeature") — t() returns its argument when the key is unknown. */
    revolvecutfeature: "opRevolveCut", sweepfeature: "opSweep", sweepcutfeature: "opSweepCut",
    loftfeature: "cap_loft", draftfeature: "draftOp",
    holefeature: "holeWizard", helixfeature: "opHelix", threadfeature: "opThread",
    knurlfeature: "opKnurl", insertfeature: "opInsert", shellfeature: "shellOp", filletfeature: "quickFillet",
    chamferfeature: "quickChamfer", patternfeature: "quickPattern", finishsketch: "finishSketch",
    dim: "tool_dim", trim: "tool_trim", sketchfillet: "sketchFillet", select: "tool_select", wall: "cap_wall",
    srect: "cap_srect", scirc: "cap_scirc", editfeature: "ctxEditFeature",
    rollbackhere: "ctxRollbackHere", mates: "mate", isolate: "isolate",
    components: "components", explode: "explodeView", interference: "interferenceCheck",
    fit: "zoomFit", regen: "regenerate", normalTo: "normalTo", hide: "ctxHide",
    showall: "ctxShowAll", selectloop: "selectLoopCmd", selecttangency: "selectTangencyCmd",
    selectconnected: "selectConnectedCmd", selectinvert: "selectInvertCmd",
    selectgrow: "selectGrowCmd", selectshrink: "selectShrinkCmd",
    selectsave: "nameSelection", selectrecall: "selectionSets",
  };
  return t(keys[id] || id);
}

function fillActionHost(host, items, close) {
  if (!host) return;
  host.innerHTML = "";
  var showLabels = host.id === "mdContextToolbar" || (host.classList && host.classList.contains("md-context-toolbar"));
  items.forEach(function (item) {
    var label = chromeCommandLabel(item.id);
    var content = cadIcon(item.id || item.icon);
    if (showLabels && label) {
      content += "<span class=\"md-action-label\">" + label + "</span>";
    }
    if (item.shortcut) {
      content += "<kbd>" + item.shortcut + "</kbd>";
    }
    var button = el("button", "", content);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      if (close) close();
      runChromeCommand(item.id);
    });
    host.appendChild(button);
  });
}

function runChromeCommand(id) {
  if (["selectloop", "selecttangency", "selectconnected", "selectinvert", "selectgrow", "selectshrink"].includes(id)) {
    runSelectionOperation(id);
    return;
  }
  if (id === "selectsave") { saveNamedSelection(); return; }
  if (id === "selectrecall") { showNamedSelections(false); return; }
  if (id === "editfeature") {
    var featureId = E.authoring && (E.authoring.featureSelection || [])[0];
    var feature = featureId && (E.def.features || []).find(function (item) { return item.id === featureId; });
    if (feature) openFeatureEditor(feature);
    return;
  }
  if (id === "rollbackhere") {
    var featureId = E.authoring && (E.authoring.featureSelection || [])[0];
    var index = featureHistoryIndex(E.def.history, featureId);
    if (index >= 0) { pushUndo(t("ctxRollbackHere")); setHistoryRollback(E.def, index); refreshAll(); }
    return;
  }
  if (id === "normalTo") { orientModelToView(true); drawSketch(); return; }
  if (id === "hide") { hideSelected(); return; }
  if (id === "showall" || id === "isolate") { toggleIsolate(); return; }
  runCommand(id);
}

function hideSelected() {
  if (E.docType === "assembly" && E.componentSel.length) {
    E.componentSel.forEach(function (c) { c.visible = false; });
    invalidateInterference();
    refreshAll();
    return;
  }
  if (E.sel && E.sel.id) { E.sel.suppressed = true; refreshAll(); }
}

function toggleIsolate() {
  if (E.docType !== "assembly" || !E.assembly) return;
  if (E.assembly.isolated) {
    (E.assembly.components || []).forEach(function (c) { c.visible = true; });
    E.assembly.isolated = false;
    invalidateInterference();
    flash(t("isolateOff"));
    refreshAll();
    return;
  }
  var selected = (E.componentSel || []).map(function (c) { return c.id; });
  if (!selected.length) { flash(t("cmdNeedOneComponent")); return; }
  isolateVisibility(E.assembly.components, selected).forEach(function (row) {
    var component = E.assembly.components.find(function (c) { return c.id === row.id; });
    if (component) component.visible = row.visible;
  });
  E.assembly.isolated = true;
  invalidateInterference();
  flash(t("isolate"));
  refreshAll();
}

function syncSelectionChrome() {
  if (!root) return;
  syncSketchEntityNavigator();
  syncFeatureNavigator();
  var input = chromeSelectionInput();
  var toolbar = root.querySelector("#mdContextToolbar");
  var items = contextToolbarItems(input);
  var picked = input.face || input.edge || input.sketchEntity || input.featureSelected || input.oneComponent;
  if (toolbar) {
    // Floating context toolbar disabled for now per user request
    toolbar.hidden = true;
  }
  var crumbs = selectionBreadcrumb({
    reference: (E.topologySelection || [])[0],
    part: E.sel && E.sel.kind ? E.sel : null,
    component: E.docType === "assembly" ? E.componentSel[E.componentSel.length - 1] : null,
  });
  var bar = root.querySelector("#mdBreadcrumb");
  if (bar) {
    bar.hidden = !crumbs.length;
    /* Face › Feature › Body walks the selection. selectionBreadcrumb() has
       always returned the id beside each label; joining them into a string
       threw that away and left a line that looked interactive and was not.
       Clicking Body drops to the solid, Feature opens the step that made it. */
    bar.innerHTML = "";
    crumbs.forEach(function (crumb, index) {
      if (index) bar.appendChild(el("span", "md-breadcrumb-sep", "›"));
      var button = el("button", "md-breadcrumb-step");
      button.type = "button";
      // textContent, not innerHTML: a crumb label can be a model or body name,
      // which is whatever the user typed into it.
      button.textContent = crumb.label;
      button.dataset.crumbKind = crumb.kind;
      button.addEventListener("click", function () { pickBreadcrumb(crumb); });
      bar.appendChild(button);
    });
  }
  syncModelerMobile();
}

function openSketchPointCoordinates(sketch,point) {
  if(!point)return;
        var coordinateError="",surfaceUV=sketch.frameSpace==="surface-uv";
        openQuickForm({action:"pointcoordinates",title:"Point coordinates",hint:surfaceUVGuide(sketch)||"Locate and constrain this point on its sketch plane.",failureMessage:function(){return coordinateError;},fields:[
          {key:"x",label:surfaceUV?"U coordinate":"Horizontal coordinate",type:"number",value:point.x,unit:"length"},
          {key:"y",label:surfaceUV?"V coordinate":"Vertical coordinate",type:"number",value:point.y,unit:"length"}
        ],onApply:function(values){
          var x=Number(values.x),y=Number(values.y);if(!Number.isFinite(x)||!Number.isFinite(y))return false;
          pushUndo("Point coordinates");var previous=cloneData(sketch.constraints),oldPoint={x:point.x,y:point.y,fixed:point.fixed};
          sketch.constraints=sketch.constraints.filter(function(c){return !(c.type==='fixed'&&c.point===point.id);});
          point.fixed=false;sketch.constraints.push({id:uid(),type:"fixed",point:point.id,x:x,y:y});
          if(!resolveSketch(true)){var fixIds=addedConstraintIds(sketch,previous),fixWhy=explainSketchConflict(sketch,{keep:fixIds}),fixSubject=constraintCaption(sketch.constraints[sketch.constraints.length-1],sketch);sketch.constraints=previous;Object.assign(point,oldPoint);resolveSketch(false);H.discard();coordinateError=refusalMessage(sketch,fixSubject,fixIds,fixWhy)+" For linked endpoints, use Translate sketch geometry to move them together, or edit the conflicting relation.";showSketchRefusal(sketch,fixSubject,fixIds,fixWhy);return false;}
          refreshAll();return true;
        }});
}

function syncSketchEntityNavigator() {
  var strip=root.querySelector("#mdEntityNav");if(!strip)return;
  var sketch=(E.def.sketches || []).find(function(item){return item.id===E.def.activeSketch;});
  var entities=sketch && sketch.entities || [];
  var formOpen=!!root.querySelector("#mdQuickSettings:not([hidden])");
  var visible=E.docType!=="assembly" && E.mode!=="drawing" && !formOpen && E.tool==="select" && (E.mode==="2d" || E.authoring?.phase==="sketch") && entities.length>0;
  strip.hidden=!visible;strip.innerHTML="";if(!visible)return;
  var hebrew=getLang()!=="en",selected=selectedSketchNavigationEntity(sketch,E.ssel || []);
  if(!entities.includes(selected))selected=null;
  function step(direction){
    var currentSketch=(E.def.sketches || []).find(function(item){return item.id===E.def.activeSketch;});
    var chosen=sketchEntityStep(currentSketch?.entities || [],selectedSketchNavigationEntity(currentSketch,E.ssel || []),direction);
    var target=sketchNavigationTarget(currentSketch,chosen);
    if(target){selectSketch(target,false);refreshSelection();}
  }
  var gesture=null;
  strip.onpointerdown=function(event){if(event.pointerType!=="touch" || !event.isPrimary)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY};};
  strip.onpointerup=function(event){
    if(!gesture || gesture.id!==event.pointerId)return;
    var direction=sketchEntitySwipe(event.clientX-gesture.x,event.clientY-gesture.y,getComputedStyle(strip).direction==="rtl");gesture=null;
    if(direction){event.preventDefault();strip.dataset.suppressSwipeClick=String(Date.now()+500);step(direction);}
  };
  strip.onpointercancel=function(){gesture=null;};
  if(!strip.dataset.swipeClickBound){strip.dataset.swipeClickBound="true";strip.addEventListener("click",function(event){if(Number(strip.dataset.suppressSwipeClick)>Date.now()){delete strip.dataset.suppressSwipeClick;event.preventDefault();event.stopImmediatePropagation();}},true);}
  var previous=btn("‹",function(){step(-1);});previous.setAttribute("aria-label",hebrew?"הישות הקודמת בסקיצה":"Previous sketch entity");strip.appendChild(previous);
  var caption=el("span","md-entity-nav-caption");caption.setAttribute("aria-live","polite");
  caption.textContent=selected?(selected.name || selected.type)+" · "+(entities.indexOf(selected)+1)+" / "+entities.length:(hebrew?"בחר ישות בסקיצה":"Browse sketch entities")+" · "+entities.length;
  caption.title=hebrew?"החלק ימינה או שמאלה לבחירת ישות":"Swipe left or right to select an entity";
  strip.appendChild(caption);
  var next=btn("›",function(){step(1);});next.setAttribute("aria-label",hebrew?"הישות הבאה בסקיצה":"Next sketch entity");strip.appendChild(next);
  var parameters=btn(hebrew?"פרמטרים":"Parameters",function(){
    var currentSketch=ensureSketch(E.def),entity=selectedSketchNavigationEntity(currentSketch,E.ssel || []);
    if(entity?.type==='point'){openSketchPointCoordinates(currentSketch,sketchNavigationTarget(currentSketch,entity));return;}
    setTab("shape");showModelerSheet("props");
  });
  parameters.disabled=!selected;parameters.setAttribute("aria-label",hebrew?"פרמטרים של הישות שנבחרה":"Selected entity parameters");strip.appendChild(parameters);
}

function syncFeatureNavigator() {
  var strip=root.querySelector('#mdFeatureNav');if(!strip)return;
  var model=currentTreeModel(),nodes=featureBrowseNodes(model);
  var formOpen=!!root.querySelector('#mdQuickSettings:not([hidden])');
  strip.hidden=E.docType!=='part'||E.mode!=='3d'||E.authoring?.phase==='sketch'||formOpen||!nodes.length;
  strip.innerHTML='';if(strip.hidden)return;
  var owner=E.def,hebrew=getLang()!=='en';
  var chosen=nodes.find(function(node){return node.kind==='feature'?(E.authoring.featureSelection || []).includes(node.targetId):(E.authoring.sketchSelection || []).includes(node.targetId);});
  function pick(id){
    if(E.def!==owner)return;
    var fresh=currentTreeModel(),node=featureBrowseNodes(fresh).find(function(item){return item.id===id;});
    if(!node||node.suppressed||node.rolled)return;
    if(node.kind==='sketch'){
      E.authoring.featureSelection=[];E.authoring.sketchSelection=[node.targetId];E.topologySelection=[];E.ssel=[];
      var consuming=(E.def.features || []).find(function(feature){return feature.references?.sketches?.some(function(ref){return (ref.id || ref)===node.targetId;})||feature.params?.sketchId===node.targetId;});
      E.sel=consuming?partsForFeature(consuming.id)[0] || null:null;
      refreshAll();
    }else selectTreeNode(node,fresh,null);
  }
  function step(direction){var index=chosen?nodes.indexOf(chosen):(direction>0?-1:0);for(var i=0;i<nodes.length;i++){index=(index+direction+nodes.length)%nodes.length;if(!nodes[index].suppressed&&!nodes[index].rolled){pick(nodes[index].id);return;}}}
  var previous=btn('‹',function(){step(-1);});previous.setAttribute('aria-label',hebrew?'השלב הקודם':'Previous feature');strip.appendChild(previous);
  strip.appendChild(el('span','md-feature-nav-icon',cadIcon(chosen?.icon || 'feature')));
  var select=el('select','md-feature-nav-select');select.setAttribute('aria-label',hebrew?'עיון בשלבי המודל':'Browse model features');
  var placeholder=el('option');placeholder.value='';placeholder.textContent=hebrew?'בחר שלב במודל':'Choose a model feature';select.appendChild(placeholder);
  nodes.forEach(function(node,index){var option=el('option');option.value=node.id;option.textContent=(index+1)+'. '+node.name+' · '+node.detail;option.disabled=!!(node.suppressed||node.rolled);select.appendChild(option);});
  select.value=chosen?.id || '';select.title=chosen?chosen.name+' · '+chosen.detail:placeholder.textContent;
  select.addEventListener('change',function(){pick(select.value);});strip.appendChild(select);
  var next=btn('›',function(){step(1);});next.setAttribute('aria-label',hebrew?'השלב הבא':'Next feature');strip.appendChild(next);
  var tree=btn(hebrew?'עץ':'Tree',function(){showModelerSheet('tree');});tree.setAttribute('aria-label',hebrew?'פתח עץ מודל מלא':'Expand feature tree');strip.appendChild(tree);
}

/* Each crumb names something already in the document, so selecting it is a
   lookup rather than a pick. A crumb whose target has gone (a feature rolled
   back, a body suppressed) selects nothing rather than throwing. */
function pickBreadcrumb(crumb) {
  if (!crumb) return;
  if (crumb.kind === "feature") {
    var feature = (E.def.features || []).find(function (item) { return item.id === crumb.id; });
    if (feature) { openFeatureEditor(feature); return; }
  }
  if (crumb.kind === "body" || crumb.kind === "feature") {
    var part = (E.def.parts || []).find(function (item) { return String(item.id) === String(crumb.id) || item.featureId === crumb.id; });
    if (!part) return;
    E.sel = part;
    E.topologySelection = [];
    E.ssel = [];
    refreshSelection();
    return;
  }
  if (crumb.kind === "component" && E.assembly) {
    var component = (E.assembly.components || []).find(function (item) { return item.id === crumb.id; });
    if (!component) return;
    E.componentSel = [component];
    E.sel = component;
    refreshSelection();
    return;
  }
  // A face or edge crumb is the pick itself: keep it, and clear the rest.
  var reference = (E.topologySelection || []).find(function (item) { return item.persistentId === crumb.id; });
  if (!reference) return;
  E.topologySelection = [reference];
  refreshSelection();
}

function closeChromeOverlays() {
  hidePickCycle();
  E.overlays.shortcut = false;
  E.overlays.views = false;
  E.overlays.menu = false;
  E.overlays.gesture = false;
  hideOverlay("#mdShortcutBar");
  hideOverlay("#mdViewSelector");
  hideOverlay("#mdContextMenu");
  hideOverlay("#mdGestureWheel");
}

function showShortcutBar() {
  var host = root && root.querySelector("#mdShortcutBar");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.shortcut = true;
  host.hidden = false;
  host.innerHTML = "";
  host.appendChild(el("div", "md-overlay-caption", t("shortcutBar")));
  var row = el("div", "md-shortcut-row");
  fillActionHost(row, shortcutBarItems({
    sketchPhase: E.authoring && E.authoring.phase === "sketch",
    assembly: E.docType === "assembly",
  }), closeChromeOverlays);
  host.appendChild(row);
}

function showViewSelector() {
  var host = root && root.querySelector("#mdViewSelector");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.views = true;
  host.hidden = false;
  host.innerHTML = "";
  host.appendChild(el("div", "md-overlay-caption", t("viewSelector")));
  var labels = { front: t("view_front"), top: t("view_top"), bottom: t("view_bottom"), right: t("view_right"), back: t("view_back"), left: t("view_left"), iso: t("isoView"), normalTo: t("normalTo") };
  VIEW_PRESETS.forEach(function (preset) {
    var button = el("button", "", (labels[preset.id] || preset.id) + (preset.shortcut ? " · " + preset.shortcut : ""));
    button.type = "button";
    button.addEventListener("click", function () {
      closeChromeOverlays();
      if (preset.id === "normalTo") orientModelToView(true);
      else if (preset.id === "top" || preset.id === "front") setView(preset.id);
      else if (preset.id === "right") setView("side");
      if (E.pv && preset.az != null) E.pv.orbitTo(preset.az, preset.el);
      drawSketch();
    });
    host.appendChild(button);
  });
  host.appendChild(btn('Save current view…',openNamedCameraViewForm));
  var owner=E.docType==='assembly'?E.assembly:E.def;
  try{namedCameraViews(owner).forEach(function(saved){
    var row=el('div','md-feature-actions');
    row.appendChild(btn(saved.name,function(){
      if(owner!==(E.docType==='assembly'?E.assembly:E.def)){flash('The view owner changed');return;}
      try{var current=namedCameraViews(owner).find(function(record){return record.id===saved.id;});if(!current)throw new Error('The named view no longer exists');restoreNamedCameraPose(E.pv,current.pose,namedCameraCenterY());closeChromeOverlays();syncViewButtons();drawSketch();}catch(error){flash(error.message);}
    }));
    row.appendChild(btn('Delete '+saved.name,function(){
      if(owner!==(E.docType==='assembly'?E.assembly:E.def)){flash('The view owner changed');return;}
      if(!namedCameraViews(owner).some(function(record){return record.id===saved.id;})){flash('The named view no longer exists');return;}
      pushUndo('Delete named view');var live=E.docType==='assembly'?E.assembly:E.def;
      if(removeNamedCameraView(live,saved.id)){scheduleModelerDraft();syncDirty();syncUndoButtons();showViewSelector();}
    }));host.appendChild(row);
  });}catch(error){host.appendChild(el('small','',error.message));}
}

function namedCameraCenterY(){if(E.docType==='assembly')return 0;var bounds=defBounds(E.def);return (bounds.y0+bounds.y1)/2;}
function openNamedCameraViewForm(){
  var owner=E.docType==='assembly'?E.assembly:E.def,type=E.docType,history=currentHistoryNode(),pose;
  try{pose=captureNamedCameraPose(E.pv,namedCameraCenterY());}catch(error){flash(error.message);return;}
  closeChromeOverlays();
  openQuickForm({action:'namedcameraview',title:'Save current view',hint:'Save this camera orientation, framing and projection on the current document. Model geometry is unchanged.',fields:[{key:'name',label:'View name',type:'text',value:''}],onApply:function(values){
    if(type!==E.docType||owner!==(E.docType==='assembly'?E.assembly:E.def)||currentHistoryNode()!==history){flash('The document changed while naming the view');return false;}
    var recordId=String(uid());
    try{var preview=cloneData(owner);addNamedCameraView(preview,{id:recordId,name:values.name,pose:pose});}catch(error){flash(error.message);return false;}
    pushUndo('Save named view');var live=E.docType==='assembly'?E.assembly:E.def;
    addNamedCameraView(live,{id:recordId,name:values.name,pose:pose});scheduleModelerDraft();syncDirty();syncUndoButtons();return true;
  }});
}

function showContextMenu(clientX, clientY, view) {
  var host = root && root.querySelector("#mdContextMenu");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.menu = true;
  host.hidden = false;
  host.innerHTML = "";
  /* Grouped, because the menu now carries two kinds of thing: what to select
     next, and what to build from it. Run together they read as one undivided
     list and the selection operations get lost among the features. */
  var lastGroup = null;
  contextMenuItems(chromeSelectionInput()).forEach(function (item) {
    if (lastGroup !== null && item.group !== lastGroup) host.appendChild(el("div", "md-context-sep"));
    lastGroup = item.group;
    var button = el("button", "", cadIcon(item.id || item.icon) + "<span>" + chromeCommandLabel(item.id) + "</span>");
    button.type = "button";
    button.addEventListener("click", function () { closeChromeOverlays(); runChromeCommand(item.id); });
    host.appendChild(button);
  });
  var mid = root.querySelector(".md-mid").getBoundingClientRect();
  host.style.left = Math.max(8, clientX - mid.left) + "px";
  host.style.top = Math.max(8, clientY - mid.top) + "px";
}

function previewMouseGesture(event, view, dx, dy) {
  var wheel = root && root.querySelector("#mdGestureWheel");
  if (!wheel) return;
  var dist = Math.hypot(dx || 0, dy || 0);
  var active = dist >= 24;
  wheel.hidden = !active;
  E.overlays.gesture = active;
  var id = gestureFromSwipe(dx, dy, 24);
  wheel.querySelectorAll("[data-cmd]").forEach(function (span) {
    span.classList.toggle("on", span.getAttribute("data-cmd") === id);
  });
}

function applyMouseGesture(dx, dy) {
  var id = gestureFromSwipe(dx, dy);
  hideOverlay("#mdGestureWheel");
  E.overlays.gesture = false;
  if (!id) return;
  if (id === "normalTo") { orientModelToView(true); drawSketch(); return; }
  runCommand(id);
}

function finishActiveCommand() {
  var corner = confirmationCornerState(currentCornerInput());
  if (dynHasEntry() && dynCommit()) { syncContextActions(); return; }
  if (corner.mode === "feature") {
    var apply = root.querySelector("#mdQuickSettings .md-quick-apply");
    if (apply) {
      if (apply.modelerApply) return apply.modelerApply();
      apply.click();
    }
    return;
  }
  if (corner.mode === "sketch") { finishSketchWorkflow(); return; }
  if (E.wallPts) finishWallChain(false);
  else if (E.poly) {
    if (E.poly.length < 3) { flash(t("polyHint")); return; }
    finishPoly();
  }
  syncContextActions();
}

function cancelActiveCommand() {
  if(E.quickAction){
    var quickCancel=root && root.querySelector('.md-quick-cancel');
    if(quickCancel){
      var quickActions=quickCancel.closest('.md-feature-actions');
      if(quickActions && quickActions.hidden)quickActions.hidden=false;
      quickCancel.click();return;
    }
  }
  cancelCadWorkerWork();
  var corner = confirmationCornerState(currentCornerInput());
  if (corner.mode === "feature") {
    if (E.authoring && E.authoring.featureEdit) cancelFeatureParameterEdit(false);
    else { E.authoring.featureType = null; clearFeaturePreview(true); closeFeaturePanel(); }
    syncAuthoringWorkflow();
    syncContextActions();
    return;
  }
  if (corner.mode === "sketch") {
    E.authoring.phase = "model";
    E.authoring.workflowFocus = "context";
    E.modelPlaneActive = false;
    setMode("3d");
    restoreSketchCameraPose();
    syncAuthoringWorkflow();
    syncContextActions();
    return;
  }
  if (E.wallPts) finishWallChain(true);
  E.poly = null;
  E.arcPts = null;
  E.slotPts = null;
  E.ellPts = null;
  E.splinePts = null;
  E.dynInput = null;
  E.drag = null;
  E._osnap = null;
  drawSketch();
  syncHint();
  syncContextActions();
}

function featureSelectionReady() {
  var type = E.authoring && E.authoring.featureType;
  if (E.authoring && E.authoring.featureEdit) return true;
  if (type==="loft") return (activeLoftCreation()?.loftSectionIds.length || 0)>=2;
  return !["fillet","chamfer","shell","dome","draft","thicken"].includes(type) || !!(selectedSolid() && finishFeatureTargets(type).length && E.authoring.finishPreviewStatus === "ready");
}

function returnToFeatureParameters() {
  E.collectingFeature = false;
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
  syncContextActions();
}

function currentCornerInput() {
  var drawing = !!(E.wallPts || E.poly || E.arcPts || E.slotPts || E.ellPts || (E.drag && E.drag.sticky));
  return {
    drawing: drawing,
    canAccept: !E.arcPts && !(E.poly && E.poly.length < 3) && !((E.slotPts || E.ellPts || (E.drag && E.drag.sticky)) && !dynHasEntry()),
    toolLabel: ({ wall:t("tool_wall"), constr:t("cap_constr"), poly:t("tool_poly"), cut:t("tool_cut"), rev:t("tool_rev"), sarc:t("tool_sarc"),
      sslot:t("tool_sslot"), sell:t("tool_sell"), spoly:t("tool_spoly"), srect:t("tool_srect"), scirc:t("tool_scirc") })[E.tool],
    featureReady: featureSelectionReady(),
    featureType: E.authoring && E.authoring.featureType,
    featureLabel: E.authoring && E.authoring.featureType && featureTypeLabel(E.authoring.featureType),
    sketchPhase: E.authoring && E.authoring.phase === "sketch" && !drawing,
    finishSketchLabel: t("finishSketch"),
  };
}

/* The offer that replaces the auto-extrude. A closed profile lights the four
   features that can consume it, in the confirmation corner where the sketch's
   own accept button just was — so the next click is one click away without the
   editor having decided which. Enter takes the first, which is Extrude: the
   common case still costs one keystroke, it just is not silently assumed. */
function offerProfileFeatures() {
  var host = root && root.querySelector("#mdProfileOffer");
  var choices = featuresForClosedProfile(!!closedSketchProfile());
  if (!host) return;
  E.profileOffer = choices.length ? choices : null;
  host.hidden = !choices.length;
  host.innerHTML = "";
  if (!choices.length) return;
  host.appendChild(el("span", "md-profile-offer-label", t("profileOfferLabel")));
  choices.forEach(function (type, index) {
    var command = FEATURE_COMMAND[type];
    var label = chromeCommandLabel(command);
    var button = el("button", index ? "" : "btn-accent", cadIcon(command) + "<span>" + label + "</span>");
    button.type = "button";
    button.title = label + (index ? "" : " · Enter");
    button.addEventListener("click", function () {
      dismissProfileOffer();
      setCommandTab("features");
      openParametricFeature(type);
    });
    host.appendChild(button);
  });
}

function dismissProfileOffer() {
  E.profileOffer = null;
  var host = root && root.querySelector("#mdProfileOffer");
  if (host) { host.hidden = true; host.innerHTML = ""; }
}

function syncContextActions() {
  var bar = root && root.querySelector("#mdContextActions");
  if (!bar) return;
  var state = confirmationCornerState(currentCornerInput());
  bar.hidden = !state.visible;
  if (state.visible) {
    root.querySelector("#mdActiveCommand").textContent = state.label || t("cmdSketch");
    root.querySelector("#mdAcceptCommand").disabled = !state.canAccept;
  }
  var parameters = root.querySelector("#mdReturnParameters");
  if (!parameters) {
    parameters = btn(t("returnToParameters"), returnToFeatureParameters);
    parameters.id = "mdReturnParameters"; bar.appendChild(parameters);
  }
  parameters.hidden = !E.collectingFeature;
  syncDuplicateCommit(state);
  syncSelectionChrome();
}

/* Two commit buttons is one too many. While the corner is up it already owns
   the beat — green check, red X, Enter, Esc — and the feature form's own
   apply/cancel pair repeats it a panel-width away from the geometry the user
   is looking at, which is the one place they are not. The row is hidden rather
   than removed: finishActiveCommand invokes its native Apply handler, so
   both routes commit through exactly one code path and cannot drift apart.
   On compact screens the labelled thumb row owns these same actions and stays
   above the sheet and software keyboard, so the form can give its space back. */
function syncDuplicateCommit(state) {
  var actions = root && root.querySelector("#mdQuickSettings .md-feature-actions");
  if (!actions) return;
  var cornerOwnsCommit = state.visible && state.mode === "feature";
  actions.hidden = cornerOwnsCommit;
}

async function newModel(template) {
  if (!await confirmDiscardDocument("unsavedNew")) return;
  E.quickFormInstance?.dismiss(true);
  closeEvalCard();
  E.contextEdit=null;
  E.lastOperation = null;
  E.sketchCameraReturnPose = null;
  /* Selection outlives the document unless it is cleared here. Every topology
     reference names the feature it came from, so a face left selected from the
     discarded model pointed at a feature id the new document has never heard
     of — and the "Create sketch on reference" button went on offering it.
     Taking that offer attached a sketch to a missing feature, so a brand-new
     part opened already carrying rebuild errors, with the broken reference
     naming a feature that no longer appeared anywhere in its tree. */
  E.topologySelection = [];
  E.hoverTopology = null;
  E.ssel = [];
  E.facePick = null;
  E.collectingFeature = false;
  E.selectedReferenceId = null;
  E.mobileAddSelection = false;
  if (E.docType === "assembly") {
    E.assembly = template?.kind==='assembly-template'?documentFromPreset(newAssembly(),template,'assembly-template'):newAssembly();
    if(template?.kind==='assembly-template')E.assembly.name='Assembly from '+template.name;
    assemblyOpenBaseline=null;
    invalidateInterference();
    E.componentSel = [];
    E.sel = null;
    H.clear().seed();
    markDocumentClean();
    reconcileModelerDraft();
    syncHead();
    refreshLib();
    refreshAll();
    setTab("parts");
    return;
  }
  E.def = newDef();
  partHistoryMarker={savedEdit:0};
  E.sheet?.resetSession();
  if(template?.kind==='part-template'){E.def=documentFromPreset(E.def,template,'part-template');E.def.name='Part from '+template.name;}
  if(template?.kind==='drawing-template'){E.def.drawing=drawingFromTemplate(template);E.def.name='Drawing from '+template.name;}
  libraryOpenBaseline=null;
  E.srcItem = null;
  E.sel = null;
  E.authoring={phase:"model",referenceId:null,sketchId:null,featureType:null,sketchSelection:[],featureSelection:[],workflowFocus:"context"};
  H.clear().seed();
  markDocumentClean();
  reconcileModelerDraft();
  syncHead();
  refreshAll();
  setTab("parts");
  if(template?.kind==='drawing-template')setMode('drawing');
}

async function leavingQuickForm(leave) {
  var form = E.quickFormInstance;
  if (form?.applying) {
    await form.applying;
    if (!E.open || !form.ownsDocument() || (E.quickFormInstance && E.quickFormInstance !== form)) return false;
  }
  if (!E.quickFormInstance?.hasPendingEdits()) return leave();
  if (!await confirmDiscardDocument("unappliedCommand")) return false;
  E.quickFormInstance.dismiss(true);
  return leave();
}

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

function setDocumentType(type) {
  type = type === "assembly" ? "assembly" : "part";
  if(type==="assembly" && E.contextEdit){finishContextPart();return;}
  if (type === E.docType) return;
  E.quickFormInstance?.dismiss(true);
  abandonDocumentExactWork();
  closeEvalCard();
  E.docType = type;
  E.poly = null;
  E.wallPts = null;
  E.drag = null;
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.facePick = null;
  E.sketchCameraReturnPose = null;
  E.arcPts = null;
  E.componentSel = [];
  invalidateInterference();
  E.dependencyHighlight = null;
  if (type === "assembly" && !E.assembly) {
    E.assembly = newAssembly();
    markDocumentClean();
  }
  root.classList.toggle("md-assembly", type === "assembly");
  // the two document shapes draw different trees; a row id from one of them
  // means nothing in the other
  E.treeState = {};
  E.treeModel = null;
  syncInspectorTabLabels();
  /* The sketch pane has nothing to show for an assembly and is hidden there, so
     do not leave the strip pointing at a tab that is no longer in it. */
  if (type === "assembly" && activeTab("R") === "sketch") setTab("shape");
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-doc") === type);
  });
  if (type === "assembly") { setMode("3d"); setCommandTab("assembly"); setTab("parts"); }
  else { setMode("3d"); setCommandTab("features"); }
  syncHead();
  refreshLib();
  refreshAll();
  syncDirty();
  fitPreview();
}

async function saveAssemblyDocument() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.assembly) E.assembly = newAssembly();
  E.assembly.name = root.querySelector("#mdName").value || E.assembly.name;
  setDocumentDescription(E.assembly, root.querySelector("#mdDescription").value);
  var owner=E.assembly, session=assemblySaveSession(owner), history=currentHistoryNode();
  var generation=H.generation;
  var edit=H.editRevision("assembly");
  var resolved=applyTrackedUpdates(owner);
  applyAssemblyMates(owner);
  if(resolved)redrawTrackedUpdates();
  var saved = cloneData(owner);
  if (!await saveAssemblies(saved,{expected:assemblyOpenBaseline})) {
    report(t("reportKickerSave"), t("saveAssemblyFailed"), t(lastAssemblySaveConflict ? "saveAssemblyConflict" : "saveStorageFull"));
    return;
  }
  if(assemblySaveSession(E.assembly)!==session)return;
  assemblyOpenBaseline=cloneData(saved);
  // A tab switch changes which marker the UI reads. This write belongs to
  // the captured assembly session and history tree, even while Part is active.
  session.savedEdit=edit;
  if(E.docType!=="assembly"){
    reconcileModelerDraft();
    return;
  }
  refreshLib();
  if(E.assembly!==owner || H.generation!==generation || currentHistoryNode()!==history || H.editRevision("assembly")!==edit){
    // Context editing may already have started a new tree with reused node IDs.
    syncDirty();reconcileModelerDraft();return;
  }
  flash("✓ " + t("savedAssembly"));
  markDocumentClean();
  reconcileModelerDraft();
  updateTourProgress();
}

// A room object is a reusable snapshot; the complete editable assembly is kept
// alongside it so publication never discards the component feature histories.
async function publishAssemblyModel() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.assembly?.components?.length) { flash(t("needParts")); return; }
  applyAssemblyMates(E.assembly);
  var source=cloneData(E.assembly), parts=[];
  try {
    // every part occurrence, sub-assemblies included, at its composed pose
    for (var occurrence of flattenAssembly(source,{visibleOnly:true})) {
      var component=occurrence.component;
      var def=componentDef(component), run=null;
      if(!def)throw new Error("A component is missing from the library");
      try {
        if(def.metadata?.authoringSystem==="parametric-v1") {
          var compiled=compileKernelFeatureTree(def);
          if(!compiled.ok)throw new Error("A component feature history needs repair");
          run=await regenerateFeatures({...compiled.document,features:compiled.features});
          if(!run.ok)throw new Error("A component could not rebuild");
        }
        var place=occurrence.placement, matrix=new THREE.Matrix4().makeBasis(
          new THREE.Vector3(place.x.x,place.x.y,place.x.z),new THREE.Vector3(place.y.x,place.y.y,place.y.z),new THREE.Vector3(place.z.x,place.z.y,place.z.z))
          .setPosition(place.origin.x,place.origin.y,place.origin.z);
        for(var part of activeParts(def)) {
          var body=run?.results.get(cutTargetFeatureId(part,def));
          var mesh=body?.shape ? await shapeToMeshData(body,{deflection:.28,angle:.18}) :
            {positions:tessellateParts([part])[0]?.positions};
          if(!mesh.positions?.length)throw new Error("A component has no usable solid geometry");
          var positions=Array.from(mesh.positions), point=new THREE.Vector3();
          for(var at=0;at<positions.length;at+=3){point.fromArray(positions,at).applyMatrix4(matrix);point.toArray(positions,at);}
          parts.push({id:uid(),kind:"mesh",name:(component.name || def.name)+" · "+(part.name || "body"),
            color:part.color || "#999999",metal:part.metal,rough:part.rough,
            meshData:{positions,indices:mesh.indices ? Array.from(mesh.indices):undefined}});
        }
      } finally {if(run)releaseRegeneration(run);}
    }
    // Rebuildable preview caches can dwarf the authored history and would be
    // copied into every room undo entry. Preserve inputs, not derived caches.
    flattenAssembly(source).forEach(function(occurrence){
      var definition=occurrence.component.def;
      if(definition?.metadata?.authoringSystem!=="parametric-v1")return;
      function stripDerived(value) {
        if(!value || typeof value!=="object")return;
        delete value.exactTopologyCache;delete value.meshData;delete value.exactBuildToken;
        Object.values(value).forEach(stripDerived);
      }
      stripDerived(definition);
    });
    var model={key:"cm_"+source.key,name:source.components.map(c=>c.name || componentDef(c)?.name || "Component").join(" + "),
      parts,metadata:{sourceAssembly:source},col:"#999999"};
    normalizeDef(model);
    if(!await saveLib(model,{expected:loadLib().find(m=>m.key===model.key) || null}))throw new Error(t("saveStorageFull"));
    registerCustomModel(model);refreshCatalogSelect();
    var committed=commitDefinition(S,model);
    if(committed.affected.length){markPlannerDirty();S.dirty3D=true;render2D();}
    flash(getLang()==="en"?"✓ Combined model saved to room library":"✓ המודל המשולב נשמר בספרייה");
  } catch(error) {report(t("reportKickerSave"),t("saveRebuildFailed"),String(error.message || error));}
}

var documentSaveTasks=new WeakMap();
function saveProgress(key, document) {
  if(document !== (E.docType === "assembly" ? E.assembly : E.def))return;
  var save=root && root.querySelector("#mdSave");
  if(save){save.setAttribute("aria-busy","true");save.dataset.savePhase=key;}
  syncDraftStatus(key);flash(t(key));
}
function saveCurrentDocument() {
  if(motionPlaybackCancel){flash("Keep current pose or cancel the motion preview before saving.");return Promise.resolve();}
  var document=E.docType === "assembly" ? E.assembly : E.def;
  if(!document)return Promise.resolve();
  var activeOwner=function(){return E.docType==="assembly" ? assemblySaveSession(E.assembly) : E.contextEdit ? E.def : partHistoryMarker;};
  var taskOwner=activeOwner();
  var pending=documentSaveTasks.get(taskOwner);
  if(pending)return pending;
  saveProgress("savePreparing",document);
  var task=Promise.resolve(E.docType === "assembly" ? saveAssemblyDocument() : saveModel()).catch(function(error){
    if(taskOwner === activeOwner())
      report(t("reportKickerSave"),t("saveLibraryFailed"),String(error.message || error));
  }).finally(function(){
    documentSaveTasks.delete(taskOwner);
    var active=activeOwner();
    if(documentSaveTasks.has(active))return;
    var save=root && root.querySelector("#mdSave");
    if(save){save.removeAttribute("aria-busy");delete save.dataset.savePhase;}
    if(taskOwner===active && documentDirty())syncDraftStatus("saveStillUnsaved");
  });
  documentSaveTasks.set(taskOwner,task);
  return task;
}

function syncViewButtons() {
  var projectionButton=root.querySelector('#mdPerspectiveView');
  if(projectionButton){var perspective=!E.pv||(!E.pv.fixedFrame&&E.pv.getProjection()==='perspective');projectionButton.classList.toggle('on',perspective);projectionButton.setAttribute('aria-pressed',String(perspective));projectionButton.disabled=!!E.pv?.fixedFrame;projectionButton.title=E.pv?.fixedFrame?'Normal To uses orthographic projection; orbit preference is retained':'Toggle perspective / orthographic orbit projection';}
  var active = E.view;
  if (E.mode === "3d" && E.pv) {
    var preset = !E.pv.fixedFrame && VIEW_PRESETS.find(function (item) {
      return item.az != null && Math.abs(Math.atan2(Math.sin(E.pv.az-item.az), Math.cos(E.pv.az-item.az))) < 0.001 && Math.abs(E.pv.el-item.el) < 0.001;
    });
    active = preset ? (preset.id === "right" ? "side" : preset.id) : null;
  }
  root.querySelectorAll("[data-view]").forEach(function (button) {
    var selected = button.getAttribute("data-view") === active;
    button.classList.toggle("on", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function syncTools() {
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-tool") === E.tool);
  });
  syncViewButtons();
  syncNormalToControls();
  var sheetTool = E.mode === "drawing" && E.sheet ? E.sheet.getTool() : null;
  var hiddenButton = root.querySelector("#mdSheetHidden");
  if (hiddenButton && E.mode === "drawing") {
    var showsHidden = drawingDocument().showHidden !== false;
    hiddenButton.classList.toggle("on", showsHidden);
    hiddenButton.setAttribute("aria-pressed", showsHidden ? "true" : "false");
  }
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-drawing-tool") === sheetTool);
    b.setAttribute("aria-pressed", b.getAttribute("data-drawing-tool") === sheetTool ? "true" : "false");
  });
  root.classList.toggle("md-tool-dim", E.mode === "drawing" && sheetTool !== "select");
  var paintBar = root.querySelector("#mdPaintToolbar");
  if (paintBar) {
    var showPaint = E.tool === "paint";
    paintBar.hidden = !showPaint;
    if (showPaint) syncPaintToolbar();
  }
  var notesBar = root.querySelector("#mdNotesToolbar");
  if (notesBar) {
    var showNotes = E.tool === "note" && E.mode !== "drawing";
    notesBar.hidden = !showNotes;
    if (showNotes) syncNotesToolbar();
  }
  syncHint();
  syncStatus();
  syncExtrudeButton();
  syncCommandManager();
  syncContextActions();
}

/* Whether the sketch currently offers a profile changes with almost every edit,
   not just with the active tool — so this is its own sync, called from
   refreshAll as well as from the toolbar. */
function syncExtrudeButton() {
  if (!root) return;
  var profileInfo = E.docType === "part" ? sketchProfileAnalysis() : {profiles:[],openEnds:[],branchPoints:[]};
  // A sketch whose shapes only close by crossing each other has no chain
  // profile and still encloses area, so the button follows the areas.
  var regionCount = E.docType === "part" ? (sketchRegionAnalysis().regions || []).length : 0;
  var available = E.docType === "part" && (!!profileInfo.profiles.length || regionCount > 0);
  var pathReady=E.docType === "part" && !available ? sketchOpenPathReadiness(ensureSketch(E.def)) : null;
  var why = available ? t("profileReady") + (regionCount > 1 ? " · " + regionCount + " " + t("profileRegions") : "")
    : pathReady ? t(pathReady.kind === "thin" ? "profileThinReady" : "profileOpenPath")
    : profileInfo.branchPoints.length ? t("profileBranched")
    : profileInfo.openEnds.length ? t("profileOpen") + " · " + profileInfo.openEnds.length + " " + t("profileEnds")
    : t("profileEmpty");
  // the ribbon's Extrude is now the only one, so it carries the readiness state
  root.querySelectorAll('[data-command="extrude"]').forEach(function (button) { button.title = why; });
  syncCommandManager();
}

function sketchOpenPathReadiness(sketch) {
  var authoring=E.authoring || {},type=authoring.featureType;
  var state=authoring.featureEdit
    ? (E.def.features || []).find(function(feature){return feature.id===authoring.editFeatureId;})
    : authoring.featurePreviewState;
  return thinExtrudeSketchReadiness(sketch,{type:type,params:state && state.params,
    selectedIds:(state && state.thinChainKeys || E.sselAuto) ? [] : selEntities().map(function(entity){return entity.id;}),
    chainKeys:state && state.thinChainKeys || [],features:E.def.features || []});
}

var exactWorkerActivityTimer=0,exactWorkerActivitySubscribed=false;
function syncExactWorkerActivity(){
  if(!exactWorkerActivitySubscribed && cadWorkerAvailable()){
    exactWorkerActivitySubscribed=true;
    subscribeCadWorkerActivity(function(){syncExactWorkerActivity();});
  }
  var st=root && root.querySelector("#mdStatus");
  if(!st)return;
  var jobs=cadWorkerActivity().filter(function(job){return job.scope!=="interference";});
  var chip=st.querySelector(".md-exact-activity");
  if(!jobs.length){if(chip)chip.remove();if(exactWorkerActivityTimer){clearInterval(exactWorkerActivityTimer);exactWorkerActivityTimer=0;}return;}
  if(!chip){
    chip=el("span","md-exact-activity");chip.setAttribute("aria-live","polite");
    chip.appendChild(el("span","md-exact-activity-text"));
    var cancel=btn("Cancel",function(event){event.stopPropagation();cancelExactModelRebuild();flash("Exact computation cancelled");},"md-cancel-exact");
    cancel.title="Cancel this tab's pending exact computations";cancel.setAttribute("aria-label","Cancel exact computation");chip.appendChild(cancel);
    st.appendChild(chip);
  }
  var job=jobs.find(function(item){return item.progress;}) || jobs[0];
  var seconds=Math.floor((Date.now()-job.startedAt)/1000);
  chip.querySelector(".md-exact-activity-text").textContent=(job.progress?.stage==="loading-runtime"?"Loading CAD runtime · ":job.progress?.stage==="restore"?"Restoring exact geometry · ":job.progress && job.progress.stage!=="queued"?"Computing exact geometry · ":"Queued exact geometry · ")+(job.progress?.name || job.name)+" · "+seconds+"s"+(jobs.length>1?" · "+(jobs.length-1)+" queued":"")+" ";
  if(!exactWorkerActivityTimer)exactWorkerActivityTimer=setInterval(syncExactWorkerActivity,1000);
}

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

function openFeatureEditor(feature) {
  if (!E.def || !E.authoring || !feature) return;
  if(feature.type==='hole' && feature.params?.holeProfileSketchId){
    var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===feature.params.holeProfileSketchId;});
    if(profileSketch){editHoleWizardSketch(profileSketch);return;}
    flash('Hole profile sketch is missing; repair its history reference');return;
  }
  var host=root && root.querySelector("#mdQuickSettings"),spec=featureSpec(feature.type);if(!host||!spec)return;
  E.quickFormInstance?.dismiss();
  if(E.authoring.featureEdit)cancelFeatureParameterEdit(true);
  if(E.authoring.featurePreviewState){
    E.quickAction=null;E.collectingFeature=false;
    clearFeaturePreview(false);
  }
  pushUndo("Edit "+feature.name);E.authoring.featureEdit={featureId:feature.id,snapshot:cloneData(feature),history:currentHistoryNode(),historyName:E.def.history?.find(item=>item.targetId===feature.id)?.name};
  var scope=registerFeatureForm(host,feature.type);host=scope.content;
  E.authoring.featureType=feature.type;E.authoring.editFeatureId=feature.id;
  if(["fillet","chamfer"].includes(feature.type)){
    E.authoring.featurePreviewState=feature;
    E.topologySelection=canonicalFeatureTopologyReferences(E.def,cloneData(feature.references?.topology || []));
    feature.references.topology=cloneData(E.topologySelection);
    var finishCompiled=compileKernelFeatureTree(E.def),finishInput=feature.inputs?.[0];
    E.authoring.finishEditTopology=finishCompiled.ok ? verifiedExactTopology(E.def,finishCompiled.features).get(finishInput) || null : null;
  }
  host.appendChild(el("div","md-feature-form-title",cadIcon(feature.type)+'<span><b>'+tf("featureEditTitle",{name:feature.name})+'</b><small>'+tf("featureEditStep",{id:feature.id})+'</small></span>'));
  highlightFeatureIssueBanner(host, feature);
  if(E.authoring.repairMarker)host.appendChild(el("div","md-note",t("repairLastLocation")));
  var name=featureField(host,{key:"$name",label:t("fldFeatureName"),type:"text"},feature.name),liveBadge=el("div","md-feature-live on",'<i class="ph ph-broadcast"></i> '+t("featureLiveAllViews"));host.appendChild(liveBadge);
  var supportSketch=feature.type==="hole" ? (E.def.sketches || []).find(function(sketch){return sketch.id===feature.params?.sketchId;}) : null;
  var supportSelect=null,supportChoices=[];
  var finishTargetSelect=null,finishTargetChoices=[],draftNeutralSelect=null,draftNeutralChoices=[];
  // A single Shell opening can be repaired from the same verified planar
  // face picker as a Dome, without collapsing a multi-opening Shell.
  if(feature.type==="dome" || feature.type==="draft" && (feature.references?.topology || []).length<=1){
    var targetStageId=(feature.inputs || []).map(dependencyReferenceId)[0];
    var targetCompiled=compileKernelFeatureTree(E.def);
    var targetStageEntries=(targetCompiled.ok && verifiedExactTopology(E.def,targetCompiled.features).get(targetStageId))
      || E.brepRun?.results?.get(targetStageId)?.topology || [];
    finishTargetChoices=feature.type==="draft" ? draftFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit()) : planarMateFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit());
    if(finishTargetChoices.length){
      var finishTargetRow=el("label","md-row md-row-wide");finishTargetRow.appendChild(el("span","t",t("featureTargetFace")));
      finishTargetSelect=document.createElement("select");finishTargetSelect.setAttribute("aria-label",t("featureTargetFace"));
      finishTargetChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;finishTargetSelect.appendChild(option);});
      finishTargetSelect.value=feature.references?.topology?.[0]?.persistentId || "";
      finishTargetRow.appendChild(finishTargetSelect);host.appendChild(finishTargetRow);
    }
    if(feature.type==="draft"){
      draftNeutralChoices=planarMateFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit());
      var draftNeutralRow=el("label","md-row md-row-wide");draftNeutralRow.appendChild(el("span","t",t("fcFldNeutralPlane")));
      draftNeutralSelect=document.createElement("select");draftNeutralSelect.setAttribute("aria-label",t("fcFldNeutralPlane"));
      var noNeutral=document.createElement("option");noNeutral.value="";noNeutral.textContent="Use axis and start/end settings";draftNeutralSelect.appendChild(noNeutral);
      draftNeutralChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;draftNeutralSelect.appendChild(option);});
      draftNeutralSelect.value=feature.params?.neutralFace?.persistentId || "";
      draftNeutralRow.appendChild(draftNeutralSelect);host.appendChild(draftNeutralRow);
      var refreshDraftStatus=el("p","md-field-hint","Face choices are from the saved model. Refresh to inspect native upstream geometry.");
      refreshDraftStatus.setAttribute("role","status");
      var refreshDraftFaces=btn("Refresh exact faces",async function(){
        refreshDraftFaces.disabled=true;
        refreshDraftStatus.textContent="Computing exact upstream faces…";
        try{
          var compiledFaces=compileKernelFeatureTree(E.def);
          if(!compiledFaces.ok)throw new Error(compiledFaces.issues[0]?.message || "Invalid feature history");
          var draftIndex=compiledFaces.features.findIndex(function(item){return item.id===feature.id;});
          if(draftIndex<0)throw new Error("Draft is missing from the feature history");
          var refreshed=await topologyInCadWorker({...compiledFaces.document,features:compiledFaces.features.slice(0,draftIndex)},targetStageId,{onProgress:function(progress){refreshDraftStatus.textContent="Refreshing exact faces · "+(progress.name || progress.stage);flash(refreshDraftStatus.textContent);}});
          if(!scope.form.isCurrent())return;
          finishTargetChoices=draftFaceChoices(refreshed.topology,E.def.features || [],modelLengthUnit());
          draftNeutralChoices=planarMateFaceChoices(refreshed.topology,E.def.features || [],modelLengthUnit());
          if(!finishTargetSelect)throw new Error("No target face selector is available");
          var selectedTarget=finishTargetSelect.value,selectedNeutral=draftNeutralSelect.value;
          finishTargetSelect.innerHTML="";draftNeutralSelect.innerHTML="";
          finishTargetChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;finishTargetSelect.appendChild(option);});
          var blankNeutral=document.createElement("option");blankNeutral.value="";blankNeutral.textContent="Use axis and start/end settings";draftNeutralSelect.appendChild(blankNeutral);
          draftNeutralChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;draftNeutralSelect.appendChild(option);});
          finishTargetSelect.value=selectedTarget;draftNeutralSelect.value=selectedNeutral;
          refreshDraftStatus.textContent="Native faces refreshed: "+finishTargetChoices.length+" draftable faces and "+draftNeutralChoices.length+" neutral planes. Choose the target and neutral plane before updating.";
          flash("Exact upstream faces refreshed. Choose the drafted face and neutral plane.");
        }catch(error){refreshDraftStatus.textContent="Exact face refresh failed: "+(error.message || "Unknown error")+". Previous face choices remain unchanged.";console.warn("Draft exact face refresh failed",error);flash(refreshDraftStatus.textContent);}
        finally{refreshDraftFaces.disabled=false;}
      });host.appendChild(refreshDraftFaces);host.appendChild(refreshDraftStatus);
    }
  }
  if(supportSketch){
    var featureIndex=(E.def.features || []).indexOf(feature);
    var earlier=(E.def.features || []).slice(0,featureIndex);
    var allowedOwners=new Set(earlier.map(function(item){return item.id;}));
    var supportStageId=(feature.inputs || []).map(dependencyReferenceId).find(function(id){return allowedOwners.has(id);}) || earlier.at(-1)?.id;
    var supportCompiled=compileKernelFeatureTree(E.def);
    var supportTopology=supportCompiled.ok ? verifiedExactTopology(E.def,supportCompiled.features) : new Map();
    supportChoices=holeSupportChoices(earlier,supportTopology,supportSketch.support,supportStageId,modelLengthUnit());
    if(supportChoices.length || !supportSketch.support){
      var supportRow=el("label","md-row md-row-wide");supportRow.appendChild(el("span","t",t("sketchSupportFace")));
      supportSelect=document.createElement("select");supportSelect.setAttribute("aria-label",t("sketchSupportFace"));
      if(!supportSketch.support){var datumOption=document.createElement("option");datumOption.value="";datumOption.textContent="Datum sketch (unattached) · "+(supportSketch.plane || "top");supportSelect.appendChild(datumOption);}
      supportChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.key;option.textContent=choice.label;supportSelect.appendChild(option);});
      supportSelect.value=supportSketch.support ? "current" : "";
      supportRow.appendChild(supportSelect);host.appendChild(supportRow);
      host.appendChild(el("p","md-field-hint","Choose the feature stage whose face defines the hole position. Changing support preserves local point coordinates; adjust Positions afterward to preserve the intended model location. Earlier stages use verified native faces, before later trimming."));
    }
  }
  function validateRevolveEdit(values){
    values.params.axis=revolvePreviewAxis(values.params,values.references);
    if(isStandaloneSketchAxisRevolve(values.params))assertStandaloneRevolve(values.params);
    else if(isSketchAxis(values.params.axis))resolvedRevolve(sketchById(E.def,values.params.sketchId),values.params);
  }
  var editingRevolve=feature.type==="revolve" || feature.type==="revolveCut";
  var pendingFrame=0,controls=renderFeatureParameterForm(host,feature.type,feature,function(next){
    if(editingRevolve){
      try{validateRevolveEdit(next);liveBadge.textContent=t("featureLiveAllViews");}
      catch(error){liveBadge.textContent=String(error.message || error);return;}
    }
    // A changed Boolean is committed by Update, not by the parameter ghost.
    if(feature.type==="extrude" && next.params.operation==="subtract")next.params.operation=feature.params.operation || "add";
    if(feature.type==="loft")next.params.operation=feature.params.operation || "add";
    feature.params={...feature.params,...next.params};setFeatureReferencesFromForm(feature,next.references);retargetSweepHelix(feature);feature.name=name.value || feature.name;
    if(shellEditor)shellEditor.sync();
    if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(function(){pendingFrame=0;if(!scope.form.isCurrent())return;syncLiveFeatureEdit(feature);if(["fillet","chamfer"].includes(feature.type))renderFinishEdgeList();if(feature.type==="toolbox"&&name.value!==feature.name)name.value=feature.name;liveBadge.classList.add("pulse");setTimeout(function(){liveBadge.classList.remove("pulse");},180);});
  });
  if(feature.type==="loft"){
    var loftOperationControl=controls.find(function(control){return control.field.key==="operation";});
    if(loftOperationControl)loftOperationControl.input.disabled=true;
    host.appendChild(el("p","md-field-hint",t("loftEditOperation")));
  }
  var shellEditor=addShellFaceThicknessControls(host,feature,function(){syncLiveFeatureEdit(feature);},feature,function(){return finishTargetSelect?.value ? [finishTargetSelect.value] : (feature.references?.topology || []).map(function(ref){return ref.persistentId;});});
  var editOperationSelect=null;
  if(feature.type==="extrude" || feature.type==="extrudeCut"){
    var existingOperation=controls.find(function(control){return control.field.key==="operation";});
    if(existingOperation){
      editOperationSelect=existingOperation.input;
      var subtractOption=document.createElement("option");subtractOption.value="subtract";subtractOption.textContent=t("fcOptSubtract");editOperationSelect.appendChild(subtractOption);
    }else editOperationSelect=featureField(host,{key:"$editOperation",label:t("fcFldOperation"),type:"select",choices:[{value:"subtract",label:t("fcOptSubtract")},{value:"add",label:t("fcOptAdd")}]},"subtract");
    host.appendChild(el("p","md-field-hint",t("extrudeOperationEditHint")));
  }
  name.addEventListener("input",function(){feature.name=name.value || feature.name;var entry=(E.def.history || []).find(function(item){return item.targetId===feature.id;});if(entry)entry.name=feature.name;refreshParts();fillInspector();});
  var dependencies=[];(feature.references.sketches || []).forEach(function(id){dependencies.push(t("depSketch")+": "+(id.id||id));});(feature.inputs || []).forEach(function(id){dependencies.push(t("depFeature")+": "+id);});
  host.appendChild(el("div","md-feature-selection-note",dependencies.length?t("upstreamDependencies")+": "+dependencies.join(" · "):t("noUpstreamDeps")));
  if(["extrude","extrudeCut"].includes(feature.type) && !feature.params?.thinFeature){
    var contourStatus=el("p","md-field-hint","Refresh after editing this solid extrusion's sketch to update its profile and inner holes.");
    var contourRefresh=btn("Refresh sketch contour",function(){
      try{
        var sourceSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===feature.params?.sketchId;});
        var refreshed=refreshedExtrudeProfile(feature,sourceSketch);
        feature.params=refreshed.params;feature.references=refreshed.references;
        contourStatus.textContent="Sketch contour refreshed · "+refreshed.holeCount+" inner "+(refreshed.holeCount===1?"hole":"holes")+". Click Update feature to rebuild.";
        contourStatus.removeAttribute("data-error");
      }catch(error){contourStatus.textContent=String(error.message || error);contourStatus.setAttribute("data-error","true");}
    },"md-wide");
    host.appendChild(contourRefresh);host.appendChild(contourStatus);
  }
  if(["fillet","chamfer"].includes(feature.type)){
    var edgeBox=el("div","md-finish-edges");edgeBox.setAttribute("data-finish-edges",feature.type);
    host.appendChild(edgeBox);renderFinishEdgeList();
    var refreshFinishEdges=btn("Refresh exact upstream edges",async function(){
      refreshFinishEdges.disabled=true;
      try{
        var stage=featureInputStage(compileKernelFeatureTree(E.def),feature);
        var result=await topologyInCadWorker(stage.document,stage.head,{onProgress:function(progress){flash("Refreshing upstream edges · "+(progress.name || progress.stage));}});
        if(!scope.form.isCurrent())return;
        E.authoring.finishEditTopology=result.topology;delete edgeBox.dataset.edgeSignature;renderFinishEdgeList();
        flash("Exact upstream edges refreshed");
      }catch(error){report(t("reportKickerSave"),"Upstream edges",String(error.message || error));}
      finally{refreshFinishEdges.disabled=false;}
    },"md-wide");host.appendChild(refreshFinishEdges);
  }
  var actions=el("div","md-feature-actions");actions.appendChild(namedButton(btn('<i class="ph ph-arrow-counter-clockwise"></i> '+t("m_cancel"),function(){cancelFeatureParameterEdit(false);},"md-quick-cancel"), t("cancelCommand")));
  actions.appendChild(btn('<i class="ph ph-check"></i> '+t("updateFeature"),function(){
    if (!scope.form.isCurrent() || !validateFeatureInputs(host)) return;
    if(shellEditor)try{feature.params.faceThicknesses=shellEditor.read();}catch(error){flash(String(error.message || error));return;}
    var values=readFeatureParameterForm(controls,feature.params);
    try{
      var before=E.authoring.featureEdit.snapshot;
      if(editingRevolve)validateRevolveEdit(values);
      var chosenSupport=supportSelect && supportChoices.find(function(choice){return choice.key===supportSelect.value;});
      var attachment=chosenSupport && faceSketchAttachment(holeSupportChoiceReference(chosenSupport),true);
      var supportChanged=!!(supportSketch && (sketchSupportNeedsUpdate(supportSketch,attachment)
        || attachment && (feature.references.topology || []).some(function(reference){return reference.kind==="face" && reference.persistentId!==attachment.support.persistentId;})));
      if(supportChanged){
        if(!attachment || attachment.surface)throw new Error(t("sketchSupportFace"));
        var reattached=reattachFeatureSketchSupport(E.def,feature,attachment,"sk_hole_"+uid());
        supportSketch=reattached.sketch;
        values.params.sketchId=supportSketch.id;
        values.params.holePositionPointIds=cloneData(feature.params.holePositionPointIds);
        values.params.profileEntityIds=cloneData(feature.params.profileEntityIds);
        values.references.sketches=cloneData(feature.references.sketches);
      }
      var editOperation=editOperationSelect && editOperationSelect.value;
      if((feature.type==="extrudeCut" && editOperation==="add") || (feature.type==="extrude" && editOperation==="subtract"))
        setExtrudeFeatureOperation(E.def,feature.id,editOperation,{name:name.value || feature.name,params:values.params});
      else updateFeatureDefinition(E.def,feature.id,{name:name.value || feature.name,params:values.params});
      setFeatureReferencesFromForm(feature,values.references);retargetSweepHelix(feature);syncProjectionFromFeature(feature);
      if(finishTargetSelect){
        var chosenFinishTarget=finishTargetChoices.find(function(choice){return choice.entry.persistentId===finishTargetSelect.value;});
        if(!chosenFinishTarget)throw new Error(t("featureTargetFace"));
        feature.references.topology=[topologyReferenceFromEntry(chosenFinishTarget.entry)];
        (E.def.parts || []).forEach(function(part){(part.exactOperations || []).forEach(function(operation){if(operation.id===feature.id)operation.targets=cloneData(feature.references.topology);});});
      }
      if(draftNeutralSelect){
        var chosenNeutral=draftNeutralChoices.find(function(choice){return choice.entry.persistentId===draftNeutralSelect.value;});
        if(draftNeutralSelect.value && !chosenNeutral)throw new Error(t("fcFldNeutralPlane"));
        if(chosenNeutral)feature.params.neutralFace=topologyReferenceFromEntry(chosenNeutral.entry);
        else delete feature.params.neutralFace;
        if(feature.references.topology.some(function(reference){return reference.persistentId===feature.params.neutralFace?.persistentId;}))throw new Error("The neutral plane must be different from the drafted face");
        (E.def.parts || []).forEach(function(part){(part.exactOperations || []).forEach(function(operation){if(operation.id===feature.id)operation.params=cloneData(feature.params);});});
      }
      var geometryChanged=before.type!==feature.type || JSON.stringify(before.params)!==JSON.stringify(feature.params)
        || JSON.stringify(before.references)!==JSON.stringify(feature.references);
      var restoreExact=(geometryChanged || supportChanged) && isCanonicalAuthoring() && !!activeParts(E.def).length;
      E.authoring.featureEdit=null;E.authoring.editFeatureId=null;E.authoring.featureType=null;E.authoring.workflowFocus="history";
      closeFeaturePanel();
      // A depth edit invalidates verified generated edge names until the
      // kernel rebuilds them. Keep the last valid status during that rebuild;
      // the lightweight pass cannot reconstruct fillet-generated topology.
      if(restoreExact){E.exactRestoring=true;coreRunFresh=true;}
      refreshAll();
      if(restoreExact)scheduleExactRestore();
      else flash("✓ "+t("featureRebuiltFromHistory"));
    }
    catch(error){flash(String(error.message||error));}
  },"md-quick-apply"));actions.querySelector(".md-quick-apply").setAttribute("aria-label",t("updateFeature"));host.appendChild(actions);syncAuthoringWorkflow();syncCommandManager();
  scope.form.rememberInputs(()=>[feature.name,feature.params,feature.references]);
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
}

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
function numRow(host, label, get, set, step, tourKey, deferUntilApply, canCommit) {
  var w = el("label", "md-grid-cell");
  if (tourKey) w.setAttribute("data-tour-prop", tourKey);
  var span = el("span", "t");
  span.textContent = label;
  w.appendChild(span);
  var inp = el("input");
  inp.type = "number";
  inp.step = step || 1;
  inp.value = String(get());
  var commit = function () {
    if (deferUntilApply) return;
    if(canCommit && !canCommit()){inp.value=String(get());return;}
    var v = parseFloat(inp.value);
    if (!fin(v)) { inp.value=String(get()); return; }
    if (Math.abs(v-Number(get()))<1e-12) return;
    /* One history step per visit to a field, not one per keystroke: the tag
       coalesces while the field stays focused, and blurring it ends the run so
       coming back later is a step of its own. */
    if (fin(v)) {
      pushUndo((label || t("opProp")) + " → " + Math.round(v * 10) / 10, "prop:" + label + ":" + propGen);
      set(v);
      refreshAll();
    }
  };
  inp.addEventListener("change", commit);
  inp.addEventListener("keydown",function(event){if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit();}});
  inp.addEventListener("blur", function () { propGen++; });
  w.appendChild(inp);
  host.appendChild(w);
  return inp;
}

var configuredComponentBuilds=new WeakMap();

function acceptRackPinionSolve(result) {
  invalidateInterference();
  E.mateIssues=result.issues || [];
  E.mateRebindings=result.rebindings || [];E.mateUnsatisfied=result.unsatisfied || [];
  E.mateFreedom=result.clusters || [];E.mateDegreesOfFreedom=result.degreesOfFreedom || 0;
  E.mateMobilityReport=assemblyMobilityReport(E.assembly,result,E.mateIssues);
  assemblySolveFresh=true;refreshAll({assemblyPoseOnly:true});
}

var PLANE_NAME_KEYS = { "plane:front": "planeFrontName", "plane:top": "planeTopName", "plane:right": "planeRightName" };

var mateTopologyMemo=new WeakMap();
var mateReferenceRefreshes=new WeakMap();

function assemblyMateInspectorBody() {
  var host = root.querySelector("#mdOps"); host.innerHTML = "";
  host.appendChild(el("h5", "md-h5", t("mate")));
  var picked = assemblyPickedRefs();
  host.appendChild(el("div", "md-note", picked ? t("matePickHint") : t("mateHint")));
  /* A counterbore shoulder can be narrower than a few screen pixels, and a
     hidden back flange cannot be ray-picked at all. The two component rows in
     the tree still identify the intended pair; offer their exact planar faces
     here so a mate can use topology without inventing a bounding-box face. */
  var faceHolders = picked
    ? [mateHolderById(picked.a.componentId), mateHolderById(picked.b.componentId)]
    : (E.componentSel || []).slice(-2);
  if (faceHolders.length === 2 && faceHolders[0] && faceHolders[1] && faceHolders[0].id !== faceHolders[1].id) {
    var chooser = el("div", "md-mate-face-chooser");
    faceHolders.forEach(function (holder, index) {
      var doc = componentDef(holder);
      var missingExactLeaves=[];
      var entries = componentTopology(holder, function (leaf) {
        var leafDoc = componentDef(leaf);
        if (leafDoc?.metadata?.authoringSystem==="parametric-v1") {
          var finalEntries=finalMateTopology(leafDoc);
          if(finalEntries?.length)return finalEntries;
          missingExactLeaves.push(leaf);
          // An expired exact cache is not proof that a saved mesh still names
          // the current faces. Expose an explicit native refresh, not stale IDs.
          return [];
        }
        return pickPartsFor(leaf).flatMap(topologyEntriesForPart);
      });
      var choices = exactMateReferenceChoices(entries, (doc && (doc.features || doc.featureHistory)) || [], modelLengthUnit());
      var row = el("label", "md-mate-face-row");
      row.appendChild(el("span", "", t(index ? "matePmRefB" : "matePmRefA") + " · " + componentLabel(holder.id)));
      var select = document.createElement("select");
      select.setAttribute("aria-label", t(index ? "matePmRefB" : "matePmRefA") + " · " + componentLabel(holder.id));
      select.dataset.mateFaceComponent = holder.id;
      var blank = document.createElement("option"); blank.value = ""; blank.textContent = t("matePmPickFace"); select.appendChild(blank);
      choices.forEach(function (choice) {
        var option = document.createElement("option");
        option.value = choice.entry.persistentId; option.textContent = choice.label;
        select.appendChild(option);
      });
      var selected = (E.topologySelection || []).filter(function (ref) { return ref.componentId === holder.id; }).at(-1);
      if (selected && choices.some(function (choice) { return choice.entry.persistentId === selected.persistentId; })) select.value = selected.persistentId;
      select.addEventListener("change", function () {
        var choice = choices.find(function (candidate) { return candidate.entry.persistentId === select.value; });
        var retained = (E.topologySelection || []).filter(function (ref) { return ref.componentId !== holder.id; });
        if (choice) retained.push(stampComponentRef(topologyReferenceFromEntry(choice.entry), holder, null));
        E.topologySelection = retained;
        E.componentSel = faceHolders;
        E.sel = holder;
        // Let the native dropdown finish committing before its inspector is
        // replaced. Rebuilding hundreds of options inside the change event
        // also keeps the browser input handler blocked for the entire redraw.
        requestAnimationFrame(function () { refreshSelection(); });
      });
      row.appendChild(select);
      var refreshing=mateReferenceRefreshes.has(holder);
      var refreshButton=btn(refreshing?"Refreshing exact mate references…":"Refresh exact mate references",function(){refreshComponentMateReferences(holder);});
      refreshButton.disabled=refreshing;
      refreshButton.setAttribute('aria-label',"Refresh exact mate references · "+componentLabel(holder.id));
      row.appendChild(refreshButton);
      if(missingExactLeaves.length)row.appendChild(el("small","md-note","Native face references need refresh for "+missingExactLeaves.map(function(leaf){return leaf.name || leaf.modelKey || leaf.id;}).join(", ")));
      chooser.appendChild(row);
    });
    host.appendChild(chooser);
  }
  if (picked) {
    var chips = el("div", "md-mate-picks");
    [picked.a, picked.b].forEach(function (reference, index) {
      var chip = el("span", "md-mate-pick" + (index ? " b" : " a"));
      chip.textContent = componentLabel(reference.componentId) + " · " + (reference.kind || "face");
      chips.appendChild(chip);
    });
    host.appendChild(chips);
  }
  var ops = el("div", "md-ops");
  var pair = ungroundedComponentPair();
  [["alignX", "mateX"], ["alignY", "mateY"], ["alignZ", "mateZ"], ["distanceX", "mateDistance"]].forEach(function (entry) {
    var mateButton=btn('<i class="ph ph-link"></i> ' + t(entry[1]), function () {
      if (!pair) { flash(t("mateHint")); return; }
      addMate(entry[0]);
    });
    mateButton.setAttribute("data-mate",entry[0]);
    markUnavailable(mateButton, pair ? "" : t("mateHint"), t(entry[1]));
    ops.appendChild(mateButton);
  });
  host.appendChild(el("div", "md-note", t("mateAxisHint")));
  var source = picked ? t("mateUsingPicked") : t("mateNeedTwoFaces");
  MATE_PALETTE.forEach(function (entry) {
    /* A mate the picked references cannot support is greyed and says what it
       wanted, rather than accepting the pair and placing the component
       somewhere meaningless. */
    var fits = mateTypeFits(entry[0]), label = t(entry[2]);
    if(entry[0]==='coincident' && picked && (picked.a.descriptor?.surface==='axis' || picked.b.descriptor?.surface==='axis'))label='Coincident plane and axis';
    var mateButton = btn((entry[1] === "threadfeature" ? '<i class="ph ph-spiral"></i>' : '<i class="ph ' + entry[1] + '"></i>') + " " + label, function () {
      if (!fits.ok) { flash(label + " — " + fits.reason); return; }
      // Numbered mates ask for their value before creating the constraint.
      if (entry[0] === "angle") openMateAngleForm();
      else if (entry[0] === "distance") openMateDistanceForm();
      else if (entry[0] === "gear") openMateGearForm();
      else if (entry[0] === "belt") openMateBeltForm();
      else if (entry[0] === "rackpinion") openMateRackPinionForm();
      else if (entry[0] === "rotationlimit") openMateRotationLimitForm();
      else addInspectorTopologyMate(entry[0]);
    });
    mateButton.setAttribute("data-topology-mate", entry[0]);
    markUnavailable(mateButton, fits.ok ? "" : label + " — " + fits.reason, label + " — " + (entry[0]==="lock"?t("lockMatePreservesPose"):source));
    ops.appendChild(mateButton);
  });
  host.appendChild(ops);
  var legacy = Array.isArray(E.assembly && E.assembly.mates) ? E.assembly.mates : [];
  var topology = Array.isArray(E.assembly && E.assembly.topologyMates) ? E.assembly.topologyMates : [];
  if (legacy.length || topology.length) {
    host.appendChild(el("h5", "md-h5", t("matesCount")));
    legacy.forEach(function (mate) {
      mateRow(host,
        t(mate.type === "alignX" ? "mateX" : mate.type === "alignY" ? "mateY" : mate.type === "alignZ" ? "mateZ" : "mateDistance"),
        componentLabel(mate.a) + " ↔ " + componentLabel(mate.b), null,
        function () {
          pushUndo(t("del"));
          E.assembly.mates = legacy.filter(function (m) { return m !== mate; });
          solveAssembly(); refreshAll();
        });
    });
    topology.forEach(function (mate) {
      var mateUiRow = mateRow(host, topologyMateLabel(mate.type,mate),
        componentLabel(mate.a && mate.a.componentId) + " ↔ " + componentLabel(mate.b && mate.b.componentId),
        mateIssuesFor(mate.id),
        function () {
          pushUndo(t("del"));
          E.assembly.topologyMates = topology.filter(function (m) { return m !== mate; });
          solveAssembly(); refreshAll();
        },
        mateReboundFor(mate.id),
        mate.type === "angle" ? {
          label: t("mateAngleValue"), value: clampMateAngle(mate.value), suffix: "°",min:0,max:180,
          getValue:function(){return clampMateAngle(mate.value);},
          onChange: function (next) {
            var degrees=String(next).trim()===""?NaN:Number(next);
            if(!fin(degrees)||degrees<0||degrees>180){flash(t("mateAngleRangeInvalid"));return;}
            if (degrees === clampMateAngle(mate.value)) return;
            var changed=setTopologyMateValue(E.assembly,mate.id,degrees,function(){pushUndo(t("angleMate"));});
            if(!changed.ok){flash(t("mateValueUnsatisfied"));return;}
            acceptRackPinionSolve(changed);
          },
        } : mate.type === "distance" ? {
          label: t("topologyDistanceMate") + " (" + modelLengthUnit() + ")",
          value: Number(lengthToDocument(Number(mate.value) || 0, modelLengthUnit()).toPrecision(10)),
          step: 0.001, suffix: modelLengthUnit(),
          getValue:function(){return Number(lengthToDocument(Number(mate.value)||0,modelLengthUnit()).toPrecision(10));},
          onChange: function (next) {
            var cm = String(next).trim()===""?NaN:lengthFromDocument(Number(next), modelLengthUnit());
            if(!fin(cm)){flash(t("mateValueInvalid"));return;}
            if (Math.abs(cm - Number(mate.value || 0)) < 1e-9) return;
            var changed=setTopologyMateValue(E.assembly,mate.id,cm,function(){pushUndo(t("topologyDistanceMate"));});
            if(!changed.ok){flash(t("mateValueUnsatisfied"));return;}
            acceptRackPinionSolve(changed);
          },
        } : null,
        ["coincident", "distance", "limit", "tangent"].includes(mate.type) ? {
          aligned: !!mate.aligned,
          onToggle: function () {
            pushUndo(t("mateAlignment"));
            mate.aligned = !mate.aligned;
            solveAssembly(); refreshAll({assemblyPoseOnly:true});
          },
        } : null,
        mate.type==="tangent" && [mate.a?.frame?.surface,mate.b?.frame?.surface].includes("torus") ? {
          finite:mate.contactMode==="finite-bore",
          onToggle:function(){
            pushUndo(t("mateContactMode"));
            mate.contactMode=mate.contactMode==="finite-bore"?"surface":"finite-bore";
            if(mate.contactMode==="finite-bore")mate.aligned=true;
            solveAssembly();refreshAll();
          },
        } : null);
      if(picked && [picked.a.componentId,picked.b.componentId].includes(mate.a?.componentId) && [picked.a.componentId,picked.b.componentId].includes(mate.b?.componentId) && mateTypeFits(mate.type).ok){
        mateUiRow.appendChild(btn("Replace references with selection",function(){
          if(mate.type==='rotationlimit'){
            var rotationRepair=setRotationLimitMateReferences(E.assembly,mate.id,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b),function(){pushUndo('Replace mate references');});
            if(!rotationRepair.ok){flash(t('rotationLimitUnsatisfied'));return;}
            acceptRackPinionSolve(rotationRepair);return;
          }
          if(mate.type==='rackpinion'){
            var repaired=setRackPinionMateReferences(E.assembly,mate.id,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b),function(){pushUndo("Replace mate references");});
            if(!repaired.ok){flash(t('rackPinionUnsatisfied'));return;}
            acceptRackPinionSolve(repaired);return;
          }
          pushUndo("Replace mate references");
          rebindTopologyMate(mate,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b));
          solveAssembly();refreshAll();
        },"md-mate-align"));
      }
      /* Screw, gear and angle-range mates carry numbers of their own. Each is
         edited where the mate is listed, one undo step per change, and the
         assembly is solved again so the motion is visible immediately. */
      var extraField = function (title, current, step, commit) {
        var wrap = el("label", "md-mate-value"), input = el("input");
        wrap.appendChild(el("span", "", title));
        input.type = "number"; input.step = String(step);
        input.value = current == null || !fin(Number(current)) ? "" : String(Number(Number(current).toPrecision(10)));
        input.setAttribute("aria-label", title);
        bindMateNumericCommit(input,function(){commit(input.value.trim()===''?null:Number(input.value),input);});
        wrap.appendChild(input); mateUiRow.appendChild(wrap);
      };
      if(mate.type==='concentric')mateUiRow.appendChild(concentricAxisDirectionControl(mate));
      var acceptScrewSolve = function(result){
        invalidateInterference();
        E.mateIssues=result.issues || [];
        E.mateRebindings=result.rebindings || [];E.mateUnsatisfied=result.unsatisfied || [];
        E.mateFreedom=result.clusters || [];E.mateDegreesOfFreedom=result.degreesOfFreedom || 0;
        E.mateMobilityReport=assemblyMobilityReport(E.assembly,result,E.mateIssues);
        assemblySolveFresh=true;
        refreshAll();
      };
      if (mate.type === "screw") {
        var screwHand = el("label", "md-mate-value"), screwHandInput = el("select");
        screwHand.appendChild(el("span", "", "Thread handedness"));
        screwHandInput.setAttribute("aria-label", "Thread handedness");
        [["rh", "Right hand"], ["lh", "Left hand"]].forEach(function (choice) {
          var option = el("option"); option.value = choice[0]; option.textContent = choice[1];
          screwHandInput.appendChild(option);
        });
        screwHandInput.value = mate.handedness === "lh" || mate.handedness === "left" ? "lh" : "rh";
        screwHandInput.title = "Choose at the home pose before driving. The saved screw zero is preserved.";
        screwHandInput.addEventListener("change", function () {
          if (!["rh", "lh"].includes(screwHandInput.value)) return;
          pushUndo("Screw thread handedness");
          setScrewMateHandedness(mate, screwHandInput.value);
          solveAssembly(); refreshAll();
        });
        screwHand.appendChild(screwHandInput); mateUiRow.appendChild(screwHand);
        var screwMode = el("label", "md-mate-value"), screwModeInput = el("input");
        screwModeInput.type = "checkbox";
        screwModeInput.checked = !!mate.coupledMotion;
        screwModeInput.setAttribute("aria-label", "Couple screw rotation and travel");
        screwMode.appendChild(screwModeInput);
        screwMode.appendChild(el("span", "", "Couple rotation and travel (free screw joint)"));
        screwModeInput.addEventListener("change", function () {
          var changed=setScrewMateCoupledMotion(E.assembly,mate.id,screwModeInput.checked,function(){pushUndo(t("screwMate"));});
          if(!changed.ok){screwModeInput.checked=!!mate.coupledMotion;flash("Screw mode could not satisfy the assembly mates");return;}
          acceptScrewSolve(changed);
        });
        mateUiRow.appendChild(screwMode);
        mateUiRow.appendChild(btn(mate.axisOpposed ? "Screw axes: Opposed" : "Screw axes: Aligned", function () {
          pushUndo(t("screwMate")); mate.axisOpposed = !mate.axisOpposed;
          delete mate.coupledAxial0; delete mate.coupledPhase0; delete mate.coupledAxialBasis;
          solveAssembly(); refreshAll();
        }, "md-mate-align"));
        var lengthUnit = modelLengthUnit();
        extraField(t("mateScrewPitch") + " (" + lengthUnit + "/" + t("mateScrewTurn") + ")",
          lengthToDocument(Number(mate.pitch) || 0, lengthUnit), 0.001, function (next, input) {
            var cm = fin(next) && next > 0 ? lengthFromDocument(next, lengthUnit) : NaN;
            if (!fin(cm)) { flash(t("mateScrewInvalid")); input.value = String(lengthToDocument(Number(mate.pitch) || 0, lengthUnit)); return; }
            if (Math.abs(cm - Number(mate.pitch || 0)) < 1e-12) return;
            pushUndo(t("screwMate")); mate.pitch = cm; solveAssembly(); refreshAll();
          });
        if (mate.coupledMotion) extraField("Drive turns (blank = free)", mate.driveTurns, 0.25, function (next, input) {
          if (next !== null && !fin(next)) { flash(t("mateScrewInvalid")); input.value = mate.driveTurns == null ? "" : String(mate.driveTurns); return; }
          if (next === mate.driveTurns || (next === null && mate.driveTurns == null)) return;
          var driven = setScrewMateDrive(E.assembly,mate.id,next,function(){pushUndo(t("screwMate"));});
          if(!driven.ok){
            input.value=mate.driveTurns==null?"":String(mate.driveTurns);
            flash("Screw drive could not satisfy the assembly mates");return;
          }
          acceptScrewSolve(driven);
        });
        else extraField(t("mateScrewTurns"), mate.turns, 0.25, function (next, input) {
          if (!fin(next)) { flash(t("mateScrewInvalid")); input.value = String(Number(mate.turns) || 0); return; }
          if (Math.abs(next - Number(mate.turns || 0)) < 1e-12) return;
          pushUndo(t("screwMate")); mate.turns = next; solveAssembly(); refreshAll();
        });
      }
      if (mate.type === "gear") {
        extraField("Follower phase (°)",mate.followerPhaseDeg||0,.1,function(next,input){
          if(next===null||!fin(next)){flash("Enter a finite gear phase");input.value=String(mate.followerPhaseDeg||0);return;}
          if(next===Number(mate.followerPhaseDeg||0))return;
          var phased=setGearMatePhase(E.assembly,mate.id,next);
          if(!phased.ok){flash("Gear phase could not satisfy the assembly mates");input.value=String(mate.followerPhaseDeg||0);return;}
          pushUndo("Gear phase");E.assembly=phased.assembly;invalidateInterference();refreshAll();
          flash("Gear phase updated · motion studies restart at the new zero pose");
        });
        [["ratioA", "gearTeethA"], ["ratioB", "gearTeethB"]].forEach(function (pair) {
          extraField(t(pair[1]), mate[pair[0]], 1, function (next, input) {
            if (!fin(next) || !(next > 0)) { flash(t("gearRatioInvalid")); input.value = String(mate[pair[0]]); return; }
            if (next === Number(mate[pair[0]])) return;
            pushUndo(t("gearMate")); mate[pair[0]] = next; solveAssembly(); refreshAll();
          });
        });
        var flip = btn(mate.reverse ? t("gearSame") : t("gearOpposite"), function () {
          pushUndo(t("gearMate")); mate.reverse = !mate.reverse; solveAssembly(); refreshAll();
        }, "md-mate-align");
        mateUiRow.appendChild(flip);
      }
      if(mate.type==='belt'){
        mateUiRow.appendChild(el('div','md-note',t('beltHint')));
        [['diameterA','beltDiameterA','a'],['diameterB','beltDiameterB','b']].forEach(function(pair){
          extraField(t(pair[1])+' ('+modelLengthUnit()+')',beltDiameterValue(mate,pair[2],modelLengthUnit()),.1,function(next,input){
            var cm=lengthFromDocument(next,modelLengthUnit());
            if(next===null||!fin(cm)||!(cm>0)){flash(t('beltInvalid'));input.value=modelLengthText(mate[pair[0]]);return;}
            if(cm===mate[pair[0]])return;
            pushUndo(t('beltMate'));mate[pair[0]]=cm;solveAssembly();refreshAll();
          });
        });
        mateUiRow.appendChild(btn(t(mate.beltDirection==='open'?'beltOpen':'beltCrossed'),function(){
          pushUndo(t('beltMate'));mate.beltDirection=mate.beltDirection==='open'?'crossed':'open';solveAssembly();refreshAll();
        },'md-mate-align'));
      }
      if(mate.type==='rackpinion'){
        mateUiRow.appendChild(el('div','md-note',t('rackPinionHint')));
        extraField(t('rackPinionRadius')+' ('+modelLengthUnit()+')',lengthToDocument(mate.pitchRadius,modelLengthUnit()),.1,function(next,input){
          var radius=next===null?NaN:lengthFromDocument(next,modelLengthUnit());
          if(!fin(radius)||!(radius>0)){flash(t('rackPinionInvalid'));input.value=modelLengthText(mate.pitchRadius);return;}
          if(Math.abs(radius-mate.pitchRadius)<1e-12)return;
          var changed=setRackPinionMateSettings(E.assembly,mate.id,{pitchRadius:radius},function(){pushUndo(t('rackPinionMate'));});
          if(!changed.ok){flash(t('rackPinionUnsatisfied'));input.value=modelLengthText(mate.pitchRadius);return;}
          acceptRackPinionSolve(changed);
        });
        extraField(t('rackPinionDrive'),mate.driveTurns,.05,function(next,input){
          if(next!==null&&!fin(next)){flash(t('rackPinionInvalid'));input.value=mate.driveTurns==null?'':String(mate.driveTurns);return;}
          if(next===mate.driveTurns || (next===null&&mate.driveTurns==null))return;
          var driven=setRackPinionMateDrive(E.assembly,mate.id,next,function(){pushUndo(t('rackPinionMate'));});
          if(!driven.ok){flash(t('rackPinionUnsatisfied'));input.value=mate.driveTurns==null?'':String(mate.driveTurns);return;}
          acceptRackPinionSolve(driven);
        });
        mateUiRow.appendChild(btn(t(mate.reverse?'rackPinionReversed':'rackPinionForward'),function(){
          var changed=setRackPinionMateSettings(E.assembly,mate.id,{reverse:!mate.reverse},function(){pushUndo(t('rackPinionMate'));});
          if(!changed.ok){flash(t('rackPinionUnsatisfied'));return;}
          acceptRackPinionSolve(changed);
        },'md-mate-align'));
      }
      if(mate.type==='rotationlimit'){
        mateUiRow.appendChild(el('div','md-note',t('rotationLimitHint')));
        [['angleMin','mateAngleMinimum'],['angleMax','mateAngleMaximum'],['driveAngle','rotationLimitDrive']].forEach(function(pair){
          extraField(t(pair[1])+' (°)',mate[pair[0]],1,function(next,input){
            if(next===mate[pair[0]] || (pair[0]==='driveAngle'&&next===null&&mate.driveAngle==null))return;
            var result=pair[0]==='driveAngle'?setRotationLimitMateDrive(E.assembly,mate.id,next,function(){pushUndo(t('rotationLimitMate'));}):setRotationLimitMateSettings(E.assembly,mate.id,{[pair[0]]:next},function(){pushUndo(t('rotationLimitMate'));});
            if(!result.ok){flash(t('rotationLimitInvalid'));input.value=mate[pair[0]]==null?'':String(mate[pair[0]]);return;}
            acceptRackPinionSolve(result);
          });
        });
        mateUiRow.appendChild(btn(t(mate.reverse?'rotationLimitReversed':'rotationLimitForward'),function(){
          var result=setRotationLimitMateSettings(E.assembly,mate.id,{reverse:!mate.reverse},function(){pushUndo(t('rotationLimitMate'));});
          if(!result.ok){flash(t('rotationLimitUnsatisfied'));return;}
          acceptRackPinionSolve(result);
        },'md-mate-align'));
      }
      if (mate.type === "angle") {
        [["angleMin", "mateAngleMinimum"], ["angleMax", "mateAngleMaximum"]].forEach(function (pair) {
          extraField(t(pair[1]) + " (°)", mate[pair[0]], 1, function (next, input) {
            if(next===mate[pair[0]] || (next===null&&mate[pair[0]]==null))return;
            if (next !== null && (!fin(next) || next < 0 || next > 180)) { flash(t("mateAngleRangeInvalid")); input.value = mate[pair[0]] == null ? "" : String(mate[pair[0]]); return; }
            var lo = pair[0] === "angleMin" ? next : (mate.angleMin == null ? null : Number(mate.angleMin));
            var hi = pair[0] === "angleMax" ? next : (mate.angleMax == null ? null : Number(mate.angleMax));
            if (lo !== null && hi !== null && lo > hi) { flash(t("mateAngleRangeInvalid")); input.value = mate[pair[0]] == null ? "" : String(mate[pair[0]]); return; }
            pushUndo(t("angleMate"));
            if (next === null) delete mate[pair[0]]; else mate[pair[0]] = next;
            solveAssembly(); refreshAll();
          });
        });
      }
      if (mate.type === "limit") {
        ["min", "max"].forEach(function (key) {
          var wrap = el("label", "md-mate-value"), input = el("input");
          var unit = modelLengthUnit(), title = t(key === "min" ? "mateLimitMinimum" : "mateLimitMaximum") + " (" + unit + ")";
          wrap.appendChild(el("span", "", title));
          input.type = "number"; input.step = "0.001";
          input.value = String(Number(lengthToDocument(Number(mate[key]), unit).toPrecision(10)));
          input.setAttribute("aria-label", title);
          var commitLimit = function () {
            var next = input.value.trim() === "" ? NaN : lengthFromDocument(Number(input.value), unit);
            var bounds = validLimitMateBounds(key === "min" ? next : mate.min, key === "max" ? next : mate.max);
            if (!bounds) { flash(t("mateLimitInvalidRange")); input.value = String(lengthToDocument(Number(mate[key]), unit)); return; }
            if (Math.abs(bounds[key] - Number(mate[key])) < 1e-9) return;
            pushUndo(t("mate")); mate.min = bounds.min; mate.max = bounds.max;
            solveAssembly(); refreshAll();
          };
          bindMateNumericCommit(input,commitLimit);
          wrap.appendChild(input); mateUiRow.appendChild(wrap);
        });
      }
    });
  }
}

var inspectorDirty = { sketch: true, shape: true, look: true, ops: true };
if (typeof window !== "undefined") window.cadInspectorDirty = inspectorDirty;

function fillCabinetParameters(host) {
  if (!E.def.metadata || E.def.metadata.adapter !== "cabinet") return;
  host.appendChild(el("h5", "md-h5", getLang() === "en" ? "Cabinet parameters (cm)" : "פרמטרי ארון (ס״מ)"));
  var grid = el("div", "md-prop-grid md-cab-parameters");
  Object.entries(E.def.parameters || {}).forEach(function (entry) {
    var key = entry[0], parameter = entry[1];
    if (typeof parameter.value !== "number") return;
    numRow(grid, parameter.label || key, function () { return parameter.value; }, function (value) {
      if (value < parameter.min || value > parameter.max) return;
      var previousValue = parameter.value;
      parameter.value = value;
      var run = rebuildParametricDocument(E.def, {});
      if (!run.ok) { parameter.value = previousValue; flash(run.issues.filter(function (issue) { return issue.severity === "error"; }).map(function (issue) { return issue.message; }).join(" · ")); return; }
      publishRebuildStatus(E.def, run);
      E.sel = null; coreRunFresh = false;
    }, 0.1);
  });
  host.appendChild(grid);
}

function fillOps() {
  var host = root.querySelector("#mdOps");
  host.innerHTML = "";
  var p = E.sel;
  if (!p) { emptyState(host, "ph-magic-wand", t("noSel"), t("noSelHint")); return; }
  if (isSketchObject(p)) {
    var sketch = ensureSketch(E.def);
    var owned = p.type ? entityPoints(sketch, p) : [p];
    host.appendChild(el("h5", "md-h5", t("constraints")));
    var lineOps = el("div", "md-ops");
    if (p.type === "line") {
      // horizontal/vertical replace each other and any angle dimension: all
      // three drive the same freedom, so keeping two guarantees a conflict
      function addLineRule(type) {
        pushUndo(t("opConstraint"));
        sketch.constraints = sketch.constraints.filter(function (c) {
          return !(c.entity === p.id && (c.type === "angle" || c.type === "horizontal" || c.type === "vertical"));
        });
        var added = { id: uid(), type: type, entity: p.id };
        sketch.constraints.push(added);
        if (!resolveSketch(true)) {
          var ruleWhy = explainSketchConflict(sketch, { keep: [added.id] });
          var ruleSubject = constraintCaption(added, sketch);
          sketch.constraints = sketch.constraints.filter(function (c) { return c !== added; });
          resolveSketch(false);
          H.discard();
          showSketchRefusal(sketch, ruleSubject, [added.id], ruleWhy);
        }
        refreshAll();
      }
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-horizontal"></i> ' + t("cHorizontal"), function () { addLineRule("horizontal"); }));
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-vertical"></i> ' + t("cVertical"), function () { addLineRule("vertical"); }));
    }
    if (p.type) {
      lineOps.appendChild(btn('<i class="ph ph-line-segments"></i> ' + t("tool_constr"), function () {
        pushUndo(t("tool_constr")); toggleConstruction(sketch, p.id); refreshAll();
      }));
    }
    lineOps.appendChild(btn('<i class="ph ph-lock"></i> ' + t("cFixed"), function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = true; });
      resolveSketch(false); refreshAll();
    }));
    lineOps.appendChild(btn('<i class="ph ph-lock-key-open"></i> ' + t("cFixed") + " ✕", function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = false; });
      resolveSketch(false); refreshAll();
    }));
    host.appendChild(lineOps);
    if (closedSketchProfile()) {
      host.appendChild(btn('<i class="ph ph-cube"></i> ' + t("opExtrude"), function(){openParametricFeature("extrude");}, "md-wide"));
    }
    if (p.type) {
      host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
        pushUndo(t("del"));
        removeSketchEntity(sketch, p.id);
        E.ssel = []; E.sel = null;
        resolveSketch(false);
        refreshAll();
      }, "md-wide btn-danger"));
    }
    return;
  }
  var b = partBounds(p);

  host.appendChild(el("h5", "md-h5", t("opAlign")));
  var ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-align-center-horizontal-simple"></i> ' + t("centerX"), function () { pushUndo(t("centerX")); movePart(p, -(b.x0 + b.x1) / 2, 0, 0); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-center-vertical-simple"></i> ' + t("centerZ"), function () { pushUndo(t("centerZ")); movePart(p, 0, 0, -(b.z0 + b.z1) / 2); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-bottom-simple"></i> ' + t("floor"), function () { pushUndo(t("floor")); movePart(p, 0, -b.y0, 0); refreshAll(); }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opCopy")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-flip-horizontal"></i> ' + t("mirrorX"), function () {
    var q = mirrorProjectionPart(resetClonedPartIdentity(cloneData(p)), "plane:right");
    if (!q) { flash(t("kernelBodyNoMirror")); return; }
    pushUndo(t("mirrorX"));
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  ops.appendChild(btn('<i class="ph ph-copy"></i> ' + t("dup"), function () {
    pushUndo(t("dup"));
    var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
    movePart(q, 10, 0, 10);
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  /* One form, not a chain of window.prompt()s. Each of these used to ask two or
     three questions in a row, every one of them freezing the model behind a
     modal — and answering the last one wrong meant starting the chain again.
     A step typed as "20,0,0" into a text box is also not an input, it is a
     parsing puzzle; three numbers are three fields. */
  ops.appendChild(btn('<i class="ph ph-dots-three-outline"></i> ' + t("patLin"), function () {
    openQuickForm({
      action: "patlin", icon: "ph-dots-three-outline", title: t("patLin"), hint: t("patLinHint"),
      fields: [
        { key: "count", label: t("patCount"), type: "number", integer: true, min: 2, max: 64, step: 1, value: 3 },
        { key: "stepX", label: "X", type: "number", unit: "length", step: 1, value: 20 },
        { key: "stepY", label: "Y", type: "number", unit: "length", step: 1, value: 0 },
        { key: "stepZ", label: "Z", type: "number", unit: "length", step: 1, value: 0 },
      ],
      onApply: function (values) {
        var n = Math.round(Number(values.count));
        var step = [Number(values.stepX), Number(values.stepY), Number(values.stepZ)];
        if (!fin(n) || n < 2 || !step.every(fin)) return false;
        if (!step.some(function (axis) { return axis !== 0; })) { flash(t("patStepZero")); return false; }
        pushUndo(t("patLin"));
        for (var k = 1; k < n; k++) {
          var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
          movePart(q, step[0] * k, step[1] * k, step[2] * k);
          addPart(q);
        }
        return true;
      },
    });
  }));
  ops.appendChild(btn('<i class="ph ph-circles-three"></i> ' + t("patCirc"), function () {
    openQuickForm({
      action: "patcirc", icon: "ph-circles-three", title: t("patCirc"), hint: t("patCircHint"),
      fields: [
        { key: "count", label: t("patCount"), type: "number", integer: true, min: 2, max: 64, step: 1, value: 4 },
        { key: "angle", label: t("patAngle"), type: "number", unit: "angle", min: -360, max: 360, step: 5, value: 360 },
      ],
      onApply: function (values) {
        var n = Math.round(Number(values.count)), total = Number(values.angle);
        if (!fin(n) || n < 2 || !fin(total) || !total) return false;
        // full circle: don't duplicate the original at 360°
        var step = (Math.abs(total) === 360 ? total / n : total / (n - 1)) * Math.PI / 180;
        pushUndo(t("patCirc"));
        var made = 0;
        for (var k = 1; k < n; k++) {
          var q = rotPartY(JSON.parse(JSON.stringify(p)), step * k);
          if (!q) break;
          resetClonedPartIdentity(q);
          addPart(q);
          made++;
        }
        if (!made) { H.discard(); flash(t("patSkip")); return false; }
        return true;
      },
    });
  }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opShape")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-bowl-food"></i> ' + t("shellOp"), function () {
    openQuickForm({
      action: "quickshell", icon: "ph-bowl-food", title: t("shellOp"), hint: t("shellHint"),
      fields: [{ key: "thickness", label: t("shellT"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: 2 }],
      onApply: async function (values) {
        var thickness = Number(values.thickness);
        if (!fin(thickness) || thickness <= 0) return false;
        return await quickShellPart(thickness);
      },
    });
  }));
  ops.appendChild(btn('<i class="ph ph-trapezoid"></i> ' + t("loftOp"), function () {
    if (p.kind !== "ext" || (p.holes && p.holes.length)) { flash(t("loftFail")); return; }
    openQuickForm({
      action: "quickloft", icon: "ph-trapezoid", title: t("loftOp"), hint: t("loftHint"),
      fields: [
        { key: "scale", label: t("loftScale"), type: "number", min: 1e-6, step: 0.05, value: 0.6 },
        { key: "offsetU", label: "U", type: "number", unit: "length", step: 1, value: 0 },
        { key: "offsetV", label: "V", type: "number", unit: "length", step: 1, value: 0 },
      ],
      onApply: function (values) {
        var scale = Number(values.scale);
        if (!fin(scale) || scale <= 0) return false;
        var offU = fin(Number(values.offsetU)) ? Number(values.offsetU) : 0;
        var offV = fin(Number(values.offsetV)) ? Number(values.offsetV) : 0;
        pushUndo(t("loftOp"));
        var c = loopCentroid(p.pts);
        p.kind = "loft";
        p.name = p.name === "extrude" ? "loft" : p.name;
        p.pts0 = p.pts;
        p.pts1 = p.pts.map(function (q2) { return { u: c.u + (q2.u - c.u) * scale + offU, v: c.v + (q2.v - c.v) * scale + offV }; });
        delete p.pts;
        delete p.holes;
        delete p.tex; // lofted geometry has no UVs
        E.sel = p;
        return true;
      },
    });
  }));
  host.appendChild(ops);

  if(p.cosmeticThread?.spec){
    host.appendChild(btn(t("mfgCheckFit"),function(){
      var others=E.def.parts.filter(function(part){return part!==p&&part.cosmeticThread?.spec;});
      if(!others.length){flash(t("mfgNeedPair"));return;}
      openQuickForm({action:"threadfit",title:t("mfgCheckFit"),fields:[{key:"mate",label:t("mfgMatingThread"),type:"select",value:others[0].id,choices:others.map(function(part){return {value:part.id,label:part.name||part.id};})}],onApply:function(values){
        var other=others.find(function(part){return part.id===values.mate;});if(!other)return false;
        var a=p.cosmeticThread.spec,b=other.cosmeticThread.spec,report=validateThreadFit(a.side==="external"?a:b,a.side==="internal"?a:b);
        if(!report.ok){flash(report.issues.map(function(issue){return issue.message;}).join("; "));return false;}
        flash(t("mfgFitClearance")+": "+report.clearances.pitchDiameter.min.toFixed(4)+"–"+report.clearances.pitchDiameter.max.toFixed(4)+" mm");return true;
      }});
    }));
  }
  var plate = sheetPlate(p), sheetOwner = E.def.sheetMetal?.sourcePartId;
  if (E.def.sheetMetal ? sheetOwner === p.id : plate) {
    var heading = el("h5", "md-h5", t("sheetMetal"));
    heading.id = "mdSheetMetal";
    host.appendChild(heading);
    var smOps = el("div", "md-ops");
    if (!E.def.sheetMetal) {
      var convert = btn('<i class="ph ph-fold"></i> ' + t("sheetMetalConvert"), function () {
        var inputs = openQuickForm({
          action: "sheetmetal", icon: "ph-fold", title: t("sheetMetalConvert"), hint: t("sheetMetalHint"),
          fields: [{ key: "thickness", label: t("sheetMetalThickness"), type: "number", unit: "length", min: 1e-6, step: 0.01,
            value: plate.thickness }],
          onApply: function () {
            if (selectedSolid() !== p || E.def.sheetMetal) return false;
            var thickness = plate.thickness;
            pushUndo(t("sheetMetalConvert"));
            E.def.sheetMetal = createSheetMetalPart({thickness,insideRadius:thickness,base:{width:plate.width,height:plate.height}});
            E.def.sheetMetal.sourcePartId = p.id;
            refreshAll();return true;
          },
        });
        if (inputs) inputs.thickness.readOnly = true;
      });
      convert.id = "mdSheetConvert";
      smOps.appendChild(convert);
    }
    if (E.def.sheetMetal) {
      if (plate && !E.def.sheetMetal.hinge && !E.def.sheetMetal.flanges?.length) smOps.appendChild(btn(t("sheetHinge"), function () {
        hingeForm({p,plate,document:E.def,t,openQuickForm,selectedSolid,pushUndo,invalidatePartMeshAfterEdit,
          targetId:isCanonicalAuthoring()?cutTargetFeatureId(p):null,uid});
      }));
      if (!E.def.sheetMetal.hinge) {
        smOps.appendChild(btn(t("mfgBendRules"), function () {
          var sheet=E.def.sheetMetal;if(!sheet){flash(t("sheetMetalNeedPlate"));return;}
          openQuickForm({action:"sheetrules",title:t("mfgBendRules"),fields:[
            {key:"radius",label:t("mfgRadius"),type:"number",unit:"length",min:0,value:sheet.insideRadius},
            {key:"k",label:"K factor",type:"number",min:0,max:.5,step:.01,value:sheet.kFactor},
            {key:"material",label:t("material"),type:"text",value:sheet.material||""},
            {key:"rule",label:t("mfgBendRules"),type:"select",value:sheet.bendRule?.type||"k-factor",choices:[{value:"k-factor",label:"K factor"},{value:"table",label:t("mfgMeasuredTable")}]},
            {key:"relief",label:t("mfgRelief"),type:"number",unit:"length",min:0,value:sheet.cornerRelief?.width||0},
          ],onApply:function(values){
            var candidate=cloneData(sheet);candidate.insideRadius=Number(values.radius);candidate.kFactor=Number(values.k);candidate.material=values.material;
            if(values.rule==="table"&&sheet.bendRule?.type!=="table"){flash(t("mfgImportFirst"));return false;}
            candidate.bendRule=values.rule==="table"?sheet.bendRule:{type:"k-factor"};candidate.cornerRelief=Number(values.relief)>0?{type:"rectangular",width:Number(values.relief)}:null;
            try{flatPattern(candidate);}catch(error){flash(String(error.message||error));return false;}
            pushUndo(t("mfgBendRules"));E.def.sheetMetal=candidate;refreshAll();return true;
          }});
        }));
        smOps.appendChild(btn(t("mfgImportTable"), function () {
          if(!E.def.sheetMetal){flash(t("sheetMetalNeedPlate"));return;}
          var definition=E.def,sheet=E.def.sheetMetal,input=document.createElement("input");input.type="file";input.accept=".json,application/json";
          input.onchange=async function(){
            try{
              if(!input.files?.[0])return;
              var table=JSON.parse(await input.files[0].text());
              if(E.def!==definition||E.def.sheetMetal!==sheet)return;
              if(table.type!=="table"||!table.name||!table.source||!["mm","cm","in"].includes(table.units)||!Array.isArray(table.rows)||!table.rows.length)throw new Error(t("mfgInvalidTable"));
              var candidate=cloneData(sheet);candidate.bendRule=table;flatPattern(candidate);
              pushUndo(t("mfgImportTable"));E.def.sheetMetal=candidate;refreshAll();flash("✓ "+table.name);
            }catch(error){flash(String(error.message||error));}
          };input.click();
        }));
        smOps.appendChild(btn('<i class="ph ph-angle"></i> ' + t("sheetMetalFlange"), function () {
          if (!E.def.sheetMetal) { flash(t("sheetMetalNeedPlate")); return; }
          openQuickForm({
            action: "sheetflange", icon: "ph-angle", title: t("sheetMetalFlange"), hint: t("sheetMetalFlangeHint"),
            fields: [
              {key:"edge",label:t("mfgEdge"),type:"select",value:"right",choices:[{value:"right",label:t("right")},{value:"left",label:t("left")},{value:"top",label:t("top")},{value:"bottom",label:t("bottom")}]},
              { key: "length", label: t("sheetMetalFlangeLen"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: 3 },
              { key: "angle", label: t("sheetMetalBendAngle"), type: "number", unit: "angle", min: -180, max: 180, step: 5, value: 90 },
            ],
            onApply: function (values) {
              var length = Number(values.length), angle = Number(values.angle);
              if (!fin(length) || length <= 0 || !fin(angle)) return false;
              var candidate=cloneData(E.def.sheetMetal);
              try{addEdgeFlange(candidate,values.edge,length,angle);}catch(error){flash(String(error.message||error));return false;}
              pushUndo(t("sheetMetalFlange"));
              E.def.sheetMetal=candidate;refreshAll();
              return true;
            },
          });
        }));
      }
      smOps.appendChild(btn(t("mfgBendReport"),function(){
        if(!E.def.sheetMetal)return;
        // Resolve the current history before downloading either manufacturing file.
        try{downloadBytes(JSON.stringify(flatPattern(E.def),null,2),(E.def.name||"sheet")+"-bend-report.json","application/json");}catch(error){flash(String(error.message||error));}
      }));
      smOps.appendChild(btn('<i class="ph ph-file-svg"></i> ' + t("sheetMetalFlat"), function () {
        if (!E.def.sheetMetal) return;
        var pattern;
        try{pattern=flatPatternSvg(E.def);}catch(error){flash(String(error.message || error));return;}
        var blob = new Blob([pattern], {type:"image/svg+xml"}), a = document.createElement("a");
        a.href=URL.createObjectURL(blob); a.download=(E.def.name||"sheet")+"-flat-pattern.svg"; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
      }));
    }
    host.appendChild(smOps);
  }

  host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
    var partIndex = E.def.parts.indexOf(p);
    if (partIndex < 0) return;
    pushUndo(t("del"));
    E.def.parts.splice(partIndex, 1);
    E.sel = null;
    refreshAll();
  }, "md-wide btn-danger"));
}





/* Assembly picking walks the same object tree as the part editor, but every
   component group carries its own document. Resolve which component owns a hit
   so the ray is scored against that component's topology, in that component's
   own coordinates — a mate reference only means anything in the space its
   component was authored in. */
function assemblyComponentById(id) {
  return lookupAssemblyComponent(E.assembly, id);
}

/* `component` is the top-level component a hit belongs to — what a mate
   names. Inside a sub-assembly the hit is scored against the part that was
   actually struck (`leaf`), in that part's own space (`group`), and `path`
   is the chain of child ids that leads to it. */
function pickOwnerChain(object, grp) {
  var partId = null, component = null, group = null, leafGroup = null, path = [];
  while (object && object !== grp) {
    var data = object.userData || {};
    if (!partId && data.cadPart) partId = data.cadPart;
    if (data.cadSubComponent) { path.unshift(data.cadSubComponent); if (!leafGroup) leafGroup = object; }
    if (!component && data.cadComponent) { component = assemblyComponentById(data.cadComponent); group = object; }
    object = object.parent;
  }
  var leaf = component;
  path.forEach(function (id) {
    leaf = leaf && isSubassembly(leaf) ? leaf.asm.components.find(function (child) { return child.id === id; }) || null : null;
  });
  return { partId: partId, component: component, group: leafGroup || group, leaf: leaf || component, path: path };
}

/* A reference picked on a part inside a sub-assembly, restated on the
   sub-assembly itself: its id prefixed with the path, its frames carried out
   through each child's pose. That is exactly the form the sub-assembly's
   composed topology (core/assembly_structure.js) resolves. */
function liftToTopComponent(reference, component, path) {
  if (!reference || !component || !path || !path.length) return reference;
  var chain = [], node = component;
  for (var i = 0; i < path.length; i++) {
    node = node && isSubassembly(node) ? node.asm.components.find(function (child) { return child.id === path[i]; }) : null;
    if (!node) return reference;
    chain.push(node);
  }
  var lift = function (frame) {
    if (!frame) return frame;
    for (var k = chain.length - 1; k >= 0; k--) frame = descriptorToParent(frame, chain[k]);
    return frame;
  };
  var prefix = path.join("/") + "/";
  var out = Object.assign({}, reference, {
    componentId: component.id, persistentId: prefix + reference.persistentId,
    descriptor: lift(reference.descriptor), frame: lift(reference.frame), pickFrame: lift(reference.pickFrame),
  });
  if (reference.memberPersistentIds) out.memberPersistentIds = reference.memberPersistentIds.map(function (id) { return prefix + id; });
  return out;
}

function pickPartsFor(component) {
  if (!component) return (E.def && E.def.parts) || [];
  var def = componentDef(component);
  return (def && def.parts) || [];
}



function nearestVertexReference(part, event, view, pixelRadius) {
  if (!part) return null;
  var rect = viewportRect(view);
  if (!rect) return null;
  var entries = vertexEntriesFrom(topologyEntriesForPart(part));
  if (!entries.length) return null;
  var best = null, bestDistance = Infinity;
  var band = Math.max(6, Number(pixelRadius) || 0);
  entries.forEach(function (entry) {
    var at = projectToScreen(view, entry.descriptor.point, rect);
    if (!at) return;
    var distance = Math.hypot(event.clientX - at.x, event.clientY - at.y);
    if (distance > band || distance >= bestDistance) return;
    bestDistance = distance;
    best = entry;
  });
  return best ? topologyReferenceFromEntry(best) : null;
}


function rawTopologyPickCandidate(hit, view) {
  if (!hit || !hit.object) return null;
  var chain = pickOwnerChain(hit.object, view.grp);
  var part = chain.partId
    ? pickPartsFor(chain.leaf).find(function (candidate) { return candidate.id === chain.partId; }) || null
    : null;
  var entries = part ? topologyEntriesForPart(part) : [];
  var edge = hit.object.userData && hit.object.userData.cadTopology;
  if (edge) {
    var promoted = promotePickedEdge(edge, entries.length ? entries : [edge]);
    return { part: part, reference: liftToTopComponent(topologyReferenceFromEntry(promoted), chain.component, chain.path) };
  }
  if (!(hit.face && hit.face.normal) || !part) return null;
  var ranges = hit.object.userData && hit.object.userData.cadFaceRanges;
  var range = Array.isArray(ranges) && fin(hit.faceIndex)
    ? ranges.find(function (candidate) {
      return hit.faceIndex >= candidate.triangleStart
        && hit.faceIndex < candidate.triangleStart + candidate.triangleCount;
    }) : null;
  var face = range && resolveMergedTopology(entries, range.persistentId);
  if (!face || face.kind !== "face") return null;
  return { part: part, reference: liftToTopComponent(topologyReferenceFromEntry(face), chain.component, chain.path) };
}


var _scratchToComponent = null;
var _scratchPickNormal = null;

function resolveTopologyPick(event, view, options) {
  if(retainingExactPreview())return {hits:[],part:null,component:null,reference:null,pickPoint:null,pickNormal:null,pickedView:null,helixId:null};
  var prefer = options && options.prefer || E.selectionFilter || "all";
  /* A stationary component click is completed by the assembly drag recognizer's
     window-level pointerup listener. `currentTarget` is therefore Window there,
     not the canvas, and Window has no getBoundingClientRect(). Prefer the event
     target only when it is actually an element; otherwise use the view canvas. */
  var eventTarget = event.currentTarget;
  var pickSurface = eventTarget && typeof eventTarget.getBoundingClientRect === "function"
    ? eventTarget : view.rr.domElement;
  var rect = pickSurface.getBoundingClientRect();
  var ray = pickScratch();
  var pointer = pickPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  var finishPick = finishCommandActive();
  var pickPixels = topologyPickPixelRadius(event.pointerType, prefer, finishPick);
  var worldPerPixel = view && typeof view.worldPerPixel === "function" ? view.worldPerPixel() : (view.dist || 120) * .0024;
  /* three.js asks for a world-unit Line threshold. Candidate collection is
     intentionally broader than the final screen-space band because a line
     beyond the orbit target has more world units per pixel than the target;
     final arbitration below uses each hit's exact depth and rejects anything
     outside the requested pixel radius. */
  ray.setFromCamera(pointer, view.cam);
  var farWorldPerPixel = view && typeof view.farthestWorldPerPixel === "function"
    ? view.farthestWorldPerPixel() : worldPerPixel * 2;
  ray.params.Line.threshold = topologyCandidateWorldThreshold(worldPerPixel, farWorldPerPixel, pickPixels);
  var candidates = view.grp.children;
  if (candidates.length > 2) {
    var candidateBox = getScratchCandidateBox();
    var filtered = [];
    var threshold = ray.params.Line.threshold || 1;
    for (var ci = 0; ci < candidates.length; ci++) {
      var child = candidates[ci];
      candidateBox.setFromObject(child);
      if (candidateBox.isEmpty()) {
        filtered.push(child);
        continue;
      }
      candidateBox.expandByScalar(threshold);
      if (ray.ray.intersectsBox(candidateBox)) {
        filtered.push(child);
      }
    }
    candidates = filtered;
  }
  var hits = candidates.length > 0 ? ray.intersectObjects(candidates, true) : [];
  if (E.section && E.section.enabled) hits = filterTopologyHitsByClipPlane(hits, sectionPlane());
  /* Line.raycast returns the closest point on the segment but, unlike Points,
     this vendored three.js does not include distanceToRay. Derive the actual
     cursor miss once here so topology policy receives the same metric for
     straight, polyline and circular overlay edges. */
  hits.forEach(function (hit) {
    hit.pickWorldPerPixel = view && typeof view.worldPerPixelAtDistance === "function"
      ? view.worldPerPixelAtDistance(hit.distance) : worldPerPixel;
    if (hit.object && hit.object.userData && hit.object.userData.cadTopology && hit.point) {
      hit.distanceToRay = ray.ray.distanceToPoint(hit.point);
    }
  });
  {
    var part = null;
    var pickedView = null;
    var pickPoint = null, pickNormalOut = null;
    var topologyReferencePicked = null;
    var helixHit = hits.find(function (hit) { return hit.object && hit.object.userData && hit.object.userData.cadReferenceId; });
    var helixId = helixHit && helixHit.object.userData.cadReferenceId || null;
    if (hits.length) {
      var pickChoice = chooseTopologyHit(hits, {
        prefer: prefer, finish: finishPick, worldPerPixel: worldPerPixel, pixelRadius: pickPixels,
        transparent: E.displayStyle === "transparent",
      });
      var edgeHit = pickChoice.edgeHit;
      var chosenHit = pickChoice.chosenHit;
      if (!chosenHit) {
        return {
          hits: hits, part: null, component: null, reference: null,
          pickPoint: null, pickNormal: null, pickedView: null, helixId: helixId,
        };
      }
      var partObject = chosenHit.object;
      var owner = partObject;
      var chosenChain = pickOwnerChain(partObject, view.grp);
      var pickComponent = chosenChain.component, pickLeaf = chosenChain.leaf, pickPath = chosenChain.path;
      if (chosenChain.partId) {
        part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === chosenChain.partId; }) || part;
      }
      var entries = part ? topologyEntriesForPart(part) : [];
      var edgeTopology = null;
      if (partObject.userData && partObject.userData.cadTopology) {
        edgeTopology = promotePickedEdge(partObject.userData.cadTopology, entries.length ? entries : [partObject.userData.cadTopology]);
        topologyReferencePicked = topologyReferenceFromEntry(edgeTopology);
      }
      var meshHit = pickChoice.meshHit || (chosenHit.face && chosenHit.face.normal ? chosenHit : null);
      if (meshHit && meshHit.face && meshHit.face.normal) {
        var worldNormal = meshHit.face.normal.clone().transformDirection(meshHit.object.matrixWorld);
        /* Which standard plane the face faces is a question about the room, so
           it is asked of the world normal before anything is converted. */
        var wx = Math.abs(worldNormal.x), wy = Math.abs(worldNormal.y), wz = Math.abs(worldNormal.z);
        pickedView = wy >= wx && wy >= wz ? "top" : wz >= wx ? "front" : "side";
        /* Everything below compares the hit against stored descriptors, and in
           an assembly those live in the component's own space. Bring the point
           and the normal into it, or a component that has been moved or turned
           scores every one of its faces against geometry that is no longer
           where the descriptor says it is. */
        var meshChain = pickOwnerChain(meshHit.object, view.grp);
        var pickNormal = worldNormal;
        if (meshChain.group) {
          meshChain.group.updateWorldMatrix(true, false);
          if (!_scratchToComponent) _scratchToComponent = new THREE.Matrix4();
          var toComponent = _scratchToComponent.copy(meshChain.group.matrixWorld).invert();
          meshHit = Object.assign({}, meshHit, { point: meshHit.point.clone().applyMatrix4(toComponent) });
          if (!_scratchPickNormal) _scratchPickNormal = new THREE.Vector3();
          pickNormal = _scratchPickNormal.copy(worldNormal).transformDirection(toComponent);
        }
        pickPoint = { x: meshHit.point.x, y: meshHit.point.y, z: meshHit.point.z };
        pickNormalOut = { x: pickNormal.x, y: pickNormal.y, z: pickNormal.z };
        var ax = Math.abs(pickNormal.x), ay = Math.abs(pickNormal.y), az = Math.abs(pickNormal.z);
        var topologyId = null;
        var faceRanges = meshHit.object.userData && meshHit.object.userData.cadFaceRanges;
        if (Array.isArray(faceRanges) && fin(meshHit.faceIndex)) {
          var range = faceRanges.find(function (candidate) { return meshHit.faceIndex >= candidate.triangleStart && meshHit.faceIndex < candidate.triangleStart + candidate.triangleCount; });
          topologyId = range && range.persistentId;
        }
        var featureId = meshHit.object.userData && meshHit.object.userData.cadFeatureId;
        owner = meshHit.object;
        while (owner && owner !== view.grp) {
          if (!featureId && owner.userData && owner.userData.cadFeatureId) featureId = owner.userData.cadFeatureId;
          owner = owner.parent;
        }
        if (!pickComponent) { pickComponent = meshChain.component; pickLeaf = meshChain.leaf; pickPath = meshChain.path; }
        if (!part && meshChain.partId) part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === meshChain.partId; }) || null;
        if (part) entries = topologyEntriesForPart(part);
        if (partObject.userData && partObject.userData.cadTopology) {
          edgeTopology = promotePickedEdge(partObject.userData.cadTopology, entries.length ? entries : [partObject.userData.cadTopology]);
          topologyReferencePicked = topologyReferenceFromEntry(edgeTopology);
        }
        var faceTopology = null, exactFace = false;
        if (topologyId) {
          faceTopology = resolveMergedTopology(entries, topologyId);
          // A triangle range from the kernel identifies its exact owning
          // face, including revolutions and splines. Replacing those faces
          // with smooth mesh patches destroys references used by features.
          if (faceTopology && part?.meshData?.topology?.length) exactFace = true;
        }
        if (!exactFace && entries.length) {
          /* Two scores per candidate. The first only counts faces the hit point
             actually lies ON, because the old alignment score let a distant
             parallel plane outrank the round wall the ray had really landed on:
             1000 for facing the same way beats 800 for being the right bore.
             The legacy score stays as the fallback so a face whose analytic
             origin drifted still resolves to something rather than nothing. */
          var bestScore = -Infinity, bestContained = -Infinity, containedFace = null;
          entries.filter(function (entry) { return entry.kind === "face"; }).forEach(function (entry) {
            var descriptor=entry.descriptor || {}, origin=descriptor.origin || descriptor.center;
            var score = -Infinity, contained = -Infinity;
            if (descriptor.surface === "cylinder" && descriptor.axis && fin(Number(descriptor.radius))) {
              var axis = descriptor.axis, radius = Math.abs(Number(descriptor.radius));
              var axisLength = Math.hypot(axis.x, axis.y, axis.z) || 1;
              /* Named for the axis, not ax/ay/az: those already mean the
                 magnitudes of the picked normal one scope out, and one pair of
                 names for two different vectors is how a reader ends up
                 debugging the wrong quantity. */
              var cylX = axis.x/axisLength, cylY = axis.y/axisLength, cylZ = axis.z/axisLength;
              var dx = meshHit.point.x - (origin && origin.x || 0), dy = meshHit.point.y - (origin && origin.y || 0), dz = meshHit.point.z - (origin && origin.z || 0);
              var along = dx*cylX + dy*cylY + dz*cylZ;
              var rx = dx - cylX*along, ry = dy - cylY*along, rz = dz - cylZ*along;
              var radial = Math.abs(Math.hypot(rx, ry, rz) - radius);
              var wall = Math.abs(pickNormal.x*cylX + pickNormal.y*cylY + pickNormal.z*cylZ);
              /* Radius and axis alone name a whole cylinder. A wall merged from
                 a run of chords only owns its own arc of one, and scoring the
                 rest of that circle let a tooth flank claim hits clear across
                 the body. */
              if (wall < 0.35 && pointWithinCylinderArc(meshHit.point, descriptor, Math.max(0.4, radius * 0.06) / Math.max(radius, 1e-9))) {
                score = 800 - radial * 20;
                // on this wall, not merely parallel to it — a bore and the boss
                // around it share an axis and differ only by radius
                if (radial <= Math.max(0.4, radius * 0.06)) contained = 1000 - radial*40 - wall*100;
              }
            } else if (descriptor.surface === "sphere" && fin(Number(descriptor.radius))) {
              var sphereCenter = descriptor.center || origin || {x:0,y:0,z:0};
              var sphereRadius = Math.abs(Number(descriptor.radius));
              var sdx = meshHit.point.x - (sphereCenter.x || 0), sdy = meshHit.point.y - (sphereCenter.y || 0), sdz = meshHit.point.z - (sphereCenter.z || 0);
              var sphereDist = Math.abs(Math.hypot(sdx, sdy, sdz) - sphereRadius);
              var sphereLen = Math.hypot(sdx, sdy, sdz) || 1;
              var sphereFacing = Math.abs((sdx*pickNormal.x + sdy*pickNormal.y + sdz*pickNormal.z) / sphereLen);
              score = 800 - sphereDist * 20;
              if (sphereDist <= Math.max(0.4, sphereRadius * 0.06) && sphereFacing >= 0.75) contained = 1100 - sphereDist*40;
            } else if (descriptor.surface === "cone" && descriptor.axis && fin(Number(descriptor.radius))) {
              var caxis = descriptor.axis, cLen = Math.hypot(caxis.x, caxis.y, caxis.z) || 1;
              var cax = caxis.x/cLen, cay = caxis.y/cLen, caz = caxis.z/cLen;
              var cdx = meshHit.point.x - (origin && origin.x || 0), cdy = meshHit.point.y - (origin && origin.y || 0), cdz = meshHit.point.z - (origin && origin.z || 0);
              var calong = cdx*cax + cdy*cay + cdz*caz;
              var crx = cdx - cax*calong, cry = cdy - cay*calong, crz = cdz - caz*calong;
              var expected = Math.abs(Number(descriptor.radius) + calong * Math.tan(Number(descriptor.angle) || 0));
              var coneRadial = Math.abs(Math.hypot(crx, cry, crz) - expected);
              score = 800 - coneRadial * 20;
              if (coneRadial <= Math.max(0.4, expected * 0.06)) contained = 1000 - coneRadial*40;
            } else if (descriptor.surface === "torus" && descriptor.axis && fin(Number(descriptor.majorRadius)) && fin(Number(descriptor.minorRadius))) {
              var taxis = descriptor.axis, tLen = Math.hypot(taxis.x, taxis.y, taxis.z) || 1;
              var tax = taxis.x/tLen, tay = taxis.y/tLen, taz = taxis.z/tLen;
              var tdx = meshHit.point.x - (origin && origin.x || 0), tdy = meshHit.point.y - (origin && origin.y || 0), tdz = meshHit.point.z - (origin && origin.z || 0);
              var talong = tdx*tax + tdy*tay + tdz*taz;
              var trx = tdx - tax*talong, try_ = tdy - tay*talong, trz = tdz - taz*talong;
              var major = Math.abs(Number(descriptor.majorRadius)), minor = Math.abs(Number(descriptor.minorRadius));
              var torusDist = Math.abs(Math.hypot(Math.hypot(trx, try_, trz) - major, talong) - minor);
              score = 800 - torusDist * 20;
              if (torusDist <= Math.max(0.4, minor * 0.08)) contained = 1000 - torusDist*40;
            } else if (descriptor.normal) {
              var normal = descriptor.normal;
              var normalLength = Math.hypot(normal.x, normal.y, normal.z) || 1;
              var nx = normal.x/normalLength, ny = normal.y/normalLength, nz = normal.z/normalLength;
              var alignment = nx*pickNormal.x + ny*pickNormal.y + nz*pickNormal.z;
              var planeDistance=0;
              if (origin) planeDistance=Math.abs((meshHit.point.x-origin.x)*nx+(meshHit.point.y-origin.y)*ny+(meshHit.point.z-origin.z)*nz);
              score = alignment*1000-planeDistance;
              /* Winding is not guaranteed to agree with the analytic normal, so
                 the facing test is unsigned — the plane distance already keeps
                 the far side of the body out. */
              if (Math.abs(alignment) >= 0.9 && planeDistance <= 0.4) contained = 900 + Math.abs(alignment)*90 - planeDistance*100;
            }
            if (contained > bestContained) { bestContained = contained; containedFace = entry; }
            if (score > bestScore) { bestScore = score; faceTopology = entry; }
          });
          if (containedFace) {
            faceTopology = containedFace;
            /* A 16-gon extrusion names each stave as its own plane. That hit is
               contained, but it is not the face the user meant — grouping still
               has to swallow the rest of the wall. */
            if (analyticCurvedFace(containedFace.descriptor) || (containedFace.descriptor?.surface === "plane" && part?.meshData?.topology?.length)) exactFace = true;
          }
        }
        if (!exactFace && fin(meshHit.faceIndex)) {
          /* Tessellated curves without a kernel face still have to pick as one
             wall: group triangles across edges that are not real creases. */
          var grouped = smoothFacesForMesh(meshHit.object);
          var groupedIndex = grouped.faceOfTriangle && grouped.faceOfTriangle.length > meshHit.faceIndex
            ? grouped.faceOfTriangle[meshHit.faceIndex] : -1;
          var groupedFace = groupedIndex >= 0 ? grouped.faces[groupedIndex] : null;
          if (groupedFace && groupedFace.descriptor && (groupedFace.descriptor.surface !== "plane" || !faceTopology)) {
            var groupedId = (featureId || "feature") + ":face:mesh:" + groupedIndex;
            faceTopology = resolveMergedTopology(entries, groupedId) || {
              ownerFeatureId: featureId, kind: "face", persistentId: groupedId,
              semantic: "mesh-face:" + groupedIndex, descriptor: groupedFace.descriptor,
            };
          }
        }
        /* Exact kernels normally provide a pick line for every circular rim.
           Keep an analytic fallback for Edge-only mode, but use the SAME
           screen-space band instead of applying a second, wider magnet after
           the face has already won. */
        if (prefer === "edge" && !topologyReferencePicked) {
          var rim = nearestCircularEdge(entries, meshHit.point, {
            maxDist: topologyLineWorldThreshold(meshHit.pickWorldPerPixel || worldPerPixel, pickPixels),
            cylinder: faceTopology && faceTopology.descriptor && faceTopology.descriptor.surface === "cylinder" ? faceTopology.descriptor : null,
          });
          if (rim) topologyReferencePicked = topologyReferenceFromEntry(rim);
        }
        /* Only a proven tessellation seam yields to the face in All. A straight
           generatrix on a partial cylinder, cone, or fillet is a real edge. */
        if (topologyReferencePicked && topologyReferencePicked.kind === "edge" && prefer !== "edge" && faceTopology) {
          var edgeEntry = edgeTopology || resolveMergedTopology(entries, topologyReferencePicked.persistentId);
          var roundWalls = entries.filter(function (entry) {
            return entry.kind === "face" && entry.descriptor && entry.descriptor.surface === "cylinder";
          });
          if (faceTopology.descriptor && faceTopology.descriptor.surface === "cylinder" && roundWalls.indexOf(faceTopology) === -1) {
            roundWalls = [faceTopology].concat(roundWalls);
          }
          if (edgeEntry && roundWalls.length && isCylinderTessellationSeam(edgeEntry, roundWalls)) topologyReferencePicked = null;
        }
        if (!topologyReferencePicked || prefer === "face") {
          if (faceTopology) topologyReferencePicked = topologyReferenceFromEntry(faceTopology);
          else if (featureId && prefer !== "edge") {
            var semantic = ay >= ax && ay >= az ? (pickNormal.y >= 0 ? "top" : "bottom") : ax >= az ? (pickNormal.x >= 0 ? "right" : "left") : (pickNormal.z >= 0 ? "front" : "back");
            topologyReferencePicked = createTopologyReference(featureId, "face", featureId + ":face:" + semantic, {surface:"plane",semantic:semantic,origin:{x:meshHit.point.x,y:meshHit.point.y,z:meshHit.point.z},normal:{x:pickNormal.x,y:pickNormal.y,z:pickNormal.z}});
          }
        }
      }
      while (partObject && partObject !== view.grp) {
        if (partObject.userData && partObject.userData.cadPart) {
          part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === partObject.userData.cadPart; }) || null;
          break;
        }
        partObject = partObject.parent;
      }
    }
    /* A corner beats whatever it sits on, but only while the Vertex filter is
       asking for one. Vertices are derived from edge endpoints rather than
       carried in the topology, so they cost nothing until something wants
       them — and leaving All-mode arbitration alone means the face-vs-edge
       rules the rest of the editor is built on do not shift underfoot. */
    if (prefer === "vertex") {
      topologyReferencePicked = nearestVertexReference(part, event, view, pickPixels) || null;
    }
    /* Everything above was measured in the struck part's own space. A part
       inside a sub-assembly is restated on the sub-assembly here, once. */
    if (pickPath && pickPath.length) {
      topologyReferencePicked = liftToTopComponent(topologyReferencePicked, pickComponent, pickPath);
      var liftedPick = pickPoint && pickNormalOut ? liftToTopComponent({ persistentId: "", descriptor: { origin: pickPoint, normal: pickNormalOut } }, pickComponent, pickPath).descriptor : null;
      if (liftedPick) { pickPoint = liftedPick.origin; pickNormalOut = liftedPick.normal; }
    }
    return {
      hits: hits, part: part, component: pickComponent || null, reference: topologyReferencePicked,
      /* Where the ray actually landed, in the same space as the descriptors.
         A mate needs a frame, and a resolved reference does not always carry
         one — the editor draws solids as RoundedBoxGeometry, whose filleted
         edges make the smooth-face grouping swallow the whole body into a
         single surface with no normal at all. */
      pickPoint: pickPoint || null, pickNormal: pickNormalOut || null,
      pickedView: pickedView, helixId: helixId,
    };
  }
}

var markupsLastDrawnSig = null;
var markupsLastDrawnVis = null;

function drawMarkupsOverlay(mcv, dpr) {
  var sig = markupsSignature();
  var live = !!(E.activeMarkupStroke && E.activeMarkupStroke.points && E.activeMarkupStroke.points.length > 1);
  if (!live && sig === markupsLastDrawnSig && E.notesVisible === markupsLastDrawnVis) {
    return;
  }
  markupsLastDrawnSig = live ? null : sig;
  markupsLastDrawnVis = E.notesVisible;

  var ctx = mcv.getContext("2d");
  ctx.clearRect(0, 0, mcv.width, mcv.height);
  if (E.notesVisible === false || !E.def) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  var markups = Array.isArray(E.def.markups) ? E.def.markups : [];
  for (var i = 0; i < markups.length; i++) {
    var s = markups[i];
    if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color || "#ef4444";
    ctx.lineWidth = s.width || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var pts = s.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.stroke();
  }

  if (E.activeMarkupStroke && E.activeMarkupStroke.points && E.activeMarkupStroke.points.length > 1) {
    var livePts = E.activeMarkupStroke.points;
    ctx.beginPath();
    ctx.strokeStyle = E.activeMarkupStroke.color || E.markupColor || "#ef4444";
    ctx.lineWidth = E.activeMarkupStroke.width || E.markupWidth || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(livePts[0].x, livePts[0].y);
    for (var k = 1; k < livePts.length; k++) {
      ctx.lineTo(livePts[k].x, livePts[k].y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/* Note callouts are re-projected on EVERY rendered frame — this runs from the
   view's afterRender hook — so nothing in here may rebuild DOM. An earlier
   version assigned card.innerHTML and svg.innerHTML per frame, which parsed
   markup 60 times a second while the camera moved and, worse, destroyed the
   card's own subtree mid-gesture: the delete button lost hover and any
   in-flight pointer press, so it was not reliably clickable during an orbit.

   Build once, then write only what the projection actually changed. */
var notesScratch = null;
function noteScratch() {
  if (!notesScratch) notesScratch = new THREE.Vector3();
  return notesScratch;
}

var SVG_NS = "http://www.w3.org/2000/svg";

/* The references a mate button falls back to when nothing is picked: one face
   or axis synthesized from each component's own bounding box. The gate and the
   command build them here, together, so the gate is judging the very frames
   the mate would be stored with. */

var instantVectors = null;
function instantScratch() {
  if (!instantVectors) {
    instantVectors = { dir: new THREE.Vector3(), anchor: new THREE.Vector3() };
  }
  return instantVectors;
}

/* Direct assembly manipulation.

   A primary drag that starts on a component moves that component in the camera
   plane; the same drag on empty space remains the view's orbit gesture. Mouse,
   pen and touch all arrive as pointer events, so selection, undo and mate
   solving have one implementation rather than a desktop path and a subtly
   different mobile path.

   Mates are solved on each move and the existing component groups are reposed
   in place. Rebuilding every mesh on every pointer event made a constrained
   chain feel glued down even though the solver itself finishes in a few
   milliseconds. The normal refresh on release rebuilds highlights, the tree,
   the inspector and status exactly once. */
function beginAssemblyComponentDrag(event, view) {
  if (E.docType !== "assembly" || E.tool !== "select" || E.facePick || !E.assembly || !view) return false;
  /* A second contact belongs to pinch/pan. The first contact's drag owns this
     slot until it ends, which prevents two fingers from moving two components
     while the shared viewport is trying to zoom. */
  if (E._assemblyDragPointer != null) return false;
  var found = resolveTopologyPick(event, view, { prefer: E.selectionFilter }) || {};
  var component = found.component;
  if (!component) return false;

  event.preventDefault();
  var pointerId = event.pointerId;
  E._assemblyDragPointer = pointerId;
  var canvas = view.rr && view.rr.domElement;
  var start = { x: event.clientX, y: event.clientY };
  var keys = ["x", "y", "z", "rx", "ry", "rz"];
  /* The orientation rides in `q`, so a snapshot that copied only the six
     numbers restored the mirror and left the quaternion where the abandoned
     drag had pushed it — and the next normalize believes the quaternion. */
  var snapshots = (E.assembly.components || []).map(function (item) {
    var transform = normalizeTransform(item);
    var pose = { q: Object.assign({}, transform.q) };
    keys.forEach(function (key) { pose[key] = transform[key]; });
    return { component: item, pose: pose };
  });
  var startPose = Object.assign({}, normalizeTransform(component));
  var moveMode = E.assemblyMoveMode || "free";
  /* Cmd/Ctrl is an additive pick, never the start of a move. Keep it inside the
     custom recognizer so its stationary pointerup follows exactly the same
     component/face pick path as an ordinary click, but ignore trackpad travel:
     a Mac click can report a few contact pixels while Cmd is held. */
  var additivePick = !!(event.ctrlKey || event.metaKey);
  var threshold = event.pointerType === "touch" ? 10 : 4;
  var moved = false, undoOpen = false, blocked = false, longPressed = false, multiTouch = false;
  var longPressTimer = 0;

  function selectMoving() {
    E.componentSel = [component];
    E.sel = component;
    E.topologySelection = [];
  }
  function restoreSnapshots() {
    snapshots.forEach(function (snapshot) {
      var transform = normalizeTransform(snapshot.component);
      keys.forEach(function (key) { transform[key] = snapshot.pose[key]; });
      transform.q = Object.assign({}, snapshot.pose.q);
      normalizePose(transform); // re-derive the mirror from the restored orientation
    });
  }
  function posesChanged() {
    return snapshots.some(function (snapshot) {
      var transform = normalizeTransform(snapshot.component);
      return keys.some(function (key) { return Math.abs(transform[key] - snapshot.pose[key]) > 1e-9; });
    });
  }
  function syncGroups() {
    if (!view.grp) return;
    view.grp.traverse(function (object) {
      var id = object.userData && object.userData.cadComponent;
      if (id) {
        var item = assemblyComponentById(id);
        if (!item) return;
        var transform = normalizeTransform(item), blown = item.explodedOffset || {};
        object.position.set(transform.x + (blown.x || 0), transform.y + (blown.y || 0), transform.z + (blown.z || 0));
        object.rotation.set(transform.rx * Math.PI / 180, transform.ry * Math.PI / 180, transform.rz * Math.PI / 180);
      }
      if (object.userData && object.userData.cadInterference != null) object.visible = false;
    });
    view.render();
  }
  function cancelLongPressTimer() {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
  function secondaryPointerDown(ev) {
    if (ev.pointerId === pointerId || (ev.pointerType !== "touch" && ev.pointerType !== "pen")) return;
    multiTouch = true;
    cancelLongPressTimer();
    /* If the second finger arrived after a small move, give the whole gesture
       back to camera navigation instead of committing an accidental nudge. */
    if (undoOpen) {
      restoreSnapshots();
      H.discard();
      undoOpen = false;
      solveAssembly({ quiet: true });
      syncGroups();
    }
  }
  function move(ev) {
    if (ev.pointerId !== pointerId || multiTouch || longPressed || additivePick) return;
    var travel = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
    if (!moved && travel <= threshold) return;
    cancelLongPressTimer();
    if (!moved) {
      moved = true;
      selectMoving();
      if (component.grounded) {
        blocked = true;
        flash(t("smartMateGrounded"));
        return;
      }
      pushUndo(t("opMove"));
      undoOpen = true;
      if (canvas) canvas.style.cursor = "grabbing";
    }
    if (blocked) return;
    var delta = moveMode === "free" ? screenDeltaToWorld(view, start, ev)
      : screenDeltaAlongAxis(view, start, ev, moveMode);
    var transform = normalizeTransform(component);
    transform.x = startPose.x + delta.x;
    transform.y = startPose.y + delta.y;
    transform.z = startPose.z + delta.z;
    solveAssembly({ quiet: true });
    syncGroups();
  }
  function cleanup() {
    cancelLongPressTimer();
    window.removeEventListener("pointerdown", secondaryPointerDown, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    E._assemblyDragPointer = null;
    if (canvas) canvas.style.cursor = "";
  }
  function finish(ev, cancelled) {
    cleanup();
    if (multiTouch || longPressed) { refreshAll(); return; }
    if (!moved) {
      pickAssemblyComponent(ev, view);
      return;
    }
    if (cancelled && undoOpen) {
      restoreSnapshots();
      H.discard();
      undoOpen = false;
      solveAssembly({ quiet: true });
    } else if (undoOpen && !posesChanged()) {
      H.discard();
      undoOpen = false;
    }
    refreshAll();
  }
  function up(ev) {
    if (ev.pointerId !== pointerId) return;
    finish(ev, false);
  }
  function cancel(ev) {
    if (ev.pointerId !== pointerId) return;
    finish(ev, true);
  }

  if (event.pointerType === "touch") {
    var press = { clientX: event.clientX, clientY: event.clientY, pointerType: "touch", button: 0 };
    longPressTimer = setTimeout(function () {
      longPressTimer = 0;
      if (moved || multiTouch) return;
      longPressed = true;
      showSelectThrough(press, view);
    }, 520);
  }
  window.addEventListener("pointerdown", secondaryPointerDown, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  return true;
}

/* Every Alt gesture in an assembly lands here: editor_view hands pointerdown
   to beginDrag first, and taking it means pick never runs. So this owns both
   halves of SmartMate — Alt-drag one component onto another, and Alt-click two
   references in turn for anyone without a mouse to drag with.

   Either way the component being acted on is the one that moves, which makes
   it the mate's B side: the solver only ever moves B. Passing the drag source
   as A did the reverse, and since the drop target is usually the grounded
   base, the solver then refused the mate outright and nothing happened. */
/* Window select in 3D, with the 2D canvas's grammar: dragged left-to-right
   takes only what is fully enclosed, right-to-left takes anything it crosses.
   boxSelectMode/boundsHitBox are the same helpers the sketch marquee uses, so
   the two views cannot drift apart on what "crossing" means. */
function beginBoxSelectDrag(event, view) {
  if (E.docType !== "part" || E.tool !== "select" || E.facePick) return false;
  var rect = viewportRect(view);
  if (!rect) return false;
  var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
  if (!part) return false;
  /* Started ON the model, the same Ctrl/Cmd-drag paints instead of windowing.
     A window drawn from a point already inside the body is nearly useless —
     it starts over the thing it is meant to enclose — and sweeping along a run
     of edges is the gesture actually wanted there. Same split Instant3D makes
     between a handle and open space. */
  var over = resolveTopologyPick(event, view, { prefer: commandSelectionPrefer() });
  if (over && over.reference) return beginPaintSelectDrag(event, view, part, over.reference);
  var host = root && root.querySelector("#mdMarquee");
  if (!host) return false;
  event.preventDefault();
  var start = { x: event.clientX, y: event.clientY };
  var box = { x0: start.x, y0: start.y, x1: start.x, y1: start.y };
  var moved = false;
  var paint = function () {
    var mode = boxSelectMode(box.x0, box.x1);
    host.hidden = false;
    host.classList.toggle("is-crossing", mode === "crossing");
    host.style.left = Math.min(box.x0, box.x1) + "px";
    host.style.top = Math.min(box.y0, box.y1) + "px";
    host.style.width = Math.abs(box.x1 - box.x0) + "px";
    host.style.height = Math.abs(box.y1 - box.y0) + "px";
  };
  function move(ev) {
    box.x1 = ev.clientX; box.y1 = ev.clientY;
    if (Math.hypot(box.x1 - start.x, box.y1 - start.y) > 3) moved = true;
    if (moved) paint();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    host.hidden = true;
    host.classList.remove("is-crossing");
    if (moved) applyBoxSelection(part, box, view, rect);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return true;
}

/* Sweep to accumulate: everything the pointer passes over joins the selection,
   and nothing leaves it. Additive only, like the Shift-click it is the dragged
   form of — a sweep that could also deselect would undo its own work as the
   pointer re-crossed an edge it had just taken. */
function beginPaintSelectDrag(event, view, part, firstReference) {
  var added = new Set();
  var take = function (reference) {
    if (!reference || added.has(reference.persistentId)) return;
    added.add(reference.persistentId);
    if (finishCommandActive()) {
      if (fullRoundActive() && reference.kind === "face") toggleFullRoundFace(reference);
      else if (reference.kind === "face") toggleFinishEdges(edgeRefsForFaces([reference], part));
      else if (reference.kind === "edge") toggleFinishEdges([reference]);
      return;
    }
    if ((E.topologySelection || []).some(function (item) { return item.persistentId === reference.persistentId; })) return;
    E.topologySelection = (E.topologySelection || []).concat([reference]);
  };
  E.sel = part;
  take(firstReference);
  refreshSelection();
  event.preventDefault();
  function move(ev) {
    var found = resolveTopologyPick(ev, view, { prefer: commandSelectionPrefer() });
    if (!found || !found.reference) return;
    var before = added.size;
    take(found.reference);
    if (added.size !== before) refreshSelection();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (added.size > 1) flash(tf("selectOpResult", { count: (E.topologySelection || []).length }));
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return true;
}

function applyBoxSelection(part, box, view, rect) {
  var filter = commandSelectionPrefer();
  var entries = topologyEntriesForPart(part);
  var mode = boxSelectMode(box.x0, box.x1);
  /* A planar face has no outline in its descriptor, so it is taken when the
     edges that bound it are taken — enclosed needs all of them inside,
     crossing needs one. That keeps faces honest rather than approximating a
     surface from a centre point and an area. */
  var wantsFaces = filter === "face" || filter === "all";
  var picked = [];
  var edgeHit = new Map();
  entries.forEach(function (entry) {
    if (entry.kind !== "edge" && entry.kind !== "vertex") return;
    var bounds = entryScreenBounds(entry, view, rect);
    if (!bounds) return;
    var hit = boundsHitBox(bounds, box, mode);
    if (entry.kind === "edge") edgeHit.set(entry.persistentId, hit);
    if (!hit || !selectionFilterAllows(entry.kind, filter)) return;
    picked.push(entry);
  });
  if (filter === "vertex" || filter === "edge" || filter === "all") {
    vertexEntriesFrom(entries).forEach(function (entry) {
      if (!selectionFilterAllows("vertex", filter)) return;
      var bounds = entryScreenBounds(entry, view, rect);
      if (bounds && boundsHitBox(bounds, box, mode)) picked.push(entry);
    });
  }
  if (wantsFaces) {
    var registry = createTopologyRegistry(entries);
    entries.filter(function (entry) { return entry.kind === "face"; }).forEach(function (face) {
      var bounding = edgesBoundingFace(face, registry);
      if (!bounding.length) return;
      var taken = bounding.map(function (edge) { return edgeHit.get(edge.persistentId) === true; });
      var include = mode === "enclosed" ? taken.every(Boolean) : taken.some(Boolean);
      if (include) picked.push(face);
    });
  }
  var refs = dedupeFinishRefs(picked.map(topologyReferenceFromEntry).filter(Boolean));
  if (!refs.length) { flash(t("selectOpEmpty")); return; }
  E.sel = part;
  // Ctrl/Cmd is add, here as on a click.
  if (finishCommandActive()) setFinishEdges(currentFinishEdges().concat(refs), { pool: true });
  else {
    var have = new Set((E.topologySelection || []).map(function (reference) { return reference.persistentId; }));
    E.topologySelection = (E.topologySelection || []).concat(refs.filter(function (reference) { return !have.has(reference.persistentId); }));
    refreshSelection();
  }
  hidePickCycle();
  flash(tf("selectOpResult", { count: (E.topologySelection || []).length }));
}

function beginSmartMateDrag(event, view) {
  var pick = function (source) {
    return resolveTopologyPick({ clientX: source.clientX, clientY: source.clientY, pointerType: source.pointerType }, view, { prefer: E.selectionFilter }) || {};
  };
  var from = pick(event);
  var movingComponent = from.component;
  if (!movingComponent) return false;
  var movingRef = stampComponentRef(from.reference, movingComponent, from) || componentTopologyFromHit(movingComponent, (from.hits || [])[0]);
  E.componentSel = [movingComponent];
  E.sel = movingComponent;
  function up(ev) {
    window.removeEventListener("pointerup", up);
    var onto = pick(ev);
    var targetComponent = onto.component;
    var targetRef = null;
    if (targetComponent && targetComponent !== movingComponent) {
      targetRef = stampComponentRef(onto.reference, targetComponent, onto) || componentTopologyFromHit(targetComponent, (onto.hits || [])[0]);
    } else if (Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) <= 4) {
      /* A click, not a drag: pair this reference with the last one picked on
         another component, or remember it as the first of the pair. */
      var earlier = (E.topologySelection || []).filter(function (candidate) {
        return candidate.componentId && candidate.componentId !== movingComponent.id;
      });
      targetRef = earlier[earlier.length - 1] || null;
      if (!targetRef) {
        E.topologySelection = [movingRef];
        flash(t("smartMateHint"));
        refreshAll();
        return;
      }
    }
    if (!targetRef) { refreshAll(); return; }
    if (movingComponent.grounded) { flash(t("smartMateGrounded")); refreshAll(); return; }
    var mate = inferSmartMate(mateReferenceFromPick(targetRef), mateReferenceFromPick(movingRef));
    if (!mate) { refreshAll(); return; }
    var fits = mateFramesFit(mate.type, mate.a.frame, mate.b.frame);
    if (!fits.ok) { flash(fits.reason); refreshAll(); return; }
    pushUndo(t("smartMate"));
    E.assembly.topologyMates ||= [];
    E.assembly.topologyMates.push({ id: uid(), type: mate.type, a: mate.a, b: mate.b, aligned: !!mate.aligned, value: 0, pitch: mate.pitch });
    solveAssembly();
    E.topologySelection = [];
    flash("\u2713 " + t("smartMate") + " \u00b7 " + mate.type);
    refreshAll();
  }
  window.addEventListener("pointerup", up);
  flash(t("smartMateHint"));
  return true;
}

function initPreview() {
  /* three is late-bound (js/three_lazy.js), and openModeler() must stay
     SYNCHRONOUS — callers click #mdSave in the same tick that they open the
     editor. So the editor's DOM is built either way and only the 3D viewport
     waits: E.pv stays null until three lands, exactly the state every call
     site already handles for a machine with no GPU (createEditorView returns
     null there), and then the viewport appears. */
  if (!threeLoaded()) {
    loadThree().then(function () {
      if (root && !E.pv) {
        initPreview();
        if (E.open) { layout3DHost(); updatePreview(); renderPreview(); }
      }
    }, function () {});
    return;
  }
  var orbitProjection='perspective';try{if(localStorage.getItem('modelforge:orbitProjection')==='orthographic')orbitProjection='orthographic';}catch(error){}
  E.pv = createEditorView({
    projection:orbitProjection,
    canvas: root.querySelector("#mdPrev"),
    fov: 45, near: 0.1, far: 5000,
    grid: true, gridOpacity: 0.26, shadows: true,
    ambient: 0.62, keyLight: 1.05, fill: 0.22,
    az: 0.8, el: 0.5, dist: 260,
    minEl: -1.5, maxEl: 1.5, minDist: 1, maxDist: 2000,
    pad: 16, ratio: 0.75,
    fitContainerHeight: function () { return E.mode === "3d"; },
    center: function () {
      if (E.docType === "assembly") return 0;
      var b = defBounds(E.def);
      return (b.y0 + b.y1) / 2;
    },
    active: function () { return E.open; },
    draw: drawInRoom,
    pick: pickAssemblyComponent,
    cadNav: true,
    normalToOrthographic: true,
    beginDrag: beginInstant3dDrag,
    contextMenu: function (event) { showSelectThrough(event, E.pv); },
    longPress: showSelectThrough,
    doubleClick: function () { growSelectionFromDoubleClick(); },
    afterRender: function (view) {
      syncViewButtons();
      syncInstant3dValue(view);
      syncNotesAndMarkups(view);
      refreshDecorationScale();
      /* The sketch is a 2D canvas projected through this camera. Repaint after
         every orbit/zoom render or the solid moves while its drawing stays in
         the old screen position. Both layers remain visible and aligned. */
      if (E.mode === "3d" && E.modelPlaneActive && E.cv) drawSketch();
    },
    lighting: editorLightingSettings,
    gesturePreview: previewMouseGesture,
    gesture: function (event, view, dx, dy) { applyMouseGesture(dx, dy); },
  });
  // second copy of the parts, placed into the real scene for context rendering
  if (E.pv) {
    E.pv.roomGrp = new THREE.ClippingGroup(); E.pv.roomGrp.enabled = false;
    // The mode can relocate the canvas while Three is still loading. Apply
    // that current home to the new renderer before its first sized render.
    if (swapView) swapView(E.mode === "3d" || !!E.split, E.pv, { render: false });
  }
  // same debugging handle the preview rebuild already exposes
  if (typeof window !== "undefined") window.cadPreviewView = E.pv;
  /* Pre-highlight whatever the cursor is over. Throttled to one resolve per
     frame — a raycast per pointermove event on a dense model is a stutter, and
     the highlight only ever needs to be right at paint time. */
  var canvas = root.querySelector("#mdPrev");
  if (canvas && E.pv) {
    /* The navigation sentence is first-run help. Once the viewport has been
       operated, leave only the small ? affordance; live tool and selection
       messages still take precedence and remain visible. */
    var dismissIdleHint = function () {
      if (E.mode !== "3d" || E.modelPlaneActive || E.facePick || (E.topologySelection || []).length) return;
      E.hintDismissed = true;
      syncHint();
    };
    canvas.addEventListener("pointerdown", dismissIdleHint, { passive: true });
    canvas.addEventListener("wheel", dismissIdleHint, { passive: true });
    var queued = null, latestHoverEvent = null;
    function cancelQueuedHover() {
      latestHoverEvent = null;
      if (queued) cancelAnimationFrame(queued);
      queued = null;
    }
    canvas.addEventListener("pointermove", function (event) {
      if (event.buttons) { cancelQueuedHover(); return; }   // mid-orbit: no picking
      /* Pointer events can outnumber paints by an order of magnitude. Keep a
         small value snapshot of the newest coordinates; retaining the first
         event in the frame makes the highlight trail a fast cursor. */
      latestHoverEvent = {
        clientX: event.clientX, clientY: event.clientY,
        pointerType: event.pointerType, currentTarget: canvas,
      };
      if (queued) return;
      queued = requestAnimationFrame(function () {
        queued = null;
        var event = latestHoverEvent;
        latestHoverEvent = null;
        if (!event) return;
        /* Show where the arrow's grab zone is. Missing it starts an orbit
           instead, and an orbit is exactly what "the handle does nothing"
           looks like from the outside. */
        var instantHit = !E.facePick && instant3dAuthoringState() ? hitInstant3d(event, E.pv) : null;
        var overHandle = !!instantHit;
        canvas.style.cursor = E.facePick ? "crosshair" : overHandle ? "grab" : "";
        if (overHandle) return;
        hoverAssemblyTopology(event, E.pv, instantHit);
      });
    });
    canvas.addEventListener("pointerleave", function () {
      cancelQueuedHover();
      canvas.style.cursor = "";
      if (!E.hoverTopology) return;
      E.hoverTopology = null;
      refreshDecorations();
    });
  }
}

/* The isolated editor normally owns a compact studio rig. When room matching
   is enabled, copy the live sun vector rather than merely copying its angle:
   the source distance, color, and intensity then remain identical as the room
   time-of-day or north bearing changes. The target is remapped to the model's
   centre by editor_view, which preserves that vector without moving the part. */
function editorLightingSettings(view) {
  if (!view) return null;
  if (!E._manualLightBase && view.lighting) {
    E._manualLightBase = {
      keyColor: view.lighting.keyColor,
      keyIntensity: view.lighting.keyIntensity,
      ambientColor: view.lighting.ambientColor,
      ambientIntensity: view.lighting.ambientIntensity,
      fillColor: view.lighting.fillColor,
      fillIntensity: view.lighting.fillIntensity,
    };
  }
  if (!E.lightMatchRoom) return Object.assign({}, E._manualLightBase || {}, {
    azimuth: E.lightAzimuth,
    elevation: E.lightElevation,
    distance: E.lightDistance,
  });
  var rig = getRigLights(), sun = rig && rig.sun;
  if (!sun || !sun.target) return null;
  var offset = new THREE.Vector3().subVectors(sun.position, sun.target.position);
  if (E.srcItem && E.srcItem.rot) {
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Number(E.srcItem.rot) * Math.PI / 180);
  }
  var distance = Math.max(1, offset.length()), horizontal = Math.hypot(offset.x, offset.z);
  return {
    azimuth: Math.atan2(offset.x, offset.z) * 180 / Math.PI,
    elevation: Math.atan2(offset.y, horizontal) * 180 / Math.PI,
    distance: distance,
    keyColor: "#" + sun.color.getHexString(),
    keyIntensity: sun.intensity,
    ambientColor: rig.hemi ? "#" + rig.hemi.color.getHexString() : undefined,
    ambientIntensity: rig.hemi ? rig.hemi.intensity : undefined,
    fillColor: rig.fill ? "#" + rig.fill.color.getHexString() : undefined,
    fillIntensity: rig.fill ? rig.fill.intensity : undefined,
  };
}

/* Sketch or model, in the same middle pane. The preview canvas is MOVED there
   rather than a second WebGL context being created — see editor_view.js. The
   thumbnail in the right panel and the big view are one renderer.
   Split is the sketch with the model beside it: E.mode stays "2d" — every
   sketch tool, relation and dimension works as in Sketch — and the renderer
   sits in the right half, where it orbits and zooms and shows each rebuild.
   Anything that needs the full model (finishing the sketch, picking a face,
   the drawing sheet) leaves Split; a workflow that asks for "2d" keeps it.
   Parts only, and not on phones: there is no room for two views. */
function setMode(m) {
  if (E.dimEditor && !applyDimensionEditor()) return;
  var askedSplit = m === "split";
  m = m === "3d" ? "3d" : m === "drawing" ? "drawing" : "2d";
  var previousMode = E.mode;
  E.mode = m;
  E.modelPlaneActive = false;
  E.touchPrecision = null;
  /* The chip names candidates from one viewport ray; a mode change invalidates
     it. syncSelectionFilters() also demotes the Sketch filter, which has
     nothing to acquire once the sketch view is gone. */
  hidePickCycle();
  dismissProfileOffer();
  syncSelectionFilters();
  if (askedSplit) E.split = true;
  if (m !== "2d" || E.docType !== "part" || document.body.classList.contains("compact-nav")) E.split = false;
  var split = !!E.split, wasSplit = root.classList.contains("md-split");
  if (E.pv) E.pv.clearFixedFrame(false);
  if (m === "3d" || m === "drawing") E.tool = "select";
  E.dimPick = [];
  E.dimSel = null;
  if (!swapView) {
    swapView = createViewportSwap({
      wrap: root.querySelector(".md-prev-wrap"),
      bigHost: root.querySelector("#md3dHost"),
      panelHost: root.querySelector("#mdRightPanel"),
    });
  }
  root.classList.toggle("md-split", split);
  // Relocating the preview must not compile its hidden shader on a 2D sheet.
  swapView(m === "3d" || split, E.pv, { render: m !== "drawing" });
  // In the large viewport the checkbox shares a row with the selection filters.
  var roomToggle = root.querySelector(".md-context-toggle");
  var roomHost = root.querySelector(m === "3d" || split ? "#mdRailRow" : ".md-prev-wrap");
  if (roomToggle.parentNode !== roomHost) roomHost.appendChild(roomToggle);
  root.classList.toggle("md-is3d", m === "3d");
  root.classList.toggle("md-isdrawing", m === "drawing");
  syncModelPlane();
  layout3DHost();
  if (m === "3d") fitPreview();
  else if (split !== wasSplit) {
    /* The sketch pane changes width under the user's zoom: keep the zoom and
       the point in the middle, frame the model half for what it now shows. */
    var oldW = E.cw;
    E._splitFitted = false;
    requestAnimationFrame(function () {
      if (sizeSketch() && oldW) { E.ox += (E.cw - oldW) / 2; drawSketch(); }
      layout3DHost();
      if (split) fitSplitPreview();
    });
  }
  if (m === "drawing") {
    E.ssel=[]; E.sel=null; E.poly=null; E.arcPts=null; E.wallPts=null;
    /* Entering the sheet re-projects: the model may have changed since the last
       visit, and a stale projection is a drawing that lies. */
    invalidateDrawing();
    var sheetDoc = drawingDocument();
    /* A phone has no room for a 244px properties column beside an A3 page, so
       the sheet gets the screen and the panel is one tap away on the same
       toggle the inspector uses. */
    root.classList.toggle("md-sheet-collapsed", document.body.classList.contains("compact-nav"));
    drawingSheet().setTool("select");
    drawingSheet().fit();
    /* A sheet nobody has drafted on still states the two overall sizes — the
       first thing anyone reads off a drawing — and seeding them is not an edit
       the user made, so it opens no undo step. */
    if (!sheetDoc.dims.length && !sheetDoc.seeded) {
      sheetDoc.seeded = true;
      drawingSheet().autoDimension(true);
    }
  }
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    var active = b.getAttribute("data-mode") === (split ? "split" : m);
    b.classList.toggle("on", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  syncTools();
  syncCoach();
  syncSheetPanel();
  drawSketch();
  /* A sketch opened over the 3D model inherits the model camera. Switching to
     the dedicated 2D editor must frame its plane rather than keep that camera's
     room-scale projection, which makes millimetre work nearly impossible. */
  if (m === "2d" && previousMode === "3d" && E.authoring?.phase === "sketch")
    requestAnimationFrame(fitSketch);
}

function setModelDisplay(style, refresh) {
  E.displayStyle = style === "transparent" ? "transparent" : "solid";
  if (root) root.querySelectorAll("[data-display]").forEach(function (button) {
    var active = button.getAttribute("data-display") === E.displayStyle;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (refresh !== false) updatePreview();
}

function setShowModelEdges(on, refresh) {
  E.showModelEdges = on !== false;
  if (root) {
    var button = root.querySelector("#mdShowEdges");
    if (button) {
      button.classList.toggle("on", E.showModelEdges);
      button.setAttribute("aria-pressed", E.showModelEdges ? "true" : "false");
    }
  }
  if (refresh !== false) updatePreview();
}

function setPanelCollapsed(side, collapsed) {
  if (!root) return;
  var left = side === "left";
  if (left) E.leftCollapsed = !!collapsed;
  else {
    E.rightCollapsed = !!collapsed;
    if (E.mode === "drawing") {
      root.classList.toggle("md-sheet-collapsed", !!collapsed);
    }
  }
  root.classList.toggle(left ? "md-left-collapsed" : "md-right-collapsed", !!collapsed);
  var button = root.querySelector(left ? "#mdToggleLeft" : "#mdToggleRight");
  if (button) button.setAttribute("aria-pressed", collapsed ? "false" : "true");
  sizeSketch();
  drawSketch();
  requestAnimationFrame(layout3DHost);
}

function sectionPlane() {
  var axis = E.section && E.section.axis || "x";
  var sign = E.section && E.section.flip ? -1 : 1;
  var normal = axis === "y" ? new THREE.Vector3(0, sign, 0)
    : axis === "z" ? new THREE.Vector3(0, 0, sign)
    : new THREE.Vector3(sign, 0, 0);
  return new THREE.Plane(normal, -(Number(E.section && E.section.offset) || 0) * sign);
}

function applySectionClipping(group) {
  if (!group || !E.pv) return;
  var enabled = !!(E.section && E.section.enabled), plane = enabled ? sectionPlane() : null;
  // Live previews are ordinary child groups and inherit these planes. Keeping
  // clipping on the root also covers edges and meshes added asynchronously.
  if (!group.isClippingGroup) return;
  group.enabled = enabled;
  group.clippingPlanes = plane ? [plane] : [];
  group.clipShadows = enabled;
}

function syncSectionHelper() {
  if (!E.pv) return;
  if (E.pv.sectionHelper) {
    E.pv.sc.remove(E.pv.sectionHelper);
    if (E.pv.sectionHelper.geometry) E.pv.sectionHelper.geometry.dispose();
    if (E.pv.sectionHelper.material) E.pv.sectionHelper.material.dispose();
    E.pv.sectionHelper = null;
  }
  if (!(E.section && E.section.enabled)) return;
  var bounds = E.def ? defBounds(E.def) : null;
  var span = bounds ? Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0, 80) : 160;
  E.pv.sectionHelper = new THREE.PlaneHelper(sectionPlane(), span * 1.3, 0x2dd4bf);
  E.pv.sectionHelper.name = "Section plane";
  E.pv.sc.add(E.pv.sectionHelper);
}

function setSectionState(next) {
  E.section = Object.assign({ enabled:false, axis:"x", offset:0, flip:false }, E.section || {}, next || {});
  if (!root) return;
  var controls = root.querySelector("#mdSectionControls");
  if (controls) controls.hidden = !E.section.enabled;
  root.querySelectorAll("[data-section-axis]").forEach(function (button) {
    button.classList.toggle("on", button.getAttribute("data-section-axis") === E.section.axis);
  });
  var slider = root.querySelector("#mdSectionOffset"), output = root.querySelector("#mdSectionValue");
  if (slider) slider.value = String(E.section.offset);
  if (output) output.textContent = fmtLen(E.section.offset);
  var flip = root.querySelector("#mdSectionFlip");
  if (flip) flip.classList.toggle("on", !!E.section.flip);
  if (E.pv) {
    applySectionClipping(E.pv.grp);
    applySectionClipping(E.pv.roomGrp);
    syncSectionHelper();
    E.pv.render();
  }
}

function toggleSectionView() {
  if (E.mode !== "3d") setMode("3d");
  setSectionState({ enabled:!(E.section && E.section.enabled) });
}

/* The panels are columns in the body's flex row now, not cards floating over a
   full-bleed middle pane, so the middle pane IS the free space — the big model
   view fills it with plain `inset: 0` and the old measure-the-gaps pass (which
   also had to mirror itself in RTL) is gone. */
function layout3DHost() {
  if (E.pv) {
    if (E.pv.invalidateSize) E.pv.invalidateSize();
    // The sheet is a 2D canvas. Compiling the hidden preview's shader here can
    // throw before the mode buttons update, leaving a partial drawing switch.
    if (E.mode !== "drawing") E.pv.render();
  }
}

/* Frame whatever is modelled so it fills the view it has just been given —
   the thumbnail's distance is wrong for a pane ten times the size. */
/* The extent of the sketch being drawn right now, in world space. fitPreview()
   needs it because a part is all sketch and no solid right up until the first
   extrude: with nothing rendered, defBounds() falls back to a fixed 60-unit box
   and framed that instead, which left a 6.9cm profile as a speck in the middle
   of the screen — and Zoom to fit, the one control meant to rescue it, a no-op.
   Only the sketch the user is actually on counts; other sketches on the plane
   are dimmed references and should not drag the frame out to meet them. */
function activeSketchWorldBounds() {
  if (!E.def) return null;
  var current = ensureSketch(E.def);
  var u0, u1, v0, v1, frame = null;
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch, current)) return;
    if (!frame) frame = activeSketchFrame() || standardPlaneFrame(E.view, sketch.offset);
    var geometry=sketchGeometryBounds(sketch);if(!geometry)return;
    u0=u0===undefined?geometry.u0:Math.min(u0,geometry.u0);u1=u1===undefined?geometry.u1:Math.max(u1,geometry.u1);
    v0=v0===undefined?geometry.v0:Math.min(v0,geometry.v0);v1=v1===undefined?geometry.v1:Math.max(v1,geometry.v1);
  });
  if (u0 === undefined || !frame) return null;
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  [[u0, v0], [u0, v1], [u1, v0], [u1, v1]].forEach(function (uv) {
    var w = framePoint(frame, uv[0], uv[1], 0);
    b.x0 = Math.min(b.x0, w.x); b.x1 = Math.max(b.x1, w.x);
    b.y0 = Math.min(b.y0, w.y); b.y1 = Math.max(b.y1, w.y);
    b.z0 = Math.min(b.z0, w.z); b.z1 = Math.max(b.z1, w.z);
  });
  return b;
}

function fitPreview() {
  if (!E.pv || !E.def) return;
  if (E.docType === "assembly") {
    /* Framing off the component count showed two small parts as specks and cut
       widely mated ones off at the edges. Measure what is actually there. */
    var box = assemblyBounds();
    var span = box
      ? Math.max(1, Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0))
      : 180;
    E.pv.frame(span * 1.5,box);
    if(box){
      var origin=E.pv.fixedFrame?.origin || {x:0,y:0,z:0};
      E.pv.target.set((box.x0+box.x1)/2-origin.x,(box.y0+box.y1)/2-origin.y,(box.z0+box.z1)/2-origin.z);
    }
    E.pv.render();
    return;
  }
  /* Frame the solids and the live sketch together, the way Zoom to Fit does:
     either one alone can be the larger of the two. */
  var sketchBox = activeSketchWorldBounds();
  var b = renderedParts(E.def).length ? defBounds(E.def) : sketchBox;
  if(E.contextEdit){
    var ghost=E.pv.grp?.children.find(function(object){return object.userData.cadAssemblyContext;});
    if(ghost){var ghostBox=new THREE.Box3().setFromObject(ghost);if(!ghostBox.isEmpty()){
      var gb={x0:ghostBox.min.x,x1:ghostBox.max.x,y0:ghostBox.min.y,y1:ghostBox.max.y,z0:ghostBox.min.z,z1:ghostBox.max.z};
      b=b?{x0:Math.min(b.x0,gb.x0),x1:Math.max(b.x1,gb.x1),y0:Math.min(b.y0,gb.y0),y1:Math.max(b.y1,gb.y1),z0:Math.min(b.z0,gb.z0),z1:Math.max(b.z1,gb.z1)}:gb;
    }}
  }
  if (b && sketchBox && b !== sketchBox) b = {
    x0: Math.min(b.x0, sketchBox.x0), x1: Math.max(b.x1, sketchBox.x1),
    y0: Math.min(b.y0, sketchBox.y0), y1: Math.max(b.y1, sketchBox.y1),
    z0: Math.min(b.z0, sketchBox.z0), z1: Math.max(b.z1, sketchBox.z1),
  };
  if (!b) b = defBounds(E.def);
  if(E.modelPlaneActive && E.pv.fixedFrame && E.pv.framePlane){
    E.pv.framePlane(b);invalidateSketchProjection();E.pv.render();return;
  }
  var dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0,
    r = Math.max(1, Math.hypot(dx, dy, dz));
  E.pv.frame(r * 1.5,b);
  // Plane-aligned sketch cameras use the frame origin plus the pan target.
  // Fitting the size alone leaves off-origin geometry behind the view controls.
  if (E.pv.fixedFrame) {
    var origin = E.pv.fixedFrame.origin;
    E.pv.target.set((b.x0+b.x1)/2-origin.x,(b.y0+b.y1)/2-origin.y,(b.z0+b.z1)/2-origin.z);
  } else {
    // The orbit view adds the solid's Y center in createEditorView.place().
    // X/Z have no automatic baseline; fit their offset as well as the size.
    var modelBox=defBounds(E.def),centerY=(modelBox.y0+modelBox.y1)/2;
    E.pv.target.set((b.x0+b.x1)/2,(b.y0+b.y1)/2-centerY,(b.z0+b.z1)/2);
  }
  E.pv.render();
}

/* ================= saved-model library panel ================= */
async function exportLibraryJson() {
  // IndexedDB is the shared source of truth; another tab may have saved since
  // this editor last rendered its Library panel.
  try { modelLibraryCache=await loadModelLibrary(); assemblyLibraryCache=await loadAssemblyLibrary(); }
  catch (e) { flash(t("saveStorageFull")); return; }
  writeLibraryIndex(modelLibraryCache); writeAssemblyIndex(assemblyLibraryCache);
  var text = JSON.stringify(libraryBundle(loadLib(), loadAssemblies()), null, 2);
  downloadBytes(text, "modelforge-library.json", "application/json");
  flash("✓ " + t("libraryExported"));
}

function importLibraryJson() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async function () {
    var file = input.files && input.files[0];
    if (!file) return;
    try {
      var bundle = parseLibraryBundle(await file.text());
      // Collision choices must describe the current shared library, not the
      // snapshot this tab had when it opened the editor.
      modelLibraryCache=await loadModelLibrary();
      assemblyLibraryCache=await loadAssemblyLibrary();
      var collisions = collidingLibraryKeys(loadLib(), bundle.models).concat(collidingLibraryKeys(loadAssemblies(), bundle.assemblies));
      var conflict = "replace";
      if (collisions.length) {
        var unique = collisions.filter(function (key, index) { return collisions.indexOf(key) === index; });
        var choice = await askModelerDecision(root, {
          title: t("importLibrary"),
          message: tf("libraryImportReplace", { keys: unique.join(", ") }),
          accept: t("libraryImportOverwrite"),
          cancel: t("libraryImportKeepBoth"),
        });
        if (choice == null) return;
        conflict = choice ? "replace" : "keep-both";
      }
      if (conflict === "keep-both") {
        const imported = await importKeptLibraryBundle(bundle);
        modelLibraryCache = imported.models;
        assemblyLibraryCache = imported.assemblies;
        writeLibraryIndex(modelLibraryCache);
        writeAssemblyIndex(assemblyLibraryCache);
        mirrorLibraryToDisk(imported.importedModels);
        signalLibraryChange();
      } else {
        if (!await saveLib(bundle.models,{mode:"merge",conflict})) { report(t("reportKickerSave"), t("saveLibraryFailed"), t("saveStorageFull")); return; }
        if (!await saveAssemblies(bundle.assemblies,{mode:"merge",conflict})) { flash(t("saveStorageFull")); return; }
      }
      loadLib().forEach(registerCustomModel);
      refreshLib();
      flash("✓ " + t(conflict === "keep-both" && collisions.length ? "libraryImportedKept" : "libraryImported"));
    } catch (error) { flash(t("libraryImportFailed")); }
  });
  input.click();
}

/* What a cleared browser lost, offered back from the disk mirror. Restoring
   only adds models whose key is missing, so it can never overwrite live work. */
async function restoreDiskBackups(missing) {
  var names = missing.map(function (backup) { return backup.name || backup.key; }).join(", ");
  if (!await askModelerDecision(root, { title:t("diskBackupRestore"), message:tf("diskBackupRestoreAsk", { names:names }), accept:t("diskBackupRestore"), cancel:t("m_cancel") })) return;
  var records = [];
  for (var i = 0; i < missing.length; i++) {
    var backup = await fetchDiskBackup(missing[i].key);
    if (!backup) continue;
    // Payloads first: a record whose exact-CAD attachment is missing will not rebuild.
    try { if (backup.attachments.length) await installAttachmentRecords(backup.attachments); }
    catch (e) { continue; }
    records.push(backup.model);
  }
  if (!records.length) { flash(t("diskBackupRestoreFailed")); return; }
  if (!await saveLib(records,{mode:"merge",conflict:"skip"})) { report(t("reportKickerSave"), t("saveLibraryFailed"), t("saveStorageFull")); return; }
  loadLib().forEach(registerCustomModel);
  refreshCatalogSelect();
  refreshLib();
  flash("✓ " + tf("diskBackupRestored", { n:records.length }));
}

function appendDiskBackupNote(host) {
  var note = el("div", "md-backup-note");
  note.hidden = true;
  host.appendChild(note);
  listDiskBackups().then(function (backups) {
    if (!note.isConnected) return; // the panel re-rendered meanwhile
    var missing = missingFromLibrary(backups, loadLib());
    if (missing.length) {
      note.appendChild(el("div", "md-card-note", tf("diskBackupMissing", { n:missing.length })));
      note.appendChild(btn('<i class="ph ph-clock-counter-clockwise"></i> ' + t("diskBackupRestore"), function () { restoreDiskBackups(missing); }, "md-wide"));
      note.hidden = false;
    } else if (modelBackupStatus() === "off") {
      note.appendChild(el("div", "md-card-note", t("diskBackupOff")));
      note.hidden = false;
    }
  });
}

function libraryTransferButtons(host) {
  host.appendChild(btn('<i class="ph ph-export"></i> ' + t("exportLibrary"), exportLibraryJson, "md-wide"));
  host.appendChild(btn('<i class="ph ph-download-simple"></i> ' + t("importLibrary"), importLibraryJson, "md-wide"));
}

/* The old shared draft cannot be attributed to a tab. Do not offer it as an
   automatic restore on a fresh tab: an older tab may still be editing it.
   Keep it available through a deliberate action in the Library pane. */
function appendLegacyDraftRecovery(host) {
  host.appendChild(btn('<i class="ph ph-clock-counter-clockwise"></i> ' +
    (getLang() === "en" ? "Saved drafts" : "טיוטות שמורות"), recoverSavedModelerDraft, "md-wide"));
  var action = btn('<i class="ph ph-clock-counter-clockwise"></i> ' +
    (getLang() === "en" ? "Recover earlier draft" : "שחזור טיוטה קודמת"), recoverLegacyModelerDraft, "md-wide");
  action.hidden = true;
  host.appendChild(action);
  loadModelerDraftRecord().then(function (legacy) {
    if (action.isConnected) action.hidden = !legacy && !readModelerDraft(modelerDraftStorage());
  }).catch(function () {
    if (action.isConnected) action.hidden = !readModelerDraft(modelerDraftStorage());
  });
}

async function recoverSavedModelerDraft() {
  var records;
  try { records=await listModelerDraftRecords(); }
  catch(error) { flash(String(error.message || error)); return; }
  var dialog=document.createElement("dialog");
  dialog.className="md-properties-dialog";
  dialog.appendChild(el("h3","",getLang()==="en" ? "Saved drafts" : "טיוטות שמורות"));
  dialog.appendChild(el("p","",getLang()==="en"
    ? "Recover work from this browser, including an unresponsive tab. The original draft stays available."
    : "שחזור עבודה מהדפדפן, כולל לשונית שאינה מגיבה. הטיוטה המקורית נשמרת."));
  records.forEach(function(record){
    var doc=record.docType==="assembly" ? record.assembly : record.def;
    var row=el("div","md-card");
    row.appendChild(el("strong","",doc && doc.name || t("title")));
    row.appendChild(el("p","",new Date(record.at || 0).toLocaleString()+" · "+((doc && doc.history || []).length)+" "+t("steps")));
    var recover=btn(getLang()==="en" ? "Recover here" : "שחזור כאן",async function(){
      dialog.close();dialog.remove();
      if(!await confirmDiscardDocument("unsavedOpen"))return;
      var draft=cloneData(record);delete draft.id;
      if(restoreModelerDraft(draft))scheduleModelerDraft();
    },"md-wide");
    row.appendChild(recover);dialog.appendChild(row);
  });
  if(!records.length)dialog.appendChild(el("p","",getLang()==="en" ? "No saved drafts." : "אין טיוטות שמורות."));
  dialog.appendChild(btn(t("close"),function(){dialog.close();dialog.remove();},"md-wide"));
  dialog.addEventListener("cancel",function(){dialog.remove();});
  root.appendChild(dialog);dialog.showModal();
}

async function recoverLegacyModelerDraft() {
  if (!await confirmDiscardDocument("unsavedOpen")) return;
  var accepted = await askModelerDecision(root, {
    title:t("recoverDraftTitle"),
    message:getLang() === "en"
      ? "Recover the earlier shared draft? It may still be open in another browser tab."
      : "לשחזר את הטיוטה המשותפת הקודמת? ייתכן שהיא עדיין פתוחה בלשונית דפדפן אחרת.",
    accept:t("restoreDraftAction"), cancel:t("keepEditingAction"),
  });
  if (!accepted) return;
  await discardModelerDraft();
  var recovered = null;
  try { recovered = await claimLegacyModelerDraftRecord(modelerDraftOwnerId); }
  catch (error) {}
  var local = claimLegacyModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  recovered = recovered || local;
  if (!recovered) {reconcileModelerDraft();return;}
  modelerDraftCache = recovered;
  restoreModelerDraft(recovered);
  reconcileModelerDraft();
  refreshLib();
}

/* A saved model's card shows the model, the same picture as its planner
   library tile (js/thumbs.js renders it once and stores it; the warm-up there
   has usually made it before the list is opened). A picture not made yet is
   filled in a moment later (thumbAsync), so the list never waits on WebGL. */
var libThumbQueue = [], libThumbTimer = 0;
function libraryThumbnailsVisible() {
  var host = root && root.querySelector("#mdLib"), pane = host && host.closest('.md-pane[data-pane="lib"]');
  return !!(E.open && !document.hidden && pane && pane.classList.contains("on"));
}
function scheduleLibThumbs() {
  if (libraryThumbnailsVisible() && libThumbQueue.length && !libThumbTimer) libThumbTimer = setTimeout(fillLibThumbs, 0);
}
function libThumb(type, icon) {
  if (libraryThumbnailsVisible() && type && FURN[type] && hasThumb(type)) {
    var url = modelThumb(type);
    if (url) { var img = el("img", "md-card-thumb"); img.src = url; img.alt = ""; return img; }
  }
  var box = el("span", "md-card-thumb md-card-thumb-empty");
  box.appendChild(el("i", "ph " + icon));
  if (type && FURN[type]) {
    libThumbQueue.push({ box: box, type: type });
    scheduleLibThumbs();
  }
  return box;
}
function fillLibThumbs() {
  libThumbTimer = 0;
  if (!libraryThumbnailsVisible()) return;
  loadThumbCache().then(function () {
    if (!libraryThumbnailsVisible()) return;
    // thumbAsync draws the missing ones in short steps (and waits for the
    // renderer if it is still starting); a stored one resolves at once
    libThumbQueue.splice(0).forEach(function (job) {
      if (!job.box.isConnected) return;
      thumbAsync(job.type).then(function (url) {
        if (!url || !job.box.isConnected) return;
        var img = el("img", "md-card-thumb"); img.src = url; img.alt = ""; job.box.replaceWith(img);
      });
    });
  });
}

async function saveAssemblyCopyAndOpen(assembly) {
  if (!await confirmDiscardDocument("unsavedOpen")) return false;
  var owner=E.assembly,history=currentHistoryNode(),type=E.docType;
  var sourceKey=assembly.key,sourceSignature=JSON.stringify(assembly);
  var isCurrent=function(){return E.docType===type&&E.assembly===owner&&currentHistoryNode()===history;};
  var sourceCurrent=function(){var stored=loadAssemblies().find(function(a){return a.key===sourceKey;});return stored&&JSON.stringify(stored)===sourceSignature;};
  if(!sourceCurrent()){flash('The saved assembly changed; refresh the library and retry');return false;}
  var answer=await sheetForm(t("saveCopyOpen"),[{key:"name",label:t("name"),value:(assembly.name||t("newAssembly"))+" copy"}],t("saveCopyHint"));
  var name=String(answer?.name||'').trim();if(!name)return false;
  if(!isCurrent()||!sourceCurrent()){flash('The document or saved assembly changed; retry Save copy and open');return false;}
  var copy=cloneData(assembly);copy.key="asm_"+Date.now().toString(36)+"_"+uid();copy.name=name;
  if(copy.id!==undefined)copy.id=copy.key;if(copy.definitionId!==undefined)copy.definitionId=copy.key;
  if(!await saveAssemblies(copy,{expected:null})){
    report(t("reportKickerSave"),t("saveAssemblyFailed"),t(lastAssemblySaveConflict?"saveAssemblyConflict":"saveStorageFull"));return false;
  }
  if(!isCurrent() || E.quickFormInstance?.hasPendingEdits()){refreshLib();flash("✓ "+tf("savedNamed",{name:name}));return true;}
  abandonDocumentExactWork();closeEvalCard();
  E.assembly=cloneData(compactAssemblyTopologySnapshots(resolvedLibraryAssembly(copy)));assemblyOpenBaseline=cloneData(copy);E.componentSel=[];E.sel=null;
  S.idc=nextDocumentNumericId(E.assembly,S.idc);invalidateInterference();H.clear().seed();markDocumentClean();reconcileModelerDraft();
  syncHead();refreshAll();refreshLib();fitPreview();flash("✓ "+tf("savedNamed",{name:name}));return true;
}

var librarySearchQueries={part:'',assembly:''};
function refreshLib() {
  var host = root.querySelector("#mdLib");
  libThumbQueue = [];
  host.innerHTML = "";
  var libraryKind=E.docType==='assembly'?'assembly':'part';
  var librarySearch=appendSavedLibrarySearch(host,{query:librarySearchQueries[libraryKind],label:getLang()==='en'?(libraryKind==='assembly'?'Search saved assemblies':'Search saved models'):(libraryKind==='assembly'?'חיפוש הרכבות שמורות':'חיפוש מודלים שמורים'),noMatches:getLang()==='en'?'No matching saved models':'לא נמצאו מודלים מתאימים',onQuery:function(value){librarySearchQueries[libraryKind]=value;}});
  host.appendChild(btn('New from '+(E.docType==='assembly'?'assembly':'part')+' template',function(){void documentPresetAction('new');},'md-wide md-dashed'));
  if (E.docType === "assembly") {
    host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newAssembly"), newModel, "md-wide md-dashed"));
    host.appendChild(btn(getLang()==="en" ? "Save combined model to room library" : "שמירת מודל משולב לספריית החדר", publishAssemblyModel, "md-wide"));
    libraryTransferButtons(host);
    var assemblies = loadAssemblies();
    if (!assemblies.length) { emptyState(host, "ph-stack", t("assemblies"), t("noComponentsHint")); return; }
    var assemblySearch=librarySearch;
    assemblies.forEach(function (assembly) {
      var card = el("div", "md-card" + (E.assembly && assembly.key === E.assembly.key ? " on" : ""));
      var top = el("div", "md-card-top");
      // the combined model once published to the room library, else its first part
      var first = (assembly.components || [])[0];
      var pic = FURN["cm_" + assembly.key] ? "cm_" + assembly.key : first && first.modelKey;
      top.appendChild(libThumb(pic, "ph-stack"));
      top.appendChild(el("span", "nm", assembly.name || assembly.key)); card.appendChild(top);
      card.appendChild(el("div", "md-card-note",
        countLabel((assembly.components || []).length, "assemblyComponentOne", "assemblyComponents") + " · " +
        countLabel(assemblyMateCount(assembly), "matesCountOne", "matesCount")));
      card.addEventListener("click", async function () {
        if (!await confirmDiscardDocument("unsavedOpen")) return;
        abandonDocumentExactWork();closeEvalCard();
        var occurrenceSnapshot=compactAssemblyTopologySnapshots(assembly);
        E.assembly = cloneData(occurrenceSnapshot); assemblyOpenBaseline=cloneData(assembly); E.componentSel = []; E.sel = null;
        if(E.assembly.components?.some(c=>c.libraryLink))applyTrackedUpdates(E.assembly);
        S.idc = nextDocumentNumericId(E.assembly, S.idc);
        invalidateInterference();
        /* Opening an assembly is a document open, the same as the part cards
           below. Without these two lines the new assembly inherited the
           previous document's undo stack and its saved baseline, so Undo
           reached back into a document that was no longer open and the dirty
           flag was reporting on one that no longer existed. */
        H.clear().seed();
        markDocumentClean();
        reconcileModelerDraft();
        syncHead(); refreshAll(); refreshLib(); fitPreview();
      });
      card.appendChild(btn(t("saveCopyOpen"),function(e){e.stopPropagation();return saveAssemblyCopyAndOpen(assembly);},"md-wide"));
      var del = btn('<i class="ph ph-trash"></i>', function (e) {
        e.stopPropagation();
        saveAssemblies(assembly.key,{mode:"delete"}).then(function (ok) {
          if (!ok) flash(t("saveStorageFull"));
          refreshLib();
        });
      }, "md-card-x");
      del.title = t("del"); card.appendChild(del); host.appendChild(card); assemblySearch.add(assembly,card);
    });
    assemblySearch.apply();
    return;
  }
  host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newModel"), newModel, "md-wide md-dashed"));
  /* Models and assemblies use separate stores and separate cards. On reload
     the editor opens in Part mode, so a saved assembly otherwise looks lost
     while this pane shows only parts. Give its library a direct route here. */
  var savedAssemblies=loadAssemblies().length;
  if(savedAssemblies) host.appendChild(btn('<i class="ph ph-stack"></i> ' + t("assemblies") + " · " + savedAssemblies,
    function () { requestDocumentType("assembly"); }, "md-wide"));
  libraryTransferButtons(host);
  appendLegacyDraftRecovery(host);
  appendDiskBackupNote(host);
  var lib = loadLib();
  if (!lib.length) { emptyState(host, "ph-folder-open", t("noLib"), t("noLibHint")); return; }
  var partSearch=librarySearch;
  lib.forEach(function (m) {
    /* Clicking the card loads it — the row used to be inert with a "Load"
       button riding on it, which read as a list you could select from. */
    var card = el("div", "md-card" + (m.key === E.def.key ? " on" : ""));
    card.title = t("load");
    var top = el("div", "md-card-top");
    top.appendChild(libThumb(m.key, (m.parts || []).length ? "ph-cube" : "ph-pencil-ruler"));
    top.appendChild(el("span", "nm", m.name || m.key));
    card.appendChild(top);
    card.appendChild(el("div", "md-card-note", (m.parts || []).length
      ? m.parts.length + " " + t("partCount") +
        (fin(m.w) ? " · " + [m.w,m.d,m.h].map(formatModelLength).join("×") + " cm" : "")
      : (function(){
          var drawing=drawingOnlyContentSummary(m);
          if(drawing)return t("drawingOnly")+" · "+drawing.annotations+" "+t(drawing.annotations===1?"paperAnnotation":"paperAnnotations")+" · "+drawing.notes+" "+t(drawing.notes===1?"drawingNote":"drawingNotes");
          var count=(m.sketches || []).filter(function(sketch){return (sketch.entities || []).length || (m.history || []).some(function(entry){return entry.kind === "sketch" && entry.targetId === sketch.id;});}).length;
          return t("sketchOnly") + " · " + count + " " + t(count === 1 ? "sketch" : "sketches");
        })()));
    card.addEventListener("click", async function () {
      /* A library choice is a document open, not an in-place geometry swap.
         Replacing E.def directly skipped the initialization below in
         openModeler(): canonical history/authoring state, active sketch,
         rebuild state, document-scoped tree state and selection arrays all
         continued to describe the previously open model.  It also left the
         Library pane selected, making a correctly persisted feature history
         look as though it had not loaded.  Use the one document-open path so
         selecting a saved model behaves exactly like opening it from a placed
         instance and lands on its design tree. */
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      E.quickFormInstance?.dismiss(true);
      openModeler(null, m, null, true);
    });
    card.appendChild(btn(t("saveCopyOpen"), async function(e) {
      e.stopPropagation();
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      const previousPart=E.def, previousAssembly=E.assembly, generation=H.generation, history=currentHistoryNode();
      var answer=await sheetForm(t("saveCopyOpen"),[{key:"name",label:t("name"),value:(m.name || t("newModel"))+" copy"}],t("saveCopyHint"));
      var name=answer && answer.name;
      if (!name) return;
      var copy=cloneData(m);
      copy.key="cm_"+Date.now().toString(36)+"_"+uid();
      copy.id=copy.definitionId=copy.key;
      copy.name=name;
      if (!await saveLib(copy,{expected:null})) {
        report(t("reportKickerSave"),t("saveLibraryFailed"),t("saveStorageFull"));return;
      }
      registerCustomModel(copy);
      const stillConfirmed=E.def===previousPart && E.assembly===previousAssembly && H.generation===generation && currentHistoryNode()===history;
      await openModeler(null,copy,null,stillConfirmed);
      refreshLib();
      flash("✓ "+tf("savedNamed",{name:name}));
    },"md-wide"));
    var x = btn('<i class="ph ph-trash"></i>', async function (e) {
      e.stopPropagation();
      if (!await askModelerDecision(root, { title:t("delModel"), message:t("askDel") + "\n" + (m.name || m.key), accept:t("del"), cancel:t("m_cancel") })) return;
      if (!await saveLib(m.key,{mode:"delete"})) { flash(t("saveStorageFull")); return; }
      delete FURN[m.key];
      delete PRICE[m.key];
      refreshCatalogSelect();
      refreshLib();
      garbageCollectAttachments([S,E.def,loadLib(),loadAssemblies()]).catch(function(){});
    }, "md-card-x");
    x.title = t("delModel");
    card.appendChild(x);
    host.appendChild(card); partSearch.add(m,card);
  });
  partSearch.apply();
}

function syncHead() {
  var name = root.querySelector("#mdName"), price = root.querySelector("#mdPrice");
  var description = root.querySelector("#mdDescription");
  var unitControl=root.querySelector("#mdDocumentLengthUnit");
  if(unitControl)unitControl.value=modelLengthUnit();
  if (description) description.value = documentDescription(E.docType === "assembly" ? E.assembly : E.def);
  if (E.docType === "assembly") {
    name.value = E.assembly ? E.assembly.name || "" : "";
    price.closest(".md-field").style.display = "none";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("saveAssembly");
  } else {
    name.value = E.def.name || "";
    price.value = fin(E.def.price) ? E.def.price : 0;
    price.closest(".md-field").style.display = "";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("save");
  }
  // says whether saving replaces a library entry or re-points a placed piece
  var sub = root.querySelector("#mdSub");
  if (sub) sub.textContent = E.docType === "assembly" ? "· " + t("docAssembly") : E.srcItem ? "· " + (flabel ? flabel(E.srcItem.type) : E.srcItem.type) : "";
}

/* The exact-tree twin of the `merges3d` fusion the viewport performs.
   Every merge kind gets emitted, not just the analytic extrusion: a merged
   sweep that only the viewport knew about was a body STEP export, mass and
   interference all silently built without. The params are the kernel-facing
   ones, which is exactly what regenerateFeatures hands to makeBrep*. */
function mergeFeatureRecipe(merge) {
  return toolFeatureRecipe(merge);
}

function emitPartMerges(target, part, feature) {
  (part.merges3d || []).forEach(function (merge, mergeIndex) {
    if (merge.suppressed) return;
    var recipe = mergeFeatureRecipe(merge.hingeSpec ? projectedHingeTool(part,merge) : merge);
    if (!recipe) return;
    var addition = addFeature(target, { id:part.featureId + ":merge-body:" + mergeIndex, type:recipe.type, name:"Merged body " + (mergeIndex+1), params:recipe.params });
    feature = addFeature(target, { id:part.featureId + ":merge:" + mergeIndex, type:"union", name:"Merge " + (mergeIndex+1), inputs:[feature.id,addition.id] });
  });
  return feature;
}

/* A part's OWN pattern turn, as the last row of its chain.
 *
 * rotatePatternPart records a circular or curve copy's turn on the part as
 * `patternRotations`, and buildPart nests it as groups around the whole
 * rendered body — outside the profile holes, outside the merges, outside the
 * finish operations. Nothing emitted it here, so STEP/IGES, mass properties and
 * interference rebuilt every such copy at the SEED's angle: translated but
 * never turned. Emitting it last is what makes the exact tree describe the body
 * the viewport draws.
 *
 * It also has to be last for the merges below it: fusePatternInstances stores a
 * cluster's placements in the HOST's frame, which is only correct if the host's
 * turn is applied outside them, which is exactly where this row sits. */
function emitPartPatternTurn(target, part, feature) {
  var turn = partPatternTransform(part);
  if (rigidTransformIsIdentity(turn)) return feature;
  return addFeature(target, {
    id:part.featureId + ":pattern-turn", type:"transformBody", name:"Pattern turn",
    params:{matrix:turn.matrix.slice(), translation:{...turn.translation}}, inputs:[feature.id],
  });
}

var exactRebuildQueue=createExactRebuildQueue();
function cancelExactModelRebuild() {
  var hadRetainedPreview=retainingExactPreview();
  if(pendingCutController)pendingCutController.abort();
  cancelledExactPreview={document:E.def,node:currentHistoryNode()};
  (E.def?.parts || []).forEach(function(part){
    var scheduled=exactBuildTimers.get(part);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(part);}
    part.exactBuildToken=(part.exactBuildToken || 0)+1;
    part.exactPending=false;
    part.exactError="Exact CAD computation cancelled";
  });
  exactRebuildQueue.reset();
  cancelCadWorkerWork();
  E.kernelBusy=false;
  E.exactRestoring=false;
  if(hadRetainedPreview){updatePreview();syncStatus();}
}

/* Ctrl+B is an authoring command, not merely an export-kernel warm-up.  A
   sketch edit can leave the lightweight body projection (especially Sweep
   and Loft) holding geometry sampled by an earlier commit even though the
   feature tree itself already points at the edited sketch.  Re-resolve every
   sketch-backed recipe, cancel builds that could publish the old recipe, and
   discard derived display caches before compiling the complete history.

   regenerateExactModel() deliberately remains the narrower primitive used by
   STEP/IGES export and automatic exact restore; those callers must not blank
   the viewport or turn a read operation into a document-wide refresh. */
async function forceRebuildDocument() {
  if (E.docType !== "part" || !E.def) { flash(t("cmdNeedPartDoc")); return null; }
  if (!activeParts(E.def).length) { flash(t("needParts")); return null; }
  cancelledExactPreview=null;

  syncSketchDrivenParts();
  var changedParts = [];
  (E.def.parts || []).forEach(function (part) {
    var scheduled=exactBuildTimers.get(part);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(part);}
    part.exactBuildToken=(part.exactBuildToken || 0)+1;
    part.exactPending=false;
    part.exactError=null;
    /* Imported/frozen mesh bodies are source data, not derived output. */
    if (isCanonicalAuthoring() || part.sketchDriven || isKernelBody(part)) {
      delete part.meshData;
      if (isKernelBody(part)) delete part.bounds;
      clearTopologyCache(part);
      changedParts.push(part);
    }
  });
  refreshChangedParts(changedParts);
  releaseExactRun();
  E.coreRun=null;
  coreRunFresh=false;
  refreshAll();
  var run=await regenerateExactModel(true,{restoreMode:'mesh'});
  if(run){refreshAll();flash("✓ "+t("forceRebuildReady"));}
  return run;
}

/* Through three points: each point is a picked model vertex (kept associative)
   or, where nothing is at hand to pick — the middle of a face edge, a point on
   a slanted face — typed as X, Y, Z. A typed point is stored as a free point;
   a picked one whose typed coordinates are unchanged stays bound to its vertex. */
var THREE_POINT_KEYS=["p1x","p1y","p1z","p2x","p2y","p2z","p3x","p3y","p3z"];

var massDisplayUnits = "si";
var massCoordinateSystemId = "";

async function showMassProperties() {
  if (E.docType !== "part" && E.docType !== "assembly") return;
  var documentAtStart=E.docType==="assembly"?E.assembly:E.def;
  if(!documentAtStart)return;
  if(documentAtStart.documentProperties)massDisplayUnits=documentDefaults(documentAtStart).massUnit==='lb'?'ips':documentDefaults(documentAtStart).massUnit==='g'?'mmg':'si';
  var snapshot=E.docType==="assembly"?cloneData(E.assembly):cloneData({...E.def,parts:activeParts(E.def)});
  var body = openEvalCard("mass", t("cmdEvaluate"), t("massProps"));
  if (!body) return;
  var evaluation={type:E.docType,document:documentAtStart,node:currentHistoryNode(),editRevision:E.massEditRevision || 0};
  E.massEvaluation=evaluation;
  body.textContent=t("liveExactCalc");
  var releases=new Map();
  var mass = E.docType==="assembly" ? await evaluateAssemblyMassProperties(snapshot,{
    resolveDefinition:function(component){return component.def || componentDef(component);},
    evaluateDefinition:async function(def){
      var source=cloneData({...def,parts:activeParts(def)});
      var measuredSolids=new Map(),sourceReleases=new Map();
      var measured;
      try{measured=await evaluateMassProperties(source,{
        bodyKey:function(part){return source.metadata?.authoringSystem==="parametric-v1" && (source.features || []).some(function(feature){return feature.id===part.featureId;}) ? cutTargetFeatureId(part,source) : part;},
        buildSolid:async function(part){var display=await exactDisplayBody(part,source,null,{massProperties:true});measuredSolids.set(part.id,display.brep);sourceReleases.set(display.brep,display.release);return display.brep;},
        releaseSolid:function(){},
      });}catch(error){sourceReleases.forEach(function(release){release();});throw error;}
      return {...measured,
        boundsAtPlacement:async function(row,placement){
          var solid=measuredSolids.get(row.partId);
          if(row.accuracy!=="exact" || !solid)return null;
          return placedBrepBounds(solid,{matrix:[placement.x.x,placement.y.x,placement.z.x,placement.x.y,placement.y.y,placement.z.y,placement.x.z,placement.y.z,placement.z.z],translation:placement.origin});
        },
        release:function(){sourceReleases.forEach(function(release){release();});sourceReleases.clear();},
      };
    },
  }) : await evaluateMassProperties(snapshot,{
    bodyKey:function(part){return snapshot.metadata?.authoringSystem==="parametric-v1" && (snapshot.features || []).some(function(feature){return feature.id===part.featureId;}) ? cutTargetFeatureId(part,snapshot) : part;},
    // Part mass uses the worker's native integral/bounds proof and does not
    // need to deserialize a second BREP on the UI thread. Assembly placement
    // queries above still require the native shape for transformed bounds.
    buildSolid:async function(part){var display=await exactDisplayBody(part,snapshot,null,{massProperties:true,restoreMode:'mesh'});releases.set(display.brep,display.release);return display.brep;},
    releaseSolid:function(solid){releases.get(solid)?.();releases.delete(solid);},
  });
  if(E.evalCard!=="mass" || E.massEvaluation!==evaluation || !body.isConnected)return;
  if(massEvaluationChanged(evaluation)){syncMassPropertiesEvaluation();return;}
  function paintMass() {
    if(E.massEvaluation!==evaluation || E.evalCard!=="mass")return;
    if(massEvaluationChanged(evaluation)){syncMassPropertiesEvaluation();return;}
    body.textContent="";
    var system=massDisplaySystem(massDisplayUnits);
    var quantity=function(value,kind,precision){return (value*system[kind]).toPrecision(precision||7)+" "+system[kind+"Unit"];};
    var units=el("div","md-ops");
    [["si",t("massUnitsSi")],["mmg",t("massUnitsMmG")],["ips",t("massUnitsIps")]].forEach(function(pair){
      var button=btn(pair[1], function(){ massDisplayUnits=pair[0]; paintMass(); });
      if(pair[0]===massDisplayUnits) button.setAttribute("aria-pressed","true");
      units.appendChild(button);
    });
    body.appendChild(units);
    evalRow(body,t("massAccuracy"),t("massAccuracy_"+mass.accuracy));
    if (mass.bounds) evalRow(body,t("massOverallSize"),["x","y","z"].map(function(axis){return axis.toUpperCase()+" "+Number(((mass.bounds.max[axis]-mass.bounds.min[axis])*system.length).toFixed(4));}).join(" · ")+" "+system.lengthUnit);
    evalRow(body, t("massVolume"), quantity(mass.volumeCm3,"volume"));
    evalRow(body, t("massMass"), quantity(mass.massKg,"mass"));
    evalRow(body, t("massDensity"), mass.density == null ? t("massMixedDensity") : quantity(mass.density,"density",6));
    // Suppress quadrature noise at a symmetric body's zero coordinate.
    var massCoord=function(value){var v=value*system.length;return String(Math.abs(v)<1e-9?0:Number(v.toPrecision(7)));};
    /* "Report coordinate values relative to": the centre of mass expressed in a
       user coordinate system (origin plus possibly reversed axes). */
    var coordinateSystems=((evaluation.type==="assembly"?E.assembly:E.def).referenceGeometry || []).filter(function(r){return r.type==="coordinate_system";});
    var chosen=coordinateSystems.find(function(r){return r.id===massCoordinateSystemId;}) || null;
    if(coordinateSystems.length){
      var pick=el("select","md-input");
      pick.setAttribute("aria-label",t("massReportRelative"));
      var none=document.createElement("option");none.value="";none.textContent=t("massDefaultSystem");pick.appendChild(none);
      coordinateSystems.forEach(function(r){var o=document.createElement("option");o.value=r.id;o.textContent=r.name;if(chosen&&chosen.id===r.id)o.selected=true;pick.appendChild(o);});
      pick.addEventListener("change",function(){massCoordinateSystemId=pick.value;paintMass();});
      var pickRow=el("div","md-eval-row");pickRow.appendChild(el("span","",t("massReportRelative")));pickRow.appendChild(pick);body.appendChild(pickRow);
    }
    var com=mass.centerOfMass;
    if(chosen){
      com=centerOfMassInSystem(com,chosen);
    }
    evalRow(body, t("massCentre")+(chosen?" · "+chosen.name:""), "X "+massCoord(com.x)+"   Y "+massCoord(com.y)+"   Z "+massCoord(com.z)+" "+system.lengthUnit);
    (mass.bodies || []).forEach(function(row,index){
      var label=(row.componentName?row.componentName+" · ":"")+(row.materialName || t("massNoMaterial"));
      evalRow(body, t("massBodyRow")+" "+(index+1)+" · "+label, quantity(row.volume,"volume",6)+" · "+quantity(row.massKg||0,"mass",6)+" · "+quantity(row.density,"density",6));
      if(row.error) body.appendChild(el("div", "md-note", t("massBodyRow")+" "+(index+1)+": "+row.error));
      if(Number.isInteger(row.solidCount))evalRow(body,"Native solids · "+(row.componentName || t("massBodyRow")+" "+(index+1)),String(row.solidCount));
      if(row.solidCount>1)body.appendChild(el("div","md-note","Disconnected solids · "+row.solidCount+" in "+(row.componentName || t("massBodyRow")+" "+(index+1))));
    });
    if(mass.inertiaKgM2){
      evalRow(body,t("massInertia"),system.inertiaUnit);
      var inertiaScale=Math.max.apply(null,mass.inertiaKgM2.map(function(row){return Math.max.apply(null,row.map(Math.abs));}));
      mass.inertiaKgM2.forEach(function(row,i){evalRow(body,"XYZ"[i],row.map(function(v){return Math.abs(v)<=inertiaScale*1e-9?"0":(v*system.inertia).toPrecision(6);}).join("   "));});
    }
    if (mass.unmeasured) body.appendChild(el("div", "md-note", mass.unmeasured + " " + t("massUnmeasured")));
  }
  paintMass();
}

async function openImportedBundle(bundle) {
      if (!bundle || !bundle.mainModel || !Array.isArray(bundle.mainModel.parts)) throw new Error("Bundle has no main model");
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      var approved=documentOwnership();
      closeEvalCard();
      if (Array.isArray(bundle.assemblies) && bundle.assemblies.length) {
        if (!await saveAssemblies(bundle.assemblies,{mode:"merge"})) throw new Error(t("saveStorageFull"));
        // The library write yields. A form opened or typed into, or an edit made,
        // meanwhile was not part of the discard the user approved: ask again.
        if (!documentStillOwned(approved) && (!E.open || !await confirmDiscardDocument("unsavedOpen"))) return;
      }
      abandonDocumentExactWork();
      var active=activeProjectDocument(bundle);
      if(E.contextEdit){E.def=E.contextEdit.previousDef;E.contextEdit=null;}
      E.srcItem=null; E.sel=null; E.ssel=[]; E.topologySelection=[]; E.componentSel=[];
      if(active.type==="assembly") {
        assemblyOpenBaseline=cloneData(active.assembly);
        E.assembly=cloneData(compactAssemblyTopologySnapshots(resolvedLibraryAssembly(active.assembly)));
        setDocumentType("assembly");
      } else {
        E.def=migrateDefinition(bundle.mainModel);
        partHistoryMarker={savedEdit:0};
        libraryOpenBaseline=null;
        setDocumentType("part");
      }
      H.clear().seed(); markDocumentClean(); reconcileModelerDraft();
      syncHead(); refreshAll(); refreshLib(); setMode("3d"); fitPreview();
      flash("✓ " + t("bundleImported"));
}

let explodedPlaybackStop = null;

function openExplodedPlayback() {
  if(E.docType!=="assembly")return;
  if(explodedPlaybackStop)explodedPlaybackStop();
  const assembly=E.assembly;
  let view=assembly?.explodedViews?.find(item=>item.id===assembly.activeExplodedView) || assembly?.explodedViews?.[0];
  if(!view)return;
  assembly.activeExplodedView=view.id;
  let frame=0,progress=0,lastTime=0;
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;};
  const update=()=>{
    if(!isCurrent()){stop();return;}
    applyExplodedProgress(assembly,view.id,progress);
    E.pv?.grp?.traverse(object=>{
      const component=object._cadExplodeComponent;
      if(component){const tr=normalizeTransform(component),off=component.explodedOffset;object.position.set(tr.x+(off?.x||0),tr.y+(off?.y||0),tr.z+(off?.z||0));}
      if(object.userData.cadExplodeLine || object.userData.cadInterference !== undefined)object.visible=false;
    });
    E.pv?.render();
    syncExplodeCommandState();
    status.textContent=t(assemblyHasExplodedOffsets(assembly)?'assemblyExploded':'assemblyAssembled')+" · "+Math.round(progress*100)+"% · "+view.steps.length+" steps";
  };
  const inputs=openQuickForm({action:"explodeplay",presentationOnly:true,title:"Exploded animation",hint:"Play the saved steps in order. Stop pauses; Reset returns to the assembled position.",fields:[{key:"view",label:"Exploded view",type:"select",value:view.id,choices:assembly.explodedViews.map(item=>({value:item.id,label:item.name || item.id}))},{key:"duration",label:"Duration (seconds)",type:"number",value:view.animationDurationSeconds || Math.max(4,view.steps.length),step:1}],onApply:()=>true,onCancel:stop,onDismiss:()=>{stop();explodedPlaybackStop=null;}});
  const host=root.querySelector("#mdQuickSettings");
  if(!inputs || !host)return;
  explodedPlaybackStop=stop;
  const instance=E.quickFormInstance;
  const isCurrent=()=>E.quickFormInstance===instance && E.docType==="assembly" && E.assembly===assembly && !host.hidden;
  const duration=inputs.duration,actions=host.querySelector('.md-feature-actions');
  actions.innerHTML="";
  duration.addEventListener("change",()=>{if(!isCurrent())return;const seconds=Number(duration.value);if(Number.isFinite(seconds) && seconds>0 && seconds<=3600){pushUndo("Animation duration");view.animationDurationSeconds=seconds;instance?.rememberInputs();syncHead();}});
  const status=el("div","md-note",t(assemblyHasExplodedOffsets(assembly)?'assemblyExploded':'assemblyAssembled')+" · "+view.steps.length+" steps");host.appendChild(status);
  if(inputs.view)inputs.view.addEventListener("change",()=>{
    const selected=assembly.explodedViews.find(item=>item.id===inputs.view.value);
    if(!isCurrent() || !selected || selected===view)return;
    stop();pushUndo("Select exploded view");view=selected;assembly.activeExplodedView=view.id;
    duration.value=String(view.animationDurationSeconds || Math.max(4,view.steps.length));
    instance?.rememberInputs();progress=1;update();refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});fitPreview();syncHead();
  });
  const tick=time=>{
    if(!host.isConnected || !isCurrent()){stop();return;}
    if(lastTime)progress=Math.min(1,progress+(time-lastTime)/(Math.max(.1,Number(duration.value)||7)*1000));
    lastTime=time;update();
    if(progress<1)frame=requestAnimationFrame(tick);else{stop();status.textContent="Complete · "+view.steps.length+" steps";}
  };
  actions.appendChild(btn("Play",()=>{if(!isCurrent())return;stop();if(progress>=1)progress=0;update();frame=requestAnimationFrame(tick);},"md-quick-apply"));
  actions.appendChild(btn("Stop",()=>{if(!isCurrent())return;stop();status.textContent="Paused · "+Math.round(progress*100)+"%";}));
  actions.appendChild(btn("Reset",()=>{if(!isCurrent())return;stop();progress=0;update();}));
  actions.appendChild(btn("Close",()=>{if(!isCurrent())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});}));
  actions.appendChild(btn("New exploded view",()=>{if(isCurrent())createEmptyExplodedView();}));
}


var motionPlaybackCancel=null;
function openMotionPlayback(studyId) {
  const assembly=E.assembly,study=assembly?.motionStudies?.find(item=>item.id===studyId);
  if(E.docType!=="assembly" || !study)return;
  let playback,executor;const controls={};
  const cancel=()=>{playback?.cancel();if(motionPlaybackCancel===cancel)motionPlaybackCancel=null;};
  const inputs=openQuickForm({action:"motionplay",presentationOnly:true,title:"Motion playback · "+study.name,
    hint:"Preview the assembled mechanism using the saved motor and mates. Reset seeks time zero. Cancel restores the opening pose; Keep current pose commits it. The opening exploded view returns when this preview closes.",
    fields:[{key:"duration",label:"Preview duration (seconds)",type:"number",value:motionPreviewDuration(study),min:.1,step:.1}],onApply:()=>false,onCancel:cancel,onDismiss:cancel});
  const host=root.querySelector("#mdQuickSettings");if(!inputs || !host)return;
  const instance=E.quickFormInstance;
  const isCurrent=()=>E.quickFormInstance===instance && E.docType==="assembly" && E.assembly===assembly && !host.hidden;
  const status=el("div","md-note","Ready"),timeRow=el("label","md-row md-row-wide"),scrub=el("input");
  scrub.type="range";scrub.min="0";scrub.step=".01";scrub.setAttribute("aria-label","Motion time (seconds)");
  timeRow.appendChild(el("span","t","Time (seconds)"));timeRow.appendChild(scrub);host.append(timeRow,status);
  const showPose=()=>{
    if(!isCurrent())return;
    invalidateInterference();if(!refreshAssemblyPosePreview())updatePreview();
    renderPreview();syncDirty();
  };
  try {executor=createMotionPlaybackExecutor(assembly);}catch(error){flash(String(error.message||error));return;}
  playback=createMotionPlayback(assembly,studyId,{evaluate:executor.evaluate,requestFrame:callback=>requestAnimationFrame(callback),cancelFrame:id=>cancelAnimationFrame(id),
    isCurrent,
    onClose:()=>{executor.dispose();if(motionPlaybackCancel===cancel)motionPlaybackCancel=null;},
    beforeCommit:()=>pushUndo("Keep motion preview pose"),onPose:showPose,
    onState:state=>{scrub.max=String(state.duration);scrub.value=String(state.time);scrub.disabled=state.busy;inputs.duration.disabled=state.busy;
      if(controls.play)controls.play.disabled=state.busy || state.running;
      if(controls.reset)controls.reset.disabled=state.busy;
      if(controls.keep)controls.keep.disabled=state.busy || state.running;
      status.textContent=state.message+" · "+state.time.toFixed(2)+" / "+state.duration.toFixed(2)+" s";}
  });
  motionPlaybackCancel=cancel;
  showPose();
  const commitDuration=()=>{
    if(!isCurrent())return false;
    if(Number(inputs.duration.value)===playback.state.duration)return true;
    if(playback.setDuration(inputs.duration.value))return true;
    inputs.duration.value=String(playback.state.duration);return false;
  };
  inputs.duration.addEventListener("change",commitDuration);
  inputs.duration.addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commitDuration();}});
  scrub.addEventListener("input",()=>{if(!isCurrent())return;const time=Number(scrub.value);playback.pause();scrub.value=String(time);status.textContent="Time "+time.toFixed(2)+" s · release to solve";});
  scrub.addEventListener("change",()=>{if(!isCurrent())return;const time=Number(scrub.value);playback.pause();playback.seek(time);});
  const actions=host.querySelector('.md-feature-actions');actions.innerHTML="";
  controls.play=btn("Play",()=>{if(commitDuration())return playback.play();},"md-quick-apply");actions.appendChild(controls.play);actions.appendChild(btn("Pause",()=>playback.pause()));
  controls.reset=btn("Reset",()=>{if(commitDuration())return playback.reset();});actions.appendChild(controls.reset);
  controls.keep=btn("Keep current pose",()=>{if(!commitDuration() || !playback.keep())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});});actions.appendChild(controls.keep);
  actions.appendChild(btn("Cancel preview",()=>{if(!isCurrent())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});}));
}

/* A general-arrangement sheet: one outline per component where the mates put
   it, numbered against the bill of materials. The drawing module already draws
   any part it has no mesh for as its view rectangle, so an envelope per
   component is the fidelity a part sheet gets too, not a shortcut past it. */
function assemblyDrawingBOMRows() {
  return assemblyDrawingBOM(E.assembly,E.assembly?.drawingSettings?.bomScope).rows;
}
var assemblyBalloonCache=new WeakMap();
function assemblyDrawingBalloonTargets(owner = E.assembly) {
  if(!owner)return [];
  var bom=assemblyDrawingBOM(owner,owner.drawingSettings?.bomScope);
  var stamp=JSON.stringify(bom.rows),cached=assemblyBalloonCache.get(owner);
  if(cached?.token===E.sheetToken&&cached.stamp===stamp)return cached.targets;
  var targets=flattenAssembly(owner,{visibleOnly:true}).map(function(occurrence){
    var key=occurrenceBOMKey(occurrence.path),item=bom.itemByPath.get(key),def=componentDef(occurrence.component);
    return nativeOccurrenceBalloonTarget(occurrence,def?activeParts(def):[],item,explodedOccurrenceOffset(occurrence))
      || {key,path:occurrence.path.map(String),item,missing:true};
  });
  assemblyBalloonCache.set(owner,{token:E.sheetToken,stamp,targets});return targets;
}
function assemblyDrawingDocument() {
  var occurrences = flattenAssembly(E.assembly, { visibleOnly: true });
  /* One chosen numbering scope supplies both the table and leaf balloons. */
  var bom = assemblyDrawingBOM(E.assembly,E.assembly?.drawingSettings?.bomScope),rows=bom.rows;
  var parts = [], targets = [];
  /* The sheet shows the real bodies where the mates put them, moved by the
     active exploded view, not an envelope per component. */
  occurrences.forEach(function (occurrence) {
    var component = occurrence.component, placement = occurrence.placement;
    var blown = explodedOccurrenceOffset(occurrence);
    var def = componentDef(component);
    var bodies = def ? activeParts(def).filter(function (part) { return part.meshData && part.meshData.positions && part.meshData.positions.length >= 9; }) : [];
    var item = bom.itemByPath.get(occurrenceBOMKey(occurrence.path));
    if(item===undefined)return;
    var low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    if (!placement || !bodies.length) {
      var bounds = occurrenceWorldBounds(component,placement);
      if (!bounds) return;
      bounds={x0:bounds.x0+blown.x,x1:bounds.x1+blown.x,y0:bounds.y0+blown.y,y1:bounds.y1+blown.y,z0:bounds.z0+blown.z,z1:bounds.z1+blown.z};
      parts.push({ id: occurrence.path.join('/'), kind: "box", name: component.name || component.modelKey || component.assemblyKey, x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1, z0: bounds.z0, z1: bounds.z1 });
      targets.push({ item: item, point: { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2, z: (bounds.z0 + bounds.z1) / 2 } });
      return;
    }
    bodies.forEach(function (part) {
      var source = part.meshData.positions, baked = new Array(source.length);
      for (var i = 0; i + 2 < source.length; i += 3) {
        var px = Number(source[i]), py = Number(source[i + 1]), pz = Number(source[i + 2]);
        var point = [
          placement.origin.x + blown.x + placement.x.x * px + placement.y.x * py + placement.z.x * pz,
          placement.origin.y + blown.y + placement.x.y * px + placement.y.y * py + placement.z.y * pz,
          placement.origin.z + blown.z + placement.x.z * px + placement.y.z * py + placement.z.z * pz,
        ];
        for (var a = 0; a < 3; a++) { baked[i + a] = point[a]; if (point[a] < low[a]) low[a] = point[a]; if (point[a] > high[a]) high[a] = point[a]; }
      }
      parts.push({ id: occurrence.path.join('/') + ":" + part.id, name: component.name || component.modelKey || component.assemblyKey, meshData: { positions: baked, faceRanges: cloneData(part.meshData.faceRanges || []) } });
    });
    targets.push({ item: item, point: { x: (low[0] + high[0]) / 2, y: (low[1] + high[1]) / 2, z: (low[2] + high[2]) / 2 } });
  });
  return {
    def: { kind: "assembly", name: E.assembly.name || t("docAssembly"), parts: parts },
    targets: targets,
    balloons: rows.map(function (row) {
      return { item: row.item, name: row.name, description: row.description, partNumber: row.partNumber, material: row.material || "", qty: row.quantity };
    }),
  };
}

/* Export what Drawing mode shows. An unopened document has no sheet yet, so it
   gets the standard three-view one the exporter builds — the same engine, so
   the file and the screen can never drift apart. */
function showAssemblyDrawingSettings(focusNotes) {
  if (!E.assembly) return;
  root.querySelector("#mdAssemblySheetDialog")?.remove();
  var dialog = document.createElement("dialog");
  dialog.id = "mdAssemblySheetDialog";
  dialog.style.cssText = "max-width:min(34rem,90vw);max-height:85vh;overflow:auto;border-radius:12px;padding:1.2rem";
  dialog.appendChild(el("h2", "", "Assembly drawing"));
  var settings = E.assembly.drawingSettings || {};
  var fields = {};
  function textField(label, value) {
    var field = document.createElement("input");
    field.value = value || "";
    field.setAttribute("aria-label", label);
    fields[label] = sheetRow(dialog, label, field);
  }
  fields.size = sheetRow(dialog, "Sheet size", sheetSelect(Object.keys(SHEET_SIZES).map(function(key) {
    return { value: key, label: key === "Letter" ? "A (ANSI) Landscape / Letter" : key === "ANSI_C" ? "C (ANSI) / 22 × 17 in" : key };
  }), settings.size || "A3", function() {}));
  fields.size.setAttribute("aria-label", "Sheet size");
  fields.units = sheetRow(dialog, "Drawing units", sheetSelect(["mm", "cm", "in"].map(function(unit) {
    return { value: unit, label: unit };
  }), settings.units || "in", function() {}));
  fields.units.setAttribute("aria-label", "Drawing units");
  fields.scale = sheetRow(dialog, "Sheet scale", sheetSelect([
    { value:"fit", label:"Fit to sheet" }, { value:"1:1", label:"1:1" },
    { value:"2:1", label:"2:1" }, { value:"1:2", label:"1:2" }, { value:"1:4", label:"1:4" }
  ], Array.isArray(settings.scale) ? settings.scale.join(":") : "fit", function() {}));
  fields.scale.setAttribute("aria-label", "Sheet scale");
  fields.projection = sheetRow(dialog, "Projection", sheetSelect([
    { value:"third", label:"Third angle" }, { value:"first", label:"First angle" }
  ], settings.projection || "third", function() {}));
  fields.projection.setAttribute("aria-label", "Projection");
  fields.bomScope=sheetRow(dialog,t('drawingBOMScope'),sheetSelect([{value:'partsOnly',label:t('drawingBOMPartsOnly')},{value:'indented',label:t('drawingBOMIndented')}],settings.bomScope==='indented'?'indented':'partsOnly',function(){}));
  fields.bomScope.setAttribute('aria-label',t('drawingBOMScope'));
  ["Title", "Number", "Revision", "Drawn by", "Company", "Date", "Material", "Finish", "Mass"].forEach(function(label, index) {
    var key = ["title", "number", "revision", "author", "company", "date", "material", "finish", "mass"][index];
    textField(label, settings[key] || (key === "title" ? E.assembly.name : key === "revision" ? "A" : ""));
  });
  var notes=document.createElement("textarea");
  notes.value=settings.notes || "";notes.rows=5;notes.setAttribute("aria-label","Drawing notes");
  notes.style.cssText="width:100%;min-height:6rem;resize:vertical";
  fields.notes=sheetRow(dialog,"Drawing notes",notes);
  function apply() {
    var next = { size: fields.size.value, units: fields.units.value, scale: fields.scale.value === "fit" ? "fit" : fields.scale.value.split(":").map(Number), projection: fields.projection.value, bomScope:fields.bomScope.value==='indented'?'indented':'partsOnly', orientation:"landscape", draftingStandard:"ANSI", notes:fields.notes.value.trim() };
    ["Title", "Number", "Revision", "Drawn by", "Company", "Date", "Material", "Finish", "Mass"].forEach(function(label, index) {
      next[["title", "number", "revision", "author", "company", "date", "material", "finish", "mass"][index]] = fields[label].value.trim();
    });
    var properties = {customProperties: {...(E.assembly.customProperties || {})}};
    ["Number", "Revision", "DrawnBy", "CompanyName", "DrawnDate", "Description"].forEach(function(key, index) {
      setDocumentProperty(properties, key, next[["number", "revision", "author", "company", "date", "title"][index]]);
    });
    if (JSON.stringify(E.assembly.drawingSettings || {}) === JSON.stringify(next)
      && JSON.stringify(E.assembly.customProperties || {}) === JSON.stringify(properties.customProperties || {})) return;
    pushUndo("Assembly drawing settings");
    E.assembly.drawingSettings = next;
    if (properties.customProperties) E.assembly.customProperties = properties.customProperties;
    else delete E.assembly.customProperties;
    syncHead();refreshAll();
  }
  var save = el("button", "", "Apply drawing settings");
  save.type = "button";
  save.onclick = function() { apply(); dialog.close(); };
  var output = el("button", "", "Export drawing SVG");
  output.type = "button";
  output.onclick = function() { apply(); exportDrawingSvg(); dialog.close(); };
  var preview = el("button", "", "Preview drawing");
  preview.type = "button";
  preview.onclick = async function() { apply(); if(await showDrawingPreview())dialog.close(); };
  var edit = el("button", "", "Open native Drawing");
  edit.type = "button";
  edit.onclick = function() { apply(); dialog.close(); setMode("drawing"); };
  var cancel = el("button", "", "Cancel");
  cancel.type = "button";
  cancel.onclick = function() { dialog.close(); };
  dialog.append(save, edit, preview, output, cancel);
  dialog.addEventListener("close", function() { dialog.remove(); }, { once:true });
  root.appendChild(dialog);
  dialog.showModal();
  if(focusNotes)notes.focus();
}

async function exportThreeMfDocument(settings,format,unqualifiedDraft) {
  format=format==="amf" ? "amf" : "3mf";
  if(E.docType!=="part" || !standardsGate(format.toUpperCase()+" export",{unqualifiedDraft:unqualifiedDraft===true,onDraft:function(){exportThreeMfDocument(settings,format,true);}}))return;
  try {
    var run=exactRunIsCurrent() ? E.brepRun : await regenerateExactModel();
    if(!run || !run.ok || !run.finalShape)throw new Error("The exact model must rebuild successfully before export");
    var name=(E.def?.name || "model")+(unqualifiedDraft===true?"__UNQUALIFIED_DRAFT":"");
    var bytes=format==="amf" ? await exportAmf(run.finalShape,name,settings) : await exportThreeMf(run.finalShape,name,settings);
    downloadBytes(bytes,name+"."+format,format==="amf" ? "application/xml" : "model/3mf");
    flash("✓ "+format.toUpperCase()+" exported · millimeters · Z-up");
  } catch(error) {flash(format.toUpperCase()+" export failed: "+String(error.message || error),6000);}
}

function drawingSvgContent() {
  var svg;
  if(E.docType==='assembly' && E.assembly?.drawing) svg=drawingSheet().svg();
  else if (E.docType === "assembly" && E.assembly) {
    var sheet = assemblyDrawingDocument();
    if (!sheet.def.parts.length) throw new Error(t("noComponents"));
    sheet.def.customProperties = E.assembly.customProperties || {};
    svg = sceneToSvg(buildDrawingScene(sheet.def, { requireFit:true, ...(E.assembly.drawingSettings || {}), balloons: sheet.balloons, balloonTargets: sheet.targets, explodeLines: assemblyExplodeLines(), overallDimensions: false, views: ["iso"], title: E.assembly.drawingSettings?.title || E.assembly.name, useStored: false }));
  } else if (E.mode === "drawing" || (E.def && E.def.drawing)) svg = drawingSheet().svg();
  else svg = sceneToSvg(buildDrawingScene(E.def, { section: true, holeCallouts: true, useStored: false }));
  return svg;
}

function drawingSvgFilename() {
  return ((E.docType === "assembly" && E.assembly ? E.assembly.name : E.def && E.def.name) || "drawing").replace(/[^a-z0-9_-]+/gi, "_") + ".svg";
}

async function showDrawingPreview() {
  if(rejectFlexibleSpringPreview())return false;
  var svg;
  try { await prepareConfiguredDrawingExport();svg = drawingSvgContent(); } catch(error) { flash(String(error.message || error),6000);return false; }
  root.querySelector("#mdDrawingPreviewDialog")?.remove();
  var dialog=document.createElement("dialog");
  dialog.id="mdDrawingPreviewDialog";
  dialog.setAttribute("aria-label","Drawing preview");
  dialog.style.cssText="width:min(94vw,110rem);max-width:94vw;max-height:92vh;overflow:auto;border-radius:12px;padding:1rem";
  dialog.appendChild(el("h2","","Drawing preview"));
  var sheet=el("div","md-drawing-preview");
  // Only the app's SVG writer supplies this markup. This is the exact exported
  // sheet, including its paper dimensions, title block, BOM and notes.
  sheet.innerHTML=svg;
  var rendered=sheet.querySelector("svg");
  if(rendered){rendered.style.width="100%";rendered.style.height="auto";rendered.setAttribute("aria-label","Drawing sheet");}
  var url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  var download=el("a","btn","Download SVG");
  download.href=url;download.download=drawingSvgFilename();
  var close=el("button","","Close preview");close.type="button";close.onclick=function(){dialog.close();};
  dialog.append(download,close,sheet);
  dialog.addEventListener("close",function(){URL.revokeObjectURL(url);dialog.remove();},{once:true});
  root.appendChild(dialog);dialog.showModal();
  return true;
}

async function exportDrawingSvg() {
  if(rejectFlexibleSpringPreview())return;
  var svg;
  try { await prepareConfiguredDrawingExport();svg = drawingSvgContent(); } catch(error) { flash(String(error.message || error),6000);return; }
  var blob = new Blob([svg], { type: "image/svg+xml" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = drawingSvgFilename();
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  flash(t("drawExported"));
}

/* Print the sheet at its true paper size: the SVG is metric millimetres, so a
   browser print with no margins puts an A3 drawing on A3 paper. */
async function printDrawingSheet() {
  if(rejectFlexibleSpringPreview())return;
  var svg;try{await prepareConfiguredDrawingExport();svg=drawingSheet().svg();}catch(error){flash(String(error.message||error),6000);return;}
  var frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  document.body.appendChild(frame);
  var doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { flash(t("drawPrintFailed")); frame.remove(); return; }
  doc.open();
  doc.write("<!doctype html><meta charset='utf-8'><style>@page{margin:0}html,body{margin:0;padding:0}svg{display:block}</style>" + svg);
  doc.close();
  var done = function () {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (error) { flash(t("drawPrintFailed")); }
    setTimeout(function () { frame.remove(); }, 1000);
  };
  if (doc.readyState === "complete") done(); else frame.addEventListener("load", done);
}

/* A bill of materials is a table, and it was a column of space-padded text in
   a modal <pre>. Same counts — generateBOM still does the counting — rendered
   as rows you can read, copy and export. */
function showAssemblyBOM() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var rows = bomTableRows(generateBOM(E.assembly), E.assembly.components || []);
  var body = openEvalCard("bom", t("cmdAssembly"), t("billOfMaterials"));
  if (!body) return;
  if (!rows.length) { body.appendChild(el("div", "md-note", t("bomEmpty"))); return; }
  var withMaterial = rows.some(function (row) { return !!row.material; });
  var headers = [t("bomItem"), t("bomQty"), t("bomName"), t("material")];
  var table = el("table", "md-bom");
  var head = el("tr", "");
  headers.slice(0, withMaterial ? 4 : 3).forEach(function (caption) { head.appendChild(el("th", "", caption)); });
  var thead = el("thead", "");
  thead.appendChild(head);
  table.appendChild(thead);
  var tbody = el("tbody", "");
  rows.forEach(function (row) {
    var tr = el("tr", "");
    tr.appendChild(el("td", "md-bom-item", String(row.item)));
    tr.appendChild(el("td", "md-bom-qty", String(row.quantity)));
    var name = el("td", "");
    name.textContent = row.name;
    tr.appendChild(name);
    if (withMaterial) {
      var material = el("td", "");
      material.textContent = row.material;
      tr.appendChild(material);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  var actions = evalCardActions();
  if (!actions) return;
  var csv = function () { return bomCsv(rows, headers, withMaterial); };
  actions.appendChild(btn('<i class="ph ph-copy"></i> ' + t("bomCopy"), function () {
    if (!navigator.clipboard || !navigator.clipboard.writeText) { flash(t("bomCopyFailed")); return; }
    navigator.clipboard.writeText(csv()).then(
      function () { flash(t("bomCopied")); },
      function () { flash(t("bomCopyFailed")); }
    );
  }));
  actions.appendChild(btn('<i class="ph ph-file-csv"></i> ' + t("bomCsvExport"), function () {
    downloadBytes(csv(), (E.assembly.name || "assembly") + "-bom.csv", "text/csv");
  }));
}

function importStepDocument() {
  if (E.docType !== "part") return;
  var input = document.createElement("input"); input.type = "file"; input.accept = ".step,.stp,model/step";
  input.addEventListener("change", async function () {
    var file = input.files && input.files[0]; if (!file) return;
    flash(t("kernelBusy"));
    try {
      var bytes=new Uint8Array(await file.arrayBuffer());
      var declaredUnit=detectStepLengthUnit(bytes);
      var unitOverride=(root.querySelector("#mdStepUnit") || {}).value || "auto";
      var unitScale=stepUnitCorrection(declaredUnit,unitOverride);
      var shape = await importStep(bytes, file.name);
      extractBrepTopology(shape, {ownerFeatureId:"feature:import:" + file.name.replace(/[^a-z0-9_-]+/gi,"_")});
      var meshData=await shapeToMeshData(shape,{deflection:.22,angle:.16});
      meshData.topology=cloneData(shape.topology || []);
      var imported=createImportedDefinition({
        name:file.name.replace(/\.(step|stp)$/i,""),sourceName:file.name,format:"step",size:file.size,importedAt:Date.now(),sourceUnit:unitOverride === "auto" ? declaredUnit : unitOverride,declaredUnit:declaredUnit,unitOverride:unitOverride,unitScale:unitScale,meshData:meshData,topology:shape.topology || [],
      });
      var canonicalShape=await transformBrep(shape,imported.metadata.import.sourceTransform);
      disposeBrep(shape); shape=null;
      extractBrepTopology(canonicalShape,{ownerFeatureId:imported.features[imported.features.length-1].id,expectedTopology:imported.parts[0].meshData && imported.parts[0].meshData.topology || []});
      if (imported.authoringMode === "direct-only") {
        var exactPayload=encodeBinaryPayload(await serializeBrep(canonicalShape,file.name.replace(/\.(step|stp)$/i,".brep")),{format:"brep",mediaType:"model/vnd.opencascade.brep"});
        imported.parts[0].sourcePayload=exactPayload;
        imported.parts[0].importSource=cloneData(imported.metadata.import);
        imported.features[0].params.sourcePayload=cloneData(exactPayload);
        imported.metadata.import.exactSource={format:"brep",byteLength:exactPayload.byteLength,checksum:exactPayload.checksum};
      }
      releaseExactRun();
      if (!activeParts(E.def).length) {
        imported.key=E.def.key; imported.id=E.def.id || E.def.definitionId || E.def.key; imported.definitionId=imported.id;
        imported.price=E.def.price || 0; E.def=imported;
      } else {
        var suffix=uid(),importedParts=cloneData(imported.parts || []);
        importedParts.forEach(function(importedPart){importedPart.id+="-"+suffix;importedPart.featureId+="-"+suffix;delete importedPart.parametricEnvelope;if(importedPart.meshData&&Array.isArray(importedPart.meshData.topology))importedPart.meshData.topology.forEach(function(entry){entry.ownerFeatureId=importedPart.featureId;entry.persistentId=importedPart.featureId+":"+entry.kind+":"+uid();});E.def.parts.push(importedPart);});
        E.def.sketches=(E.def.sketches || []).concat(cloneData(imported.sketches || []));
        E.def.metadata=E.def.metadata || {}; E.def.metadata.imports=(E.def.metadata.imports || []).concat([imported.metadata.import]);
        E.def.authoringMode=inferAuthoringMode(Object.assign({},E.def,{authoringMode:null}));
        normalizeDef(E.def); rebuildFeatureTreeFromDocument();
      }
      disposeBrep(canonicalShape); canonicalShape=null;
      E.brepRun=await regenerateFeatures(E.def);
      if (!E.brepRun.ok || !E.brepRun.finalShape) throw new Error(rebuildFailureMessage(E.brepRun.issues, "Imported exact body could not rebuild"));
      E.def.importedStep = cloneData(imported.metadata.import);
      E.sel=E.def.parts[E.def.parts.length-1]; E.ssel=[]; E.topologySelection=[];
      H.clear().seed(); partHistoryMarker.savedEdit=null; scheduleModelerDraft();
      syncHead(); refreshAll(); setMode("3d"); fitPreview();
      // Stamped after the history is reseeded, so the run matches the revision
      // the freshly imported document actually starts on.
      E.brepStamp = exactRunStamp();
      flash("✓ " + tf("stepImported", {
        file: file.name,
        recognition: imported.metadata.import.recognition === "none" ? t("stepDirectOnly") : tf("stepRecognized", {mode: imported.metadata.import.recognition}),
        units: unitOverride === "auto" ? tf("stepUnitsDeclared", {unit: declaredUnit}) : tf("stepUnitsOverride", {unit: unitOverride}),
      }));
    } catch (error) {
      if (shape) disposeBrep(shape);
      if (canonicalShape) disposeBrep(canonicalShape);
      flash(t("errStep") + ": " + String(error.message || error));
    }
  });
  input.click();
}

const exactSaveCache=createExactSaveCache();
function refreshSavedPartMeshes(def) {
  var savedParts = [];
  (def.parts || []).forEach(function(savedPart){
    var livePart=(E.def.parts || []).find(function(part){return part.id===savedPart.id;});
    if(!livePart || !savedPart.meshData)return;
    var scheduled=exactBuildTimers.get(livePart);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(livePart);}
    livePart.exactBuildToken=(livePart.exactBuildToken || 0)+1;
    livePart.meshData=cloneData(savedPart.meshData);
    if(isKernelBody(livePart))livePart.bounds=cloneData(savedPart.meshData.bounds);
    livePart.exactPending=false;livePart.exactError=null;
    clearTopologyCache(livePart);
    savedParts.push(livePart);
  });
  refreshChangedParts(savedParts);
}

async function saveModel() {
  if(E.contextEdit){
    const session=assemblySaveSession(E.assembly);
    if(!await finishContextPart())return;
    // The user's Save includes the finished edit. An earlier assembly write
    // must advance the baseline before this newer snapshot is submitted.
    const pending=documentSaveTasks.get(session);
    if(pending)await pending;
    if(E.docType==="assembly" && assemblySaveSession(E.assembly)===session)return saveCurrentDocument();
    reconcileModelerDraft();
    return;
  }
  /* Save validates its own snapshot with an authoritative exact rebuild below.
     A display restoration can remain pending after its worker has finished;
     waiting on that unrelated publication barrier prevented any library write,
     even though independent exact evaluation rebuilt the current history.
     Derived display caches are not authored inputs to this save. */
  ensureSketchDoc(E.def);
  if (!hasSaveableModelContent(E.def)) { flash(t("needParts")); return; }
  if (!standardsGate("Save")) return;
  /* Which document this save is FOR. Attachment externalization and the
     library write below are both awaited, and openModeler() is synchronous —
     a library card clicked in that window swaps E.def out from under the tail
     of this function. See the guard before markDocumentClean(). */
  var savingDoc = E.def, savingItem = E.srcItem, savingNode = currentHistoryNode();
  var savingGeneration = H.generation;
  var savingEdit = H.editRevision("part"), savingSession=partHistoryMarker;
  var expectedRecord=cloneData(libraryOpenBaseline);
  E.def.name = root.querySelector("#mdName").value || E.def.name;
  setDocumentDescription(E.def, root.querySelector("#mdDescription").value);
  E.def.price = +root.querySelector("#mdPrice").value || 0;
  // Canonical documents already own their feature history.  Reconstructing it
  // from render parts here would discard design intent; only legacy-adapter
  // documents pass through the compatibility projection.
  var recognizedHistory=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition && E.def.metadata.import.recognition!=="none";
  var canonical=isCanonicalAuthoring();
  if (!canonical && !(E.def.metadata && E.def.metadata.adapter === "cabinet") && !recognizedHistory) rebuildFeatureTreeFromDocument();
  pruneAbandonedSketches(E.def);
  if(canonical)rebindReplacedSketchProfiles(E.def);
  var def = JSON.parse(JSON.stringify(E.def));
  pruneSketchTargetedBodyAppearances(def);
  pruneSketchMaterialFields(def);
  // Canonical sketches and face references own their coordinate system.
  // Recentring a rendered bounding box on save invalidates those references.
  if (!canonical) normalizeDef(def);
  if (def.metadata && def.metadata.adapter === "cabinet" && E.srcItem && E.srcItem.cab) def=finalizeCabinetAdvancedDefinition(def,E.srcItem);
  else if(!canonical && !recognizedHistory) rebuildFeatureTreeFromDocument(def);
  def.authoringMode=inferAuthoringMode(Object.assign({},def,{authoringMode:null}));
  def.definitionId = E.def.definitionId || E.def.id || def.key;
  def.id = def.definitionId;
  if(canonical){
    var saveCompiled=compileKernelFeatureTree(def),saveRun,saveGeometryReused=false;
    saveProgress("saveRebuilding",savingDoc);
    try{
      if(!saveCompiled.ok)throw new Error(saveCompiled.issues[0]?.message || "Invalid feature history");
      saveRun=exactSaveCache.get(savingDoc,saveCompiled);
      saveGeometryReused=!!saveRun;
      if(saveGeometryReused)saveProgress("saveReusingGeometry",savingDoc);
      saveRun=saveRun || await regenerateFeatures({...saveCompiled.document,features:saveCompiled.features},{restoreMode:'mesh',onProgress:function(progress){if(E.def===savingDoc)flash(t("saveRebuilding")+" · "+(progress.name || progress.stage));}});
      if(!saveRun.ok)throw new Error(saveRun.issues.find(function(issue){return issue.code==='regeneration-failed' || issue.severity==='error';})?.message || "The model could not rebuild");
      def.exactTopologyCache=captureExactTopology(def,saveCompiled.features,saveRun);
      var savedReferenceRepairs=applyDocumentTopologyRebindings(def,saveRun.topologyBindings);
      if(savedReferenceRepairs.length){
        saveGeometryReused=false;
        def.topologyBindings=(def.topologyBindings || []).concat(savedReferenceRepairs.map(function(entry){return Object.assign({savedAt:Date.now()},entry);}));
        releaseRegeneration(saveRun); saveRun=null;
        saveCompiled=compileKernelFeatureTree(def);
        if(!saveCompiled.ok)throw new Error(saveCompiled.issues[0]?.message || "Invalid repaired feature history");
        saveRun=await regenerateFeatures({...saveCompiled.document,features:saveCompiled.features},{restoreMode:'mesh'});
        if(!saveRun.ok)throw new Error(saveRun.issues.find(function(issue){return issue.severity==='error';})?.message || "Repaired model could not rebuild");
        def.exactTopologyCache=captureExactTopology(def,saveCompiled.features,saveRun);
      }
      // Save already owns a validated exact run. Preserve its display result
      // with the record instead of depending on a separate background restore,
      // which may have been cancelled while the user continued authoring.
      await publishExactBodies(activeParts(def),saveRun,def,async function(body){
        var mesh=body.verifiedSerializedExact===true ? cloneData(body.workerMeshData) : await shapeToMeshData(body,{deflection:.28,angle:.18});
        mesh.topology=cloneData(body.topology || []);
        mesh.bounds=meshDataBounds(mesh.positions);
        delete mesh.normals;delete mesh.colors;
        return mesh;
      });
      exactSaveCache.put(savingDoc,saveCompiled,saveRun);
    }catch(error){report(t("reportKickerSave"),t("saveRebuildFailed"),String(error.message || error));return;}
    finally{if(saveRun)releaseRegeneration(saveRun);}
  }
  var validation = canonical ? rebuildParametricDocument(def,modelParameterOverrides()) : rebuildDefinition(def, modelParameterOverrides());
  E.coreRun = validation;
  if (!validation.ok) {
    var failures = validation.issues.filter(function (issue) { return issue.severity === "error"; });
    report(t("reportKickerSave"), t("saveRebuildFailed"), failures.slice(0, 6).map(function (issue) { return "• " + (issue.message || issue.code); }));
    refreshParts();
    return;
  }
  var reboundAudit = canonical ? [] : applyTopologyRebindings(validation.topologyBindings);
  if (reboundAudit.length) {
    def.topologyBindings = (def.topologyBindings || []).concat(reboundAudit.map(function (entry) { return Object.assign({ savedAt: Date.now() }, entry); }));
    validation = canonical ? rebuildParametricDocument(def,modelParameterOverrides()) : rebuildDefinition(def, modelParameterOverrides());
    E.coreRun = validation;
  }
  saveProgress("saveAttachments",savingDoc);
  try { def=await externalizeAttachments(def); }
  catch (error) {
    report(t("reportKickerSave"), t("saveAttachmentFailed"), String(error.message || error));
    return;
  }
  var savedAsCopy=false;
  saveProgress("saveWritingLibrary",savingDoc);
  if (!await saveLib(def,{expected:expectedRecord})) {
    if (!lastLibrarySaveConflict) {
      report(t("reportKickerSave"), t("saveLibraryFailed"), lastLibrarySaveError ? String(lastLibrarySaveError.message || lastLibrarySaveError) : t("saveStorageFull"));
      return;
    }
    // A restored legacy draft may have no saved-record baseline. An edit in
    // another tab also leaves our baseline stale. In either case, preserve the
    // record already in the library and offer to save this live document under
    // a fresh key. The new-key write is itself optimistic (expected:null).
    if (E.def !== savingDoc || currentHistoryNode() !== savingNode) return;
    if (!await askModelerDecision(root, {
      title:t("saveLibraryConflictTitle"), message:t("saveLibraryConflictOffer"),
      accept:t("saveConflictCopyAction"), cancel:t("keepEditingAction"),
    })) return;
    var defaultCopyName=(def.name || t("newModel"))+" copy";
    var copyAnswer=await sheetForm(t("saveConflictCopyAction"),[{key:"name",label:t("name"),value:defaultCopyName}],t("saveCopyHint"));
    if (!copyAnswer || !copyAnswer.name) return;
    if (E.def !== savingDoc || currentHistoryNode() !== savingNode) return;
    var copy=forkConflictingModel(def,"cm_"+Date.now().toString(36)+"_"+uid(),copyAnswer.name);
    if (!await saveLib(copy,{expected:null})) {
      report(t("reportKickerSave"),t("saveLibraryFailed"),lastLibrarySaveError ? String(lastLibrarySaveError.message || lastLibrarySaveError) : t(lastLibrarySaveConflict ? "saveCopyKeyConflict" : "saveStorageFull"));
      return;
    }
    def=copy;
    savedAsCopy=true;
    // A placed instance still belongs to the original definition. This save
    // creates an independent library model and opens that copy in the editor.
    savingItem=null;
  }
  const sameSession=partHistoryMarker===savingSession;
  const residentPart=E.contextEdit?.previousDef || E.def;
  if(sameSession){
    if(savedAsCopy && residentPart===savingDoc && H.generation===savingGeneration && H.editRevision("part")===savingEdit){
      // A new library identity invalidates any restore queued for the original
      // record, even though this live object and its history node are unchanged.
      cancelExactModelRebuild();releaseExactRun();E.exactRestoring=false;
      residentPart.key=def.key;
      residentPart.id=def.id;
      residentPart.definitionId=def.definitionId;
      residentPart.name=def.name;
      E.srcItem=null;
      if(E.docType==="part" && !E.contextEdit)root.querySelector("#mdName").value=def.name;
    }
    if(residentPart?.key===def.key){
      libraryOpenBaseline=cloneData(def);
      savingSession.savedEdit=savingEdit;
    }
  }
  registerCustomModel(def);
  if (def.metadata && def.metadata.adapter === "cabinet" && savingItem) {
    savingItem.w = def.w; savingItem.d = def.d; savingItem.h = def.h;
    savingItem.cab = cloneDomain(def.metadata.cabSpec);
    savingItem.parameterOverrides = Object.assign({}, savingItem.parameterOverrides, { width: def.w, depth: def.d, height: def.h });
  }
  var committed = commitDefinition(S, def);
  if (savingItem || committed.affected.length) markPlannerDirty();
  refreshCatalogSelect();
  refreshLib();
  var sel = document.getElementById("furnsel");
  if (sel) sel.value = def.key;
  // Every linked instance sees the new shared definition. Cabinet instances
  // keep their semantic spec, interactions and dynamic BOM/pricing adapter.
  committed.affected.forEach(function (item) {
    if (def.metadata && def.metadata.adapter === "cabinet") {
      var open = item.cab && item.cab.open || 0;
      item.cab = cloneDomain(def.metadata.cabSpec); item.cab.open = open;
    }
    item.type = def.key;
    item.w = item.parameterOverrides && fin(item.parameterOverrides.width) ? item.parameterOverrides.width : def.w;
    item.d = item.parameterOverrides && fin(item.parameterOverrides.depth) ? item.parameterOverrides.depth : def.d;
    item.h = item.parameterOverrides && fin(item.parameterOverrides.height) ? item.parameterOverrides.height : def.h;
  });
  if (savingItem && committed.affected.indexOf(savingItem) === -1 && S.items.indexOf(savingItem) !== -1) {
    savingItem.definitionId = def.id;
    savingItem.type = def.key;
  }
  render2D();
  S.dirty3D = true; // placed instances of an edited model rebuild with new geometry
  import("./ui_props.js").then(function (ui) { ui.fillProps(); });
  /* Everything above is about the document that was written and holds however
     long the awaits took. Everything below is editor state, and the editor may
     have moved on: marking clean and discarding the recovery draft would then
     be done to a document nobody saved, throwing away its only backup. The
     history node is part of the check because an edit made DURING the save is
     genuinely not in the bytes that were written. */
  if (E.def !== savingDoc || E.srcItem !== savingItem || currentHistoryNode() !== savingNode ||
      H.generation !== savingGeneration || H.editRevision("part") !== savingEdit || E.docType !== "part") {
    if(sameSession)reconcileModelerDraft();
    flash("✓ " + tf("savedNamed", { name: def.name || def.key }));
    return;
  }
  /* Save runs its own authoritative rebuild. Publish that same result back to
     the open document before declaring it clean, otherwise the status footer
     can say success while the tree keeps red diagnostics from an earlier
     failed Force Rebuild. */
  if(canonical){
    E.exactDiagnosticRun=null;
    // The first pass repaired references on the saved clone; mirror those
    // accepted references into the still-open document after the write.
    if(savedReferenceRepairs?.length){
      E.def.features=cloneDomain(def.features);
      E.def.sketches=cloneDomain(def.sketches);
      E.def.topologyBindings=cloneDomain(def.topologyBindings);
    }
    E.def.exactTopologyCache=cloneDomain(def.exactTopologyCache);
    // This guard above also covers edits made during Save. Cancel stale mesh
    // publications before showing the exact geometry that was actually saved.
    refreshSavedPartMeshes(def);
  }
  publishRebuildStatus(E.def,E.coreRun);
  refreshModelHistoryPane();
  refreshParts();
  syncCoach();
  var savedButton=root && root.querySelector("#mdSave");
  if(savedButton && canonical)savedButton.dataset.exactSaveValidation=saveGeometryReused?"reused":"rebuilt";
  flash("✓ " + t("saved") + (canonical ? " · " + t(saveGeometryReused ? "saveGeometryReused" : "saveGeometryValidated") : ""));
  markDocumentClean();
  reconcileModelerDraft();
  if (savingDoc.lastStandardsAudit && !savingDoc.lastStandardsAudit.ok) {
    report(t("reportKickerStandards"), "Draft saved · qualification incomplete",
      ["The editable draft is saved. Its standards audit has not passed; qualified manufacturing exports remain blocked."]
        .concat(savingDoc.lastStandardsAudit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; })));
  }
}

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
