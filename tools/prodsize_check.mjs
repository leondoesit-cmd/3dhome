#!/usr/bin/env node
// Sanity-check the product-dimension parser (js/prodsize.js) against real
// pages whose true size we know.
//
//   node tools/prodsize_check.mjs            # parse fixed product pages
//   node tools/prodsize_check.mjs "IKEA MALM bed" 160 210 100   # full lookup
//
// Needs network. Page parsing is stable; the full lookup additionally depends
// on the search engines, which rate-limit — a failing search is not a parser
// regression, an obviously wrong SIZE is.
import { candidatesFromPage, rankCandidates, lookupProduct, fmtDims } from "../js/prodsize.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "he,en;q=0.9" },
    });
    return { ok: r.ok, status: r.status, text: await r.text(), url: r.url || url };
  } catch (e) {
    return { ok: false, status: 0, text: "", url, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// [url, current model size (the shape hint), expected result]
const PAGES = [
  ["https://www.ikea.com/us/en/p/malm-bed-frame-white-s69931603/", { w: 160, d: 210, h: 100 }, "150 × 199 × 100"],
  ["https://www.dimensions.com/element/ikea-malm-bed-frame", { w: 160, d: 210, h: 100 }, "168 × 211 × 100"],
  ["https://www.ikea.com/us/en/p/billy-bookcase-white-00263850/", { w: 80, d: 30, h: 200 }, "80 × 28 × 202"],
  [
    "https://www.euronics.lv/en/home-appliances/refrigerators/refrigerators/kgn39vleb",
    { w: 60, d: 65, h: 180 },
    "60 × 66 × 203",
  ],
];

const argQuery = process.argv[2];
if (argQuery) {
  const [, , q, w, d, h] = process.argv;
  const hint = w ? { w: +w, d: +d, h: +h } : null;
  const out = await lookupProduct(q, { get, hint, maxPages: 8, stagger: 700, onStep: (k, v) => console.log("  ." + k, String(v).slice(0, 90)) });
  console.log("scanned", out.scanned, "| errors:", out.errors.join("; ") || "none");
  out.results.forEach((r) =>
    console.log(" ", r.conf.toFixed(2), fmtDims(r).padEnd(20), r.how.padEnd(14), r.host, "|", (r.title || "").slice(0, 60)),
  );
} else {
  let pass = 0;
  for (const [url, hint, expect] of PAGES) {
    const r = await get(url);
    const top = r.ok ? rankCandidates(candidatesFromPage({ url, html: r.text }, hint, url))[0] : null;
    const got = top ? fmtDims(top) : r.ok ? "no dimensions" : "fetch failed (" + r.status + ")";
    const ok = got === expect;
    pass += ok ? 1 : 0;
    console.log((ok ? "ok   " : "FAIL ") + got.padEnd(20) + " expected " + expect.padEnd(20) + " " + url.slice(0, 60));
  }
  console.log(pass + "/" + PAGES.length + " pages parsed as expected");
  process.exit(pass === PAGES.length ? 0 : 1);
}
