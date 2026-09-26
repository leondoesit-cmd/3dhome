# Exercise 5.11 — Copper T block

Built through browser controls: fully defined eight-edge Top-plane profile, 3.00 in width, 2.50 in overall depth, 0.75 in flange, centred 0.50 in stem, 1.75 in symmetric extrusion. Saved as COPPER T BLOCK - exercise 5.11.

Origin assumption: centred overall extents, with mid-plane extrusion. The book's pictorial origin has no coordinate dimensions; exact placement relative to that illustration remains unconfirmed.

Exact browser properties: volume 5.468750 in³, mass 1.755469 lb, density 0.321000 lb/in³; centroid (0,0,0.525) in. Independent calculation: (3*.75 + .5*(2.5-.75))*1.75 = 5.46875 in³; mass 1.75546875 lb.

Added Copper (grade unspecified) to the stock material list, with the book's density and provenance. No strength or specific grade is implied.

Saved ANSI / inches / two-decimal drawing with six dimensions: overall width, height and depth, flange thickness, stem width, and side margin. Material and 1.76 lb mass added; default general tolerance cleared because none is supplied.

A missing flange edge disappeared after reopening the model. Exact-kernel projection tests retain both shoulders; inspection found partial mesh refresh did not invalidate the drawing cache. Added invalidation and redraw when a new exact mesh lands. Fresh creation after reload still needs a browser retest of that change.
