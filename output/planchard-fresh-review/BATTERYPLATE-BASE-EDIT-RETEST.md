# BATTERYPLATE base edit: browser retest still blocked

Retested 2026-09-16 after the topology-cache / historical-edge remapping fix. No application code changed.

## Browser reproduction

1. Confirmed localhost server responds, then reloaded the actual in-app browser at http://localhost:8765/ to load current application files.
2. Opened Model editor. The UI offered an unsaved recovery draft named `BATTERYPLATE - ebook browser review`; selected Restore draft.
3. Waited for CAD kernel initialization and used Evaluate > Force Rebuild. The recovered model rebuilt successfully with one solid and ten history steps. Viewport showed the rounded pocket, rim and two holes. Base inspector confirmed the recovered base was still 10.414 cm, draft 0, so this was the pre-base-edit model, not the failed final parameters.
4. Selected Extrude / Boss 1 > Shape & size > Edit feature in history.
5. Entered `10.16mm` in Depth cm (resolved to 1.016 cm), entered `3` in Draft angle deg, left Along normal / inward draft, then finished the command.
6. Initial result reported 16 rebuild errors. Ran Evaluate > Force Rebuild once more; the persistent result became 11 errors.
7. Tried Save to library. Save is blocked by Rebuild failed.

## Remaining error

The first persistent reference is now a cut-tool edge:

`Fillet 2 has an missing topology reference: feature_mu495t59_4:tool:edge:generated:circle:5`

Diagnostics after Force Rebuild:

- Fillet 2 lost a selected face or edge, grouped ×4.
- Fillet 2 regeneration failed with the reference above.
- Feature input unavailable: `feature_mu4b8bji_2` and `feature_mu4bz5zm_1`.
- Extrude Cut 2 and Extrude Cut 3 each report unavailable tool and result inputs.
- Save error repeats the same cut-tool circle reference.

The earlier outer-edge reference appeared in the immediate post-edit diagnostics, but the full rebuild narrowed the first remaining failure to the cut-tool circle reference. This is evidence of a remaining browser-model case, not a proven diagnosis of the implementation.

## Expected

The ebook's BATTERYPLATE activity (PDF 248, printed 5-30, steps 196–203) must permit editing the inherited base to 10.16 mm / 3° while keeping the rim fillet, attached sketch and both Through All holes valid. Save and reopen should preserve the resulting plate.

## Preserved state and next check

The current browser tab is retained with the failed edited model and save-error dialog open. Do not reload if the in-memory failure is needed. Library save/reopen verification could not complete. Recovery may restore the pre-edit model, as it did in this retest; repeat steps 4–7 if necessary. Original BATTERY library models were not edited.

Please include this actual recovered model's cut-tool edge references in regression coverage, then repeat the UI parameter edit, Force Rebuild, save and reopen. No later book activity was attempted after this functional blocker.
