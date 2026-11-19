import { parse } from '../../vendor/acorn/acorn.mjs';

const parsed = new Map();

// Read the declaration itself rather than depending on indentation or line endings.
export function sourceFunctionText(source, name) {
  let functions = parsed.get(source);
  if (!functions) {
    functions = new Map();
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration' && node.id) {
        const matches = functions.get(node.id.name) || [];
        matches.push(node);
        functions.set(node.id.name, matches);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
    parsed.set(source, functions);
  }
  const matches = functions.get(name) || [];
  if (matches.length !== 1) throw new Error(`Expected one function ${name}, found ${matches.length}`);
  return source.slice(matches[0].start, matches[0].end);
}

// Split modules write their host module's top-level state through generated
// `set_<name>(value)` setters that live in the host module. Source evaluated in a
// sandbox (new Function / vm) has no such setter, so declare one per call: function
// declarations hoist, and <name> resolves to whatever the sandbox provides (a prelude
// var, a Function parameter or a vm context property).
export function withSetters(code) {
  const declared = new Set([...code.matchAll(/\bfunction\s+set_([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  const names = new Set();
  for (const m of code.matchAll(/\bset_([A-Za-z_$][\w$]*)\(/g)) if (!declared.has(m[1])) names.add(m[1]);
  if (!names.size) return code;
  return `${code}\n${[...names].map(n => `function set_${n}(value) { return ${n} = value; }`).join('\n')}\n`;
}

// The history block as one runnable text, the way it read in one piece before the
// split: `const H = createHistory({...});`, the save-session state and the helpers over
// it. { snapshots: true } puts the snapshot codec and snapDoc in front.
export function documentHistoryText(source, { snapshots = false } = {}) {
  const at = source.indexOf('const H = createHistory({');
  const history = source.slice(at, source.indexOf('\n});', at) + 4);
  const state = /const assemblySaveSessions = [^;]*;\s*let partHistoryMarker = [^;]*;/.exec(source)[0];
  const helpers = ['assemblySaveSession', 'activeHistoryMarker', 'residentDirtyState', 'hasResidentEdits']
    .map(name => sourceFunctionText(source, name));
  const codec = snapshots ? `${/const historySnapshots = [^;]*;/.exec(source)[0]}\n${sourceFunctionText(source, 'snapDoc')}\n` : '';
  return [codec + history, state, ...helpers].join('\n');
}
