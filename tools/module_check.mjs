#!/usr/bin/env node
// Free-identifier check for the ES modules in js/.
//
//   node tools/module_check.mjs js/*.js       # whole app
//   node tools/module_check.mjs js/drive*.js  # one module family
//
// Reports names a file USES but never declares, imports, or gets from a global.
// That is exactly the failure mode a file split produces: the code moves, the
// binding does not, and nothing complains until the line runs — module load
// succeeds, `node --check` passes, the app boots, and the feature dies on the
// first click. Every drive/rc/zombies game-mode outage we have had was this.
//
// RUN IT AFTER EVERY FILE SPLIT, before assuming the split worked.
// Exit code is 1 when anything is unresolved, so it works as a gate.
//
// This is a real parse (vendor/acorn) plus a real scope walk, not pattern
// matching: it knows what a binding is, so `for (var k = 0; k < N; k++)` binds
// k and reads N, a shorthand method's name is a property while its params are
// bindings, `var` hoists out of blocks but `let` does not, and text inside
// strings, comments and regex literals is never mistaken for code. A hit is a
// genuine unresolved reference, not a lead.
import fs from "fs";
import path from "path";
import * as acorn from "../vendor/acorn/acorn.mjs";

// Runtime globals the app legitimately reaches for. Anything not declared,
// not imported and not here is unresolved — it will throw when the line runs.
const GLOBALS = new Set(`
globalThis window self document navigator location history screen performance console
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame
queueMicrotask structuredClone fetch alert confirm prompt getComputedStyle matchMedia
localStorage sessionStorage indexedDB crypto caches speechSynthesis devicePixelRatio
atob btoa encodeURI decodeURI encodeURIComponent decodeURIComponent isFinite isNaN
parseFloat parseInt eval undefined NaN Infinity arguments requestIdleCallback reportError
Object Array Function Boolean Number String Symbol BigInt Math JSON Date RegExp Error
TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError
Map Set WeakMap WeakSet WeakRef Promise Proxy Reflect Intl
ArrayBuffer SharedArrayBuffer DataView Atomics
Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array
Float32Array Float64Array BigInt64Array BigUint64Array
Blob File FileReader FormData Headers Request Response URL URLSearchParams AbortController
AbortSignal ReadableStream WritableStream TransformStream CompressionStream TextEncoder
TextDecoder DOMParser XMLSerializer XMLHttpRequest WebSocket Worker MessageChannel
BroadcastChannel EventSource Notification ClipboardItem DataTransfer
Event CustomEvent EventTarget KeyboardEvent MouseEvent PointerEvent WheelEvent TouchEvent
DragEvent InputEvent FocusEvent ProgressEvent MessageEvent CloseEvent ErrorEvent
Element HTMLElement HTMLCanvasElement HTMLImageElement HTMLInputElement Node NodeList
DocumentFragment DOMRect Range Selection MutationObserver IntersectionObserver
ResizeObserver Image Audio Path2D ImageData ImageBitmap createImageBitmap OffscreenCanvas
CanvasTexture MediaRecorder MediaStream AudioContext webkitAudioContext AudioBuffer
RTCPeerConnection RTCSessionDescription RTCIceCandidate RTCDataChannel

L
`.trim().split(/\s+/));
// `L` is Leaflet, which the site/friends map panels use as a <script> global.

// server/ and tools/ run under Node, not the browser.
const NODE_GLOBALS = new Set(`
process Buffer __dirname __filename module require exports global
setImmediate clearImmediate TextEncoderStream TextDecoderStream
`.trim().split(/\s+/));
const isNode = (f) => /(^|\/)(server|tools)\//.test(f.replace(/\\/g, "/"));

// ---- scope model -----------------------------------------------------------
class Scope {
  constructor(parent, kind) {
    this.parent = parent;
    this.kind = kind; // "module" | "function" | "block"
    this.names = new Set();
  }
  add(name) {
    this.names.add(name);
  }
  // `var` and function declarations hoist past blocks to the nearest function
  varTarget() {
    let s = this;
    while (s.kind === "block") s = s.parent;
    return s;
  }
  has(name) {
    for (let s = this; s; s = s.parent) if (s.names.has(name)) return true;
    return false;
  }
}

// Every identifier a binding pattern introduces: {a, b: c, ...d} = [e = 1]
function bindPattern(node, add) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": add(node.name); break;
    case "ObjectPattern":
      node.properties.forEach((p) =>
        bindPattern(p.type === "RestElement" ? p.argument : p.value, add));
      break;
    case "ArrayPattern": node.elements.forEach((e) => bindPattern(e, add)); break;
    case "AssignmentPattern": bindPattern(node.left, add); break;
    case "RestElement": bindPattern(node.argument, add); break;
    default: break;
  }
}

// Declarations are collected for the whole scope body BEFORE walking it — a
// function may legally call something declared further down the file.
function hoist(body, scope) {
  for (const n of body) declare(n, scope);
}

function declare(node, scope) {
  if (!node) return;
  switch (node.type) {
    case "VariableDeclaration":
      node.declarations.forEach((d) =>
        bindPattern(d.id, (n) => (node.kind === "var" ? scope.varTarget() : scope).add(n)));
      break;
    case "FunctionDeclaration":
      if (node.id) scope.varTarget().add(node.id.name);
      break;
    case "ClassDeclaration":
      if (node.id) scope.add(node.id.name);
      break;
    case "ImportDeclaration":
      node.specifiers.forEach((s) => scope.add(s.local.name));
      break;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      if (node.declaration) declare(node.declaration, scope);
      break;
    // `var` also hoists OUT of blocks, loops, try and switch — reach in for it
    case "BlockStatement": node.body.forEach((n) => hoistVarOnly(n, scope)); break;
    case "IfStatement":
      hoistVarOnly(node.consequent, scope);
      hoistVarOnly(node.alternate, scope);
      break;
    case "ForStatement": hoistVarOnly(node.init, scope); hoistVarOnly(node.body, scope); break;
    case "ForInStatement":
    case "ForOfStatement": hoistVarOnly(node.left, scope); hoistVarOnly(node.body, scope); break;
    case "WhileStatement":
    case "DoWhileStatement":
    case "LabeledStatement": hoistVarOnly(node.body, scope); break;
    case "TryStatement":
      hoistVarOnly(node.block, scope);
      if (node.handler) hoistVarOnly(node.handler.body, scope);
      hoistVarOnly(node.finalizer, scope);
      break;
    case "SwitchStatement":
      node.cases.forEach((c) => c.consequent.forEach((n) => hoistVarOnly(n, scope)));
      break;
    default: break;
  }
}

// Same as declare(), but never crosses a function boundary and ignores
// block-scoped names (a `let` inside a block does NOT reach the outer scope).
function hoistVarOnly(node, scope) {
  if (!node) return;
  switch (node.type) {
    case "VariableDeclaration":
      if (node.kind === "var")
        node.declarations.forEach((d) => bindPattern(d.id, (n) => scope.varTarget().add(n)));
      return;
    case "FunctionDeclaration":
      if (node.id) scope.varTarget().add(node.id.name);
      return;
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return;
    default:
      declare(node, scope);
  }
}

// ---- walk ------------------------------------------------------------------
function analyze(ast, onFree, globals) {
  const moduleScope = new Scope(null, "module");
  hoist(ast.body, moduleScope);

  // default values inside a pattern ARE evaluated: `function f(a = b)` reads b
  function walkPatternDefaults(node, scope) {
    if (!node) return;
    switch (node.type) {
      case "AssignmentPattern":
        walkPatternDefaults(node.left, scope);
        walk(node.right, scope);
        return;
      case "ObjectPattern":
        node.properties.forEach((p) => {
          if (p.type === "RestElement") return walkPatternDefaults(p.argument, scope);
          if (p.computed) walk(p.key, scope);
          walkPatternDefaults(p.value, scope);
        });
        return;
      case "ArrayPattern":
        node.elements.forEach((e) => walkPatternDefaults(e, scope));
        return;
      case "RestElement": walkPatternDefaults(node.argument, scope); return;
      case "MemberExpression": walk(node, scope); return;
      default: return;
    }
  }

  function walk(node, scope) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "Identifier":
        if (!scope.has(node.name) && !globals.has(node.name)) onFree(node);
        return;

      // a property name is not a reference unless it is computed
      case "MemberExpression":
        walk(node.object, scope);
        if (node.computed) walk(node.property, scope);
        return;
      case "Property":
      case "PropertyDefinition":
      case "MethodDefinition":
        if (node.computed) walk(node.key, scope);
        walk(node.value, scope);
        return;

      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        const s = new Scope(scope, "function");
        if (node.type === "FunctionExpression" && node.id) s.add(node.id.name);
        node.params.forEach((p) => bindPattern(p, (n) => s.add(n)));
        node.params.forEach((p) => walkPatternDefaults(p, s));
        if (node.body.type === "BlockStatement") {
          hoist(node.body.body, s);
          node.body.body.forEach((n) => walk(n, s));
        } else walk(node.body, s);
        return;
      }
      case "BlockStatement": {
        const s = new Scope(scope, "block");
        hoist(node.body, s);
        node.body.forEach((n) => walk(n, s));
        return;
      }
      case "ForStatement": {
        const s = new Scope(scope, "block");
        if (node.init) declare(node.init, s);
        walk(node.init, s);
        walk(node.test, s);
        walk(node.update, s);
        walk(node.body, s);
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const s = new Scope(scope, "block");
        if (node.left.type === "VariableDeclaration") {
          declare(node.left, s);
          node.left.declarations.forEach((d) => walkPatternDefaults(d.id, s));
        } else walk(node.left, s);
        walk(node.right, s);
        walk(node.body, s);
        return;
      }
      case "CatchClause": {
        const s = new Scope(scope, "block");
        if (node.param) bindPattern(node.param, (n) => s.add(n));
        walk(node.body, s);
        return;
      }
      case "VariableDeclarator":
        walkPatternDefaults(node.id, scope);
        walk(node.init, scope);
        return;
      case "ClassDeclaration":
      case "ClassExpression": {
        const s = new Scope(scope, "block");
        if (node.id) s.add(node.id.name);
        walk(node.superClass, s);
        walk(node.body, s);
        return;
      }
      case "LabeledStatement": walk(node.body, scope); return;
      case "BreakStatement":
      case "ContinueStatement": return; // that is a label, not a reference

      case "ImportDeclaration":
      case "ExportAllDeclaration": return;
      case "ExportNamedDeclaration":
        if (node.source) return; // re-export: the names live in the other module
        if (node.declaration) { walk(node.declaration, scope); return; }
        node.specifiers.forEach((sp) => walk(sp.local, scope));
        return;
      case "ExportSpecifier":
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
      case "MetaProperty":
      case "PrivateIdentifier":
      case "Literal":
      case "TemplateElement":
      case "ThisExpression":
      case "Super":
      case "DebuggerStatement":
      case "EmptyStatement":
        return;
      default: break;
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, scope));
      else if (v && typeof v.type === "string") walk(v, scope);
    }
  }

  ast.body.forEach((n) => walk(n, moduleScope));
}

// ---- run -------------------------------------------------------------------
const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node tools/module_check.mjs <files...>");
  process.exit(2);
}
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (e) {
    console.log(`${f}: PARSE ERROR — ${e.message}`);
    total++;
    continue;
  }
  const globals = isNode(f) ? new Set([...GLOBALS, ...NODE_GLOBALS]) : GLOBALS;
  const seen = new Map();
  analyze(ast, (node) => {
    if (!seen.has(node.name)) seen.set(node.name, node.loc.start);
  }, globals);
  if (seen.size) {
    console.log(path.relative(process.cwd(), f) + ":");
    for (const [name, loc] of seen)
      console.log(`  ${name}  (first use ${loc.line}:${loc.column + 1})`);
    total += seen.size;
  }
}
console.log(total ? `\n${total} free identifier(s)` : "no free identifiers");
process.exit(total ? 1 : 0);
