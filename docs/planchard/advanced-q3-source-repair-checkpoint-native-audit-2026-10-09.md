# Advanced Q3 source-repair checkpoint — valid, incomplete source geometry

Actual browser checkpoint regenerates as one valid native solid with no issues; exact STEP subtraction is zero in both directions. Native volume is **49763.63378178711 mm³**, mass **134.3618112108252 g** at retained Aluminum6061density2.7, world COM **(57.183729599889865,-0.2490230801997248,14.506943987855307) mm**. This is not final source acceptance.

Fork centre1987 now has V6mm; closed-slot centre2010 now U27.5mm and driving radius2030R5. Mirror3 mirrors the closed-slot feature aboutX55 and consumes the chamfer result. All stored sketches remain fully defined. New identity-axis named frame is (110,0,30)mm. Chamfer's native reference is refreshed to the lower fork lip at (2.5,0,50)mm. These repairs preserve the supported source coordinates.

Per-feature native results show current lower Chamfer1 **does remove62.5mm³**. Mirror3 removes1142.699081699mm³ and does not undo it. The remaining source differences are independently geometric:

1. Source R30 rear-relief circle/cylinder centres have sourceX0/Y±52/Z−50..−45. Mapping to the current app gives **X55/Y±52/Z0..5**, while actual point2055/fixedconstraint2056 remains **X45/Y52**. Moving this source-supported circle affects moments while retaining its material-removal volume; mass fitting is unnecessary.
2. The source contains a second45° upper-mouth bevel. Planeattr8 normal(0,-√½,+√½) and bounded line witnesses321/41/9 map to **(5,12,45),(0,12,45),(5,17,50)mm**. They support the left-wall upper edge from(0,12,50)to(5,12,50). Its triangular prism removal is5×5/2×5=**62.5mm³**, independently explaining the residual. The plane's raw originX110.001 is arbitrary in-plane parametrization because its normalX is zero; it must not be interpreted as right-flange ownership. The source reader additionally finds two selection wrappers for its Chamfer feature, although complete selection-token ownership remains partially decoded.

Parent is repairing these two items through Chrome. Source mass/COM targets were not used to choose coordinates. Original source feature-history ownership remains qualified; this report certifies native/STEP equality only for the actual intermediate checkpoint.

Evidence under artifacts/planchard `ADVANCED-Q3-source-repair-checkpoint-...-2026-10-09.json`: native audit, STEP equivalence, feature volumes and design audit. No authored model, browser, app or ADVANCE edits occurred.
