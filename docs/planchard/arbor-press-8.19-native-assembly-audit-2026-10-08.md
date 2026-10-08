# 8.19 Arbor press — actual fourteen-mate assembly and stroke audit

PASS for `artifacts/planchard/AP-assembly-free-home-browser-2026-10-08.mforge`, the Chrome-authored eleven-occurrence/eight-definition assembly. All fourteen native mates resolve without issues or rebindings. Embedded source recipes, sketches, properties and material provenance match all eight accepted final browser part exports. Cold solve at saved home is settled/converged at zero iterations; no saved translation or rotation changes.

The eight Locks, shaft Concentric and axial Distance, two ram guide Distances, Rack/pinion and aligned Top Limit leave exactly **one DOF**. The moving shaft/handle/ram/head cluster has rank23 over24 variables. Suppressing only Rack on a disposable clone produces **two DOF**. Rack A is the AP05 native circular edge with +Z axis; B is the AP06 socket circular edge with +Y axis. Pitch radius is10 mm, Reverse false, and saved Drive is blank. These actual ordered references make negative Drive close: world displacement ΔY=10Δθ, with θ measured about +Z in radians.

A fresh native regeneration of all eight definitions and exact all-pairs placed-solid intersection audit passes at **61 poses**, stroke0 through60 mm in1 mm increments. Every driven pose is settled with zero DOF and matches the frozen shaft/handle rotation and ram/head translation. No positive-volume intersections occur. Home ram originY90 mm and head/table gap62 mm become closed ram originY30 mm and head faceY22 mm above tableY20 mm, leaving2 mm clearance. Endpoint Drive is−0.954929658551372 turns. All static occurrence poses remain fixed.

Transactional Drive trials beyond each stop (+0.01 turns above home and−1 turn below closed) reject without changing the disposable assembly or adding Undo callbacks. The nominal signed Top Limit remains30..90 mm. The earlier browser insertion with default0..20 mm is a separately protected diagnostic, not the accepted home.

An additional disposable motion study at−5.729577951308232 RPM passes0/2.5/5/7.5/10 seconds, giving ramY90/75/60/45/30 mm. The native Rack Drive stays free in the authored mate data; a subsequent free endpoint solve remains settled with one DOF at zero iterations. Evaluating11 seconds rejects atomically. This verifies source motion evaluation against the actual saved fixture; visible Chrome Play, Apply, Cancel, save/reload and final drawing acceptance remain parent-owned browser checks.

Evidence:

- `artifacts/planchard/AP-assembly-free-home-reference-audit-2026-10-08.json`: native references, source provenance, saved poses and cold solve.
- `artifacts/planchard/AP-assembly-full-stroke-native-audit-2026-10-08.json`:61 native exact-solid samples, analytic errors, actual poses, free/uncoupled rank and transactional rejections.
- `artifacts/planchard/AP-assembly-motion-clone-audit-2026-10-08.json`: full-span motor evaluation, free endpoint refresh and rejected out-of-range seek.

Inputs remain byte-identical. No authored part or assembly was modified. These sampled poses do not certify continuous swept-volume clearance, physical teeth/contact, strength or press capacity. No source repair was required.

## Actual Chrome Drive and rejected-stop exports

The six `AP-rack-{quarter-close,half-close,closed-endpoint,lower-stop-rejected,driven-home,upper-stop-rejected}-browser-2026-10-08.mforge` exports independently pass native exact-solid and cold-solve checks. Quarter Drive−0.25 gives ramY74.29203673 mm, half Drive−0.5 givesY58.58407346 mm, closed Drive−0.954929658551372 givesY30 mm, and driven home0 givesY90 mm. All six are settled with zero DOF and zero exact clashes; every embedded definition agrees with driven home.

The lower-stop-rejected assembly is JSON-exactly identical to the accepted closed-endpoint assembly. The upper-stop-rejected assembly is JSON-exactly identical to driven home. These comparisons include all poses, complete component definitions/properties, ordinary/native mates and the entire assembly object. Native cold re-solves do not materially move any accepted pose. All six source inputs remain byte-identical.

Evidence: `artifacts/planchard/AP-browser-drive-and-stop-rollback-audit-2026-10-08.json`. This is the actual exported browser rollback proof, separate from the earlier disposable transactional tests. Browser save/reopen and Motion Study lifecycle checks remain separate parent evidence.
