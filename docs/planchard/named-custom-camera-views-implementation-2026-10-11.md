# Named custom camera views — source workflow implementation

Source: supplied PDF201, printed 4-21. The inspected render `scratch/planchard/ch4-named-view-source-201.png` explicitly describes adding a custom view from the orientation dialog, naming it and confirming. This is a distinct digital workflow; the existing fixed Front/Top/Right/Isometric presets did not fulfill it.

## Ordinary browser route

In Part or Assembly 3D mode, click **Named views** beside **Perspective**. In the view selector click **Save current view…**, enter **View name**, then **Apply**. The captured pose is the pose at opening the name dialog. Reopen **Named views** and click the saved name to recall it, or **Delete <name>** to remove it. Ordinary document **Save** persists the collection; saved copies inherit their own independent metadata collection.

Suggested parent witness: on the existing independent native pattern copy `cm_mv31o07x_6477`, capture one arbitrary orbit view and one Normal To fixed-frame view under distinct names. Move the camera, recall each, then Delete/Undo one entry. Save, hard reload, reopen the exact Saved record and recall both. Repeat one capture/recall on an existing assembly copy to prove document isolation. This report does not claim those browser actions have occurred.

## Representation and guards

New `js/core/named_camera_views.js` stores deep-copied records only in the owning document's `metadata.namedCameraViews`. Pose data contains azimuth/elevation, positive distance and zoom, world target in the editor's native centimetres, perspective/orthographic orbit preference and optional fixed drafting frame. World-target conversion compensates for Part bounds-centre changes; Assembly uses world centre zero. Fixed frames recall through the real editor `lookAtFrame` and remain orthographic while preserving the orbit projection preference. Existing Top/Right frames use the editor's own axis conventions; valid orthonormal axes are preserved rather than converted.

Finite values, positive distance/zoom, valid projection, finite orthonormal frame axes, nonempty identifiers and names up to 80 characters are required. Duplicate names are rejected without history mutation. Naming rejects changed document owner/type or Undo-head changes while its dialog is open. Recall resolves the current stored record; delete rejects changed owners or removed records and reacquires the live document after the normalizing Undo checkpoint.

Capture and recall do not change source geometry. Capture/delete create an application Undo checkpoint and mark Save dirty, but do not add or alter canonical features, sketches, parts, assembly occurrences, mates or CAD feature-history entries. The camera itself is not stored as authored CAD. The collection is per document, not a global named-view registry. Cross-size maximized/thumbnail viewport presentation naturally follows the existing editor's layout; the captured framing is intended for the same 3D viewport context.

## Verification

`node --test tests/named_camera_views.test.mjs tests/editor_orbit_projection.test.mjs tests/editor_projection.test.mjs`: **20/20 PASS**. Named-view tests execute the actual editor frame/projection methods, real naming form and real menu callbacks. They cover orbit/fixed-frame round trips, retained projection preference, camera zoom, shifted model centre, strict invalid-pose nonmutation, normalized Undo owners, stale owner/history rejection, current-record recall, delete/Undo snapshot, canonical-source identity, deep copies and actual Part/Assembly library bundle serialization/parsing.

`npm run check`: **PASS**, no free identifiers; **690** linked modules; **1487** source assertions. Owned diff whitespace check passes. Independent UI-agent review and actual Chrome warm/cold acceptance are separate pending steps at this freeze.

## Actual-browser integration correction

The first genuine Chrome capture failed after its Undo checkpoint because the application `state.uid()` returns a number, while the initial naming-form regression incorrectly supplied a string. The strict record validator therefore rejected the live ID. No named record was accepted in that attempt; the parent cancelled the form and restored the clean source with ordinary Undo.

The caller now converts the actual generated identifier to a string **before** preview validation and the Undo checkpoint, then uses that same validated ID in the live document. The final fixture executes the actual extracted `state.uid` function against an isolated local counter, proves its numeric contract and checks the resulting string identifier for both real Part and Assembly naming forms. It does not import application state or mutate global `S`. The corrected related suite remains **20/20 PASS**. The full CI run already in progress predates this narrow correction; its result must not be represented as execution of the corrected caller.
