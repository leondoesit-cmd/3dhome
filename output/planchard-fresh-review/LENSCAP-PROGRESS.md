# LENSCAP — chapter 7

Browser-authored from the user's *Engineering Graphics with SOLIDWORKS 2021* PDF, physical pages 322–333 (printed 7-16 to 7-24), on 2026-09-24. Saved in the ModelForge library as **LENSCAP - chapter 7 flashlight**; the local disk backup is `.model-backups/cm_muezhblu/latest.json`. The description is **LENSCAP FOR 6V FLASHLIGHT** and the document uses inches.

- **Base Extrude** starts with a fully defined Ø4.900 in circle on Front Plane. It extrudes 1.725 in with 5° outward draft.
- **Front-Cut** uses a concentric Ø3.875 in circle, cuts 0.275 in deep, and has 5° draft. **Shell 1** removes the front floor and rear end face with a 0.150 in wall.
- **BackCut** is a 360° thin revolved cut on Right Plane, 0.050 in thick, starting 0.250 in from the axis. Its sketch follows the conical silhouette.
- **ThreadPlane** is offset 0.450 in from the rear rim toward the front. Its fully defined sketch copies the exact rear inner circular edge. **ThreadPath** is a right-hand helix with 0.250 in pitch, 2.5 turns, 0° start, and 5° inward taper.
- **ThreadSection** is a fully defined 0.125 in high, 0.050345 in deep trapezoid on Top Plane, with a 0.060 in narrow side. Its split wide side is pierced to the helix start. **Thread** sweeps this profile along ThreadPath and merges it into one solid.

The browser workflow exposed two gaps. Copy face boundary now prioritizes a selected complete circular edge; when the viewport selects a split arc instead, it offers nearby complete circles by radius and axial position. The editor's size readout now uses the kernel's exact bounds for drafted/cut/shelled parts, so it no longer understates this lens cap's width before the sweep.

Verification: the model was saved, the browser page reloaded, and the saved record reopened. The internal thread rendered, the tree showed 11 editable steps and one solid with no diagnostics, and the size readout was **5.158258 × 1.725 × 5.158258 in**. Evaluate reported **Exact solid geometry**, **78.85085 cm³** volume, and **13.102 × 13.102 × 4.3815 cm** overall dimensions. The material remains unspecified by the book, so the app's assumed steel mass is not a qualified material result. Focused regressions, `npm run check`, and `git diff --check` were run before commit.
