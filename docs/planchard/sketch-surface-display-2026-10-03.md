# Sketch display fixes — 2026-10-03

Source review found two concrete causes of unexpected sketch graphics in the 3D model view:

- Feature sketch references stored as `{ id }` records were added directly to the consumed-sketch set. The visibility check compares string IDs, so these absorbed sketches stayed visible. References now resolve to their IDs, while an explicit **Show in 3D** override remains supported.
- Finished cylindrical, conical, and spherical UV sketches used the principal Front-plane mapper. They now map through their saved surface descriptor and seam offset. UV segments are sampled to follow the curved surface; sampling is bounded at 256 subdivisions per segment.

The active surface-sketch edit uses the existing unwrapped UV workflow. This change addresses finished 3D display and does not extend curved-surface feature creation or claim exact native curve geometry.

Verification: 17 targeted Node tests passed, exercising actual editor overlay functions, absorbed sketches, visibility overrides, principal offsets, local face frames, active-sketch omission, cylindrical radius, rotated cone/sphere surfaces, closure, and bounded sampling. Browser visual verification is left to the main book workflow; the UI subagent did not control Chrome.

Commands:

```
node --test tests/sketch_scene_overlay.test.mjs tests/editor_projection.test.mjs tests/sketch_plane_display.test.mjs tests/surface_uv.test.mjs
npm run check
```
