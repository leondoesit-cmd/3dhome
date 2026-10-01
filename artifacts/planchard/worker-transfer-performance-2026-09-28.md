# Exact worker transport verification

The worker still performs geometric topology naming after each history rebuild.
For freshly serialized worker BREP bytes, the client now binds native handles
using the matching transported face/edge traversal ordinals. It checks every
kind, count, unique persistent ID and ordinal; older records use geometric
extraction. This shortcut is not used to name edited geometry.

Fresh browser-authored HOOK 7.2, 9-turn modeled thread:

| Stage | Measured duration |
|---|---:|
| Worker exact history replay and transfer preparation | 33.728 s |
| Deserialize final BREP | 252.708 ms |
| Bind transported topology (4,023 entries) | 74.727 ms |
| Geometric extraction/rematching comparison | 4,539.981 ms |

All persistent subshape IDs matched. Maximum raw descriptor difference after
the BREP roundtrip was 2.3939183968479938e-15; no geometry mismatches at a 1e-7
tolerance. A rounded topology signature crossed a .1905 coordinate rounding
boundary, so raw descriptors rather than rounded strings were compared.

Seven focused worker tests pass, including cancelled/stale job isolation,
persistent activity, BREP roundtrip IDs, rejected incomplete/duplicate ordinal
maps, map ordering independence, and Shell preview cache reuse. Module and link
checks pass.

The UI footer retains active/queued feature and elapsed time with Cancel.
Restoration emits explicit progress; cancellation prevents obsolete results
from publishing between native restoration steps. A synchronous native step
cannot be interrupted in its middle. Assembly interference is being moved to
an entirely worker-native report path by the dedicated assembly agent.

HOUSING's earlier Chrome Shell attempt was preserved but became unresponsive;
this timing proof does not claim that the final corrected HOUSING is complete.

## Browser lifecycle follow-up (2026-09-28, 10:38 local)

Chrome's 49 processes had a combined 11.81 GB working set while several CAD documents were open. Workers are per tab; there is no shared admission lock in the app. Resource pressure is a plausible contributor to delayed module startup, not an established sole cause.

The client now isolates activity/progress observer exceptions so UI callbacks cannot strand submitted or completed requests; unreadable worker messages reject callers and allow a clean worker restart. A worker is released after 120 seconds only when both pending requests and native BREP restoration trackers are empty. Active long Shell computation is never expired. Serialized preview caches are lost on idle release and regenerate on the next job.

The footer retains its Cancel button across timer updates. Previously the entire chip contents were replaced every second, detaching accessibility click targets. A behavioral regression executes the actual footer function, verifies stable button identity across queued/finish updates, and verifies cancellation removes activity.

Validation: 10 CAD worker tests, 1 footer behavioral test, 40 feature-tree/rollback tests pass; static module/link/assertion gates pass. Corrected HOUSING remains a preserved browser draft; shell-only exact acceptance and downstream converted-circle repair are pending. Do not treat the file named `fresh-housing-corrected-shell-complete-2026-09-28.mforge` as accepted final geometry: it captured cleared background activity before authoritative Save reported the stale circular reference. The newer `fresh-housing-corrected-shell-only-pending-2026-09-28.mforge` preserves rollback index 8 before that downstream sketch.

## Corrected shell and cancellation acceptance (11:38 local)

Chrome 213 accepted Save of the corrected negative-Z battery body and Shell,
with SketchSquare fully defined by the book's 3.100in width, 1.600in height,
and linked half-width centering dimension. Clean reload and canonical Library
reopen showed healthy upstream features and 11.1125 × 11.1125 × 17.78cm bounds.
The saved artifact is `fresh-housing-shell-fully-defined-saved-browser-2026-09-28.mforge`.

Its isolated exact worker replay succeeded in 239099.392ms. BREP deserialize
took 57.565ms; fast native topology hydration took 4.532ms for 236 entries.
Full geometric extraction took 1413.198ms; ordinal IDs and descriptors had
zero mismatches (largest descriptor delta 1.85e-13). This verifies transport;
it does not make the 239-second Shell computation fast.

Chrome 231 recovered the later stop edits through the named Saved Drafts UI.
The inner circle retained entity568 and now references the exact Shell inner
front circle at Z3.302cm, radius5.30225cm. Stop direction was committed as
forward and rollback released through the UI. The active checkpoint is
`fresh-housing-stop-active-browser-checkpoint-2026-09-28.mforge`; authoritative
Save is still computing, so it is a draft rather than a completed HOUSING.

Actual Cancel removed the tab's activity and did not restart the same revision.
Its DOM pointer-events is auto and its button lies within the 2560px viewport.
Automatic preview suppression is scoped to the cancelled document/history;
a new edit or Ctrl+B permits another build. Cut preflight now keeps the editor
interactive, passes an AbortController signal, and rejects cloned transaction
results after cancellation instead of making the entire editor inert.
