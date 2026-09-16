# BATTERYPLATE direct circular-edge Offset — verified

Implemented direct exact model-edge picking from the sketch Offset tool. Complete circular edges parallel to the sketch plane open a signed-distance form with live dashed preview, bidirectional option, Apply and Cancel. Unsupported picks explain what can be selected. Cancellation does not insert geometry or an undo step; invalid distances are rejected before mutation.

The created circle stores its source topology reference and signed offset. Subsequent sketch-circle offsets retain that reference, follow source center/radius changes, and read their current offset dimensions during rebuild. Saved earlier offset chains can recover their parent from the existing offset relation.

## Browser verification

Used the real localhost browser and the saved BATTERYPLATE - repaired support record:

1. Created a sketch on the pocket floor.
2. Selected Offset and clicked the central hole's circular model edge directly.
3. Entered 0.762 cm; verified the dashed concentric preview, then Cancel. Sketch remained empty.
4. Repeated and applied 0.762 cm, then offset the new circle by 0.254 cm. Sketch reported fully defined with two circles and displayed a 2.794 cm diameter and 0.254 cm offset dimension.
5. Extruded the annulus 1.016 cm with 3-degree inward draft and Merge result enabled.
6. Saved the existing BATTERYPLATE - repaired support library record. Full reload and library reopen succeeded with 12 history steps, one solid, both holes and the raised annular holder visible. Repeated reload with the final association code also reported Rebuild succeeded.

The saved library record now includes the holder. Other BATTERY records were not edited.

## Validation

- 37 focused tests passed (offset, converted geometry, BATTERY/BATTERYPLATE, parametric UI).
- The 7 offset/conversion tests passed again after adding compatibility for earlier saved offset chains.
- npm run check passed: 502 linked modules, 1,449 source assertions.
- git diff --check passed.
- Full test suite not run.

## Separate observation for the coder

Restoring the pre-fix unsaved recovery draft reported missing historical Fillet 2 edge references and downstream cut failures. Opening the saved BATTERYPLATE - repaired support record instead rebuilt successfully. This does not establish the cause of the recovery discrepancy; it needs a separate draft-versus-library topology-cache investigation. The stale draft was discarded after opening the saved baseline, and successful Save cleared recovery state. This Offset fix does not claim to resolve that separate recovery path.
