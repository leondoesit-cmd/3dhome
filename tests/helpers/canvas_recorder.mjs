/* A 2D canvas context for Node that records what would be painted: every
   path command, and for each paint operation (stroke, fill, text, rect) only
   the state that operation paints with (a fill ignores the stroke style).
   Two drawing routines whose logs are equal paint the same pixels.
   Path2D is absent in Node, so code under test takes its context path. */
const USES = {
  stroke: ["globalAlpha", "strokeStyle", "lineWidth", "lineJoin", "lineCap", "dash", "lineDashOffset", "T"],
  fill: ["globalAlpha", "fillStyle", "T"],
  rect: ["globalAlpha", "fillStyle", "T"],
  srect: ["globalAlpha", "strokeStyle", "lineWidth", "lineJoin", "dash", "lineDashOffset", "T"],
  text: ["globalAlpha", "fillStyle", "font", "textAlign", "textBaseline", "T"],
};

export function recorder() {
  const log = [], st = [];
  let cur = { globalAlpha: 1, strokeStyle: "#000", fillStyle: "#000", lineWidth: 1, lineJoin: "miter", lineCap: "butt",
    dash: [], lineDashOffset: 0, font: "", textAlign: "start", textBaseline: "alphabetic", T: [] };
  const paint = (op, extra) => {
    const used = {};
    USES[op].forEach((k) => { used[k] = cur[k]; });
    log.push(op + " " + JSON.stringify(Object.assign(used, extra || {})));
  };
  const n = (v) => Number(v).toFixed(3);
  const ctx = {
    save() { st.push(JSON.parse(JSON.stringify(cur))); },
    restore() { if (st.length) cur = st.pop(); },
    setLineDash(d) { cur.dash = d.slice(); },
    getLineDash() { return cur.dash.slice(); },
    translate(x, y) { cur.T.push(["t", n(x), n(y)]); },
    rotate(a) { cur.T.push(["r", n(a)]); },
    beginPath() { log.push("begin"); },
    moveTo(x, y) { log.push("M" + n(x) + "," + n(y)); },
    lineTo(x, y) { log.push("L" + n(x) + "," + n(y)); },
    closePath() { log.push("Z"); },
    arc(x, y, r) { log.push("A" + n(x) + "," + n(y) + "," + r); },
    rect(x, y, w, h) { log.push("R" + [x, y, w, h].map(n).join(",")); },
    quadraticCurveTo(a, b, c, d) { log.push("Q" + [a, b, c, d].map(n).join(",")); },
    arcTo(a, b, c, d, r) { log.push("AT" + [a, b, c, d, r].map(n).join(",")); },
    stroke() { paint("stroke"); },
    fill() { paint("fill"); },
    fillText(s, x, y) { paint("text", { s, x: n(x), y: n(y) }); },
    fillRect(x, y, w, h) { paint("rect", { x, y, w, h }); },
    strokeRect(x, y, w, h) { paint("srect", { x, y, w, h }); },
    measureText(s) { return { width: String(s).length * 5 }; },
  };
  for (const k of ["globalAlpha", "strokeStyle", "fillStyle", "lineWidth", "lineJoin", "lineCap", "lineDashOffset", "font", "textAlign", "textBaseline"])
    Object.defineProperty(ctx, k, { get: () => cur[k], set: (v) => { cur[k] = v; } });
  return { ctx, log };
}
