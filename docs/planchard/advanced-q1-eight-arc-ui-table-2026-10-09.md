# Advanced1: exact front arc UI table

All coordinates are inches in FrontU=+X,V=+Y, extrusion+Z. This is source-derived sketch geometry, not a browser-authored model. Source convex circles haveR0.5 and centers(±1,±1); concave circles haveR1.5 and centers at cardinal distance1+sqrt(3). Their center distance is2=R0.5+R1.5, so the following endpoints are their exact external tangencies.

Set h=1+sqrt(3)/4=1.433012701892219; q=1+sqrt(3)=2.732050807568877; k=1+sqrt(2)/4=1.353553390593274; m=q−1.5=1.232050807568877. Follow this table in perimeter order. Select the midpoint to establish the correct branch of a three-point arc. Convex arcs are **150° clockwise** and concave arcs are **60° counterclockwise** when viewed in FrontU/V; the full perimeter advances clockwise.

|Arc|Role/radius|Center|Start|End|Branch midpoint|
|---|---|---|---|---|---|
|1|Top-right convexR0.5|(1,1)|(0.75,h)|(h,0.75)|(k,k)|
|2|Right concaveR1.5|(q,0)|(h,0.75)|(h,−0.75)|(m,0)|
|3|Bottom-right convexR0.5|(1,−1)|(h,−0.75)|(0.75,−h)|(k,−k)|
|4|Bottom concaveR1.5|(0,−q)|(0.75,−h)|(−0.75,−h)|(0,−m)|
|5|Bottom-left convexR0.5|(−1,−1)|(−0.75,−h)|(−h,−0.75)|(−k,−k)|
|6|Left concaveR1.5|(−q,0)|(−h,−0.75)|(−h,0.75)|(−m,0)|
|7|Top-left convexR0.5|(−1,1)|(−h,0.75)|(−0.75,h)|(−k,k)|
|8|Top concaveR1.5|(0,q)|(−0.75,h)|(0.75,h)|(0,m)|

The midpoint column determines the sweep; it is not an extra perimeter vertex. Share adjacent endpoints exactly and make the last end coincide with the first start. There are **eight arcs and zero straight joins**. A wrong long concave210°/300° arc or a90° corner arc does not match the source. Keep explicit driving radii/center datums and tangent/coincident relationships; do not add redundant fixed-point constraints if they conflict with the chosen driving dimensions.

Front holes are fourØ0.35 circles centered(±1,±1), confined to the front flangeZ2.1..2.6. This contour is extrusion-ready only after the actual browser reports one closed fully defined outline.

## Rear rounded diamond through a polygon plus sketch fillets

A regular four-sided diamond centered at origin, sharp vertices(0,a),(a,0),(0,−a),(−a,0), with a=1+0.5sqrt(2)=1.7071067811865475, is an exact parametric construction. ApplyR0.5 sketch fillets to all four90° corners. Each fillet center is displaced0.5/sin45°=0.7071067811865475 toward the origin, giving the source centers(0,±1),(±1,0). Each edge setback is0.5/tan45°=0.5.

For example the top fillet has center(0,1), tangent endpoints(−0.353553390593274,1.353553390593274) and(+0.353553390593274,1.353553390593274), and passes through(0,1.5). The right fillet is centered(1,0), and the top-right straight tangent joins(+0.353553390593274,1.353553390593274) to(1.353553390593274,+0.353553390593274). Repeat by quarter-turn symmetry. Final rounded bounds are±1.5, while the unfilleted construction vertices are±1.7071067811865475.

Thus the regular-polygon+four-sketch-fillet workflow is source-equivalent. Use polygon orientation with vertices on the cardinal axes; a square whose vertices are diagonal is wrong. Rear holes areØ0.35 at(0,±1),(±1,0), confined toZ0..0.4. The source's later solidR0.1 fillets are distinct from theseR0.5 sketch corners.
