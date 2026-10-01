# HOOK — Project 7.2 browser acceptance

Source: user-supplied Planchard *Engineering Graphics with SOLIDWORKS 2021*, PDF pages 369–370. The rendered pages were inspected before construction. Started from a blank document in desktop Chrome, dark theme; every geometry and material change used the app UI.

## Construction

- Fully defined Right-plane path: .250 in straight stem, R.500 in transition and tangent upper loop. Path overall height is 1.000 in. Exercise 7.2 does not prescribe the path plane; Right was chosen to pass the loop through the sheet bore in Exercise 8.2.
- Circular Sweep: Ø.150 in, follow path, one solid.
- Free-end Dome: .050 in.
- Thread: modeled #8-36 RH, 2A callout, Ø.150 in override, .250 in length, nine turns. Thread starts at the base boundary and modifies the Dome result.
- Plain Carbon Steel: 7.85 g/cm³.

The print leaves the upper-loop geometry incompletely dimensioned. The final documented estimate uses upper radius **.21336 in**, a **48.7874787723°** lower transition and a **270°** upper arc. Upper-loop center: (.03000, .78664) in in the Right-plane sketch; free tip: (−.1305045284, .6460669373) in. It gives a mathematically tangent path with the stated 1 in overall height. Earlier upper-loop estimates did not pass through the finite .060 in sheet bore in Exercise 8.2. Only the undimensioned loop estimate and unspecified datum plane were adjusted; every printed dimension remains unchanged. The thread cutter is a basic 60° flat-root profile; the 2A callout is not a certified production fit.

## Acceptance

Saved as **Planchard HOOK - rebuilt 2026-09-28**, then reloaded and reopened from the library with the new CAD worker. Four history steps, three features, one solid; rebuild succeeds and the sketch remains fully defined.

Exact Chrome volume after the final loop and free-end Dome repair: **.4797081 cm³**. Steel mass: **3.765708 g**. Changing the path altered generated face numbering; the new exact Target face control explicitly reattached Dome to Sweep `generated-2`, the free tip. Save and library reopen retain that target and the visible final mesh.

Final project bundle: `HOOK7.2-final-browser-2026-09-28.mforge`. Screenshots: `HOOK7.2-final-model-browser.png` (exact mass), `HOOK7.2-reopened-browser.png`. Chrome deliverable tab: **710847773**. The previous tab disappeared during browser automation; its saved library record and bundle remained intact.

Focused thread placement/preset tests passed, alongside the mate reference tests (eight tests total). Static module and import gates passed. Construction time/click count were not measured, and no full-book completion claim is made.
