# BUSHING — fresh desktop Chrome recreation

Source: user-supplied Planchard 2021 PDF, page 302, exercise 6.1. The printed figure was visually inspected. The part began in a blank document; no old library model, imported geometry or scripted model was used.

## Construction

- Front-plane six-edge closed profile; origin at the bottom center of the bushing.
- Flange Ø.400 in, boss Ø.283 in, through bore Ø.188 in.
- Flange thickness .050 in; boss rises a further .100 in.
- One 360° revolve around the sketch Y axis. Two history steps including the sketch, one exact solid.
- Six horizontal/vertical relations, one fixed start position at (.094, 0) in, and four named driving lengths (`FlangeRadialWidth`, `FlangeThickness`, `ShoulderRadialWidth`, `BossHeight`). Sketch is fully defined, 0 DOF.
- Inch document units and ANSI third-angle drafting preset.
- Brass C360, density 8.50 g/cm³. The book says Brass without specifying a grade; this is an explicit material choice.

## Acceptance

Saved, exported and reopened through Chrome's library UI. Exact mass properties after final reopen: 137.8069 mm³, 1.171359 g, center of mass (0, 1.431085, 0) mm; overall 10.16 × 3.81 × 10.16 mm.

Independent volume: π[(.200²−.094²)×.050 + (.1415²−.094²)×.100] in³, converted by 2.54³ to cm³; agrees with the exact solid result.

The BossHeight driving dimension was changed from .100 to .110 in using Enter. Overall height rebuilt from .150 to .160 in with 0 DOF retained, then restored to .100 and saved. Inline dimension Enter handling was repaired during this check.

Files: `BUSHING-browser-2026-09-28.mforge`, `.step` and `.png`. The project bundle retains the editable feature/sketch history and ANSI sheet settings.
