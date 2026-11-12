import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { createByteLru, etagMatches } from "../server/security.mjs";
import { rawRequest, startRelay } from "./helpers/relay_process.mjs";

function bytes(port, path, method = "GET", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end();
  });
}

test("byte LRU accounts replacements, recency, oversize and lazy growth", () => {
  const lru = createByteLru(10);
  lru.set("a", 1, 4); lru.set("b", 2, 4);
  assert.equal(lru.bytes, 8); assert.equal(lru.get("a"), 1);
  lru.set("c", 3, 5);
  assert.equal(lru.get("b"), undefined); assert.equal(lru.bytes, 9);
  lru.resize("a", 6);
  assert.equal(lru.get("a"), undefined); assert.equal(lru.get("c"), 3);
  lru.set("huge", 4, 11); assert.equal(lru.get("huge"), undefined);
  lru.set("c", 5, 2); assert.equal(lru.bytes, 2);
  lru.resize("c", 11); assert.equal(lru.size, 0); assert.equal(lru.bytes, 0);
  for (let i = 0; i < 100; i++) { lru.set(i, i, i % 12); assert.ok(lru.bytes <= 10); }
  lru.delete(99); assert.equal(lru.get(99), undefined);
});

test("If-None-Match uses weak comparison and quoted list members", () => {
  for (const h of ['*', ' "a" ', 'W/"a"', '"b", W/"a"', 'W/"b", "a"']) {
    assert.equal(etagMatches(h, '"a"'), true, h);
    assert.equal(etagMatches(h, 'W/"a"'), true, h);
  }
  assert.equal(etagMatches('"a,b", "c"', 'W/"a,b"'), true);
  for (const h of [undefined, '', 'a', '"ab"', '"A"', 'garbage "a"', '"a""b"', '"a", nope']) assert.equal(etagMatches(h, '"a"'), false);
});

test("vendor scripts revalidate on every reload", async t => {
  const relay = await startRelay(t);
  const first = await rawRequest(relay.port, { path: "/vendor/three/three.module.js" });
  assert.equal(first.status, 200); assert.equal(first.headers["cache-control"], "no-cache");
  assert.ok(first.headers.etag); assert.ok(!first.headers.etag.startsWith("W/"));
  const next = await rawRequest(relay.port, { path: "/vendor/three/three.module.js", headers: { "If-None-Match": first.headers.etag } });
  assert.equal(next.status, 304); assert.equal(next.headers["cache-control"], "no-cache");
});

test("binary streams match disk, weak validators and HEAD lengths", async t => {
  const relay = await startRelay(t);
  for (const path of ["vendor/phosphor/Phosphor.woff2", "assets/opencascade.full.wasm.gz"]) {
    const disk = await readFile(new URL("../" + path, import.meta.url));
    const first = await bytes(relay.port, "/" + path);
    assert.equal(first.status, 200); assert.deepEqual(first.body, disk);
    assert.equal(Number(first.headers["content-length"]), disk.length);
    assert.equal(first.headers["content-encoding"], undefined);
    assert.match(first.headers.etag, /^W\//);
    for (const tag of [first.headers.etag, '"other", ' + first.headers.etag, "*", first.headers.etag.slice(2)]) {
      const next = await bytes(relay.port, "/" + path, "GET", { "If-None-Match": tag });
      assert.equal(next.status, 304); assert.equal(next.headers["cache-control"], "no-cache");
    }
    const head = await bytes(relay.port, "/" + path, "HEAD");
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    assert.equal(Number(head.headers["content-length"]), disk.length); assert.equal(head.headers.etag, first.headers.etag);
  }
});

test("tiny cache caps preserve compressed content and validators across eviction", async t => {
  const relay = await startRelay(t, { HOME3D_STATIC_CACHE_BYTES: "204800", HOME3D_STATIC_CACHE_FILE_BYTES: "102400" });
  const files = [];
  for (const file of await readdir(new URL("../js/", import.meta.url))) {
    if (!file.endsWith(".js")) continue;
    const body = await readFile(new URL("../js/" + file, import.meta.url));
    if (body.length > 20000 && body.length < 100000) files.push({ file, body });
    if (files.length >= 15) break;
  }
  assert.ok(files.reduce((n, f) => n + f.body.length, 0) > 204800);
  const etags = new Map();
  for (let round = 0; round < 2; round++) for (const { file, body } of files) {
    const response = await bytes(relay.port, "/js/" + file, "GET", { "Accept-Encoding": "br" });
    assert.equal(response.headers["content-encoding"], "br");
    assert.equal(Number(response.headers["content-length"]), response.body.length);
    assert.deepEqual(brotliDecompressSync(response.body), body);
    if (round) assert.equal(response.headers.etag, etags.get(file));
    etags.set(file, response.headers.etag);
  }
  for (const { file } of files) {
    const conditional = await bytes(relay.port, "/js/" + file, "GET", { "Accept-Encoding": "br", "If-None-Match": etags.get(file) });
    assert.equal(conditional.status, 304);
    // the br tag does not validate the identity body: each coding has its own strong tag
    const plain = await bytes(relay.port, "/js/" + file, "GET", { "If-None-Match": etags.get(file) });
    assert.equal(plain.status, 200);
    assert.notEqual(plain.headers.etag, etags.get(file));
  }
  // the largest top-level module, whatever splits have left: it must exceed the per-file cap
  let largest = null;
  for (const file of await readdir(new URL("../js/", import.meta.url))) {
    if (!file.endsWith(".js")) continue;
    const size = (await readFile(new URL("../js/" + file, import.meta.url))).length;
    if (!largest || size > largest.size) largest = { file, size };
  }
  const body = await readFile(new URL("../js/" + largest.file, import.meta.url));
  assert.ok(body.length > 102400);
  const large = await bytes(relay.port, "/js/" + largest.file, "GET", { "Accept-Encoding": "br,gzip" });
  assert.equal(large.headers["content-encoding"], undefined); assert.match(large.headers.etag, /^W\//);
  assert.deepEqual(large.body, body); assert.equal(Number(large.headers["content-length"]), body.length);
});