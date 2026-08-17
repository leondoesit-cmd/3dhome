/* Named parameters for the plan's dimensions.
   ---------------------------------------------------------------------------
   Every wall constraint holds a literal number. That is fine for a one-off and
   wrong for the numbers a drawing is actually built from: a corridor width
   used in four places is four numbers to find and change, and nothing records
   that they were ever the same number. The modeller solved this a while ago
   (js/sketch_equations.js) with named variables and a hand-written expression
   parser; this is the same facility, for the plan.

   THE PARSER IS REUSED, NOT REWRITTEN, and specifically it is never `eval` —
   that rule is the entire reason sketch_equations.js has a tokeniser in it.
   A saved plan is a document that arrives from disk, from an import or from
   another user over the relay, and `eval` on any of those is arbitrary code
   execution in the user's browser. Anything that can appear in a value field
   goes through evaluateExpression().

   A constraint opts in by carrying `expr` (a string) instead of relying on
   `value` alone. `value` is still written — it is the resolved number, kept so
   that everything that reads a constraint (the solver, the plan labels, the
   inspector, the DOF report) needs to know nothing about expressions. */
import { S, uid } from "./state.js";
import { evaluateExpression, isValidName } from "./sketch_equations.js";
import { wallCons } from "./wall_constraints.js";

export function planVars() {
  if (!Array.isArray(S.planVars)) S.planVars = [];
  return S.planVars;
}

/* A name is usable if it parses as an identifier and nothing else has claimed
   it. Checked before the variable is created, because a duplicate name would
   make one of the two silently unreachable. */
export function nameFree(name, owner) {
  if (!isValidName(name)) return false;
  return !planVars().some(function (v) {
    return v !== owner && v.name === String(name).trim();
  });
}

export function addPlanVar(name, expr) {
  if (!nameFree(name)) return null;
  var v = { id: "pv" + uid(), name: String(name).trim(), expr: String(expr) };
  planVars().push(v);
  return v;
}
export function removePlanVar(id) {
  var before = planVars().length;
  S.planVars = planVars().filter(function (v) {
    return v.id !== id;
  });
  return S.planVars.length !== before;
}
export function setPlanVar(id, name, expr) {
  var v = planVars().find(function (q) {
    return q.id === id;
  });
  if (!v) return false;
  if (name != null) {
    if (!nameFree(name, v)) return false;
    v.name = String(name).trim();
  }
  if (expr != null) v.expr = String(expr);
  return true;
}

/* Resolve every variable, then every constraint that is written as an
   expression, and write the numbers back onto the constraints.

   A CYCLE OR A TYPO LEAVES THE LAST GOOD VALUE IN PLACE and is reported. The
   alternative — refusing to resolve anything until the document is perfect —
   means one bad character in one field stops the whole plan from solving,
   which is not a document anyone can work in. Same bargain sketch_equations
   struck, and the same reason. */
export function resolvePlanParams() {
  var vars = planVars(),
    values = new Map(),
    visiting = new Set(),
    errors = [];

  function lookupFor(name) {
    var v = vars.find(function (q) {
      return q.name === name;
    });
    if (!v) return undefined;
    return resolveVar(v);
  }

  function resolveVar(v) {
    if (values.has(v.id)) return values.get(v.id);
    if (visiting.has(v.id)) {
      errors.push({ id: v.id, name: v.name, message: "Circular reference" });
      return undefined;
    }
    visiting.add(v.id);
    var out;
    try {
      out = evaluateExpression(v.expr, lookupFor);
    } catch (e) {
      errors.push({ id: v.id, name: v.name, message: e.message });
      out = undefined;
    }
    visiting.delete(v.id);
    values.set(v.id, out);
    return out;
  }

  vars.forEach(resolveVar);

  wallCons().forEach(function (c) {
    if (!c.expr) return;
    try {
      var n = evaluateExpression(c.expr, lookupFor);
      // an expression that resolves to nonsense must not overwrite a good
      // number with NaN — the solver would then move corners to nowhere
      if (Number.isFinite(n)) c.value = n;
      else errors.push({ id: c.id, name: c.expr, message: "Result is not a number" });
    } catch (e) {
      errors.push({ id: c.id, name: c.expr, message: e.message });
    }
  });

  return {
    values: values,
    errors: errors,
    named: vars.map(function (v) {
      return { id: v.id, name: v.name, expr: v.expr, value: values.get(v.id) };
    }),
  };
}

/* Give a constraint an expression instead of a literal. Passing null or an
   empty string takes the expression away and leaves the last resolved number
   as a plain literal, which is what "unlink this dimension" means. */
export function setConExpr(id, expr) {
  var c = wallCons().find(function (q) {
    return q.id === id;
  });
  if (!c) return false;
  if (expr == null || String(expr).trim() === "") {
    delete c.expr;
    return true;
  }
  c.expr = String(expr);
  return true;
}
