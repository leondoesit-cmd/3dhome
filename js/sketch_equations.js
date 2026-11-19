// Named dimensions and the equations between them.
//
// A driving dimension can carry a name ("Width") and any other dimension or
// global variable can be written in terms of it ("Height = Width / 2"). That is
// what turns a set of numbers into a design that resizes as one thing.
//
// Expressions are parsed and evaluated by this module — never by `eval` or
// `new Function`. Model documents are saved to localStorage, embedded in scene
// JSON and imported from files other people made; an expression field that
// reaches a JS evaluator is a script-injection hole in every one of those
// paths. The grammar below is the entire language: numbers, the five
// arithmetic operators, parentheses, a fixed function table, and names that
// resolve against the document's own symbols.

const MAX_DEPTH = 64;

/* ---- tokenizer ---- */
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidName(name) {
  return typeof name === "string" && NAME_RE.test(name.trim());
}

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch >= "0" && ch <= "9" || (ch === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
      const text = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i)[0];
      out.push({ t: "num", v: Number(text) });
      i += text.length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "name", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^(),".includes(ch)) { out.push({ t: ch }); i++; continue; }
    throw new Error("Unexpected character: " + ch);
  }
  return out;
}

/* ---- functions available to expressions ---- */
const DEG = Math.PI / 180;
const FUNCS = {
  abs: [1, Math.abs],
  sqrt: [1, (x) => { if (x < 0) throw new Error("sqrt of a negative number"); return Math.sqrt(x); }],
  round: [1, Math.round], floor: [1, Math.floor], ceil: [1, Math.ceil],
  // trigonometry in degrees: a CAD document states its angles in degrees, and
  // silently switching to radians inside an equation is a trap
  sin: [1, (x) => Math.sin(x * DEG)], cos: [1, (x) => Math.cos(x * DEG)], tan: [1, (x) => Math.tan(x * DEG)],
  asin: [1, (x) => Math.asin(x) / DEG], acos: [1, (x) => Math.acos(x) / DEG], atan: [1, (x) => Math.atan(x) / DEG],
  min: [2, Math.min], max: [2, Math.max], pow: [2, Math.pow], atan2: [2, (y, x) => Math.atan2(y, x) / DEG],
};
const CONSTS = { pi: Math.PI, e: Math.E };

/* ---- unit literals ----
   Geometry is stored in centimetres and degrees. `4.900in` or `111.13mm` is
   rewritten to plain arithmetic before parsing, so a dimension typed from an
   inch drawing keeps its unit in the saved expression and still rebuilds. */
const UNIT_FACTORS = {
  length: { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 },
  angle: { deg: 1, rad: 180 / Math.PI },
};

export function expandUnitLiterals(src, unit) {
  const factors = UNIT_FACTORS[unit];
  const text = String(src == null ? "" : src);
  if (!factors) return text;
  return text.replace(/(^|[^A-Za-z0-9_.])(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?\s*(mm|cm|in|ft|m|deg|rad)\b/gi, (_, prefix, number, exponent, name) => {
    const factor = factors[name.toLowerCase()];
    if (factor == null) throw new Error("Incorrect unit for this field");
    return prefix + "(" + number + (exponent || '') + "*" + factor + ")";
  });
}

export function dimensionUnit(constraint) {
  return constraint && ["angle", "rotation"].includes(constraint.type) ? "angle" : "length";
}

/* ---- recursive-descent parser + evaluator ---- */
function parse(tokens, lookup) {
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const eat = (t) => {
    if (!tokens[pos] || tokens[pos].t !== t) throw new Error("Expected " + t);
    return tokens[pos++];
  };

  function expr() {
    let left = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = tokens[pos++].t, right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function term() {
    let left = unary();
    while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%")) {
      const op = tokens[pos++].t, right = unary();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Division by zero");
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === "^") { pos++; return Math.pow(base, unary()); }  // right associative
    return base;
  }
  function unary() {
    if (++depth > MAX_DEPTH) throw new Error("Expression nests too deeply");
    try {
      if (peek() && peek().t === "-") { pos++; return -unary(); }
      if (peek() && peek().t === "+") { pos++; return unary(); }
      return power();
    } finally { depth--; }
  }
  function primary() {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") { pos++; return tok.v; }
    if (tok.t === "(") { pos++; const v = expr(); eat(")"); return v; }
    if (tok.t === "name") {
      pos++;
      const name = tok.v;
      if (peek() && peek().t === "(") {
        pos++;
        const args = [];
        if (peek() && peek().t !== ")") {
          args.push(expr());
          while (peek() && peek().t === ",") { pos++; args.push(expr()); }
        }
        eat(")");
        const fn = FUNCS[name.toLowerCase()];
        if (!fn) throw new Error("Unknown function: " + name);
        if (args.length !== fn[0]) throw new Error(name + " takes " + fn[0] + " argument(s)");
        return fn[1].apply(null, args);
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, name.toLowerCase())) return CONSTS[name.toLowerCase()];
      const value = lookup(name);
      if (value === undefined || value === null || !Number.isFinite(value)) throw new Error("Unknown name: " + name);
      return value;
    }
    throw new Error("Unexpected token");
  }

  const value = expr();
  if (pos !== tokens.length) throw new Error("Unexpected trailing input");
  return value;
}

/* Evaluate one expression against a symbol lookup. Throws with a message meant
   to be shown next to the field the user typed it into. */
export function evaluateExpression(src, lookup = () => undefined) {
  if (typeof src === "number") {
    if (!Number.isFinite(src)) throw new Error("Result is not a number");
    return src;
  }
  const text = String(src == null ? "" : src).trim();
  if (!text) throw new Error("Empty expression");
  const value = parse(tokenize(text), lookup);
  if (!Number.isFinite(value)) throw new Error("Result is not a number");
  return value;
}

/* ---- the document's symbol table ----
   Global variables plus every named driving dimension in every sketch. Names
   are unique across the document, which is what lets one sketch's dimension be
   written in terms of another's. */
export function collectSymbols(def) {
  const symbols = new Map();
  (def.variables || []).forEach((v) => {
    if (isValidName(v.name)) symbols.set(v.name, { kind: "variable", node: v });
  });
  (def.sketches || []).forEach((sketch) => {
    (sketch.constraints || []).forEach((c) => {
      if ((c.value != null || String(c.expr || "").trim()) && isValidName(c.name)) symbols.set(c.name, { kind: "dimension", node: c, sketch });
    });
  });
  return symbols;
}

/* Resolve every variable and every expression-driven dimension, in dependency
   order, and write the results back onto the nodes. A cycle or a bad expression
   leaves the last good value in place and is reported — a document that stops
   rebuilding because of one typo in one field is not a usable document. */
export function resolveEquations(def, suppressedSketchIds) {
  const symbols = collectSymbols(def);
  const cache = new Map();
  const visiting = new Set();
  const errors = [];

  // Keep every named dimension available to valueOf. A suppressed equation
  // can still be a dependency of an active expression. Report the failure at
  // each active consumer, even if its input has a last good numeric value.
  function reportError(node, name, sketch, error) {
    if (sketch && (suppressedSketchIds?.has(sketch.id) ?? sketch.suppressed)) {
      node.exprError = null;
      return;
    }
    node.exprError = String(error.message || error);
    errors.push({name, sketchId:sketch?.id, message:node.exprError});
  }

  function nodeExpression(entry) {
    return entry.kind === "variable" ? entry.node.expr : entry.node.expr;
  }

  function valueOf(name, depth) {
    if (cache.has(name)) return cache.get(name);
    const entry = symbols.get(name);
    if (!entry) return undefined;
    if (visiting.has(name)) throw new Error("Circular reference: " + name);
    if (depth > MAX_DEPTH) throw new Error("Expression nests too deeply");
    visiting.add(name);
    try {
      const expr = nodeExpression(entry);
      let value;
      if (expr == null || String(expr).trim() === "") {
        value = Number(entry.kind === "variable" ? entry.node.value : entry.node.value) || 0;
      } else {
        const source = entry.kind === "dimension" ? expandUnitLiterals(expr, dimensionUnit(entry.node)) : expr;
        value = evaluateExpression(source, (ref) => valueOf(ref, depth + 1));
      }
      cache.set(name, value);
      return value;
    } finally {
      visiting.delete(name);
    }
  }

  // named symbols first, so unnamed expression-driven dimensions can use them
  symbols.forEach((entry, name) => {
    try {
      const value = valueOf(name, 0);
      entry.node.value = value;
      entry.node.exprError = null;
    } catch (error) {
      reportError(entry.node, name, entry.sketch, error);
    }
  });

  // anonymous dimensions that still carry an expression
  (def.sketches || []).forEach((sketch) => {
    (sketch.constraints || []).forEach((c) => {
      if (isValidName(c.name)) return;                 // already handled above
      if (c.expr == null || String(c.expr).trim() === "") { c.exprError = null; return; }
      try {
        c.value = evaluateExpression(expandUnitLiterals(c.expr, dimensionUnit(c)), (ref) => valueOf(ref, 0));
        c.exprError = null;
      } catch (error) {
        reportError(c, c.id, sketch, error);
      }
    });
  });

  return { values: cache, errors };
}

/* A name is usable if it parses as an identifier, is not a function or constant
   this language already defines, and is not taken by another symbol. */
export function nameAvailable(def, name, owner) {
  if (!isValidName(name)) return false;
  const lower = name.toLowerCase();
  if (FUNCS[lower] || Object.prototype.hasOwnProperty.call(CONSTS, lower)) return false;
  const symbols = collectSymbols(def);
  const found = symbols.get(name.trim());
  return !found || found.node === owner;
}

export function addVariable(def, name, expr) {
  def.variables ||= [];
  const variable = { id: "var_" + def.variables.length + "_" + Math.random().toString(36).slice(2, 7), name: name, expr: String(expr) };
  def.variables.push(variable);
  return variable;
}

export function removeVariable(def, id) {
  if (!Array.isArray(def.variables)) return false;
  const before = def.variables.length;
  def.variables = def.variables.filter((v) => v.id !== id);
  return def.variables.length !== before;
}
