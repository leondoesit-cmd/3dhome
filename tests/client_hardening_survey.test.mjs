import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../survey-sw.js', import.meta.url), 'utf8');
const context = { self: { addEventListener() {} } };
vm.runInNewContext(source, context);
const cacheable = context.cacheableAsset;
function response(mime, extra = {}) {
  return { ok: true, status: 200, type: 'basic', headers: new Headers(mime == null ? {} : { 'Content-Type': mime }), ...extra };
}

test('offline asset predicate accepts matching MIME types with parameters and case variations', () => {
  for (const [path, mime] of [
    ['/app.js', 'text/javascript; charset=utf-8'], ['/app.mjs', 'application/javascript'],
    ['/app.JS?v=1', 'Text/JavaScript; charset=UTF-8'], ['/style.css', 'text/css'],
    ['/index.html', 'text/html; charset=utf-8'], ['/survey-assets.json', 'application/json'],
    ['/image.png', 'image/png'], ['/kernel.wasm', 'application/wasm'],
  ]) assert.equal(cacheable(path, response(mime)), true, path + ': ' + mime);
});

test('offline asset predicate rejects error, partial and non-basic responses', () => {
  for (const extra of [{ ok: false, status: 404 }, { status: 206 }, ...['cors', 'opaque', 'opaqueredirect', 'default', 'error', undefined].map(type => ({ type }))]) {
    for (const path of ['/app.js', '/image.png']) assert.equal(cacheable(path, response('text/javascript', extra)), false);
  }
});

test('offline code, styles, pages and JSON reject missing or mismatched MIME types', () => {
  for (const [path, good] of [['/app.js', 'text/javascript'], ['/app.mjs', 'text/javascript'], ['/style.css', 'text/css'], ['/index.html', 'text/html'], ['/survey-assets.json', 'application/json']]) {
    for (const mime of [null, '', 'text/plain', 'application/octet-stream', 'text/html', 'text/css', 'application/json', 'text/javascript', good + '-invalid']) {
      if (mime !== good) assert.equal(cacheable(path, response(mime)), false, path + ': ' + mime);
    }
  }
});

test('prepare rejects poisoned downloads without replacing the last complete cache', async () => {
  const stored = new Map(), handlers = {};
  let poison = null;
  const assets = ['/index.html', '/app.js', '/style.css', '/data.json'];
  function fetched(body, mime, type = 'basic') {
    const value = new Response(body, { headers: { 'Content-Type': mime } });
    Object.defineProperty(value, 'type', { value: type });
    return value;
  }
  vm.runInNewContext(source, {
    self: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: {
      open: async name => {
        if (!stored.has(name)) stored.set(name, new Map());
        const entries = stored.get(name);
        return { match: async key => entries.get(key)?.clone(), put: async (key, value) => { entries.set(key, value.clone()); } };
      },
      keys: async () => [...stored.keys()], delete: async name => stored.delete(name),
    },
    fetch: async path => {
      if (poison?.path === path) return fetched('bad', poison.mime, poison.type);
      if (path === '/survey-assets.json') return fetched(JSON.stringify({ assets }), 'application/json');
      return fetched('good', { '/index.html': 'text/html', '/app.js': 'text/javascript', '/style.css': 'text/css', '/data.json': 'application/json' }[path]);
    }, Response, Headers, Date, Math,
  });
  async function prepare() {
    let task, result;
    handlers.message({ data: { type: 'prepare' }, ports: [{ postMessage: value => { result = value; } }], waitUntil: value => { task = value; } });
    await task; return result;
  }
  assert.equal((await prepare()).ok, true);
  const active = async () => stored.get('modelforge-survey-manifest').get('/active-survey-cache').clone().text();
  const previous = await active();
  for (poison of [
    { path: '/app.js', mime: 'text/html', type: 'basic' },
    { path: '/style.css', mime: 'text/plain', type: 'basic' },
    { path: '/index.html', mime: 'text/html', type: 'cors' },
    { path: '/data.json', mime: 'text/html', type: 'basic' },
    { path: '/survey-assets.json', mime: 'text/html', type: 'basic' },
  ]) {
    assert.equal((await prepare()).ok, false);
    assert.equal(await active(), previous);
    assert.equal(stored.size, 2, 'failed generations are removed');
    assert.equal(await stored.get(previous).get('/app.js').clone().text(), 'good');
  }
});
