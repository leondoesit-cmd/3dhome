# BATTERY pocket fix: saved-model browser retest still fails

## Result

The original saved reproduction still displays a square-cornered pocket after a page reload, opening an independent copy, and explicitly rebuilding the cut. The outer body retains its rounded corners. The BATTERY workflow remains paused before the 1.27 mm top-rim fillet.

No application code was changed. The reported kernel measurements and focused test results were supplied by the user; they were not independently rerun in this retest. The history-order fix is present in the local `js/modeler_part_geometry.js` source (the `orderedProjectionSteps` implementation was located). Browser module response/version was not independently fingerprinted, so stale module delivery remains a diagnostic possibility.

## Browser reproduction after the reported fix

1. Reload http://localhost:8765/ using the browser reload API.
2. Open Model editor, then Saved models.
3. Open the existing `New model` library entry. Its UI offers Save copy and open.
4. Name the independent copy `BATTERY - ebook browser review` and Apply.
5. Allow the CAD kernel to load. Five history steps and one solid appear; status becomes `fully parametric` and `Rebuild succeeded 1 parts`.
6. Inspect isometric view, then Top · X·Z. The pocket still has four sharp rectangular corners, while the outside has four rounded corners.
7. Double-click Extrude Cut 1 in the feature tree. Confirm Blind, Depth `0.508` cm, Reverse normal, Start offset 0, Draft angle 0. The form identifies sketch `sk_1tr9o`, sketch feature `feature_mu494nhz_3`, and cut feature `feature_mu495t59_4`.
8. Re-enter depth as `5.08mm`. The form confirms `= 0.508`. Its Update feature footer changes to the floating Finish command control after editing. Click Finish command.
9. The UI reports `Feature rebuilt from history · all views updated` and `Rebuild succeeded 1 parts`, but the top view still shows sharp pocket corners.
10. Save to library. The UI confirms `Model saved to library`. The named copy remains open for handoff.

## Expected acceptance

The pre-existing saved reproduction must regenerate the same rounded pocket as a freshly authored model: four 8.89 mm inside corner radii, 60.96 mm overall profile extents in both directions, and a 5.08 mm blind depth. These dimensions derive from the ebook inputs, not measurements made in this retest.

## Coder follow-up

- Exercise the actual saved library entry, not only a newly constructed regression fixture.
- Check saved/copy-loaded operation metadata and history-index reconstruction, including linked face-sketch regeneration.
- Confirm the served browser actually loads the corrected module; a normal reload was performed, but its module version was not fingerprinted.
- Compare exact result, displayed mesh, and displayed edge overlay. The current visual evidence does not establish which of those is wrong.
- Retest both library load and manual feature update. A successful kernel-only fixture does not yet validate these paths.

The original detailed authoring reproduction is in `CODER-HANDOFF.md` beside this note. The next ebook operation, once this passes, is chapter 5 printed page 5-21 (PDF page 239): apply a 1.27 mm constant-radius fillet to the thin top rim face, then continue with the terminal sketch and drafted bosses.
