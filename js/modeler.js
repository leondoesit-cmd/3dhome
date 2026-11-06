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
export { activeParts };
export { registerCustomModel };
export { findVisibleEnabledCoachTarget };
// for js/modeler/drawing_sheet.js (live bindings: it sees every reassignment)
export {
  assemblyDrawingBOMRows, assemblyDrawingBalloonTargets, axisOfView,
  buildPart, currentHistoryNode, invalidatePartMeshAfterEdit, newModel,
  partUV, pathSketchSpline, pathUvCircleArc, pathUvEllipse, planeAxis,
  positiveArcSweep, queueExactMesh, sameSketchContext, scheduleExactMesh,
  standardPlaneFrame, strokeUvCircle, strokeUvRect, syncHead,
};
// for js/modeler/dimension_entry.js (live bindings: it sees every reassignment)
export {
  SKETCH_MAX_SCALE, SKETCH_MIN_SCALE, activeSketchFrame, applyCut,
  closeReport, cutSkipNote, doRedo, doUndo, drawSketch, drawingSheet,
  finishPoly, hitPart, invalidateSketchProjection, modelerTouchDistances,
  moveInView, partEditableInSketch, reportOpen, resolveTopologyPick,
  scheduleModelerDraft, sketchProjection, snapPt, snapV, solveAssembly, toPx,
  toUV, worldToSketchPx,
};
// for js/modeler/sketch_guide.js (live bindings: it sees every reassignment)
export {
  E, H, closedSketchProfile, flash, invalidateInterference, newDef,
  newSketchPoint, openParametricFeature, pushUndo, refreshAll, root,
  saveAssemblies, saveAssemblyDocument, setMode,
};
// for js/modeler/document_outputs.js (live bindings: it sees every reassignment)
export {
  explodedPlaybackStop, openExplodedPlayback, openImportedBundle,
  openMotionPlayback, showMassProperties,
};
// for js/modeler/export_measure.js (live bindings: it sees every reassignment)
export {
  BODY_OPERATIONS, FINISH_AMOUNT_KEY, THREE_POINT_KEYS, emitPartMerges,
  emitPartPatternTurn, exactBuildTimers, exactRebuildQueue, exactSaveCache,
  exportThreeMfDocument, forceRebuildDocument, pendingCutController,
};
// for js/modeler/library_panel.js (live bindings: it sees every reassignment)
export { applyAssemblyMates, assemblyPreviewSolved, decoGroups };
// for js/modeler/viewport_input.js (live bindings: it sees every reassignment)
export {
  assemblyComponentById, beginAssemblyComponentDrag, beginBoxSelectDrag,
  beginSmartMateDrag, instantScratch, pickOwnerChain,
  rawTopologyPickCandidate, refreshSelection,
};
// for js/modeler/notes_markups.js (live bindings: it sees every reassignment)
export { SVG_NS, drawMarkupsOverlay, noteScratch, refreshDecorations };
// for js/modeler/inspector.js (live bindings: it sees every reassignment)
export {
  CONSTRAINT_DEFS, DIMENSION_SYMBOLS, fillCabinetParameters, fillOps,
  inspectorDirty, materialValidationTools, numRow, openFeatureEditor,
  openSketchRepairs, saveModelerPrefs,
};
// for js/modeler/component_mates.js (live bindings: it sees every reassignment)
export {
  MATE_PALETTE, PLANE_NAME_KEYS, acceptRackPinionSolve,
  assemblyMateInspectorBody, configuredComponentBuilds,
  mateReferenceRefreshes, mateTopologyMemo, redrawTrackedUpdates,
  requestDocumentType, syncDirty,
};
// for js/modeler/feature_tree.js (live bindings: it sees every reassignment)
export { PATTERN_MERGE_PREVIEW_DELAY };
// for js/modeler/tree_assembly.js (live bindings: it sees every reassignment)
export {
  FINISH_FEATURES, assemblyLibraryCache, exactDisplayBody, modelLibraryCache,
  patternPlacements, scheduleKernelBody,
};
// for js/modeler/sketch_dimension_editor.js (live bindings: it sees every reassignment)
export { RELATION_REFUSAL_MS };
// for js/modeler/sketch_entities.js (live bindings: it sees every reassignment)
export {
  SKETCH_ENTITY_TYPES, documentDirty, queueKernelBody,
  syncExactWorkerActivity,
};
// for js/modeler/welcome_coach.js (live bindings: it sees every reassignment)
export { WELCOME_STARTS };
// for js/modeler/view_modes.js (live bindings: it sees every reassignment)
export { swapView };
// for js/modeler/document_save.js (live bindings: it sees every reassignment)
export {
  assemblySaveSession, documentSaveTasks, markDocumentClean,
  motionPlaybackCancel, partHistoryMarker, refreshLib, saveLib, saveModel,
  syncDraftStatus,
};
// for js/modeler/command_manager.js (live bindings: it sees every reassignment)
export { COMMAND_TOOLTIP, confirmDiscardDocument, syncUndoButtons };
// for js/modeler/finish_preview.js (live bindings: it sees every reassignment)
export { PATTERN_IDENTITY_PLACEMENT, REPEATABLE_AMOUNT };
// for js/modeler/feature_create.js (live bindings: it sees every reassignment)
export { addKernelBodyPart, insertToolboxFastener, lastToolboxPick };
// for js/modeler/part_commands.js (live bindings: it sees every reassignment)
export {
  exportDrawingSvg, importStepDocument, openFitCheckForm, openRackGearForm,
  patternCurveSketch, resolvePatternCurvePath, showAssemblyBOM,
  showAssemblyDrawingSettings,
};
// for js/modeler/sketch_workflow.js (live bindings: it sees every reassignment)
export {
  ASSEMBLY_TAB_LABELS, ASSEMBLY_WORKFLOW, ASSEMBLY_WORKFLOW_ACTION,
  CAMERA_ONLY_VIEWS, MODEL_PLANE_TOOLS, PART_TAB_LABELS, PART_WORKFLOW,
  SKETCH_DRAW_TOOLS, SKETCH_TOOLS, histPanel, refreshAssemblyPosePreview,
  scheduleLibThumbs,
};
// for js/modeler/viewport_decorations.js (live bindings: it sees every reassignment)
export { decoratedWorldPerPixel, viewportPartByMesh };
// for js/modeler/library_store.js (live bindings: it sees every reassignment)
export { LS_ASSEMBLIES, LS_MODELS, MATE_ISSUE_KEYS, libraryChannel };

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

var documentSaveTasks=new WeakMap();

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
