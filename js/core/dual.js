// Forward-mode automatic differentiation over sparse dual numbers.
//
// The sketch solver used to take its Jacobian by finite differences. That is
// fine for stepping towards a solution, but the same Jacobian decides the
// degrees-of-freedom count, and there it has to tell an exactly dependent row
// from an independent one. A forward difference is off by ~1e-5, so two rows
// that are the same equation came out 1e-5 apart and counted twice; a central
// difference is closer but reads a zero slope across any |…|. Differentiating
// the residual expressions themselves gives slopes exact to rounding, so the
// rank is a property of the sketch rather than of the step size.
//
// A value is either a plain number (a constant) or {v, g}, where g is a flat
// [index, derivative, index, derivative, …] list over the solver's variables —
// a residual touches a handful of coordinates out of hundreds, so a dense
// gradient per intermediate would be all zeros. Every operation accepts either
// kind and returns a plain number when no input carries a gradient, so the
// same residual code evaluates at full speed when only values are wanted.

const isDual = (a) => typeof a === "object" && a !== null;

export const valueOf = (a) => (isDual(a) ? a.v : a);

export function variable(value, index) {
  return { v: value, g: [index, 1] };
}

/* v with gradient da·∇a + db·∇b. Returns a plain number when that gradient is
   identically zero, which keeps constant subexpressions allocation-free. */
function chain(v, a, da, b, db) {
  const ga = isDual(a) && da !== 0 ? a.g : null;
  const gb = isDual(b) && db !== 0 ? b.g : null;
  if (!ga && !gb) return v;
  const g = [];
  if (ga) for (let i = 0; i < ga.length; i += 2) g.push(ga[i], ga[i + 1] * da);
  if (gb) {
    for (let i = 0; i < gb.length; i += 2) {
      const k = gb[i], d = gb[i + 1] * db;
      let j = 0;
      for (; j < g.length; j += 2) if (g[j] === k) { g[j + 1] += d; break; }
      if (j >= g.length) g.push(k, d);
    }
  }
  return { v, g };
}

export const add = (a, b) => chain(valueOf(a) + valueOf(b), a, 1, b, 1);
export const sub = (a, b) => chain(valueOf(a) - valueOf(b), a, 1, b, -1);
export const neg = (a) => chain(-valueOf(a), a, -1, 0, 0);
export const scale = (a, k) => chain(valueOf(a) * k, a, k, 0, 0);

export function mul(a, b) {
  const va = valueOf(a), vb = valueOf(b);
  return chain(va * vb, a, vb, b, va);
}

export function div(a, b) {
  const va = valueOf(a), vb = valueOf(b);
  return chain(va / vb, a, 1 / vb, b, -va / (vb * vb));
}

/* At the origin the length has no gradient. A finite difference read +1 along
   each axis there, and a point sitting exactly on a centre it must move off
   relies on that push, so keep it rather than return a flat zero. */
export function hypot(x, y) {
  const vx = valueOf(x), vy = valueOf(y), h = Math.hypot(vx, vy);
  return h > 0 ? chain(h, x, vx / h, y, vy / h) : chain(0, x, 1, y, 1);
}

export function atan2(y, x) {
  const vx = valueOf(x), vy = valueOf(y), r2 = vx * vx + vy * vy;
  return r2 > 0 ? chain(Math.atan2(vy, vx), y, vx / r2, x, -vy / r2) : Math.atan2(vy, vx);
}

// the kink takes the forward-difference side, as the numeric Jacobian did
export function abs(a) {
  const va = valueOf(a);
  return chain(Math.abs(va), a, va < 0 ? -1 : 1, 0, 0);
}

export function cos(a) {
  const va = valueOf(a);
  return chain(Math.cos(va), a, -Math.sin(va), 0, 0);
}

export function sin(a) {
  const va = valueOf(a);
  return chain(Math.sin(va), a, Math.cos(va), 0, 0);
}

// max(a, k) against a constant floor: the floor has no slope
export const atLeast = (a, k) => (valueOf(a) > k ? a : k);

/* Wrap an angle into (−π, π] by adding a whole number of turns. The turns are a
   constant, so the slope passes through unchanged. */
export function wrapTurn(a) {
  let w = valueOf(a);
  w %= Math.PI * 2;
  if (w > Math.PI) w -= Math.PI * 2;
  if (w < -Math.PI) w += Math.PI * 2;
  return chain(w, a, 1, 0, 0);
}

/* Scatter residual values into dense Jacobian rows. */
export function gradientRows(terms, columns) {
  return terms.map((t) => {
    const row = new Array(columns).fill(0);
    if (isDual(t)) for (let i = 0; i < t.g.length; i += 2) row[t.g[i]] += t.g[i + 1];
    return row;
  });
}
