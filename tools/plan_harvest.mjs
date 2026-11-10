// Polite floor-plan PDF harvester for the recognition corpus. For each seed
// site it reads robots.txt (and obeys it, per host, including CDN hosts),
// walks the sitemaps and same-site pages that look like projects or plans,
// and downloads the PDFs they link. One request per host every --delay
// seconds (or the site's Crawl-delay if longer); any 401/403/429/503 or bot
// wall stops that host, nothing tries to get around it. Files are stored by
// SHA-256 (exact duplicates kept once) under a gitignored folder; never
// commit or ship them.
//
//   node tools/plan_harvest.mjs --hosts bench/harvest/il/hosts.txt --out bench/harvest/il
//        [--concurrency 6] [--delay 3] [--max-pages 250] [--max-pdfs 600]
//        [--max-mb 40] [--only host,host] [--dry] [--again]
//        [--images [--max-images 800]]   interior renders/photos instead of PDFs
//
// Output: <out>/files/<sha256>.pdf and <out>/manifest.jsonl, one record per
// site ("site"), stored PDF ("pdf") and skipped PDF ("pdf-skip"). A rerun
// resumes: finished sites and fetched PDF URLs are skipped.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  USER_AGENT, parseRobots, robotsGroup, robotsAllows, robotsStatusPolicy, sitemapLocs, isSitemapIndex,
  blockReason, pageTitle, extractLinks, pageScore, pdfWanted, siteDomain,
  extractImages, imageScore, originalImageUrl, imageType,
} from "./plan_harvest_lib.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function readSeeds(file) {
  return readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean)
    .map((l) => (/^https?:\/\//i.test(l) ? l : "https://" + l)).map((l) => new URL(l).origin);
}

function createHosts(minDelay) {
  const hosts = new Map();
  const host = (name) => {
    if (!hosts.has(name)) hosts.set(name, { name, chain: Promise.resolve(), next: 0, delay: minDelay, robots: null, blocked: null });
    return hosts.get(name);
  };
  // Serialise requests to one host and space them by its delay.
  const gate = (h) => {
    const turn = h.chain.then(async () => {
      const wait = h.next - Date.now();
      if (wait > 0) await sleep(wait);
      h.next = Date.now() + h.delay * 1000 + Math.random() * 500;
    });
    h.chain = turn.catch(() => {});
    return turn;
  };
  return { host, gate, hosts };
}

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) { res.body?.cancel(); return null; }
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export function createHarvester(options) {
  const out = options.out;
  const delay = Math.max(2, Number(options.delay) || 3);
  const maxPages = Number(options["max-pages"]) || 250;
  const maxPdfs = Number(options["max-pdfs"]) || 600;
  const maxBytes = (Number(options["max-mb"]) || 40) * 1024 * 1024;
  const dry = !!options.dry;
  // --images: collect interior renders / photos instead of plan PDFs, into
  // their own folder and manifest, so both runs resume independently
  const imagesMode = !!options.images;
  const maxImages = Number(options["max-images"]) || 800;
  const { host, gate } = createHosts(delay);
  const manifest = join(out, imagesMode ? "images.jsonl" : "manifest.jsonl");
  const filesDir = join(out, imagesMode ? "images" : "files");
  mkdirSync(filesDir, { recursive: true });
  const seenPdf = new Set();
  const doneSites = new Set();
  if (existsSync(manifest)) {
    for (const line of readFileSync(manifest, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.kind === "pdf" || r.kind === "pdf-skip" || r.kind === "image" || r.kind === "image-skip") seenPdf.add(r.url);
        if (r.kind === "site" && r.status === "done") doneSites.add(r.site);
      } catch { /* torn last line */ }
    }
  }
  const record = (r) => appendFileSync(manifest, JSON.stringify({ ...r, at: new Date().toISOString() }) + "\n");

  async function request(url, timeoutMs) {
    const u = new URL(url);
    const h = host(u.host);
    if (h.blocked) return { skip: "host blocked: " + h.blocked };
    if (!h.robots) await loadRobots(h, u.origin);
    if (h.blocked) return { skip: "host blocked: " + h.blocked };
    if (!robotsAllows(h.robots, u.pathname + u.search)) return { skip: "robots.txt" };
    await gate(h);
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      return { res, h };
    } catch (e) {
      return { skip: "fetch: " + (e.cause?.code || e.name || e.message) };
    }
  }

  async function loadRobots(h, origin) {
    h.robots = { rules: [], delay: 0 };
    h.sitemaps = [];
    await gate(h);
    try {
      const res = await fetch(origin + "/robots.txt", { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      const policy = robotsStatusPolicy(res.status);
      if (policy === "disallow") { h.blocked = "robots.txt http " + res.status; return; }
      if (policy === "rules" && !/html/i.test(res.headers.get("content-type") || "")) {
        const parsed = parseRobots(text);
        h.robots = robotsGroup(parsed);
        // Some robots.txt files give relative sitemap paths ("Sitemap: /sitemap.xml").
        h.sitemaps = parsed.sitemaps.map((s) => { try { return new URL(s, origin).href; } catch { return null; } }).filter(Boolean);
        if (h.robots.delay > h.delay) h.delay = Math.min(h.robots.delay, 60);
      }
    } catch (e) {
      h.blocked = "robots.txt unreachable: " + (e.cause?.code || e.name);
    }
  }

  async function getText(url) {
    const r = await request(url, 25000);
    if (r.skip) return r;
    const type = r.res.headers.get("content-type") || "";
    const body = await readCapped(r.res, 8 * 1024 * 1024);
    const text = body ? body.toString("utf8") : "";
    const blocked = blockReason(r.res.status, type, text);
    if (blocked) { r.h.blocked = blocked; return { skip: "blocked: " + blocked }; }
    if (!r.res.ok) return { skip: "http " + r.res.status };
    return { text, type, finalUrl: r.res.url || url };
  }

  async function sitemapPages(origin, sameSite) {
    const h = host(new URL(origin).host);
    if (!h.robots) await loadRobots(h, origin);
    // Declared sitemaps, else the usual WordPress/Webflow names: the first
    // guess that answers with a sitemap makes the other guesses redundant.
    const guesses = h.sitemaps?.length ? [] : [origin + "/sitemap_index.xml", origin + "/sitemap.xml", origin + "/wp-sitemap.xml"];
    const queue = h.sitemaps?.length ? [...h.sitemaps] : [...guesses];
    const seen = new Set();
    const pages = [];
    while (queue.length && seen.size < 40) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const r = await getText(url);
      if (r.skip || !/<(?:urlset|sitemapindex)/i.test(r.text)) continue;
      if (guesses.includes(url)) for (const g of guesses) seen.add(g);
      const locs = sitemapLocs(r.text);
      if (isSitemapIndex(r.text)) {
        // Project/page sitemaps first; skip posts, tags, authors, media.
        const kids = locs.filter((l) => !/post-sitemap|tag|author|category|attachment|media|image|product_cat/i.test(l));
        kids.sort((a, b) => Number(/proj|page|apart|dir|plan|build/i.test(b)) - Number(/proj|page|apart|dir|plan|build/i.test(a)));
        queue.unshift(...kids);
      } else {
        pages.push(...locs.filter((l) => { try { return sameSite(new URL(l).host); } catch { return false; } }));
      }
    }
    return pages;
  }

  async function harvestSite(seed) {
    let origin = seed;
    const site = new URL(origin).host.replace(/^www\./, "");
    if (doneSites.has(site) && !options.again) { console.log(`= ${site} already done`); return; }
    // Many sites only answer (or only have a certificate) on www.
    const bare = host(new URL(origin).host);
    if (!bare.robots) await loadRobots(bare, origin);
    if (bare.blocked?.startsWith("robots.txt unreachable") && !/^www\./.test(bare.name)) {
      const www = host("www." + bare.name);
      await loadRobots(www, "https://www." + bare.name);
      if (!www.blocked) origin = "https://www." + bare.name;
    }
    const domain = siteDomain(site);
    const sameSite = (hostName) => siteDomain(hostName) === domain;
    const visited = new Set();
    const queued = new Map();
    const pdfs = new Map();
    const images = new Map();
    const enqueue = (url, label, depth, bonus = 0) => {
      const clean = String(url).split("#")[0];
      try { new URL(clean); } catch { return; } // sitemaps sometimes list relative or broken locs
      const score = pageScore(clean, label);
      if (score === null || visited.has(clean)) return;
      const prev = queued.get(clean);
      const next = { url: clean, label, depth, score: score + bonus - depth * 0.5 };
      if (!prev || prev.score < next.score) queued.set(clean, next);
    };
    enqueue(origin + "/", "", 0, 3);
    for (const page of await sitemapPages(origin, sameSite)) enqueue(page, "", 1, 0.5);
    let pages = 0;
    while (queued.size && pages < maxPages && (imagesMode ? images.size < maxImages * 2 : pdfs.size < maxPdfs * 2)) {
      const next = [...queued.values()].sort((a, b) => b.score - a.score)[0];
      queued.delete(next.url);
      visited.add(next.url);
      if (host(new URL(next.url).host).blocked) continue;
      const r = await getText(next.url);
      if (r.skip) {
        if (next.depth === 0 && r.skip.startsWith("blocked")) break;
        continue;
      }
      if (!/html/i.test(r.type)) continue;
      pages++;
      const title = pageTitle(r.text);
      const links = extractLinks(r.text, r.finalUrl);
      for (const p of links.pdfs) {
        if (!pdfs.has(p.url) && pdfWanted(p.url, p.label)) pdfs.set(p.url, { label: p.label, page: next.url, pageTitle: title });
      }
      if (imagesMode) {
        for (const im of extractImages(r.text, r.finalUrl)) {
          if (!images.has(im.url)) images.set(im.url, { label: im.alt, page: next.url, pageTitle: title, score: imageScore(im.url, im.alt, title) + next.score * 0.2 });
        }
      }
      if (next.depth >= 3) continue;
      for (const l of links.pages) {
        let linkHost;
        try { linkHost = new URL(l.url).host; } catch { continue; }
        if (sameSite(linkHost)) enqueue(l.url, l.label, next.depth + 1);
      }
    }
    const mainBlocked = host(new URL(origin).host).blocked;
    let stored = 0;
    let dups = 0;
    if (!dry && imagesMode) {
      const ranked = [...images].sort((a, b) => b[1].score - a[1].score).slice(0, maxImages);
      for (const [url, meta] of ranked) {
        if (seenPdf.has(url)) continue;
        seenPdf.add(url);
        const result = await downloadImage(url, site, meta);
        if (result === "stored") stored++;
        else if (result === "dup") dups++;
      }
    } else if (!dry) {
      for (const [url, meta] of [...pdfs].slice(0, maxPdfs)) {
        if (seenPdf.has(url)) continue;
        seenPdf.add(url);
        const result = await download(url, site, meta);
        if (result === "stored") stored++;
        else if (result === "dup") dups++;
      }
    } else {
      for (const [url, meta] of pdfs) console.log(`  ${url}  [${meta.label}]`);
    }
    const status = mainBlocked && pages === 0 ? "blocked" : "done";
    const found = imagesMode ? images.size : pdfs.size;
    if (!dry) record({ kind: "site", site, status, reason: mainBlocked || undefined, pages, [imagesMode ? "imageLinks" : "pdfLinks"]: found, stored, dups });
    console.log(`= ${site}: ${status}${mainBlocked ? " (" + mainBlocked + ")" : ""}, ${pages} pages, ${found} ${imagesMode ? "image" : "PDF"} links, ${stored} stored, ${dups} duplicates`);
  }

  // Content images: the full-size original first (WordPress "-1024x683"
  // thumbnails), the listed URL if that is missing. Small files are icons or
  // thumbnails and are skipped; the type is checked from the bytes.
  async function downloadImage(url, site, meta) {
    const original = originalImageUrl(url);
    let r = original !== url && !seenPdf.has(original) ? await request(original, 60000) : { skip: "same" };
    let used = original;
    if (r.skip || !r.res.ok) {
      r.res?.body?.cancel();
      r = await request(url, 60000);
      used = url;
    }
    const skip = (reason) => { record({ kind: "image-skip", url, site, reason }); return "skip"; };
    if (r.skip) return skip(r.skip);
    const blocked = blockReason(r.res.status, r.res.headers.get("content-type"), "");
    if (blocked) { r.h.blocked = blocked; return skip(blocked); }
    if (!r.res.ok) { r.res.body?.cancel(); return skip("http " + r.res.status); }
    const body = await readCapped(r.res, 20 * 1024 * 1024);
    if (!body) return skip("too large");
    const ext = imageType(body);
    if (!ext) return skip("not an image");
    if (body.length < 40 * 1024) return skip("small (icon or thumbnail)");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const file = join(filesDir, sha256 + "." + ext);
    const dup = existsSync(file);
    if (!dup) writeFileSync(file, body);
    seenPdf.add(used);
    record({ kind: "image", url: used, listed: used !== url ? url : undefined, host: new URL(used).host, site, page: meta.page, pageTitle: meta.pageTitle, label: meta.label, score: meta.score, sha256, ext, bytes: body.length, dup });
    return dup ? "dup" : "stored";
  }

  async function download(url, site, meta) {
    const r = await request(url, 90000);
    if (r.skip) { record({ kind: "pdf-skip", url, site, reason: r.skip }); return "skip"; }
    const blocked = blockReason(r.res.status, r.res.headers.get("content-type"), "");
    if (blocked) { r.h.blocked = blocked; record({ kind: "pdf-skip", url, site, reason: blocked }); return "skip"; }
    if (!r.res.ok) { record({ kind: "pdf-skip", url, site, reason: "http " + r.res.status }); r.res.body?.cancel(); return "skip"; }
    const body = await readCapped(r.res, maxBytes);
    if (!body) { record({ kind: "pdf-skip", url, site, reason: "too large" }); return "skip"; }
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") { record({ kind: "pdf-skip", url, site, reason: "not a PDF" }); return "skip"; }
    const sha256 = createHash("sha256").update(body).digest("hex");
    const file = join(filesDir, sha256 + ".pdf");
    const dup = existsSync(file);
    if (!dup) writeFileSync(file, body);
    record({ kind: "pdf", url, host: new URL(url).host, site, page: meta.page, pageTitle: meta.pageTitle, label: meta.label, sha256, bytes: body.length, dup });
    return dup ? "dup" : "stored";
  }

  return { harvestSite };
}

export async function runHarvest(options) {
  if (!options.hosts || !options.out) throw new Error("usage: --hosts <file> --out <dir>");
  let seeds = readSeeds(options.hosts);
  if (options.only) {
    const only = String(options.only).split(",");
    seeds = seeds.filter((s) => only.some((o) => s.includes(o)));
  }
  const harvester = createHarvester(options);
  const concurrency = Math.max(1, Number(options.concurrency) || 6);
  let index = 0;
  const worker = async () => {
    while (index < seeds.length) {
      const seed = seeds[index++];
      try { await harvester.harvestSite(seed); } catch (e) { console.log(`! ${seed}: ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHarvest(args(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1); });
}
