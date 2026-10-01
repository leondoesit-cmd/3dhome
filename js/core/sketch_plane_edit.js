import { frameFromPlane } from "./frame.js";

// Reassign an existing sketch without creating a second history entry or
// changing its local coordinates and driving constraints.
export function reassignSketchPlane(sketch, reference, view) {
  if (!reference || reference.type !== "plane") throw new Error("Choose a reference plane");
  sketch.plane = view;
  sketch.referenceId = reference.id;
  sketch.offset = 0;
  delete sketch.support;
  delete sketch.supportOffset;
  delete sketch.frameAnchor;
  if (["plane:top", "plane:front", "plane:right"].includes(reference.id)) {
    delete sketch.frame;
    delete sketch.frameSpace;
  } else {
    sketch.frame = frameFromPlane(reference.origin, reference.normal);
    sketch.frameSpace = "local";
  }
  return sketch;
}
