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
