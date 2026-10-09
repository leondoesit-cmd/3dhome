# Exercise 1.7 estimated browser plan

Source visually reviewed: `scratch/planchard/drafting-exercise-083.png`, PDF83 / printed1-55. It shows a thin base plate with one circular through-hole, a rear upright and a centered open rectangular notch in the upright top. No major topology conflict with the proposed interpretation is visible. The hole's apparent ellipse is perspective, not an elliptical bore. Notch is open at the top and traverses the upright thickness; neither blind pocket nor extra hidden bore is warranted. Fillets/chamfers are not prescribed. Source asks estimation and has no Front arrow, dimensions or material.

Declare X width, Y up, +Z rear; chosen app Front from rear(+Z). Illustrative10mm unit plus half steps: W30/depth50/base5/overallH35/rear upright thickness5. All dimensions are choices, not certified source grid measurements. Browser UI recipe:

1. Fully defined Top rectangleX0..30/Z0..50; Boss+Y5.
2. TopY5 rectangleX0..30/Z45..50; merged Boss+Y30, reachingY35.
3. TopY35 rectangleX10..20/Z45..50; reverse Cut5 toY30. This removes the upright's centered top notch through its full5mm thickness, leaving10mm-wide ears each side.
4. TopY5 circle centerX15/Z20, diameter15; reverse Cut5 toY0, producing base through-bore. Fully constrain center/diameter and keep it clear of front/rear edges.

Analytic validation of declared geometry only: V=30×50×5+30×5×30−10×5×5−π×7.5²×5=10866.4270661779mm3; one connected solid, boundsX0..30/Y0..35/Z0..50. This is not a printed source mass answer. Actual drawing should qualify the chosen Front direction and illustrative sizes.

Front from+Z: visible upright outline with centered top notch; base bore projects as hidden vertical pairX7.5/22.5 overY0..5 with centerX15, behind the upright. Top: visible base rectangle, base circular bore with center cross; upright footprint and notch divisions in rear stripZ45..50. Right: visible L-shaped base/upright, hidden base bore pairZ12.5/27.5 overY0..5 and centerZ20; top-notch floorY30 throughrear strip is hidden behind an outer ear. Top is most informative for base bore and placement; Front for notch; no single view alone describes all features. If one is required, choose Top with that qualification, rather than claim an official source choice.

Acceptance remains future actual browser native/drawing/driving/cold evidence. No script-generated model or material/fit/strength certification is supplied by this plan.
