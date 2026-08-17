import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExpression, resolveEquations, collectSymbols,
  isValidName, nameAvailable, addVariable, removeVariable,
} from "../js/sketch_equations.js";

const ev = (src, scope = {}) => evaluateExpression(src, (n) => scope[n]);

test("arithmetic, precedence, unary minus and parentheses", () => {
  assert.equal(ev("2 + 3 * 4"), 14);
  assert.equal(ev("(2 + 3) * 4"), 20);
  assert.equal(ev("-5 + 2"), -3);
  assert.equal(ev("10 / 4"), 2.5);
  assert.equal(ev("7 % 4"), 3);
  assert.equal(ev("2 ^ 3 ^ 2"), 512, "exponent is right associative");
  assert.equal(ev("1.5 * 2"), 3);
});

test("names resolve against the document, and unknown ones are an error", () => {
  assert.equal(ev("Width / 2", { Width: 80 }), 40);
  assert.equal(ev("Width * 2 + Depth", { Width: 10, Depth: 5 }), 25);
  assert.throws(() => ev("Nope + 1"), /Unknown name/);
});

test("the function table works in degrees and rejects misuse", () => {
  assert.ok(Math.abs(ev("sin(30)") - 0.5) < 1e-12, "trig takes degrees");
  assert.equal(ev("max(3, 9)"), 9);
  assert.equal(ev("round(2.6)"), 3);
  assert.equal(ev("sqrt(16)"), 4);
  assert.throws(() => ev("sqrt(-1)"), /negative/);
  assert.throws(() => ev("min(3)"), /argument/);
  assert.throws(() => ev("bogus(2)"), /Unknown function/);
  assert.throws(() => ev("1 / 0"), /zero/);
});

/* Expressions ride along inside saved models, scene JSON and imported files.
   They must never reach a JS evaluator. */
test("expressions cannot reach JavaScript", () => {
  const attacks = [
    "constructor.constructor('return 1')()",
    "globalThis.alert(1)",
    "this.constructor",
    "[].constructor",
    "1;alert(1)",
    "__proto__",
    "process.exit(1)",
    "`${1}`",
  ];
  for (const src of attacks) {
    assert.throws(() => ev(src), undefined, `must refuse: ${src}`);
  }
  // and a name that happens to exist on Object.prototype is not a value
  assert.throws(() => ev("toString + 1"), /Unknown name/);
  assert.throws(() => ev("hasOwnProperty"), /Unknown name/);
});

test("syntax errors are refused rather than guessed at", () => {
  ["2 +", "(2", "2 3", "*", "", "2 ** 3", "1 @ 2"].forEach((src) => {
    assert.throws(() => ev(src), undefined, `must refuse: ${src}`);
  });
});

/* ---- document-level resolution ---- */

const doc = () => ({
  variables: [],
  sketches: [{
    id: "s1", plane: "top", points: [], entities: [],
    constraints: [
      { id: "c1", type: "distance", entity: "e1", value: 100, name: "Width" },
      { id: "c2", type: "distance", entity: "e2", value: 10, name: "Height", expr: "Width / 2" },
    ],
  }],
});

test("a dimension written in terms of another resolves to its value", () => {
  const d = doc();
  const { errors } = resolveEquations(d);
  assert.deepEqual(errors, []);
  assert.equal(d.sketches[0].constraints[1].value, 50);
});

test("global variables drive dimensions, and changing one drives everything", () => {
  const d = doc();
  addVariable(d, "Span", "240");
  d.sketches[0].constraints[0].expr = "Span / 2";
  resolveEquations(d);
  assert.equal(d.sketches[0].constraints[0].value, 120, "Width = Span/2");
  assert.equal(d.sketches[0].constraints[1].value, 60, "Height = Width/2 follows");

  d.variables[0].expr = "400";
  resolveEquations(d);
  assert.equal(d.sketches[0].constraints[0].value, 200);
  assert.equal(d.sketches[0].constraints[1].value, 100);
});

test("a circular equation is reported and leaves the last good value alone", () => {
  const d = doc();
  d.sketches[0].constraints[0].expr = "Height * 2";   // Width <-> Height
  const { errors } = resolveEquations(d);
  assert.ok(errors.length, "the cycle is reported");
  assert.ok(/Circular/.test(errors[0].message));
  assert.equal(d.sketches[0].constraints[0].value, 100, "the previous value survives");
  assert.ok(d.sketches[0].constraints[0].exprError);
});

test("a bad expression flags itself and its dependants, but nothing else", () => {
  const d = doc();
  addVariable(d, "Good", "12");
  d.sketches[0].constraints[0].expr = "Missing + 1";        // Width is broken
  const { errors } = resolveEquations(d);
  // Height is written in terms of Width, so it is broken too — saying otherwise
  // would leave a stale number sitting in the document looking authoritative
  assert.deepEqual(errors.map((e) => e.name).sort(), ["Height", "Width"]);
  assert.equal(d.variables[0].value, 12, "an unrelated variable still resolved");
  assert.equal(d.sketches[0].constraints[0].value, 100, "each broken node kept its last good value");
  assert.equal(d.sketches[0].constraints[1].value, 10);
});

test("dimensions in different sketches can reference each other", () => {
  const d = doc();
  d.sketches.push({
    id: "s2", plane: "front", points: [], entities: [],
    constraints: [{ id: "c3", type: "distance", entity: "e3", value: 0, name: "Depth", expr: "Width * 0.25" }],
  });
  resolveEquations(d);
  assert.equal(d.sketches[1].constraints[0].value, 25);
});

test("an expression on an unnamed dimension still resolves", () => {
  const d = doc();
  d.sketches[0].constraints.push({ id: "c9", type: "radius", entity: "C", value: 0, expr: "Width / 10" });
  resolveEquations(d);
  assert.equal(d.sketches[0].constraints[2].value, 10);
});

test("names are validated and cannot collide or shadow the language", () => {
  const d = doc();
  assert.equal(isValidName("Width"), true);
  assert.equal(isValidName("2Wide"), false);
  assert.equal(isValidName("has space"), false);
  assert.equal(nameAvailable(d, "Width"), false, "already taken");
  assert.equal(nameAvailable(d, "Width", d.sketches[0].constraints[0]), true, "except by its owner");
  assert.equal(nameAvailable(d, "sin"), false, "a function name is not free");
  assert.equal(nameAvailable(d, "pi"), false);
  assert.equal(nameAvailable(d, "Legroom"), true);
});

test("the symbol table lists variables and named dimensions, and removal works", () => {
  const d = doc();
  const v = addVariable(d, "Span", "240");
  assert.deepEqual([...collectSymbols(d).keys()].sort(), ["Height", "Span", "Width"]);
  assert.equal(removeVariable(d, v.id), true);
  assert.deepEqual([...collectSymbols(d).keys()].sort(), ["Height", "Width"]);
  assert.equal(removeVariable(d, "nope"), false);
});
