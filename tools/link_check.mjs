#!/usr/bin/env node
// Static ES-module linker for the browser graph.
//
//   node tools/link_check.mjs
//
// `npm test` never loads js/main.js: Node cannot resolve the bare `three`
// import-map specifiers, so a missing named export is invisible until a
// browser evaluates the graph and the whole UI fails to initialise. This
// walk starts at the <script type="module"> tags in index.html, follows
// every static import, and checks that each named import exists as an
// export of the target — the exact SyntaxError a truncated comment or a
// forgotten `export` produces.
//
// Vendor / node_modules files are existence-checked only (their exports
// come from upstream). App modules are parsed with vendor/acorn.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { REPO_ROOT } from "./module_check.mjs";

const PARSE = { ecmaVersion: "latest", sourceType: "module", locations: true };

function rel(root, file) {
  return path.relative(root, file).split(path.sep).join("/") || file;
}

function stripQuery(spec) {
  return String(spec).split(/[?#]/)[0];
}

function isOpaque(file) {
  const n = file.split(path.sep).join("/");
  return n.includes("/vendor/") || n.includes("/node_modules/") || n.includes("/assets/");
}

function bindDeclNames(node, add) {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      add(node.name);
      return;
    case "ObjectPattern":
      node.properties.forEach((p) =>
        bindDeclNames(p.type === "RestElement" ? p.argument : p.value, add),
      );
      return;
    case "ArrayPattern":
      node.elements.forEach((e) => bindDeclNames(e, add));
      return;
    case "AssignmentPattern":
      bindDeclNames(node.left, add);
      return;
    case "RestElement":
      bindDeclNames(node.argument, add);
      return;
    case "FunctionDeclaration":
    case "ClassDeclaration":
      if (node.id) add(node.id.name);
      return;
    case "VariableDeclaration":
      node.declarations.forEach((d) => bindDeclNames(d.id, add));
      return;
    default:
      return;
  }
}

export function inspectModule(src) {
  const ast = acorn.parse(src, PARSE);
  const imports = [];
  const exportNames = new Set();
  const reexports = [];
  const workers = [];
  const assetUrls = [];

  function addDynamic(source, loc) {
    if (typeof source === "string")
      imports.push({
        source,
        names: [],
        default: false,
        namespace: false,
        dynamic: true,
        loc,
      });
  }

  function walk(node) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "ImportExpression") {
      const srcNode = node.source;
      if (srcNode.type === "Literal" && typeof srcNode.value === "string")
        addDynamic(srcNode.value, node.loc && node.loc.start);
      return;
    }
    if (node.type === "NewExpression") {
      const callee = node.callee;
      const name = callee.type === "Identifier" ? callee.name : "";
      const arg0 = node.arguments && node.arguments[0];
      if (name === "Worker" && arg0 && arg0.type === "Literal" && typeof arg0.value === "string")
        workers.push({ source: arg0.value, loc: node.loc && node.loc.start });
      if (name === "URL" && arg0 && arg0.type === "Literal" && typeof arg0.value === "string")
        assetUrls.push({ source: arg0.value, loc: node.loc && node.loc.start });
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c));
      else if (v && typeof v.type === "string") walk(v);
    }
  }

  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      const rec = {
        source: node.source.value,
        names: [],
        default: false,
        namespace: false,
        dynamic: false,
        loc: node.loc && node.loc.start,
      };
      for (const s of node.specifiers) {
        if (s.type === "ImportDefaultSpecifier") rec.default = true;
        else if (s.type === "ImportNamespaceSpecifier") rec.namespace = true;
        else rec.names.push(s.imported.name);
      }
      imports.push(rec);
    } else if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) bindDeclNames(node.declaration, (n) => exportNames.add(n));
      if (node.source) {
        reexports.push({
          source: node.source.value,
          star: false,
          names: node.specifiers.map((s) => ({
            imported: s.local.name,
            exported: s.exported.name,
          })),
          loc: node.loc && node.loc.start,
        });
      } else {
        for (const s of node.specifiers) exportNames.add(s.exported.name);
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exportNames.add("default");
    } else if (node.type === "ExportAllDeclaration") {
      reexports.push({
        source: node.source.value,
        star: !node.exported,
        as: node.exported ? node.exported.name : null,
        names: [],
        loc: node.loc && node.loc.start,
      });
    }
  }
  walk(ast);
  return { imports, exportNames, reexports, workers, assetUrls };
}

export function parseImportMap(html) {
  const block = html.match(/<script\s+type="importmap"\s*>([\s\S]*?)<\/script>/i);
  if (!block) return { imports: {} };
  return JSON.parse(block[1]);
}

export function parseHtmlModuleEntries(html) {
  const entries = [];
  const re = /<script\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (!/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) entries.push(stripQuery(src[1]));
  }
  return entries;
}

export function parseHtmlResources(html) {
  const out = [];
  const re = /<(?:script|link)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if (src) out.push(stripQuery(src[1]));
  }
  return out;
}

export function remoteBootUrls(text) {
  const hits = [];
  const re =
    /(?:(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']|url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\))/gi;
  let m;
  while ((m = re.exec(text))) {
    const url = m[1] || m[2];
    if (/^https?:\/\/(localhost|127\.0\.0\.1)([/:?]|$)/i.test(url)) continue;
    if (/^https?:\/\/www\.w3\.org\//i.test(url)) continue;
    hits.push(url);
  }
  return hits;
}

function resolveImportMap(spec, importMap) {
  const table = (importMap && importMap.imports) || {};
  if (table[spec]) return table[spec];
  for (const [key, target] of Object.entries(table)) {
    if (key.endsWith("/") && spec.startsWith(key)) return target + spec.slice(key.length);
  }
  return null;
}

export function resolveSpecifier(fromFile, spec, { root, importMap }) {
  const cleaned = stripQuery(spec);
  if (cleaned.startsWith("node:")) return { kind: "builtin", file: null };
  if (cleaned.startsWith("./") || cleaned.startsWith("../"))
    return { kind: "file", file: path.normalize(path.join(path.dirname(fromFile), cleaned)) };
  const mapped = resolveImportMap(cleaned, importMap);
  if (mapped) {
    const target = stripQuery(mapped);
    return { kind: "file", file: path.normalize(path.join(root, target)) };
  }
  if (!cleaned.includes(":") && !cleaned.startsWith("/"))
    return { kind: "file", file: path.normalize(path.join(root, "node_modules", cleaned)) };
  if (cleaned.startsWith("/"))
    return { kind: "file", file: path.normalize(path.join(root, "." + cleaned)) };
  return { kind: "unknown", file: null };
}

function locStr(loc) {
  return loc ? `${loc.line}:${loc.column + 1}` : "?";
}

export function checkGraph({
  root = REPO_ROOT,
  entries,
  importMap = { imports: {} },
  readFile = (file) => fs.readFileSync(file, "utf8"),
  exists = (file) => fs.existsSync(file),
} = {}) {
  const errors = [];
  const cache = new Map();
  const visiting = new Set();

  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (isOpaque(file)) {
      const rec = { opaque: true, exportNames: new Set(), reexports: [], imports: [], workers: [], assetUrls: [] };
      cache.set(file, rec);
      return rec;
    }
    let src;
    try {
      src = readFile(file);
    } catch (e) {
      const rec = { missing: true, error: e.message };
      cache.set(file, rec);
      return rec;
    }
    let rec;
    try {
      rec = inspectModule(src);
    } catch (e) {
      rec = { parseError: e.message, exportNames: new Set(), reexports: [], imports: [], workers: [], assetUrls: [] };
    }
    cache.set(file, rec);
    return rec;
  }

  function exportSet(file) {
    const rec = load(file);
    if (!rec || rec.missing || rec.parseError) return new Set();
    if (rec.opaque) return null;
    if (rec._resolved) return rec._resolved;
    if (visiting.has(file)) return rec.exportNames;
    visiting.add(file);
    const names = new Set(rec.exportNames);
    for (const re of rec.reexports) {
      const resolved = resolveSpecifier(file, re.source, { root, importMap });
      if (resolved.kind !== "file" || !resolved.file) continue;
      if (re.as) names.add(re.as);
      if (re.star) {
        const from = exportSet(resolved.file);
        if (from) for (const n of from) if (n !== "default") names.add(n);
      } else {
        for (const n of re.names) names.add(n.exported);
      }
    }
    visiting.delete(file);
    rec._resolved = names;
    return names;
  }

  const queue = [];
  const seen = new Set();
  function enqueue(file, via) {
    const n = path.normalize(file);
    if (seen.has(n)) return;
    seen.add(n);
    queue.push({ file: n, via });
  }

  for (const entry of entries) {
    const file = path.normalize(path.isAbsolute(entry) ? entry : path.join(root, entry));
    enqueue(file, "entry");
  }

  while (queue.length) {
    const { file, via } = queue.shift();
    if (!exists(file)) {
      errors.push({
        file: rel(root, file),
        message: `missing file (from ${via})`,
      });
      continue;
    }
    if (isOpaque(file) && !file.endsWith(".js") && !file.endsWith(".mjs")) continue;
    const rec = load(file);
    if (rec.parseError) {
      errors.push({ file: rel(root, file), message: `parse error — ${rec.parseError}` });
      continue;
    }
    if (rec.opaque || rec.missing) continue;

    for (const im of rec.imports) {
      const resolved = resolveSpecifier(file, im.source, { root, importMap });
      if (resolved.kind === "builtin") continue;
      if (resolved.kind !== "file" || !resolved.file) {
        errors.push({
          file: rel(root, file),
          message: `unresolved specifier "${im.source}" at ${locStr(im.loc)}`,
        });
        continue;
      }
      if (!exists(resolved.file)) {
        errors.push({
          file: rel(root, file),
          message: `import "${im.source}" at ${locStr(im.loc)} → missing ${rel(root, resolved.file)}`,
        });
        continue;
      }
      enqueue(resolved.file, rel(root, file));
      if (im.dynamic || im.namespace) continue;
      const names = exportSet(resolved.file);
      if (!names) continue;
      if (im.default && !names.has("default"))
        errors.push({
          file: rel(root, file),
          message: `default import from "${im.source}" at ${locStr(im.loc)} is not exported`,
        });
      for (const name of im.names) {
        if (!names.has(name))
          errors.push({
            file: rel(root, file),
            message: `named import { ${name} } from "${im.source}" at ${locStr(im.loc)} is not exported`,
          });
      }
    }

    for (const re of rec.reexports) {
      const resolved = resolveSpecifier(file, re.source, { root, importMap });
      if (resolved.kind !== "file" || !resolved.file || !exists(resolved.file)) {
        errors.push({
          file: rel(root, file),
          message: `re-export "${re.source}" at ${locStr(re.loc)} → missing target`,
        });
        continue;
      }
      enqueue(resolved.file, rel(root, file));
      const names = exportSet(resolved.file);
      if (!names || re.star) continue;
      for (const n of re.names) {
        if (!names.has(n.imported))
          errors.push({
            file: rel(root, file),
            message: `re-export { ${n.imported} } from "${re.source}" at ${locStr(re.loc)} is not exported`,
          });
      }
    }

    for (const w of rec.workers) {
      const source = stripQuery(w.source);
      const target = source.startsWith(".")
        ? path.normalize(path.join(path.dirname(file), source))
        : path.normalize(path.join(root, source));
      if (!exists(target))
        errors.push({
          file: rel(root, file),
          message: `Worker "${w.source}" at ${locStr(w.loc)} → missing ${rel(root, target)}`,
        });
      else enqueue(target, rel(root, file));
    }

    for (const a of rec.assetUrls) {
      if (!(a.source.startsWith("./") || a.source.startsWith("../"))) continue;
      const target = path.normalize(path.join(path.dirname(file), stripQuery(a.source)));
      if (!exists(target))
        errors.push({
          file: rel(root, file),
          message: `URL("${a.source}") at ${locStr(a.loc)} → missing ${rel(root, target)}`,
        });
    }
  }

  return { errors, modules: seen.size };
}

export function checkRepo(root = REPO_ROOT) {
  const htmlPath = path.join(root, "index.html");
  const cssPath = path.join(root, "css", "styles.css");
  const html = fs.readFileSync(htmlPath, "utf8");
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
  const errors = [];

  for (const url of remoteBootUrls(html))
    errors.push({ file: "index.html", message: `remote boot URL ${url}` });
  for (const url of remoteBootUrls(css))
    errors.push({ file: "css/styles.css", message: `remote stylesheet URL ${url}` });
  for (const extra of ["vendor/fonts/fonts.css", "vendor/phosphor/style.css"]) {
    const p = path.join(root, extra);
    if (!fs.existsSync(p)) continue;
    for (const url of remoteBootUrls(fs.readFileSync(p, "utf8")))
      errors.push({ file: extra, message: `remote stylesheet URL ${url}` });
  }

  let importMap;
  try {
    importMap = parseImportMap(html);
  } catch (e) {
    return { errors: [{ file: "index.html", message: `invalid import map — ${e.message}` }], modules: 0 };
  }
  for (const [key, target] of Object.entries(importMap.imports || {})) {
    if (key.endsWith("/")) continue;
    const file = path.normalize(path.join(root, stripQuery(target)));
    if (!fs.existsSync(file))
      errors.push({ file: "index.html", message: `import map "${key}" → missing ${rel(root, file)}` });
  }

  const entries = parseHtmlModuleEntries(html);
  if (!entries.length) errors.push({ file: "index.html", message: "no <script type=\"module\" src> entries" });
  for (const href of parseHtmlResources(html)) {
    if (/^(https?:|data:|javascript:)/i.test(href)) continue;
    const file = path.normalize(path.join(root, href.replace(/^\.\//, "")));
    if (!fs.existsSync(file))
      errors.push({ file: "index.html", message: `resource ${href} is missing` });
  }

  const graph = checkGraph({ root, entries, importMap });
  return { errors: errors.concat(graph.errors), modules: graph.modules };
}

export function formatReport(result) {
  if (!result.errors.length)
    return `no link errors (${result.modules} modules)`;
  return result.errors.map((e) => `${e.file}: ${e.message}`).join("\n") + `\n\n${result.errors.length} link error(s)`;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch (_) {
    return false;
  }
}

if (isMainModule()) {
  const result = checkRepo();
  console.log(formatReport(result));
  process.exit(result.errors.length ? 1 : 0);
}
