# Chapter 2 Shell/Fillet order — actual browser audit

Order A Shell→Fillet and order B Fillet→Shell each pass **9/9 nominal guards**. Cold acceptance remains pending. Saved A key `cm_mv2xl6f7_6467`, name `Planchard Ch2 Shell then Fillet order A - browser 2026-10-11`; B key `cm_mv2xzcqu_6467`, name `Planchard Ch2 Fillet then Shell order B - browser 2026-10-11`.

The original fully defined base sketch/Boss are preserved exactly. Genuine Shell2mm Inside/Intersection removes the original top face atY20mm; subsequent Fillet4mm references the four exterior vertical edges atX/Z±15mm. Actual serialized mesh records one native solid. Independent BRep validation confirms one valid connected body, bounds30×20×30mm,V5.55730964915cm³. Volume matches rounded outer area times height minus the sharp26×26×18mm cavity.

Independent native probes in all four quadrants verify sharp inner cavity corners: pointsX/Z±12.9mm,Y10mm are outside material; the corresponding extreme outer corner points±14.9mm are also outside after exterior rounding, while side walls remain inside. These checks establish actual order-dependent geometry beyond feature labels.

Order B preserves the same original base sketch/Boss and applies Fillet4mm on the same four exterior vertical corners before Shell2mm Inside/Intersection/top removal. Actual native count1 and independent validation both confirm one valid connected solid. Volume5.61911497809cm³ matches exteriorR4mm and interiorR2mm rounded cavity analytically. All four inner-corner probes are now inside material, proving the cavity rounding contrast; outer-corner probes remain outside and wall probes inside. B−A volume difference.06180532894cm³ matches four rounded inner corners over18mm cavity height. This is genuine native geometric order dependence, not a label-only history comparison.

The source PDF120 /2-34 ExampleA supplies feature-order intent;30×30×20mm box,2mm shell and4mm fillet are chosen illustrative dimensions, not a recovered publisher dimensioned part. Read-only BRep regeneration audits actual browser-authored exports; no physical/manufacturing or actual STEP-export claim is made.

Evidence: `artifacts/planchard/CH2-SHELL-FILLET-order-base-browser-2026-10-11.mforge`, `CH2-SHELL-then-FILLET-A-native-browser-2026-10-11.mforge` and`CH2-FILLET-then-SHELL-B-native-browser-2026-10-11.mforge`. Assertions/native mass/point classifications: [audit JSON](ch2-shell-fillet-order-browser-audit-2026-10-11.json). Independent helper: `scratch/planchard/ch2-shell-fillet-readonly.mjs`.
