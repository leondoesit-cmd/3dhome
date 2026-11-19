/* Which of the model editor's two instruction lines speaks during a sketch.
   The coach bar ("Next: draw a closed shape") and the canvas hint ("Click two
   corners") both used to be up at once, saying different things. While the
   sketch is open exactly one of them is shown: the armed tool's own
   instruction, or, with no drawing tool armed, the coach's next step. Outside
   a sketch the two do not compete and both keep their own rules. Pure, so
   Node tests it directly. */

// tools that leave the canvas idle: nothing to instruct, the coach may speak
var IDLE_SKETCH_TOOLS = { select: true, "": true };

/* state: { sketchStep, tool, coachShown }
   returns "hint", "coach", or "both" (no sketch open, no competition) */
export function sketchPromptOwner(state) {
  var s = state || {};
  if (!s.sketchStep) return "both";
  var tool = s.tool == null ? "" : String(s.tool);
  if (!IDLE_SKETCH_TOOLS[tool]) return "hint";
  return s.coachShown ? "coach" : "hint";
}
