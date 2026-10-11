# Oblique rectangle browser fixture readiness

The isolated desktop browser case passes with its original preview-to-commit limit of **1.25 px**. This change is confined to `tests/model_editor_desktop.browser.mjs`; production CAD, picking, camera and rectangle code are unchanged.

## Diagnosis

The original isolated run reproduced a 1.64 px corner mismatch. Read-only diagnostics showed the preview renderer at **1014 × 608 px**, while the sketch overlay was **1014 × 615 px**. After release both were 1014 × 615 px. Camera aspect changed from 1.667763157894737 to 1.648780487804878, matching that resize. The preview and committed camera pose were identical: azimuth 1.268, elevation .674, distance 155.88457268119893, target (0,0,0), camera (151.1334640792911,156.4771330324068,47.21451953897755).

The fixture now waits for actual positive renderer/overlay dimensions to agree within 1 px and camera aspect to agree with the renderer within 1e-6 before dragging. This is a readiness condition, with no added fixed sleep or relaxed geometry assertion. Failure diagnostics retain the measured projection and pose.

## Validation

- `node --test --test-name-pattern='oblique rectangle preview' tests/model_editor_desktop.browser.mjs`: **1/1 PASS**, zero skipped, exit 0. Log: `scratch/planchard/oblique-rectangle-stable-projection-elevated-2026-10-11.log`.
- `npm run check`: exit 0, no free identifiers, **691 modules / 1487 source assertions** passed. Log: `scratch/planchard/oblique-rectangle-final-gates-2026-10-11.log`. Owned diff check is clean.
- Original and diagnostic failures remain in `scratch/planchard/oblique-rectangle-{isolated,diagnostic,projection}-elevated-2026-10-11.log`.

This closes the isolated fixture failure; it does not claim a newly completed full CI run or parent-authored model acceptance.
