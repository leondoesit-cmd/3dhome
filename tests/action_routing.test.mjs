// runAction (js/ui/run_action.js) picks a domain handler with
// `if (RUN_X_ACTIONS.has(act)) return runXAction(act, ev)`. Each Set lives beside
// its handler in js/ui/*_actions.js. A handler branch whose name is missing from
// its Set is dead: runAction never routes the action there. This reads the
// sources (no browser, no three) and keeps Set and branches in step.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as acorn from "../vendor/acorn/acorn.mjs";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");
const parse = (code) => acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
const strLit = (n) => n && n.type === "Literal" && typeof n.value === "string";
const isAct = (n) => n && n.type === "Identifier" && n.name === "act";

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === "string") walk(v, visit);
  }
}

function objectKeys(obj) {
  return obj.properties.map((p) => (p.key.type === "Identifier" ? p.key.name : p.key.value));
}

const ACTION_FILES = ["selection", "wall", "file", "view", "opening"].map((n) => `js/ui/${n}_actions.js`);
const [runActionSrc, initUiSrc, ...fileSrcs] = await Promise.all(
  ["js/ui/run_action.js", "js/ui/init_ui.js", ...ACTION_FILES].map(read));

// the keys of the align table uiLocals.AL_ACTS (assigned in initUI)
const alKeys = [];
walk(parse(initUiSrc), (n) => {
  if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" &&
      n.left.property.name === "AL_ACTS" && n.right.type === "ObjectExpression") {
    alKeys.push(...objectKeys(n.right));
  }
});

// Set name -> { file, names }, and handler name -> { file, names tested }
const sets = new Map();
const handlers = new Map();
ACTION_FILES.forEach((file, i) => {
  const ast = parse(fileSrcs[i]);
  for (const top of ast.body) {
    if (top.type === "ExportNamedDeclaration" && top.declaration && top.declaration.type === "VariableDeclaration") {
      for (const d of top.declaration.declarations) {
        if (d.init && d.init.type === "NewExpression" && d.init.callee.name === "Set") {
          sets.set(d.id.name, { file, names: d.init.arguments[0].elements.map((e) => e.value) });
        }
      }
    }
    if (top.type !== "FunctionDeclaration" || !/^run\w+Action$/.test(top.id.name)) continue;
    const names = new Set();
    const localObjects = new Map(); // var conKinds = { name: ... }
    walk(top.body, (n) => {
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init && n.init.type === "ObjectExpression") {
        localObjects.set(n.id.name, n.init);
      }
    });
    walk(top.body, (n) => {
      if (n.type === "BinaryExpression" && /^[!=]==?$/.test(n.operator)) {
        if (isAct(n.left) && strLit(n.right)) names.add(n.right.value);
        if (isAct(n.right) && strLit(n.left)) names.add(n.left.value);
      } else if (n.type === "CallExpression" && n.callee.type === "MemberExpression" &&
          /^(indexOf|includes)$/.test(n.callee.property.name) && isAct(n.arguments[0]) &&
          n.callee.object.type === "ArrayExpression" && n.callee.object.elements.every(strLit)) {
        n.callee.object.elements.forEach((e) => names.add(e.value));
      } else if (n.type === "MemberExpression" && n.computed && isAct(n.property)) {
        const o = n.object;
        if (o.type === "ObjectExpression") objectKeys(o).forEach((k) => names.add(k));
        else if (o.type === "Identifier" && localObjects.has(o.name)) objectKeys(localObjects.get(o.name)).forEach((k) => names.add(k));
        else if (o.type === "MemberExpression" && o.property.name === "AL_ACTS") alKeys.forEach((k) => names.add(k));
      }
    });
    handlers.set(top.id.name, { file, names });
  }
});

// Set name -> handler name, read from runAction's dispatch lines
const routes = new Map();
walk(parse(runActionSrc), (n) => {
  if (n.type === "IfStatement" && n.test.type === "CallExpression" &&
      n.test.callee.type === "MemberExpression" && n.test.callee.property.name === "has" &&
      n.test.callee.object.type === "Identifier" && /^RUN_\w+_ACTIONS$/.test(n.test.callee.object.name) &&
      n.consequent.type === "ReturnStatement") {
    routes.set(n.test.callee.object.name, n.consequent.argument.callee.name);
  }
});

test("align table names are found", () => {
  assert.ok(alKeys.length >= 9 && alKeys.every((k) => /^al[A-Z]/.test(k)), alKeys.join());
});

test("every Set is dispatched by runAction to a handler beside it", () => {
  assert.ok(sets.size >= 11, `found ${sets.size} sets`);
  for (const [setName, { file }] of sets) {
    const handler = routes.get(setName);
    assert.ok(handler, `${setName} is not used in a runAction dispatch line`);
    assert.equal(handlers.get(handler) && handlers.get(handler).file, file,
      `${setName} lives in ${file} but its handler ${handler} does not`);
  }
  for (const setName of routes.keys()) assert.ok(sets.has(setName), `${setName} is not defined in a *_actions.js`);
});

test("no action name is in two Sets", () => {
  const seen = new Map();
  for (const [setName, { names }] of sets) {
    for (const name of names) {
      assert.ok(!seen.has(name), `"${name}" is in both ${seen.get(name)} and ${setName}`);
      seen.set(name, setName);
    }
    assert.equal(new Set(names).size, names.length, `${setName} repeats a name`);
  }
});

test("every action a handler tests is in that handler's Set", () => {
  for (const [setName, handler] of routes) {
    const { names } = handlers.get(handler);
    const set = new Set(sets.get(setName).names);
    for (const name of names) {
      assert.ok(set.has(name), `${handler} has a branch for "${name}" but ${setName} lacks it: runAction would never route it`);
    }
  }
});

test("every name in a Set has a branch in its handler", () => {
  for (const [setName, handler] of routes) {
    const { names } = handlers.get(handler);
    for (const name of sets.get(setName).names) {
      assert.ok(names.has(name), `${setName} lists "${name}" but ${handler} has no branch for it`);
    }
  }
});

test("the Sets cover every branch name of every handler", () => {
  const registered = new Set([...sets.values()].flatMap((s) => s.names));
  for (const [handler, { names }] of handlers) {
    for (const name of names) assert.ok(registered.has(name), `${handler}: "${name}" is in no RUN_*_ACTIONS Set`);
  }
  assert.equal(handlers.size, routes.size, "a handler exists that runAction never dispatches to");
});
